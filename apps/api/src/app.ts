import express from "express";
import cors from "cors";
import helmet from "helmet";
import { ENV } from "./config/env.js";
import { listingsRouter } from "./controllers/listings-controller.js";
import { submissionsRouter } from "./controllers/submissions-controller.js";
import {
  getCatalogListings,
  getDashboardLastUpdated,
  getDashboardRefreshLogs,
  getDashboardSummary,
} from "./services/dashboard-cache-service.js";
import { ensureDashboardSnapshot } from "./services/dashboard-sync-service.js";

const COMPAT_CACHE_HEADER = "public, max-age=60, s-maxage=300, stale-while-revalidate=1800";

async function loadPublicCompatibilitySnapshot() {
  await ensureDashboardSnapshot();
  const [summary, listings, lastUpdated, logs] = await Promise.all([
    getDashboardSummary(),
    getCatalogListings(),
    getDashboardLastUpdated(),
    getDashboardRefreshLogs(),
  ]);

  return {
    summary: {
      analysisCompleted: summary?.analysisCompleted ?? listings.length > 0,
      generatedAt: summary?.generatedAt ?? lastUpdated,
      listingCount: summary?.listingCount ?? listings.length,
      recognizedModelCount: summary?.recognizedModelCount ?? 0,
      candidateCount: summary?.candidateCount ?? 0,
    },
    lastUpdated,
    logs,
  };
}

function sendCompatError(res: express.Response, code: string, message: string): void {
  res.status(500).json({
    success: false,
    error: {
      code,
      message,
      statusCode: 500,
    },
  });
}

function getConfiguredOrigins(): string[] {
  return ENV.CORS_ORIGIN.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }

  if (getConfiguredOrigins().includes(origin)) {
    return true;
  }

  if (process.env.NODE_ENV !== "production") {
    return /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  }

  return false;
}

export function createApiApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("CORS_FORBIDDEN"));
      },
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      success: true,
      data: {
        status: "healthy",
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.get("/api/status", async (_req, res) => {
    try {
      const snapshot = await loadPublicCompatibilitySnapshot();
      res.setHeader("Cache-Control", COMPAT_CACHE_HEADER);
      res.json({
        success: true,
        data: {
          status: "online",
          api: "healthy",
          catalog: {
            status: snapshot.summary.listingCount > 0 ? "ready" : "warming",
            listingCount: snapshot.summary.listingCount,
            recognizedModelCount: snapshot.summary.recognizedModelCount,
            candidateCount: snapshot.summary.candidateCount,
            lastUpdated: snapshot.lastUpdated,
          },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("[SERVER] /api/status uyumluluk hatasi:", error);
      sendCompatError(res, "STATUS_FETCH_FAILED", "Durum bilgisi su an okunamadi");
    }
  });

  app.get("/api/runs", async (_req, res) => {
    try {
      const snapshot = await loadPublicCompatibilitySnapshot();
      res.setHeader("Cache-Control", COMPAT_CACHE_HEADER);
      res.json({
        success: true,
        data: snapshot.logs.slice(0, 24).map((log, index) => ({
          id: log.syncedAt || `run-${index + 1}`,
          status: "completed",
          syncedAt: log.syncedAt,
          listingCount: log.listingCount,
          candidateCount: log.candidateCount,
          message: "Katalog verisi yenilendi.",
        })),
        meta: {
          total: snapshot.logs.length,
          lastUpdated: snapshot.lastUpdated,
        },
      });
    } catch (error) {
      console.error("[SERVER] /api/runs uyumluluk hatasi:", error);
      sendCompatError(res, "RUNS_FETCH_FAILED", "Calisma gecmisi su an okunamadi");
    }
  });

  app.get("/latest-summary.json", async (_req, res) => {
    try {
      const snapshot = await loadPublicCompatibilitySnapshot();
      const payload = {
        success: true,
        analysisCompleted: snapshot.summary.analysisCompleted,
        generatedAt: snapshot.summary.generatedAt,
        listingCount: snapshot.summary.listingCount,
        recognizedModelCount: snapshot.summary.recognizedModelCount,
        candidateCount: snapshot.summary.candidateCount,
        expertSummary: "Katalog verisi hazir.",
        data: snapshot.summary,
        meta: {
          lastUpdated: snapshot.lastUpdated,
        },
      };

      res.setHeader("Cache-Control", COMPAT_CACHE_HEADER);
      res.json(payload);
    } catch (error) {
      console.error("[SERVER] /latest-summary.json uyumluluk hatasi:", error);
      sendCompatError(res, "LATEST_SUMMARY_FETCH_FAILED", "Son ozet su an okunamadi");
    }
  });

  app.get("/", (_req, res) => {
    res.json({
      success: true,
      data: {
        status: "online",
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.use("/api", listingsRouter);
  app.use("/api", submissionsRouter);

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Endpoint bulunamadı",
        statusCode: 404,
      },
    });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.message === "CORS_FORBIDDEN") {
      res.status(403).json({
        success: false,
        error: {
          code: "CORS_FORBIDDEN",
          message: "Bu origin icin API erisimi kapali.",
          statusCode: 403,
        },
      });
      return;
    }

    console.error("[SERVER] Islenmemis hata:", err.message);
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Sunucu hatası oluştu",
        statusCode: 500,
      },
    });
  });

  return app;
}

const app = createApiApp();

export default app;

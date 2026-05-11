import express from "express";
import cors from "cors";
import helmet from "helmet";
import { ENV } from "./config/env.js";
import { listingsRouter } from "./controllers/listings-controller.js";
import { submissionsRouter } from "./controllers/submissions-controller.js";

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

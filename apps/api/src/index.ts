/**
 * GPU Pusula — local API runner.
 *
 * Vercel serverless export lives in api/index.ts and imports src/app.ts
 * directly, so cron, boot sync and workers only run for the local Node server.
 */

import cron from "node-cron";
import { createApiApp } from "./app.js";
import { ENV, assertGitHubSourceConfigured } from "./config/env.js";
import { refreshDashboardSnapshot } from "./services/dashboard-sync-service.js";
import { startSubmissionWorker } from "./services/submission-worker-service.js";

async function bootstrap(): Promise<void> {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   GPU Pusula — API Server               ║");
  console.log("╚══════════════════════════════════════════╝\n");

  try {
    assertGitHubSourceConfigured();
  } catch (err) {
    console.error("[BOOT] Veri kaynagi yapilandirmasi dogrulanamadi:", err);
    process.exit(1);
  }

  const app = createApiApp();

  app.listen(ENV.PORT, () => {
    console.log(`\n[SERVER] API sunucusu calisiyor: http://localhost:${ENV.PORT}`);
    console.log(`[SERVER] CORS origin: ${ENV.CORS_ORIGIN}`);
    console.log(`[SERVER] Veri kaynagi: ${ENV.DATA_SOURCE}`);
    console.log("[SERVER] Local runner aktif. Serverless production'da cron ve worker bu dosyadan baslamaz.\n");
  });

  if (cron.validate(ENV.SYNC_CRON)) {
    cron.schedule(ENV.SYNC_CRON, async () => {
      console.log(`[CRON] Zamanlanmis dashboard yenileme tetiklendi (${ENV.SYNC_CRON})`);
      try {
        await refreshDashboardSnapshot();
      } catch (err) {
        console.error("[CRON] Zamanlanmis dashboard yenileme hatasi:", err);
      }
    });
    console.log(`[CRON] Otomatik dashboard yenileme zamanlandi: ${ENV.SYNC_CRON}`);
  } else {
    console.warn(`[CRON] Gecersiz cron format: ${ENV.SYNC_CRON}`);
  }

  if (ENV.SYNC_ON_BOOT) {
    console.log("[BOOT] Ilk dashboard yenileme deneniyor...");
    try {
      await refreshDashboardSnapshot();
    } catch (err) {
      console.warn("[BOOT] Ilk yenileme basarisiz:", (err as Error).message);
    }
  }

  startSubmissionWorker();
}

process.on("SIGINT", () => {
  console.log("\n[SERVER] Sunucu kapatiliyor...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[SERVER] Sunucu kapatiliyor...");
  process.exit(0);
});

bootstrap().catch((err) => {
  console.error("[BOOT] Kritik baslatma hatasi:", err);
  process.exit(1);
});

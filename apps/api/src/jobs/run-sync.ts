/** Manuel sync çalıştırma script'i — `npm run sync` ile tetiklenir */

import { refreshDashboardSnapshot } from "../services/dashboard-sync-service.js";

async function main() {
  console.log("[RUN-SYNC] 🚀 Dashboard sync başlatılıyor...\n");
  const result = await refreshDashboardSnapshot();

  console.log("\n[RUN-SYNC] 📊 Sonuç:", JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("[RUN-SYNC] ❌ Kritik hata:", err);
  process.exit(1);
});

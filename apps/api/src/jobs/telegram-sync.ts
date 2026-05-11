/**
 * Telegram Sync Job — Telegram'daki GPU analiz verilerini çekip veritabanına kaydeder.
 * 
 * Akış:
 * 1. Telegram'dan yeni mesajları çek (getUpdates)
 * 2. GPU analiz mesajlarını tespit et (metin + dosya)
 * 3. Metni parse et → GPU ilanları çıkar
 * 4. JSON dosyalarını indir ve parse et
 * 5. Tüm verileri deduplication ile kaydet
 */

import { fetchNewUpdates, downloadFile, type TelegramMessage } from "../services/telegram-service.js";
import {
  parseGpuListingsFromText,
  parseAnalysisSummary,
  parseJsonAnalysis,
  type ParsedGpuListing,
} from "../services/parser-service.js";
import { saveListings, saveSummary, logSync, getAllListings } from "../services/data-service.js";

/**
 * Bir mesajın GPU analiz raporu olup olmadığını kontrol eder.
 * "En iyi adaylar" veya "GPU analiz" ifadelerini arar.
 */
function isGpuAnalysisMessage(msg: TelegramMessage): boolean {
  const text = msg.text ?? msg.caption ?? "";
  return (
    text.includes("En iyi adaylar") ||
    text.includes("GPU analiz") ||
    text.includes("Toplam ilan") ||
    text.includes("Alinabilir aday") ||
    // Regex: numara + model + TL + piyasa pattern'i
    /\d+\)\s+\w+.*\|\s*\d+\s*TL/i.test(text)
  );
}

/**
 * Bir mesajın GPU analiz JSON/TXT dosyası olup olmadığını kontrol eder.
 */
function isGpuAnalysisFile(msg: TelegramMessage): boolean {
  if (!msg.document?.file_name) return false;
  const filename = msg.document.file_name.toLowerCase();
  return (
    (filename.includes("output") || filename.includes("analysis") || filename.includes("analiz")) &&
    (filename.endsWith(".json") || filename.endsWith(".txt"))
  );
}

/**
 * Ana sync fonksiyonu — Telegram'dan veri çekip kaydeder.
 */
export async function syncFromTelegram(): Promise<{
  newListings: number;
  messagesProcessed: number;
  filesProcessed: number;
}> {
  console.log("\n[SYNC] ═══════════════════════════════════════");
  console.log("[SYNC] 🔄 Telegram sync başlıyor...");
  console.log("[SYNC] ═══════════════════════════════════════\n");

  let allNewListings: ParsedGpuListing[] = [];
  let messagesProcessed = 0;
  let filesProcessed = 0;

  try {
    // 1. Yeni mesajları çek
    const messages = await fetchNewUpdates();

    if (messages.length === 0) {
      console.log("[SYNC] ℹ️ Yeni mesaj yok");
      return { newListings: 0, messagesProcessed: 0, filesProcessed: 0 };
    }

    for (const msg of messages) {
      // 2. GPU analiz metin mesajlarını işle
      if (isGpuAnalysisMessage(msg)) {
        const text = msg.text ?? msg.caption ?? "";
        messagesProcessed++;

        // Özet bilgilerini çıkar
        const summary = parseAnalysisSummary(text);
        if (summary) {
          await saveSummary(summary);
          console.log(`[SYNC] 📊 Özet: ${summary.totalListings} ilan, ${summary.buyableCandidates} aday`);
        }

        // GPU ilanlarını parse et
        const listings = parseGpuListingsFromText(text);
        if (listings.length > 0) {
          allNewListings = [...allNewListings, ...listings];
          console.log(`[SYNC] 📋 Mesajdan ${listings.length} ilan parse edildi`);
        }
      }

      // 3. GPU analiz dosyalarını indir ve işle
      if (isGpuAnalysisFile(msg) && msg.document) {
        try {
          const content = await downloadFile(msg.document.file_id);
          filesProcessed++;

          const filename = msg.document.file_name?.toLowerCase() ?? "";

          if (filename.endsWith(".json")) {
            const jsonListings = parseJsonAnalysis(content);
            if (jsonListings.length > 0) {
              allNewListings = [...allNewListings, ...jsonListings];
              console.log(`[SYNC] 📥 JSON dosyasından ${jsonListings.length} ilan parse edildi`);
            }
          } else if (filename.endsWith(".txt")) {
            // TXT dosyası da metin formatında analiz içerebilir
            const txtListings = parseGpuListingsFromText(content);
            if (txtListings.length > 0) {
              allNewListings = [...allNewListings, ...txtListings];
              console.log(`[SYNC] 📥 TXT dosyasından ${txtListings.length} ilan parse edildi`);
            }
          }
        } catch (err) {
          console.error(`[SYNC] ❌ Dosya indirme hatası (${msg.document.file_name}):`, err);
        }
      }
    }

    // 4. Tüm yeni ilanları kaydet (deduplication data-service'te yapılır)
    let savedCount = 0;
    if (allNewListings.length > 0) {
      savedCount = await saveListings(allNewListings);
    }

    // 5. Sync log kaydı
    const allListings = await getAllListings();
    await logSync(savedCount, allListings.length);

    console.log("\n[SYNC] ═══════════════════════════════════════");
    console.log(`[SYNC] ✅ Sync tamamlandı!`);
    console.log(`[SYNC]    Mesaj: ${messagesProcessed} | Dosya: ${filesProcessed}`);
    console.log(`[SYNC]    Yeni ilan: ${savedCount} | Toplam: ${allListings.length}`);
    console.log("[SYNC] ═══════════════════════════════════════\n");

    return {
      newListings: savedCount,
      messagesProcessed,
      filesProcessed,
    };
  } catch (err) {
    console.error("[SYNC] ❌ Sync hatası:", err);
    throw err;
  }
}

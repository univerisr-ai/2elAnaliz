/**
 * Parser Servisi — Telegram'dan gelen GPU analiz mesajlarını ve JSON dosyalarını parse eder.
 * 
 * Beklenen mesaj formatı:
 * "1) RTX 4080 | 200 TL | piyasa ~50000 TL | indirim %99.6
 *    https://www.sahibinden.com/ilan/..."
 */

export interface ParsedGpuListing {
  readonly rank: number;
  readonly model: string;
  readonly brand: "NVIDIA" | "AMD" | "Intel" | "Bilinmiyor";
  readonly price: number;
  readonly marketPrice: number;
  readonly discountPercent: number;
  readonly url: string;
  readonly source: "Sahibinden";
  readonly parsedAt: string;
}

export interface AnalysisSummary {
  readonly totalListings: number;
  readonly modelFound: number;
  readonly buyableCandidates: number;
  readonly parsedAt: string;
}

// ── GPU marka eşleştirme tablosu ──
const NVIDIA_MODELS = ["RTX", "GTX", "TITAN", "QUADRO", "GT "] as const;
const AMD_MODELS = ["RX ", "RADEON", "VEGA"] as const;
const INTEL_MODELS = ["ARC", "A770", "A750", "A580", "A380"] as const;

/**
 * GPU model adından markayı tespit eder.
 */
function detectBrand(model: string): ParsedGpuListing["brand"] {
  const upper = model.toUpperCase();
  if (NVIDIA_MODELS.some((prefix) => upper.includes(prefix))) return "NVIDIA";
  if (AMD_MODELS.some((prefix) => upper.includes(prefix))) return "AMD";
  if (INTEL_MODELS.some((prefix) => upper.includes(prefix))) return "Intel";
  return "Bilinmiyor";
}

/**
 * "200 TL" → 200, "50000 TL" → 50000 gibi TL string'ini sayıya çevirir.
 */
function parseTlPrice(priceStr: string): number {
  const cleaned = priceStr.replace(/[^\d]/g, "");
  return parseInt(cleaned, 10) || 0;
}

/**
 * Telegram'daki analiz özeti metnini parse eder.
 * Örnek: "Toplam ilan: 2257\nModel bulunan: 108\nAlinabilir aday: 251"
 */
export function parseAnalysisSummary(text: string): AnalysisSummary | null {
  const totalMatch = text.match(/Toplam ilan:\s*(\d+)/i);
  const modelMatch = text.match(/Model bulunan:\s*(\d+)/i);
  const buyableMatch = text.match(/Alinabilir aday:\s*(\d+)/i);

  if (!totalMatch) return null;

  return {
    totalListings: parseInt(totalMatch[1] ?? "0", 10),
    modelFound: parseInt(modelMatch?.[1] ?? "0", 10),
    buyableCandidates: parseInt(buyableMatch?.[1] ?? "0", 10),
    parsedAt: new Date().toISOString(),
  };
}

/**
 * Telegram mesajındaki GPU ilan listesini parse eder.
 * Her satır: "1) RTX 4080 | 200 TL | piyasa ~50000 TL | indirim %99.6"
 * Altında: "https://www.sahibinden.com/ilan/..."
 */
export function parseGpuListingsFromText(text: string): ParsedGpuListing[] {
  const listings: ParsedGpuListing[] = [];
  const lines = text.split("\n").map((l) => l.trim());

  // Regex: "1) RTX 4080 | 200 TL | piyasa ~50000 TL | indirim %99.6"
  const listingPattern = /^(\d+)\)\s+(.+?)\s*\|\s*(\d[\d.]*)\s*TL\s*\|\s*piyasa\s*~(\d[\d.]*)\s*TL\s*\|\s*indirim\s*%(\d+\.?\d*)/i;
  const urlPattern = /https?:\/\/www\.sahibinden\.com\/ilan\/[^\s]+/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const match = line.match(listingPattern);
    if (!match) continue;

    const rank = parseInt(match[1] ?? "0", 10);
    const model = (match[2] ?? "").trim();
    const price = parseTlPrice(match[3] ?? "0");
    const marketPrice = parseTlPrice(match[4] ?? "0");
    const discountPercent = parseFloat(match[5] ?? "0");

    // Sonraki satırda URL'yi ara
    let url = "";
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      const nextLine = lines[j];
      if (!nextLine) continue;
      const urlMatch = nextLine.match(urlPattern);
      if (urlMatch) {
        url = urlMatch[0];
        break;
      }
    }

    listings.push({
      rank,
      model,
      brand: detectBrand(model),
      price,
      marketPrice,
      discountPercent,
      url,
      source: "Sahibinden",
      parsedAt: new Date().toISOString(),
    });
  }

  console.log(`[PARSER] 📊 ${listings.length} GPU ilanı parse edildi`);
  return listings;
}

/**
 * İndirilen JSON dosyasını parse eder.
 * JSON dosyası daha detaylı ilan bilgileri içerebilir.
 */
export function parseJsonAnalysis(jsonContent: string): ParsedGpuListing[] {
  try {
    const raw = JSON.parse(jsonContent);

    // JSON bir dizi ise doğrudan GPU ilanı listesi olabilir
    if (Array.isArray(raw)) {
      return raw.map((item: Record<string, unknown>, index: number) => {
        const model = String(item["model"] ?? item["title"] ?? item["name"] ?? "Bilinmiyor");
        const price = Number(item["price"] ?? item["fiyat"] ?? 0);
        const marketPrice = Number(item["market_price"] ?? item["piyasa_fiyati"] ?? item["marketPrice"] ?? 0);
        const discount = Number(item["discount"] ?? item["indirim"] ?? 0);
        const url = String(item["url"] ?? item["link"] ?? "");

        return {
          rank: index + 1,
          model,
          brand: detectBrand(model),
          price,
          marketPrice,
          discountPercent: discount || (marketPrice > 0 ? Math.round(((marketPrice - price) / marketPrice) * 100 * 10) / 10 : 0),
          url,
          source: "Sahibinden" as const,
          parsedAt: new Date().toISOString(),
        };
      });
    }

    // JSON obje ise "listings", "results", "data" gibi anahtarları kontrol et
    const dataKey = Object.keys(raw).find((k) =>
      ["listings", "results", "data", "items", "candidates", "adaylar"].includes(k.toLowerCase())
    );

    if (dataKey && Array.isArray(raw[dataKey])) {
      return parseJsonAnalysis(JSON.stringify(raw[dataKey]));
    }

    console.warn("[PARSER] ⚠️ JSON formatı tanınamadı, boş dizi dönülüyor");
    return [];
  } catch (err) {
    console.error("[PARSER] ❌ JSON parse hatası:", err);
    return [];
  }
}

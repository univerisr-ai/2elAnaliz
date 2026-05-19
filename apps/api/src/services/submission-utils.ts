import {
  getConfiguredAllowedHosts,
  isAllowedHost,
  isPrivateHostnameLiteral,
  validatePublicHttpUrl,
} from "./network-security-service.js";
import type { RiskFlag, SourceType } from "./submission-types.js";
import { SOURCE_TYPE } from "./submission-types.js";

const MODEL_PATTERNS = [
  /\bQUADRO RTX(?:\s+[A-Z0-9-]+)?\b/i,
  /\bRTX\s+\d{3,4}\s*(?:TI|SUPER)?\b/i,
  /\bGTX\s+\d{3,4}\s*(?:TI|SUPER)?\b/i,
  /\bRX\s+\d{3,4}\s*(?:XT|XTX)?\b/i,
  /\bRADEON\s+RX\s+\d{3,4}\s*(?:XT|XTX)?\b/i,
  /\bARC\s+[A-Z]?\d{3,4}\b/i,
  /\bTITAN(?:\s+[A-Z0-9-]+)?\b/i,
];

const BROKEN_KEYWORDS = ["bozuk", "tamir", "sorunlu", "calismiyor", "çalışmıyor", "arizali", "arızalı"];
const BOX_KEYWORDS = ["kutu", "bos kutu", "boş kutu", "kutusu"];
const SWAP_KEYWORDS = ["takas", "swap", "takas olur", "takasli"];

export function getAllowedIngestHosts(): string[] {
  return getConfiguredAllowedHosts();
}

export function isPrivateHost(hostname: string): boolean {
  return isPrivateHostnameLiteral(hostname);
}

export function validateIngestUrl(value: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Gecersiz link");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Yalniz http/https linklerine izin verilir");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isPrivateHost(hostname)) {
    throw new Error("Yerel veya ozel ag adresleri kabul edilmez");
  }

  const allowedHosts = getAllowedIngestHosts();
  const isAllowed = isAllowedHost(hostname, allowedHosts);

  if (!isAllowed) {
    throw new Error("Bu alan adindan ilan alinmasina izin verilmiyor");
  }

  return parsed;
}

export async function validateIngestUrlSecure(value: string): Promise<URL> {
  return validatePublicHttpUrl(value, {
    allowedHosts: getAllowedIngestHosts(),
    requireAllowedHost: true,
  });
}

export function detectSourceTypeFromUrl(url: string): SourceType {
  const value = url.toLowerCase();

  if (value.includes("letgo")) {
    return SOURCE_TYPE.LETGO;
  }

  if (value.includes("dolap")) {
    return SOURCE_TYPE.DOLAP;
  }

  if (value.includes("donanimhaber")) {
    return SOURCE_TYPE.DONANIMHABER;
  }

  if (value.includes("sahibinden") || value.includes("shbdn.com")) {
    return SOURCE_TYPE.SAHIBINDEN;
  }

  return SOURCE_TYPE.EXTERNAL;
}

export function detectSourceLabel(sourceType: SourceType): string {
  switch (sourceType) {
    case SOURCE_TYPE.PECID:
      return "PECID Ilani";
    case SOURCE_TYPE.SAHIBINDEN:
      return "Sahibinden";
    case SOURCE_TYPE.LETGO:
      return "Letgo";
    case SOURCE_TYPE.DOLAP:
      return "Dolap";
    case SOURCE_TYPE.DONANIMHABER:
      return "Donanim Haber";
    default:
      return "Harici";
  }
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeText(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replaceAll("ç", "c")
    .replaceAll("ğ", "g")
    .replaceAll("ı", "i")
    .replaceAll("ö", "o")
    .replaceAll("ş", "s")
    .replaceAll("ü", "u");
}

export function detectModel(text: string): string | null {
  for (const pattern of MODEL_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[0]) {
      return normalizeWhitespace(match[0].toUpperCase());
    }
  }

  return null;
}

export function detectBrand(text: string): string | null {
  const upper = text.toUpperCase();

  if (upper.includes("RTX") || upper.includes("GTX") || upper.includes("QUADRO") || upper.includes("TITAN")) {
    return "NVIDIA";
  }

  if (upper.includes("RADEON") || upper.includes(" RX ") || upper.startsWith("RX ") || upper.includes("VEGA")) {
    return "AMD";
  }

  if (upper.includes("ARC")) {
    return "Intel";
  }

  return null;
}

export function collectRiskFlags(text: string, hasImages: boolean): RiskFlag[] {
  const normalized = normalizeText(text);
  const flags = new Set<RiskFlag>();

  if (!hasImages) {
    flags.add("no_images");
  }

  if (BROKEN_KEYWORDS.some((keyword) => normalized.includes(normalizeText(keyword)))) {
    flags.add("broken_keywords");
  }

  if (BOX_KEYWORDS.some((keyword) => normalized.includes(normalizeText(keyword)))) {
    flags.add("box_only");
  }

  if (SWAP_KEYWORDS.some((keyword) => normalized.includes(normalizeText(keyword)))) {
    flags.add("swap_only");
  }

  return [...flags];
}

export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const left = sorted[middle - 1] ?? 0;
    const right = sorted[middle] ?? left;
    return Math.round((left + right) / 2);
  }

  return Math.round(sorted[middle] ?? 0);
}

export function quantile(values: number[], ratio: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const rawIndex = Math.max(0, Math.min(sorted.length - 1, Math.floor(ratio * (sorted.length - 1))));
  return Math.round(sorted[rawIndex] ?? 0);
}

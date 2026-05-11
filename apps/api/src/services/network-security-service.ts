import dns from "node:dns/promises";
import net from "node:net";
import { ENV } from "../config/env.js";

export interface SafeUrlOptions {
  readonly allowedHosts?: readonly string[];
  readonly requireAllowedHost?: boolean;
}

export interface SafeFetchOptions extends SafeUrlOptions {
  readonly maxRedirects?: number;
}

export function getConfiguredAllowedHosts(): string[] {
  return ENV.ALLOWED_INGEST_HOSTS.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedHost(hostname: string, allowedHosts: readonly string[]): boolean {
  const normalizedHost = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return allowedHosts.some((allowedHost) => normalizedHost === allowedHost || normalizedHost.endsWith(`.${allowedHost}`));
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const bytes = parts.map((part) => Number(part));
  return bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255) ? bytes : null;
}

export function isPrivateIpAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = parseIpv4(mappedIpv4 ?? normalized);

  if (ipv4) {
    const [a = 0, b = 0] = ipv4;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 ||
      a === 192 && b === 168 ||
      a === 100 && b >= 64 && b <= 127 ||
      a === 198 && (b === 18 || b === 19) ||
      a >= 224
    );
  }

  if (net.isIP(normalized) === 6) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return false;
}

export function isPrivateHostnameLiteral(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized.endsWith(".local") || isPrivateIpAddress(normalized);
}

export async function validatePublicHttpUrl(value: string, options: SafeUrlOptions = {}): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Gecersiz link");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Yalniz http/https linklerine izin verilir");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Kimlik bilgisi iceren linklere izin verilmez");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isPrivateHostnameLiteral(hostname)) {
    throw new Error("Yerel veya ozel ag adresleri kabul edilmez");
  }

  const allowedHosts = options.allowedHosts ?? [];
  if (options.requireAllowedHost && !isAllowedHost(hostname, allowedHosts)) {
    throw new Error("Bu alan adindan ilan alinmasina izin verilmiyor");
  }

  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0 || records.some((record) => isPrivateIpAddress(record.address))) {
    throw new Error("Yerel veya ozel ag adresleri kabul edilmez");
  }

  parsed.hash = "";
  return parsed;
}

export async function fetchWithSafeRedirects(
  src: string,
  init: RequestInit,
  options: SafeFetchOptions = {},
): Promise<{ response: Response; finalUrl: string }> {
  let current = await validatePublicHttpUrl(src, options);
  const maxRedirects = options.maxRedirects ?? 2;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetch(current, {
      ...init,
      redirect: "manual",
    });

    if (response.status < 300 || response.status >= 400) {
      return { response, finalUrl: current.toString() };
    }

    const location = response.headers.get("location");
    if (!location || redirectCount === maxRedirects) {
      throw new Error("Guvenli olmayan yonlendirme engellendi");
    }

    current = await validatePublicHttpUrl(new URL(location, current).toString(), options);
  }

  throw new Error("Guvenli olmayan yonlendirme engellendi");
}

export async function readLimitedBuffer(response: Response, maxBytes: number): Promise<Buffer> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("Uzaktaki dosya boyutu limiti asti");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new Error("Uzaktaki dosya boyutu limiti asti");
    }
    return buffer;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    total += value.byteLength;
    if (total > maxBytes) {
      throw new Error("Uzaktaki dosya boyutu limiti asti");
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks, total);
}

export async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  return (await readLimitedBuffer(response, maxBytes)).toString("utf8");
}

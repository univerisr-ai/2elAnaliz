import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ENV } from "../config/env.js";
import {
  fetchWithSafeRedirects,
  getConfiguredAllowedHosts,
  readLimitedBuffer,
  validatePublicHttpUrl,
} from "./network-security-service.js";

const CACHE_DIR = path.resolve(process.cwd(), ".cache", "image-proxy");
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const MAX_IMAGE_BYTES = ENV.MAX_UPLOAD_IMAGE_MB * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

type CachedImagePayload = {
  readonly data: Buffer;
  readonly contentType: string;
  readonly fromCache: boolean;
};

type CacheMeta = {
  readonly contentType: string;
  readonly fetchedAt: string;
};

function getAllowedImageHosts(): string[] {
  const hosts = new Set(getConfiguredAllowedHosts());
  if (ENV.SUPABASE_URL) {
    try {
      hosts.add(new URL(ENV.SUPABASE_URL).hostname.toLowerCase());
    } catch {
      // Invalid Supabase URL is handled by submission setup validation.
    }
  }

  return [...hosts];
}

async function normalizeImageUrl(src: string, requireAllowedHost: boolean): Promise<string | null> {
  const trimmed = src.trim();
  if (!trimmed || trimmed.includes("no-image-camera")) {
    return null;
  }

  try {
    const url = await validatePublicHttpUrl(trimmed, {
      allowedHosts: getAllowedImageHosts(),
      requireAllowedHost,
    });
    return url.toString();
  } catch {
    return null;
  }
}

function toCachePaths(src: string): { binaryPath: string; metaPath: string } {
  const hash = crypto.createHash("sha1").update(src).digest("hex");
  return {
    binaryPath: path.join(CACHE_DIR, `${hash}.bin`),
    metaPath: path.join(CACHE_DIR, `${hash}.json`),
  };
}

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function readCachedImage(src: string): Promise<CachedImagePayload | null> {
  const { binaryPath, metaPath } = toCachePaths(src);

  try {
    const [buffer, rawMeta] = await Promise.all([
      fs.readFile(binaryPath),
      fs.readFile(metaPath, "utf8"),
    ]);

    const meta = JSON.parse(rawMeta) as CacheMeta;
    const fetchedAt = new Date(meta.fetchedAt).getTime();
    if (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt > CACHE_TTL_MS) {
      return null;
    }

    return {
      data: buffer,
      contentType: meta.contentType,
      fromCache: true,
    };
  } catch {
    return null;
  }
}

async function writeCachedImage(src: string, payload: Omit<CachedImagePayload, "fromCache">): Promise<void> {
  await ensureCacheDir();
  const { binaryPath, metaPath } = toCachePaths(src);

  await Promise.all([
    fs.writeFile(binaryPath, payload.data),
    fs.writeFile(
      metaPath,
      JSON.stringify(
        {
          contentType: payload.contentType,
          fetchedAt: new Date().toISOString(),
        } satisfies CacheMeta,
        null,
        2,
      ),
      "utf8",
    ),
  ]);
}

async function downloadImage(src: string, requireAllowedHost: boolean): Promise<CachedImagePayload | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const { response } = await fetchWithSafeRedirects(
      src,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "GPUPusula-Image-Proxy/1.0",
          Accept: "image/avif,image/webp,image/png,image/jpeg;q=0.9",
        },
      },
      {
        allowedHosts: getAllowedImageHosts(),
        requireAllowedHost,
        maxRedirects: 2,
      },
    );

    if (!response.ok) {
      return null;
    }

    const contentType = (response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg").trim().toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      return null;
    }

    const data = await readLimitedBuffer(response, MAX_IMAGE_BYTES);

    return {
      data,
      contentType,
      fromCache: false,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function createPlaceholderSvg(label: string): Buffer {
  const safeLabel = label.replace(/[<>&"]/g, "");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0c1014"/>
          <stop offset="100%" stop-color="#141a21"/>
        </linearGradient>
      </defs>
      <rect width="1280" height="800" fill="url(#bg)"/>
      <rect x="104" y="104" width="1072" height="592" fill="none" stroke="#2d343d" stroke-width="2"/>
      <text x="640" y="360" fill="#8b97a5" font-family="Arial, Helvetica, sans-serif" font-size="28" text-anchor="middle" letter-spacing="6">GORSEL YOK</text>
      <text x="640" y="412" fill="#dbe3ec" font-family="Georgia, serif" font-size="54" text-anchor="middle">${safeLabel}</text>
    </svg>
  `;

  return Buffer.from(svg, "utf8");
}

export async function resolveImageProxy(
  src: string,
  options: { readonly requireAllowedHost?: boolean } = {},
): Promise<CachedImagePayload | null> {
  const requireAllowedHost = options.requireAllowedHost ?? true;
  const normalizedUrl = await normalizeImageUrl(src, requireAllowedHost);
  if (!normalizedUrl) {
    return null;
  }

  const cached = await readCachedImage(normalizedUrl);
  if (cached) {
    return cached;
  }

  const downloaded = await downloadImage(normalizedUrl, requireAllowedHost);
  if (!downloaded) {
    return null;
  }

  await writeCachedImage(normalizedUrl, downloaded);
  return downloaded;
}

export function buildImagePlaceholder(label: string): { data: Buffer; contentType: string } {
  return {
    data: createPlaceholderSvg(label),
    contentType: "image/svg+xml; charset=utf-8",
  };
}

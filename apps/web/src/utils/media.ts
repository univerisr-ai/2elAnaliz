import { API_BASE } from "../services/api-service";

const API_ORIGIN = API_BASE.replace(/\/api$/, "");

function isInvalidImageUrl(imageUrl: string | null | undefined): boolean {
  return !imageUrl || imageUrl.includes("no-image-camera");
}

function isApiImageUrl(imageUrl: string): boolean {
  return imageUrl.startsWith("/api/image/") || imageUrl.startsWith(`${API_ORIGIN}/api/image/`);
}

function toAbsoluteApiImageUrl(imageUrl: string): string {
  return imageUrl.startsWith("/api/image/") ? `${API_ORIGIN}${imageUrl}` : imageUrl;
}

export function getPreferredImageUrl(imageUrl: string | null | undefined): string | null {
  if (isInvalidImageUrl(imageUrl)) {
    return null;
  }

  const safeImageUrl = imageUrl as string;

  if (isApiImageUrl(safeImageUrl)) {
    return toAbsoluteApiImageUrl(safeImageUrl);
  }

  if (safeImageUrl.includes("/lthmb_")) {
    return safeImageUrl.replace("/lthmb_", "/x5_");
  }

  if (safeImageUrl.includes("/thmb_")) {
    return safeImageUrl.replace("/thmb_", "/x5_");
  }

  return safeImageUrl;
}

export function buildImageProxyUrl(imageUrl: string, label: string): string {
  const params = new URLSearchParams({
    src: imageUrl,
    label,
  });

  return `${API_ORIGIN}/api/image?${params.toString()}`;
}

export function buildImageCandidateUrls(imageUrl: string | null | undefined, label: string): string[] {
  const original = isInvalidImageUrl(imageUrl) ? null : imageUrl;
  const preferred = getPreferredImageUrl(original);

  if (preferred && isApiImageUrl(preferred)) {
    return [toAbsoluteApiImageUrl(preferred)];
  }

  const candidates = [
    preferred ? buildImageProxyUrl(preferred, label) : null,
    original && original !== preferred ? buildImageProxyUrl(original, label) : null,
    preferred,
    original && original !== preferred ? original : null,
  ].filter((candidate): candidate is string => Boolean(candidate));

  return [...new Set(candidates)];
}

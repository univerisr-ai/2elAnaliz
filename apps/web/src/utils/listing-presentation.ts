/**
 * İlan alanlarının zarif sunumu: "Konum yok" / "Tarih yok" / "Bilinmiyor" gibi
 * ham yer tutucular kullanıcıya asla gösterilmez. Bilgi yoksa alan sessizce
 * gizlenir; tarih yoksa ilanın en son taramada görüldüğü zaman anlatılır.
 */

const PLACEHOLDER_RE = /^\s*(konum yok|tarih yok|bilinmiyor|belirsiz|yok|[-—–])\s*$/i;

export function meaningfulText(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || PLACEHOLDER_RE.test(text)) {
    return null;
  }
  return text;
}

export function lastSeenLabel(lastSeenAt: string | null | undefined): string | null {
  if (!lastSeenAt) {
    return null;
  }
  const seen = Date.parse(lastSeenAt);
  if (!Number.isFinite(seen)) {
    return null;
  }
  const days = Math.floor((Date.now() - seen) / 86_400_000);
  if (days <= 0) {
    return "Bugün doğrulandı";
  }
  if (days === 1) {
    return "Dün görüldü";
  }
  return `${days} gün önce görüldü`;
}

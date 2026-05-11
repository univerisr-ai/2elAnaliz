/** Fiyat ve tarih formatlama yardımcı fonksiyonları */

/**
 * Sayıyı Türk Lirası formatında gösterir.
 * Örnek: 18500 → "18.500 ₺"
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price) + " ₺";
}

/**
 * İndirim yüzdesini hesaplayıp döndürür.
 * Örnek: (18500, 28000) → 34
 */
export function calculateDiscount(price: number, originalPrice: number): number {
  if (originalPrice <= 0) return 0;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

/**
 * ISO tarih string'ini Türkçe "X gün önce" formatına çevirir.
 */
export function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Az önce";
  if (diffMins < 60) return `${diffMins} dk önce`;
  if (diffHours < 24) return `${diffHours} saat önce`;
  if (diffDays < 7) return `${diffDays} gün önce`;

  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
  }).format(date);
}

/**
 * Seller rating'ini yıldız emojisine çevirir: 4.5 → "★★★★☆"
 */
export function formatRating(rating: number): string {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.3;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
  return "★".repeat(fullStars) + (hasHalf ? "☆" : "") + "☆".repeat(Math.max(0, emptyStars));
}

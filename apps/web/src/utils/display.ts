export function cleanPublicListingText(value: string): string {
  const cleaned = value.replace(/\s{2,}/g, " ").trim();
  return cleaned || value;
}

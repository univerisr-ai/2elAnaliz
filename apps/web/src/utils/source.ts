type ListingLike = {
  readonly source?: string;
  readonly sourceType?: "pecid" | "sahibinden" | "letgo" | "external";
  readonly isInternal?: boolean;
};

export function getSourceLabel(listing: ListingLike): string {
  if (listing.isInternal || listing.sourceType === "pecid") {
    return "Site içi ilan";
  }

  return listing.source || "Harici";
}

export function isInternalListing(listing: ListingLike): boolean {
  return Boolean(listing.isInternal || listing.sourceType === "pecid");
}

type ListingLike = {
  readonly source?: string;
  readonly sourceLabel?: string | null;
  readonly sourceType?: "pecid" | "sahibinden" | "letgo" | "dolap" | "donanimhaber" | "external";
  readonly isInternal?: boolean;
  readonly externalUrl?: string | null;
};

export function getSourceLabel(listing: ListingLike): string {
  if (listing.sourceLabel?.trim()) {
    return listing.sourceLabel.trim();
  }

  if (listing.isInternal || listing.sourceType === "pecid") {
    return "GPU Pusula";
  }

  return listing.source || "Harici site";
}

export function isInternalListing(listing: ListingLike): boolean {
  return Boolean(listing.isInternal || listing.sourceType === "pecid");
}

export function getExternalListingUrl(listing: ListingLike): string | null {
  if (isInternalListing(listing) || !listing.externalUrl) {
    return null;
  }

  try {
    const url = new URL(listing.externalUrl);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

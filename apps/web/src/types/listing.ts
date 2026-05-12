export const GPU_BRAND = {
  NVIDIA: "NVIDIA",
  AMD: "AMD",
  INTEL: "Intel",
  UNKNOWN: "Bilinmiyor",
} as const;

export type GpuBrand = typeof GPU_BRAND[keyof typeof GPU_BRAND];

export const SORT_OPTIONS = {
  DISCOUNT_DESC: "discount_desc",
  CONFIDENCE_DESC: "confidence_desc",
  PRICE_ASC: "price_asc",
  PRICE_DESC: "price_desc",
} as const;

export type SortOption = typeof SORT_OPTIONS[keyof typeof SORT_OPTIONS];

export interface GpuListing {
  readonly id: string;
  readonly title: string;
  readonly model: string;
  readonly brand: GpuBrand;
  readonly price: number;
  readonly fairPrice: number;
  readonly discountPercent: number;
  readonly confidencePercent: number;
  readonly analysisNote: string;
  readonly listedAt: string;
  readonly imageUrl?: string | null;
}

export interface FilterState {
  search: string;
  brand: GpuBrand | "all";
  minPrice: number;
  maxPrice: number;
  minConfidence: number;
  sortBy: SortOption;
}

export const CATALOG_SORT_OPTIONS = {
  LATEST: "latest",
  PRICE_ASC: "price_asc",
  PRICE_DESC: "price_desc",
  TITLE_ASC: "title_asc",
  BUYABLE_DESC: "buyable_desc",
} as const;

export type CatalogSortOption = typeof CATALOG_SORT_OPTIONS[keyof typeof CATALOG_SORT_OPTIONS];

export interface CatalogFilterState {
  search: string;
  brand: GpuBrand | "all";
  minPrice: number;
  maxPrice: number;
  sortBy: CatalogSortOption;
}

export interface BuyabilityInsight {
  readonly score: number;
  readonly label: string;
  readonly tone: "excellent" | "good" | "watch" | "expensive";
  readonly modelName: string;
  readonly comparableCount: number;
  readonly medianPrice: number | null;
  readonly minPrice: number | null;
  readonly maxPrice: number | null;
  readonly referencePrice: number | null;
  readonly isReferenceBased: boolean;
  readonly priceDeltaPercent: number | null;
  readonly rankText: string;
  readonly reason: string;
  readonly riskFlags?: readonly string[];
}

export interface CatalogListing {
  readonly id: string;
  readonly title: string;
  readonly model: string;
  readonly brand: GpuBrand;
  readonly price: number;
  readonly priceText: string;
  readonly imageUrl: string | null;
  readonly location: string;
  readonly segment: string;
  readonly listedAtLabel: string;
  readonly modelSlug?: string;
  readonly modelFamily?: string;
  readonly buyability?: BuyabilityInsight;
  readonly sourceLabel?: string | null;
  readonly externalUrl?: string | null;
  readonly isInternal?: boolean;
}

export interface CatalogModelSummary {
  readonly slug: string;
  readonly key: string;
  readonly label: string;
  readonly family: string;
  readonly brand: GpuBrand;
  readonly listingCount: number;
  readonly buyableCount: number;
  readonly minPrice: number | null;
  readonly medianPrice: number | null;
  readonly maxPrice: number | null;
}

export interface DashboardSummary {
  readonly analysisCompleted: boolean;
  readonly generatedAt: string | null;
  readonly listingCount: number;
  readonly recognizedModelCount: number;
  readonly candidateCount: number;
  readonly expertSummary: string;
}

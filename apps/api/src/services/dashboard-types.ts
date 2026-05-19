export type DashboardBrand = "NVIDIA" | "AMD" | "Intel" | "Bilinmiyor";

export interface DashboardPipelineMessage {
  readonly service: string;
  readonly status: string;
  readonly message: string;
  readonly timestamp: string | null;
}

export interface DashboardRunMeta {
  readonly inputFile: string | null;
  readonly sourceRepository: string | null;
  readonly scraperRunId: string | null;
  readonly scraperRunUrl: string | null;
  readonly scraperArtifactName: string | null;
  readonly scrapeStatus: string | null;
  readonly listingCountFromScraper: number;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly pipelineMessage: string;
  readonly isFallback: boolean;
  readonly analyzerRepository: string | null;
  readonly analyzerRunId: string | null;
  readonly analyzerRunUrl: string | null;
  readonly deployedAt: string | null;
  readonly deployTarget: string;
  readonly deployProjectName: string | null;
  readonly dashboardVersion: string;
}

export interface DashboardTopCandidate {
  readonly title: string;
  readonly url: string;
  readonly modelKey: string;
  readonly price: number;
  readonly fairPrice: number;
  readonly discountRatio: number;
  readonly confidence: number;
  readonly analysisNote: string;
  readonly imageUrl?: string | null;
}

export interface DashboardSummary {
  readonly analysisCompleted: boolean;
  readonly generatedAt: string | null;
  readonly listingCount: number;
  readonly recognizedModelCount: number;
  readonly candidateCount: number;
  readonly topCandidates: readonly DashboardTopCandidate[];
  readonly expertSummary: string;
  readonly pipelineMessages: readonly DashboardPipelineMessage[];
  readonly runMeta: DashboardRunMeta;
}

export interface DashboardSnapshot {
  readonly summary: DashboardSummary;
  readonly fetchedAt: string;
  readonly source: "github_artifact" | "local_file";
}

export interface DashboardListing {
  readonly id: string;
  readonly title: string;
  readonly model: string;
  readonly brand: DashboardBrand;
  readonly price: number;
  readonly fairPrice: number;
  readonly discountPercent: number;
  readonly confidencePercent: number;
  readonly url: string;
  readonly analysisNote: string;
  readonly listedAt: string;
  readonly source: "PECID Ilani" | "Sahibinden" | "Letgo" | "Dolap" | "Donanim Haber" | "Harici";
  readonly sourceType?: "pecid" | "sahibinden" | "letgo" | "dolap" | "donanimhaber" | "external";
  readonly isInternal?: boolean;
  readonly imageUrl?: string | null;
}

export interface CatalogListing {
  readonly id: string;
  readonly title: string;
  readonly model: string;
  readonly brand: DashboardBrand;
  readonly price: number;
  readonly priceText: string;
  readonly url: string;
  readonly imageUrl: string | null;
  readonly location: string;
  readonly segment: string;
  readonly listedAtLabel: string;
  readonly source: "PECID Ilani" | "Sahibinden" | "Letgo" | "Dolap" | "Donanim Haber" | "Harici";
  readonly sourceType?: "pecid" | "sahibinden" | "letgo" | "dolap" | "donanimhaber" | "external";
  readonly isInternal?: boolean;
}

export interface DashboardRefreshLogEntry {
  readonly syncedAt: string;
  readonly source: string;
  readonly candidateCount: number;
  readonly listingCount: number;
  readonly analyzerRunId: string | null;
  readonly message: string;
}

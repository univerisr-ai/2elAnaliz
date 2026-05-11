import { getCatalogListings, getDashboardListings } from "./dashboard-cache-service.js";
import type { CatalogListing, DashboardListing } from "./dashboard-types.js";
import { ANALYSIS_VERDICT, type RiskFlag, type SubmissionAnalysisResult, type SubmissionWithAnalysis } from "./submission-types.js";
import { collectRiskFlags, detectBrand, detectModel, median, normalizeText, quantile } from "./submission-utils.js";

function collectMarketCandidates(bundle: SubmissionWithAnalysis): Array<CatalogListing | DashboardListing> {
  const detectedModel = detectModel(`${bundle.submission.model ?? ""} ${bundle.submission.title} ${bundle.submission.description}`) ?? bundle.submission.model;
  const normalizedModel = detectedModel ? normalizeText(detectedModel) : "";

  const matcher = (value: string) => (normalizedModel ? normalizeText(value).includes(normalizedModel) : false);

  return [];
}

function summarizeVerdict(
  verdict: SubmissionAnalysisResult["verdict"],
  fairPrice: number | null,
  priceRatio: number | null,
  confidencePercent: number,
  riskFlags: RiskFlag[],
): string {
  const issues = riskFlags.length > 0 ? ` Risk: ${riskFlags.join(", ")}.` : "";

  if (!fairPrice || !priceRatio || confidencePercent < 35) {
    return `Model veya piyasa verisi yeterince guvenli bulunamadi.${issues}`;
  }

  if (verdict === ANALYSIS_VERDICT.GOOD_PRICE) {
    return `Fiyat mevcut piyasa bandina gore avantajli gorunuyor. Tahmini referans ${fairPrice.toLocaleString("tr-TR")} TL.${issues}`;
  }

  if (verdict === ANALYSIS_VERDICT.MARKET_OK) {
    return `Fiyat mevcut piyasa bandina yakin. Tahmini referans ${fairPrice.toLocaleString("tr-TR")} TL.${issues}`;
  }

  if (verdict === ANALYSIS_VERDICT.TOO_CHEAP_REVIEW) {
    return `Fiyat piyasanin belirgin altinda. Manuel inceleme gerekir.${issues}`;
  }

  return `Fiyat mevcut piyasa bandinin ustune cikiyor. Tahmini referans ${fairPrice.toLocaleString("tr-TR")} TL.${issues}`;
}

function scoreConfidence(modelMatchCount: number, exactModelDetected: boolean, imageCount: number): number {
  let confidence = 22;

  if (exactModelDetected) {
    confidence += 28;
  }

  confidence += Math.min(30, modelMatchCount * 6);

  if (imageCount > 0) {
    confidence += 8;
  }

  return Math.max(12, Math.min(96, confidence));
}

export async function analyzeSubmission(bundle: SubmissionWithAnalysis): Promise<SubmissionAnalysisResult> {
  const text = `${bundle.submission.title} ${bundle.submission.description} ${bundle.submission.brand ?? ""} ${bundle.submission.model ?? ""}`;
  const detectedModel = detectModel(text) ?? bundle.submission.model ?? null;
  const detectedBrand = detectBrand(text) ?? bundle.submission.brand ?? null;
  const hasImages = bundle.images.length > 0 || Boolean(bundle.submission.coverImageUrl);
  const riskFlags = collectRiskFlags(text, hasImages);

  const [catalogListings, dashboardListings] = await Promise.all([getCatalogListings(), getDashboardListings()]);
  const normalizedModel = detectedModel ? normalizeText(detectedModel) : "";

  const comparablePrices = [...catalogListings, ...dashboardListings]
    .filter((listing) => {
      if (!normalizedModel) {
        return false;
      }

      return (
        normalizeText(listing.model).includes(normalizedModel) ||
        normalizeText(listing.title).includes(normalizedModel)
      );
    })
    .map((listing) => listing.price)
    .filter((price) => Number.isFinite(price) && price > 0);

  const fairPrice = median(comparablePrices);
  const marketLow = quantile(comparablePrices, 0.2);
  const marketHigh = quantile(comparablePrices, 0.8);
  const priceRatio = fairPrice ? Number((bundle.submission.price / fairPrice).toFixed(4)) : null;
  const confidencePercent = scoreConfidence(comparablePrices.length, Boolean(detectedModel), bundle.images.length);

  let verdict: SubmissionAnalysisResult["verdict"] = ANALYSIS_VERDICT.INSUFFICIENT_DATA;

  if (riskFlags.length > 0 && riskFlags.includes("broken_keywords")) {
    verdict = ANALYSIS_VERDICT.INSUFFICIENT_DATA;
  } else if (fairPrice && priceRatio) {
    if (priceRatio < 0.55) {
      verdict = ANALYSIS_VERDICT.TOO_CHEAP_REVIEW;
    } else if (priceRatio <= 0.9) {
      verdict = ANALYSIS_VERDICT.GOOD_PRICE;
    } else if (priceRatio <= 1.08) {
      verdict = ANALYSIS_VERDICT.MARKET_OK;
    } else {
      verdict = ANALYSIS_VERDICT.EXPENSIVE;
    }
  }

  if (!fairPrice || confidencePercent < 35) {
    verdict = ANALYSIS_VERDICT.INSUFFICIENT_DATA;
    if (!riskFlags.includes("low_confidence")) {
      riskFlags.push("low_confidence");
    }
  }

  return {
    detectedModel,
    detectedBrand,
    fairPrice,
    marketLow,
    marketHigh,
    priceRatio,
    confidencePercent,
    verdict,
    summaryNote: summarizeVerdict(verdict, fairPrice, priceRatio, confidencePercent, riskFlags),
    riskFlags,
    analyzerVersion: "submission-v1",
  };
}

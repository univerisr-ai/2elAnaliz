import assert from "node:assert/strict";
import {
  buildBuyabilityIndex,
  getBuyabilityInsight,
  getModelFamily,
  getModelSlug,
} from "./catalog-insight-service.js";
import type { CatalogListing, DashboardListing } from "./dashboard-types.js";

function listing(overrides: Partial<CatalogListing>): CatalogListing {
  return {
    id: overrides.id ?? "listing",
    title: overrides.title ?? "RTX 3060 12 GB",
    model: overrides.model ?? overrides.title ?? "RTX 3060 12 GB",
    brand: overrides.brand ?? "NVIDIA",
    price: overrides.price ?? 8500,
    priceText: overrides.priceText ?? `${overrides.price ?? 8500} TL`,
    url: overrides.url ?? "https://example.com/listing",
    imageUrl: overrides.imageUrl ?? null,
    location: overrides.location ?? "Istanbul",
    segment: overrides.segment ?? "8.000-10.000 TL",
    listedAtLabel: overrides.listedAtLabel ?? "Bugun",
    source: overrides.source ?? "Sahibinden",
    sourceType: overrides.sourceType ?? "sahibinden",
    productType: overrides.productType,
    isInternal: overrides.isInternal,
  };
}

function reference(model: string, fairPrice: number): DashboardListing {
  return {
    id: `reference-${model}`,
    title: model,
    model,
    brand: model.startsWith("RX") ? "AMD" : "NVIDIA",
    price: fairPrice,
    fairPrice,
    discountPercent: 0,
    confidencePercent: 95,
    url: "https://example.com/reference",
    analysisNote: "Referans fiyat",
    listedAt: new Date("2026-05-18T00:00:00.000Z").toISOString(),
    source: "Harici",
    sourceType: "external",
    imageUrl: null,
  };
}

function scoreFor(target: CatalogListing, allListings: readonly CatalogListing[]): number {
  const index = buildBuyabilityIndex(allListings, [
    reference("RTX 3060 12 GB", 12000),
    reference("RTX 4060", 14500),
    reference("RX 6700 XT", 16000),
  ]);
  return getBuyabilityInsight(target, allListings, index).score;
}

async function main(): Promise<void> {
  const cleanModern = listing({
    id: "clean-modern",
    title: "Temiz RTX 3060 12 GB garantili",
    model: "RTX 3060 12 GB",
    price: 8500,
  });
  const placeholderPrice = listing({
    id: "placeholder-price",
    title: "RTX 3060 12 GB pazarlik olur",
    model: "RTX 3060 12 GB",
    price: 1,
  });
  const broken = listing({
    id: "broken",
    title: "RTX 3060 arizali goruntu vermiyor",
    model: "RTX 3060",
    price: 3500,
  });
  const blockOnly = listing({
    id: "block-only",
    title: "RTX 4080 sadece blok",
    model: "RTX 4080",
    price: 1500,
  });
  const legacyRx = listing({
    id: "legacy-rx",
    title: "Sapphire RX 580 8 GB",
    model: "RX 580 8 GB",
    brand: "AMD",
    price: 2200,
  });
  const legacyHd = listing({
    id: "legacy-hd",
    title: "Radeon HD 7850 1 GB",
    model: "Radeon HD 7850 1 GB",
    brand: "AMD",
    price: 1250,
  });
  const cleanRx = listing({
    id: "clean-rx",
    title: "RX 6700 XT kutulu temiz",
    model: "RX 6700 XT",
    brand: "AMD",
    price: 11500,
  });

  const allListings = [cleanModern, placeholderPrice, broken, blockOnly, legacyRx, legacyHd, cleanRx];

  assert.ok(scoreFor(cleanModern, allListings) >= 50, "clean RTX 3060 should stay public");
  assert.ok(scoreFor(cleanRx, allListings) >= 50, "clean RX 6700 XT should stay public");
  assert.ok(scoreFor(placeholderPrice, allListings) < 50, "1 TL placeholder prices should be filtered out");
  assert.ok(scoreFor(broken, allListings) < 50, "broken listings should be filtered out");
  assert.ok(scoreFor(blockOnly, allListings) < 50, "part-only listings should be filtered out");
  assert.ok(scoreFor(legacyRx, allListings) < 50, "legacy RX 500 series should be filtered out");
  assert.ok(scoreFor(legacyHd, allListings) < 50, "Radeon HD listings should be filtered out");

  const amdA8 = listing({
    id: "cpu-a8",
    title: "amd a8-7600 işlemci sıfır sıkıntı onboard",
    model: "amd a8-7600 işlemci sıfır sıkıntı onboard",
    brand: "AMD",
    productType: "cpu",
    price: 850,
  });
  const ryzenB550 = listing({
    id: "cpu-ryzen-b550",
    title: "AMD Ryzen 5 5600X Altı Çekirdek 3.70 +MSI B550M Pro-VDH AMD B550",
    model: "Ryzen 5 5600X",
    brand: "AMD",
    productType: "cpu",
    price: 4200,
  });
  const ryzenA320 = listing({
    id: "cpu-ryzen-a320",
    title: "RYZEN 5 5600X A320 B450 B550 uyumlu işlemci",
    model: "Ryzen 5 5600X",
    brand: "AMD",
    productType: "cpu",
    price: 4500,
  });
  const cpuListings = [amdA8, ryzenB550, ryzenA320];
  const cpuIndex = buildBuyabilityIndex(cpuListings);

  assert.equal(getBuyabilityInsight(amdA8, cpuListings, cpuIndex).modelName, "AMD A8-7600");
  assert.equal(getModelSlug(amdA8), "amd-a8-7600");
  assert.equal(getModelFamily(amdA8), "AMD A Serisi");
  assert.equal(getBuyabilityInsight(ryzenB550, cpuListings, cpuIndex).modelName, "Ryzen 5 5600X");
  assert.equal(getModelSlug(ryzenB550), "ryzen-5-5600x");
  assert.equal(getModelFamily(ryzenB550), "Ryzen 5 Serisi");
  assert.equal(getBuyabilityInsight(ryzenB550, cpuListings, cpuIndex).comparableCount, 2);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

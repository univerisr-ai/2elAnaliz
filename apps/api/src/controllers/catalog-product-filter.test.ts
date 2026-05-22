import assert from "node:assert/strict";
import { filterCatalogListingsByProduct } from "./listings-controller.js";
import type { CatalogListing } from "../services/dashboard-types.js";

function listing(overrides: Partial<CatalogListing>): CatalogListing {
  return {
    id: overrides.id ?? "listing",
    title: overrides.title ?? "RTX 4060",
    model: overrides.model ?? "RTX 4060",
    brand: overrides.brand ?? "NVIDIA",
    price: overrides.price ?? 15000,
    priceText: overrides.priceText ?? "15.000 TL",
    url: overrides.url ?? "https://example.com/listing",
    imageUrl: overrides.imageUrl ?? null,
    location: overrides.location ?? "Istanbul",
    segment: overrides.segment ?? "10.000-20.000 TL",
    listedAtLabel: overrides.listedAtLabel ?? "Bugun",
    source: overrides.source ?? "Sahibinden",
    sourceType: overrides.sourceType ?? "sahibinden",
    productType: overrides.productType,
  };
}

async function main(): Promise<void> {
  const legacyGpu = listing({ id: "legacy-gpu", productType: undefined });
  const explicitGpu = listing({ id: "explicit-gpu", productType: "gpu" });
  const cpu = listing({
    id: "cpu",
    title: "Ryzen 5 5600X",
    model: "Ryzen 5 5600X",
    brand: "AMD",
    price: 3200,
    productType: "cpu",
  });

  assert.deepEqual(
    filterCatalogListingsByProduct([legacyGpu, explicitGpu, cpu], "gpu").map((item) => item.id),
    ["legacy-gpu", "explicit-gpu"],
  );
  assert.deepEqual(
    filterCatalogListingsByProduct([legacyGpu, explicitGpu, cpu], "cpu").map((item) => item.id),
    ["cpu"],
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

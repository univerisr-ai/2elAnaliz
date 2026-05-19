import assert from "node:assert/strict";
import { mapRawCatalogListing } from "./dashboard-cache-service.js";

async function main(): Promise<void> {
  const fromImagesArray = mapRawCatalogListing(
    {
      id: "dolap-1",
      title: "RTX 4060 Dolap ilani",
      model: "RTX 4060",
      price: 12000,
      url: "https://www.dolap.com/urun/rtx-4060",
      images: [{ url: "https://cdn.dolap.com/image-1.webp" }],
    },
    0,
  );

  const fromSnakeCase = mapRawCatalogListing(
    {
      id: "dolap-2",
      title: "RX 6700 XT Dolap ilani",
      model: "RX 6700 XT",
      price: 11000,
      url: "https://www.dolap.com/urun/rx-6700-xt",
      image_url: "https://cdn.dolap.com/image-2.jpg",
    },
    1,
  );

  assert.equal(fromImagesArray.imageUrl, "https://cdn.dolap.com/image-1.webp");
  assert.equal(fromSnakeCase.imageUrl, "https://cdn.dolap.com/image-2.jpg");
  assert.equal(fromImagesArray.sourceType, "dolap");
  assert.equal(fromImagesArray.source, "Dolap");

  const fromDonanimHaber = mapRawCatalogListing(
    {
      id: "donanimhaber-163513410",
      title: "RTX 3060 Donanim Haber ilani",
      model: "RTX 3060",
      price: 10000,
      url: "https://forum.donanimhaber.com/kutulu-zotac-gaming-nvidia-geforce-rtx-3060-12gb--163513410",
      source: "Donanim Haber",
      sourceType: "donanimhaber",
    },
    2,
  );

  assert.equal(fromDonanimHaber.sourceType, "donanimhaber");
  assert.equal(fromDonanimHaber.source, "Donanim Haber");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

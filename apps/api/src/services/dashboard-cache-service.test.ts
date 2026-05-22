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

  const fromFacebook = mapRawCatalogListing(
    {
      id: "facebook-123",
      title: "RTX 4070 Facebook ilani",
      model: "RTX 4070",
      price: 22000,
      url: "https://www.facebook.com/marketplace/item/123",
      source: "Facebook",
      sourceType: "facebook",
    },
    3,
  );

  assert.equal(fromFacebook.sourceType, "facebook");
  assert.equal(fromFacebook.source, "Facebook");

  const fromTechnopat = mapRawCatalogListing(
    {
      id: "technopat-rtx-4060",
      title: "RTX 4060 Technopat forum ilani",
      model: "RTX 4060",
      price: 15000,
      url: "https://www.technopat.net/sosyal/konu/satilik-rtx-4060.123456/",
      source: "Technopat",
      sourceType: "forum",
    },
    4,
  );

  const fromTecholay = mapRawCatalogListing(
    {
      id: "techolay-rx-6700",
      title: "RX 6700 XT Techolay forum ilani",
      model: "RX 6700 XT",
      price: 14000,
      url: "https://techolay.net/sosyal/konu/satilik-rx-6700-xt.123456/",
      source: "Techolay",
      sourceType: "forum",
    },
    5,
  );

  assert.equal(fromTechnopat.sourceType, "forum");
  assert.equal(fromTechnopat.source, "Technopat");
  assert.equal(fromTecholay.sourceType, "forum");
  assert.equal(fromTecholay.source, "Techolay");

  const fromTechnopatUrl = mapRawCatalogListing(
    {
      id: "technopat-url-rtx-4070",
      title: "RTX 4070 Technopat forum ilani",
      model: "RTX 4070",
      price: 24000,
      url: "https://www.technopat.net/sosyal/konu/satilik-rtx-4070.654321/",
    },
    6,
  );

  assert.equal(fromTechnopatUrl.sourceType, "forum");
  assert.equal(fromTechnopatUrl.source, "Technopat");

  const fromCpu = mapRawCatalogListing(
    {
      id: "cpu-ryzen-7800x3d",
      title: "AMD Ryzen 7 7800X3D islemci",
      price: 13000,
      url: "https://www.sahibinden.com/ilan/cpu-ryzen-7800x3d/detay",
      productType: "cpu",
      source: "Sahibinden",
      sourceType: "sahibinden",
    },
    7,
  );

  assert.equal(fromCpu.productType, "cpu");
  assert.equal(fromCpu.brand, "AMD");
  assert.equal(fromCpu.model, "Ryzen 7 7800X3D");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

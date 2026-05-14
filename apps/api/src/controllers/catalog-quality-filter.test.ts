import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";

interface CatalogResponse {
  success: boolean;
  data: Array<{
    buyability: {
      score: number;
    };
  }>;
  meta: {
    total: number;
    perPage: number;
  };
}

async function main(): Promise<void> {
  const { listingsRouter } = await import("./listings-controller.js");

  const app = express();
  app.use(express.json());
  app.use("/api", listingsRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    assert.ok(address);

    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}/api`;
    const response = await fetch(`${baseUrl}/catalog?perPage=3000`);
    assert.equal(response.status, 200);

    const payload = (await response.json()) as CatalogResponse;
    assert.equal(payload.success, true);
    assert.ok(payload.meta.total > 800, `expected no hard 800 listing cap, got ${payload.meta.total}`);
    assert.equal(payload.data.length, payload.meta.total);
    assert.ok(
      payload.data.every((listing) => listing.buyability.score > 50),
      "expected every public catalog listing to have buyability score above 50",
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import express from "express";

async function main(): Promise<void> {
  const originalCwd = process.cwd();
  const dir = await mkdtemp(path.join(os.tmpdir(), "2el-auth-routes-"));

  try {
    process.chdir(dir);

    const [{ listingsRouter }, { submissionsRouter }] = await Promise.all([
      import("./listings-controller.js"),
      import("./submissions-controller.js"),
    ]);

    const app = express();
    app.use(express.json());
    app.use("/api", listingsRouter);
    app.use("/api", submissionsRouter);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
      const address = server.address();
      assert.equal(typeof address, "object");
      assert.ok(address);
      const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}/api`;

      const commentResponse = await fetch(`${baseUrl}/listings/test-listing/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Oturumsuz yorum olmamali." }),
      });
      assert.equal(commentResponse.status, 401);

      const deleteResponse = await fetch(`${baseUrl}/my-submissions/test-submission`, {
        method: "DELETE",
      });
      assert.equal(deleteResponse.status, 401);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  } finally {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

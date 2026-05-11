import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalDevAuthStore } from "./local-dev-auth-service.js";

async function main(): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "2el-dev-auth-"));

  try {
    const auth = createLocalDevAuthStore(path.join(dir, "auth.json"));
    const registered = await auth.ensureAccount({
      email: "DEMIR.Test@Example.COM",
      password: "CanavarTest2026!",
      displayName: "Demir Test",
    });

    assert.equal(registered.created, true);
    assert.equal(registered.profile.email, "demir.test@example.com");
    assert.equal(registered.profile.displayName, "Demir Test");
    assert.match(registered.token, /^dev_/);

    const authenticated = await auth.authenticateToken(registered.token);
    assert.equal(authenticated?.id, registered.profile.id);
    assert.equal(authenticated?.email, "demir.test@example.com");

    const signedIn = await auth.signIn({
      email: "demir.test@example.com",
      password: "CanavarTest2026!",
    });
    assert.equal(signedIn.profile.id, registered.profile.id);

    await assert.rejects(
      () =>
        auth.signIn({
          email: "demir.test@example.com",
          password: "yanlis-sifre",
        }),
      /DEV_AUTH_INVALID_CREDENTIALS/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

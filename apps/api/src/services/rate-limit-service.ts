import crypto from "node:crypto";
import { isSupabaseConfigured } from "../config/env.js";
import { getSupabaseAdmin } from "./supabase-service.js";

interface LocalBucket {
  count: number;
  resetAt: number;
}

const localBuckets = new Map<string, LocalBucket>();

function buildBucketKey(scope: string, identity: string, windowStart: number): string {
  return crypto.createHash("sha256").update(`${scope}:${identity}:${windowStart}`).digest("hex");
}

function consumeLocalBucket(key: string, limit: number, resetAt: number): boolean {
  const now = Date.now();
  const existing = localBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    localBuckets.set(key, { count: 1, resetAt });
    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  existing.count += 1;
  return true;
}

export async function consumeRateLimit(input: {
  readonly scope: string;
  readonly identity: string;
  readonly limit: number;
  readonly windowMs: number;
}): Promise<boolean> {
  const now = Date.now();
  const windowStart = Math.floor(now / input.windowMs) * input.windowMs;
  const resetAt = windowStart + input.windowMs;
  const bucketKey = buildBucketKey(input.scope, input.identity, windowStart);

  if (isSupabaseConfigured()) {
    try {
      const client = getSupabaseAdmin();
      const { data, error } = await client.rpc("consume_rate_limit", {
        p_bucket_key: bucketKey,
        p_limit: input.limit,
        p_reset_at: new Date(resetAt).toISOString(),
      });

      if (!error) {
        return Boolean(data);
      }

      console.warn("[RATE_LIMIT] Supabase RPC kullanilamadi:", error.message);
      if (process.env.NODE_ENV === "production") {
        return false;
      }
    } catch (error) {
      console.warn("[RATE_LIMIT] Supabase rate limit hatasi:", error);
      if (process.env.NODE_ENV === "production") {
        return false;
      }
    }
  }

  return consumeLocalBucket(bucketKey, input.limit, resetAt);
}

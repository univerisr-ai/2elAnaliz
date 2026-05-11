/** Ortam değişkenleri yönetimi — Eksik zorunlu değişkenlerde uygulama başlamaz (fail fast) */

import dotenv from "dotenv";
import path from "node:path";

// tsx, CJS modunda import.meta.url desteklemediği için process.cwd() kullanılır
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[ENV] Zorunlu ortam değişkeni eksik: ${key}. .env dosyasını kontrol edin.`);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function optionalSecret(keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function booleanEnv(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value == null) {
    return fallback;
  }

  return value.trim().toLowerCase() === "true";
}

export const ENV = {
  DATA_SOURCE: optionalEnv("DATA_SOURCE", "local_file"),
  GITHUB_PAT_TOKEN: optionalSecret(["GITHUB_PAT_TOKEN", "PAT_TOKEN", "GITHUB_TOKEN"]),
  ANALYZER_REPO_OWNER: optionalEnv("ANALYZER_REPO_OWNER", ""),
  ANALYZER_REPO_NAME: optionalEnv("ANALYZER_REPO_NAME", ""),
  ANALYZER_WORKFLOW_ID: optionalEnv("ANALYZER_WORKFLOW_ID", ""),
  ANALYZER_SUMMARY_ARTIFACT_PREFIX: optionalEnv("ANALYZER_SUMMARY_ARTIFACT_PREFIX", "dashboard-summary-"),
  ANALYZER_SUMMARY_FILE: optionalEnv("ANALYZER_SUMMARY_FILE", ""),
  SCRAPER_DISPATCH_TOKEN: optionalSecret(["SCRAPER_DISPATCH_TOKEN", "GITHUB_PAT_TOKEN", "PAT_TOKEN", "GITHUB_TOKEN"]),
  SCRAPER_REPO_OWNER: optionalEnv("SCRAPER_REPO_OWNER", ""),
  SCRAPER_REPO_NAME: optionalEnv("SCRAPER_REPO_NAME", ""),
  SCRAPER_WORKFLOW_ID: optionalEnv("SCRAPER_WORKFLOW_ID", ""),
  SCRAPER_WORKFLOW_REF: optionalEnv("SCRAPER_WORKFLOW_REF", "main"),
  ADMIN_API_KEY: optionalSecret(["ADMIN_API_KEY"]),
  SYNC_ON_BOOT: booleanEnv("SYNC_ON_BOOT", false),
  TELEGRAM_USER_ID: optionalEnv("TELEGRAM_USER_ID", ""),
  TELEGRAM_BOT_TOKEN: optionalSecret(["TELEGRAM_BOT_TOKEN"]),
  PORT: parseInt(optionalEnv("PORT", "3001"), 10),
  CORS_ORIGIN: optionalEnv("CORS_ORIGIN", "http://localhost:5173"),
  SYNC_CRON: optionalEnv("SYNC_CRON", "0 */6 * * *"),
  SUPABASE_URL: optionalEnv("SUPABASE_URL", ""),
  SUPABASE_ANON_KEY: optionalSecret(["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"]),
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret(["SUPABASE_SERVICE_ROLE_KEY"]),
  SUPABASE_STORAGE_BUCKET: optionalEnv("SUPABASE_STORAGE_BUCKET", "listing-images"),
  SUBMISSIONS_ENABLED: booleanEnv("SUBMISSIONS_ENABLED", true),
  USER_SUBMISSION_HOURLY_LIMIT: parseInt(optionalEnv("USER_SUBMISSION_HOURLY_LIMIT", "12"), 10),
  IP_SUBMISSION_HOURLY_LIMIT: parseInt(optionalEnv("IP_SUBMISSION_HOURLY_LIMIT", "32"), 10),
  USER_COMMENT_HOURLY_LIMIT: parseInt(optionalEnv("USER_COMMENT_HOURLY_LIMIT", "60"), 10),
  IP_COMMENT_HOURLY_LIMIT: parseInt(optionalEnv("IP_COMMENT_HOURLY_LIMIT", "120"), 10),
  MAX_UPLOAD_IMAGES: parseInt(optionalEnv("MAX_UPLOAD_IMAGES", "8"), 10),
  MAX_UPLOAD_IMAGE_MB: parseInt(optionalEnv("MAX_UPLOAD_IMAGE_MB", "8"), 10),
  ALLOWED_INGEST_HOSTS: optionalEnv("ALLOWED_INGEST_HOSTS", "sahibinden.com,shbdn.com,letgo.com"),
} as const;

/** Telegram Bot API base URL */
export const TELEGRAM_API_BASE = `https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}`;

/** Telegram File API base URL */
export const TELEGRAM_FILE_BASE = `https://api.telegram.org/file/bot${ENV.TELEGRAM_BOT_TOKEN}`;

export function assertGitHubSourceConfigured(): void {
  if (ENV.DATA_SOURCE === "local_file") {
    if (!ENV.ANALYZER_SUMMARY_FILE) {
      throw new Error("[ENV] ANALYZER_SUMMARY_FILE zorunlu. DATA_SOURCE=local_file iken summary dosya yolu girilmelidir.");
    }

    return;
  }

  const missingKeys = [
    ["GITHUB_PAT_TOKEN", ENV.GITHUB_PAT_TOKEN],
    ["ANALYZER_REPO_OWNER", ENV.ANALYZER_REPO_OWNER],
    ["ANALYZER_REPO_NAME", ENV.ANALYZER_REPO_NAME],
    ["ANALYZER_WORKFLOW_ID", ENV.ANALYZER_WORKFLOW_ID],
  ].filter(([, value]) => !value);

  if (missingKeys.length > 0) {
    throw new Error(
      `[ENV] GitHub artifact kaynagi icin eksik degiskenler: ${missingKeys.map(([key]) => key).join(", ")}.`,
    );
  }
}

export function assertTelegramConfigured(): void {
  if (!ENV.TELEGRAM_BOT_TOKEN) {
    throw new Error("[ENV] TELEGRAM_BOT_TOKEN zorunlu. Telegram kaynagi secildiginde bot token girilmelidir.");
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(ENV.SUPABASE_URL && ENV.SUPABASE_SERVICE_ROLE_KEY);
}

export function assertSubmissionsConfigured(): void {
  if (!ENV.SUBMISSIONS_ENABLED) {
    throw new Error("[ENV] Submission sistemi devre disi birakilmis.");
  }

  if (!isSupabaseConfigured()) {
    throw new Error("[ENV] SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY zorunlu. Submission sistemi icin Supabase baglantisi kurulmalidir.");
  }
}

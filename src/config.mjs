import 'dotenv/config';
import path from 'node:path';

function toInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toFloat(value, fallback) {
  const n = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value, fallback = false) {
  if (value == null) return fallback;
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  return fallback;
}

const telegramTokens = [
  process.env.TELEGRAM_BOT_TOKEN,
  process.env.TELEGRAM_BOT_TOKEN_1,
  process.env.TELEGRAM_BOT_TOKEN_2,
].filter(Boolean);

const allowedChatRaw =
  process.env.TELEGRAM_ALLOWED_CHAT_IDS ||
  process.env.TELEGRAM_CHAT_ID ||
  process.env.TELEGRAM_USER_ID ||
  '-5083436032';

const allowedChatIds = allowedChatRaw
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

const forcedReplyChatId = String(process.env.TELEGRAM_FORCE_CHAT_ID || '-5083436032').trim();

const rootDir = process.cwd();

const defaultOpenRouterModels = [
  'qwen/qwen3-coder:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'openai/gpt-oss-120b:free',
  'meta-llama/llama-3.3-70b-instruct:free'
];

const openRouterModelsRaw =
  process.env.OPENROUTER_MODELS ||
  process.env.OPENROUTER_MODEL ||
  defaultOpenRouterModels.join(',');

const openRouterModels = openRouterModelsRaw
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

export const CONFIG = {
  rootDir,
  stateDir: path.join(rootDir, '.state'),
  dataDir: path.join(rootDir, 'data'),
  inboxDir: path.join(rootDir, 'data', 'inbox'),
  outboxDir: path.join(rootDir, 'data', 'outbox'),

  telegramTokens,
  allowedChatIds,
  telegramForceChatId: forcedReplyChatId,
  telegramPollLimit: Math.max(1, Math.min(100, toInt(process.env.TELEGRAM_POLL_LIMIT, 50))),

  minDiscountRatio: Math.max(0.03, Math.min(0.40, toFloat(process.env.MIN_DISCOUNT_RATIO, 0.10))),
  maxResults: Math.max(5, Math.min(100, toInt(process.env.MAX_RESULTS, 40))),

  analyzeLatestWhenNoNew: toBool(process.env.ANALYZE_LATEST_WHEN_NO_NEW, false),
  inputFile: process.env.INPUT_FILE || '',

  aiProvider: (process.env.AI_PROVIDER || 'none').toLowerCase(),
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openRouterModels,
  openRouterModel: openRouterModels[0] || 'qwen/qwen3-coder:free',
  maxAiModelLookups: Math.max(0, Math.min(20, toInt(process.env.MAX_AI_MODEL_LOOKUPS, 8))),
  maxAiFallbackModels: Math.max(1, Math.min(8, toInt(process.env.MAX_AI_FALLBACK_MODELS, 3))),
  maxWebModelLookups: Math.max(0, Math.min(40, toInt(process.env.MAX_WEB_MODEL_LOOKUPS, 14))),
};

if (CONFIG.telegramTokens.length === 0) {
  console.warn('[config] No TELEGRAM_BOT_TOKEN configured.');
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeFile, renderTelegramSummary } from './analyze.mjs';
import { CONFIG } from './config.mjs';
import {
  downloadFile,
  getUpdates,
  pickWorkingToken,
  sendDocument,
  sendMessage,
} from './telegram.mjs';
import { ensureDir, nowStamp, readJson, slugify, splitText, writeJson } from './utils.mjs';

const OFFSET_FILE = path.join(CONFIG.stateDir, 'telegram-offset.json');

async function ensureRuntimeDirs() {
  await ensureDir(CONFIG.stateDir);
  await ensureDir(CONFIG.dataDir);
  await ensureDir(CONFIG.inboxDir);
  await ensureDir(CONFIG.outboxDir);
}

function isAllowedChat(chatId) {
  if (!CONFIG.allowedChatIds.length) return true;
  return CONFIG.allowedChatIds.includes(String(chatId));
}

async function loadOffset() {
  const state = await readJson(OFFSET_FILE, { offset: 0 });
  const n = Number(state?.offset || 0);
  return Number.isFinite(n) ? n : 0;
}

async function saveOffset(offset) {
  await writeJson(OFFSET_FILE, { offset, savedAt: new Date().toISOString() });
}

function extractDocumentMessage(update) {
  const msg = update?.message;
  if (!msg || !msg.document) return null;

  const chatId = msg.chat?.id;
  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name || 'input.json';

  if (!chatId || !fileId) return null;
  if (!String(fileName).toLowerCase().endsWith('.json')) return null;

  return {
    updateId: update.update_id,
    messageId: msg.message_id,
    chatId: String(chatId),
    fileId,
    fileName,
  };
}

async function analyzeAndRespond(token, chatId, inputPath) {
  const report = await analyzeFile(inputPath);
  const stamp = nowStamp();
  const reportBase = `${path.parse(inputPath).name}-analysis-${stamp}`;

  const reportJsonPath = path.join(CONFIG.outboxDir, `${reportBase}.json`);
  const reportTxtPath = path.join(CONFIG.outboxDir, `${reportBase}.txt`);

  await fs.writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const summaryText = renderTelegramSummary(report);
  await fs.writeFile(reportTxtPath, `${summaryText}\n`, 'utf8');

  for (const chunk of splitText(summaryText, 3400)) {
    await sendMessage(token, chatId, chunk);
  }

  await sendDocument(token, chatId, reportJsonPath, 'Analiz raporu (JSON)');
  await sendDocument(token, chatId, reportTxtPath, 'Analiz ozeti (TXT)');

  return { reportJsonPath, reportTxtPath, candidateCount: report.candidateCount };
}

async function processTelegramMode() {
  const token = await pickWorkingToken(CONFIG.telegramTokens);
  if (!token) {
    throw new Error('No working Telegram token found.');
  }

  let offset = await loadOffset();
  const updates = await getUpdates(token, offset + 1, CONFIG.telegramPollLimit);

  if (!updates.length) {
    console.log('[telegram] No new updates.');
    return;
  }

  console.log(`[telegram] Received ${updates.length} updates.`);

  for (const update of updates) {
    offset = Math.max(offset, Number(update.update_id) || offset);
    const docMsg = extractDocumentMessage(update);
    if (!docMsg) continue;

    if (!isAllowedChat(docMsg.chatId)) {
      console.log(`[telegram] Skipping unauthorized chat ${docMsg.chatId}`);
      continue;
    }

    const baseName = `${nowStamp()}-${slugify(docMsg.fileName)}`;
    const inputPath = path.join(CONFIG.inboxDir, baseName);

    console.log(`[telegram] Downloading ${docMsg.fileName} from chat ${docMsg.chatId}`);
    await downloadFile(token, docMsg.fileId, inputPath);

    try {
      const result = await analyzeAndRespond(token, docMsg.chatId, inputPath);
      console.log(
        `[telegram] Analysis sent. candidates=${result.candidateCount} file=${path.basename(inputPath)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[telegram] Analysis failed: ${message}`);
      await sendMessage(token, docMsg.chatId, `Analiz hatasi: ${message}`);
    }
  }

  await saveOffset(offset);
}

async function processFileMode(filePathArg) {
  const inputPath = filePathArg || CONFIG.inputFile;
  if (!inputPath) {
    throw new Error('File mode requires a path: node src/index.mjs --file <path>');
  }

  const resolved = path.resolve(inputPath);
  const stat = await fs.stat(resolved);
  if (!stat.isFile()) {
    throw new Error(`Input is not a file: ${resolved}`);
  }

  const report = await analyzeFile(resolved);
  const outName = `${path.parse(resolved).name}-analysis-${nowStamp()}.json`;
  const outPath = path.join(CONFIG.outboxDir, outName);
  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const summary = renderTelegramSummary(report);
  console.log(summary);
  console.log(`\nSaved report: ${outPath}`);

  return outPath;
}

async function main() {
  await ensureRuntimeDirs();

  const fileFlagIndex = process.argv.indexOf('--file');
  if (fileFlagIndex !== -1) {
    const candidate = process.argv.slice(fileFlagIndex + 1).join(' ').trim();
    await processFileMode(candidate);
    return;
  }

  if (CONFIG.inputFile) {
    await processFileMode(CONFIG.inputFile);
    return;
  }

  await processTelegramMode();
}

main().catch((err) => {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  console.error(message);
  process.exitCode = 1;
});

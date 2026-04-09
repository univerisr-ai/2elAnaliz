import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeFile, renderTelegramSummary } from './analyze.mjs';
import { CONFIG } from './config.mjs';
import {
  downloadFile,
  getMe,
  getUpdates,
  sendDocument,
  sendMessage,
} from './telegram.mjs';
import { ensureDir, nowStamp, readJson, slugify, splitText, writeJson } from './utils.mjs';

async function acknowledgeProcessedUpdates(token, offset) {
  if (!Number.isFinite(offset) || offset <= 0) return;
  try {
    // CI kosulari stateless oldugu icin server tarafinda offset'i explicit onayla.
    await getUpdates(token, offset + 1, 1, 0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[telegram] Offset acknowledge failed: ${message}`);
  }
}

function offsetFileForToken(token, index) {
  const suffix = String(token).slice(-8).replace(/[^a-zA-Z0-9_-]/g, '_') || `bot${index + 1}`;
  return path.join(CONFIG.stateDir, `telegram-offset-${index + 1}-${suffix}.json`);
}

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

async function loadOffset(offsetFile) {
  const state = await readJson(offsetFile, { offset: 0 });
  const n = Number(state?.offset || 0);
  return Number.isFinite(n) ? n : 0;
}

async function saveOffset(offsetFile, offset) {
  await writeJson(offsetFile, { offset, savedAt: new Date().toISOString() });
}

function extractDocumentMessage(update) {
  const sourceMsg =
    (update?.message && { type: 'message', msg: update.message }) ||
    (update?.edited_message && { type: 'edited_message', msg: update.edited_message }) ||
    (update?.channel_post && { type: 'channel_post', msg: update.channel_post }) ||
    (update?.edited_channel_post && {
      type: 'edited_channel_post',
      msg: update.edited_channel_post,
    }) ||
    null;

  if (!sourceMsg?.msg) return null;

  const directDoc = sourceMsg.msg.document || null;
  const replyDoc = sourceMsg.msg.reply_to_message?.document || null;
  const doc = directDoc || replyDoc;
  if (!doc) return null;

  const chatId = sourceMsg.msg.chat?.id || sourceMsg.msg.reply_to_message?.chat?.id;
  const fileId = doc.file_id;
  const fileName = doc.file_name || 'input.json';
  const mimeType = String(doc.mime_type || '').toLowerCase();
  const isJson = String(fileName).toLowerCase().endsWith('.json') || mimeType === 'application/json';

  if (!chatId || !fileId) return null;

  return {
    updateId: update.update_id,
    messageId: sourceMsg.msg.message_id,
    chatId: String(chatId),
    fileId,
    fileName,
    isJson,
    sourceType: sourceMsg.type,
    fromReplyMessage: Boolean(!directDoc && replyDoc),
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
  const tokens = Array.from(new Set(CONFIG.telegramTokens.map((x) => String(x).trim()).filter(Boolean)));
  if (!tokens.length) {
    throw new Error('No working Telegram token found.');
  }

  let totalUpdates = 0;
  let totalAnalyzed = 0;

  for (const [tokenIndex, token] of tokens.entries()) {
    const offsetFile = offsetFileForToken(token, tokenIndex);
    let offset = await loadOffset(offsetFile);
    let docSeen = 0;
    let jsonSeen = 0;
    let nonJsonSeen = 0;
    let unauthorizedSeen = 0;
    let analyzedForBot = 0;

    try {
      const me = await getMe(token);
      if (me?.can_read_all_group_messages === false) {
        console.log(
          `[telegram] Bot #${tokenIndex + 1} privacy mode acik. Grup mesajlarinda sadece komut/reply gorur. BotFather -> /setprivacy -> Disable yapin.`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[telegram] Bot #${tokenIndex + 1} getMe warning: ${message}`);
    }

    let updates = [];
    try {
      updates = await getUpdates(token, offset + 1, CONFIG.telegramPollLimit);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[telegram] Bot #${tokenIndex + 1} getUpdates failed: ${message}`);
      continue;
    }

    if (!updates.length) {
      console.log(`[telegram] Bot #${tokenIndex + 1}: no new updates.`);
      continue;
    }

    totalUpdates += updates.length;
    console.log(`[telegram] Bot #${tokenIndex + 1}: received ${updates.length} updates.`);

    for (const update of updates) {
      offset = Math.max(offset, Number(update.update_id) || offset);
      const docMsg = extractDocumentMessage(update);
      if (!docMsg) continue;

      docSeen += 1;
      if (!docMsg.isJson) {
        nonJsonSeen += 1;
        continue;
      }
      jsonSeen += 1;

      if (!isAllowedChat(docMsg.chatId)) {
        unauthorizedSeen += 1;
        console.log(`[telegram] Skipping unauthorized chat ${docMsg.chatId}`);
        continue;
      }

      const baseName = `${nowStamp()}-${slugify(docMsg.fileName)}`;
      const inputPath = path.join(CONFIG.inboxDir, baseName);
      const targetChatId = CONFIG.telegramForceChatId || docMsg.chatId;

      if (CONFIG.telegramForceChatId && CONFIG.telegramForceChatId !== docMsg.chatId) {
        console.log(
          `[telegram] Forced target chat active. Source=${docMsg.chatId} -> Target=${CONFIG.telegramForceChatId}`,
        );
      }

      const viaReply = docMsg.fromReplyMessage ? ' reply_to_message' : '';
      console.log(
        `[telegram] Downloading ${docMsg.fileName} from chat ${docMsg.chatId} (${docMsg.sourceType}${viaReply})`,
      );
      await downloadFile(token, docMsg.fileId, inputPath);

      try {
        const result = await analyzeAndRespond(token, targetChatId, inputPath);
        analyzedForBot += 1;
        totalAnalyzed += 1;
        console.log(
          `[telegram] Analysis sent. candidates=${result.candidateCount} file=${path.basename(inputPath)}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[telegram] Analysis failed: ${message}`);
        await sendMessage(token, targetChatId, `Analiz hatasi: ${message}`);
      }
    }

    if (!docSeen) {
      console.log(
        `[telegram] Bot #${tokenIndex + 1}: no document messages in latest updates (message/channel_post/reply_to_message kontrol edildi).`,
      );
    } else {
      console.log(
        `[telegram] Bot #${tokenIndex + 1} summary: docs=${docSeen}, json=${jsonSeen}, non_json=${nonJsonSeen}, unauthorized=${unauthorizedSeen}, analyzed=${analyzedForBot}`,
      );
    }

    await acknowledgeProcessedUpdates(token, offset);

    await saveOffset(offsetFile, offset);
  }

  if (!totalUpdates) {
    console.log('[telegram] No new updates on any configured bot token.');
    return;
  }

  if (!totalAnalyzed) {
    console.log(
      '[telegram] Updates alindi ama analiz edilecek JSON bulunamadi. output.json dosyasini allowed chat icinden belge olarak gonderin. Grup privacy mode aciksa belgeyi bota reply ile /analyze yazarak da tetikleyebilirsiniz.',
    );
  }
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

/** Telegram Bot API ile iletişim servisi — Mesaj okuma, dosya indirme */

import { TELEGRAM_API_BASE, TELEGRAM_FILE_BASE } from "../config/env.js";

// ── Telegram API Tip Tanımları ──
interface TelegramUser {
  id: number;
  first_name: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string;
  title?: string;
}

interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  document?: TelegramDocument;
  caption?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
}

interface TelegramFile {
  file_id: string;
  file_path?: string;
}

// ── Son işlenen update ID'sini hafızada tut ──
let lastUpdateId = 0;

/**
 * Telegram Bot API'ye istek gönderir.
 * Rate limit ve hata yönetimi dahil.
 */
async function telegramRequest<T>(method: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${TELEGRAM_API_BASE}/${method}`);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString());
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[TELEGRAM] API hatası (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as TelegramApiResponse<T>;
  
  if (!data.ok) {
    throw new Error(`[TELEGRAM] API yanıtı başarısız: ${data.description ?? "Bilinmeyen hata"}`);
  }

  return data.result;
}

/**
 * Bot bilgilerini doğrulamak için getMe çağrısı.
 * Başlangıçta çağrılarak token'ın geçerli olduğu teyit edilir.
 */
export async function verifyBot(): Promise<{ id: number; username: string }> {
  const bot = await telegramRequest<{ id: number; first_name: string; username: string }>("getMe");
  console.log(`[TELEGRAM] ✅ Bot doğrulandı: @${bot.username} (ID: ${bot.id})`);
  return { id: bot.id, username: bot.username };
}

/**
 * Yeni mesajları çeker (long polling).
 * Her çağrıda sadece son kontrol noktasından sonraki mesajlar döner.
 */
export async function fetchNewUpdates(): Promise<TelegramMessage[]> {
  const params: Record<string, string | number> = {
    timeout: 5,
    allowed_updates: JSON.stringify(["message", "channel_post"]),
  };

  // Daha önce işlenmiş update'leri atla
  if (lastUpdateId > 0) {
    params["offset"] = lastUpdateId + 1;
  }

  const updates = await telegramRequest<TelegramUpdate[]>("getUpdates", params);

  if (updates.length === 0) {
    return [];
  }

  // Son update ID'sini güncelle
  const maxUpdateId = Math.max(...updates.map((u) => u.update_id));
  lastUpdateId = maxUpdateId;

  // Mesajları çıkar (hem doğrudan mesajlar hem channel postları)
  const messages: TelegramMessage[] = [];
  for (const update of updates) {
    const msg = update.message ?? update.channel_post;
    if (msg) {
      messages.push(msg);
    }
  }

  console.log(`[TELEGRAM] 📨 ${messages.length} yeni mesaj alındı`);
  return messages;
}

/**
 * Telegram'dan dosya indirir (JSON veya TXT).
 * Önce file_path alınır, sonra dosya içeriği çekilir.
 */
export async function downloadFile(fileId: string): Promise<string> {
  // 1. Dosya yolunu al
  const fileInfo = await telegramRequest<TelegramFile>("getFile", { file_id: fileId });
  
  if (!fileInfo.file_path) {
    throw new Error(`[TELEGRAM] Dosya yolu alınamadı: ${fileId}`);
  }

  // 2. Dosya içeriğini indir
  const fileUrl = `${TELEGRAM_FILE_BASE}/${fileInfo.file_path}`;
  const response = await fetch(fileUrl);
  
  if (!response.ok) {
    throw new Error(`[TELEGRAM] Dosya indirilemedi (${response.status}): ${fileUrl}`);
  }

  const content = await response.text();
  console.log(`[TELEGRAM] 📥 Dosya indirildi: ${fileInfo.file_path} (${content.length} byte)`);
  return content;
}

/**
 * Belirli bir chat'e mesaj gönderir (durum bildirimi için).
 */
export async function sendMessage(chatId: string | number, text: string): Promise<void> {
  await telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  });
}

import axios from 'axios';
import fs from 'node:fs';
import FormData from 'form-data';

function apiUrl(token, method) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

export async function pickWorkingToken(tokens) {
  for (const token of tokens) {
    try {
      const url = apiUrl(token, 'getMe');
      const { data } = await axios.get(url, { timeout: 20000 });
      if (data?.ok) return token;
    } catch {
      // try next
    }
  }
  return '';
}

export async function getMe(token) {
  const url = apiUrl(token, 'getMe');
  const { data } = await axios.get(url, { timeout: 20000 });
  if (!data?.ok) throw new Error(`getMe failed: ${JSON.stringify(data)}`);
  return data.result;
}

export async function getWebhookInfo(token) {
  const url = apiUrl(token, 'getWebhookInfo');
  const { data } = await axios.get(url, { timeout: 20000 });
  if (!data?.ok) throw new Error(`getWebhookInfo failed: ${JSON.stringify(data)}`);
  return data.result;
}

export async function getUpdates(token, offset, limit = 50, timeoutSeconds = 20) {
  const url = apiUrl(token, 'getUpdates');
  const { data } = await axios.get(url, {
    timeout: 45000,
    params: {
      timeout: Math.max(0, Number(timeoutSeconds) || 0),
      offset,
      limit,
      allowed_updates: JSON.stringify([
        'message',
        'edited_message',
        'channel_post',
        'edited_channel_post',
      ]),
    },
  });
  if (!data?.ok) throw new Error(`getUpdates failed: ${JSON.stringify(data)}`);
  return data.result || [];
}

export async function sendMessage(token, chatId, text) {
  const url = apiUrl(token, 'sendMessage');
  const { data } = await axios.post(
    url,
    {
      chat_id: String(chatId),
      text,
      disable_web_page_preview: true,
    },
    { timeout: 30000 },
  );

  if (!data?.ok) {
    throw new Error(`sendMessage failed: ${JSON.stringify(data)}`);
  }
  return data.result;
}

export async function sendDocument(token, chatId, filePath, caption = '') {
  const url = apiUrl(token, 'sendDocument');
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) form.append('caption', caption.slice(0, 1024));
  form.append('document', fs.createReadStream(filePath));

  const { data } = await axios.post(url, form, {
    timeout: 120000,
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
  });

  if (!data?.ok) {
    throw new Error(`sendDocument failed: ${JSON.stringify(data)}`);
  }
  return data.result;
}

export async function getFilePath(token, fileId) {
  const url = apiUrl(token, 'getFile');
  const { data } = await axios.get(url, {
    timeout: 30000,
    params: { file_id: fileId },
  });
  if (!data?.ok || !data?.result?.file_path) {
    throw new Error(`getFile failed: ${JSON.stringify(data)}`);
  }
  return data.result.file_path;
}

export async function downloadFile(token, fileId, outputPath) {
  const remotePath = await getFilePath(token, fileId);
  const url = `https://api.telegram.org/file/bot${token}/${remotePath}`;

  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 120000,
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  return outputPath;
}

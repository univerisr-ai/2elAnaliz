export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(`${JSON.stringify(data, null, 2)}\n`, {
    ...init,
    headers,
  });
}

export function errorJson(message, status = 500, extra = {}) {
  return json(
    {
      ok: false,
      error: message,
      ...extra,
    },
    { status },
  );
}

export async function readJsonBody(request) {
  const text = await request.text();
  if (!text.trim()) return {};
  return JSON.parse(text);
}

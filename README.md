# 2elAnaliz

Telegram'a gelen `output.json` dosyasini analiz eder, ikinci el ekran karti ilanlarini piyasa referansi ile karsilastirir ve alinabilir adaylari siralar.

## Ne yapar?

- Telegram'dan gelen JSON dokumanini indirir.
- Ilanlardan model + fiyat bilgisini normalize eder.
- Model bazli referans fiyat olusturur:
  - Web arama fiyat sinyalleri (DuckDuckGo)
  - Opsiyonel AI referansi (OpenRouter, kalite-oncelikli model zinciri)
  - Gelen ilandaki lokal median fiyat
- Tek bir sabit fiyat yerine dinamik indirim esitigi kullanir.
- Sonucu Telegram'a mesaj + rapor dosyasi olarak geri yollar.

## Kurulum

```bash
npm install
cp .env.example .env
```

`.env` icine en az sunlari gir:

```env
TELEGRAM_BOT_TOKEN_1=...
TELEGRAM_ALLOWED_CHAT_IDS=123456789
MIN_DISCOUNT_RATIO=0.10
MAX_RESULTS=40
```

AI destekli fiyat referansi istersen:

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=...
OPENROUTER_MODELS=anthropic/claude-3.7-sonnet,openai/gpt-4.1,google/gemini-2.5-pro,google/gemini-2.5-flash
MAX_AI_FALLBACK_MODELS=3
MAX_AI_MODEL_LOOKUPS=8
MAX_WEB_MODEL_LOOKUPS=14
```

## Calistirma

Telegram polling modu:

```bash
npm start
```

Tek bir dosyayi lokal analiz etme modu:

```bash
node src/index.mjs --file path/to/output.json
```

## GitHub Actions

Workflow dosyasi: `.github/workflows/analyze-telegram-gpu.yml`

Gerekli GitHub Secrets:

- `TELEGRAM_BOT_TOKEN_1`
- `TELEGRAM_BOT_TOKEN_2` (opsiyonel)
- `TELEGRAM_ALLOWED_CHAT_IDS`
- `OPENROUTER_API_KEY` (AI aciksa)

Opsiyonel GitHub Variables:

- `MIN_DISCOUNT_RATIO`
- `MAX_RESULTS`
- `AI_PROVIDER`
- `OPENROUTER_MODELS`
- `MAX_AI_FALLBACK_MODELS`
- `MAX_AI_MODEL_LOOKUPS`
- `MAX_WEB_MODEL_LOOKUPS`

## Yeni repo push (senin verdigin remote)

```bash
git init
git add .
git commit -m "init 2elAnaliz analyzer"
git branch -M main
git remote add origin https://github.com/univerisr-ai/2elAnaliz.git
git push -u origin main
```

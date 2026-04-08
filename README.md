# 2elAnaliz

Telegram'a gelen `output.json` dosyasini analiz eder, ikinci el ekran karti ilanlarini piyasa referansi ile karsilastirir ve alinabilir adaylari siralar.

## Ne yapar?

- Telegram'dan gelen JSON dokumanini indirir.
- Ilanlardan model + fiyat bilgisini normalize eder.
- Model bazli referans fiyat olusturur:
  - Web arama fiyat sinyalleri (DuckDuckGo)
  - Opsiyonel AI referansi (OpenRouter, ucretsiz model zinciri)
  - Gelen ilandaki lokal median fiyat
- Tek bir sabit fiyat yerine dinamik indirim esitigi kullanir.
- Sonucu Telegram'a mesaj + rapor dosyasi olarak geri yollar.

## Kurulum

```bash
npm ci
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
OPENROUTER_MODELS=qwen/qwen3-coder:free,nvidia/nemotron-3-super-120b-a12b:free,openai/gpt-oss-120b:free,meta-llama/llama-3.3-70b-instruct:free
MAX_AI_FALLBACK_MODELS=3
MAX_AI_MODEL_LOOKUPS=8
MAX_WEB_MODEL_LOOKUPS=14
```

Not: `OPENROUTER_MODELS` bos birakilirsa kod zaten ayni ucretsiz varsayilan zinciri kullanir.

## Calistirma

Telegram polling modu:

```bash
npm start
```

Tek bir dosyayi lokal analiz etme modu:

```bash
node src/index.mjs --file path/to/output.json
```

Lokal smoke test (onerilen ilk dogrulama):

```bash
node src/index.mjs --file "c:/Users/Demir Alp/Downloads/Telegram Desktop/output.json"
```

Basarili calismada terminalde ozet gorulur ve `data/outbox` altinda rapor dosyasi olusur.

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

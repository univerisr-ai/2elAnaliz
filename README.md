# 2elAnaliz

Vercel uzerinde calisan ozel GPU kontrol paneli. `yenitest` reposundaki scraper artifact'ini alir, ham veriyi sanitize eder, `latest-summary.json` uretir ve paneli Vercel deployment URL'si uzerinden yayinlar.

## Mimari

1. `yenitest` scraper workflow'u `output.json` ve `pipeline-messages.json` artifact'ini uretir.
2. Scraper, `repository_dispatch` ile bu repo workflow'unu tetikler.
3. Bu repo artifact'i indirir, analizi calistirir ve sadece guvenli alanlari iceren `docs/latest-summary.json` dosyasini uretir.
4. `api/*` altindaki Vercel Function route'lari GitHub API uzerinden run durumu, rerun ve pause islemlerini sunar.
5. Dashboard, Vercel Authentication ile korunmus deployment URL'sinden acilir.

## Yayinlanan veri

Panel sadece su alanlari yayinlar:

- `analysisCompleted`
- `generatedAt`
- `listingCount`
- `recognizedModelCount`
- `candidateCount`
- `topCandidates[]`
- `expertSummary`
- `pipelineMessages[]`
- `runMeta`

Ham `output.json`, Telegram `file_id/chat_id`, cookie/proxy detaylari ve tam listing dump deploy paketine girmez.

## Lokal calistirma

```bash
npm ci
cp .env.example .env
node src/local-index.mjs ./data/inbox/output.json
```

Bu komut `docs/latest-summary.json` dosyasini gunceller.

Vercel dev ortami acmak icin:

```bash
npm run vercel:dev
```

## Vercel env / GitHub ayarlari

Vercel proje env'leri:

```env
GITHUB_FINE_GRAINED_TOKEN=
VERCEL_PROJECT_NAME=
SCRAPER_REPO_OWNER=univerisr-ai
SCRAPER_REPO_NAME=yenitest
SCRAPER_WORKFLOW_ID=scraper.yml
SCRAPER_REPO_REF=main
ANALYZER_REPO_OWNER=univerisr-ai
ANALYZER_REPO_NAME=2elAnaliz
ANALYZER_WORKFLOW_ID=analyze-telegram-gpu.yml
ANALYZER_REPO_REF=main
PIPELINE_PAUSED_VARIABLE=PIPELINE_PAUSED
```

Gerekli GitHub token izinleri:

- scraper repo icin `Actions: read/write`, `Variables: read/write`
- analyzer repo icin `Actions: read/write`
- `Contents: read`

## Bu repo icin GitHub secrets / vars

Secrets:

- `PAT_TOKEN` (yenitest artifact indirme izni)
- `OPENROUTER_API_KEY` (opsiyonel)
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `TELEGRAM_BOT_TOKEN_1` veya `TELEGRAM_BOT_TOKEN_2` (deploy/failure bildirimi)

Variables:

- `VERCEL_PROJECT_NAME`
- `AI_PROVIDER`
- `OPENROUTER_MODELS`
- `MAX_AI_FALLBACK_MODELS`
- `MAX_AI_MODEL_LOOKUPS`
- `MAX_WEB_MODEL_LOOKUPS`
- `MIN_DISCOUNT_RATIO`
- `MAX_RESULTS`
- `TELEGRAM_FORCE_CHAT_ID`

## Vercel koruma notu

Vercel Authentication resmi dokumana gore tum planlarda var. En kolay guvenli kullanim, paneli Vercel deployment URL'si uzerinden acmak. Bu repo workflow'u deploy bittiginde URL'yi job summary ve Telegram mesajina yazar.

## Panel API yuzeyi

- `GET /api/status`
- `GET /api/runs`
- `POST /api/workflows/scraper/run`
- `POST /api/workflows/analyzer/run`
- `POST /api/pipeline/pause`

Mutation endpoint'leri Vercel korumali deployment'in arkasinda calisir; ayrica GitHub tarafinda sadece senin token'larin kullanilir.

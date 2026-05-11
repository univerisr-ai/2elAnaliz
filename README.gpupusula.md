# GPU Pusula

Ikinci el ekran karti katalogu ve kullanici ilan paneli. Public arayuz kaynak site, repo veya pipeline bilgisini gostermeden API uzerinden katalog okur; kullanici ilanlari Supabase auth + analiz + moderasyon akisiyla yayinlanir.

## Soft Launch Durumu

Bu repo soft launch / public beta icin hazirlanmistir. Son canli yayin adimlari icin `DEPLOYMENT_CHECKLIST.md` dosyasini takip edin.

Public urun kapsami:

- Model bazli ekran karti katalogu
- Alinabilirlik skoru ve risk notlari
- Favori / takip / fiyat alarmi
- Hesapli yorum sistemi
- Link veya manuel gorselli ilan gonderimi
- Admin moderasyon paneli

MVP disinda kalanlar:

- Sepet
- Odeme
- Kargo
- Escrow
- Saticiyla canli sohbet

## Yapi

- `apps/web`: Vite + React arayuzu
- `apps/api`: Express + TypeScript backend
- `apps/api/supabase/schema.sql`: Supabase tablo ve storage kurulumu

## Veri Akisi

- Backend analyzer ciktisini server-side olarak okur
- Frontend sadece backend API'ye baglanir
- Gizli anahtarlar tarayiciya cikmaz
- Kullanici ilanlari once analiz edilir, sonra moderasyona duser, en son yayinlanir
- Manual ilanlarda dosya yukleme ana yoldur; gorsel yoksa incelemeye gonderilmez

## Gerekli Ortam Degiskenleri

### API

`apps/api/.env.example` dosyasini `apps/api/.env` olarak kopyalayin.

Ozellikle su alanlar gerekir:

- `DATA_SOURCE`
- `GITHUB_PAT_TOKEN` veya `DATA_SOURCE=local_file` icin `ANALYZER_SUMMARY_FILE`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `CORS_ORIGIN`
- `ADMIN_API_KEY`

### Web

`apps/web/.env.example` dosyasini `apps/web/.env` olarak kopyalayin.

Gerekli alanlar:

- `VITE_API_BASE_URL`
- `VITE_SITE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Vercel Yayini

- `apps/web` ayri Vercel projesi olarak Vite static build yayinlanir.
- `apps/api` ayri Vercel projesi olarak `api/index.ts` serverless entrypoint'iyle calisir.
- Production'da `SYNC_ON_BOOT=false` kalmali; cron/worker local runner'da baslar, serverless fonksiyonda baslamaz.
- `CORS_ORIGIN` production web domainini icermeli. Localhost sadece development modunda otomatik kabul edilir.
- Web domaini `https://gpupusula.shop`, API icin onerilen domain `https://api.gpupusula.shop` olarak ayarlanabilir.
- Domain alindiktan sonra web icin `VITE_SITE_URL`, API icin `CORS_ORIGIN` gercek domainle guncellenmeli.
- `apps/web` build oncesinde `scripts/generate-seo.mjs` calisir ve `robots.txt` / `sitemap.xml` dosyalarini `VITE_SITE_URL` ile uretir.

## Supabase Kurulumu

1. Supabase projesi olusturun.
2. `apps/api/supabase/schema.sql` dosyasini SQL editorunde calistirin.
3. Auth ayarlarinda e-posta dogrulamayi aktif edin.
4. Storage tarafinda `listing-images` bucket'i olusur; public read acik kalir.
5. Ilk admin kullaniciyi `profiles` tablosunda `role=admin` yapin.

## Baslatma

### API

```bash
cd apps/api
cp .env.example .env
npm install
npm run dev
```

### Web

```bash
cd apps/web
cp .env.example .env
npm install
npm run dev
```

## Yerel Adresler

- Web: `http://localhost:5173`
- API health: `http://localhost:3001/api/health`
- Dashboard: `http://localhost:3001/api/dashboard`
- Catalog: `http://localhost:3001/api/catalog`

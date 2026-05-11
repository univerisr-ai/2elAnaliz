# GPU Pusula Yayın Checklist

Bu liste canlı yayına çıkmadan önce son kontrol içindir. Gizli anahtarları repo içine yazma.

## 1. Supabase

- Supabase projesi aktif olmalı; connector veya SQL editor timeout vermemeli.
- `apps/api/supabase/schema.sql` production Supabase SQL editoründe veya migration aracıyla uygulanmalı.
- `profiles`, `listing_submissions`, `published_listings`, `listing_comments`, `user_watchlist`, `rate_limit_buckets` tabloları görünmeli.
- `listing-images` storage bucket oluşmalı.
- İlk admin kullanıcının `profiles.role` değeri `admin` yapılmalı.
- Yorum insert RLS sadece authenticated kullanıcıya açık kalmalı.
- `user_watchlist` RLS sadece kullanıcının kendi kayıtlarına izin vermeli.

## 2. Vercel Projeleri

Önerilen yapı iki ayrı Vercel projesidir:

- Web project root: `apps/web`
- API project root: `apps/api`

API production env:

- `DATA_SOURCE`
- `GITHUB_PAT_TOKEN` veya `ANALYZER_SUMMARY_FILE`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET=listing-images`
- `ADMIN_API_KEY`
- `CORS_ORIGIN=https://DOMAININ`
- `SYNC_ON_BOOT=false`
- `SYNC_CRON=0 */6 * * *`

Web production env:

- `VITE_API_BASE_URL=https://API-DOMAININ/api`
- `VITE_SITE_URL=https://DOMAININ`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 3. Domain

- Web domaini: `gpupusula.shop`.
- API için ayrı subdomain önerisi: `api.gpupusula.shop`.
- Domaini web projesine bağla.
- Web `CORS_ORIGIN` API env içinde birebir bulunmalı.
- `VITE_SITE_URL=https://gpupusula.shop` olmalı; build sırasında `robots.txt` ve `sitemap.xml` buna göre üretilir.

## 4. Son Komutlar

```bash
cd apps/api
npm run build
npm audit --audit-level=moderate
```

```bash
cd apps/web
npm run lint
npm run build
npm audit --audit-level=moderate
```

## 5. Canlı Smoke Test

- `/api/health` generic cevap dönmeli.
- `/api/catalog`, `/api/models`, `/api/published-listings/:id` public kaynak/GitHub/dış URL bilgisi döndürmemeli.
- Misafir admin menüsü görmemeli.
- Normal kullanıcı yorum yazabilmeli ama admin endpointlerine erişememeli.
- Admin yönetim panelini görebilmeli.
- Manuel ilan dosya görseli olmadan gönderilememeli.
- `/model/rtx-3060` direkt açılmalı.
- Bildirim panelinde yayın, yorum ve fiyat alarmı akışları görünmeli.

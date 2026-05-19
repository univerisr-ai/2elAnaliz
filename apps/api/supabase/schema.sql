create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.listing_submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  submission_type text not null check (submission_type in ('link', 'native')),
  source_type text not null check (source_type in ('pecid', 'sahibinden', 'letgo', 'dolap', 'donanimhaber', 'facebook', 'forum', 'external')),
  source_url text,
  status text not null default 'draft',
  title text not null,
  description text not null,
  brand text,
  model text,
  category text not null default 'tech',
  price numeric(12, 2) not null,
  currency text not null default 'TRY',
  location text,
  cover_image_url text,
  published_listing_id uuid,
  rejection_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.listing_submissions
  drop constraint if exists listing_submissions_status_check;

alter table public.listing_submissions
  add constraint listing_submissions_status_check
  check (
    status in (
      'draft',
      'pending_ingest',
      'ingest_failed',
      'pending_analysis',
      'analysis_ready',
      'pending_review',
      'published',
      'rejected',
      'archived'
    )
  );

create unique index if not exists listing_submissions_source_url_unique
  on public.listing_submissions (source_url)
  where source_url is not null;

create index if not exists listing_submissions_owner_status_idx
  on public.listing_submissions (owner_id, status, created_at desc);

create index if not exists listing_submissions_status_idx
  on public.listing_submissions (status, updated_at asc);

create table if not exists public.external_link_ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.listing_submissions(id) on delete cascade,
  source_type text not null check (source_type in ('sahibinden', 'letgo', 'dolap', 'donanimhaber', 'facebook', 'forum', 'external')),
  source_url text not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed', 'blocked')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  max_attempts integer not null default 3,
  last_error text,
  claimed_at timestamptz,
  completed_at timestamptz,
  last_transition_at timestamptz not null default now(),
  scraped_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.external_link_ingest_jobs
  add column if not exists next_attempt_at timestamptz not null default now();

alter table public.external_link_ingest_jobs
  add column if not exists max_attempts integer not null default 3;

alter table public.external_link_ingest_jobs
  add column if not exists last_transition_at timestamptz not null default now();

create unique index if not exists external_link_ingest_jobs_submission_unique
  on public.external_link_ingest_jobs (submission_id);

create index if not exists external_link_ingest_jobs_status_created_idx
  on public.external_link_ingest_jobs (status, created_at asc);

create index if not exists external_link_ingest_jobs_source_url_status_idx
  on public.external_link_ingest_jobs (source_url, status, created_at desc);

create index if not exists external_link_ingest_jobs_ready_idx
  on public.external_link_ingest_jobs (status, next_attempt_at asc, created_at asc);

create index if not exists external_link_ingest_jobs_processing_idx
  on public.external_link_ingest_jobs (status, claimed_at asc, updated_at asc);

create table if not exists public.listing_submission_images (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.listing_submissions(id) on delete cascade,
  storage_path text not null,
  public_url text,
  sort_order integer not null default 0,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

create index if not exists listing_submission_images_submission_idx
  on public.listing_submission_images (submission_id, sort_order asc);

create table if not exists public.listing_submission_analysis (
  submission_id uuid primary key references public.listing_submissions(id) on delete cascade,
  detected_model text,
  detected_brand text,
  fair_price numeric(12, 2),
  market_low numeric(12, 2),
  market_high numeric(12, 2),
  price_ratio numeric(10, 4),
  confidence_percent integer not null default 0,
  verdict text not null check (verdict in ('good_price', 'market_ok', 'expensive', 'too_cheap_review', 'insufficient_data')),
  summary_note text not null default '',
  risk_flags text[] not null default '{}',
  analyzed_at timestamptz not null default now(),
  analyzer_version text not null default 'submission-v1'
);

create table if not exists public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.listing_submissions(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists moderation_events_submission_idx
  on public.moderation_events (submission_id, created_at desc);

create table if not exists public.published_listings (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('pecid', 'sahibinden', 'letgo', 'dolap', 'donanimhaber', 'facebook', 'forum', 'external')),
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text not null,
  brand text,
  model text,
  category text not null default 'tech',
  price numeric(12, 2) not null,
  currency text not null default 'TRY',
  location text,
  image_cover_url text,
  external_url text,
  source_label text not null,
  published_at timestamptz not null default now(),
  status text not null default 'published'
);

create index if not exists published_listings_status_idx
  on public.published_listings (status, published_at desc);

create table if not exists public.listing_comments (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  body text not null,
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now()
);

alter table public.listing_comments
  add column if not exists author_id uuid references public.profiles(id) on delete set null;

create index if not exists listing_comments_listing_idx
  on public.listing_comments (listing_id, status, created_at asc);

create index if not exists listing_comments_author_idx
  on public.listing_comments (author_id, created_at desc);

create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  request_count integer not null default 0,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists rate_limit_buckets_reset_idx
  on public.rate_limit_buckets (reset_at);

create table if not exists public.user_watchlist (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id text not null,
  alert_price numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index if not exists user_watchlist_user_updated_idx
  on public.user_watchlist (user_id, updated_at desc);

create index if not exists user_watchlist_listing_idx
  on public.user_watchlist (listing_id);

alter table public.profiles enable row level security;
alter table public.listing_submissions enable row level security;
alter table public.listing_submission_images enable row level security;
alter table public.listing_submission_analysis enable row level security;
alter table public.moderation_events enable row level security;
alter table public.published_listings enable row level security;
alter table public.external_link_ingest_jobs enable row level security;
alter table public.listing_comments enable row level security;
alter table public.rate_limit_buckets enable row level security;
alter table public.user_watchlist enable row level security;

create or replace function public.current_profile_role()
returns text
language sql
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id or public.current_profile_role() = 'admin');

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id or public.current_profile_role() = 'admin');

drop policy if exists "submissions_own_all" on public.listing_submissions;
create policy "submissions_own_all" on public.listing_submissions
  for all using (auth.uid() = owner_id or public.current_profile_role() = 'admin')
  with check (auth.uid() = owner_id or public.current_profile_role() = 'admin');

drop policy if exists "submission_images_own_all" on public.listing_submission_images;
create policy "submission_images_own_all" on public.listing_submission_images
  for all using (
    exists (
      select 1
      from public.listing_submissions s
      where s.id = submission_id
        and (s.owner_id = auth.uid() or public.current_profile_role() = 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.listing_submissions s
      where s.id = submission_id
        and (s.owner_id = auth.uid() or public.current_profile_role() = 'admin')
    )
  );

drop policy if exists "submission_analysis_own_select" on public.listing_submission_analysis;
create policy "submission_analysis_own_select" on public.listing_submission_analysis
  for select using (
    exists (
      select 1
      from public.listing_submissions s
      where s.id = submission_id
        and (s.owner_id = auth.uid() or public.current_profile_role() = 'admin')
    )
  );

drop policy if exists "moderation_events_admin_only" on public.moderation_events;
create policy "moderation_events_admin_only" on public.moderation_events
  for all using (public.current_profile_role() = 'admin')
  with check (public.current_profile_role() = 'admin');

drop policy if exists "external_link_ingest_jobs_admin_only" on public.external_link_ingest_jobs;
create policy "external_link_ingest_jobs_admin_only" on public.external_link_ingest_jobs
  for all using (public.current_profile_role() = 'admin')
  with check (public.current_profile_role() = 'admin');

drop policy if exists "published_listings_public_read" on public.published_listings;
create policy "published_listings_public_read" on public.published_listings
  for select using (status = 'published');

drop policy if exists "listing_comments_public_read" on public.listing_comments;
create policy "listing_comments_public_read" on public.listing_comments
  for select using (status = 'visible');

drop policy if exists "listing_comments_public_insert" on public.listing_comments;
drop policy if exists "listing_comments_authenticated_insert" on public.listing_comments;
create policy "listing_comments_authenticated_insert" on public.listing_comments
  for insert to authenticated
  with check (
    auth.uid() is not null
    and author_id = auth.uid()
    and status = 'visible'
  );

drop policy if exists "listing_comments_admin_all" on public.listing_comments;
create policy "listing_comments_admin_all" on public.listing_comments
  for all using (public.current_profile_role() = 'admin')
  with check (public.current_profile_role() = 'admin');

revoke all on public.rate_limit_buckets from anon, authenticated;

drop policy if exists "user_watchlist_own_select" on public.user_watchlist;
create policy "user_watchlist_own_select" on public.user_watchlist
  for select using (auth.uid() = user_id);

drop policy if exists "user_watchlist_own_insert" on public.user_watchlist;
create policy "user_watchlist_own_insert" on public.user_watchlist
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_watchlist_own_update" on public.user_watchlist;
create policy "user_watchlist_own_update" on public.user_watchlist
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_watchlist_own_delete" on public.user_watchlist;
create policy "user_watchlist_own_delete" on public.user_watchlist
  for delete using (auth.uid() = user_id);

create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_reset_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  if p_limit < 1 then
    return false;
  end if;

  delete from public.rate_limit_buckets
  where reset_at <= now();

  insert into public.rate_limit_buckets (bucket_key, request_count, reset_at, updated_at)
  values (p_bucket_key, 1, p_reset_at, now())
  on conflict (bucket_key) do update
    set request_count = case
        when public.rate_limit_buckets.reset_at <= now() then 1
        else public.rate_limit_buckets.request_count + 1
      end,
      reset_at = case
        when public.rate_limit_buckets.reset_at <= now() then p_reset_at
        else public.rate_limit_buckets.reset_at
      end,
      updated_at = now()
  returning request_count into next_count;

  return next_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, timestamptz) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-images',
  'listing-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "listing_images_public_read" on storage.objects;
create policy "listing_images_public_read" on storage.objects
  for select using (bucket_id = 'listing-images');

drop policy if exists "listing_images_owner_write" on storage.objects;
create policy "listing_images_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'listing-images'
    and auth.uid() is not null
  );

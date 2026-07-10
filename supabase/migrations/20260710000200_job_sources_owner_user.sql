-- Per-user company job boards (Randall 2026-07-10): a job_sources row may be owned by a
-- user. NULL owner = global/admin source (existing cron-scanned rows). Boards are PRIVATE
-- per user; fetched postings still dedupe into the shared jobs pool via the
-- jobs (source, source_url) upsert key.
-- Idempotent. Apply AFTER the code deploy. Requires Postgres 15+ (nulls not distinct) —
-- verify with `select version()` at apply time; fallback is two partial unique indexes
-- (one `where owner_user_id is null` on the 3 board columns, one on all 4 otherwise).

alter table public.job_sources
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

-- Two users watching the same board are two rows; the old global unique key would 409 the
-- second user. Owner-scoped uniqueness; NULLS NOT DISTINCT keeps global rows unique too.
alter table public.job_sources
  drop constraint if exists job_sources_ats_provider_ats_board_token_careers_url_key;

create unique index if not exists job_sources_owner_board_key
  on public.job_sources (owner_user_id, ats_provider, ats_board_token, careers_url)
  nulls not distinct;

create index if not exists job_sources_owner_idx on public.job_sources (owner_user_id);

-- RLS stays enabled-with-no-policy: all reads/writes go through the service role.

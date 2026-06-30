-- Posting parser storage: responsibilities + required-experience bullets extracted from each
-- job description at source-scan time. Defensive/idempotent.
alter table public.jobs
  add column if not exists responsibilities text[] not null default '{}',
  add column if not exists required_experience text[] not null default '{}';

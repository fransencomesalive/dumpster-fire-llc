-- Durable public-job link health. The immutable pursuit snapshot remains historical context;
-- current link availability belongs to the live job record and is refreshed independently.

alter table public.jobs
  add column if not exists link_status text not null default 'unknown',
  add column if not exists link_checked_at timestamptz,
  add column if not exists link_http_status integer,
  add column if not exists link_health_reason text;

alter table public.jobs
  drop constraint if exists jobs_link_status_check,
  add constraint jobs_link_status_check
    check (link_status in ('unknown', 'healthy', 'gone', 'uncertain')),
  drop constraint if exists jobs_link_http_status_check,
  add constraint jobs_link_http_status_check
    check (link_http_status is null or link_http_status between 100 and 599);

create index if not exists jobs_link_status_checked_idx
  on public.jobs(link_status, link_checked_at);

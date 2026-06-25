alter table public.job_search_settings
  add column if not exists digest_cadence text not null default 'weekdays'
  check (digest_cadence in ('manual', 'daily', 'weekdays', 'weekly'));

update public.job_search_settings
set digest_cadence = 'weekdays'
where digest_cadence is null;

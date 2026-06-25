alter table public.job_search_jobs
  add column if not exists notes text not null default '';

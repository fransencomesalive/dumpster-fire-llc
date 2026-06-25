alter table public.job_search_companies
  drop constraint if exists job_search_companies_ats_provider_check;

alter table public.job_search_companies
  add constraint job_search_companies_ats_provider_check
  check (ats_provider in ('greenhouse', 'lever', 'ashby', 'icims', 'html'));

alter table public.job_search_jobs
  drop constraint if exists job_search_jobs_source_provider_check;

alter table public.job_search_jobs
  add constraint job_search_jobs_source_provider_check
  check (source_provider in ('greenhouse', 'lever', 'ashby', 'icims', 'html'));

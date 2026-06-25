update public.job_search_jobs
set
  status = 'archived',
  closed_at = coalesce(closed_at, now()),
  updated_at = now()
where profile_id = 'default'
  and (
    source_url like 'https://example.com/%'
    or apply_url like 'https://example.com/%'
  )
  and status <> 'archived';

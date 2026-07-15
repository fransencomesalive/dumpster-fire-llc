-- Private pasted jobs, phase B (apply AFTER the owner-aware code deploy is verified live).
-- Drops the global (source, source_url) unique key so different users can each hold a
-- private copy of the same pasted URL; jobs_source_url_owner_key (nulls not distinct)
-- remains the sole uniqueness guarantee and upsert conflict target.

alter table public.jobs
  drop constraint if exists jobs_source_source_url_key;

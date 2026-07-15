-- Private pasted jobs, phase A (apply BEFORE the owner-aware code deploy).
-- owner_user_id null = shared pool row (source scans); non-null = private to that user.
-- The old jobs_source_source_url_key stays through the transition so deployed old code
-- keeps a valid on_conflict target; phase B (20260715000200) drops it.

alter table public.jobs
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

create unique index if not exists jobs_source_url_owner_key
  on public.jobs (source, source_url, owner_user_id) nulls not distinct;

drop policy if exists jobs_read_authenticated on public.jobs;
create policy jobs_read_authenticated on public.jobs
  for select
  using (auth.uid() is not null and (owner_user_id is null or owner_user_id = auth.uid()));

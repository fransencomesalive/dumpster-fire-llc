-- Saved Pursuits production preflight. READ ONLY.
-- Run before applying any 20260718 migration or existing-user conversion.

begin transaction read only;

select
  version,
  name
from supabase_migrations.schema_migrations
where version in ('20260718000100', '20260718000200', '20260718000300')
order by version;

select
  count(*) as saved_jobs,
  count(*) filter (where profile_id is null) as saved_jobs_without_profile,
  count(*) filter (where nullif(btrim(notes), '') is not null) as saved_jobs_with_notes
from public.saved_jobs;

select status, count(*)
from public.pursuits
group by status
order by status;

select
  count(*) as jobs_in_both_tables,
  count(*) filter (
    where nullif(btrim(saved_jobs.notes), '') is not null
      and nullif(btrim(to_jsonb(pursuits) ->> 'notes'), '') is not null
      and saved_jobs.notes <> (to_jsonb(pursuits) ->> 'notes')
  ) as conflicting_nonempty_notes
from public.saved_jobs
join public.pursuits using (user_id, job_id);

select event_type, count(*)
from public.pursuit_events
group by event_type
order by event_type;

select status, count(*)
from public.outreach_messages
group by status
order by status;

select
  job_scan_results.status,
  count(*) as saved_rows
from public.saved_jobs
join public.job_scan_results using (user_id, job_id)
where job_scan_results.status <> 'active'
group by job_scan_results.status
order by job_scan_results.status;

select
  (select count(*) from public.pursuits where status = 'offer') as legacy_offer_status_rows,
  (select count(*) from public.pursuit_events where event_type = 'offer') as legacy_offer_event_rows;

select
  user_id,
  related_pursuit_id,
  count(*) as debit_rows,
  sum(quantity) as debit_quantity,
  min(created_at) as first_debit_at,
  max(created_at) as last_debit_at
from public.usage_ledger
where usage_type = 'pursuit'
  and related_pursuit_id is not null
group by user_id, related_pursuit_id
having count(*) > 1 or sum(quantity) <> 1
order by user_id, related_pursuit_id;

select
  count(*) as pursuits_without_posting_snapshot
from public.pursuits
where coalesce(to_jsonb(pursuits) -> 'job_snapshot', '{}'::jsonb) = '{}'::jsonb;

select
  count(*) as saved_jobs_without_convertible_job
from public.saved_jobs
left join public.jobs on jobs.id = saved_jobs.job_id
where jobs.id is null;

select
  count(*) as pursuits_with_missing_profile_reference
from public.pursuits
left join public.candidate_profiles on candidate_profiles.id = pursuits.profile_id
where pursuits.profile_id is not null
  and candidate_profiles.id is null;

select
  count(*) as pursuits_with_missing_job_reference
from public.pursuits
left join public.jobs on jobs.id = pursuits.job_id
where pursuits.job_id is not null
  and jobs.id is null;

select
  name,
  pursuit_limit_monthly,
  outreach_limit_monthly,
  human_path_limit_monthly
from public.subscription_plans
where name in ('tester', 'basic', 'pro', 'premium')
order by name;

select
  grantee,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'pursuits',
    'pursuit_events',
    'pursuit_tracking_events',
    'pursuit_tracking_mutation_requests',
    'pursuit_outreach_generation_requests'
  )
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('pursuits', 'pursuit_events', 'pursuit_tracking_events')
order by tablename, policyname;

select
  routine_name,
  grantee,
  privilege_type
from information_schema.role_routine_grants
where specific_schema = 'public'
  and routine_name in (
    'mutate_pursuit_tracking',
    'record_outreach_message_copy',
    'persist_initial_outreach_generation',
    'set_canonical_job_saved'
  )
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by routine_name, grantee;

rollback;

-- Saved Pursuits data-readiness and database hardening.
--
-- This migration is deliberately additive/idempotent except for replacing the two
-- pursuits foreign keys with nullable ON DELETE SET NULL relationships. It does not
-- remove saved_jobs, legacy pursuit statuses, Offer rows, or any user history.

-- Keep the database-side quota source aligned with the approved application rules.
update public.subscription_plans
set
  pursuit_limit_monthly = case name
    when 'tester' then 25
    when 'basic' then 0
    when 'pro' then 0
    when 'premium' then 50
  end,
  outreach_limit_monthly = case name
    when 'tester' then 75
    when 'basic' then 0
    when 'pro' then 0
    when 'premium' then 150
  end,
  human_path_limit_monthly = case name
    when 'tester' then 25
    when 'basic' then 0
    when 'pro' then 25
    when 'premium' then 50
  end,
  updated_at = now()
where name in ('tester', 'basic', 'pro', 'premium');

-- Pursuit history belongs to the user, not to the current profile or mutable job row.
alter table public.pursuits
  alter column profile_id drop not null,
  alter column job_id drop not null;

alter table public.pursuits
  drop constraint if exists pursuits_profile_id_fkey,
  drop constraint if exists pursuits_job_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pursuits'::regclass
      and conname = 'pursuits_profile_id_fkey'
  ) then
    alter table public.pursuits
      add constraint pursuits_profile_id_fkey
      foreign key (profile_id) references public.candidate_profiles(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pursuits'::regclass
      and conname = 'pursuits_job_id_fkey'
  ) then
    alter table public.pursuits
      add constraint pursuits_job_id_fkey
      foreign key (job_id) references public.jobs(id) on delete set null;
  end if;
end $$;

-- Migration-created events sometimes establish a valid fact without a trustworthy
-- historical occurrence time. Keep occurred_at for deterministic ordering while the
-- explicit flag prevents clients from presenting it as a known historical timestamp.
alter table public.pursuit_tracking_events
  add column if not exists occurred_at_known boolean not null default true;

-- Authenticated clients may read their records but all writes must use server APIs/RPCs.
drop policy if exists pursuits_owner on public.pursuits;
drop policy if exists pursuits_owner_select on public.pursuits;
create policy pursuits_owner_select on public.pursuits
  for select using (user_id = auth.uid());

drop policy if exists pursuit_events_owner on public.pursuit_events;
drop policy if exists pursuit_events_owner_select on public.pursuit_events;
create policy pursuit_events_owner_select on public.pursuit_events
  for select using (user_id = auth.uid());

drop policy if exists pursuit_tracking_events_owner_insert on public.pursuit_tracking_events;

revoke insert, update, delete, truncate on public.pursuits from public, anon, authenticated;
revoke insert, update, delete, truncate on public.pursuit_events from public, anon, authenticated;
revoke insert, update, delete, truncate on public.pursuit_tracking_events from public, anon, authenticated;
revoke insert, update, delete, truncate on public.pursuit_tracking_mutation_requests from public, anon, authenticated;
revoke insert, update, delete, truncate on public.pursuit_outreach_generation_requests from public, anon, authenticated;

grant select, insert, update, delete on public.pursuits to service_role;
grant select, insert, update, delete on public.pursuit_events to service_role;
grant select, insert, update, delete on public.pursuit_tracking_events to service_role;
grant select, insert, update, delete on public.pursuit_tracking_mutation_requests to service_role;
grant select, insert, update, delete on public.pursuit_outreach_generation_requests to service_role;

-- A one-time pursuit debit is authoritative in the ledger. Abort rather than silently
-- discarding historical duplicates; the read-only preflight reports the exact rows.
do $$
begin
  if exists (
    select 1
    from public.usage_ledger
    where usage_type = 'pursuit'
      and related_pursuit_id is not null
    group by user_id, related_pursuit_id
    having count(*) > 1 or sum(quantity) <> 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'saved_pursuits_duplicate_legacy_pursuit_debits';
  end if;
end $$;

create unique index if not exists usage_ledger_one_pursuit_debit_idx
  on public.usage_ledger(user_id, related_pursuit_id)
  where usage_type = 'pursuit' and related_pursuit_id is not null;

create or replace function public.enforce_usage_ledger_quota()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text := 'active';
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_limit integer;
  v_used integer;
begin
  if new.usage_type not in ('pursuit', 'outreach_message') then
    return new;
  end if;

  -- Serialize every metered write for this user. Concurrent generation requests then
  -- observe each other's committed ledger quantities before either can exceed quota.
  perform pg_advisory_xact_lock(hashtextextended('saved-pursuits-quota:' || new.user_id::text, 0));

  select
    subscriptions.status,
    coalesce(subscriptions.current_period_start, date_trunc('month', new.created_at)),
    coalesce(subscriptions.current_period_end, date_trunc('month', new.created_at) + interval '1 month'),
    case new.usage_type
      when 'pursuit' then plans.pursuit_limit_monthly
      else plans.outreach_limit_monthly
    end
  into v_status, v_period_start, v_period_end, v_limit
  from public.user_subscriptions as subscriptions
  join public.subscription_plans as plans on plans.id = subscriptions.plan_id
  where subscriptions.user_id = new.user_id;

  if not found then
    select
      'active',
      date_trunc('month', new.created_at),
      date_trunc('month', new.created_at) + interval '1 month',
      case new.usage_type
        when 'pursuit' then plans.pursuit_limit_monthly
        else plans.outreach_limit_monthly
      end
    into v_status, v_period_start, v_period_end, v_limit
    from public.subscription_plans as plans
    where plans.name = 'basic';

    if not found then
      raise exception using
        errcode = '23503',
        message = 'subscription_plan_missing:basic';
    end if;
  end if;

  if v_status not in ('active', 'trialing') then
    raise exception using
      errcode = 'P0001',
      message = 'subscription_inactive:' || coalesce(v_status, 'canceled');
  end if;

  if v_period_end <= v_period_start then
    raise exception using
      errcode = '22023',
      message = 'subscription_period_invalid';
  end if;

  -- A null limit is intentionally unlimited.
  if v_limit is null then
    return new;
  end if;

  select coalesce(sum(quantity), 0)::integer
  into v_used
  from public.usage_ledger
  where user_id = new.user_id
    and usage_type = new.usage_type
    and created_at >= v_period_start
    and created_at < v_period_end;

  if v_used + new.quantity > v_limit then
    raise exception using
      errcode = 'P0001',
      message = case new.usage_type
        when 'pursuit' then 'pursuit_limit_reached:' || v_used || ':' || v_limit
        else 'outreach_message_limit_reached:' || v_used || ':' || v_limit
      end;
  end if;

  return new;
end;
$$;

drop trigger if exists usage_ledger_quota_before_insert on public.usage_ledger;
create trigger usage_ledger_quota_before_insert
  before insert on public.usage_ledger
  for each row execute function public.enforce_usage_ledger_quota();

create or replace function public.validate_pursuit_metered_latch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ledger_at timestamptz;
begin
  if new.pursuit_metered_at is null then
    if tg_op = 'UPDATE' and old.pursuit_metered_at is not null then
      raise exception using errcode = '23514', message = 'pursuit_metered_latch_cannot_be_cleared';
    end if;
    return new;
  end if;

  select min(created_at)
  into v_ledger_at
  from public.usage_ledger
  where user_id = new.user_id
    and related_pursuit_id = new.id
    and usage_type = 'pursuit';

  if v_ledger_at is null then
    raise exception using errcode = '23514', message = 'pursuit_metered_latch_requires_ledger';
  end if;

  new.pursuit_metered_at := v_ledger_at;
  return new;
end;
$$;

drop trigger if exists pursuits_metered_latch_before_write on public.pursuits;
create trigger pursuits_metered_latch_before_write
  before insert or update on public.pursuits
  for each row execute function public.validate_pursuit_metered_latch();

create or replace function public.sync_pursuit_metered_latch_from_ledger()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.usage_type = 'pursuit' and new.related_pursuit_id is not null then
    update public.pursuits
    set pursuit_metered_at = coalesce(pursuit_metered_at, new.created_at)
    where id = new.related_pursuit_id
      and user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists usage_ledger_sync_pursuit_latch_after_insert on public.usage_ledger;
create trigger usage_ledger_sync_pursuit_latch_after_insert
  after insert on public.usage_ledger
  for each row execute function public.sync_pursuit_metered_latch_from_ledger();

revoke all on function public.enforce_usage_ledger_quota() from public, anon, authenticated;
revoke all on function public.validate_pursuit_metered_latch() from public, anon, authenticated;
revoke all on function public.sync_pursuit_metered_latch_from_ledger() from public, anon, authenticated;

-- Canonical, immutable first-save posting snapshot assembled from trusted database data.
create or replace function public.saved_pursuit_job_snapshot(
  p_job_id uuid,
  p_user_id uuid,
  p_captured_at timestamptz
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_strip_nulls(jsonb_build_object(
    'jobId', jobs.id,
    'source', jobs.source,
    'sourceUrl', jobs.source_url,
    'title', jobs.title,
    'companyName', jobs.company_name,
    'description', jobs.description,
    'responsibilities', to_jsonb(jobs.responsibilities),
    'requiredExperience', to_jsonb(jobs.required_experience),
    'location', jobs.location,
    'remoteType', jobs.remote_type,
    'employmentType', jobs.employment_type,
    'compensation', jobs.compensation_text,
    'postedAt', jobs.posted_at,
    'scrapedAt', jobs.scraped_at,
    'firstSeenAt', scan_result.first_seen_at,
    'lastSeenAt', scan_result.last_seen_at,
    'capturedAt', coalesce(p_captured_at, now()),
    'availability', case
      when scan_result.status is not null then scan_result.status
      else 'available'
    end,
    'sourceState', case
      when jobs.owner_user_id is null then 'shared'
      else 'user_owned'
    end
  )), '{}'::jsonb)
  from public.jobs
  left join public.job_scan_results as scan_result
    on scan_result.job_id = jobs.id
   and scan_result.user_id = p_user_id
  where jobs.id = p_job_id
    and (jobs.owner_user_id is null or jobs.owner_user_id = p_user_id)
$$;

revoke all on function public.saved_pursuit_job_snapshot(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.saved_pursuit_job_snapshot(uuid, uuid, timestamptz) to service_role;

-- Atomic compatibility boundary for dashboard Save/Unsave. Unsave intentionally removes
-- only the saved_jobs compatibility row; a canonical pursuit and its artifacts survive.
create or replace function public.set_canonical_job_saved(
  p_user_id uuid,
  p_profile_id uuid,
  p_job_id uuid,
  p_saved boolean,
  p_job_snapshot jsonb,
  p_now timestamptz
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_pursuit public.pursuits%rowtype;
  v_snapshot jsonb;
  v_created boolean := false;
begin
  if p_user_id is null or p_job_id is null or p_saved is null then
    raise exception using errcode = '22023', message = 'user_id, job_id, and saved are required';
  end if;
  p_now := coalesce(p_now, clock_timestamp());

  if p_profile_id is not null and not exists (
    select 1 from public.candidate_profiles
    where id = p_profile_id and user_id = p_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'owned profile not found';
  end if;

  if not exists (
    select 1 from public.jobs
    where jobs.id = p_job_id
      and (jobs.owner_user_id is null or jobs.owner_user_id = p_user_id)
  ) then
    raise exception using errcode = 'P0002', message = 'owned job not found';
  end if;

  if p_saved and not exists (
    select 1 from public.job_scan_results
    where job_scan_results.job_id = p_job_id
      and job_scan_results.user_id = p_user_id
      and job_scan_results.status = 'active'
  ) then
    raise exception using errcode = 'P0002', message = 'owned active scan result not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'saved-pursuit:' || p_user_id::text || ':' || p_job_id::text,
    0
  ));

  if not p_saved then
    delete from public.saved_jobs
    where user_id = p_user_id and job_id = p_job_id;

    select * into v_pursuit
    from public.pursuits
    where user_id = p_user_id and job_id = p_job_id;

    return jsonb_build_object(
      'status', 'unsaved',
      'pursuit', case when v_pursuit.id is null then null else to_jsonb(v_pursuit) end,
      'created', false
    );
  end if;

  if p_job_snapshot is not null and jsonb_typeof(p_job_snapshot) <> 'object' then
    raise exception using errcode = '22023', message = 'job_snapshot must be a JSON object';
  end if;

  -- Caller-supplied context may add fields, but trusted database fields always win.
  v_snapshot := coalesce(p_job_snapshot, '{}'::jsonb)
    || public.saved_pursuit_job_snapshot(p_job_id, p_user_id, p_now);

  insert into public.saved_jobs (user_id, profile_id, job_id, created_at, updated_at)
  values (p_user_id, p_profile_id, p_job_id, p_now, p_now)
  on conflict (user_id, job_id) do update
  set
    profile_id = coalesce(saved_jobs.profile_id, excluded.profile_id),
    updated_at = excluded.updated_at;

  select * into v_pursuit
  from public.pursuits
  where user_id = p_user_id and job_id = p_job_id
  for update;

  if not found then
    insert into public.pursuits (
      user_id, profile_id, job_id, status, job_snapshot,
      last_activity_at, created_at, updated_at
    ) values (
      p_user_id, p_profile_id, p_job_id, 'saved', v_snapshot,
      p_now, p_now, p_now
    )
    returning * into v_pursuit;
    v_created := true;

    insert into public.pursuit_events (
      pursuit_id, user_id, event_type, from_status, to_status, payload, created_at
    ) values (
      v_pursuit.id, p_user_id, 'created', null, 'saved',
      jsonb_build_object('source', 'canonical_save'), p_now
    );
  else
    update public.pursuits
    set
      profile_id = coalesce(profile_id, p_profile_id),
      job_snapshot = case
        when job_snapshot = '{}'::jsonb then v_snapshot
        else job_snapshot
      end,
      last_activity_at = greatest(last_activity_at, p_now),
      updated_at = greatest(updated_at, p_now)
    where id = v_pursuit.id
    returning * into v_pursuit;
  end if;

  return jsonb_build_object(
    'status', 'saved',
    'pursuit', to_jsonb(v_pursuit),
    'created', v_created
  );
end;
$$;

revoke all on function public.set_canonical_job_saved(uuid, uuid, uuid, boolean, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.set_canonical_job_saved(uuid, uuid, uuid, boolean, jsonb, timestamptz) to service_role;

create table if not exists public.saved_pursuits_migration_reconciliation (
  migration_version text primary key,
  before_counts jsonb not null,
  after_counts jsonb not null,
  reconciled_at timestamptz not null default now()
);

alter table public.saved_pursuits_migration_reconciliation enable row level security;
revoke all on public.saved_pursuits_migration_reconciliation from public, anon, authenticated;
grant select, insert, update on public.saved_pursuits_migration_reconciliation to service_role;

-- Existing-user conversion. It is safe to re-run: canonical uniqueness and deterministic
-- migration idempotency keys prevent duplicate pursuits or tracking facts.
do $$
declare
  v_before_saved_jobs bigint;
  v_before_pursuits bigint;
  v_before_overlap bigint;
  v_before_offer_status bigint;
  v_before_offer_events bigint;
  v_after_pursuits bigint;
  v_missing_saved_jobs bigint;
  v_migrated_tracking bigint;
begin
  select count(*) into v_before_saved_jobs from public.saved_jobs;
  select count(*) into v_before_pursuits from public.pursuits;
  select count(*) into v_before_overlap
  from public.saved_jobs
  join public.pursuits using (user_id, job_id);
  select count(*) into v_before_offer_status from public.pursuits where status = 'offer';
  select count(*) into v_before_offer_events from public.pursuit_events where event_type = 'offer';

  insert into public.pursuits (
    user_id,
    profile_id,
    job_id,
    status,
    notes,
    job_snapshot,
    last_activity_at,
    created_at,
    updated_at
  )
  select
    saved_jobs.user_id,
    saved_jobs.profile_id,
    saved_jobs.job_id,
    'saved',
    saved_jobs.notes,
    public.saved_pursuit_job_snapshot(saved_jobs.job_id, saved_jobs.user_id, saved_jobs.created_at),
    greatest(saved_jobs.created_at, saved_jobs.updated_at),
    saved_jobs.created_at,
    saved_jobs.updated_at
  from public.saved_jobs
  on conflict (user_id, job_id) do update
  set
    profile_id = coalesce(pursuits.profile_id, excluded.profile_id),
    notes = case
      when nullif(btrim(excluded.notes), '') is null then pursuits.notes
      when nullif(btrim(pursuits.notes), '') is null then excluded.notes
      when pursuits.notes = excluded.notes then pursuits.notes
      when strpos(pursuits.notes, excluded.notes) > 0 then pursuits.notes
      else pursuits.notes || E'\n\n' || excluded.notes
    end,
    job_snapshot = case
      when pursuits.job_snapshot = '{}'::jsonb then excluded.job_snapshot
      else pursuits.job_snapshot
    end,
    last_activity_at = greatest(pursuits.last_activity_at, excluded.last_activity_at),
    updated_at = greatest(pursuits.updated_at, excluded.updated_at);

  -- Backfill empty posting snapshots for pre-existing pursuits too.
  update public.pursuits
  set job_snapshot = public.saved_pursuit_job_snapshot(job_id, user_id, created_at)
  where job_id is not null and job_snapshot = '{}'::jsonb;

  -- Preserve mutable selection labels/narratives before profile-owned rows disappear.
  update public.pursuits as pursuits
  set selection_snapshot = jsonb_strip_nulls(jsonb_build_object(
    'roleTrackId', pursuits.selected_role_track_id,
    'roleTrackLabel', role_tracks.name,
    'roleTrackNarrative', role_tracks.core_positioning,
    'resumeId', pursuits.selected_resume_id,
    'resumeLabel', resumes.name,
    'workExampleId', pursuits.selected_work_example_id,
    'workExampleLabel', work_examples.title,
    'contactSuggestionIds', coalesce(selected_contacts.ids, '[]'::jsonb),
    'capturedAt', pursuits.updated_at
  ))
  from public.pursuits as source_pursuit
  left join public.role_tracks on role_tracks.id = source_pursuit.selected_role_track_id
  left join public.resumes on resumes.id = source_pursuit.selected_resume_id
  left join public.work_examples on work_examples.id = source_pursuit.selected_work_example_id
  left join lateral (
    select jsonb_agg(contact_suggestions.id order by contact_suggestions.created_at, contact_suggestions.id) as ids
    from public.contact_suggestions
    where contact_suggestions.pursuit_id = source_pursuit.id
      and contact_suggestions.selected_for_outreach = true
  ) as selected_contacts on true
  where pursuits.id = source_pursuit.id
    and pursuits.selection_snapshot = '{}'::jsonb;

  -- Event-backed facts retain their trustworthy legacy event timestamp.
  insert into public.pursuit_tracking_events (
    pursuit_id, user_id, action, checked, source, idempotency_key,
    occurred_at, occurred_at_known, created_at
  )
  select
    pursuit_events.pursuit_id,
    pursuit_events.user_id,
    case pursuit_events.event_type
      when 'outreach_sent' then 'outreach_sent'
      when 'applied' then 'applied_online'
      when 'responded' then 'response_received'
      when 'interviewing' then 'interviewing'
      when 'rejected' then 'not_moving_forward'
    end,
    true,
    'migration',
    'migration:legacy-pursuit-event:' || pursuit_events.id::text,
    pursuit_events.created_at,
    true,
    pursuit_events.created_at
  from public.pursuit_events
  join public.pursuits on pursuits.id = pursuit_events.pursuit_id
    and pursuits.user_id = pursuit_events.user_id
  where pursuit_events.event_type in (
    'outreach_sent', 'applied', 'responded', 'interviewing', 'rejected'
  )
  on conflict (pursuit_id, idempotency_key) do nothing;

  -- A scalar legacy status is still a valid current fact, but not a trustworthy date.
  insert into public.pursuit_tracking_events (
    pursuit_id, user_id, action, checked, source, idempotency_key,
    occurred_at, occurred_at_known, created_at
  )
  select
    pursuits.id,
    pursuits.user_id,
    case pursuits.status
      when 'outreach_sent' then 'outreach_sent'
      when 'applied' then 'applied_online'
      when 'responded' then 'response_received'
      when 'interviewing' then 'interviewing'
      when 'rejected' then 'not_moving_forward'
    end,
    true,
    'migration',
    'migration:legacy-scalar-status:' || pursuits.id::text || ':' || pursuits.status,
    pursuits.updated_at,
    false,
    clock_timestamp()
  from public.pursuits
  where pursuits.status in ('outreach_sent', 'applied', 'responded', 'interviewing', 'rejected')
    and not exists (
      select 1 from public.pursuit_tracking_events
      where pursuit_tracking_events.pursuit_id = pursuits.id
        and pursuit_tracking_events.action = case pursuits.status
          when 'outreach_sent' then 'outreach_sent'
          when 'applied' then 'applied_online'
          when 'responded' then 'response_received'
          when 'interviewing' then 'interviewing'
          when 'rejected' then 'not_moving_forward'
        end
    )
  on conflict (pursuit_id, idempotency_key) do nothing;

  update public.pursuits as pursuits
  set tracking_started_at = migrated.first_positive_at
  from (
    select pursuit_id, min(occurred_at) as first_positive_at
    from public.pursuit_tracking_events
    where checked = true
    group by pursuit_id
  ) as migrated
  where pursuits.id = migrated.pursuit_id
    and pursuits.tracking_started_at is null;

  select count(*) into v_after_pursuits from public.pursuits;
  select count(*) into v_missing_saved_jobs
  from public.saved_jobs
  left join public.pursuits using (user_id, job_id)
  where pursuits.id is null;
  select count(*) into v_migrated_tracking
  from public.pursuit_tracking_events where source = 'migration';

  if v_missing_saved_jobs <> 0 then
    raise exception using errcode = '23514', message = 'saved_pursuits_reconciliation_missing_canonical_rows';
  end if;

  if v_after_pursuits <> v_before_pursuits + (v_before_saved_jobs - v_before_overlap) then
    raise exception using errcode = '23514', message = 'saved_pursuits_reconciliation_count_mismatch';
  end if;

  insert into public.saved_pursuits_migration_reconciliation (
    migration_version, before_counts, after_counts, reconciled_at
  ) values (
    '20260718000300',
    jsonb_build_object(
      'savedJobs', v_before_saved_jobs,
      'pursuits', v_before_pursuits,
      'overlap', v_before_overlap,
      'legacyOfferStatuses', v_before_offer_status,
      'legacyOfferEvents', v_before_offer_events
    ),
    jsonb_build_object(
      'pursuits', v_after_pursuits,
      'missingCanonicalSavedJobs', v_missing_saved_jobs,
      'migratedTrackingEvents', v_migrated_tracking
    ),
    clock_timestamp()
  )
  on conflict (migration_version) do nothing;
end $$;

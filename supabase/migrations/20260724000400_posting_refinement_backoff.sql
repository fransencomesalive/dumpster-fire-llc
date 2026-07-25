create extension if not exists pgcrypto;

alter table public.jobs
  add column if not exists refinement_content_hash text,
  add column if not exists refinement_attempt_content_hash text,
  add column if not exists refinement_attempt_token uuid,
  add column if not exists refinement_attempted_at timestamptz,
  add column if not exists refinement_attempt_count integer not null default 0,
  add column if not exists refinement_no_fill_count integer not null default 0,
  add column if not exists refinement_outcome text,
  add column if not exists refinement_next_eligible_at timestamptz,
  add column if not exists refinement_state text not null default 'pending';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'jobs_refinement_counts_nonnegative'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs add constraint jobs_refinement_counts_nonnegative
      check (refinement_attempt_count >= 0 and refinement_no_fill_count >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'jobs_refinement_state_allowed'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs add constraint jobs_refinement_state_allowed
      check (refinement_state in (
        'pending', 'processing', 'retryable', 'partial', 'complete', 'exhausted'
      ));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'jobs_refinement_outcome_allowed'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs add constraint jobs_refinement_outcome_allowed
      check (
        refinement_outcome is null
        or refinement_outcome in (
          'complete', 'partial', 'no_fill', 'invalid', 'unavailable', 'error'
        )
      );
  end if;
end
$$;

create or replace function public.maintain_job_refinement_state()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_hash text;
  v_complete boolean;
begin
  v_hash := encode(
    digest(
      coalesce(new.title, '') || chr(31)
      || coalesce(new.company_name, '') || chr(31)
      || coalesce(new.description, ''),
      'sha256'
    ),
    'hex'
  );
  v_complete :=
    cardinality(coalesce(new.responsibilities, '{}'::text[])) > 0
    and cardinality(coalesce(new.required_experience, '{}'::text[])) > 0;

  if tg_op = 'INSERT'
    or old.refinement_content_hash is distinct from v_hash then
    new.refinement_content_hash := v_hash;
    new.refinement_attempt_content_hash := null;
    new.refinement_attempt_token := null;
    new.refinement_attempted_at := null;
    new.refinement_attempt_count := 0;
    new.refinement_no_fill_count := 0;
    new.refinement_outcome := null;
    new.refinement_next_eligible_at := case when v_complete then null else now() end;
    new.refinement_state := case when v_complete then 'complete' else 'pending' end;
  elsif v_complete then
    new.refinement_state := 'complete';
    new.refinement_next_eligible_at := null;
  end if;

  return new;
end
$$;

drop trigger if exists jobs_maintain_refinement_state on public.jobs;
create trigger jobs_maintain_refinement_state
before insert or update of title, company_name, description, responsibilities, required_experience
on public.jobs
for each row execute function public.maintain_job_refinement_state();

update public.jobs
set refinement_content_hash = encode(
      digest(
        coalesce(title, '') || chr(31)
        || coalesce(company_name, '') || chr(31)
        || coalesce(description, ''),
        'sha256'
      ),
      'hex'
    ),
    refinement_state = case
      when cardinality(coalesce(responsibilities, '{}'::text[])) > 0
        and cardinality(coalesce(required_experience, '{}'::text[])) > 0
        then 'complete'
      else 'pending'
    end,
    refinement_next_eligible_at = case
      when cardinality(coalesce(responsibilities, '{}'::text[])) > 0
        and cardinality(coalesce(required_experience, '{}'::text[])) > 0
        then null
      else now()
    end
where refinement_content_hash is null;

create index if not exists jobs_refinement_queue_idx
  on public.jobs(refinement_next_eligible_at, scraped_at desc)
  where owner_user_id is null
    and refinement_state in ('pending', 'processing', 'retryable');

create or replace function public.claim_posting_refinement(
  p_now timestamptz,
  p_processing_lease interval default interval '15 minutes'
)
returns table (
  id uuid,
  title text,
  company_name text,
  description text,
  responsibilities text[],
  required_experience text[],
  attempt_token uuid,
  attempt_content_hash text,
  attempt_count integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_job_id uuid;
begin
  select jobs.id
  into v_job_id
  from public.jobs
  where jobs.owner_user_id is null
    and (
      cardinality(coalesce(jobs.responsibilities, '{}'::text[])) = 0
      or cardinality(coalesce(jobs.required_experience, '{}'::text[])) = 0
    )
    and (
      jobs.refinement_state = 'pending'
      or (
        jobs.refinement_state = 'retryable'
        and jobs.refinement_next_eligible_at <= p_now
      )
      or (
        jobs.refinement_state = 'processing'
        and jobs.refinement_next_eligible_at <= p_now
      )
    )
  order by jobs.refinement_next_eligible_at asc nulls first, jobs.scraped_at desc
  for update skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  return query
  update public.jobs
  set refinement_state = 'processing',
      refinement_attempted_at = p_now,
      refinement_attempt_count = refinement_attempt_count + 1,
      refinement_attempt_content_hash = refinement_content_hash,
      refinement_attempt_token = gen_random_uuid(),
      refinement_next_eligible_at = p_now + p_processing_lease
  where jobs.id = v_job_id
  returning
    jobs.id,
    jobs.title,
    jobs.company_name,
    jobs.description,
    jobs.responsibilities,
    jobs.required_experience,
    jobs.refinement_attempt_token,
    jobs.refinement_attempt_content_hash,
    jobs.refinement_attempt_count;
end
$$;

create or replace function public.finish_posting_refinement(
  p_job_id uuid,
  p_attempt_token uuid,
  p_attempt_content_hash text,
  p_outcome text,
  p_responsibilities text[],
  p_required_experience text[],
  p_now timestamptz
)
returns table (
  applied boolean,
  refinement_state text,
  refinement_outcome text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs%rowtype;
  v_responsibilities text[];
  v_required_experience text[];
  v_no_fill_count integer;
  v_state text;
  v_next timestamptz;
begin
  if p_outcome not in (
    'complete', 'partial', 'no_fill', 'invalid', 'unavailable', 'error'
  ) then
    raise exception using errcode = '22023', message = 'invalid_refinement_outcome';
  end if;

  select * into v_job
  from public.jobs
  where jobs.id = p_job_id
  for update;

  if not found
    or v_job.refinement_state <> 'processing'
    or v_job.refinement_attempt_token is distinct from p_attempt_token
    or v_job.refinement_attempt_content_hash is distinct from p_attempt_content_hash
    or v_job.refinement_content_hash is distinct from p_attempt_content_hash then
    return query select false, coalesce(v_job.refinement_state, 'missing'), v_job.refinement_outcome;
    return;
  end if;

  v_responsibilities := case
    when cardinality(coalesce(v_job.responsibilities, '{}'::text[])) > 0
      then v_job.responsibilities
    else coalesce(p_responsibilities, '{}'::text[])
  end;
  v_required_experience := case
    when cardinality(coalesce(v_job.required_experience, '{}'::text[])) > 0
      then v_job.required_experience
    else coalesce(p_required_experience, '{}'::text[])
  end;
  v_no_fill_count := v_job.refinement_no_fill_count
    + case when p_outcome in ('no_fill', 'invalid') then 1 else 0 end;

  if cardinality(v_responsibilities) > 0
    and cardinality(v_required_experience) > 0 then
    v_state := 'complete';
    v_next := null;
  elsif p_outcome = 'partial'
    and (
      cardinality(v_responsibilities) > 0
      or cardinality(v_required_experience) > 0
    ) then
    v_state := 'partial';
    v_next := null;
  elsif v_no_fill_count >= 3 then
    v_state := 'exhausted';
    v_next := null;
  else
    v_state := 'retryable';
    v_next := p_now + make_interval(
      secs => 900 * power(2, least(greatest(v_job.refinement_attempt_count - 1, 0), 6))::integer
    );
  end if;

  update public.jobs
  set responsibilities = v_responsibilities,
      required_experience = v_required_experience,
      refinement_no_fill_count = v_no_fill_count,
      refinement_outcome = p_outcome,
      refinement_state = v_state,
      refinement_next_eligible_at = v_next,
      refinement_attempt_token = null,
      updated_at = p_now
  where jobs.id = p_job_id;

  return query select true, v_state, p_outcome;
end
$$;

revoke all on function public.claim_posting_refinement(timestamptz, interval)
  from public, anon, authenticated;
grant execute on function public.claim_posting_refinement(timestamptz, interval)
  to service_role;

revoke all on function public.finish_posting_refinement(
  uuid, uuid, text, text, text[], text[], timestamptz
) from public, anon, authenticated;
grant execute on function public.finish_posting_refinement(
  uuid, uuid, text, text, text[], text[], timestamptz
) to service_role;

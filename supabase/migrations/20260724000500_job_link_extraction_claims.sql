create extension if not exists pgcrypto;

create table if not exists public.job_link_extraction_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_url_hash text not null check (source_url_hash ~ '^[0-9a-f]{64}$'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  state text not null check (
    state in ('claimed', 'retryable', 'succeeded', 'exhausted')
  ),
  claim_token uuid,
  claimed_at timestamptz,
  next_eligible_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  no_fill_count integer not null default 0 check (no_fill_count >= 0),
  last_outcome text check (
    last_outcome is null
    or last_outcome in ('success', 'no_fill', 'invalid', 'unavailable', 'error')
  ),
  job_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (state = 'claimed' and claim_token is not null and next_eligible_at is not null)
    or (state <> 'claimed' and claim_token is null)
  ),
  check (
    (state = 'succeeded' and job_id is not null)
    or (state <> 'succeeded' and job_id is null)
  ),
  unique (user_id, source_url_hash, content_hash)
);

create index if not exists job_link_extraction_claims_retry_idx
  on public.job_link_extraction_claims(next_eligible_at)
  where state in ('claimed', 'retryable');

alter table public.job_link_extraction_claims enable row level security;
revoke all on table public.job_link_extraction_claims
  from public, anon, authenticated;
grant select, insert, update on table public.job_link_extraction_claims
  to service_role;

create or replace function public.claim_job_link_extraction(
  p_user_id uuid,
  p_source_url_hash text,
  p_content_hash text,
  p_now timestamptz,
  p_lease interval default interval '5 minutes'
)
returns table (
  claimed boolean,
  claim_token uuid,
  claim_state text,
  attempt_count integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_claim public.job_link_extraction_claims%rowtype;
  v_token uuid;
begin
  if p_source_url_hash !~ '^[0-9a-f]{64}$'
    or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_extraction_claim_hash';
  end if;

  v_token := gen_random_uuid();
  insert into public.job_link_extraction_claims (
    user_id,
    source_url_hash,
    content_hash,
    state,
    claim_token,
    claimed_at,
    next_eligible_at,
    attempt_count,
    updated_at
  ) values (
    p_user_id,
    p_source_url_hash,
    p_content_hash,
    'claimed',
    v_token,
    p_now,
    p_now + p_lease,
    1,
    p_now
  )
  on conflict (user_id, source_url_hash, content_hash) do nothing
  returning * into v_claim;

  if found then
    return query select true, v_claim.claim_token, v_claim.state, v_claim.attempt_count;
    return;
  end if;

  select * into v_claim
  from public.job_link_extraction_claims
  where user_id = p_user_id
    and source_url_hash = p_source_url_hash
    and content_hash = p_content_hash
  for update;

  if v_claim.state in ('succeeded', 'exhausted')
    or v_claim.next_eligible_at > p_now then
    return query select false, null::uuid, v_claim.state, v_claim.attempt_count;
    return;
  end if;

  update public.job_link_extraction_claims
  set state = 'claimed',
      claim_token = v_token,
      claimed_at = p_now,
      next_eligible_at = p_now + p_lease,
      attempt_count = job_link_extraction_claims.attempt_count + 1,
      updated_at = p_now
  where id = v_claim.id
  returning * into v_claim;

  return query select true, v_claim.claim_token, v_claim.state, v_claim.attempt_count;
end
$$;

create or replace function public.finish_job_link_extraction(
  p_user_id uuid,
  p_source_url_hash text,
  p_content_hash text,
  p_claim_token uuid,
  p_outcome text,
  p_job_id uuid,
  p_now timestamptz
)
returns table (
  applied boolean,
  claim_state text,
  last_outcome text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_claim public.job_link_extraction_claims%rowtype;
  v_no_fill_count integer;
  v_state text;
  v_next timestamptz;
begin
  if p_outcome not in ('success', 'no_fill', 'invalid', 'unavailable', 'error') then
    raise exception using errcode = '22023', message = 'invalid_extraction_outcome';
  end if;
  if p_outcome = 'success' and p_job_id is null then
    raise exception using errcode = '22023', message = 'successful_extraction_requires_job';
  end if;
  if p_outcome = 'success' and not exists (
    select 1
    from public.jobs
    where jobs.id = p_job_id
      and jobs.owner_user_id = p_user_id
      and jobs.source = 'user_link'
      and jobs.source_content_hash = p_content_hash
      and encode(digest(jobs.source_url, 'sha256'), 'hex') = p_source_url_hash
  ) then
    raise exception using errcode = '22023', message = 'extraction_job_mismatch';
  end if;

  select * into v_claim
  from public.job_link_extraction_claims
  where user_id = p_user_id
    and source_url_hash = p_source_url_hash
    and content_hash = p_content_hash
  for update;

  if not found
    or v_claim.state <> 'claimed'
    or v_claim.claim_token is distinct from p_claim_token then
    return query select false, coalesce(v_claim.state, 'missing'), v_claim.last_outcome;
    return;
  end if;

  v_no_fill_count := v_claim.no_fill_count
    + case when p_outcome in ('no_fill', 'invalid') then 1 else 0 end;

  if p_outcome = 'success' then
    v_state := 'succeeded';
    v_next := null;
  elsif v_no_fill_count >= 3 then
    v_state := 'exhausted';
    v_next := null;
  else
    v_state := 'retryable';
    v_next := p_now + make_interval(
      secs => 900 * power(2, least(greatest(v_claim.attempt_count - 1, 0), 6))::integer
    );
  end if;

  update public.job_link_extraction_claims
  set state = v_state,
      claim_token = null,
      next_eligible_at = v_next,
      no_fill_count = v_no_fill_count,
      last_outcome = p_outcome,
      job_id = case when p_outcome = 'success' then p_job_id else job_id end,
      updated_at = p_now
  where id = v_claim.id;

  return query select true, v_state, p_outcome;
end
$$;

revoke all on function public.claim_job_link_extraction(
  uuid, text, text, timestamptz, interval
) from public, anon, authenticated;
grant execute on function public.claim_job_link_extraction(
  uuid, text, text, timestamptz, interval
) to service_role;

revoke all on function public.finish_job_link_extraction(
  uuid, text, text, uuid, text, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.finish_job_link_extraction(
  uuid, text, text, uuid, text, uuid, timestamptz
) to service_role;

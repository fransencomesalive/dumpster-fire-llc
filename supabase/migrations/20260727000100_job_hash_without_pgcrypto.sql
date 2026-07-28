-- Paste-a-link and every other job write failed in production with
--   42883: function digest(text, unknown) does not exist
--
-- Two functions added on 2026-07-24 hash text with pgcrypto's digest() while
-- pinning `search_path = public, pg_temp`. Supabase installs pgcrypto into the
-- `extensions` schema, which that locked search_path cannot see, so the call is
-- unresolvable at runtime. `public.maintain_job_refinement_state` is a BEFORE
-- INSERT OR UPDATE trigger on public.jobs, so the failure blocked every job
-- insert, not just pasted links.
--
-- Both functions now use the core `sha256(bytea)` built-in, which lives in
-- pg_catalog and is always resolvable regardless of search_path or which schema
-- holds pgcrypto. `encode(sha256(convert_to(t, 'UTF8')), 'hex')` returns exactly
-- the same digest as `encode(digest(t, 'sha256'), 'hex')` for UTF-8 text, so all
-- previously stored hashes stay valid and no rehash or backfill is required.
--
-- Neither function's signature, security mode, search_path, or behavior changes.

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
    sha256(
      convert_to(
        coalesce(new.title, '') || chr(31)
        || coalesce(new.company_name, '') || chr(31)
        || coalesce(new.description, ''),
        'UTF8'
      )
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
      and encode(sha256(convert_to(jobs.source_url, 'UTF8')), 'hex') = p_source_url_hash
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

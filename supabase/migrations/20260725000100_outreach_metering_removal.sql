-- Phase 2C: make Apply Wizard the only retail usage counter.
--
-- Historical pursuit and outreach_message ledger rows remain intact for audit.
-- New initial outreach requests retain their atomic/idempotent persistence
-- boundary, but they require the pursuit's successful Apply Wizard latch and
-- write no pursuit or outreach_message debit.

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select pg_constraint.conname
    from pg_constraint
    where pg_constraint.conrelid =
      'public.pursuit_outreach_generation_requests'::regclass
      and pg_constraint.contype = 'c'
      and pg_get_constraintdef(pg_constraint.oid) ~
        '\moutreach_debit_quantity\M'
  loop
    execute format(
      'alter table public.pursuit_outreach_generation_requests drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$$;

alter table public.pursuit_outreach_generation_requests
  add constraint pursuit_outreach_debit_quantity_check
  check (outreach_debit_quantity >= 0);

-- Only Apply Wizard is a retail quota. The other usage types remain valid
-- historical/diagnostic ledger values but no longer participate in quota
-- enforcement.
create or replace function public.enforce_usage_ledger_quota()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_plan_id uuid;
  v_source text;
  v_status text;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_limit integer;
  v_used integer;
begin
  if new.usage_type <> 'apply_wizard' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('subscription-quota:' || new.user_id::text, 0)
  );

  select
    subscriptions.plan_id,
    subscriptions.source,
    subscriptions.status,
    subscriptions.current_period_start,
    subscriptions.current_period_end,
    plans.apply_wizard_limit_monthly
  into
    v_plan_id,
    v_source,
    v_status,
    v_period_start,
    v_period_end,
    v_limit
  from public.user_subscriptions as subscriptions
  join public.subscription_plans as plans
    on plans.id = subscriptions.plan_id
  where subscriptions.user_id = new.user_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'subscription_missing';
  end if;

  if v_status not in ('active', 'trialing') then
    raise exception using
      errcode = 'P0001',
      message = 'subscription_inactive:' || coalesce(v_status, 'canceled');
  end if;

  if v_source = 'stripe' then
    if v_period_start is null or v_period_end is null then
      raise exception using
        errcode = '22023',
        message = 'subscription_period_missing';
    end if;

    if new.created_at < v_period_start or new.created_at >= v_period_end then
      raise exception using
        errcode = '22023',
        message = 'subscription_period_mismatch';
    end if;
  else
    v_period_start := (
      date_trunc('month', new.created_at at time zone 'UTC')
      at time zone 'UTC'
    );
    v_period_end := v_period_start + interval '1 month';
  end if;

  if v_period_end <= v_period_start then
    raise exception using
      errcode = '22023',
      message = 'subscription_period_invalid';
  end if;

  if new.plan_id is not null and new.plan_id <> v_plan_id then
    raise exception using
      errcode = '23514',
      message = 'usage_plan_mismatch';
  end if;
  new.plan_id := v_plan_id;

  if v_limit is null then
    return new;
  end if;

  select coalesce(sum(usage_ledger.quantity), 0)::integer
  into v_used
  from public.usage_ledger
  where usage_ledger.user_id = new.user_id
    and usage_ledger.usage_type = 'apply_wizard'
    and usage_ledger.created_at >= v_period_start
    and usage_ledger.created_at < v_period_end;

  if v_used + new.quantity > v_limit then
    raise exception using
      errcode = 'P0001',
      message = 'apply_wizard_limit_reached:' || v_used || ':' || v_limit;
  end if;

  return new;
end;
$$;

create or replace function public.persist_initial_outreach_generation(
  p_pursuit_id uuid,
  p_user_id uuid,
  p_messages jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_pursuit public.pursuits%rowtype;
  v_request public.pursuit_outreach_generation_requests%rowtype;
  v_now timestamptz := clock_timestamp();
  v_from_status text;
  v_to_status text;
  v_message_count integer;
  v_messages jsonb;
  v_contact_ids jsonb;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'user_id is required';
  end if;

  p_idempotency_key := btrim(coalesce(p_idempotency_key, ''));
  if length(p_idempotency_key) not between 1 and 220 then
    raise exception using errcode = '22023', message = 'idempotency_key must contain 1 to 220 characters';
  end if;

  if p_messages is null
    or jsonb_typeof(p_messages) <> 'array'
    or jsonb_array_length(p_messages) = 0
  then
    raise exception using errcode = '22023', message = 'messages must be a non-empty JSON array';
  end if;
  v_message_count := jsonb_array_length(p_messages);

  if exists (
    select 1
    from jsonb_array_elements(p_messages) as message(value)
    where jsonb_typeof(message.value) <> 'object'
      or length(btrim(coalesce(message.value ->> 'message', ''))) = 0
      or coalesce(message.value ->> 'recipient_type', '') not in (
        'likely_hiring_manager',
        'functional_leader',
        'recruiter',
        'executive_sponsor',
        'no_contact'
      )
      or coalesce(nullif(message.value ->> 'channel', ''), 'other') not in (
        'linkedin_connection',
        'linkedin_dm',
        'email',
        'other'
      )
  ) then
    raise exception using errcode = '22023', message = 'each message requires text and a supported recipient_type and channel';
  end if;

  select pursuits.*
  into v_pursuit
  from public.pursuits
  where pursuits.id = p_pursuit_id
    and pursuits.user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'owned pursuit not found';
  end if;

  if v_pursuit.status in ('expired', 'deleted') then
    raise exception using errcode = '22023', message = 'cannot persist outreach for an inactive pursuit';
  end if;

  select pursuit_outreach_generation_requests.*
  into v_request
  from public.pursuit_outreach_generation_requests
  where pursuit_outreach_generation_requests.pursuit_id = p_pursuit_id
    and pursuit_outreach_generation_requests.idempotency_key = p_idempotency_key;

  if found then
    if v_request.user_id <> p_user_id or v_request.request_payload <> p_messages then
      raise exception using errcode = '22023', message = 'idempotency_key was already used for a different outreach generation';
    end if;

    select coalesce(
      jsonb_agg(to_jsonb(outreach_messages) order by outreach_messages.created_at, outreach_messages.id),
      '[]'::jsonb
    )
    into v_messages
    from public.outreach_messages
    where outreach_messages.generation_request_id = v_request.id;

    return jsonb_build_object(
      'status', 'outreach_generated',
      'pursuit', to_jsonb(v_pursuit),
      'messages', v_messages,
      'pursuitDebited', v_request.pursuit_debit_added,
      'outreachDebited', v_request.outreach_debit_quantity,
      'replayed', true
    );
  end if;

  -- Persisted useful contacts and the immutable latch are the entitlement
  -- evidence for outreach. A new request cannot create messages before the
  -- atomic Apply Wizard transaction succeeds.
  if v_pursuit.apply_wizard_metered_at is null then
    raise exception using
      errcode = '23514',
      message = 'apply_wizard_latch_required_for_outreach';
  end if;

  -- A supplied contact must belong to this pursuit. A null contact is valid only
  -- for the explicit no-contact recipient path.
  if exists (
    select 1
    from jsonb_array_elements(p_messages) as message(value)
    where (
      nullif(message.value ->> 'contact_suggestion_id', '') is null
      and message.value ->> 'recipient_type' <> 'no_contact'
    )
    or (
      nullif(message.value ->> 'contact_suggestion_id', '') is not null
      and not exists (
        select 1
        from public.contact_suggestions
        where contact_suggestions.id = (message.value ->> 'contact_suggestion_id')::uuid
          and contact_suggestions.pursuit_id = p_pursuit_id
      )
    )
  ) then
    raise exception using errcode = '22023', message = 'each supplied contact must belong to the pursuit';
  end if;

  if exists (
    select 1
    from (
      select nullif(message.value ->> 'contact_suggestion_id', '') as contact_id
      from jsonb_array_elements(p_messages) as message(value)
      where nullif(message.value ->> 'contact_suggestion_id', '') is not null
      group by nullif(message.value ->> 'contact_suggestion_id', '')
      having count(*) > 1
    ) as duplicate_contacts
  ) then
    raise exception using errcode = '22023', message = 'messages cannot contain a duplicate contact';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_messages) as message(value)
    join public.outreach_messages
      on outreach_messages.pursuit_id = p_pursuit_id
      and outreach_messages.contact_suggestion_id = (message.value ->> 'contact_suggestion_id')::uuid
    where nullif(message.value ->> 'contact_suggestion_id', '') is not null
  ) then
    raise exception using errcode = '23505', message = 'outreach already exists for a supplied contact';
  end if;

  insert into public.pursuit_outreach_generation_requests (
    pursuit_id,
    user_id,
    idempotency_key,
    request_payload,
    pursuit_debit_added,
    outreach_debit_quantity,
    persisted_at
  ) values (
    p_pursuit_id,
    p_user_id,
    p_idempotency_key,
    p_messages,
    false,
    0,
    v_now
  )
  returning pursuit_outreach_generation_requests.* into v_request;

  insert into public.outreach_messages (
    id,
    pursuit_id,
    contact_suggestion_id,
    channel,
    recipient_type,
    message,
    selected_resume_id,
    selected_role_track_id,
    selected_work_example_id,
    status,
    generation_request_id,
    created_at,
    updated_at
  )
  select
    coalesce(nullif(message.value ->> 'id', '')::uuid, gen_random_uuid()),
    p_pursuit_id,
    nullif(message.value ->> 'contact_suggestion_id', '')::uuid,
    coalesce(nullif(message.value ->> 'channel', ''), 'other'),
    message.value ->> 'recipient_type',
    message.value ->> 'message',
    nullif(message.value ->> 'selected_resume_id', '')::uuid,
    nullif(message.value ->> 'selected_role_track_id', '')::uuid,
    nullif(message.value ->> 'selected_work_example_id', '')::uuid,
    'draft',
    v_request.id,
    v_now,
    v_now
  from jsonb_array_elements(p_messages) as message(value);

  v_from_status := v_pursuit.status;
  v_to_status := case
    when v_from_status in ('discovered', 'saved', 'review_complete', 'human_path_generated') then 'outreach_ready'
    else v_from_status
  end;

  update public.pursuits
  set
    status = v_to_status,
    last_activity_at = v_now,
    updated_at = v_now
  where pursuits.id = p_pursuit_id
    and pursuits.user_id = p_user_id
  returning pursuits.* into v_pursuit;

  select coalesce(
    jsonb_agg(to_jsonb(contact_ids.contact_id) order by contact_ids.ordinality),
    '[]'::jsonb
  )
  into v_contact_ids
  from (
    select
      nullif(message.value ->> 'contact_suggestion_id', '')::uuid as contact_id,
      message.ordinality
    from jsonb_array_elements(p_messages) with ordinality as message(value, ordinality)
    where nullif(message.value ->> 'contact_suggestion_id', '') is not null
  ) as contact_ids;

  insert into public.pursuit_events (
    pursuit_id,
    user_id,
    event_type,
    from_status,
    to_status,
    usage_type,
    payload,
    created_at
  ) values (
    p_pursuit_id,
    p_user_id,
    'outreach_generated',
    v_from_status,
    v_to_status,
    null,
    jsonb_build_object(
      'contactIds', v_contact_ids,
      'messageCount', v_message_count
    ),
    v_now
  );

  select coalesce(
    jsonb_agg(to_jsonb(outreach_messages) order by outreach_messages.created_at, outreach_messages.id),
    '[]'::jsonb
  )
  into v_messages
  from public.outreach_messages
  where outreach_messages.generation_request_id = v_request.id;

  return jsonb_build_object(
    'status', 'outreach_generated',
    'pursuit', to_jsonb(v_pursuit),
    'messages', v_messages,
    'pursuitDebited', false,
    'outreachDebited', 0,
    'replayed', false
  );
end;
$$;

revoke all on function public.enforce_usage_ledger_quota()
  from public, anon, authenticated;
revoke all on function public.persist_initial_outreach_generation(uuid, uuid, jsonb, text)
  from public, anon, authenticated;

grant execute on function public.persist_initial_outreach_generation(uuid, uuid, jsonb, text)
  to service_role;

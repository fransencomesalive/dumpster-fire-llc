-- Close the two remaining multi-write boundaries in Apply Wizard:
-- contact selection and one-time outreach regeneration. Both functions are
-- service-role only, re-check ownership inside the transaction, and make an
-- exact client retry safe after a committed response is lost.

create table if not exists public.pursuit_outreach_regeneration_requests (
  id uuid primary key default gen_random_uuid(),
  pursuit_id uuid not null references public.pursuits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.outreach_messages(id) on delete cascade,
  idempotency_key text not null check (
    length(btrim(idempotency_key)) between 1 and 200
  ),
  previous_message text not null,
  generated_message text not null,
  persisted_at timestamptz not null default now(),
  unique (message_id),
  unique (pursuit_id, idempotency_key)
);

alter table public.pursuit_outreach_regeneration_requests enable row level security;

alter table public.usage_ledger
  add column if not exists outreach_regeneration_request_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'usage_ledger_outreach_regeneration_request_fk'
      and conrelid = 'public.usage_ledger'::regclass
  ) then
    alter table public.usage_ledger
      add constraint usage_ledger_outreach_regeneration_request_fk
      foreign key (outreach_regeneration_request_id)
      references public.pursuit_outreach_regeneration_requests(id)
      on delete set null;
  end if;
end $$;

create unique index if not exists usage_ledger_outreach_regeneration_request_idx
  on public.usage_ledger(outreach_regeneration_request_id)
  where usage_type = 'outreach_message'
    and outreach_regeneration_request_id is not null;

create or replace function public.persist_pursuit_contact_selection(
  p_pursuit_id uuid,
  p_user_id uuid,
  p_contact_ids uuid[],
  p_updated_at timestamptz
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_pursuit public.pursuits%rowtype;
  v_from_status text;
  v_requested_ids uuid[];
  v_selected_ids uuid[];
  v_now timestamptz := coalesce(p_updated_at, clock_timestamp());
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'user_id is required';
  end if;

  if p_contact_ids is null or cardinality(p_contact_ids) = 0 then
    raise exception using errcode = '22023', message = 'contact_ids must be non-empty';
  end if;
  if array_position(p_contact_ids, null) is not null then
    raise exception using errcode = '22023', message = 'contact_ids cannot contain null';
  end if;

  select array_agg(contact_id order by contact_id)
  into v_requested_ids
  from (
    select distinct unnest(p_contact_ids) as contact_id
  ) requested;

  if cardinality(v_requested_ids) <> cardinality(p_contact_ids) then
    raise exception using errcode = '22023', message = 'contact_ids cannot contain duplicates';
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
  if v_pursuit.status not in ('human_path_generated', 'outreach_ready') then
    raise exception using errcode = '22023', message = 'invalid pursuit state for contact selection';
  end if;

  if (
    select count(*)
    from public.contact_suggestions
    where contact_suggestions.pursuit_id = p_pursuit_id
      and contact_suggestions.id = any(v_requested_ids)
  ) <> cardinality(v_requested_ids) then
    raise exception using errcode = '22023', message = 'every contact must belong to the pursuit';
  end if;

  select coalesce(array_agg(contact_suggestions.id order by contact_suggestions.id), '{}'::uuid[])
  into v_selected_ids
  from public.contact_suggestions
  where contact_suggestions.pursuit_id = p_pursuit_id
    and contact_suggestions.selected_for_outreach = true;

  if v_pursuit.status = 'outreach_ready' and v_selected_ids = v_requested_ids then
    return jsonb_build_object(
      'status', 'contacts_selected',
      'pursuit', to_jsonb(v_pursuit),
      'replayed', true
    );
  end if;

  v_from_status := v_pursuit.status;

  update public.contact_suggestions
  set
    selected_for_outreach = contact_suggestions.id = any(v_requested_ids),
    updated_at = v_now
  where contact_suggestions.pursuit_id = p_pursuit_id;

  update public.pursuits
  set
    status = 'outreach_ready',
    last_activity_at = v_now,
    updated_at = v_now
  where pursuits.id = p_pursuit_id
    and pursuits.user_id = p_user_id
  returning pursuits.* into v_pursuit;

  insert into public.pursuit_events (
    pursuit_id,
    user_id,
    event_type,
    from_status,
    to_status,
    payload,
    created_at
  ) values (
    p_pursuit_id,
    p_user_id,
    'contacts_selected',
    v_from_status,
    'outreach_ready',
    jsonb_build_object('contactIds', to_jsonb(p_contact_ids)),
    v_now
  );

  return jsonb_build_object(
    'status', 'contacts_selected',
    'pursuit', to_jsonb(v_pursuit),
    'replayed', false
  );
end;
$$;

create or replace function public.persist_outreach_regeneration(
  p_pursuit_id uuid,
  p_user_id uuid,
  p_message_id uuid,
  p_previous_message text,
  p_message text,
  p_generation_context jsonb,
  p_updated_at timestamptz,
  p_idempotency_key text,
  p_charge_usage boolean
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_pursuit public.pursuits%rowtype;
  v_message public.outreach_messages%rowtype;
  v_request public.pursuit_outreach_regeneration_requests%rowtype;
  v_now timestamptz := coalesce(p_updated_at, clock_timestamp());
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'user_id is required';
  end if;
  p_idempotency_key := btrim(coalesce(p_idempotency_key, ''));
  if length(p_idempotency_key) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'idempotency_key must contain 1 to 200 characters';
  end if;
  if length(btrim(coalesce(p_message, ''))) = 0 then
    raise exception using errcode = '22023', message = 'message is required';
  end if;
  if p_generation_context is null or jsonb_typeof(p_generation_context) <> 'object' then
    raise exception using errcode = '22023', message = 'generation_context must be an object';
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
  if v_pursuit.status <> 'outreach_ready' then
    raise exception using errcode = '22023', message = 'invalid pursuit state for outreach regeneration';
  end if;

  select outreach_messages.*
  into v_message
  from public.outreach_messages
  where outreach_messages.id = p_message_id
    and outreach_messages.pursuit_id = p_pursuit_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'outreach message not found';
  end if;

  select pursuit_outreach_regeneration_requests.*
  into v_request
  from public.pursuit_outreach_regeneration_requests
  where pursuit_outreach_regeneration_requests.pursuit_id = p_pursuit_id
    and pursuit_outreach_regeneration_requests.idempotency_key = p_idempotency_key;

  if found then
    if v_request.user_id <> p_user_id or v_request.message_id <> p_message_id then
      raise exception using errcode = '22023', message = 'idempotency_key was already used for a different regeneration';
    end if;
    return jsonb_build_object(
      'status', 'outreach_regenerated',
      'pursuit', to_jsonb(v_pursuit),
      'message', to_jsonb(v_message),
      'replayed', true
    );
  end if;

  if coalesce(v_message.regeneration_count, 0) <> 0 then
    return jsonb_build_object(
      'status', 'already_regenerated',
      'pursuit', to_jsonb(v_pursuit),
      'replayed', false
    );
  end if;
  if v_message.message <> p_previous_message then
    raise exception using errcode = '40001', message = 'outreach message changed before regeneration persistence';
  end if;

  insert into public.pursuit_outreach_regeneration_requests (
    pursuit_id,
    user_id,
    message_id,
    idempotency_key,
    previous_message,
    generated_message,
    persisted_at
  ) values (
    p_pursuit_id,
    p_user_id,
    p_message_id,
    p_idempotency_key,
    p_previous_message,
    p_message,
    v_now
  )
  returning pursuit_outreach_regeneration_requests.* into v_request;

  update public.outreach_messages
  set
    message = p_message,
    previous_message = p_previous_message,
    regeneration_count = 1,
    regeneration_context = p_generation_context,
    status = 'draft',
    rejection_reason = null,
    updated_at = v_now
  where outreach_messages.id = p_message_id
    and outreach_messages.pursuit_id = p_pursuit_id
  returning outreach_messages.* into v_message;

  update public.pursuits
  set
    last_activity_at = v_now,
    updated_at = v_now
  where pursuits.id = p_pursuit_id
    and pursuits.user_id = p_user_id
  returning pursuits.* into v_pursuit;

  if coalesce(p_charge_usage, false) then
    insert into public.usage_ledger (
      user_id,
      usage_type,
      quantity,
      related_job_id,
      related_pursuit_id,
      outreach_regeneration_request_id,
      created_at
    ) values (
      p_user_id,
      'outreach_message',
      1,
      v_pursuit.job_id,
      p_pursuit_id,
      v_request.id,
      v_now
    );
  end if;

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
    v_pursuit.status,
    v_pursuit.status,
    case when coalesce(p_charge_usage, false) then 'outreach_message' else null end,
    jsonb_build_object(
      'contactIds',
      case
        when v_message.contact_suggestion_id is null then '[]'::jsonb
        else jsonb_build_array(v_message.contact_suggestion_id)
      end,
      'messageCount', 1,
      'previousMessageId', p_message_id,
      'regenerate', true
    ),
    v_now
  );

  return jsonb_build_object(
    'status', 'outreach_regenerated',
    'pursuit', to_jsonb(v_pursuit),
    'message', to_jsonb(v_message),
    'replayed', false
  );
end;
$$;

revoke all on function public.persist_pursuit_contact_selection(uuid, uuid, uuid[], timestamptz) from public;
revoke all on function public.persist_outreach_regeneration(uuid, uuid, uuid, text, text, jsonb, timestamptz, text, boolean) from public;

grant execute on function public.persist_pursuit_contact_selection(uuid, uuid, uuid[], timestamptz) to service_role;
grant execute on function public.persist_outreach_regeneration(uuid, uuid, uuid, text, text, jsonb, timestamptz, text, boolean) to service_role;

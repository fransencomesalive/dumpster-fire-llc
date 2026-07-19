-- Atomic mutation boundaries for Saved Pursuits tracking, message Copy, and
-- initial outreach persistence. These functions are intentionally service-role
-- only: the public API authenticates the user, then supplies the authenticated
-- user id while the functions enforce pursuit ownership again inside the same
-- transaction as the writes.

alter table public.pursuits
  add column if not exists pursuit_metered_at timestamptz;

-- Existing pursuit usage is authoritative. Backfill the latch without adding a
-- second debit so a pre-migration pursuit is never charged again.
update public.pursuits as p
set pursuit_metered_at = prior_usage.metered_at
from (
  select
    usage_ledger.user_id,
    usage_ledger.related_pursuit_id,
    min(usage_ledger.created_at) as metered_at
  from public.usage_ledger
  where usage_ledger.usage_type = 'pursuit'
    and usage_ledger.related_pursuit_id is not null
  group by usage_ledger.user_id, usage_ledger.related_pursuit_id
) as prior_usage
where p.id = prior_usage.related_pursuit_id
  and p.user_id = prior_usage.user_id
  and p.pursuit_metered_at is null;

create table if not exists public.pursuit_outreach_generation_requests (
  id uuid primary key default gen_random_uuid(),
  pursuit_id uuid not null references public.pursuits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null check (
    length(btrim(idempotency_key)) between 1 and 220
  ),
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'array'),
  pursuit_debit_added boolean not null default false,
  outreach_debit_quantity integer not null check (outreach_debit_quantity > 0),
  persisted_at timestamptz not null default now(),
  unique (pursuit_id, idempotency_key)
);

alter table public.pursuit_outreach_generation_requests enable row level security;

create table if not exists public.pursuit_tracking_mutation_requests (
  id uuid primary key default gen_random_uuid(),
  pursuit_id uuid not null references public.pursuits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null check (
    length(btrim(idempotency_key)) between 1 and 200
  ),
  requested jsonb not null check (
    jsonb_typeof(requested) = 'object'
    and requested <> '{}'::jsonb
  ),
  committed_at timestamptz not null default now(),
  unique (pursuit_id, idempotency_key)
);

alter table public.pursuit_tracking_mutation_requests enable row level security;

alter table public.outreach_messages
  add column if not exists generation_request_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'outreach_messages_generation_request_fk'
      and conrelid = 'public.outreach_messages'::regclass
  ) then
    alter table public.outreach_messages
      add constraint outreach_messages_generation_request_fk
      foreign key (generation_request_id)
      references public.pursuit_outreach_generation_requests(id)
      on delete set null;
  end if;
end $$;

alter table public.usage_ledger
  add column if not exists outreach_generation_request_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'usage_ledger_outreach_generation_request_fk'
      and conrelid = 'public.usage_ledger'::regclass
  ) then
    alter table public.usage_ledger
      add constraint usage_ledger_outreach_generation_request_fk
      foreign key (outreach_generation_request_id)
      references public.pursuit_outreach_generation_requests(id)
      on delete set null;
  end if;
end $$;

create unique index if not exists usage_ledger_outreach_generation_request_idx
  on public.usage_ledger(outreach_generation_request_id)
  where usage_type = 'outreach_message'
    and outreach_generation_request_id is not null;

create index if not exists outreach_messages_generation_request_idx
  on public.outreach_messages(generation_request_id, created_at asc, id asc)
  where generation_request_id is not null;

create or replace function public.mutate_pursuit_tracking(
  p_pursuit_id uuid,
  p_user_id uuid,
  p_requested jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_pursuit public.pursuits%rowtype;
  v_now timestamptz := clock_timestamp();
  v_action text;
  v_checked boolean;
  v_current boolean;
  v_action_key text;
  v_existing public.pursuit_tracking_events%rowtype;
  v_request public.pursuit_tracking_mutation_requests%rowtype;
  v_inserted_count integer := 0;
  v_positive_count integer := 0;
  v_all_events jsonb;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'user_id is required';
  end if;

  p_idempotency_key := btrim(coalesce(p_idempotency_key, ''));
  if length(p_idempotency_key) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'idempotency_key must contain 1 to 200 characters';
  end if;

  if p_requested is null
    or jsonb_typeof(p_requested) <> 'object'
    or p_requested = '{}'::jsonb
  then
    raise exception using errcode = '22023', message = 'requested must be a non-empty JSON object';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_requested) as requested(action)
    where requested.action not in (
      'outreach_sent',
      'applied_online',
      'response_received',
      'interviewing',
      'not_moving_forward',
      'never_heard_back'
    )
  ) then
    raise exception using errcode = '22023', message = 'requested contains an unsupported tracking action';
  end if;

  if exists (
    select 1
    from jsonb_each(p_requested) as requested(action, value)
    where jsonb_typeof(requested.value) <> 'boolean'
  ) then
    raise exception using errcode = '22023', message = 'each requested tracking value must be boolean';
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

  select pursuit_tracking_mutation_requests.*
  into v_request
  from public.pursuit_tracking_mutation_requests
  where pursuit_tracking_mutation_requests.pursuit_id = p_pursuit_id
    and pursuit_tracking_mutation_requests.idempotency_key = p_idempotency_key;

  if found then
    if v_request.user_id <> p_user_id or v_request.requested <> p_requested then
      raise exception using errcode = '22023', message = 'idempotency_key was already used for a different tracking mutation';
    end if;

    select coalesce(jsonb_agg(to_jsonb(pursuit_tracking_events) order by pursuit_tracking_events.occurred_at, pursuit_tracking_events.created_at, pursuit_tracking_events.id), '[]'::jsonb)
    into v_all_events
    from public.pursuit_tracking_events
    where pursuit_tracking_events.pursuit_id = p_pursuit_id
      and pursuit_tracking_events.user_id = p_user_id;

    return jsonb_build_object(
      'status', 'tracking_updated',
      'pursuit', to_jsonb(v_pursuit),
      'events', v_all_events,
      'replayed', true
    );
  end if;

  insert into public.pursuit_tracking_mutation_requests (
    pursuit_id,
    user_id,
    idempotency_key,
    requested,
    committed_at
  ) values (
    p_pursuit_id,
    p_user_id,
    p_idempotency_key,
    p_requested,
    v_now
  )
  returning pursuit_tracking_mutation_requests.* into v_request;

  foreach v_action in array array[
    'outreach_sent',
    'applied_online',
    'response_received',
    'interviewing',
    'not_moving_forward',
    'never_heard_back'
  ] loop
    if not (p_requested ? v_action) then
      continue;
    end if;

    v_checked := (p_requested ->> v_action)::boolean;
    v_action_key := p_idempotency_key || ':' || v_action;

    select pursuit_tracking_events.*
    into v_existing
    from public.pursuit_tracking_events
    where pursuit_tracking_events.pursuit_id = p_pursuit_id
      and pursuit_tracking_events.idempotency_key = v_action_key;

    if found then
      if v_existing.user_id <> p_user_id
        or v_existing.action <> v_action
        or v_existing.checked <> v_checked
        or v_existing.source <> 'manual'
      then
        raise exception using errcode = '22023', message = 'idempotency_key was already used for a different tracking mutation';
      end if;
      continue;
    end if;

    select pursuit_tracking_events.checked
    into v_current
    from public.pursuit_tracking_events
    where pursuit_tracking_events.pursuit_id = p_pursuit_id
      and pursuit_tracking_events.action = v_action
    order by
      pursuit_tracking_events.occurred_at desc,
      pursuit_tracking_events.created_at desc,
      pursuit_tracking_events.id desc
    limit 1;

    if coalesce(v_current, false) = v_checked then
      continue;
    end if;

    insert into public.pursuit_tracking_events (
      pursuit_id,
      user_id,
      action,
      checked,
      source,
      idempotency_key,
      occurred_at,
      created_at
    ) values (
      p_pursuit_id,
      p_user_id,
      v_action,
      v_checked,
      'manual',
      v_action_key,
      v_now,
      v_now
    )
    returning pursuit_tracking_events.* into v_existing;

    v_inserted_count := v_inserted_count + 1;
    if v_checked then
      v_positive_count := v_positive_count + 1;
    end if;
  end loop;

  if v_inserted_count > 0 then
    update public.pursuits
    set
      tracking_started_at = case
        when tracking_started_at is null and v_positive_count > 0 then v_now
        else tracking_started_at
      end,
      last_activity_at = v_now,
      updated_at = v_now
    where pursuits.id = p_pursuit_id
      and pursuits.user_id = p_user_id
    returning pursuits.* into v_pursuit;
  end if;

  select coalesce(jsonb_agg(to_jsonb(pursuit_tracking_events) order by pursuit_tracking_events.occurred_at, pursuit_tracking_events.created_at, pursuit_tracking_events.id), '[]'::jsonb)
  into v_all_events
  from public.pursuit_tracking_events
  where pursuit_tracking_events.pursuit_id = p_pursuit_id
    and pursuit_tracking_events.user_id = p_user_id;

  return jsonb_build_object(
    'status', 'tracking_updated',
    'pursuit', to_jsonb(v_pursuit),
    'events', v_all_events,
    'replayed', false
  );
end;
$$;

create or replace function public.record_outreach_message_copy(
  p_outreach_message_id uuid,
  p_user_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_pursuit public.pursuits%rowtype;
  v_message public.outreach_messages%rowtype;
  v_contact public.contact_suggestions%rowtype;
  v_event public.pursuit_tracking_events%rowtype;
  v_now timestamptz := clock_timestamp();
  v_action_key text;
  v_inserted boolean := false;
  v_all_events jsonb;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'user_id is required';
  end if;

  p_idempotency_key := btrim(coalesce(p_idempotency_key, ''));
  if length(p_idempotency_key) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'idempotency_key must contain 1 to 200 characters';
  end if;
  v_action_key := p_idempotency_key || ':outreach_sent';

  select pursuits.*
  into v_pursuit
  from public.pursuits
  join public.outreach_messages
    on outreach_messages.pursuit_id = pursuits.id
  where outreach_messages.id = p_outreach_message_id
    and pursuits.user_id = p_user_id
  for update of pursuits;

  if not found then
    raise exception using errcode = 'P0002', message = 'owned outreach message not found';
  end if;

  select outreach_messages.*
  into v_message
  from public.outreach_messages
  where outreach_messages.id = p_outreach_message_id
    and outreach_messages.pursuit_id = v_pursuit.id
  for update;

  if v_message.contact_suggestion_id is not null then
    select contact_suggestions.*
    into v_contact
    from public.contact_suggestions
    where contact_suggestions.id = v_message.contact_suggestion_id
      and contact_suggestions.pursuit_id = v_pursuit.id;

    if not found then
      raise exception using errcode = '23503', message = 'outreach message contact does not belong to its pursuit';
    end if;
  end if;

  select pursuit_tracking_events.*
  into v_event
  from public.pursuit_tracking_events
  where pursuit_tracking_events.pursuit_id = v_pursuit.id
    and pursuit_tracking_events.idempotency_key = v_action_key;

  if found and (
    v_event.user_id <> p_user_id
    or v_event.source <> 'message_copy'
    or v_event.action <> 'outreach_sent'
    or not v_event.checked
    or v_event.outreach_message_id <> p_outreach_message_id
  ) then
    raise exception using errcode = '22023', message = 'idempotency_key was already used for a different message copy';
  end if;

  if not found then
    select pursuit_tracking_events.*
    into v_event
    from public.pursuit_tracking_events
    where pursuit_tracking_events.pursuit_id = v_pursuit.id
      and pursuit_tracking_events.outreach_message_id = p_outreach_message_id
      and pursuit_tracking_events.source = 'message_copy'
      and pursuit_tracking_events.action = 'outreach_sent'
      and pursuit_tracking_events.checked = true;
  end if;

  if not found then
    insert into public.pursuit_tracking_events (
      pursuit_id,
      user_id,
      action,
      checked,
      source,
      outreach_message_id,
      contact_suggestion_id,
      message_snapshot,
      recipient_name_snapshot,
      recipient_title_snapshot,
      recipient_linkedin_url_snapshot,
      idempotency_key,
      occurred_at,
      created_at
    ) values (
      v_pursuit.id,
      p_user_id,
      'outreach_sent',
      true,
      'message_copy',
      v_message.id,
      v_message.contact_suggestion_id,
      v_message.message,
      case when v_message.contact_suggestion_id is null then null else v_contact.name end,
      case when v_message.contact_suggestion_id is null then null else v_contact.title end,
      case when v_message.contact_suggestion_id is null then null else v_contact.linkedin_url end,
      v_action_key,
      v_now,
      v_now
    )
    returning pursuit_tracking_events.* into v_event;
    v_inserted := true;

    update public.outreach_messages
    set
      status = 'sent',
      sent_at = coalesce(sent_at, v_now),
      updated_at = v_now
    where outreach_messages.id = v_message.id
    returning outreach_messages.* into v_message;

    update public.pursuits
    set
      tracking_started_at = coalesce(tracking_started_at, v_now),
      last_activity_at = v_now,
      updated_at = v_now
    where pursuits.id = v_pursuit.id
      and pursuits.user_id = p_user_id
    returning pursuits.* into v_pursuit;
  end if;

  select coalesce(jsonb_agg(to_jsonb(pursuit_tracking_events) order by pursuit_tracking_events.occurred_at, pursuit_tracking_events.created_at, pursuit_tracking_events.id), '[]'::jsonb)
  into v_all_events
  from public.pursuit_tracking_events
  where pursuit_tracking_events.pursuit_id = v_pursuit.id
    and pursuit_tracking_events.user_id = p_user_id;

  return jsonb_build_object(
    'status', 'message_copy_recorded',
    'pursuit', to_jsonb(v_pursuit),
    'events', v_all_events,
    'replayed', not v_inserted
  );
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
  v_prior_metered_at timestamptz;
  v_pursuit_debit_added boolean := false;
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

    select coalesce(jsonb_agg(to_jsonb(outreach_messages) order by outreach_messages.created_at, outreach_messages.id), '[]'::jsonb)
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
    outreach_debit_quantity,
    persisted_at
  ) values (
    p_pursuit_id,
    p_user_id,
    p_idempotency_key,
    p_messages,
    v_message_count,
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

  if v_pursuit.pursuit_metered_at is null then
    select min(usage_ledger.created_at)
    into v_prior_metered_at
    from public.usage_ledger
    where usage_ledger.user_id = p_user_id
      and usage_ledger.related_pursuit_id = p_pursuit_id
      and usage_ledger.usage_type = 'pursuit';

    if v_prior_metered_at is null then
      insert into public.usage_ledger (
        user_id,
        usage_type,
        quantity,
        related_job_id,
        related_pursuit_id,
        created_at
      ) values (
        p_user_id,
        'pursuit',
        1,
        v_pursuit.job_id,
        p_pursuit_id,
        v_now
      );
      v_prior_metered_at := v_now;
      v_pursuit_debit_added := true;
    end if;
  else
    v_prior_metered_at := v_pursuit.pursuit_metered_at;
  end if;

  insert into public.usage_ledger (
    user_id,
    usage_type,
    quantity,
    related_job_id,
    related_pursuit_id,
    outreach_generation_request_id,
    created_at
  ) values (
    p_user_id,
    'outreach_message',
    v_message_count,
    v_pursuit.job_id,
    p_pursuit_id,
    v_request.id,
    v_now
  );

  v_from_status := v_pursuit.status;
  v_to_status := case
    when v_from_status in ('discovered', 'saved', 'review_complete', 'human_path_generated') then 'outreach_ready'
    else v_from_status
  end;

  update public.pursuits
  set
    status = v_to_status,
    pursuit_metered_at = coalesce(pursuit_metered_at, v_prior_metered_at),
    last_activity_at = v_now,
    updated_at = v_now
  where pursuits.id = p_pursuit_id
    and pursuits.user_id = p_user_id
  returning pursuits.* into v_pursuit;

  select coalesce(jsonb_agg(to_jsonb(contact_ids.contact_id) order by contact_ids.ordinality), '[]'::jsonb)
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
    'outreach_message',
    jsonb_build_object(
      'contactIds', v_contact_ids,
      'messageCount', v_message_count
    ),
    v_now
  );

  update public.pursuit_outreach_generation_requests
  set pursuit_debit_added = v_pursuit_debit_added
  where pursuit_outreach_generation_requests.id = v_request.id
  returning pursuit_outreach_generation_requests.* into v_request;

  select coalesce(jsonb_agg(to_jsonb(outreach_messages) order by outreach_messages.created_at, outreach_messages.id), '[]'::jsonb)
  into v_messages
  from public.outreach_messages
  where outreach_messages.generation_request_id = v_request.id;

  return jsonb_build_object(
    'status', 'outreach_generated',
    'pursuit', to_jsonb(v_pursuit),
    'messages', v_messages,
    'pursuitDebited', v_request.pursuit_debit_added,
    'outreachDebited', v_request.outreach_debit_quantity,
    'replayed', false
  );
end;
$$;

revoke all on function public.mutate_pursuit_tracking(uuid, uuid, jsonb, text) from public;
revoke all on function public.record_outreach_message_copy(uuid, uuid, text) from public;
revoke all on function public.persist_initial_outreach_generation(uuid, uuid, jsonb, text) from public;

grant execute on function public.mutate_pursuit_tracking(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.record_outreach_message_copy(uuid, uuid, text) to service_role;
grant execute on function public.persist_initial_outreach_generation(uuid, uuid, jsonb, text) to service_role;

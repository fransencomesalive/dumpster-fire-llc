-- Phase 3 Stripe test-mode backend.
-- Persist only event identity/processing metadata and the normalized
-- subscription mirror. Full Stripe payloads and payment-method data are never
-- stored.

alter table public.user_subscriptions
  add column if not exists stripe_snapshot_retrieved_at timestamptz;

alter table public.user_subscriptions
  drop constraint if exists user_subscriptions_stripe_source_check;
alter table public.user_subscriptions
  add constraint user_subscriptions_stripe_source_check
  check (
    source = 'stripe'
    or (
      stripe_customer_id is null
      and stripe_subscription_id is null
      and stripe_price_id is null
      and stripe_status_raw is null
      and latest_invoice_id is null
      and last_stripe_event_created_at is null
      and stripe_snapshot_retrieved_at is null
      and cancel_at_period_end = false
    )
  );

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  object_id text,
  event_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'processing'
    check (processing_status in ('processing', 'processed', 'failed')),
  error_summary text,
  attempt_count integer not null default 1 check (attempt_count > 0)
);

alter table public.stripe_webhook_events enable row level security;
revoke all on table public.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update on table public.stripe_webhook_events to service_role;

-- Server-side billing reads use the service-role repository directly. Make the
-- required table privileges reproducible on a clean local or hosted database.
grant select on table
  public.user_subscriptions,
  public.subscription_plans,
  public.usage_ledger
to service_role;

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_object_id text,
  p_event_created_at timestamptz,
  p_received_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.stripe_webhook_events%rowtype;
  v_inserted integer;
begin
  if nullif(trim(p_event_id), '') is null
    or nullif(trim(p_event_type), '') is null
    or p_event_created_at is null
    or p_received_at is null then
    raise exception using errcode = '22023', message = 'invalid_stripe_event_claim';
  end if;

  insert into public.stripe_webhook_events (
    event_id,
    event_type,
    object_id,
    event_created_at,
    received_at,
    last_received_at,
    processing_status,
    attempt_count
  ) values (
    p_event_id,
    p_event_type,
    p_object_id,
    p_event_created_at,
    p_received_at,
    p_received_at,
    'processing',
    1
  )
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;

  select *
  into v_event
  from public.stripe_webhook_events
  where event_id = p_event_id
  for update;

  if v_inserted = 1 then
    return jsonb_build_object('status', 'claimed', 'attemptCount', 1);
  end if;

  if v_event.event_type <> p_event_type
    or v_event.event_created_at <> p_event_created_at then
    raise exception using errcode = '23514', message = 'stripe_event_identity_mismatch';
  end if;

  if v_event.processing_status = 'processed' then
    update public.stripe_webhook_events
    set last_received_at = p_received_at
    where event_id = p_event_id;
    return jsonb_build_object(
      'status', 'duplicate',
      'attemptCount', v_event.attempt_count
    );
  end if;

  if v_event.processing_status = 'processing'
    and v_event.last_received_at > p_received_at - interval '5 minutes' then
    return jsonb_build_object(
      'status', 'busy',
      'attemptCount', v_event.attempt_count
    );
  end if;

  update public.stripe_webhook_events
  set
    event_type = p_event_type,
    object_id = p_object_id,
    last_received_at = p_received_at,
    processing_status = 'processing',
    error_summary = null,
    attempt_count = attempt_count + 1
  where event_id = p_event_id
  returning * into v_event;

  return jsonb_build_object(
    'status', 'claimed',
    'attemptCount', v_event.attempt_count
  );
end;
$$;

create or replace function public.mark_stripe_webhook_event_failed(
  p_event_id text,
  p_error_summary text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.stripe_webhook_events
  set
    processing_status = 'failed',
    error_summary = left(coalesce(p_error_summary, 'processing_failed'), 240),
    processed_at = null
  where event_id = p_event_id
    and processing_status = 'processing';
end;
$$;

create or replace function public.mark_stripe_webhook_event_processed(
  p_event_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.stripe_webhook_events
  set
    processing_status = 'processed',
    processed_at = now(),
    error_summary = null
  where event_id = p_event_id
    and processing_status = 'processing';
end;
$$;

create or replace function public.persist_stripe_subscription_snapshot(
  p_event_id text,
  p_event_created_at timestamptz,
  p_snapshot_retrieved_at timestamptz,
  p_user_id uuid,
  p_plan_code text,
  p_status text,
  p_stripe_status_raw text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_price_id text,
  p_cancel_at_period_end boolean,
  p_canceled_at timestamptz,
  p_latest_invoice_id text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.stripe_webhook_events%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_existing public.user_subscriptions%rowtype;
begin
  select *
  into v_event
  from public.stripe_webhook_events
  where event_id = p_event_id
  for update;

  if not found or v_event.processing_status <> 'processing' then
    return jsonb_build_object('status', 'event_not_claimed');
  end if;
  if v_event.event_created_at <> p_event_created_at then
    raise exception using errcode = '23514', message = 'stripe_event_created_at_mismatch';
  end if;
  if p_status not in ('trialing', 'active', 'past_due', 'canceled')
    or p_snapshot_retrieved_at is null
    or nullif(trim(p_stripe_status_raw), '') is null
    or nullif(trim(p_stripe_customer_id), '') is null
    or nullif(trim(p_stripe_subscription_id), '') is null
    or nullif(trim(p_stripe_price_id), '') is null
    or p_current_period_start is null
    or p_current_period_end is null
    or p_current_period_end <= p_current_period_start then
    raise exception using errcode = '22023', message = 'invalid_stripe_subscription_snapshot';
  end if;

  select *
  into v_plan
  from public.subscription_plans
  where name = p_plan_code
    and publicly_available = true
    and internal_only = false
    and retired_at is null;

  if not found then
    return jsonb_build_object('status', 'plan_missing');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select *
  into v_existing
  from public.user_subscriptions
  where user_id = p_user_id
  for update;

  if found and v_existing.source <> 'stripe' then
    return jsonb_build_object('status', 'non_stripe_entitlement_exists');
  end if;

  if found
    and (
      (
        v_existing.stripe_customer_id is not null
        and v_existing.stripe_customer_id <> p_stripe_customer_id
      )
      or (
        v_existing.stripe_subscription_id is not null
        and v_existing.stripe_subscription_id <> p_stripe_subscription_id
        and (
          v_existing.status <> 'canceled'
          or (
            v_existing.last_stripe_event_created_at is not null
            and v_existing.last_stripe_event_created_at > p_event_created_at
          )
        )
      )
    ) then
    return jsonb_build_object('status', 'stripe_identity_conflict');
  end if;

  if found
    and v_existing.stripe_snapshot_retrieved_at is not null
    and v_existing.stripe_snapshot_retrieved_at > p_snapshot_retrieved_at then
    update public.stripe_webhook_events
    set
      processing_status = 'processed',
      processed_at = now(),
      error_summary = null
    where event_id = p_event_id;
    return jsonb_build_object('status', 'snapshot_stale');
  end if;

  insert into public.user_subscriptions (
    user_id,
    plan_id,
    status,
    source,
    current_period_start,
    current_period_end,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    stripe_status_raw,
    cancel_at_period_end,
    canceled_at,
    latest_invoice_id,
    last_stripe_event_created_at,
    stripe_snapshot_retrieved_at,
    updated_at
  ) values (
    p_user_id,
    v_plan.id,
    p_status,
    'stripe',
    p_current_period_start,
    p_current_period_end,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_stripe_price_id,
    p_stripe_status_raw,
    p_cancel_at_period_end,
    p_canceled_at,
    p_latest_invoice_id,
    p_event_created_at,
    p_snapshot_retrieved_at,
    now()
  )
  on conflict (user_id) do update
  set
    plan_id = excluded.plan_id,
    status = excluded.status,
    source = 'stripe',
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_price_id = excluded.stripe_price_id,
    stripe_status_raw = excluded.stripe_status_raw,
    cancel_at_period_end = excluded.cancel_at_period_end,
    canceled_at = excluded.canceled_at,
    latest_invoice_id = excluded.latest_invoice_id,
    last_stripe_event_created_at = greatest(
      public.user_subscriptions.last_stripe_event_created_at,
      excluded.last_stripe_event_created_at
    ),
    stripe_snapshot_retrieved_at = excluded.stripe_snapshot_retrieved_at,
    updated_at = now();

  update public.stripe_webhook_events
  set
    processing_status = 'processed',
    processed_at = now(),
    error_summary = null
  where event_id = p_event_id;

  return jsonb_build_object('status', 'persisted');
end;
$$;

create or replace function public.reconcile_stripe_subscription_snapshot(
  p_user_id uuid,
  p_snapshot_retrieved_at timestamptz,
  p_plan_code text,
  p_status text,
  p_stripe_status_raw text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_price_id text,
  p_cancel_at_period_end boolean,
  p_canceled_at timestamptz,
  p_latest_invoice_id text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_existing public.user_subscriptions%rowtype;
begin
  if p_status not in ('trialing', 'active', 'past_due', 'canceled')
    or p_snapshot_retrieved_at is null
    or nullif(trim(p_stripe_status_raw), '') is null
    or nullif(trim(p_stripe_customer_id), '') is null
    or nullif(trim(p_stripe_subscription_id), '') is null
    or nullif(trim(p_stripe_price_id), '') is null
    or p_current_period_start is null
    or p_current_period_end is null
    or p_current_period_end <= p_current_period_start then
    raise exception using errcode = '22023', message = 'invalid_stripe_subscription_snapshot';
  end if;

  select *
  into v_plan
  from public.subscription_plans
  where name = p_plan_code
    and publicly_available = true
    and internal_only = false
    and retired_at is null;

  if not found then
    return jsonb_build_object('status', 'plan_missing');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select *
  into v_existing
  from public.user_subscriptions
  where user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('status', 'subscription_missing');
  end if;
  if v_existing.source <> 'stripe' then
    return jsonb_build_object('status', 'non_stripe_entitlement_exists');
  end if;
  if v_existing.stripe_customer_id is distinct from p_stripe_customer_id
    or v_existing.stripe_subscription_id is distinct from p_stripe_subscription_id then
    return jsonb_build_object('status', 'stripe_identity_conflict');
  end if;
  if v_existing.stripe_snapshot_retrieved_at is not null
    and v_existing.stripe_snapshot_retrieved_at > p_snapshot_retrieved_at then
    return jsonb_build_object('status', 'snapshot_stale');
  end if;

  update public.user_subscriptions
  set
    plan_id = v_plan.id,
    status = p_status,
    current_period_start = p_current_period_start,
    current_period_end = p_current_period_end,
    stripe_price_id = p_stripe_price_id,
    stripe_status_raw = p_stripe_status_raw,
    cancel_at_period_end = p_cancel_at_period_end,
    canceled_at = p_canceled_at,
    latest_invoice_id = p_latest_invoice_id,
    stripe_snapshot_retrieved_at = p_snapshot_retrieved_at,
    updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object('status', 'reconciled');
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.mark_stripe_webhook_event_failed(text, text)
  from public, anon, authenticated;
revoke all on function public.mark_stripe_webhook_event_processed(text)
  from public, anon, authenticated;
revoke all on function public.persist_stripe_subscription_snapshot(
  text, timestamptz, timestamptz, uuid, text, text, text, text, text, text, boolean,
  timestamptz, text, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function public.reconcile_stripe_subscription_snapshot(
  uuid, timestamptz, text, text, text, text, text, text, boolean, timestamptz, text,
  timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.claim_stripe_webhook_event(text, text, text, timestamptz, timestamptz)
  to service_role;
grant execute on function public.mark_stripe_webhook_event_failed(text, text)
  to service_role;
grant execute on function public.mark_stripe_webhook_event_processed(text)
  to service_role;
grant execute on function public.persist_stripe_subscription_snapshot(
  text, timestamptz, timestamptz, uuid, text, text, text, text, text, text, boolean,
  timestamptz, text, timestamptz, timestamptz
) to service_role;
grant execute on function public.reconcile_stripe_subscription_snapshot(
  uuid, timestamptz, text, text, text, text, text, text, boolean, timestamptz, text,
  timestamptz, timestamptz
) to service_role;

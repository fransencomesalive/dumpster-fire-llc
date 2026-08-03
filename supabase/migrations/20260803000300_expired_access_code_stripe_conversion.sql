-- Let a completed Stripe Checkout replace only an access-code entitlement whose
-- stored period has ended. Active timed grants, permanent null-window grants,
-- and manual entitlements continue to block implicit conversion.

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

  if found
    and v_existing.source <> 'stripe'
    and not (
      v_existing.source = 'access_code'
      and v_existing.current_period_start is not null
      and v_existing.current_period_end is not null
      and p_snapshot_retrieved_at >= v_existing.current_period_end
    )
  then
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

revoke all on function public.persist_stripe_subscription_snapshot(
  text, timestamptz, timestamptz, uuid, text, text, text, text, text, text, boolean,
  timestamptz, text, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.persist_stripe_subscription_snapshot(
  text, timestamptz, timestamptz, uuid, text, text, text, text, text, text, boolean,
  timestamptz, text, timestamptz, timestamptz
) to service_role;

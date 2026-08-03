-- Access-code grants expire 30 days after redemption (Randall, 2026-08-03).
--
-- Two changes, both scoped to access-code redemption. Stripe subscriptions are untouched.
--
-- 1. redeem_access_code_subscription now stamps current_period_start/current_period_end
--    as [redemption, redemption + 30 days) instead of [month start, month start + 1 month).
-- 2. expire_access_code_subscriptions() flips access-code rows to 'canceled' once that
--    window closes. Expiry is applied by flipping status rather than by teaching every
--    entitlement check about periods: both SQL enforcement sites
--    (usage_ledger_quota_before_insert and persist_human_path_generation) and the
--    TypeScript enforcement path already refuse a non-active status, so one status flip
--    closes every path at once. Expired testers therefore read as 'canceled', which the
--    UI already surfaces as a subscribe prompt.
--
-- Rows with a null current_period_end never expire. The three accounts that redeemed
-- before this migration have null periods and keep permanent access by design.

create or replace function public.redeem_access_code_subscription(
  p_user_id uuid,
  p_code text,
  p_now timestamptz
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_code text;
  v_access_code public.access_codes%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_subscription public.user_subscriptions%rowtype;
  v_has_subscription boolean := false;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  if p_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'user_id is required';
  end if;

  p_now := coalesce(p_now, clock_timestamp());
  v_code := upper(
    regexp_replace(btrim(coalesce(p_code, '')), '[[:space:]]+', '', 'g')
  );
  if v_code = '' then
    raise exception using
      errcode = '22023',
      message = 'code is required';
  end if;

  -- Serialize redemption attempts for one account, including attempts using
  -- different codes before a user_subscriptions row exists.
  perform pg_advisory_xact_lock(
    hashtextextended('access-code-redemption:' || p_user_id::text, 0)
  );

  select user_subscriptions.*
  into v_subscription
  from public.user_subscriptions
  where user_subscriptions.user_id = p_user_id
  for update;
  v_has_subscription := found;

  if v_has_subscription and (
    v_subscription.source = 'stripe'
    or v_subscription.stripe_customer_id is not null
    or v_subscription.stripe_subscription_id is not null
  ) then
    return jsonb_build_object(
      'status', 'stripe_subscription_exists',
      'redeemed', false
    );
  end if;

  if v_has_subscription
    and v_subscription.status in ('active', 'trialing')
  then
    return jsonb_build_object(
      'status', 'already_entitled',
      'redeemed', false,
      'source', v_subscription.source
    );
  end if;

  select access_codes.*
  into v_access_code
  from public.access_codes
  where access_codes.code = v_code
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'invalid_code',
      'redeemed', false
    );
  end if;

  if v_access_code.expires_at is not null
    and v_access_code.expires_at <= p_now
  then
    return jsonb_build_object(
      'status', 'expired_code',
      'redeemed', false
    );
  end if;

  if v_access_code.max_uses is not null
    and v_access_code.use_count >= v_access_code.max_uses
  then
    return jsonb_build_object(
      'status', 'exhausted_code',
      'redeemed', false
    );
  end if;

  select subscription_plans.*
  into v_plan
  from public.subscription_plans
  where subscription_plans.name = v_access_code.plan_name;

  if not found then
    return jsonb_build_object(
      'status', 'plan_missing',
      'redeemed', false
    );
  end if;

  -- Access-code grants run 30 days from redemption (Randall, 2026-08-03), not the
  -- calendar month the redemption happens to fall in. The old calendar-aligned window
  -- gave a redeemer on the 30th of a month roughly one day of access.
  v_period_start := p_now;
  v_period_end := p_now + interval '30 days';

  update public.access_codes
  set
    use_count = use_count + 1,
    updated_at = p_now
  where access_codes.id = v_access_code.id;

  insert into public.user_subscriptions (
    user_id,
    plan_id,
    status,
    source,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    stripe_status_raw,
    cancel_at_period_end,
    canceled_at,
    latest_invoice_id,
    last_stripe_event_created_at,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
  ) values (
    p_user_id,
    v_plan.id,
    'active',
    'access_code',
    null,
    null,
    null,
    null,
    false,
    null,
    null,
    null,
    v_period_start,
    v_period_end,
    p_now,
    p_now
  )
  on conflict (user_id) do update
  set
    plan_id = excluded.plan_id,
    status = excluded.status,
    source = excluded.source,
    stripe_customer_id = null,
    stripe_subscription_id = null,
    stripe_price_id = null,
    stripe_status_raw = null,
    cancel_at_period_end = false,
    canceled_at = null,
    latest_invoice_id = null,
    last_stripe_event_created_at = null,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'status', 'redeemed',
    'redeemed', true,
    'planCode', v_plan.name,
    'periodStart', v_period_start,
    'periodEnd', v_period_end,
    'usesRemaining', case
      when v_access_code.max_uses is null then null
      else greatest(v_access_code.max_uses - v_access_code.use_count - 1, 0)
    end
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- Access-code expiry sweep
-- ---------------------------------------------------------------------------

create or replace function public.expire_access_code_subscriptions(
  p_now timestamptz default null
)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz;
  v_expired integer := 0;
begin
  v_now := coalesce(p_now, clock_timestamp());

  with expired as (
    update public.user_subscriptions
    set
      status = 'canceled',
      canceled_at = coalesce(canceled_at, v_now),
      updated_at = v_now
    where source = 'access_code'
      and status in ('active', 'trialing')
      and current_period_end is not null
      and current_period_end <= v_now
      and stripe_subscription_id is null
      and stripe_customer_id is null
    returning 1
  )
  select count(*) into v_expired from expired;

  return v_expired;
end;
$$;

revoke all on function public.expire_access_code_subscriptions(timestamptz) from public;
revoke all on function public.expire_access_code_subscriptions(timestamptz) from anon;
revoke all on function public.expire_access_code_subscriptions(timestamptz) from authenticated;
grant execute on function public.expire_access_code_subscriptions(timestamptz) to service_role;

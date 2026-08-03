-- Make a timed access-code grant a one-time, account-scoped entitlement.
--
-- Existing access-code subscriptions with no stored period remain permanent.
-- Timed grants use their stored 30-day period for Apply Wizard quota accounting.
-- Manual entitlements continue to use UTC calendar months.

create table if not exists public.access_code_subscription_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_code_id uuid references public.access_codes(id) on delete set null,
  redeemed_code text,
  redeemed_at timestamptz not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_code_subscription_grants_period_check check (
    (current_period_start is null and current_period_end is null)
    or (
      current_period_start is not null
      and current_period_end is not null
      and current_period_end > current_period_start
    )
  )
);

alter table public.access_code_subscription_grants enable row level security;

-- Preserve the existing permanent grants without fabricating a redemption code
-- or expiration date. The row itself prevents a later second redemption.
insert into public.access_code_subscription_grants (
  user_id,
  redeemed_at,
  current_period_start,
  current_period_end,
  created_at,
  updated_at
)
select
  subscriptions.user_id,
  coalesce(
    subscriptions.current_period_start,
    subscriptions.created_at,
    subscriptions.updated_at,
    clock_timestamp()
  ),
  subscriptions.current_period_start,
  subscriptions.current_period_end,
  coalesce(subscriptions.created_at, clock_timestamp()),
  coalesce(subscriptions.updated_at, clock_timestamp())
from public.user_subscriptions as subscriptions
where subscriptions.source = 'access_code'
on conflict (user_id) do nothing;


-- ---------------------------------------------------------------------------
-- One access-code grant per account
-- ---------------------------------------------------------------------------

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
    raise exception using errcode = '22023', message = 'user_id is required';
  end if;

  p_now := coalesce(p_now, clock_timestamp());
  v_code := upper(
    regexp_replace(btrim(coalesce(p_code, '')), '[[:space:]]+', '', 'g')
  );
  if v_code = '' then
    raise exception using errcode = '22023', message = 'code is required';
  end if;

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

  if v_has_subscription and v_subscription.status in ('active', 'trialing') then
    return jsonb_build_object(
      'status', 'already_entitled',
      'redeemed', false,
      'source', v_subscription.source
    );
  end if;

  if exists (
    select 1
    from public.access_code_subscription_grants
    where access_code_subscription_grants.user_id = p_user_id
  ) then
    return jsonb_build_object(
      'status', 'access_code_already_redeemed',
      'redeemed', false
    );
  end if;

  select access_codes.*
  into v_access_code
  from public.access_codes
  where access_codes.code = v_code
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid_code', 'redeemed', false);
  end if;

  if v_access_code.expires_at is not null and v_access_code.expires_at <= p_now then
    return jsonb_build_object('status', 'expired_code', 'redeemed', false);
  end if;

  if v_access_code.max_uses is not null
    and v_access_code.use_count >= v_access_code.max_uses
  then
    return jsonb_build_object('status', 'exhausted_code', 'redeemed', false);
  end if;

  select subscription_plans.*
  into v_plan
  from public.subscription_plans
  where subscription_plans.name = v_access_code.plan_name;

  if not found then
    return jsonb_build_object('status', 'plan_missing', 'redeemed', false);
  end if;

  v_period_start := p_now;
  v_period_end := p_now + interval '30 days';

  update public.access_codes
  set use_count = use_count + 1, updated_at = p_now
  where access_codes.id = v_access_code.id;

  insert into public.access_code_subscription_grants (
    user_id,
    access_code_id,
    redeemed_code,
    redeemed_at,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
  ) values (
    p_user_id,
    v_access_code.id,
    v_code,
    p_now,
    v_period_start,
    v_period_end,
    p_now,
    p_now
  );

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
-- Stored-period Apply Wizard quota enforcement
-- ---------------------------------------------------------------------------

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
  v_now timestamptz := clock_timestamp();
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
  join public.subscription_plans as plans on plans.id = subscriptions.plan_id
  where subscriptions.user_id = new.user_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'subscription_missing';
  end if;

  if v_status not in ('active', 'trialing') then
    raise exception using
      errcode = 'P0001',
      message = 'subscription_inactive:' || coalesce(v_status, 'canceled');
  end if;

  if v_source = 'stripe'
    or (
      v_source = 'access_code'
      and (v_period_start is not null or v_period_end is not null)
    )
  then
    if v_period_start is null or v_period_end is null then
      raise exception using errcode = '22023', message = 'subscription_period_missing';
    end if;

    if new.created_at < v_period_start or new.created_at >= v_period_end then
      raise exception using errcode = '22023', message = 'subscription_period_mismatch';
    end if;

    -- Access-code expiry is based on database time, not a caller-supplied ledger date.
    if v_source = 'access_code'
      and (v_now < v_period_start or v_now >= v_period_end)
    then
      raise exception using errcode = 'P0001', message = 'subscription_period_expired';
    end if;
  else
    -- Manual entitlements and preserved permanent access-code grants retain the
    -- established UTC calendar-month quota behavior.
    v_period_start := (
      date_trunc('month', new.created_at at time zone 'UTC') at time zone 'UTC'
    );
    v_period_end := v_period_start + interval '1 month';
  end if;

  if v_period_end <= v_period_start then
    raise exception using errcode = '22023', message = 'subscription_period_invalid';
  end if;

  if new.plan_id is not null and new.plan_id <> v_plan_id then
    raise exception using errcode = '23514', message = 'usage_plan_mismatch';
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

drop trigger if exists usage_ledger_quota_before_insert on public.usage_ledger;
create trigger usage_ledger_quota_before_insert
  before insert on public.usage_ledger
  for each row execute function public.enforce_usage_ledger_quota();


-- ---------------------------------------------------------------------------
-- Exact Human Path boundary
-- ---------------------------------------------------------------------------

-- Keep the established, extensively tested persistence implementation intact.
-- A wrapper owns only the access-code period and stored-window quota boundary.
do $$
begin
  if to_regprocedure(
    'public.persist_human_path_generation(uuid,uuid,jsonb,jsonb,integer,timestamp with time zone)'
  ) is not null
    and to_regprocedure(
      'public.persist_human_path_generation_unchecked_20260803(uuid,uuid,jsonb,jsonb,integer,timestamp with time zone)'
    ) is null
  then
    alter function public.persist_human_path_generation(
      uuid, uuid, jsonb, jsonb, integer, timestamptz
    ) rename to persist_human_path_generation_unchecked_20260803;
  end if;
end;
$$;

create or replace function public.persist_human_path_generation(
  p_pursuit_id uuid,
  p_user_id uuid,
  p_contacts jsonb,
  p_diagnostics jsonb,
  p_provider_version integer,
  p_generated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source text;
  v_status text;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_limit integer;
  v_used integer := 0;
  v_now timestamptz := clock_timestamp();
  v_contact_count integer := 0;
  v_latest_provider_version integer := 0;
  v_result jsonb;
begin
  -- Preserve the established lifetime replay contract. Cached contacts and a
  -- same/newer cached empty result remain readable after a grant ends.
  if p_pursuit_id is null
    or p_user_id is null
    or p_contacts is null
    or jsonb_typeof(p_contacts) <> 'array'
    or (
      p_diagnostics is not null
      and jsonb_typeof(p_diagnostics) <> 'object'
    )
    or p_provider_version is null
    or p_provider_version < 1
  then
    return public.persist_human_path_generation_unchecked_20260803(
      p_pursuit_id,
      p_user_id,
      p_contacts,
      p_diagnostics,
      p_provider_version,
      p_generated_at
    );
  end if;

  if exists (
    select 1
    from public.contact_suggestions
    where contact_suggestions.pursuit_id = p_pursuit_id
  ) then
    return public.persist_human_path_generation_unchecked_20260803(
      p_pursuit_id,
      p_user_id,
      p_contacts,
      p_diagnostics,
      p_provider_version,
      p_generated_at
    );
  end if;

  if jsonb_array_length(p_contacts) = 0 then
    select coalesce(
      case
        when coalesce(pursuit_events.payload ->> 'providerVersion', '') ~ '^[0-9]+$'
        then (pursuit_events.payload ->> 'providerVersion')::integer
        else 0
      end,
      0
    )
    into v_latest_provider_version
    from public.pursuit_events
    where pursuit_events.pursuit_id = p_pursuit_id
      and pursuit_events.event_type = 'human_path_generated'
    order by pursuit_events.created_at desc, pursuit_events.id desc
    limit 1;
    v_latest_provider_version := coalesce(v_latest_provider_version, 0);

    if exists (
      select 1
      from public.pursuits
      where pursuits.id = p_pursuit_id
        and pursuits.user_id = p_user_id
        and pursuits.status = 'human_path_generated'
    ) and v_latest_provider_version >= p_provider_version
    then
      return public.persist_human_path_generation_unchecked_20260803(
        p_pursuit_id,
        p_user_id,
        p_contacts,
        p_diagnostics,
        p_provider_version,
        p_generated_at
      );
    end if;
  end if;

  select
    subscriptions.source,
    subscriptions.status,
    subscriptions.current_period_start,
    subscriptions.current_period_end,
    plans.apply_wizard_limit_monthly
  into
    v_source,
    v_status,
    v_period_start,
    v_period_end,
    v_limit
  from public.user_subscriptions as subscriptions
  join public.subscription_plans as plans on plans.id = subscriptions.plan_id
  where subscriptions.user_id = p_user_id;

  if found
    and v_source = 'access_code'
    and (v_period_start is not null or v_period_end is not null)
  then
    if v_period_start is null
      or v_period_end is null
      or v_now < v_period_start
      or v_now >= v_period_end
    then
      if v_period_end is not null and v_now >= v_period_end then
        update public.user_subscriptions
        set
          status = 'canceled',
          canceled_at = coalesce(canceled_at, v_now),
          updated_at = v_now
        where user_id = p_user_id
          and source = 'access_code'
          and status in ('active', 'trialing');
      end if;

      return jsonb_build_object(
        'status', 'subscription_inactive',
        'subscriptionStatus', case
          when v_period_end is not null and v_now >= v_period_end then 'canceled'
          else v_status
        end,
        'replayed', false,
        'debitAdded', false
      );
    end if;

    if jsonb_typeof(p_contacts) = 'array' then
      v_contact_count := jsonb_array_length(p_contacts);
    end if;

    if v_status in ('active', 'trialing')
      and v_contact_count > 0
      and v_limit is not null
    then
      select coalesce(sum(usage_ledger.quantity), 0)::integer
      into v_used
      from public.usage_ledger
      where usage_ledger.user_id = p_user_id
        and usage_ledger.usage_type = 'apply_wizard'
        and usage_ledger.created_at >= v_period_start
        and usage_ledger.created_at < v_period_end;

      if v_used >= v_limit then
        return jsonb_build_object(
          'status', 'limit_reached',
          'replayed', false,
          'debitAdded', false,
          'usage', jsonb_build_object(
            'used', v_used,
            'limit', v_limit,
            'remaining', 0,
            'periodStart', v_period_start,
            'periodEnd', v_period_end,
            'finalUse', false
          )
        );
      end if;
    end if;
  end if;

  v_result := public.persist_human_path_generation_unchecked_20260803(
    p_pursuit_id,
    p_user_id,
    p_contacts,
    p_diagnostics,
    p_provider_version,
    p_generated_at
  );

  -- The delegate predates fixed access-code windows and reports a UTC calendar
  -- month. Rewrite its successful usage summary from the durable grant period.
  if v_source = 'access_code'
    and v_period_start is not null
    and v_period_end is not null
    and v_result ->> 'status' = 'human_path_generated'
    and coalesce((v_result ->> 'replayed')::boolean, false) is false
    and v_result -> 'usage' is not null
  then
    select coalesce(sum(usage_ledger.quantity), 0)::integer
    into v_used
    from public.usage_ledger
    where usage_ledger.user_id = p_user_id
      and usage_ledger.usage_type = 'apply_wizard'
      and usage_ledger.created_at >= v_period_start
      and usage_ledger.created_at < v_period_end;

    v_result := jsonb_set(
      v_result,
      '{usage}',
      jsonb_build_object(
        'used', v_used,
        'limit', v_limit,
        'remaining', greatest(v_limit - v_used, 0),
        'periodStart', v_period_start,
        'periodEnd', v_period_end,
        'finalUse', coalesce((v_result ->> 'debitAdded')::boolean, false)
          and greatest(v_limit - v_used, 0) = 0
      )
    );
  end if;

  return v_result;
end;
$$;


-- ---------------------------------------------------------------------------
-- Service-only boundaries
-- ---------------------------------------------------------------------------

revoke all on table public.access_code_subscription_grants
  from public, anon, authenticated;
grant select, insert, update, delete on table public.access_code_subscription_grants
  to service_role;

revoke all on function public.redeem_access_code_subscription(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.enforce_usage_ledger_quota()
  from public, anon, authenticated;
revoke all on function public.expire_access_code_subscriptions(timestamptz)
  from public, anon, authenticated;
revoke all on function public.persist_human_path_generation(
  uuid, uuid, jsonb, jsonb, integer, timestamptz
) from public, anon, authenticated;
revoke all on function public.persist_human_path_generation_unchecked_20260803(
  uuid, uuid, jsonb, jsonb, integer, timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.redeem_access_code_subscription(uuid, text, timestamptz)
  to service_role;
grant execute on function public.expire_access_code_subscriptions(timestamptz)
  to service_role;
grant execute on function public.persist_human_path_generation(
  uuid, uuid, jsonb, jsonb, integer, timestamptz
) to service_role;

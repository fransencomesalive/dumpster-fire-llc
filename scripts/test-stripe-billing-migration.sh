#!/usr/bin/env bash
set -euo pipefail

export PGTZ=UTC

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "/tmp/stripe-billing-migration.XXXXXX")"
PG_DATA="$TEST_ROOT/data"
PG_SOCKET="$TEST_ROOT/socket"
PG_PORT="${STRIPE_BILLING_TEST_PORT:-55496}"
PG_LOG="$TEST_ROOT/postgres.log"
PG_BIN="$(pg_config --bindir)"
MIGRATION="$REPO_ROOT/supabase/migrations/20260726000100_stripe_billing_backend.sql"
CONVERSION_MIGRATION="$REPO_ROOT/supabase/migrations/20260803000300_expired_access_code_stripe_conversion.sql"

cleanup() {
  if [[ -d "$PG_DATA" ]]; then
    "$PG_BIN/pg_ctl" -D "$PG_DATA" -m fast stop >/dev/null 2>&1 || true
  fi
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

mkdir -p "$PG_SOCKET"
"$PG_BIN/initdb" -D "$PG_DATA" --auth=trust --username=postgres >/dev/null
if ! "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$PG_LOG" -o "-p $PG_PORT -k $PG_SOCKET" start >/dev/null; then
  sed -n '1,240p' "$PG_LOG"
  exit 1
fi

PSQL=("$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$PG_SOCKET" -p "$PG_PORT" -U postgres -d postgres)

"${PSQL[@]}" -c "
  create extension if not exists pgcrypto;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create schema supabase_migrations;
  create table supabase_migrations.schema_migrations (
    version text primary key,
    name text
  );
  insert into supabase_migrations.schema_migrations (version, name) values
    ('20260724000600', 'subscription_billing_two_tier'),
    ('20260725000100', 'outreach_metering_removal');
  create table auth.users (id uuid primary key);

  create table public.subscription_plans (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    price_monthly integer not null default 0,
    profile_export boolean not null default false,
    pursuit_limit_monthly integer,
    outreach_limit_monthly integer,
    human_path_limit_monthly integer,
    apply_wizard_limit_monthly integer,
    markdown_export boolean not null default false,
    publicly_available boolean not null default false,
    internal_only boolean not null default false,
    retired_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table public.user_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references auth.users(id) on delete cascade,
    plan_id uuid not null references public.subscription_plans(id),
    status text not null check (status in ('trialing', 'active', 'past_due', 'canceled')),
    source text not null check (source in ('stripe', 'access_code', 'manual')),
    current_period_start timestamptz,
    current_period_end timestamptz,
    stripe_customer_id text,
    stripe_subscription_id text,
    stripe_price_id text,
    stripe_status_raw text,
    cancel_at_period_end boolean not null default false,
    canceled_at timestamptz,
    latest_invoice_id text,
    last_stripe_event_created_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create unique index user_subscriptions_stripe_customer_unique_idx
    on public.user_subscriptions(stripe_customer_id)
    where stripe_customer_id is not null;
  create unique index user_subscriptions_stripe_subscription_unique_idx
    on public.user_subscriptions(stripe_subscription_id)
    where stripe_subscription_id is not null;

  create table public.usage_ledger (
    id uuid primary key default gen_random_uuid()
  );

  insert into public.subscription_plans (
    id, name, price_monthly, apply_wizard_limit_monthly, markdown_export,
    publicly_available, internal_only
  ) values
    ('10000000-0000-0000-0000-000000000001', 'basic', 2200, 20, false, true, false),
    ('10000000-0000-0000-0000-000000000002', 'premium', 3200, 45, true, true, false),
    ('10000000-0000-0000-0000-000000000003', 'tester', 0, 25, true, false, true);

  insert into auth.users (id) values
    ('20000000-0000-0000-0000-000000000001'),
    ('20000000-0000-0000-0000-000000000002'),
    ('20000000-0000-0000-0000-000000000003');

  insert into public.user_subscriptions (
    user_id, plan_id, status, source
  ) values (
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    'active',
    'access_code'
  );

" >/dev/null

"${PSQL[@]}" -f "$REPO_ROOT/scripts/preflight-stripe-billing.sql" >/dev/null

"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -f "$CONVERSION_MIGRATION" >/dev/null
"${PSQL[@]}" -f "$CONVERSION_MIGRATION" >/dev/null
"${PSQL[@]}" -f "$CONVERSION_MIGRATION" >/dev/null

"${PSQL[@]}" -c "
  insert into supabase_migrations.schema_migrations (version, name)
  values
    ('20260726000100', 'stripe_billing_backend'),
    ('20260803000300', 'expired_access_code_stripe_conversion');
" >/dev/null

"${PSQL[@]}" -c "
  set role service_role;
  select count(*) from public.user_subscriptions;
  select count(*) from public.subscription_plans;
  select count(*) from public.usage_ledger;
  reset role;
" >/dev/null

"${PSQL[@]}" -c "
do \$\$
declare
  v_result jsonb;
  v_source text;
  v_plan text;
  v_attempts integer;
  v_watermark timestamptz;
begin
  v_result := public.claim_stripe_webhook_event(
    'evt_1', 'customer.subscription.created', 'sub_1',
    '2026-07-26T12:00:00Z', '2026-07-26T12:00:01Z'
  );
  if v_result->>'status' <> 'claimed' then
    raise exception 'first claim failed: %', v_result;
  end if;

  v_result := public.claim_stripe_webhook_event(
    'evt_1', 'customer.subscription.created', 'sub_1',
    '2026-07-26T12:00:00Z', '2026-07-26T12:00:02Z'
  );
  if v_result->>'status' <> 'busy' then
    raise exception 'concurrent claim was not busy: %', v_result;
  end if;

  perform public.mark_stripe_webhook_event_failed('evt_1', 'temporary_failure');
  v_result := public.claim_stripe_webhook_event(
    'evt_1', 'customer.subscription.created', 'sub_1',
    '2026-07-26T12:00:00Z', '2026-07-26T12:00:03Z'
  );
  if v_result->>'status' <> 'claimed' or (v_result->>'attemptCount')::integer <> 2 then
    raise exception 'failed event retry was not claimed: %', v_result;
  end if;

  v_result := public.persist_stripe_subscription_snapshot(
    'evt_1',
    '2026-07-26T12:00:00Z',
    '2026-07-26T12:00:03Z',
    '20000000-0000-0000-0000-000000000001',
    'basic',
    'active',
    'active',
    'cus_1',
    'sub_1',
    'price_basic',
    false,
    null,
    'in_1',
    '2026-07-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  );
  if v_result->>'status' <> 'persisted' then
    raise exception 'subscription snapshot did not persist: %', v_result;
  end if;

  select subscriptions.source, plans.name
  into v_source, v_plan
  from public.user_subscriptions subscriptions
  join public.subscription_plans plans on plans.id = subscriptions.plan_id
  where subscriptions.user_id = '20000000-0000-0000-0000-000000000001';
  if v_source <> 'stripe' or v_plan <> 'basic' then
    raise exception 'unexpected local subscription: %, %', v_source, v_plan;
  end if;

  v_result := public.claim_stripe_webhook_event(
    'evt_1', 'customer.subscription.created', 'sub_1',
    '2026-07-26T12:00:00Z', '2026-07-26T12:00:04Z'
  );
  if v_result->>'status' <> 'duplicate' then
    raise exception 'processed replay was not duplicate: %', v_result;
  end if;

  v_result := public.claim_stripe_webhook_event(
    'evt_2', 'customer.subscription.updated', 'sub_1',
    '2026-07-26T14:00:00Z', '2026-07-26T14:00:01Z'
  );
  v_result := public.persist_stripe_subscription_snapshot(
    'evt_2',
    '2026-07-26T14:00:00Z',
    '2026-07-26T14:00:01Z',
    '20000000-0000-0000-0000-000000000001',
    'premium',
    'active',
    'active',
    'cus_1',
    'sub_1',
    'price_premium',
    false,
    null,
    'in_2',
    '2026-07-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  );
  if v_result->>'status' <> 'persisted' then
    raise exception 'upgrade snapshot failed: %', v_result;
  end if;

  v_result := public.claim_stripe_webhook_event(
    'evt_old', 'customer.subscription.updated', 'sub_1',
    '2026-07-26T13:00:00Z', '2026-07-26T14:00:02Z'
  );
  v_result := public.persist_stripe_subscription_snapshot(
    'evt_old',
    '2026-07-26T13:00:00Z',
    '2026-07-26T14:00:02Z',
    '20000000-0000-0000-0000-000000000001',
    'premium',
    'active',
    'active',
    'cus_1',
    'sub_1',
    'price_premium',
    true,
    null,
    'in_current',
    '2026-07-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  );
  if v_result->>'status' <> 'persisted' then
    raise exception 'authoritative snapshot from out-of-order delivery was not persisted: %', v_result;
  end if;

  select
    plans.name,
    subscriptions.latest_invoice_id,
    subscriptions.last_stripe_event_created_at
  into v_plan, v_source, v_watermark
  from public.user_subscriptions subscriptions
  join public.subscription_plans plans on plans.id = subscriptions.plan_id
  where subscriptions.user_id = '20000000-0000-0000-0000-000000000001';
  if v_plan <> 'premium'
    or v_source <> 'in_current'
    or v_watermark <> '2026-07-26T14:00:00Z'::timestamptz then
    raise exception 'out-of-order delivery did not retain snapshot/watermark: %, %, %',
      v_plan, v_source, v_watermark;
  end if;

  v_result := public.claim_stripe_webhook_event(
    'evt_stale_snapshot', 'customer.subscription.updated', 'sub_1',
    '2026-07-26T14:15:00Z', '2026-07-26T14:15:01Z'
  );
  v_result := public.persist_stripe_subscription_snapshot(
    'evt_stale_snapshot',
    '2026-07-26T14:15:00Z',
    '2026-07-26T14:00:00Z',
    '20000000-0000-0000-0000-000000000001',
    'basic',
    'active',
    'active',
    'cus_1',
    'sub_1',
    'price_basic',
    false,
    null,
    'in_stale_snapshot',
    '2026-07-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  );
  if v_result->>'status' <> 'snapshot_stale' then
    raise exception 'older retrieved snapshot was not rejected: %', v_result;
  end if;

  v_result := public.claim_stripe_webhook_event(
    'evt_identity_conflict', 'customer.subscription.created', 'sub_duplicate',
    '2026-07-26T14:30:00Z', '2026-07-26T14:30:01Z'
  );
  v_result := public.persist_stripe_subscription_snapshot(
    'evt_identity_conflict',
    '2026-07-26T14:30:00Z',
    '2026-07-26T14:30:01Z',
    '20000000-0000-0000-0000-000000000001',
    'premium',
    'active',
    'active',
    'cus_1',
    'sub_duplicate',
    'price_premium',
    false,
    null,
    'in_duplicate',
    '2026-07-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  );
  if v_result->>'status' <> 'stripe_identity_conflict' then
    raise exception 'second active Stripe identity was not rejected: %', v_result;
  end if;

  v_result := public.reconcile_stripe_subscription_snapshot(
    '20000000-0000-0000-0000-000000000001',
    '2026-07-26T14:45:00Z',
    'premium',
    'past_due',
    'past_due',
    'cus_1',
    'sub_1',
    'price_premium',
    false,
    null,
    'in_reconciled',
    '2026-07-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  );
  if v_result->>'status' <> 'reconciled' then
    raise exception 'reconciliation snapshot failed: %', v_result;
  end if;

  select subscriptions.status, subscriptions.latest_invoice_id
  into v_source, v_plan
  from public.user_subscriptions subscriptions
  where subscriptions.user_id = '20000000-0000-0000-0000-000000000001';
  if v_source <> 'past_due' or v_plan <> 'in_reconciled' then
    raise exception 'reconciliation snapshot did not update local state: %, %',
      v_source, v_plan;
  end if;

  v_result := public.claim_stripe_webhook_event(
    'evt_resubscribe_old', 'customer.subscription.deleted', 'sub_old',
    '2026-07-26T12:00:00Z', '2026-07-26T12:00:01Z'
  );
  v_result := public.persist_stripe_subscription_snapshot(
    'evt_resubscribe_old',
    '2026-07-26T12:00:00Z',
    '2026-07-26T12:00:01Z',
    '20000000-0000-0000-0000-000000000002',
    'basic',
    'canceled',
    'canceled',
    'cus_resubscribe',
    'sub_old',
    'price_basic',
    false,
    '2026-07-26T12:00:00Z',
    'in_old',
    '2026-07-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  );
  if v_result->>'status' <> 'persisted' then
    raise exception 'initial canceled subscription failed: %', v_result;
  end if;

  v_result := public.claim_stripe_webhook_event(
    'evt_resubscribe_new', 'customer.subscription.created', 'sub_new',
    '2026-07-26T13:00:00Z', '2026-07-26T13:00:01Z'
  );
  v_result := public.persist_stripe_subscription_snapshot(
    'evt_resubscribe_new',
    '2026-07-26T13:00:00Z',
    '2026-07-26T13:00:01Z',
    '20000000-0000-0000-0000-000000000002',
    'premium',
    'active',
    'active',
    'cus_resubscribe',
    'sub_new',
    'price_premium',
    false,
    null,
    'in_new',
    '2026-07-26T13:00:00Z',
    '2026-08-26T13:00:00Z'
  );
  if v_result->>'status' <> 'persisted' then
    raise exception 'legitimate resubscription did not replace canceled identity: %', v_result;
  end if;

  v_result := public.claim_stripe_webhook_event(
    'evt_resubscribe_delayed_old', 'customer.subscription.updated', 'sub_old',
    '2026-07-26T12:30:00Z', '2026-07-26T14:00:00Z'
  );
  v_result := public.persist_stripe_subscription_snapshot(
    'evt_resubscribe_delayed_old',
    '2026-07-26T12:30:00Z',
    '2026-07-26T14:00:00Z',
    '20000000-0000-0000-0000-000000000002',
    'basic',
    'canceled',
    'canceled',
    'cus_resubscribe',
    'sub_old',
    'price_basic',
    false,
    '2026-07-26T12:30:00Z',
    'in_old_delayed',
    '2026-07-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  );
  if v_result->>'status' <> 'stripe_identity_conflict' then
    raise exception 'delayed old identity replaced a newer resubscription: %', v_result;
  end if;

  v_result := public.claim_stripe_webhook_event(
    'evt_conflict', 'checkout.session.completed', 'sub_3',
    '2026-07-26T15:00:00Z', '2026-07-26T15:00:01Z'
  );
  v_result := public.persist_stripe_subscription_snapshot(
    'evt_conflict',
    '2026-07-26T15:00:00Z',
    '2026-07-26T15:00:01Z',
    '20000000-0000-0000-0000-000000000003',
    'premium',
    'active',
    'active',
    'cus_3',
    'sub_3',
    'price_premium',
    false,
    null,
    'in_3',
    '2026-07-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  );
  if v_result->>'status' <> 'non_stripe_entitlement_exists' then
    raise exception 'access-code entitlement was overwritten: %', v_result;
  end if;

  update public.user_subscriptions
  set
    status = 'canceled',
    current_period_start = '2026-06-01T00:00:00Z',
    current_period_end = '2026-07-01T00:00:00Z'
  where user_id = '20000000-0000-0000-0000-000000000003';

  v_result := public.persist_stripe_subscription_snapshot(
    'evt_conflict',
    '2026-07-26T15:00:00Z',
    '2026-07-26T15:00:01Z',
    '20000000-0000-0000-0000-000000000003',
    'premium',
    'active',
    'active',
    'cus_3',
    'sub_3',
    'price_premium',
    false,
    null,
    'in_3',
    '2026-07-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  );
  if v_result->>'status' <> 'persisted' then
    raise exception 'expired access-code entitlement did not convert: %', v_result;
  end if;

  select subscriptions.source, plans.name
  into v_source, v_plan
  from public.user_subscriptions subscriptions
  join public.subscription_plans plans on plans.id = subscriptions.plan_id
  where subscriptions.user_id = '20000000-0000-0000-0000-000000000003';
  if v_source <> 'stripe' or v_plan <> 'premium' then
    raise exception 'expired conversion persisted the wrong plan: %, %', v_source, v_plan;
  end if;

  select attempt_count into v_attempts
  from public.stripe_webhook_events where event_id = 'evt_1';
  if v_attempts <> 2 then
    raise exception 'unexpected attempt count: %', v_attempts;
  end if;
end
\$\$;
" >/dev/null

if "${PSQL[@]}" -v ON_ERROR_STOP=1 -c "
  set role authenticated;
  select public.claim_stripe_webhook_event(
    'evt_forbidden', 'customer.subscription.updated', 'sub_forbidden',
    now(), now()
  );
" >/dev/null 2>&1; then
  echo "authenticated unexpectedly executed Stripe event RPC" >&2
  exit 1
fi

if "${PSQL[@]}" -v ON_ERROR_STOP=1 -c "
  set role authenticated;
  select public.reconcile_stripe_subscription_snapshot(
    '20000000-0000-0000-0000-000000000001',
    now(),
    'premium', 'active', 'active', 'cus_1', 'sub_1', 'price_premium',
    false, null, 'in_forbidden',
    '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z'
  );
" >/dev/null 2>&1; then
  echo "authenticated unexpectedly executed Stripe reconciliation RPC" >&2
  exit 1
fi

"${PSQL[@]}" -c "
  set role service_role;
  select public.claim_stripe_webhook_event(
    'evt_service', 'customer.subscription.updated', 'sub_service',
    '2026-07-26T16:00:00Z', '2026-07-26T16:00:01Z'
  );
" >/dev/null

"${PSQL[@]}" -f "$REPO_ROOT/scripts/postflight-stripe-billing.sql" >/dev/null

echo "Stripe billing migration harness passed."

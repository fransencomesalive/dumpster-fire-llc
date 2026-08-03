#!/usr/bin/env bash
set -euo pipefail

export PGTZ=UTC

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "/tmp/subscription-two-tier.XXXXXX")"
PG_DATA="$TEST_ROOT/data"
PG_SOCKET="$TEST_ROOT/socket"
PG_PORT="${SUBSCRIPTION_TWO_TIER_TEST_PORT:-55494}"
PG_LOG="$TEST_ROOT/postgres.log"
PG_BIN="$(pg_config --bindir)"

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
  cat "$PG_LOG"
  exit 1
fi

PSQL=("$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$PG_SOCKET" -p "$PG_PORT" -U postgres -d postgres)

# Recreate the subscription, pursuit, contact, and legacy outreach surface as it
# exists immediately before the two-tier migration. Fixed identifiers make the
# preservation and backfill assertions deterministic.
"${PSQL[@]}" -c "
  create extension if not exists pgcrypto;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create function auth.uid()
  returns uuid
  language sql
  stable
  as \$\$ select null::uuid \$\$;
  create table auth.users (id uuid primary key);

  create table public.subscription_plans (
    id uuid primary key default gen_random_uuid(),
    name text not null unique check (name in ('tester', 'basic', 'pro', 'premium')),
    price_monthly integer not null default 0 check (price_monthly >= 0),
    unlimited_search boolean not null default true,
    profile_export boolean not null default false,
    pursuit_limit_monthly integer,
    outreach_limit_monthly integer,
    human_path_limit_monthly integer,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table public.user_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references auth.users(id) on delete cascade,
    plan_id uuid not null references public.subscription_plans(id),
    status text not null default 'active'
      check (status in ('trialing', 'active', 'past_due', 'canceled')),
    current_period_start timestamptz,
    current_period_end timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table public.access_codes (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    plan_name text not null check (plan_name in ('tester', 'basic', 'pro', 'premium')),
    max_uses integer check (max_uses is null or max_uses > 0),
    use_count integer not null default 0 check (use_count >= 0),
    expires_at timestamptz,
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table public.jobs (
    id uuid primary key,
    source text not null default 'test',
    source_url text not null default '',
    owner_user_id uuid references auth.users(id) on delete cascade,
    company_name text not null default '',
    title text not null default '',
    description text not null default ''
  );

  create table public.pursuits (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    profile_id uuid,
    job_id uuid references public.jobs(id) on delete set null,
    status text not null default 'saved',
    pursuit_metered_at timestamptz,
    last_activity_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, job_id)
  );

  create table public.pursuit_events (
    id uuid primary key default gen_random_uuid(),
    pursuit_id uuid not null references public.pursuits(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    event_type text not null,
    from_status text,
    to_status text,
    usage_type text,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );

  create table public.contact_suggestions (
    id uuid primary key default gen_random_uuid(),
    pursuit_id uuid not null references public.pursuits(id) on delete cascade,
    job_id uuid not null references public.jobs(id) on delete cascade,
    name text not null,
    title text not null default '',
    company_name text not null default '',
    linkedin_url text,
    professional_contact_url text,
    email text,
    contact_type text not null default 'unknown',
    confidence text not null default 'low',
    relevance_reason text not null default '',
    role_connection text not null default '',
    verification_notes text[] not null default '{}',
    selected_for_outreach boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table public.usage_ledger (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    plan_id uuid references public.subscription_plans(id),
    usage_type text not null,
    quantity integer not null default 1 check (quantity > 0),
    related_job_id uuid references public.jobs(id) on delete set null,
    related_pursuit_id uuid references public.pursuits(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint usage_ledger_usage_type_check check (
      usage_type in (
        'pursuit',
        'outreach_message',
        'human_path',
        'profile_export',
        'voice_fingerprint',
        'resume_highlights'
      )
    )
  );

  create table public.pursuit_outreach_generation_requests (
    id uuid primary key default gen_random_uuid(),
    pursuit_id uuid not null references public.pursuits(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    idempotency_key text not null,
    request_payload jsonb not null,
    pursuit_debit_added boolean not null default false,
    outreach_debit_quantity integer not null check (outreach_debit_quantity > 0),
    persisted_at timestamptz not null default now(),
    unique (pursuit_id, idempotency_key)
  );

  create table public.outreach_messages (
    id uuid primary key default gen_random_uuid(),
    pursuit_id uuid not null references public.pursuits(id) on delete cascade,
    contact_suggestion_id uuid references public.contact_suggestions(id) on delete set null,
    channel text not null default 'other',
    recipient_type text not null,
    message text not null,
    status text not null default 'draft',
    generation_request_id uuid
      references public.pursuit_outreach_generation_requests(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  alter table public.subscription_plans enable row level security;
  alter table public.user_subscriptions enable row level security;
  alter table public.access_codes enable row level security;
  alter table public.usage_ledger enable row level security;
  alter table public.pursuits enable row level security;
  alter table public.pursuit_events enable row level security;
  alter table public.contact_suggestions enable row level security;

  grant select, insert, update, delete on all tables in schema public to service_role;
" >/dev/null

TESTER_PLAN="10000000-0000-0000-0000-000000000001"
BASIC_PLAN="10000000-0000-0000-0000-000000000002"
PRO_PLAN="10000000-0000-0000-0000-000000000003"
PREMIUM_PLAN="10000000-0000-0000-0000-000000000004"
TESTER_USER="20000000-0000-0000-0000-000000000001"
PRO_USER="20000000-0000-0000-0000-000000000002"
PAID_USER="20000000-0000-0000-0000-000000000003"
NO_SUB_USER="20000000-0000-0000-0000-000000000004"
NEW_TESTER_USER="20000000-0000-0000-0000-000000000005"
PAST_DUE_USER="20000000-0000-0000-0000-000000000006"
LEGACY_PREMIUM_USER="20000000-0000-0000-0000-000000000007"
TESTER_JOB="30000000-0000-0000-0000-000000000001"
EMPTY_JOB="30000000-0000-0000-0000-000000000002"
NEW_JOB="30000000-0000-0000-0000-000000000003"
NEW_EMPTY_JOB="30000000-0000-0000-0000-000000000004"
RENEWAL_JOB="30000000-0000-0000-0000-000000000005"
TESTER_PURSUIT="40000000-0000-0000-0000-000000000001"
EMPTY_PURSUIT="40000000-0000-0000-0000-000000000002"
NEW_PURSUIT="40000000-0000-0000-0000-000000000003"
NEW_EMPTY_PURSUIT="40000000-0000-0000-0000-000000000004"
RENEWAL_PURSUIT="40000000-0000-0000-0000-000000000005"
PAID_PURSUIT="40000000-0000-0000-0000-000000000006"

"${PSQL[@]}" -c "
  insert into public.subscription_plans (
    id, name, price_monthly, profile_export,
    pursuit_limit_monthly, outreach_limit_monthly, human_path_limit_monthly
  ) values
    ('$TESTER_PLAN', 'tester', 0, true, 25, 75, 25),
    ('$BASIC_PLAN', 'basic', 2900, false, 0, 0, 0),
    ('$PRO_PLAN', 'pro', 7900, false, 0, 0, 25),
    ('$PREMIUM_PLAN', 'premium', 29900, true, 50, 150, 50);

  insert into auth.users (id) values
    ('$TESTER_USER'),
    ('$PRO_USER'),
    ('$PAID_USER'),
    ('$NO_SUB_USER'),
    ('$NEW_TESTER_USER'),
    ('$PAST_DUE_USER'),
    ('$LEGACY_PREMIUM_USER');

  insert into public.user_subscriptions (
    user_id, plan_id, status, current_period_start, current_period_end
  ) values
    ('$TESTER_USER', '$TESTER_PLAN', 'active', null, null),
    ('$PRO_USER', '$PRO_PLAN', 'active', null, null),
    ('$LEGACY_PREMIUM_USER', '$PREMIUM_PLAN', 'active', null, null);

  insert into public.access_codes (
    id, code, plan_name, max_uses, use_count, expires_at
  ) values
    ('50000000-0000-0000-0000-000000000001', 'PAID-CONFLICT', 'tester', 10, 2, null),
    ('50000000-0000-0000-0000-000000000002', 'NEW-TESTER', 'tester', 10, 0, null);

  insert into public.jobs (id, source_url, company_name, title, description) values
    ('$TESTER_JOB', 'https://example.com/tester', 'Example', 'Tester role', 'Description'),
    ('$EMPTY_JOB', 'https://example.com/empty', 'Example', 'Empty role', 'Description'),
    ('$NEW_JOB', 'https://example.com/new', 'Example', 'New role', 'Description'),
    ('$NEW_EMPTY_JOB', 'https://example.com/new-empty', 'Example', 'New empty role', 'Description');

  insert into public.pursuits (
    id, user_id, job_id, status, created_at, updated_at
  ) values
    (
      '$TESTER_PURSUIT', '$TESTER_USER', '$TESTER_JOB',
      'human_path_generated', '2026-07-10T10:00:00Z', '2026-07-10T10:05:00Z'
    ),
    (
      '$EMPTY_PURSUIT', '$TESTER_USER', '$EMPTY_JOB',
      'human_path_generated', '2026-07-11T10:00:00Z', '2026-07-11T10:05:00Z'
    ),
    (
      '$NEW_PURSUIT', '$TESTER_USER', '$NEW_JOB',
      'review_complete', '2026-07-24T10:00:00Z', '2026-07-24T10:05:00Z'
    ),
    (
      '$NEW_EMPTY_PURSUIT', '$TESTER_USER', '$NEW_EMPTY_JOB',
      'review_complete', '2026-07-24T10:00:00Z', '2026-07-24T10:05:00Z'
    );

  insert into public.contact_suggestions (
    id, pursuit_id, job_id, name, title, company_name, linkedin_url,
    contact_type, confidence, relevance_reason, role_connection, created_at, updated_at
  ) values (
    '60000000-0000-0000-0000-000000000001',
    '$TESTER_PURSUIT',
    '$TESTER_JOB',
    'Legacy Contact',
    'Hiring Manager',
    'Example',
    'https://www.linkedin.com/in/legacy-contact',
    'likely_hiring_manager',
    'high',
    'Relevant',
    'Hiring path',
    '2026-07-10T10:05:00Z',
    '2026-07-10T10:05:00Z'
  );

  insert into public.pursuit_events (
    pursuit_id, user_id, event_type, from_status, to_status,
    usage_type, payload, created_at
  ) values
    (
      '$TESTER_PURSUIT', '$TESTER_USER', 'human_path_generated',
      'review_complete', 'human_path_generated', 'human_path',
      '{\"contactCount\":1}'::jsonb, '2026-07-10T10:05:00Z'
    ),
    (
      '$EMPTY_PURSUIT', '$TESTER_USER', 'human_path_generated',
      'review_complete', 'human_path_generated', 'human_path',
      '{\"contactCount\":0}'::jsonb, '2026-07-11T10:05:00Z'
    );

  insert into public.usage_ledger (
    user_id, plan_id, usage_type, quantity, related_job_id, related_pursuit_id, created_at
  ) values
    (
      '$TESTER_USER', '$TESTER_PLAN', 'human_path', 1,
      '$TESTER_JOB', '$TESTER_PURSUIT', '2026-07-10T10:05:00Z'
    ),
    (
      '$TESTER_USER', '$TESTER_PLAN', 'human_path', 1,
      '$EMPTY_JOB', '$EMPTY_PURSUIT', '2026-07-11T10:05:00Z'
    );
" >/dev/null

MIGRATION="$REPO_ROOT/supabase/migrations/20260724000600_subscription_billing_two_tier.sql"
"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -f "$MIGRATION" >/dev/null

PLAN_STATE="$("${PSQL[@]}" -At -F '|' -c "
  select string_agg(
    concat_ws(
      ':',
      name,
      price_monthly,
      apply_wizard_limit_monthly,
      markdown_export,
      publicly_available,
      retired_at is not null
    ),
    ',' order by name
  )
  from public.subscription_plans;
")"
EXPECTED_PLAN_STATE="basic:2200:20:f:t:f,premium:3200:45:t:t:f,pro:7900:0:f:f:t,tester:0:25:t:f:f"
if [[ "$PLAN_STATE" != "$EXPECTED_PLAN_STATE" ]]; then
  echo "Unexpected two-tier plan catalog: $PLAN_STATE"
  exit 1
fi

PRESERVED="$("${PSQL[@]}" -At -F '|' -c "
  select
    (select count(*) from public.subscription_plans where id in ('$TESTER_PLAN', '$PRO_PLAN')),
    (
      select count(*)
      from public.user_subscriptions
      where user_id in ('$TESTER_USER', '$PRO_USER', '$LEGACY_PREMIUM_USER')
    ),
    (select source from public.user_subscriptions where user_id = '$TESTER_USER'),
    (select source from public.user_subscriptions where user_id = '$LEGACY_PREMIUM_USER'),
    (select source from public.user_subscriptions where user_id = '$PRO_USER');
")"
if [[ "$PRESERVED" != "2|3|access_code|access_code|manual" ]]; then
  echo "Legacy subscription preservation or source backfill failed: $PRESERVED"
  exit 1
fi

REQUIRED_COLUMNS="$("${PSQL[@]}" -At -F '|' -c "
  select
    count(*) filter (
      where table_name = 'subscription_plans'
        and column_name in (
          'apply_wizard_limit_monthly',
          'markdown_export',
          'publicly_available',
          'retired_at'
        )
    ),
    count(*) filter (
      where table_name = 'user_subscriptions'
        and column_name in (
          'source',
          'stripe_customer_id',
          'stripe_subscription_id',
          'stripe_price_id',
          'stripe_status_raw',
          'cancel_at_period_end'
        )
    ),
    count(*) filter (
      where table_name = 'pursuits'
        and column_name = 'apply_wizard_metered_at'
    )
  from information_schema.columns
  where table_schema = 'public';
")"
if [[ "$REQUIRED_COLUMNS" != "4|6|1" ]]; then
  echo "Required subscription/metering columns are missing: $REQUIRED_COLUMNS"
  exit 1
fi

# Source validation and Stripe identity uniqueness are schema invariants, not
# application conventions.
if "${PSQL[@]}" -c "
  insert into public.user_subscriptions (user_id, plan_id, status, source)
  values ('$NO_SUB_USER', '$BASIC_PLAN', 'active', 'retail');
" >/dev/null 2>&1; then
  echo "Expected source constraint to reject an unsupported value"
  exit 1
fi

"${PSQL[@]}" -c "
  insert into public.user_subscriptions (
    user_id,
    plan_id,
    status,
    source,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    stripe_status_raw,
    current_period_start,
    current_period_end
  ) values (
    '$PAID_USER',
    '$PREMIUM_PLAN',
    'active',
    'stripe',
    'cus_paid',
    'sub_paid',
    'price_premium',
    'active',
    '2026-07-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
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
    current_period_start,
    current_period_end
  ) values (
    '$PAST_DUE_USER',
    '$BASIC_PLAN',
    'past_due',
    'stripe',
    'cus_past_due',
    'sub_past_due',
    'price_basic',
    'past_due',
    '2026-07-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  );
" >/dev/null

if "${PSQL[@]}" -c "
  update public.user_subscriptions
  set stripe_customer_id = 'cus_paid'
  where user_id = '$PAST_DUE_USER';
" >/dev/null 2>&1; then
  echo "Expected duplicate Stripe customer id to be rejected"
  exit 1
fi

if "${PSQL[@]}" -c "
  update public.user_subscriptions
  set stripe_subscription_id = 'sub_paid'
  where user_id = '$PAST_DUE_USER';
" >/dev/null 2>&1; then
  echo "Expected duplicate Stripe subscription id to be rejected"
  exit 1
fi

if "${PSQL[@]}" -c "
  update public.user_subscriptions
  set
    source = 'access_code',
    stripe_customer_id = null,
    stripe_subscription_id = null,
    stripe_price_id = null,
    stripe_status_raw = null,
    latest_invoice_id = null,
    last_stripe_event_created_at = null,
    cancel_at_period_end = false
  where user_id = '$PAID_USER';
" >/dev/null 2>&1; then
  echo "Expected a Stripe subscription source to be immutable"
  exit 1
fi

# Stripe-backed writes must remain inside the authoritative half-open billing
# period. A stale local period fails closed until a webhook refreshes it.
"${PSQL[@]}" -c "
  insert into public.pursuits (
    id, user_id, job_id, status, created_at, updated_at
  ) values (
    '$PAID_PURSUIT',
    '$PAID_USER',
    '$NEW_JOB',
    'review_complete',
    '2026-08-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  );
" >/dev/null
if "${PSQL[@]}" -c "
  insert into public.usage_ledger (
    user_id, plan_id, usage_type, quantity,
    related_job_id, related_pursuit_id, created_at
  ) values (
    '$PAID_USER', '$PREMIUM_PLAN', 'apply_wizard', 1,
    '$NEW_JOB', '$PAID_PURSUIT', '2026-08-01T00:00:00Z'
  );
" >/dev/null 2>&1; then
  echo "Expected a Stripe usage debit outside the stored period to fail closed"
  exit 1
fi

# A paid Stripe subscription must win over an access code. Whether the RPC
# returns a structured conflict or raises, the code use and subscription row
# must remain unchanged.
"${PSQL[@]}" -c "
  do \$\$
  begin
    perform public.redeem_access_code_subscription(
      '$PAID_USER',
      'PAID-CONFLICT',
      '2026-07-24T12:00:00Z'
    );
  exception when others then
    null;
  end
  \$\$;
" >/dev/null

PAID_CONFLICT="$("${PSQL[@]}" -At -F '|' -c "
  select
    (select use_count from public.access_codes where code = 'PAID-CONFLICT'),
    subscriptions.source,
    subscriptions.stripe_subscription_id,
    plans.name
  from public.user_subscriptions as subscriptions
  join public.subscription_plans as plans on plans.id = subscriptions.plan_id
  where subscriptions.user_id = '$PAID_USER';
")"
if [[ "$PAID_CONFLICT" != "2|stripe|sub_paid|premium" ]]; then
  echo "Access-code conflict consumed a use or changed paid entitlement: $PAID_CONFLICT"
  exit 1
fi

# A valid tester redemption still uses the existing optimistic use-count path.
"${PSQL[@]}" -c "
  select public.redeem_access_code_subscription(
    '$NEW_TESTER_USER',
    'NEW-TESTER',
    '2026-07-24T12:01:00Z'
  );
" >/dev/null

TESTER_REDEEMED="$("${PSQL[@]}" -At -F '|' -c "
  select
    (select use_count from public.access_codes where code = 'NEW-TESTER'),
    subscriptions.source,
    plans.name,
    subscriptions.status
  from public.user_subscriptions as subscriptions
  join public.subscription_plans as plans on plans.id = subscriptions.plan_id
  where subscriptions.user_id = '$NEW_TESTER_USER';
")"
if [[ "$TESTER_REDEEMED" != "1|access_code|tester|active" ]]; then
  echo "Tester access-code redemption was not preserved: $TESTER_REDEEMED"
  exit 1
fi

# Access-code periods renew by UTC calendar month without a Stripe webhook.
# A redemption-time period must not become a permanently stale quota window.
"${PSQL[@]}" -c "
  insert into public.jobs (
    id, source_url, company_name, title, description
  ) values (
    '$RENEWAL_JOB',
    'https://example.com/renewal',
    'Example',
    'Renewal role',
    'Description'
  );

  insert into public.pursuits (
    id, user_id, job_id, status, created_at, updated_at
  ) values (
    '$RENEWAL_PURSUIT',
    '$NEW_TESTER_USER',
    '$RENEWAL_JOB',
    'review_complete',
    '2026-08-05T10:00:00Z',
    '2026-08-05T10:05:00Z'
  );
" >/dev/null

RENEWAL_RESULT="$("${PSQL[@]}" -At -c "
  select public.persist_human_path_generation(
    '$RENEWAL_PURSUIT',
    '$NEW_TESTER_USER',
    '[
      {
        \"name\": \"Renewal Contact\",
        \"title\": \"Recruiter\",
        \"companyName\": \"Example\",
        \"linkedinUrl\": \"https://www.linkedin.com/in/renewal-contact\",
        \"contactType\": \"recruiter\",
        \"confidence\": \"medium\",
        \"relevanceReason\": \"Current recruiter\",
        \"roleConnection\": \"Potential hiring path\",
        \"verificationNotes\": []
      }
    ]'::jsonb,
    '{\"schemaVersion\":2,\"returnedCount\":1}'::jsonb,
    12,
    '2026-08-05T12:00:00Z'
  );
")"
RENEWAL_STATUS="$("${PSQL[@]}" -At -F '|' -c "
  select
    '$RENEWAL_RESULT'::jsonb ->> 'status',
    '$RENEWAL_RESULT'::jsonb #>> '{usage,periodStart}',
    '$RENEWAL_RESULT'::jsonb #>> '{usage,used}',
    '$RENEWAL_RESULT'::jsonb #>> '{usage,remaining}';
")"
if [[ "$RENEWAL_STATUS" != "human_path_generated|2026-08-01T00:00:00+00:00|1|24" ]]; then
  echo "Access-code calendar renewal was not enforced correctly: $RENEWAL_RESULT"
  exit 1
fi

BACKFILL="$("${PSQL[@]}" -At -F '|' -c "
  select
    (select count(*) from public.usage_ledger
      where user_id = '$TESTER_USER'
        and related_pursuit_id = '$TESTER_PURSUIT'
        and usage_type = 'apply_wizard'),
    (select apply_wizard_metered_at is not null
      from public.pursuits where id = '$TESTER_PURSUIT'),
    (select count(*) from public.usage_ledger
      where user_id = '$TESTER_USER'
        and related_pursuit_id = '$EMPTY_PURSUIT'
        and usage_type = 'apply_wizard'),
    (select apply_wizard_metered_at is null
      from public.pursuits where id = '$EMPTY_PURSUIT');
")"
if [[ "$BACKFILL" != "1|t|0|t" ]]; then
  echo "Useful/empty legacy pursuit backfill was incorrect: $BACKFILL"
  exit 1
fi

# Reapplying the migration after backfill must not create a second debit.
"${PSQL[@]}" -f "$MIGRATION" >/dev/null
BACKFILL_REAPPLIED="$("${PSQL[@]}" -At -c "
  select count(*)
  from public.usage_ledger
  where user_id = '$TESTER_USER'
    and related_pursuit_id = '$TESTER_PURSUIT'
    and usage_type = 'apply_wizard';
")"
if [[ "$BACKFILL_REAPPLIED" != "1" ]]; then
  echo "Migration reapply duplicated a backfilled Apply Wizard debit"
  exit 1
fi

# Useful contacts, the pursuit event, the immutable latch, and the one-time
# debit commit through one database boundary. The provider-style camelCase
# payload deliberately omits a contact id; storage owns normalized identifiers.
HUMAN_PATH_RESULT="$("${PSQL[@]}" -At -c "
  select public.persist_human_path_generation(
    '$NEW_PURSUIT',
    '$TESTER_USER',
    '[
      {
        \"name\": \"New Contact\",
        \"title\": \"VP, Programs\",
        \"companyName\": \"Example\",
        \"linkedinUrl\": \"https://www.linkedin.com/in/new-contact\",
        \"reachability\": {
          \"method\": \"linkedin\",
          \"url\": \"https://www.linkedin.com/in/new-contact\"
        },
        \"contactType\": \"likely_hiring_manager\",
        \"confidence\": \"high\",
        \"relevanceReason\": \"Leads the relevant function\",
        \"roleConnection\": \"Likely hiring path\",
        \"verificationNotes\": [\"Current public profile\"]
      }
    ]'::jsonb,
    '{
      \"schemaVersion\": 2,
      \"retrievedCount\": 1,
      \"exactCompanyCount\": 1,
      \"returnedCount\": 1,
      \"rawProviderPayload\": {\"mustNotPersist\": true}
    }'::jsonb,
    12,
    '2026-07-24T12:05:00Z'
  );
")"
HUMAN_PATH_STATUS="$("${PSQL[@]}" -At -F '|' -c "
  select
    '$HUMAN_PATH_RESULT'::jsonb ->> 'status',
    '$HUMAN_PATH_RESULT'::jsonb ->> 'replayed',
    '$HUMAN_PATH_RESULT'::jsonb ->> 'debitAdded',
    jsonb_array_length('$HUMAN_PATH_RESULT'::jsonb -> 'contacts');
")"
if [[ "$HUMAN_PATH_STATUS" != "human_path_generated|false|true|1" ]]; then
  echo "Unexpected useful Human Path commit result: $HUMAN_PATH_RESULT"
  exit 1
fi

HUMAN_PATH_COMMITTED="$("${PSQL[@]}" -At -F '|' -c "
  select
    (select count(*) from public.contact_suggestions
      where pursuit_id = '$NEW_PURSUIT'),
    (select count(*) from public.usage_ledger
      where user_id = '$TESTER_USER'
        and related_pursuit_id = '$NEW_PURSUIT'
        and usage_type = 'apply_wizard'),
    (select apply_wizard_metered_at = '2026-07-24T12:05:00Z'::timestamptz
      from public.pursuits where id = '$NEW_PURSUIT'),
    (select count(*) from public.pursuit_events
      where pursuit_id = '$NEW_PURSUIT'
        and event_type = 'human_path_generated'),
    (select payload #> '{diagnostics,rawProviderPayload}' is null
      from public.pursuit_events
      where pursuit_id = '$NEW_PURSUIT'
        and event_type = 'human_path_generated'
      order by created_at desc
      limit 1);
")"
if [[ "$HUMAN_PATH_COMMITTED" != "1|1|t|1|t" ]]; then
  echo "Useful Human Path writes did not commit atomically: $HUMAN_PATH_COMMITTED"
  exit 1
fi

# A replay returns the persisted result and can never add another debit, event,
# or contact row.
HUMAN_PATH_REPLAY="$("${PSQL[@]}" -At -c "
  select public.persist_human_path_generation(
    '$NEW_PURSUIT',
    '$TESTER_USER',
    '[
      {
        \"name\": \"Replacement Contact\",
        \"title\": \"Should not replace persisted data\",
        \"companyName\": \"Example\",
        \"linkedinUrl\": \"https://www.linkedin.com/in/replacement\",
        \"reachability\": {
          \"method\": \"linkedin\",
          \"url\": \"https://www.linkedin.com/in/replacement\"
        },
        \"contactType\": \"recruiter\",
        \"confidence\": \"medium\",
        \"relevanceReason\": \"Replay input\",
        \"roleConnection\": \"Replay input\",
        \"verificationNotes\": []
      }
    ]'::jsonb,
    '{\"schemaVersion\":2,\"returnedCount\":1}'::jsonb,
    12,
    '2026-07-24T12:06:00Z'
  );
")"
HUMAN_PATH_REPLAY_STATUS="$("${PSQL[@]}" -At -F '|' -c "
  select
    '$HUMAN_PATH_REPLAY'::jsonb ->> 'status',
    '$HUMAN_PATH_REPLAY'::jsonb ->> 'replayed',
    '$HUMAN_PATH_REPLAY'::jsonb ->> 'debitAdded',
    jsonb_array_length('$HUMAN_PATH_REPLAY'::jsonb -> 'contacts');
")"
if [[ "$HUMAN_PATH_REPLAY_STATUS" != "human_path_generated|true|false|1" ]]; then
  echo "Unexpected Human Path replay result: $HUMAN_PATH_REPLAY"
  exit 1
fi

HUMAN_PATH_REPLAY_WRITES="$("${PSQL[@]}" -At -F '|' -c "
  select
    (select count(*) from public.contact_suggestions where pursuit_id = '$NEW_PURSUIT'),
    (select count(*) from public.usage_ledger
      where related_pursuit_id = '$NEW_PURSUIT' and usage_type = 'apply_wizard'),
    (select count(*) from public.pursuit_events
      where pursuit_id = '$NEW_PURSUIT' and event_type = 'human_path_generated');
")"
if [[ "$HUMAN_PATH_REPLAY_WRITES" != "1|1|1" ]]; then
  echo "Human Path replay duplicated persisted state: $HUMAN_PATH_REPLAY_WRITES"
  exit 1
fi

# Empty useful-contact results are auditable but never consume allowance and
# never set the immutable Apply Wizard latch.
EMPTY_RESULT="$("${PSQL[@]}" -At -c "
  select public.persist_human_path_generation(
    '$NEW_EMPTY_PURSUIT',
    '$TESTER_USER',
    '[]'::jsonb,
    '{
      \"schemaVersion\": 2,
      \"retrievedCount\": 0,
      \"exactCompanyCount\": 0,
      \"returnedCount\": 0
    }'::jsonb,
    12,
    '2026-07-24T12:07:00Z'
  );
")"
EMPTY_STATUS="$("${PSQL[@]}" -At -F '|' -c "
  select
    '$EMPTY_RESULT'::jsonb ->> 'status',
    '$EMPTY_RESULT'::jsonb ->> 'debitAdded',
    jsonb_array_length('$EMPTY_RESULT'::jsonb -> 'contacts');
")"
if [[ "$EMPTY_STATUS" != "human_path_generated|false|0" ]]; then
  echo "Unexpected empty Human Path result: $EMPTY_RESULT"
  exit 1
fi

EMPTY_WRITES="$("${PSQL[@]}" -At -F '|' -c "
  select
    (select count(*) from public.contact_suggestions
      where pursuit_id = '$NEW_EMPTY_PURSUIT'),
    (select count(*) from public.usage_ledger
      where related_pursuit_id = '$NEW_EMPTY_PURSUIT'
        and usage_type = 'apply_wizard'),
    (select apply_wizard_metered_at is null
      from public.pursuits where id = '$NEW_EMPTY_PURSUIT');
")"
if [[ "$EMPTY_WRITES" != "0|0|t" ]]; then
  echo "Empty Human Path result consumed allowance or set the latch: $EMPTY_WRITES"
  exit 1
fi

if "${PSQL[@]}" -c "
  update public.pursuits
  set apply_wizard_metered_at = null
  where id = '$NEW_PURSUIT';
" >/dev/null 2>&1; then
  echo "Expected the Apply Wizard latch to be immutable once set"
  exit 1
fi

if "${PSQL[@]}" -c "
  insert into public.usage_ledger (
    user_id, plan_id, usage_type, quantity,
    related_job_id, related_pursuit_id, created_at
  ) values (
    '$TESTER_USER', '$TESTER_PLAN', 'apply_wizard', 1,
    '$NEW_JOB', '$NEW_PURSUIT', '2026-07-24T12:08:00Z'
  );
" >/dev/null 2>&1; then
  echo "Expected one Apply Wizard debit per user/pursuit"
  exit 1
fi

# Missing and inactive subscriptions fail closed at the database boundary.
if "${PSQL[@]}" -c "
  insert into public.usage_ledger (
    user_id, usage_type, quantity, related_job_id, created_at
  ) values (
    '$NO_SUB_USER', 'apply_wizard', 1, '$NEW_JOB', '2026-07-24T12:02:00Z'
  );
" >/dev/null 2>&1; then
  echo "Expected missing subscription to fail closed for Apply Wizard usage"
  exit 1
fi

if "${PSQL[@]}" -c "
  insert into public.usage_ledger (
    user_id, usage_type, quantity, related_job_id, created_at
  ) values (
    '$PAST_DUE_USER', 'apply_wizard', 1, '$NEW_JOB', '2026-07-24T12:03:00Z'
  );
" >/dev/null 2>&1; then
  echo "Expected inactive subscription to reject Apply Wizard usage"
  exit 1
fi

if "${PSQL[@]}" -c "
  insert into public.usage_ledger (
    user_id, usage_type, quantity, related_job_id, related_pursuit_id, created_at
  ) values (
    '$TESTER_USER', 'apply_wizard', 2,
    '$NEW_EMPTY_JOB', '$NEW_EMPTY_PURSUIT', '2026-07-24T12:04:00Z'
  );
" >/dev/null 2>&1; then
  echo "Expected Apply Wizard debit quantity to be exactly one"
  exit 1
fi

if "${PSQL[@]}" -c "
  insert into public.usage_ledger (
    user_id, usage_type, quantity, related_job_id, related_pursuit_id, created_at
  ) values (
    '$TESTER_USER', 'apply_wizard', 1, '$NEW_EMPTY_JOB', null, '2026-07-24T12:04:00Z'
  );
" >/dev/null 2>&1; then
  echo "Expected Apply Wizard usage to require a pursuit"
  exit 1
fi

FUNCTION_SECURITY="$("${PSQL[@]}" -At -F '|' -c "
  select string_agg(
    concat_ws(
      ':',
      p.proname,
      has_function_privilege('anon', p.oid, 'execute'),
      has_function_privilege('authenticated', p.oid, 'execute'),
      has_function_privilege('service_role', p.oid, 'execute')
    ),
    ',' order by p.proname
  )
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'persist_human_path_generation',
      'redeem_access_code_subscription'
    );
")"
EXPECTED_FUNCTION_SECURITY="persist_human_path_generation:f:f:t,redeem_access_code_subscription:f:f:t"
if [[ "$FUNCTION_SECURITY" != "$EXPECTED_FUNCTION_SECURITY" ]]; then
  echo "Unexpected Phase 2A RPC security posture: $FUNCTION_SECURITY"
  exit 1
fi

TABLE_SECURITY="$("${PSQL[@]}" -At -F '|' -c "
  select
    (select relrowsecurity from pg_class where oid = 'public.user_subscriptions'::regclass),
    has_table_privilege('anon', 'public.user_subscriptions', 'update'),
    has_table_privilege('authenticated', 'public.usage_ledger', 'insert'),
    has_table_privilege('service_role', 'public.usage_ledger', 'insert'),
    has_table_privilege('authenticated', 'public.contact_suggestions', 'insert'),
    has_table_privilege('service_role', 'public.contact_suggestions', 'insert');
")"
if [[ "$TABLE_SECURITY" != "t|f|f|t|f|t" ]]; then
  echo "Unexpected subscription/usage table security posture: $TABLE_SECURITY"
  exit 1
fi

# Apply the access-code follow-ups against the real Human Path implementation,
# then prove expiry blocks new writes without breaking lifetime cached replay.
THIRTY_DAY_MIGRATION="$REPO_ROOT/supabase/migrations/20260803000100_access_code_thirty_day_grant.sql"
ACCESS_ENFORCEMENT_MIGRATION="$REPO_ROOT/supabase/migrations/20260803000200_access_code_grant_enforcement.sql"
"${PSQL[@]}" -f "$THIRTY_DAY_MIGRATION" >/dev/null
"${PSQL[@]}" -f "$ACCESS_ENFORCEMENT_MIGRATION" >/dev/null
"${PSQL[@]}" -f "$ACCESS_ENFORCEMENT_MIGRATION" >/dev/null

"${PSQL[@]}" -c "
  insert into public.pursuits (
    id, user_id, job_id, status, created_at, updated_at
  ) values (
    '40000000-0000-0000-0000-000000000007',
    '$NEW_TESTER_USER',
    '$NEW_EMPTY_JOB',
    'review_complete',
    '2026-08-03T10:00:00Z',
    '2026-08-03T10:00:00Z'
  );
" >/dev/null

LATEST_EXPIRED_RESULT="$("${PSQL[@]}" -At -c "
  select public.persist_human_path_generation(
    '40000000-0000-0000-0000-000000000007',
    '$NEW_TESTER_USER',
    '[]'::jsonb,
    '{}'::jsonb,
    12,
    '2026-08-03T12:00:00Z'
  );
")"
LATEST_EXPIRED_STATE="$("${PSQL[@]}" -At -F '|' -c "
  select
    '$LATEST_EXPIRED_RESULT'::jsonb ->> 'status',
    status
  from public.user_subscriptions
  where user_id = '$NEW_TESTER_USER';
")"
if [[ "$LATEST_EXPIRED_STATE" != "subscription_inactive|canceled" ]]; then
  echo "Expired access-code Human Path write was not blocked: $LATEST_EXPIRED_RESULT"
  exit 1
fi

LATEST_CACHED_REPLAY="$("${PSQL[@]}" -At -c "
  select public.persist_human_path_generation(
    '$RENEWAL_PURSUIT',
    '$NEW_TESTER_USER',
    '[]'::jsonb,
    '{}'::jsonb,
    12,
    '2026-08-03T12:01:00Z'
  );
")"
LATEST_CACHED_REPLAY_STATE="$("${PSQL[@]}" -At -F '|' -c "
  select
    '$LATEST_CACHED_REPLAY'::jsonb ->> 'status',
    '$LATEST_CACHED_REPLAY'::jsonb ->> 'replayed',
    jsonb_array_length('$LATEST_CACHED_REPLAY'::jsonb -> 'contacts');
")"
if [[ "$LATEST_CACHED_REPLAY_STATE" != "human_path_generated|true|1" ]]; then
  echo "Expired access-code cached replay was not preserved: $LATEST_CACHED_REPLAY"
  exit 1
fi

"${PSQL[@]}" -c "
  insert into public.user_subscriptions (
    user_id, plan_id, status, source, current_period_start, current_period_end
  ) values (
    '$NO_SUB_USER',
    '$TESTER_PLAN',
    'active',
    'access_code',
    clock_timestamp() - interval '1 day',
    clock_timestamp() + interval '29 days'
  );

  insert into public.pursuits (
    id, user_id, job_id, status, created_at, updated_at
  ) values (
    '40000000-0000-0000-0000-000000000008',
    '$NO_SUB_USER',
    '$NEW_EMPTY_JOB',
    'review_complete',
    clock_timestamp(),
    clock_timestamp()
  );
" >/dev/null

LATEST_ACTIVE_RESULT="$("${PSQL[@]}" -At -c "
  select public.persist_human_path_generation(
    '40000000-0000-0000-0000-000000000008',
    '$NO_SUB_USER',
    '[{
      \"name\": \"Stored Window Contact\",
      \"title\": \"Recruiter\",
      \"companyName\": \"Example\",
      \"linkedinUrl\": \"https://www.linkedin.com/in/stored-window-contact\",
      \"contactType\": \"recruiter\",
      \"confidence\": \"medium\",
      \"relevanceReason\": \"Current recruiter\",
      \"roleConnection\": \"Potential hiring path\",
      \"verificationNotes\": []
    }]'::jsonb,
    '{\"schemaVersion\":2,\"returnedCount\":1}'::jsonb,
    12,
    clock_timestamp()
  );
")"
LATEST_ACTIVE_STATE="$("${PSQL[@]}" -At -F '|' -c "
  select
    '$LATEST_ACTIVE_RESULT'::jsonb ->> 'status',
    '$LATEST_ACTIVE_RESULT'::jsonb #>> '{usage,used}',
    '$LATEST_ACTIVE_RESULT'::jsonb #>> '{usage,remaining}',
    ('$LATEST_ACTIVE_RESULT'::jsonb #>> '{usage,periodStart}')::timestamptz = current_period_start,
    ('$LATEST_ACTIVE_RESULT'::jsonb #>> '{usage,periodEnd}')::timestamptz = current_period_end
  from public.user_subscriptions
  where user_id = '$NO_SUB_USER';
")"
if [[ "$LATEST_ACTIVE_STATE" != "human_path_generated|1|24|t|t" ]]; then
  echo "Active access-code Human Path usage did not use its stored period: $LATEST_ACTIVE_RESULT"
  exit 1
fi

UNCHECKED_EXECUTE="$("${PSQL[@]}" -At -c "
  select has_function_privilege(
    'service_role',
    'public.persist_human_path_generation_unchecked_20260803(uuid,uuid,jsonb,jsonb,integer,timestamptz)',
    'execute'
  );
")"
if [[ "$UNCHECKED_EXECUTE" != "f" ]]; then
  echo "Service role can bypass the access-code Human Path wrapper"
  exit 1
fi

echo "subscription billing two-tier migration: passed"

-- Phase 2A: backward-compatible two-tier subscription catalog and atomic
-- Apply Wizard persistence boundaries.
--
-- This migration is schema-first. The deployed application may continue to
-- write the legacy pursuit, human_path, and outreach_message usage types until
-- the later application cutover. No legacy rows or RPCs are removed here.

-- ---------------------------------------------------------------------------
-- Plan catalog
-- ---------------------------------------------------------------------------

alter table public.subscription_plans
  add column if not exists apply_wizard_limit_monthly integer,
  add column if not exists markdown_export boolean not null default false,
  add column if not exists publicly_available boolean not null default false,
  add column if not exists internal_only boolean not null default false,
  add column if not exists retired_at timestamptz;

alter table public.subscription_plans
  drop constraint if exists subscription_plans_apply_wizard_limit_check;
alter table public.subscription_plans
  add constraint subscription_plans_apply_wizard_limit_check
  check (
    apply_wizard_limit_monthly is null
    or apply_wizard_limit_monthly >= 0
  );

alter table public.subscription_plans
  drop constraint if exists subscription_plans_availability_check;
alter table public.subscription_plans
  add constraint subscription_plans_availability_check
  check (not (publicly_available and internal_only));

-- price_monthly is stored in integer US cents. Preserve the retired pro row for
-- audit and existing foreign keys, but grant it no new Apply Wizard entitlement
-- and keep it unavailable to retail checkout.
update public.subscription_plans
set
  price_monthly = 2200,
  profile_export = false,
  apply_wizard_limit_monthly = 20,
  markdown_export = false,
  publicly_available = true,
  internal_only = false,
  retired_at = null,
  updated_at = now()
where name = 'basic';

update public.subscription_plans
set
  price_monthly = 3200,
  profile_export = true,
  apply_wizard_limit_monthly = 45,
  markdown_export = true,
  publicly_available = true,
  internal_only = false,
  retired_at = null,
  updated_at = now()
where name = 'premium';

update public.subscription_plans
set
  price_monthly = 0,
  profile_export = true,
  apply_wizard_limit_monthly = 25,
  markdown_export = true,
  publicly_available = false,
  internal_only = true,
  retired_at = null,
  updated_at = now()
where name = 'tester';

update public.subscription_plans
set
  publicly_available = false,
  internal_only = false,
  apply_wizard_limit_monthly = 0,
  retired_at = coalesce(retired_at, now()),
  updated_at = now()
where name = 'pro';

-- ---------------------------------------------------------------------------
-- Stripe-ready subscription mirror
-- ---------------------------------------------------------------------------

alter table public.user_subscriptions
  add column if not exists source text not null default 'manual',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text,
  add column if not exists stripe_status_raw text,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists canceled_at timestamptz,
  add column if not exists latest_invoice_id text,
  add column if not exists last_stripe_event_created_at timestamptz;

-- Existing rows have no Stripe identifiers. Tester is an internal
-- access-code entitlement; all other pre-Stripe rows remain explicitly manual.
update public.user_subscriptions as subscriptions
set source = 'access_code'
from public.subscription_plans as plans
where plans.id = subscriptions.plan_id
  and plans.name = 'tester'
  and subscriptions.source = 'manual'
  and subscriptions.stripe_customer_id is null
  and subscriptions.stripe_subscription_id is null;

update public.user_subscriptions
set source = 'stripe'
where source <> 'stripe'
  and (
    stripe_customer_id is not null
    or stripe_subscription_id is not null
    or stripe_price_id is not null
  );

alter table public.user_subscriptions
  drop constraint if exists user_subscriptions_source_check;
alter table public.user_subscriptions
  add constraint user_subscriptions_source_check
  check (source in ('stripe', 'access_code', 'manual'));

alter table public.user_subscriptions
  drop constraint if exists user_subscriptions_period_check;
alter table public.user_subscriptions
  add constraint user_subscriptions_period_check
  check (
    (current_period_start is null and current_period_end is null)
    or (
      current_period_start is not null
      and current_period_end is not null
      and current_period_end > current_period_start
    )
  );

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
      and cancel_at_period_end = false
    )
  );

create unique index if not exists user_subscriptions_stripe_customer_unique_idx
  on public.user_subscriptions(stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists user_subscriptions_stripe_subscription_unique_idx
  on public.user_subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

create or replace function public.prevent_stripe_subscription_source_replacement()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.source = 'stripe' and new.source <> 'stripe' then
    raise exception using
      errcode = '23514',
      message = 'stripe_subscription_source_cannot_be_replaced';
  end if;
  return new;
end;
$$;

drop trigger if exists user_subscriptions_preserve_stripe_source_before_update
  on public.user_subscriptions;
create trigger user_subscriptions_preserve_stripe_source_before_update
  before update on public.user_subscriptions
  for each row
  execute function public.prevent_stripe_subscription_source_replacement();

-- ---------------------------------------------------------------------------
-- Apply Wizard usage and immutable pursuit latch
-- ---------------------------------------------------------------------------

alter table public.usage_ledger
  drop constraint if exists usage_ledger_usage_type_check;
alter table public.usage_ledger
  add constraint usage_ledger_usage_type_check
  check (
    usage_type in (
      'pursuit',
      'outreach_message',
      'human_path',
      'profile_export',
      'voice_fingerprint',
      'resume_highlights',
      'apply_wizard'
    )
  );

alter table public.usage_ledger
  drop constraint if exists usage_ledger_apply_wizard_shape_check;
alter table public.usage_ledger
  add constraint usage_ledger_apply_wizard_shape_check
  check (
    usage_type <> 'apply_wizard'
    or (
      quantity = 1
      and related_pursuit_id is not null
    )
  );

alter table public.pursuit_events
  drop constraint if exists pursuit_events_usage_type_check;
alter table public.pursuit_events
  add constraint pursuit_events_usage_type_check
  check (
    usage_type is null
    or usage_type in (
      'pursuit',
      'outreach_message',
      'human_path',
      'profile_export',
      'apply_wizard'
    )
  );

alter table public.pursuits
  add column if not exists apply_wizard_metered_at timestamptz;

-- Contact persistence now participates in the service-only atomic boundary.
-- Owners retain direct read access, while every mutation goes through a
-- server API or the service-role RPC.
drop policy if exists contact_suggestions_owner
  on public.contact_suggestions;
drop policy if exists contact_suggestions_owner_select
  on public.contact_suggestions;
create policy contact_suggestions_owner_select
  on public.contact_suggestions
  for select using (
    exists (
      select 1
      from public.pursuits
      where pursuits.id = contact_suggestions.pursuit_id
        and pursuits.user_id = auth.uid()
    )
  );

revoke insert, update, delete, truncate
  on public.contact_suggestions
  from public, anon, authenticated;
grant select, insert, update, delete
  on public.contact_suggestions
  to service_role;

do $$
begin
  if exists (
    select 1
    from public.usage_ledger
    where usage_type = 'apply_wizard'
      and related_pursuit_id is not null
    group by user_id, related_pursuit_id
    having count(*) > 1 or sum(quantity) <> 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'duplicate_apply_wizard_debits';
  end if;
end $$;

create unique index if not exists usage_ledger_one_apply_wizard_debit_idx
  on public.usage_ledger(user_id, related_pursuit_id)
  where usage_type = 'apply_wizard'
    and related_pursuit_id is not null;

-- Persisted contacts are the historical evidence that a useful Human Path
-- result committed. Prefer the earliest positive Human Path event timestamp,
-- falling back to the earliest persisted-contact timestamp when legacy event
-- data is incomplete. Backfill precedes apply_wizard trigger enforcement so it
-- cannot consume or be rejected by a current retail billing-period quota.
with contact_evidence as (
  select
    pursuits.id as pursuit_id,
    pursuits.user_id,
    pursuits.job_id,
    min(contact_suggestions.created_at) as first_contact_at
  from public.pursuits
  join public.contact_suggestions
    on contact_suggestions.pursuit_id = pursuits.id
  group by pursuits.id, pursuits.user_id, pursuits.job_id
),
positive_event_evidence as (
  select
    pursuit_events.pursuit_id,
    min(pursuit_events.created_at) as first_positive_event_at
  from public.pursuit_events
  where pursuit_events.event_type = 'human_path_generated'
    and coalesce(pursuit_events.payload ->> 'contactCount', '') ~ '^[0-9]+$'
    and (pursuit_events.payload ->> 'contactCount')::integer > 0
  group by pursuit_events.pursuit_id
)
insert into public.usage_ledger (
  user_id,
  plan_id,
  usage_type,
  quantity,
  related_job_id,
  related_pursuit_id,
  created_at
)
select
  contact_evidence.user_id,
  null,
  'apply_wizard',
  1,
  contact_evidence.job_id,
  contact_evidence.pursuit_id,
  coalesce(
    positive_event_evidence.first_positive_event_at,
    contact_evidence.first_contact_at
  )
from contact_evidence
left join positive_event_evidence
  on positive_event_evidence.pursuit_id = contact_evidence.pursuit_id
on conflict (user_id, related_pursuit_id)
  where usage_type = 'apply_wizard'
    and related_pursuit_id is not null
do nothing;

update public.pursuits as pursuits
set apply_wizard_metered_at = prior_usage.metered_at
from (
  select
    usage_ledger.user_id,
    usage_ledger.related_pursuit_id,
    min(usage_ledger.created_at) as metered_at
  from public.usage_ledger
  where usage_ledger.usage_type = 'apply_wizard'
    and usage_ledger.related_pursuit_id is not null
  group by usage_ledger.user_id, usage_ledger.related_pursuit_id
) as prior_usage
where pursuits.id = prior_usage.related_pursuit_id
  and pursuits.user_id = prior_usage.user_id
  and pursuits.apply_wizard_metered_at is distinct from prior_usage.metered_at;

create or replace function public.validate_apply_wizard_metered_latch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ledger_at timestamptz;
begin
  if new.apply_wizard_metered_at is null then
    if tg_op = 'UPDATE' and old.apply_wizard_metered_at is not null then
      raise exception using
        errcode = '23514',
        message = 'apply_wizard_metered_latch_cannot_be_cleared';
    end if;
    return new;
  end if;

  select min(usage_ledger.created_at)
  into v_ledger_at
  from public.usage_ledger
  where usage_ledger.user_id = new.user_id
    and usage_ledger.related_pursuit_id = new.id
    and usage_ledger.usage_type = 'apply_wizard';

  if v_ledger_at is null then
    raise exception using
      errcode = '23514',
      message = 'apply_wizard_metered_latch_requires_ledger';
  end if;

  new.apply_wizard_metered_at := v_ledger_at;
  return new;
end;
$$;

drop trigger if exists pursuits_apply_wizard_latch_before_write on public.pursuits;
create trigger pursuits_apply_wizard_latch_before_write
  before insert or update on public.pursuits
  for each row execute function public.validate_apply_wizard_metered_latch();

create or replace function public.sync_apply_wizard_latch_from_ledger()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.usage_type = 'apply_wizard'
    and new.related_pursuit_id is not null
  then
    update public.pursuits
    set apply_wizard_metered_at = coalesce(
      apply_wizard_metered_at,
      new.created_at
    )
    where pursuits.id = new.related_pursuit_id
      and pursuits.user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists usage_ledger_sync_apply_wizard_latch_after_insert
  on public.usage_ledger;
create trigger usage_ledger_sync_apply_wizard_latch_after_insert
  after insert on public.usage_ledger
  for each row execute function public.sync_apply_wizard_latch_from_ledger();

-- Replace the legacy quota trigger implementation without removing its legacy
-- pursuit/outreach behavior. The only new customer-facing quota is
-- apply_wizard. Missing subscriptions now fail closed at the database boundary.
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
  if new.usage_type not in (
    'pursuit',
    'outreach_message',
    'apply_wizard'
  ) then
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
    case new.usage_type
      when 'pursuit' then plans.pursuit_limit_monthly
      when 'outreach_message' then plans.outreach_limit_monthly
      else plans.apply_wizard_limit_monthly
    end
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
    -- Internal access-code and manual entitlements have no external renewal
    -- webhook. Derive their UTC calendar period from each committed use so a
    -- date captured at redemption cannot become a permanently stale window.
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

  -- A null legacy limit remains intentionally unlimited. The two public Apply
  -- Wizard plans and tester have explicit non-null limits.
  if v_limit is null then
    return new;
  end if;

  select coalesce(sum(usage_ledger.quantity), 0)::integer
  into v_used
  from public.usage_ledger
  where usage_ledger.user_id = new.user_id
    and usage_ledger.usage_type = new.usage_type
    and usage_ledger.created_at >= v_period_start
    and usage_ledger.created_at < v_period_end;

  if v_used + new.quantity > v_limit then
    raise exception using
      errcode = 'P0001',
      message = case new.usage_type
        when 'pursuit' then
          'pursuit_limit_reached:' || v_used || ':' || v_limit
        when 'outreach_message' then
          'outreach_message_limit_reached:' || v_used || ':' || v_limit
        else
          'apply_wizard_limit_reached:' || v_used || ':' || v_limit
      end;
  end if;

  return new;
end;
$$;

drop trigger if exists usage_ledger_quota_before_insert
  on public.usage_ledger;
create trigger usage_ledger_quota_before_insert
  before insert on public.usage_ledger
  for each row execute function public.enforce_usage_ledger_quota();

-- ---------------------------------------------------------------------------
-- Atomic access-code redemption
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

  v_period_start := (
    date_trunc('month', p_now at time zone 'UTC')
    at time zone 'UTC'
  );
  v_period_end := v_period_start + interval '1 month';

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
-- Atomic Human Path persistence and Apply Wizard debit
-- ---------------------------------------------------------------------------

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
set search_path = public, pg_temp
as $$
declare
  v_pursuit public.pursuits%rowtype;
  v_plan_id uuid;
  v_source text;
  v_subscription_status text;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_limit integer;
  v_used integer := 0;
  v_remaining integer;
  v_now timestamptz;
  v_contact_count integer;
  v_existing_contact_count integer;
  v_latest_provider_version integer := 0;
  v_safe_lanes jsonb := '[]'::jsonb;
  v_safe_diagnostics jsonb;
  v_contacts jsonb := '[]'::jsonb;
  v_contact_ids jsonb := '[]'::jsonb;
  v_from_status text;
begin
  if p_pursuit_id is null or p_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'pursuit_id and user_id are required';
  end if;

  if p_contacts is null or jsonb_typeof(p_contacts) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'contacts must be a JSON array';
  end if;

  if p_diagnostics is not null
    and jsonb_typeof(p_diagnostics) <> 'object'
  then
    raise exception using
      errcode = '22023',
      message = 'diagnostics must be a JSON object';
  end if;

  if p_provider_version is null or p_provider_version < 1 then
    raise exception using
      errcode = '22023',
      message = 'provider_version must be a positive integer';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_contacts) as contact(value)
    where jsonb_typeof(contact.value) <> 'object'
      or length(btrim(coalesce(contact.value ->> 'name', ''))) not between 1 and 300
      or length(coalesce(contact.value ->> 'title', '')) > 500
      or length(coalesce(contact.value ->> 'company_name', contact.value ->> 'companyName', '')) > 500
      or coalesce(contact.value ->> 'contact_type', contact.value ->> 'contactType', '') not in (
        'likely_hiring_manager',
        'functional_leader',
        'recruiter',
        'other_useful_contact',
        'executive_sponsor',
        'referral_candidate',
        'unknown'
      )
      or coalesce(contact.value ->> 'confidence', '') not in ('low', 'medium', 'high')
      or length(coalesce(contact.value ->> 'linkedin_url', contact.value ->> 'linkedinUrl', '')) > 2000
      or length(coalesce(contact.value ->> 'professional_contact_url', contact.value ->> 'professionalContactUrl', '')) > 2000
      or (
        coalesce(contact.value -> 'verification_notes', contact.value -> 'verificationNotes') is not null
        and jsonb_typeof(coalesce(contact.value -> 'verification_notes', contact.value -> 'verificationNotes')) <> 'array'
      )
      or exists (
        select 1
        from jsonb_array_elements(
          coalesce(
            contact.value -> 'verification_notes',
            contact.value -> 'verificationNotes',
            '[]'::jsonb
          )
        ) as note(value)
        where jsonb_typeof(note.value) <> 'string'
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'contacts contain an invalid normalized contact';
  end if;

  v_now := coalesce(p_generated_at, clock_timestamp());
  v_contact_count := jsonb_array_length(p_contacts);

  select pursuits.*
  into v_pursuit
  from public.pursuits
  where pursuits.id = p_pursuit_id
    and pursuits.user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'not_found',
      'replayed', false,
      'debitAdded', false
    );
  end if;

  select count(*)::integer
  into v_existing_contact_count
  from public.contact_suggestions
  where contact_suggestions.pursuit_id = p_pursuit_id;

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

  -- Useful cached contacts are lifetime-replayable. A same/newer-version empty
  -- result is also replayable, but an incoming useful result may supersede an
  -- empty result so a fast empty race cannot suppress useful contacts.
  if v_existing_contact_count > 0
    or (
      v_existing_contact_count = 0
      and v_contact_count = 0
      and v_pursuit.status = 'human_path_generated'
      and v_latest_provider_version >= p_provider_version
    )
  then
    if v_existing_contact_count > 0
      and v_pursuit.apply_wizard_metered_at is null
    then
      raise exception using
        errcode = '23514',
        message = 'persisted_contacts_require_apply_wizard_latch';
    end if;

    select
      coalesce(
        jsonb_agg(to_jsonb(contact_suggestions) order by contact_suggestions.created_at, contact_suggestions.id),
        '[]'::jsonb
      ),
      coalesce(
        jsonb_agg(to_jsonb(contact_suggestions.id) order by contact_suggestions.created_at, contact_suggestions.id),
        '[]'::jsonb
      )
    into v_contacts, v_contact_ids
    from public.contact_suggestions
    where contact_suggestions.pursuit_id = p_pursuit_id;

    return jsonb_build_object(
      'status', 'human_path_generated',
      'replayed', true,
      'cached', true,
      'debitAdded', false,
      'pursuit', to_jsonb(v_pursuit),
      'contacts', v_contacts,
      'contactIds', v_contact_ids,
      'usage', null
    );
  end if;

  if v_pursuit.status not in ('review_complete', 'human_path_generated') then
    return jsonb_build_object(
      'status', 'invalid_pursuit_state',
      'replayed', false,
      'debitAdded', false
    );
  end if;

  if v_pursuit.job_id is null
    or not exists (
      select 1
      from public.jobs
      where jobs.id = v_pursuit.job_id
        and (jobs.owner_user_id is null or jobs.owner_user_id = p_user_id)
    )
  then
    return jsonb_build_object(
      'status', 'job_not_visible',
      'replayed', false,
      'debitAdded', false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('subscription-quota:' || p_user_id::text, 0)
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
    v_subscription_status,
    v_period_start,
    v_period_end,
    v_limit
  from public.user_subscriptions as subscriptions
  join public.subscription_plans as plans
    on plans.id = subscriptions.plan_id
  where subscriptions.user_id = p_user_id
  for update of subscriptions;

  if not found then
    return jsonb_build_object(
      'status', 'subscription_missing',
      'replayed', false,
      'debitAdded', false
    );
  end if;

  if v_subscription_status not in ('active', 'trialing') then
    return jsonb_build_object(
      'status', 'subscription_inactive',
      'subscriptionStatus', v_subscription_status,
      'replayed', false,
      'debitAdded', false
    );
  end if;

  if v_source = 'stripe' then
    if v_period_start is null
      or v_period_end is null
      or v_now < v_period_start
      or v_now >= v_period_end
    then
      return jsonb_build_object(
        'status', 'subscription_period_invalid',
        'replayed', false,
        'debitAdded', false
      );
    end if;
  else
    v_period_start := (
      date_trunc('month', v_now at time zone 'UTC')
      at time zone 'UTC'
    );
    v_period_end := v_period_start + interval '1 month';
  end if;

  if v_period_end <= v_period_start then
    return jsonb_build_object(
      'status', 'subscription_period_invalid',
      'replayed', false,
      'debitAdded', false
    );
  end if;

  if v_limit is null then
    return jsonb_build_object(
      'status', 'plan_missing',
      'replayed', false,
      'debitAdded', false
    );
  end if;

  select coalesce(sum(usage_ledger.quantity), 0)::integer
  into v_used
  from public.usage_ledger
  where usage_ledger.user_id = p_user_id
    and usage_ledger.usage_type = 'apply_wizard'
    and usage_ledger.created_at >= v_period_start
    and usage_ledger.created_at < v_period_end;

  v_remaining := greatest(v_limit - v_used, 0);

  if v_contact_count > 0 and v_remaining = 0 then
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

  -- Only explicitly allowlisted aggregate diagnostics are persisted.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'lane', lane.value ->> 'lane',
        'discoveryStatus', case
          when lane.value ->> 'discoveryStatus' in ('completed', 'provider_unavailable')
          then lane.value ->> 'discoveryStatus'
          else 'completed'
        end,
        'retrievedCount', case
          when coalesce(lane.value ->> 'retrievedCount', '') ~ '^[0-9]+$'
          then (lane.value ->> 'retrievedCount')::integer
          else 0
        end,
        'exactCompanyCount', case
          when coalesce(lane.value ->> 'exactCompanyCount', '') ~ '^[0-9]+$'
          then (lane.value ->> 'exactCompanyCount')::integer
          else 0
        end,
        'returnedCount', case
          when coalesce(lane.value ->> 'returnedCount', '') ~ '^[0-9]+$'
          then (lane.value ->> 'returnedCount')::integer
          else 0
        end
      )
      order by lane.ordinality
    ),
    '[]'::jsonb
  )
  into v_safe_lanes
  from jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(p_diagnostics, '{}'::jsonb) -> 'lanes') = 'array'
      then coalesce(p_diagnostics, '{}'::jsonb) -> 'lanes'
      else '[]'::jsonb
    end
  ) with ordinality as lane(value, ordinality)
  where lane.value ->> 'lane' in (
    'likely_hiring_manager',
    'recruiter',
    'functional_leader'
  );

  v_safe_diagnostics := jsonb_build_object(
    'schemaVersion', 2,
    'lanes', v_safe_lanes,
    'retrievedCount', case
      when coalesce(p_diagnostics ->> 'retrievedCount', '') ~ '^[0-9]+$'
      then (p_diagnostics ->> 'retrievedCount')::integer
      else 0
    end,
    'exactCompanyCount', case
      when coalesce(p_diagnostics ->> 'exactCompanyCount', '') ~ '^[0-9]+$'
      then (p_diagnostics ->> 'exactCompanyCount')::integer
      else 0
    end,
    'returnedCount', v_contact_count,
    'excluded', jsonb_build_object(
      'companyMismatchCount', case
        when coalesce(p_diagnostics #>> '{excluded,companyMismatchCount}', '') ~ '^[0-9]+$'
        then (p_diagnostics #>> '{excluded,companyMismatchCount}')::integer
        else 0
      end,
      'missingLinkedinCount', case
        when coalesce(p_diagnostics #>> '{excluded,missingLinkedinCount}', '') ~ '^[0-9]+$'
        then (p_diagnostics #>> '{excluded,missingLinkedinCount}')::integer
        else 0
      end,
      'duplicateCount', case
        when coalesce(p_diagnostics #>> '{excluded,duplicateCount}', '') ~ '^[0-9]+$'
        then (p_diagnostics #>> '{excluded,duplicateCount}')::integer
        else 0
      end
    )
  );

  v_from_status := v_pursuit.status;

  if v_contact_count > 0 then
    insert into public.contact_suggestions (
      pursuit_id,
      job_id,
      name,
      title,
      company_name,
      linkedin_url,
      professional_contact_url,
      email,
      contact_type,
      confidence,
      relevance_reason,
      role_connection,
      verification_notes,
      selected_for_outreach,
      created_at,
      updated_at
    )
    select
      p_pursuit_id,
      v_pursuit.job_id,
      btrim(contact.value ->> 'name'),
      btrim(coalesce(contact.value ->> 'title', '')),
      btrim(coalesce(contact.value ->> 'company_name', contact.value ->> 'companyName', '')),
      nullif(btrim(coalesce(contact.value ->> 'linkedin_url', contact.value ->> 'linkedinUrl', '')), ''),
      nullif(btrim(coalesce(contact.value ->> 'professional_contact_url', contact.value ->> 'professionalContactUrl', '')), ''),
      null,
      coalesce(contact.value ->> 'contact_type', contact.value ->> 'contactType'),
      contact.value ->> 'confidence',
      btrim(coalesce(contact.value ->> 'relevance_reason', contact.value ->> 'relevanceReason', '')),
      btrim(coalesce(contact.value ->> 'role_connection', contact.value ->> 'roleConnection', '')),
      array(
        select note.value #>> '{}'
        from jsonb_array_elements(
          coalesce(
            contact.value -> 'verification_notes',
            contact.value -> 'verificationNotes',
            '[]'::jsonb
          )
        ) as note(value)
      ),
      false,
      v_now,
      v_now
    from jsonb_array_elements(p_contacts) as contact(value);
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
    'human_path_generated',
    v_from_status,
    'human_path_generated',
    case when v_contact_count > 0 then 'apply_wizard' else null end,
    jsonb_build_object(
      'contactCount', v_contact_count,
      'providerVersion', p_provider_version,
      'diagnostics', v_safe_diagnostics
    ),
    v_now
  );

  if v_contact_count > 0 then
    insert into public.usage_ledger (
      user_id,
      plan_id,
      usage_type,
      quantity,
      related_job_id,
      related_pursuit_id,
      created_at
    ) values (
      p_user_id,
      v_plan_id,
      'apply_wizard',
      1,
      v_pursuit.job_id,
      p_pursuit_id,
      v_now
    );
    v_used := v_used + 1;
  end if;

  update public.pursuits
  set
    status = 'human_path_generated',
    last_activity_at = v_now,
    updated_at = v_now
  where pursuits.id = p_pursuit_id
    and pursuits.user_id = p_user_id
  returning pursuits.* into v_pursuit;

  select
    coalesce(
      jsonb_agg(to_jsonb(contact_suggestions) order by contact_suggestions.created_at, contact_suggestions.id),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(to_jsonb(contact_suggestions.id) order by contact_suggestions.created_at, contact_suggestions.id),
      '[]'::jsonb
    )
  into v_contacts, v_contact_ids
  from public.contact_suggestions
  where contact_suggestions.pursuit_id = p_pursuit_id;

  v_remaining := greatest(v_limit - v_used, 0);

  return jsonb_build_object(
    'status', 'human_path_generated',
    'replayed', false,
    'cached', false,
    'debitAdded', v_contact_count > 0,
    'pursuit', to_jsonb(v_pursuit),
    'contacts', v_contacts,
    'contactIds', v_contact_ids,
    'usage', jsonb_build_object(
      'used', v_used,
      'limit', v_limit,
      'remaining', v_remaining,
      'periodStart', v_period_start,
      'periodEnd', v_period_end,
      'finalUse', v_contact_count > 0 and v_remaining = 0
    )
  );
end;
$$;

-- Functions and mutation triggers are service boundaries, not public client APIs.
revoke all on function public.validate_apply_wizard_metered_latch()
  from public, anon, authenticated;
revoke all on function public.sync_apply_wizard_latch_from_ledger()
  from public, anon, authenticated;
revoke all on function public.prevent_stripe_subscription_source_replacement()
  from public, anon, authenticated;
revoke all on function public.enforce_usage_ledger_quota()
  from public, anon, authenticated;
revoke all on function public.redeem_access_code_subscription(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.persist_human_path_generation(uuid, uuid, jsonb, jsonb, integer, timestamptz)
  from public, anon, authenticated;

grant execute on function public.redeem_access_code_subscription(uuid, text, timestamptz)
  to service_role;
grant execute on function public.persist_human_path_generation(uuid, uuid, jsonb, jsonb, integer, timestamptz)
  to service_role;

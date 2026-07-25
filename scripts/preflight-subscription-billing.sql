-- Read-only production preflight for the Smoldering / Roaring migration sequence.
-- This report returns aggregate state only. It performs no writes and emits no
-- user identifiers, contact details, provider payloads, or secret values.

with contact_evidence as (
  select
    pursuits.id as pursuit_id,
    pursuits.user_id,
    min(contacts.created_at) as first_contact_at
  from public.pursuits as pursuits
  join public.contact_suggestions as contacts
    on contacts.pursuit_id = pursuits.id
  group by pursuits.id, pursuits.user_id
),
positive_event_evidence as (
  select
    events.pursuit_id,
    min(events.created_at) as first_positive_event_at
  from public.pursuit_events as events
  where events.event_type = 'human_path_generated'
    and coalesce(events.payload ->> 'contactCount', '') ~ '^[0-9]+$'
    and (events.payload ->> 'contactCount')::integer > 0
  group by events.pursuit_id
),
backfill_candidates as (
  select
    contact_evidence.pursuit_id,
    contact_evidence.user_id,
    coalesce(
      positive_event_evidence.first_positive_event_at,
      contact_evidence.first_contact_at
    ) as metered_at
  from contact_evidence
  left join positive_event_evidence
    on positive_event_evidence.pursuit_id = contact_evidence.pursuit_id
)
select jsonb_build_object(
  'checkedAt', clock_timestamp(),
  'database', current_database(),
  'recordedMigrationHistory', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'version', migrations.version,
        'name', migrations.name
      )
      order by migrations.version
    )
    from supabase_migrations.schema_migrations as migrations
    where migrations.version in (
      '20260724000200',
      '20260724000300',
      '20260724000400',
      '20260724000500',
      '20260724000600'
    )
  ), '[]'::jsonb),
  'missingMigrationHistory', coalesce((
    select jsonb_agg(targets.version order by targets.version)
    from (
      values
        ('20260724000200'),
        ('20260724000300'),
        ('20260724000400'),
        ('20260724000500'),
        ('20260724000600')
    ) as targets(version)
    where not exists (
      select 1
      from supabase_migrations.schema_migrations as migrations
      where migrations.version = targets.version
    )
  ), '[]'::jsonb),
  'schemaPresence', jsonb_build_object(
    'providerUsageEventsTable',
      to_regclass('public.provider_usage_events') is not null,
    'jobsSourceContentHashColumn', exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'jobs'
        and column_name = 'source_content_hash'
    ),
    'jobsRefinementStateColumn', exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'jobs'
        and column_name = 'refinement_state'
    ),
    'jobLinkExtractionClaimsTable',
      to_regclass('public.job_link_extraction_claims') is not null,
    'planApplyWizardLimitColumn', exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'subscription_plans'
        and column_name = 'apply_wizard_limit_monthly'
    ),
    'subscriptionSourceColumn', exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_subscriptions'
        and column_name = 'source'
    ),
    'pursuitApplyWizardLatchColumn', exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'pursuits'
        and column_name = 'apply_wizard_metered_at'
    )
  ),
  'planSnapshot', coalesce((
    select jsonb_agg(to_jsonb(snapshot) order by snapshot.name)
    from (
      select
        plans.name,
        plans.price_monthly as "priceMonthly",
        plans.profile_export as "profileExport",
        plans.pursuit_limit_monthly as "pursuitLimitMonthly",
        plans.human_path_limit_monthly as "humanPathLimitMonthly",
        plans.outreach_limit_monthly as "outreachLimitMonthly",
        count(subscriptions.id)::integer as "subscriptionCount",
        count(subscriptions.id) filter (
          where subscriptions.status in ('active', 'trialing')
        )::integer as "activeSubscriptionCount"
      from public.subscription_plans as plans
      left join public.user_subscriptions as subscriptions
        on subscriptions.plan_id = plans.id
      group by plans.id
    ) as snapshot
  ), '[]'::jsonb),
  'subscriptionStatusCounts', coalesce((
    select jsonb_agg(to_jsonb(counts) order by counts.status)
    from (
      select
        subscriptions.status,
        count(*)::integer as count
      from public.user_subscriptions as subscriptions
      group by subscriptions.status
    ) as counts
  ), '[]'::jsonb),
  'accessCodeSnapshot', coalesce((
    select jsonb_agg(to_jsonb(snapshot) order by snapshot."planName")
    from (
      select
        access_codes.plan_name as "planName",
        count(*)::integer as "codeCount",
        coalesce(sum(access_codes.use_count), 0)::integer as "recordedUseCount",
        count(*) filter (
          where access_codes.expires_at is null
            or access_codes.expires_at > clock_timestamp()
        )::integer as "unexpiredCodeCount"
      from public.access_codes
      group by access_codes.plan_name
    ) as snapshot
  ), '[]'::jsonb),
  'usageTypeCounts', coalesce((
    select jsonb_agg(to_jsonb(counts) order by counts."usageType")
    from (
      select
        usage_ledger.usage_type as "usageType",
        count(*)::integer as "rowCount",
        coalesce(sum(usage_ledger.quantity), 0)::integer as quantity
      from public.usage_ledger
      group by usage_ledger.usage_type
    ) as counts
  ), '[]'::jsonb),
  'backfillEvidence', jsonb_build_object(
    'contactSuggestionCount', (
      select count(*)::integer
      from public.contact_suggestions
    ),
    'pursuitsWithPersistedContacts', (
      select count(*)::integer from backfill_candidates
    ),
    'usersWithBackfillCandidates', (
      select count(distinct backfill_candidates.user_id)::integer
      from backfill_candidates
    ),
    'maxBackfillCandidatesPerUser', coalesce((
      select max(per_user.count)::integer
      from (
        select count(*)::integer as count
        from backfill_candidates
        group by backfill_candidates.user_id
      ) as per_user
    ), 0),
    'currentUtcMonthBackfillCandidates', (
      select count(*)::integer
      from backfill_candidates
      where backfill_candidates.metered_at >= (
        date_trunc('month', clock_timestamp() at time zone 'UTC')
        at time zone 'UTC'
      )
        and backfill_candidates.metered_at < (
          date_trunc('month', clock_timestamp() at time zone 'UTC')
          at time zone 'UTC'
        ) + interval '1 month'
    ),
    'activeLegacyProSubscriptions', (
      select count(*)::integer
      from public.user_subscriptions as subscriptions
      join public.subscription_plans as plans
        on plans.id = subscriptions.plan_id
      where plans.name = 'pro'
        and subscriptions.status in ('active', 'trialing')
    ),
    'activeRetailPlanSubscriptions', (
      select count(*)::integer
      from public.user_subscriptions as subscriptions
      join public.subscription_plans as plans
        on plans.id = subscriptions.plan_id
      where plans.name in ('basic', 'premium')
        and subscriptions.status in ('active', 'trialing')
    )
  )
) as preflight;

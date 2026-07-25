-- Aggregate-only production postflight for migration 20260724000600.
-- This report performs no writes and emits no user identifiers, Stripe
-- identifiers, access codes, contact details, or provider payloads.

select jsonb_build_object(
  'checkedAt', clock_timestamp(),
  'migrationRecorded', exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260724000600'
      and name = 'subscription_billing_two_tier'
  ),
  'schemaPresence', jsonb_build_object(
    'planApplyWizardLimitColumn', exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'subscription_plans'
        and column_name = 'apply_wizard_limit_monthly'
    ),
    'planMarkdownExportColumn', exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'subscription_plans'
        and column_name = 'markdown_export'
    ),
    'subscriptionSourceColumn', exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_subscriptions'
        and column_name = 'source'
    ),
    'subscriptionStripeLifecycleColumns', (
      select count(*) = 8
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_subscriptions'
        and column_name in (
          'stripe_customer_id',
          'stripe_subscription_id',
          'stripe_price_id',
          'stripe_status_raw',
          'cancel_at_period_end',
          'canceled_at',
          'latest_invoice_id',
          'last_stripe_event_created_at'
        )
    ),
    'pursuitApplyWizardLatchColumn', exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'pursuits'
        and column_name = 'apply_wizard_metered_at'
    )
  ),
  'planCatalog', coalesce((
    select jsonb_agg(to_jsonb(catalog) order by catalog.name)
    from (
      select
        plans.name,
        plans.price_monthly as "priceMonthly",
        plans.apply_wizard_limit_monthly as "applyWizardLimitMonthly",
        plans.markdown_export as "markdownExport",
        plans.publicly_available as "publiclyAvailable",
        plans.internal_only as "internalOnly",
        plans.retired_at is not null as retired,
        count(subscriptions.id)::integer as "subscriptionCount"
      from public.subscription_plans as plans
      left join public.user_subscriptions as subscriptions
        on subscriptions.plan_id = plans.id
      group by plans.id
    ) as catalog
  ), '[]'::jsonb),
  'subscriptionSourceCounts', coalesce((
    select jsonb_agg(to_jsonb(counts) order by counts."planName", counts.source, counts.status)
    from (
      select
        plans.name as "planName",
        subscriptions.source,
        subscriptions.status,
        count(*)::integer as count
      from public.user_subscriptions as subscriptions
      join public.subscription_plans as plans
        on plans.id = subscriptions.plan_id
      group by plans.name, subscriptions.source, subscriptions.status
    ) as counts
  ), '[]'::jsonb),
  'applyWizardBackfill', jsonb_build_object(
    'rowCount', (
      select count(*)::integer
      from public.usage_ledger
      where usage_type = 'apply_wizard'
    ),
    'quantity', (
      select coalesce(sum(quantity), 0)::integer
      from public.usage_ledger
      where usage_type = 'apply_wizard'
    ),
    'userCount', (
      select count(distinct user_id)::integer
      from public.usage_ledger
      where usage_type = 'apply_wizard'
    ),
    'pursuitCount', (
      select count(distinct related_pursuit_id)::integer
      from public.usage_ledger
      where usage_type = 'apply_wizard'
    ),
    'currentUtcMonthRows', (
      select count(*)::integer
      from public.usage_ledger
      where usage_type = 'apply_wizard'
        and created_at >= (
          date_trunc('month', clock_timestamp() at time zone 'UTC')
          at time zone 'UTC'
        )
        and created_at < (
          date_trunc('month', clock_timestamp() at time zone 'UTC')
          at time zone 'UTC'
        ) + interval '1 month'
    ),
    'nonUnitRows', (
      select count(*)::integer
      from public.usage_ledger
      where usage_type = 'apply_wizard'
        and quantity <> 1
    ),
    'duplicatePursuitRows', (
      select count(*)::integer
      from (
        select related_pursuit_id
        from public.usage_ledger
        where usage_type = 'apply_wizard'
        group by related_pursuit_id
        having count(*) > 1
      ) as duplicates
    ),
    'debitsWithoutLatch', (
      select count(*)::integer
      from public.usage_ledger as usage
      join public.pursuits
        on pursuits.id = usage.related_pursuit_id
      where usage.usage_type = 'apply_wizard'
        and pursuits.apply_wizard_metered_at is null
    ),
    'latchesWithoutDebit', (
      select count(*)::integer
      from public.pursuits
      where pursuits.apply_wizard_metered_at is not null
        and not exists (
          select 1
          from public.usage_ledger as usage
          where usage.usage_type = 'apply_wizard'
            and usage.related_pursuit_id = pursuits.id
        )
    )
  ),
  'rpcSecurity', jsonb_build_object(
    'redeemExists',
      to_regprocedure(
        'public.redeem_access_code_subscription(uuid,text,timestamp with time zone)'
      ) is not null,
    'persistExists',
      to_regprocedure(
        'public.persist_human_path_generation(uuid,uuid,jsonb,jsonb,integer,timestamp with time zone)'
      ) is not null,
    'anonCanRedeem', has_function_privilege(
      'anon',
      'public.redeem_access_code_subscription(uuid,text,timestamp with time zone)',
      'EXECUTE'
    ),
    'authenticatedCanRedeem', has_function_privilege(
      'authenticated',
      'public.redeem_access_code_subscription(uuid,text,timestamp with time zone)',
      'EXECUTE'
    ),
    'serviceCanRedeem', has_function_privilege(
      'service_role',
      'public.redeem_access_code_subscription(uuid,text,timestamp with time zone)',
      'EXECUTE'
    ),
    'anonCanPersist', has_function_privilege(
      'anon',
      'public.persist_human_path_generation(uuid,uuid,jsonb,jsonb,integer,timestamp with time zone)',
      'EXECUTE'
    ),
    'authenticatedCanPersist', has_function_privilege(
      'authenticated',
      'public.persist_human_path_generation(uuid,uuid,jsonb,jsonb,integer,timestamp with time zone)',
      'EXECUTE'
    ),
    'serviceCanPersist', has_function_privilege(
      'service_role',
      'public.persist_human_path_generation(uuid,uuid,jsonb,jsonb,integer,timestamp with time zone)',
      'EXECUTE'
    )
  )
) as postflight;

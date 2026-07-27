-- Aggregate-only, read-only postflight for
-- 20260726000100_stripe_billing_backend.sql.
--
-- This report emits no user IDs, Stripe IDs, access codes, or secret values.

select jsonb_build_object(
  'checkedAt', clock_timestamp(),
  'migrationRecorded', exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260726000100'
  ),
  'schemaPresence', jsonb_build_object(
    'webhookEventsTable',
      to_regclass('public.stripe_webhook_events') is not null,
    'snapshotRetrievalWatermark', exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_subscriptions'
        and column_name = 'stripe_snapshot_retrieved_at'
    ),
    'claimRpc',
      to_regprocedure(
        'public.claim_stripe_webhook_event(text,text,text,timestamp with time zone,timestamp with time zone)'
      ) is not null,
    'markFailedRpc',
      to_regprocedure(
        'public.mark_stripe_webhook_event_failed(text,text)'
      ) is not null,
    'markProcessedRpc',
      to_regprocedure(
        'public.mark_stripe_webhook_event_processed(text)'
      ) is not null,
    'persistSnapshotRpc',
      to_regprocedure(
        'public.persist_stripe_subscription_snapshot(text,timestamp with time zone,timestamp with time zone,uuid,text,text,text,text,text,text,boolean,timestamp with time zone,text,timestamp with time zone,timestamp with time zone)'
      ) is not null,
    'reconcileSnapshotRpc',
      to_regprocedure(
        'public.reconcile_stripe_subscription_snapshot(uuid,timestamp with time zone,text,text,text,text,text,text,boolean,timestamp with time zone,text,timestamp with time zone,timestamp with time zone)'
      ) is not null
  ),
  'rpcSecurity', jsonb_build_object(
    'anonCanClaim', has_function_privilege(
      'anon',
      'public.claim_stripe_webhook_event(text,text,text,timestamp with time zone,timestamp with time zone)',
      'EXECUTE'
    ),
    'authenticatedCanClaim', has_function_privilege(
      'authenticated',
      'public.claim_stripe_webhook_event(text,text,text,timestamp with time zone,timestamp with time zone)',
      'EXECUTE'
    ),
    'serviceCanClaim', has_function_privilege(
      'service_role',
      'public.claim_stripe_webhook_event(text,text,text,timestamp with time zone,timestamp with time zone)',
      'EXECUTE'
    ),
    'anonCanPersist', has_function_privilege(
      'anon',
      'public.persist_stripe_subscription_snapshot(text,timestamp with time zone,timestamp with time zone,uuid,text,text,text,text,text,text,boolean,timestamp with time zone,text,timestamp with time zone,timestamp with time zone)',
      'EXECUTE'
    ),
    'authenticatedCanPersist', has_function_privilege(
      'authenticated',
      'public.persist_stripe_subscription_snapshot(text,timestamp with time zone,timestamp with time zone,uuid,text,text,text,text,text,text,boolean,timestamp with time zone,text,timestamp with time zone,timestamp with time zone)',
      'EXECUTE'
    ),
    'serviceCanPersist', has_function_privilege(
      'service_role',
      'public.persist_stripe_subscription_snapshot(text,timestamp with time zone,timestamp with time zone,uuid,text,text,text,text,text,text,boolean,timestamp with time zone,text,timestamp with time zone,timestamp with time zone)',
      'EXECUTE'
    ),
    'anonCanReconcile', has_function_privilege(
      'anon',
      'public.reconcile_stripe_subscription_snapshot(uuid,timestamp with time zone,text,text,text,text,text,text,boolean,timestamp with time zone,text,timestamp with time zone,timestamp with time zone)',
      'EXECUTE'
    ),
    'authenticatedCanReconcile', has_function_privilege(
      'authenticated',
      'public.reconcile_stripe_subscription_snapshot(uuid,timestamp with time zone,text,text,text,text,text,text,boolean,timestamp with time zone,text,timestamp with time zone,timestamp with time zone)',
      'EXECUTE'
    ),
    'serviceCanReconcile', has_function_privilege(
      'service_role',
      'public.reconcile_stripe_subscription_snapshot(uuid,timestamp with time zone,text,text,text,text,text,text,boolean,timestamp with time zone,text,timestamp with time zone,timestamp with time zone)',
      'EXECUTE'
    )
  ),
  'repositorySecurity', jsonb_build_object(
    'serviceReadsUserSubscriptions',
      has_table_privilege('service_role', 'public.user_subscriptions', 'SELECT'),
    'serviceReadsSubscriptionPlans',
      has_table_privilege('service_role', 'public.subscription_plans', 'SELECT'),
    'serviceReadsUsageLedger',
      has_table_privilege('service_role', 'public.usage_ledger', 'SELECT')
  ),
  'eventProcessing', coalesce((
    select jsonb_agg(to_jsonb(counts) order by counts."processingStatus")
    from (
      select
        processing_status as "processingStatus",
        count(*)::integer as count,
        coalesce(sum(attempt_count), 0)::integer as "attemptCount"
      from public.stripe_webhook_events
      group by processing_status
    ) counts
  ), '[]'::jsonb),
  'subscriptionSources', coalesce((
    select jsonb_agg(to_jsonb(counts) order by counts."planName", counts.source, counts.status)
    from (
      select
        plans.name as "planName",
        subscriptions.source,
        subscriptions.status,
        count(*)::integer as count
      from public.user_subscriptions subscriptions
      join public.subscription_plans plans on plans.id = subscriptions.plan_id
      group by plans.name, subscriptions.source, subscriptions.status
    ) counts
  ), '[]'::jsonb),
  'stripeRowsMissingIdentity', (
    select count(*)::integer
    from public.user_subscriptions
    where source = 'stripe'
      and (
        stripe_customer_id is null
        or stripe_subscription_id is null
        or stripe_price_id is null
        or stripe_status_raw is null
        or current_period_start is null
        or current_period_end is null
        or stripe_snapshot_retrieved_at is null
      )
  ),
  'nonStripeRowsWithStripeIdentity', (
    select count(*)::integer
    from public.user_subscriptions
    where source <> 'stripe'
      and (
        stripe_customer_id is not null
        or stripe_subscription_id is not null
        or stripe_price_id is not null
        or stripe_status_raw is not null
        or latest_invoice_id is not null
        or last_stripe_event_created_at is not null
        or stripe_snapshot_retrieved_at is not null
      )
  ),
  'duplicateStripeCustomers', (
    select count(*)::integer
    from (
      select stripe_customer_id
      from public.user_subscriptions
      where stripe_customer_id is not null
      group by stripe_customer_id
      having count(*) > 1
    ) duplicates
  ),
  'duplicateStripeSubscriptions', (
    select count(*)::integer
    from (
      select stripe_subscription_id
      from public.user_subscriptions
      where stripe_subscription_id is not null
      group by stripe_subscription_id
      having count(*) > 1
    ) duplicates
  )
) as stripe_billing_postflight;

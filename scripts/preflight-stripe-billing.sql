-- Aggregate-only, read-only preflight for
-- 20260726000100_stripe_billing_backend.sql.
--
-- This report emits no user IDs, Stripe IDs, access codes, or secret values.

select jsonb_build_object(
  'checkedAt', clock_timestamp(),
  'priorSubscriptionMigrationRecorded', exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260724000600'
  ),
  'outreachMeteringMigrationRecorded', exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260725000100'
  ),
  'stripeBillingMigrationRecorded', exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260726000100'
  ),
  'webhookEventTableAlreadyPresent',
    to_regclass('public.stripe_webhook_events') is not null,
  'subscriptionLifecycleColumns', (
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
  'snapshotRetrievalWatermarkAlreadyPresent', exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_subscriptions'
      and column_name = 'stripe_snapshot_retrieved_at'
  ),
  'subscriptionSources', coalesce((
    select jsonb_agg(to_jsonb(counts) order by counts.source, counts.status)
    from (
      select source, status, count(*)::integer as count
      from public.user_subscriptions
      group by source, status
    ) counts
  ), '[]'::jsonb),
  'stripeLinkedRows', (
    select count(*)::integer
    from public.user_subscriptions
    where source = 'stripe'
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
      )
  ),
  'stripeRowsMissingIdentity', (
    select count(*)::integer
    from public.user_subscriptions
    where source = 'stripe'
      and (
        stripe_customer_id is null
        or stripe_subscription_id is null
        or stripe_price_id is null
        or stripe_status_raw is null
      )
  )
) as stripe_billing_preflight;

-- Aggregate-only production preflight for
-- 20260725000100_outreach_metering_removal.sql.
--
-- This script is read-only and intentionally returns no user, pursuit, job,
-- contact, message, or subscription identifiers.

select jsonb_build_object(
  'migration_recorded', (
    select count(*)
    from supabase_migrations.schema_migrations
    where version = '20260725000100'
  ),
  'outreach_rpc_present', (
    to_regprocedure(
      'public.persist_initial_outreach_generation(uuid,uuid,jsonb,text)'
    ) is not null
  ),
  'generation_requests', (
    select jsonb_build_object(
      'total', count(*),
      'pursuit_debit_recorded', count(*) filter (where pursuit_debit_added),
      'outreach_debit_quantity', coalesce(sum(outreach_debit_quantity), 0),
      'zero_debit_quantity', count(*) filter (where outreach_debit_quantity = 0)
    )
    from public.pursuit_outreach_generation_requests
  ),
  'legacy_usage', (
    select coalesce(
      jsonb_object_agg(
        usage_type,
        jsonb_build_object('rows', row_count, 'quantity', total_quantity)
      ),
      '{}'::jsonb
    )
    from (
      select
        usage_type,
        count(*) as row_count,
        coalesce(sum(quantity), 0) as total_quantity
      from public.usage_ledger
      where usage_type in ('pursuit', 'outreach_message')
      group by usage_type
    ) grouped_usage
  ),
  'outreach_messages', (
    select count(*) from public.outreach_messages
  ),
  'outreach_pursuits_without_apply_wizard_latch', (
    select count(*)
    from (
      select distinct pursuits.id
      from public.pursuits
      join public.outreach_messages
        on outreach_messages.pursuit_id = pursuits.id
      where pursuits.apply_wizard_metered_at is null
    ) unlatched
  ),
  'duplicate_contact_messages', (
    select count(*)
    from (
      select pursuit_id, contact_suggestion_id
      from public.outreach_messages
      where contact_suggestion_id is not null
      group by pursuit_id, contact_suggestion_id
      having count(*) > 1
    ) duplicates
  ),
  'active_subscriptions', (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'plan', plan_name,
          'source', source,
          'count', subscription_count
        )
        order by plan_name, source
      ),
      '[]'::jsonb
    )
    from (
      select
        subscription_plans.name as plan_name,
        user_subscriptions.source,
        count(*) as subscription_count
      from public.user_subscriptions
      join public.subscription_plans
        on subscription_plans.id = user_subscriptions.plan_id
      where user_subscriptions.status in ('active', 'trialing')
      group by subscription_plans.name, user_subscriptions.source
    ) grouped_subscriptions
  )
) as outreach_metering_preflight;

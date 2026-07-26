-- Aggregate-only schema/data postflight for
-- 20260725000100_outreach_metering_removal.sql.
--
-- A successful schema postflight does not replace authenticated production QA.

select jsonb_build_object(
  'migration_recorded', (
    select count(*)
    from supabase_migrations.schema_migrations
    where version = '20260725000100'
  ),
  'request_debit_constraint', (
    select pg_get_constraintdef(pg_constraint.oid)
    from pg_constraint
    where pg_constraint.conrelid =
      'public.pursuit_outreach_generation_requests'::regclass
      and pg_constraint.conname = 'pursuit_outreach_debit_quantity_check'
  ),
  'generation_requests', (
    select jsonb_build_object(
      'total', count(*),
      'historical_positive_debits', count(*) filter (
        where pursuit_debit_added or outreach_debit_quantity > 0
      ),
      'new_zero_debit_shape', count(*) filter (
        where not pursuit_debit_added and outreach_debit_quantity = 0
      )
    )
    from public.pursuit_outreach_generation_requests
  ),
  'quota_function_apply_wizard_only', (
    select
      pg_get_functiondef(
        'public.enforce_usage_ledger_quota()'::regprocedure
      ) like '%new.usage_type <> ''apply_wizard''%'
  ),
  'outreach_rpc_requires_apply_wizard_latch', (
    select
      pg_get_functiondef(
        'public.persist_initial_outreach_generation(uuid,uuid,jsonb,text)'::regprocedure
      ) like '%apply_wizard_latch_required_for_outreach%'
  ),
  'outreach_rpc_writes_legacy_usage', (
    select
      pg_get_functiondef(
        'public.persist_initial_outreach_generation(uuid,uuid,jsonb,text)'::regprocedure
      ) like '%insert into public.usage_ledger%'
  ),
  'outreach_rpc_privileges', (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'grantee', grantee,
          'privilege', privilege_type
        )
        order by grantee, privilege_type
      ),
      '[]'::jsonb
    )
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'persist_initial_outreach_generation'
      and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
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
  'duplicate_contact_messages', (
    select count(*)
    from (
      select pursuit_id, contact_suggestion_id
      from public.outreach_messages
      where contact_suggestion_id is not null
      group by pursuit_id, contact_suggestion_id
      having count(*) > 1
    ) duplicates
  )
) as outreach_metering_postflight;

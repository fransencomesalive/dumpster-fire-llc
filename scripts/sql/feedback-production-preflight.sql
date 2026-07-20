-- Read-only release gate for 20260719000100_feedback_capture.sql.
-- Expected before apply: all 20260718 migrations recorded, 20260719 absent,
-- job_match_feedback absent, and every saved-message compatibility count zero.

select jsonb_build_object(
  'saved_pursuits_migrations', (
    select coalesce(jsonb_agg(version order by version), '[]'::jsonb)
    from supabase_migrations.schema_migrations
    where version in ('20260718000100', '20260718000200', '20260718000300')
  ),
  'feedback_migration_recorded', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260719000100'
  ),
  'job_match_feedback_table', to_regclass('public.job_match_feedback'),
  'saved_message_feedback_rows', (
    select count(*) from public.saved_message_feedback
  ),
  'duplicate_message_feedback_keys', (
    select count(*)
    from (
      select user_id, outreach_message_id, feedback_type
      from public.saved_message_feedback
      group by user_id, outreach_message_id, feedback_type
      having count(*) > 1
    ) duplicates
  ),
  'notes_over_500', (
    select count(*) from public.saved_message_feedback
    where notes is not null and length(notes) > 500
  ),
  'ownership_mismatches', (
    select count(*)
    from public.saved_message_feedback feedback
    left join public.outreach_messages message on message.id = feedback.outreach_message_id
    left join public.pursuits pursuit on pursuit.id = message.pursuit_id
    where message.id is null or pursuit.id is null or pursuit.user_id <> feedback.user_id
  ),
  'generation_requests_table', to_regclass('public.pursuit_outreach_generation_requests')
) as feedback_preflight;

create or replace function public.delete_subscription_qa_provider_usage_events(
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if not exists (
    select 1
    from auth.users
    where id = p_user_id
      and raw_user_meta_data ->> 'qa_scope' = 'subscription_flag_on'
  ) then
    raise exception using
      errcode = '42501',
      message = 'subscription_qa_scope_required';
  end if;

  delete from public.provider_usage_events
  where user_id = p_user_id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.delete_subscription_qa_provider_usage_events(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_subscription_qa_provider_usage_events(uuid)
  to service_role;

comment on function public.delete_subscription_qa_provider_usage_events(uuid) is
  'Deletes provider telemetry only for disposable subscription_flag_on QA users.';

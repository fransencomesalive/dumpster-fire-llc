revoke all on table public.provider_usage_events from service_role;
grant select, insert on table public.provider_usage_events to service_role;

comment on table public.provider_usage_events is
  'Provider cost telemetry. service_role may select and insert; QA cleanup uses a scoped RPC.';

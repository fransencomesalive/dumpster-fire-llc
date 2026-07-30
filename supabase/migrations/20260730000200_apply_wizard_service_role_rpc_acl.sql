-- Supabase grants public-schema functions to API roles when they are created.
-- These transaction boundaries accept an explicit user id and therefore must
-- remain callable only by the trusted service-role repository.

revoke all on function public.persist_pursuit_contact_selection(uuid, uuid, uuid[], timestamptz)
  from public, anon, authenticated;
revoke all on function public.persist_outreach_regeneration(uuid, uuid, uuid, text, text, jsonb, timestamptz, text, boolean)
  from public, anon, authenticated;

grant execute on function public.persist_pursuit_contact_selection(uuid, uuid, uuid[], timestamptz)
  to service_role;
grant execute on function public.persist_outreach_regeneration(uuid, uuid, uuid, text, text, jsonb, timestamptz, text, boolean)
  to service_role;

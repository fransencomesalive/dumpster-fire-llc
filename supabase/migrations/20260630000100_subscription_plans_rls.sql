-- Security Advisor fix: enable Row Level Security on the subscription_plans catalog.
-- It is read server-side with the service role (which bypasses RLS) and is not read by clients,
-- so no policy is needed — enabling RLS with no policy locks it to the service role.
alter table public.subscription_plans enable row level security;

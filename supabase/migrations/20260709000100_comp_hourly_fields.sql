-- Identity & Search remediation C2 (2026-07-09): hourly compensation targets.
-- Additive + idempotent. Yearly columns stay integers; hourly keeps cents.
alter table public.candidate_profiles
  add column if not exists target_compensation_hourly_min numeric(8,2),
  add column if not exists target_compensation_hourly_preferred numeric(8,2);

-- Onboarding findings batch (2026-07-09, decisions #1-#3): Target company types,
-- per-skill Best role fit, and Do-not-overclaim (role tracks + skills) removed
-- from the product. Idempotent. Apply AFTER the code deploy that stops
-- referencing these columns (writes already omit them; all have defaults).
alter table public.candidate_profile_preferences
  drop column if exists target_company_types;

alter table public.role_tracks
  drop column if exists do_not_overclaim;

alter table public.skill_profiles
  drop column if exists best_role_fit,
  drop column if exists do_not_overclaim;

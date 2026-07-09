-- Identity & Search remediation C1 (2026-07-09): LinkedIn / Portfolio /
-- Personal-site URL fields removed everywhere (locked decisions #1-#2).
-- Idempotent. Apply AFTER the code deploy that stops referencing these columns.
alter table public.candidate_profiles
  drop column if exists linkedin_url,
  drop column if exists portfolio_url,
  drop column if exists personal_website_url;

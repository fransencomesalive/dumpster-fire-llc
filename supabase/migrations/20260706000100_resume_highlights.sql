-- Resume highlights: curated stat/company bullets a candidate can have called out in an
-- outreach message, alongside a Work Example and a Skill (Randall, 2026-07-06). Additive,
-- defaulted column so existing resumes stay valid; captured in onboarding (separate pass).

alter table public.resumes
  add column if not exists highlights text[] not null default '{}';

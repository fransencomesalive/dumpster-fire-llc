-- Generator redesign — Phase A4 data-model migration.
-- Collapses the legacy candidate-profile schema to the generator-aligned shapes
-- defined in lib/public-profile/types.ts (A1) and sections.ts (A2).
-- OD2/D4 resolved (Randall, 2026-06-27): drop removed columns/tables now.
-- Written defensively (if-exists guards) and preserves mappable rows.

-- 1. candidate_profiles: drop work authorization + availability.
alter table public.candidate_profiles drop column if exists work_authorization;
alter table public.candidate_profiles drop column if exists availability;

-- 2. Remove Work History entirely (pulled from resumes now).
drop table if exists public.skill_work_history_items;
drop table if exists public.work_history_resumes;
drop table if exists public.work_history_items;

-- 3. project_proofs -> work_examples (text-only outreach portfolio).
alter table if exists public.project_proofs rename to work_examples;

alter table public.work_examples rename column name to title;
alter table public.work_examples rename column description to context;
alter table public.work_examples add column if not exists one_hitter text not null default '';

alter table public.work_examples drop column if exists candidate_role;
alter table public.work_examples drop column if exists what_this_proves;
alter table public.work_examples drop column if exists capabilities_demonstrated;
alter table public.work_examples drop column if exists key_responsibilities_supported;
alter table public.work_examples drop column if exists required_experience_supported;
alter table public.work_examples drop column if exists industries_relevant;
alter table public.work_examples drop column if exists best_used_for;
alter table public.work_examples drop column if exists avoid_using_for;
alter table public.work_examples drop column if exists metrics_results;
alter table public.work_examples drop column if exists caveats;
alter table public.work_examples drop column if exists confidence;
alter table public.work_examples drop column if exists archived_at;

-- 3a. skill_project_proofs -> skill_work_examples.
alter table if exists public.skill_project_proofs rename to skill_work_examples;
alter table public.skill_work_examples rename column project_proof_id to work_example_id;

-- 3b. Rename the carried-over index + RLS policy to match the new table names.
alter index if exists public.project_proofs_profile_idx rename to work_examples_profile_idx;
drop policy if exists project_proofs_owner on public.work_examples;
create policy work_examples_owner on public.work_examples for all
  using (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()));

drop policy if exists skill_project_proofs_owner on public.skill_work_examples;
create policy skill_work_examples_owner on public.skill_work_examples for all
  using (exists (
    select 1 from public.skill_profiles s
    join public.candidate_profiles p on p.id = s.profile_id
    where s.id = skill_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.skill_profiles s
    join public.candidate_profiles p on p.id = s.profile_id
    where s.id = skill_id and p.user_id = auth.uid()
  ));

-- 4. Fit Signals (soft scoring, one per profile).
create table if not exists public.fit_signals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.candidate_profiles(id) on delete cascade,
  good_signals text[] not null default '{}',
  poor_fit_signals text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fit_signals enable row level security;
create policy fit_signals_owner on public.fit_signals for all
  using (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()));

-- 5. communication_style_settings -> voice_personality (no clean data mapping; recreate).
drop table if exists public.communication_style_settings;

create table if not exists public.voice_personality (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.candidate_profiles(id) on delete cascade,
  q1_value text not null default '',
  q4_opinion text not null default '',
  tone_tags text[] not null default '{}',
  avoid_tags text[] not null default '{}',
  avoid_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.voice_personality enable row level security;
create policy voice_personality_owner on public.voice_personality for all
  using (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()));

-- 6. writing_samples: sample_type -> bucket, add tags, drop why_it_works_or_fails.
drop index if exists public.writing_samples_profile_type_idx;

alter table public.writing_samples add column if not exists bucket text not null default 'sounds_like_me';
update public.writing_samples
  set bucket = case sample_type when 'hate' then 'never_sound' else 'sounds_like_me' end;
alter table public.writing_samples alter column bucket drop default;
alter table public.writing_samples
  add constraint writing_samples_bucket_check check (bucket in ('sounds_like_me', 'want_to_sound', 'never_sound'));

alter table public.writing_samples add column if not exists tags text[] not null default '{}';
alter table public.writing_samples drop column if exists sample_type;
alter table public.writing_samples drop column if exists why_it_works_or_fails;

create index if not exists writing_samples_profile_bucket_idx on public.writing_samples(profile_id, bucket);

-- 7. quality_scored_text_fields: drop removed narrative sections, tighten the check.
delete from public.quality_scored_text_fields
  where section not in ('outreach_rules', 'leadership_profile');
alter table public.quality_scored_text_fields
  drop constraint if exists quality_scored_text_fields_section_check;
alter table public.quality_scored_text_fields
  add constraint quality_scored_text_fields_section_check
  check (section in ('outreach_rules', 'leadership_profile'));

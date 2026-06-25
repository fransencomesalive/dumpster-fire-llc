create extension if not exists pgcrypto;

create table if not exists public.candidate_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'incomplete' check (status in ('incomplete', 'complete')),
  version integer not null default 1 check (version > 0),
  full_name text not null default '',
  preferred_name text,
  location text not null default '',
  work_authorization text not null default '',
  linkedin_url text,
  portfolio_url text,
  personal_website_url text,
  email text,
  remote_preference text not null default 'remote_preferred' check (remote_preference in ('remote_only', 'remote_preferred', 'hybrid_ok', 'onsite_ok')),
  target_compensation_min integer,
  target_compensation_preferred integer,
  availability text not null default '',
  generated_markdown text not null default '',
  markdown_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.candidate_profile_preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.candidate_profiles(id) on delete cascade,
  employment_types text[] not null default '{}',
  target_industries text[] not null default '{}',
  avoid_industries text[] not null default '{}',
  target_company_types text[] not null default '{}',
  avoid_companies text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_watchlist_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  company_name text not null,
  reason text not null default '',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.role_tracks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  name text not null,
  description text not null default '',
  core_positioning text not null default '',
  outreach_angle text not null default '',
  global_proof_rules text,
  target_titles text[] not null default '{}',
  key_responsibilities text[] not null default '{}',
  required_experience_patterns text[] not null default '{}',
  strong_job_signals text[] not null default '{}',
  weak_job_signals text[] not null default '{}',
  mismatch_signals text[] not null default '{}',
  do_not_overclaim text[] not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  name text not null,
  file_url text not null,
  parsed_text text not null default '',
  strengths text[] not null default '{}',
  gaps text[] not null default '{}',
  use_when text[] not null default '{}',
  avoid_when text[] not null default '{}',
  parsing_quality text not null default 'failed' check (parsing_quality in ('failed', 'weak', 'complete')),
  parsing_issues text[] not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resume_role_tracks (
  resume_id uuid not null references public.resumes(id) on delete cascade,
  role_track_id uuid not null references public.role_tracks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (resume_id, role_track_id)
);

create table if not exists public.work_history_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  company text not null,
  title text not null,
  start_date text,
  end_date text,
  "current_role" boolean not null default false,
  responsibilities text[] not null default '{}',
  accomplishments text[] not null default '{}',
  skills text[] not null default '{}',
  metrics text[] not null default '{}',
  source text not null default 'resume_parse' check (source in ('resume_parse', 'user_corrected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_history_resumes (
  work_history_item_id uuid not null references public.work_history_items(id) on delete cascade,
  resume_id uuid not null references public.resumes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (work_history_item_id, resume_id)
);

create table if not exists public.project_proofs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  name text not null,
  link text,
  description text not null default '',
  candidate_role text not null default '',
  what_this_proves text[] not null default '{}',
  capabilities_demonstrated text[] not null default '{}',
  key_responsibilities_supported text[] not null default '{}',
  required_experience_supported text[] not null default '{}',
  industries_relevant text[] not null default '{}',
  best_used_for text[] not null default '{}',
  avoid_using_for text[] not null default '{}',
  metrics_results text[] not null default '{}',
  caveats text[] not null default '{}',
  confidence text not null default 'low' check (confidence in ('low', 'medium', 'high')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.skill_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  skill_name text not null,
  proficiency text not null default 'working' check (proficiency in ('working', 'strong', 'expert')),
  evidence text[] not null default '{}',
  best_role_fit text[] not null default '{}',
  do_not_overclaim text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.skill_project_proofs (
  skill_id uuid not null references public.skill_profiles(id) on delete cascade,
  project_proof_id uuid not null references public.project_proofs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (skill_id, project_proof_id)
);

create table if not exists public.skill_work_history_items (
  skill_id uuid not null references public.skill_profiles(id) on delete cascade,
  work_history_item_id uuid not null references public.work_history_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (skill_id, work_history_item_id)
);

create table if not exists public.quality_scored_text_fields (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  section text not null check (section in ('why_people_hire_me', 'operating_style', 'decision_style', 'communication_style', 'ai_misreadings', 'outreach_rules', 'leadership_profile')),
  field_key text not null,
  value text not null default '',
  quality text not null default 'weak' check (quality in ('weak', 'complete')),
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, section, field_key)
);

create table if not exists public.communication_style_settings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.candidate_profiles(id) on delete cascade,
  preferred_tone text[] not null default '{}',
  formality_level text not null default 'medium' check (formality_level in ('low', 'medium', 'high')),
  humor_level text not null default 'light' check (humor_level in ('none', 'light', 'medium')),
  message_length_preference text not null default 'medium' check (message_length_preference in ('short', 'medium', 'long')),
  greeting_preferences text[] not null default '{}',
  signoff_preferences text[] not null default '{}',
  phrases_to_avoid text[] not null default '{}',
  phrases_that_sound_like_me text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.writing_samples (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  sample_type text not null check (sample_type in ('like', 'hate')),
  channel text not null default 'other' check (channel in ('linkedin', 'email', 'dm', 'social_post', 'other')),
  text text not null,
  why_it_works_or_fails text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outreach_rule_sets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.candidate_profiles(id) on delete cascade,
  global_rules text[] not null default '{}',
  follow_up_rules text[] not null default '{}',
  link_selection_rules text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.role_track_outreach_rules (
  id uuid primary key default gen_random_uuid(),
  role_track_id uuid not null references public.role_tracks(id) on delete cascade,
  rules text[] not null default '{}',
  preferred_proof_types text[] not null default '{}',
  avoid_proof_types text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leadership_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.candidate_profiles(id) on delete cascade,
  visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_quality (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.candidate_profiles(id) on delete cascade,
  status text not null default 'incomplete' check (status in ('incomplete', 'complete')),
  incomplete_reasons text[] not null default '{}',
  weak_fields text[] not null default '{}',
  complete_fields text[] not null default '{}',
  weak_response_count integer not null default 0 check (weak_response_count >= 0),
  last_checked_at timestamptz not null default now()
);

create table if not exists public.profile_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  version integer not null check (version > 0),
  generated_markdown text not null,
  change_summary text not null default '',
  created_at timestamptz not null default now(),
  unique (profile_id, version)
);

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name in ('tester', 'basic', 'pro', 'premium')),
  price_monthly integer not null default 0 check (price_monthly >= 0),
  unlimited_search boolean not null default true,
  profile_export boolean not null default false,
  pursuit_limit_monthly integer,
  outreach_limit_monthly integer,
  human_path_limit_monthly integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'canceled')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id),
  usage_type text not null check (usage_type in ('pursuit', 'outreach_message', 'human_path', 'profile_export')),
  quantity integer not null default 1 check (quantity > 0),
  related_job_id uuid,
  related_pursuit_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_url text not null,
  company_name text not null,
  title text not null,
  location text,
  remote_type text,
  employment_type text,
  compensation_text text,
  description text not null default '',
  posted_at timestamptz,
  scraped_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_url)
);

create table if not exists public.saved_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.candidate_profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create table if not exists public.pursuits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  selected_role_track_id uuid references public.role_tracks(id) on delete set null,
  selected_resume_id uuid references public.resumes(id) on delete set null,
  status text not null default 'saved' check (status in ('discovered', 'saved', 'review_complete', 'human_path_generated', 'outreach_ready', 'outreach_sent', 'applied', 'responded', 'interviewing', 'offer', 'rejected', 'expired', 'deleted')),
  fit_summary text,
  risks text[] not null default '{}',
  recommended_proof_project_ids uuid[] not null default '{}',
  outreach_angle text,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

alter table public.usage_ledger
  add constraint usage_ledger_related_job_fk foreign key (related_job_id) references public.jobs(id) on delete set null,
  add constraint usage_ledger_related_pursuit_fk foreign key (related_pursuit_id) references public.pursuits(id) on delete set null;

create table if not exists public.contact_suggestions (
  id uuid primary key default gen_random_uuid(),
  pursuit_id uuid not null references public.pursuits(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  name text not null,
  title text not null default '',
  company_name text not null default '',
  linkedin_url text,
  email text,
  contact_type text not null default 'unknown' check (contact_type in ('likely_hiring_manager', 'functional_leader', 'recruiter', 'executive_sponsor', 'referral_candidate', 'unknown')),
  confidence text not null default 'low' check (confidence in ('low', 'medium', 'high')),
  relevance_reason text not null default '',
  role_connection text not null default '',
  verification_notes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  pursuit_id uuid not null references public.pursuits(id) on delete cascade,
  contact_suggestion_id uuid references public.contact_suggestions(id) on delete set null,
  channel text not null default 'other' check (channel in ('linkedin_connection', 'linkedin_dm', 'email', 'other')),
  recipient_type text not null check (recipient_type in ('likely_hiring_manager', 'functional_leader', 'recruiter', 'executive_sponsor', 'no_contact')),
  message text not null,
  selected_project_proof_ids uuid[] not null default '{}',
  selected_resume_id uuid references public.resumes(id) on delete set null,
  selected_role_track_id uuid references public.role_tracks(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'rejected')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_message_feedback (
  id uuid primary key default gen_random_uuid(),
  outreach_message_id uuid not null references public.outreach_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  feedback_type text not null check (feedback_type in ('approved', 'edited', 'rejected')),
  edited_message text,
  rejection_reason text check (rejection_reason in ('too_corporate', 'too_generic', 'wrong_proof', 'too_formal', 'too_long', 'wrong_posture', 'other')),
  notes text,
  created_at timestamptz not null default now()
);

insert into public.subscription_plans (name, price_monthly, unlimited_search, profile_export, pursuit_limit_monthly, outreach_limit_monthly, human_path_limit_monthly)
values
  ('tester', 0, true, false, null, 50, 25),
  ('basic', 2900, true, false, null, 100, 50),
  ('pro', 7900, true, true, null, 500, 200),
  ('premium', 29900, true, true, null, null, null)
on conflict (name) do nothing;

create index if not exists candidate_profiles_user_idx on public.candidate_profiles(user_id);
create index if not exists role_tracks_profile_idx on public.role_tracks(profile_id);
create index if not exists resumes_profile_idx on public.resumes(profile_id);
create index if not exists work_history_items_profile_idx on public.work_history_items(profile_id);
create index if not exists project_proofs_profile_idx on public.project_proofs(profile_id);
create index if not exists skill_profiles_profile_idx on public.skill_profiles(profile_id);
create index if not exists quality_scored_text_fields_profile_section_idx on public.quality_scored_text_fields(profile_id, section);
create index if not exists writing_samples_profile_type_idx on public.writing_samples(profile_id, sample_type);
create index if not exists profile_versions_profile_version_idx on public.profile_versions(profile_id, version desc);
create index if not exists usage_ledger_user_type_created_idx on public.usage_ledger(user_id, usage_type, created_at desc);
create index if not exists jobs_company_title_idx on public.jobs(company_name, title);
create index if not exists saved_jobs_user_created_idx on public.saved_jobs(user_id, created_at desc);
create index if not exists pursuits_user_status_idx on public.pursuits(user_id, status);
create index if not exists contact_suggestions_pursuit_idx on public.contact_suggestions(pursuit_id);
create index if not exists outreach_messages_pursuit_idx on public.outreach_messages(pursuit_id, created_at desc);

alter table public.candidate_profiles enable row level security;
alter table public.candidate_profile_preferences enable row level security;
alter table public.company_watchlist_items enable row level security;
alter table public.role_tracks enable row level security;
alter table public.resumes enable row level security;
alter table public.resume_role_tracks enable row level security;
alter table public.work_history_items enable row level security;
alter table public.work_history_resumes enable row level security;
alter table public.project_proofs enable row level security;
alter table public.skill_profiles enable row level security;
alter table public.skill_project_proofs enable row level security;
alter table public.skill_work_history_items enable row level security;
alter table public.quality_scored_text_fields enable row level security;
alter table public.communication_style_settings enable row level security;
alter table public.writing_samples enable row level security;
alter table public.outreach_rule_sets enable row level security;
alter table public.role_track_outreach_rules enable row level security;
alter table public.leadership_profiles enable row level security;
alter table public.profile_quality enable row level security;
alter table public.profile_versions enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.usage_ledger enable row level security;
alter table public.jobs enable row level security;
alter table public.saved_jobs enable row level security;
alter table public.pursuits enable row level security;
alter table public.contact_suggestions enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.saved_message_feedback enable row level security;

create policy candidate_profiles_owner on public.candidate_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_subscriptions_owner on public.user_subscriptions for select using (user_id = auth.uid());
create policy usage_ledger_owner on public.usage_ledger for select using (user_id = auth.uid());
create policy saved_jobs_owner on public.saved_jobs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pursuits_owner on public.pursuits for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy saved_message_feedback_owner on public.saved_message_feedback for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy jobs_read_authenticated on public.jobs for select using (auth.uid() is not null);

create policy candidate_profile_preferences_owner on public.candidate_profile_preferences for all
  using (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()));

create policy company_watchlist_items_owner on public.company_watchlist_items for all
  using (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()));

create policy role_tracks_owner on public.role_tracks for all
  using (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()));

create policy resumes_owner on public.resumes for all
  using (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()));

create policy work_history_items_owner on public.work_history_items for all
  using (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()));

create policy project_proofs_owner on public.project_proofs for all
  using (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()));

create policy skill_profiles_owner on public.skill_profiles for all
  using (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()));

create policy quality_scored_text_fields_owner on public.quality_scored_text_fields for all
  using (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()));

create policy communication_style_settings_owner on public.communication_style_settings for all
  using (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()));

create policy writing_samples_owner on public.writing_samples for all
  using (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()));

create policy outreach_rule_sets_owner on public.outreach_rule_sets for all
  using (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()));

create policy leadership_profiles_owner on public.leadership_profiles for all
  using (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()));

create policy profile_quality_owner on public.profile_quality for all
  using (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()));

create policy profile_versions_owner on public.profile_versions for all
  using (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.candidate_profiles p where p.id = profile_id and p.user_id = auth.uid()));

create policy resume_role_tracks_owner on public.resume_role_tracks for all
  using (exists (
    select 1 from public.resumes r
    join public.candidate_profiles p on p.id = r.profile_id
    where r.id = resume_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.resumes r
    join public.candidate_profiles p on p.id = r.profile_id
    where r.id = resume_id and p.user_id = auth.uid()
  ));

create policy work_history_resumes_owner on public.work_history_resumes for all
  using (exists (
    select 1 from public.work_history_items wh
    join public.candidate_profiles p on p.id = wh.profile_id
    where wh.id = work_history_item_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.work_history_items wh
    join public.candidate_profiles p on p.id = wh.profile_id
    where wh.id = work_history_item_id and p.user_id = auth.uid()
  ));

create policy skill_project_proofs_owner on public.skill_project_proofs for all
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

create policy skill_work_history_items_owner on public.skill_work_history_items for all
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

create policy role_track_outreach_rules_owner on public.role_track_outreach_rules for all
  using (exists (
    select 1 from public.role_tracks rt
    join public.candidate_profiles p on p.id = rt.profile_id
    where rt.id = role_track_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.role_tracks rt
    join public.candidate_profiles p on p.id = rt.profile_id
    where rt.id = role_track_id and p.user_id = auth.uid()
  ));

create policy contact_suggestions_owner on public.contact_suggestions for all
  using (exists (select 1 from public.pursuits p where p.id = pursuit_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.pursuits p where p.id = pursuit_id and p.user_id = auth.uid()));

create policy outreach_messages_owner on public.outreach_messages for all
  using (exists (select 1 from public.pursuits p where p.id = pursuit_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.pursuits p where p.id = pursuit_id and p.user_id = auth.uid()));

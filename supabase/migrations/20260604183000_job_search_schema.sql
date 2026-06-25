-- Job Search private dashboard schema
-- Run this in the Supabase SQL editor before enabling SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

create extension if not exists pgcrypto;

create table if not exists public.job_search_profiles (
  id text primary key default 'default',
  user_id uuid,
  approved_login_email text not null,
  target_titles text[] not null default '{}',
  positive_keywords text[] not null default '{}',
  negative_keywords text[] not null default '{}',
  target_industries text[] not null default '{}',
  compensation_floor integer not null default 150000,
  freelance_rate_floor integer not null default 125,
  remote_only boolean not null default true,
  do_not_apply_companies text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_search_companies (
  id text primary key,
  profile_id text not null default 'default' references public.job_search_profiles(id) on delete cascade,
  user_id uuid,
  company_name text not null,
  website_url text not null default '',
  careers_url text not null default '',
  ats_provider text not null check (ats_provider in ('greenhouse', 'lever', 'ashby', 'html')),
  ats_board_token text not null default '',
  industry_bucket text not null default '',
  priority_score integer not null default 0,
  remote_likelihood integer not null default 0,
  notes text not null default '',
  status text not null check (status in ('active', 'paused', 'deprioritized', 'do_not_apply')),
  last_successful_scan timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_search_jobs (
  id text primary key,
  profile_id text not null default 'default' references public.job_search_profiles(id) on delete cascade,
  user_id uuid,
  company_id text not null references public.job_search_companies(id) on delete cascade,
  external_job_id text not null default '',
  source_provider text not null check (source_provider in ('greenhouse', 'lever', 'ashby', 'html')),
  source_url text not null default '',
  apply_url text not null default '',
  title text not null,
  company_name text not null,
  location text not null default '',
  remote_type text not null check (remote_type in ('remote', 'hybrid', 'onsite', 'unclear')),
  remote_classification text check (remote_classification in ('remote_confirmed', 'remote_likely', 'hybrid_remote_possible', 'hybrid_unclear', 'onsite_unclear', 'onsite_likely', 'not_remote')),
  posting_remote_language text,
  remote_system_read text,
  remote_evidence_summary text,
  remote_evidence_url text,
  remote_confidence_score integer,
  employment_type text not null check (employment_type in ('full-time', 'contract', 'freelance')),
  department text not null default '',
  salary_min integer,
  salary_max integer,
  salary_text text not null default '',
  description_text text not null default '',
  raw_payload_json jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  closed_at timestamptz,
  status text not null check (status in ('new', 'reviewed', 'saved', 'applied', 'messaged', 'skipped', 'archived')),
  fit_score integer not null default 0,
  fit_bucket text not null check (fit_bucket in ('A', 'B', 'C', 'skip', 'monitor')),
  fit_summary text not null default '',
  risk_flags text[] not null default '{}',
  recommended_action text not null check (recommended_action in ('apply_and_message_today', 'review', 'monitor', 'skip', 'research_contact')),
  why_it_matches text[] not null default '{}',
  why_it_might_be_wrong text[] not null default '{}',
  outreach_angle text not null default '',
  resume_tailoring_notes text[] not null default '{}',
  needs_contact_research boolean not null default false,
  applied_at timestamptz,
  messaged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_search_contacts (
  id text primary key,
  profile_id text not null default 'default' references public.job_search_profiles(id) on delete cascade,
  user_id uuid,
  company_id text not null references public.job_search_companies(id) on delete cascade,
  job_id text references public.job_search_jobs(id) on delete set null,
  name text not null,
  title text not null default '',
  linkedin_url text not null default '',
  company_bio_url text,
  email text,
  contact_type text not null check (contact_type in ('recruiter', 'talent_partner', 'hiring_manager', 'department_leader', 'creative_lead', 'production_lead', 'unknown')),
  confidence integer not null default 0,
  reason text not null default '',
  status text not null check (status in ('to_research', 'identified', 'messaged', 'replied', 'not_relevant', 'archived')),
  last_contacted_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_search_scan_logs (
  id text primary key,
  profile_id text not null default 'default' references public.job_search_profiles(id) on delete cascade,
  user_id uuid,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  status text not null check (status in ('completed', 'completed_with_errors', 'failed')),
  companies_scanned integer not null default 0,
  jobs_found integer not null default 0,
  new_jobs_added integer not null default 0,
  jobs_updated integer not null default 0,
  jobs_closed integer not null default 0,
  errors_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.job_search_application_actions (
  id text primary key default gen_random_uuid()::text,
  profile_id text not null default 'default' references public.job_search_profiles(id) on delete cascade,
  user_id uuid,
  wizard_session_id text not null default gen_random_uuid()::text,
  job_id text not null references public.job_search_jobs(id) on delete cascade,
  contact_id text references public.job_search_contacts(id) on delete set null,
  action_type text not null check (action_type in ('open_profile', 'copy_message', 'message_sent', 'applied_online', 'applied_linkedin', 'email_sent', 'cover_letter_generated', 'resume_notes_generated', 'saved_for_follow_up', 'skipped', 'other')),
  action_label text not null default '',
  action_status text not null check (action_status in ('planned', 'completed', 'skipped', 'failed', 'not_applicable')),
  action_timestamp timestamptz,
  message_text text,
  cover_letter_text text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_search_outreach_messages (
  id text primary key default gen_random_uuid()::text,
  profile_id text not null default 'default' references public.job_search_profiles(id) on delete cascade,
  user_id uuid,
  wizard_session_id text not null default gen_random_uuid()::text,
  job_id text not null references public.job_search_jobs(id) on delete cascade,
  contact_id text references public.job_search_contacts(id) on delete set null,
  message_type text not null check (message_type in ('linkedin_connection_note', 'linkedin_message', 'email', 'follow_up', 'other')),
  message_text text not null,
  tone_version text not null default 'direct_skeptical_specific',
  variation_group_id text,
  generated_at timestamptz not null default now(),
  copied_at timestamptz,
  sent_at timestamptz,
  notes text
);

create table if not exists public.job_search_cover_letters (
  id text primary key default gen_random_uuid()::text,
  profile_id text not null default 'default' references public.job_search_profiles(id) on delete cascade,
  user_id uuid,
  wizard_session_id text not null default gen_random_uuid()::text,
  job_id text not null references public.job_search_jobs(id) on delete cascade,
  version integer not null default 1,
  text text not null,
  generated_at timestamptz not null default now(),
  copied_at timestamptz,
  submitted_at timestamptz,
  notes text
);

create table if not exists public.job_search_remote_notes (
  id text primary key default gen_random_uuid()::text,
  profile_id text not null default 'default' references public.job_search_profiles(id) on delete cascade,
  user_id uuid,
  job_id text not null references public.job_search_jobs(id) on delete cascade,
  company_id text not null references public.job_search_companies(id) on delete cascade,
  remote_classification text not null check (remote_classification in ('remote_confirmed', 'remote_likely', 'hybrid_remote_possible', 'hybrid_unclear', 'onsite_unclear', 'onsite_likely', 'not_remote')),
  posting_remote_language text not null default '',
  system_interpretation text not null default '',
  remote_exception_possible boolean not null default false,
  evidence_summary text not null default '',
  evidence_url text,
  confidence_score integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists job_search_companies_profile_idx on public.job_search_companies(profile_id);
create index if not exists job_search_jobs_profile_status_idx on public.job_search_jobs(profile_id, status);
create index if not exists job_search_jobs_company_provider_external_idx on public.job_search_jobs(company_id, source_provider, external_job_id);
create index if not exists job_search_contacts_profile_status_idx on public.job_search_contacts(profile_id, status);
create index if not exists job_search_scan_logs_profile_completed_idx on public.job_search_scan_logs(profile_id, completed_at desc);

alter table public.job_search_application_actions add column if not exists wizard_session_id text;
alter table public.job_search_application_actions alter column wizard_session_id set default gen_random_uuid()::text;
update public.job_search_application_actions set wizard_session_id = gen_random_uuid()::text where wizard_session_id is null;
alter table public.job_search_application_actions alter column wizard_session_id set not null;

alter table public.job_search_outreach_messages add column if not exists wizard_session_id text;
alter table public.job_search_outreach_messages alter column wizard_session_id set default gen_random_uuid()::text;
update public.job_search_outreach_messages set wizard_session_id = variation_group_id where wizard_session_id is null and variation_group_id is not null;
update public.job_search_outreach_messages set wizard_session_id = gen_random_uuid()::text where wizard_session_id is null;
alter table public.job_search_outreach_messages alter column wizard_session_id set not null;

alter table public.job_search_cover_letters add column if not exists wizard_session_id text;
alter table public.job_search_cover_letters alter column wizard_session_id set default gen_random_uuid()::text;
update public.job_search_cover_letters set wizard_session_id = gen_random_uuid()::text where wizard_session_id is null;
alter table public.job_search_cover_letters alter column wizard_session_id set not null;

create index if not exists job_search_application_actions_job_idx on public.job_search_application_actions(job_id, action_timestamp desc);
create index if not exists job_search_application_actions_session_idx on public.job_search_application_actions(wizard_session_id, created_at desc);
create index if not exists job_search_outreach_messages_job_idx on public.job_search_outreach_messages(job_id, generated_at desc);
create index if not exists job_search_outreach_messages_session_idx on public.job_search_outreach_messages(wizard_session_id, generated_at desc);
create index if not exists job_search_cover_letters_job_idx on public.job_search_cover_letters(job_id, generated_at desc);
create index if not exists job_search_cover_letters_session_idx on public.job_search_cover_letters(wizard_session_id, generated_at desc);
create index if not exists job_search_remote_notes_job_idx on public.job_search_remote_notes(job_id, created_at desc);

alter table public.job_search_profiles enable row level security;
alter table public.job_search_companies enable row level security;
alter table public.job_search_jobs enable row level security;
alter table public.job_search_contacts enable row level security;
alter table public.job_search_scan_logs enable row level security;
alter table public.job_search_application_actions enable row level security;
alter table public.job_search_outreach_messages enable row level security;
alter table public.job_search_cover_letters enable row level security;
alter table public.job_search_remote_notes enable row level security;

insert into public.job_search_profiles (
  id,
  approved_login_email,
  target_titles,
  positive_keywords,
  negative_keywords,
  target_industries,
  compensation_floor,
  freelance_rate_floor,
  remote_only,
  do_not_apply_companies
) values (
  'default',
  'single approved email',
  array['director of production', 'head of production', 'executive producer', 'senior producer', 'creative program manager', 'design program manager', 'creative operations', 'studio operations', 'ai enablement'],
  array['production leadership', 'creative operations', 'studio operations', 'cross-functional', 'campaign', 'brand', 'content operations', 'design system', 'post production'],
  array['aaa game', 'scrum master', 'agile delivery', 'engineering manager', 'junior producer', 'social media manager', 'performance marketing'],
  array['creative agency', 'design agency', 'internal creative studio', 'tech', 'fintech', 'web3', 'ai'],
  150000,
  125,
  true,
  array['Left Field Labs']
) on conflict (id) do nothing;

insert into public.job_search_companies (
  id, profile_id, company_name, website_url, careers_url, ats_provider, ats_board_token,
  industry_bucket, priority_score, remote_likelihood, notes, status, last_successful_scan, last_error
) values
  ('company-ibc', 'default', 'IBC', 'https://example.com', 'https://example.com/careers', 'greenhouse', 'ibc', 'creative agency', 91, 84, 'Producer role reads like post-production operations ownership, not commodity video production.', 'active', '2026-06-04T08:20:00-06:00', null),
  ('company-nova', 'default', 'Nova Systems Studio', 'https://example.com', 'https://example.com/jobs', 'lever', 'nova', 'internal creative studio', 86, 72, 'Strong brand and launch work. Watch for program roles that avoid engineering management.', 'active', '2026-06-04T08:22:00-06:00', null),
  ('company-left-field', 'default', 'Left Field Labs', 'https://example.com', 'https://example.com/careers', 'ashby', 'leftfield', 'design agency', 0, 55, 'Do-not-apply until manually reactivated.', 'do_not_apply', '2026-06-04T08:24:00-06:00', null),
  ('company-chain', 'default', 'Chainlight', 'https://example.com', 'https://example.com/open-roles', 'html', 'chainlight-careers', 'web3', 78, 88, 'Crypto/web3 roles can fit when production authority is explicit.', 'active', '2026-06-04T08:27:00-06:00', 'Generic HTML fallback missed salary block on latest scan.')
on conflict (id) do nothing;

insert into public.job_search_jobs (
  id, profile_id, company_id, external_job_id, source_provider, source_url, apply_url, title,
  company_name, location, remote_type, employment_type, department, salary_min, salary_max,
  salary_text, description_text, first_seen_at, last_seen_at, status, fit_score, fit_bucket,
  fit_summary, risk_flags, recommended_action, why_it_matches, why_it_might_be_wrong,
  outreach_angle, resume_tailoring_notes, needs_contact_research
) values
  ('job-ibc-producer', 'default', 'company-ibc', 'gh-74219', 'greenhouse', 'https://example.com/source/ibc-producer', 'https://example.com/apply/ibc-producer', 'Remote Producer', 'IBC', 'Remote, US', 'remote', 'full-time', 'Content Studio', 155000, 175000, '$155k-$175k base', 'Own post production flow, creative feedback, version control, campaign delivery, and cross-functional studio operations across distributed teams.', '2026-06-04T07:42:00-06:00', '2026-06-04T08:20:00-06:00', 'new', 92, 'A', 'Strong match: senior production ownership, remote, post flow chaos, and compensation signal all line up.', array['Confirm authority level', 'Find actual production lead'], 'research_contact', array['Post-production system ownership', 'Distributed creative handoffs', 'Senior producer language'], array['Could still be scoped as hands-on video execution', 'Hiring manager not obvious'], 'Lead with the difference between making videos and keeping post production from eating itself.', array['Surface distributed production systems', 'Use agency/tech launch examples', 'Name version-control and review-cycle fixes'], true),
  ('job-nova-dpm', 'default', 'company-nova', 'lever-103', 'lever', 'https://example.com/source/nova-dpm', 'https://example.com/apply/nova-dpm', 'Design Program Manager, Brand Systems', 'Nova Systems Studio', 'Remote, North America', 'remote', 'full-time', 'Design', 145000, 170000, '$145k-$170k', 'Run cross-functional brand systems work with design, content, product marketing, and creative operations partners.', '2026-06-03T09:10:00-06:00', '2026-06-04T08:22:00-06:00', 'saved', 78, 'B', 'Worth reviewing: good design-program shape, but title may skew toward classic DPM rituals.', array['Check scrum/process load', 'Salary floor depends on band'], 'review', array['Design systems', 'Brand operations', 'Cross-functional creative work'], array['May be too process-heavy', 'Could sit far from production authority'], 'Position as a creative ops person who can make design systems ship without making designers live inside status meetings.', array['Emphasize design/brand system launches', 'Reduce producer-only language', 'Keep operations voice sharp'], true),
  ('job-chain-ops', 'default', 'company-chain', 'html-chain-88', 'html', 'https://example.com/source/chain-ops', 'https://example.com/apply/chain-ops', 'Marketing Operations Lead', 'Chainlight', 'Remote', 'remote', 'contract', 'Marketing', 0, 0, '$120/hr contract', 'Coordinate campaign operations, content calendar, creator partnerships, paid channels, and social reporting for a web3 launch.', '2026-05-18T10:30:00-06:00', '2026-06-04T08:27:00-06:00', 'reviewed', 54, 'C', 'Possible but thin: remote and web3 fit, but rate is under target and the role leans marketing execution.', array['Below freelance floor', 'Performance/social skew', 'Older than 14 days'], 'review', array['Remote web3 launch', 'Campaign operations'], array['Too much performance marketing', 'Low authority signal'], 'Only pursue if there is hidden production ownership behind the generic marketing ops title.', array['Keep crypto/launch work visible', 'Do not over-invest without contact confirmation'], false),
  ('job-left-field-ep', 'default', 'company-left-field', 'ashby-990', 'ashby', 'https://example.com/source/lfl-ep', 'https://example.com/apply/lfl-ep', 'Executive Producer', 'Left Field Labs', 'Hybrid, Los Angeles', 'hybrid', 'full-time', 'Production', 170000, 190000, '$170k-$190k', 'Lead production delivery for interactive campaigns and technical creative teams.', '2026-06-04T08:01:00-06:00', '2026-06-04T08:24:00-06:00', 'skipped', 0, 'skip', 'Do-not-apply company. Keep visible only so the system does not keep rediscovering it as tempting.', array['do-not-apply company', 'hybrid location'], 'skip', array['Title and salary would otherwise fit'], array['Explicit do-not-apply status', 'Hybrid requirement'], 'No outreach unless manually reactivated.', array['No action'], false)
on conflict (id) do nothing;

insert into public.job_search_contacts (
  id, profile_id, company_id, job_id, name, title, linkedin_url, company_bio_url,
  contact_type, confidence, reason, status, notes
) values
  ('suggestion-ibc-talent', 'default', 'company-ibc', 'job-ibc-producer', 'Natalie Reed', 'Talent Partner, Creative Studio', 'https://example.com/natalie', 'https://example.com/team/natalie', 'talent_partner', 82, 'Likely close to creative studio hiring and able to route the producer role.', 'identified', 'Talent partner for the studio group tied to the posting. Not confirmed as assigned recruiter for this exact role.'),
  ('suggestion-ibc-production', 'default', 'company-ibc', 'job-ibc-producer', 'Marcus Alvarez', 'Head of Production', 'https://example.com/marcus', null, 'production_lead', 88, 'Direct functional owner for post-production operations and senior producer workflows.', 'identified', 'Likely hiring influence if the role is about production systems, review cycles, and delivery. May prefer recruiter intake first.'),
  ('suggestion-nova-brand', 'default', 'company-nova', 'job-nova-dpm', 'Maya Chen', 'Director, Brand Studio', 'https://example.com/maya', 'https://example.com/team/maya', 'creative_lead', 74, 'Owns the brand studio function connected to a design program role.', 'identified', 'Strong adjacent stakeholder for brand systems and design operations. May be stakeholder rather than hiring manager.')
on conflict (id) do nothing;

insert into public.job_search_scan_logs (
  id, profile_id, started_at, completed_at, status, companies_scanned, jobs_found,
  new_jobs_added, jobs_updated, jobs_closed, errors_json
) values
  ('scan-2026-06-04', 'default', '2026-06-04T08:18:00-06:00', '2026-06-04T08:29:00-06:00', 'completed_with_errors', 4, 19, 4, 7, 1, '["Chainlight HTML fallback missed salary block."]'::jsonb),
  ('scan-2026-06-03', 'default', '2026-06-03T08:15:00-06:00', '2026-06-03T08:23:00-06:00', 'completed', 3, 15, 2, 4, 0, '[]'::jsonb)
on conflict (id) do nothing;

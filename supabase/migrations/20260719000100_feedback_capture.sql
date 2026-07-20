-- Structured feedback capture for public job matching and generated outreach.
-- Feedback is evidence only: these tables do not mutate job result status,
-- profile settings, pursuit state, message state, or generation behavior.

create table if not exists public.job_match_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  reason_codes text[] not null,
  note text,
  match_score integer not null check (match_score between 0 and 100),
  match_label text not null check (match_label in (
    'Strong Match',
    'Potential Match',
    'Weak Match',
    'Probably Not Worth Your Time'
  )),
  match_signals text[] not null default '{}',
  matcher_version text not null check (length(btrim(matcher_version)) between 1 and 120),
  match_evaluated_at timestamptz not null,
  profile_version integer not null check (profile_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(reason_codes) between 1 and 5),
  check (reason_codes <@ array[
    'wrong_role_title',
    'wrong_location_preference',
    'wrong_comp',
    'wrong_industry',
    'other'
  ]::text[]),
  check (cardinality(match_signals) <= 12),
  check (note is null or length(note) <= 500),
  unique (user_id, job_id, matcher_version, profile_version)
);

create index if not exists job_match_feedback_user_updated_idx
  on public.job_match_feedback(user_id, updated_at desc);

create index if not exists job_match_feedback_job_updated_idx
  on public.job_match_feedback(job_id, updated_at desc);

alter table public.job_match_feedback enable row level security;

create policy job_match_feedback_owner
  on public.job_match_feedback
  for all
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.candidate_profiles
      where candidate_profiles.id = job_match_feedback.profile_id
        and candidate_profiles.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.candidate_profiles
      where candidate_profiles.id = job_match_feedback.profile_id
        and candidate_profiles.user_id = auth.uid()
    )
  );

alter table public.saved_message_feedback
  add column if not exists reason_codes text[] not null default '{}',
  add column if not exists message_snapshot text,
  add column if not exists message_revision smallint not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.saved_message_feedback
  drop constraint if exists saved_message_feedback_feedback_type_check;

alter table public.saved_message_feedback
  add constraint saved_message_feedback_feedback_type_check
  check (feedback_type in ('approved', 'edited', 'rejected', 'needs_work'));

alter table public.saved_message_feedback
  add constraint saved_message_feedback_reason_codes_check
  check (
    reason_codes <@ array[
      'wrong_skills_title_applied',
      'personal_voice_mismatch',
      'selected_tone_mismatch',
      'awkward_to_read',
      'would_not_send',
      'other'
    ]::text[]
    and (
      feedback_type <> 'needs_work'
      or cardinality(reason_codes) between 1 and 6
    )
  );

alter table public.saved_message_feedback
  add constraint saved_message_feedback_message_revision_check
  check (message_revision >= 0);

alter table public.saved_message_feedback
  add constraint saved_message_feedback_snapshot_check
  check (
    feedback_type <> 'needs_work'
    or (message_snapshot is not null and length(btrim(message_snapshot)) > 0)
  );

alter table public.saved_message_feedback
  add constraint saved_message_feedback_notes_check
  check (notes is null or length(notes) <= 500);

create unique index if not exists saved_message_feedback_user_message_revision_idx
  on public.saved_message_feedback(
    user_id,
    outreach_message_id,
    message_revision,
    feedback_type
  );

create index if not exists saved_message_feedback_user_updated_idx
  on public.saved_message_feedback(user_id, updated_at desc);

drop policy if exists saved_message_feedback_owner
  on public.saved_message_feedback;

create policy saved_message_feedback_owner
  on public.saved_message_feedback
  for all
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.outreach_messages
      join public.pursuits
        on pursuits.id = outreach_messages.pursuit_id
      where outreach_messages.id = saved_message_feedback.outreach_message_id
        and pursuits.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.outreach_messages
      join public.pursuits
        on pursuits.id = outreach_messages.pursuit_id
      where outreach_messages.id = saved_message_feedback.outreach_message_id
        and pursuits.user_id = auth.uid()
    )
  );

-- Feedback context is computed and snapshotted by the server APIs. Authenticated clients may
-- read their own rows through RLS, but writes must not be able to bypass that validation path.
revoke insert, update, delete, truncate on public.job_match_feedback
  from public, anon, authenticated;
revoke insert, update, delete, truncate on public.saved_message_feedback
  from public, anon, authenticated;

grant select on public.job_match_feedback to authenticated;
grant select on public.saved_message_feedback to authenticated;
grant select, insert, update, delete on public.job_match_feedback to service_role;
grant select, insert, update, delete on public.saved_message_feedback to service_role;

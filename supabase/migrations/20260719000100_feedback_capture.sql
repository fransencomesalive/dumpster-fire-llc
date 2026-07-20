-- Structured feedback capture for public job matching and generated outreach.
-- Feedback is evidence only: these tables do not mutate job result status,
-- profile settings, pursuit state, message state, or generation behavior.

create table if not exists public.job_match_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  job_id uuid,
  reason_codes text[] not null,
  note text,
  match_score integer not null,
  match_label text not null,
  match_signals text[] not null default '{}',
  matcher_version text not null,
  match_evaluated_at timestamptz not null,
  profile_version integer not null,
  match_context_hash text not null,
  profile_context jsonb not null,
  job_snapshot jsonb not null,
  match_details jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.job_match_feedback
  add column if not exists match_context_hash text,
  add column if not exists profile_context jsonb,
  add column if not exists job_snapshot jsonb,
  add column if not exists match_details jsonb;

alter table public.job_match_feedback alter column job_id drop not null;

alter table public.job_match_feedback
  drop constraint if exists job_match_feedback_job_id_fkey;
alter table public.job_match_feedback
  add constraint job_match_feedback_job_id_fkey
  foreign key (job_id) references public.jobs(id) on delete set null;

-- Remove the earlier profile-version uniqueness rule if this migration is replayed
-- over a partial install. The immutable context hash is the authoritative key.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.job_match_feedback'::regclass
      and contype = 'u'
  loop
    execute format('alter table public.job_match_feedback drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.job_match_feedback
  drop constraint if exists job_match_feedback_reason_count_check,
  drop constraint if exists job_match_feedback_reason_codes_check,
  drop constraint if exists job_match_feedback_note_check,
  drop constraint if exists job_match_feedback_score_check,
  drop constraint if exists job_match_feedback_label_check,
  drop constraint if exists job_match_feedback_signals_check,
  drop constraint if exists job_match_feedback_matcher_version_check,
  drop constraint if exists job_match_feedback_profile_version_check,
  drop constraint if exists job_match_feedback_context_hash_check,
  drop constraint if exists job_match_feedback_profile_context_check,
  drop constraint if exists job_match_feedback_job_snapshot_check,
  drop constraint if exists job_match_feedback_match_details_check;

alter table public.job_match_feedback
  add constraint job_match_feedback_reason_count_check
    check (cardinality(reason_codes) between 1 and 5),
  add constraint job_match_feedback_reason_codes_check
    check (reason_codes <@ array[
      'wrong_role_title',
      'wrong_location_preference',
      'wrong_comp',
      'wrong_industry',
      'other'
    ]::text[]),
  add constraint job_match_feedback_note_check
    check (note is null or length(note) <= 500),
  add constraint job_match_feedback_score_check
    check (match_score between 0 and 100),
  add constraint job_match_feedback_label_check
    check (match_label in (
      'Strong Match',
      'Potential Match',
      'Weak Match',
      'Probably Not Worth Your Time'
    )),
  add constraint job_match_feedback_signals_check
    check (cardinality(match_signals) <= 12),
  add constraint job_match_feedback_matcher_version_check
    check (length(btrim(matcher_version)) between 1 and 120),
  add constraint job_match_feedback_profile_version_check
    check (profile_version > 0),
  add constraint job_match_feedback_context_hash_check
    check (match_context_hash ~ '^[a-f0-9]{64}$'),
  add constraint job_match_feedback_profile_context_check
    check (jsonb_typeof(profile_context) = 'object' and profile_context <> '{}'::jsonb),
  add constraint job_match_feedback_job_snapshot_check
    check (jsonb_typeof(job_snapshot) = 'object' and job_snapshot <> '{}'::jsonb),
  add constraint job_match_feedback_match_details_check
    check (jsonb_typeof(match_details) = 'object' and match_details <> '{}'::jsonb);

create unique index if not exists job_match_feedback_context_idx
  on public.job_match_feedback(user_id, job_id, matcher_version, match_context_hash);

create index if not exists job_match_feedback_user_updated_idx
  on public.job_match_feedback(user_id, updated_at desc);

create index if not exists job_match_feedback_job_updated_idx
  on public.job_match_feedback(job_id, updated_at desc)
  where job_id is not null;

alter table public.job_match_feedback enable row level security;

drop policy if exists job_match_feedback_owner on public.job_match_feedback;
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

alter table public.outreach_messages
  add column if not exists regeneration_context jsonb;

alter table public.saved_message_feedback
  add column if not exists reason_codes text[] not null default '{}',
  add column if not exists message_snapshot text,
  add column if not exists message_revision smallint not null default 0,
  add column if not exists generation_request_id uuid,
  add column if not exists generation_context jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

update public.saved_message_feedback
set generation_context = jsonb_build_object(
  'source', 'legacy_unavailable',
  'capturedAt', coalesce(created_at, now())
)
where generation_context = '{}'::jsonb;

alter table public.saved_message_feedback
  drop constraint if exists saved_message_feedback_generation_request_id_fkey;
alter table public.saved_message_feedback
  add constraint saved_message_feedback_generation_request_id_fkey
  foreign key (generation_request_id)
  references public.pursuit_outreach_generation_requests(id)
  on delete set null;

alter table public.saved_message_feedback
  drop constraint if exists saved_message_feedback_feedback_type_check,
  drop constraint if exists saved_message_feedback_reason_codes_check,
  drop constraint if exists saved_message_feedback_message_revision_check,
  drop constraint if exists saved_message_feedback_snapshot_check,
  drop constraint if exists saved_message_feedback_notes_check,
  drop constraint if exists saved_message_feedback_generation_context_check;

alter table public.saved_message_feedback
  add constraint saved_message_feedback_feedback_type_check
    check (feedback_type in ('approved', 'edited', 'rejected', 'needs_work')),
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
      and (feedback_type <> 'needs_work' or cardinality(reason_codes) between 1 and 6)
    ),
  add constraint saved_message_feedback_message_revision_check
    check (message_revision >= 0),
  add constraint saved_message_feedback_snapshot_check
    check (
      feedback_type <> 'needs_work'
      or (message_snapshot is not null and length(btrim(message_snapshot)) > 0)
    ),
  add constraint saved_message_feedback_notes_check
    check (notes is null or length(notes) <= 500),
  add constraint saved_message_feedback_generation_context_check
    check (jsonb_typeof(generation_context) = 'object' and generation_context <> '{}'::jsonb);

alter table public.outreach_messages
  drop constraint if exists outreach_messages_regeneration_context_check;
alter table public.outreach_messages
  add constraint outreach_messages_regeneration_context_check
  check (regeneration_context is null or jsonb_typeof(regeneration_context) = 'object');

create unique index if not exists saved_message_feedback_user_message_revision_idx
  on public.saved_message_feedback(user_id, outreach_message_id, message_revision, feedback_type);

create index if not exists saved_message_feedback_user_updated_idx
  on public.saved_message_feedback(user_id, updated_at desc);

drop policy if exists saved_message_feedback_owner on public.saved_message_feedback;
create policy saved_message_feedback_owner
  on public.saved_message_feedback
  for all
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.outreach_messages
      join public.pursuits on pursuits.id = outreach_messages.pursuit_id
      where outreach_messages.id = saved_message_feedback.outreach_message_id
        and pursuits.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.outreach_messages
      join public.pursuits on pursuits.id = outreach_messages.pursuit_id
      where outreach_messages.id = saved_message_feedback.outreach_message_id
        and pursuits.user_id = auth.uid()
    )
  );

-- Authenticated clients may read their rows through RLS. Writes stay server-only so
-- match and generation context cannot be forged by a browser client.
revoke insert, update, delete, truncate on public.job_match_feedback
  from public, anon, authenticated;
revoke insert, update, delete, truncate on public.saved_message_feedback
  from public, anon, authenticated;

grant select on public.job_match_feedback to authenticated;
grant select on public.saved_message_feedback to authenticated;
grant select, insert, update, delete on public.job_match_feedback to service_role;
grant select, insert, update, delete on public.saved_message_feedback to service_role;

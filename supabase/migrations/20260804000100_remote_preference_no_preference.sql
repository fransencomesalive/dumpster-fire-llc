alter table public.candidate_profiles
  drop constraint if exists candidate_profiles_remote_preference_check;

alter table public.candidate_profiles
  add constraint candidate_profiles_remote_preference_check
  check (remote_preference in (
    'no_preference',
    'remote_only',
    'remote_preferred',
    'hybrid_ok',
    'onsite_ok'
  ));

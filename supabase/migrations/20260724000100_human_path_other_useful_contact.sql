alter table public.contact_suggestions
  drop constraint if exists contact_suggestions_contact_type_check;

alter table public.contact_suggestions
  add constraint contact_suggestions_contact_type_check
  check (
    contact_type in (
      'likely_hiring_manager',
      'functional_leader',
      'recruiter',
      'other_useful_contact',
      'executive_sponsor',
      'referral_candidate',
      'unknown'
    )
  );

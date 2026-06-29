alter table public.contact_suggestions
  add column if not exists selected_for_outreach boolean not null default false;

create index if not exists contact_suggestions_selected_idx
  on public.contact_suggestions(pursuit_id, selected_for_outreach);

alter table public.pursuits
  add column if not exists selected_work_example_id uuid,
  add column if not exists recommended_work_example_ids uuid[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pursuits_selected_work_example_fk'
  ) then
    alter table public.pursuits
      add constraint pursuits_selected_work_example_fk
      foreign key (selected_work_example_id) references public.work_examples(id) on delete set null;
  end if;
end $$;

create table if not exists public.pursuit_events (
  id uuid primary key default gen_random_uuid(),
  pursuit_id uuid not null references public.pursuits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'created',
    'review_completed',
    'human_path_generated',
    'contacts_selected',
    'outreach_generated',
    'outreach_sent',
    'applied',
    'responded',
    'interviewing',
    'offer',
    'rejected',
    'expired',
    'deleted',
    'note_added'
  )),
  from_status text,
  to_status text,
  usage_type text check (usage_type in ('pursuit', 'outreach_message', 'human_path', 'profile_export')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pursuit_events_pursuit_created_idx on public.pursuit_events(pursuit_id, created_at desc);
create index if not exists pursuit_events_user_created_idx on public.pursuit_events(user_id, created_at desc);

alter table public.pursuit_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pursuit_events'
      and policyname = 'pursuit_events_owner'
  ) then
    create policy pursuit_events_owner on public.pursuit_events for all
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

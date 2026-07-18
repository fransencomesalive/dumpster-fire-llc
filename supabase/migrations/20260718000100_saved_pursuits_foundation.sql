alter table public.pursuits
  add column if not exists tracking_started_at timestamptz,
  add column if not exists notes text,
  add column if not exists job_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists selection_snapshot jsonb not null default '{}'::jsonb;

alter table public.outreach_messages
  add column if not exists sent_at timestamptz;

create table if not exists public.pursuit_tracking_events (
  id uuid primary key default gen_random_uuid(),
  pursuit_id uuid not null references public.pursuits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in (
    'outreach_sent',
    'applied_online',
    'response_received',
    'interviewing',
    'not_moving_forward',
    'never_heard_back'
  )),
  checked boolean not null,
  source text not null check (source in ('manual', 'message_copy', 'migration')),
  outreach_message_id uuid references public.outreach_messages(id) on delete set null,
  contact_suggestion_id uuid references public.contact_suggestions(id) on delete set null,
  message_snapshot text,
  recipient_name_snapshot text,
  recipient_title_snapshot text,
  recipient_linkedin_url_snapshot text,
  idempotency_key text not null check (length(btrim(idempotency_key)) > 0),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (
    source <> 'message_copy'
    or (
      action = 'outreach_sent'
      and checked = true
      and outreach_message_id is not null
    )
  )
);

create unique index if not exists pursuit_tracking_events_idempotency_idx
  on public.pursuit_tracking_events(pursuit_id, idempotency_key);

create unique index if not exists pursuit_tracking_events_message_copy_idx
  on public.pursuit_tracking_events(pursuit_id, outreach_message_id)
  where source = 'message_copy'
    and action = 'outreach_sent'
    and checked = true
    and outreach_message_id is not null;

create index if not exists pursuit_tracking_events_pursuit_action_occurred_idx
  on public.pursuit_tracking_events(pursuit_id, action, occurred_at asc, created_at asc);

create index if not exists pursuit_tracking_events_user_occurred_idx
  on public.pursuit_tracking_events(user_id, occurred_at desc);

alter table public.pursuit_tracking_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pursuit_tracking_events'
      and policyname = 'pursuit_tracking_events_owner_select'
  ) then
    create policy pursuit_tracking_events_owner_select
      on public.pursuit_tracking_events
      for select
      using (
        user_id = auth.uid()
        and exists (
          select 1
          from public.pursuits
          where pursuits.id = pursuit_tracking_events.pursuit_id
            and pursuits.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pursuit_tracking_events'
      and policyname = 'pursuit_tracking_events_owner_insert'
  ) then
    create policy pursuit_tracking_events_owner_insert
      on public.pursuit_tracking_events
      for insert
      with check (
        user_id = auth.uid()
        and exists (
          select 1
          from public.pursuits
          where pursuits.id = pursuit_tracking_events.pursuit_id
            and pursuits.user_id = auth.uid()
        )
      );
  end if;
end $$;

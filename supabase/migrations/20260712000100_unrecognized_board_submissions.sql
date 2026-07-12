-- Unreadable company-board URLs, retained so unsupported sources can be prioritized.
-- Admin-owned: RLS is enabled without a user policy; the app writes through the service role.

create table if not exists public.unrecognized_board_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  reason text not null check (reason in ('unrecognized_board', 'board_fetch_failed')),
  created_at timestamptz not null default now()
);

create index if not exists unrecognized_board_submissions_created_idx
  on public.unrecognized_board_submissions (created_at desc);

alter table public.unrecognized_board_submissions enable row level security;

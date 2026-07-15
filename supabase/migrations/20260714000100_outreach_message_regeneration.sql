alter table public.outreach_messages
  add column if not exists previous_message text,
  add column if not exists regeneration_count smallint not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'outreach_messages_regeneration_count_check'
      and conrelid = 'public.outreach_messages'::regclass
  ) then
    alter table public.outreach_messages
      add constraint outreach_messages_regeneration_count_check
      check (regeneration_count in (0, 1));
  end if;
end $$;

alter table public.outreach_messages
  add column if not exists selected_work_example_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'outreach_messages_selected_work_example_fk'
  ) then
    alter table public.outreach_messages
      add constraint outreach_messages_selected_work_example_fk
      foreign key (selected_work_example_id) references public.work_examples(id) on delete set null;
  end if;
end $$;

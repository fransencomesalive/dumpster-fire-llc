alter table public.jobs
  add column if not exists source_content_hash text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'jobs_source_content_hash_format'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs
      add constraint jobs_source_content_hash_format check (
        source_content_hash is null
        or source_content_hash ~ '^[0-9a-f]{64}$'
      );
  end if;
end
$$;

create index if not exists jobs_owner_source_content_hash_idx
  on public.jobs(owner_user_id, source_content_hash)
  where source = 'user_link'
    and owner_user_id is not null
    and source_content_hash is not null;

# Database Migration State

Durable record of what has actually been applied to the **production** Supabase
database (`job-search`, ref `ngftlvlslhjsyjcbuuwv`), and where the migration-history
bookkeeping diverges from the `supabase/migrations/` folder. Read this before running
any `supabase db push` / `supabase migration` command against this project.

## Migration-history divergence — RESOLVED 2026-06-28

`20260627000100_generator_redesign_profile_schema.sql` (Phase A4) and
`20260626000100_public_job_scan_results.sql` were both **applied directly via `psql`** (A4 on
the prior session, scan-results on 2026-06-28), bypassing the Supabase CLI — so they were
initially missing from `supabase_migrations.schema_migrations`.

**Reconciled 2026-06-28:** both versions were recorded as applied via:
```sql
insert into supabase_migrations.schema_migrations (version, name, statements) values
  ('20260626000100', 'public_job_scan_results', array['-- applied via psql 2026-06-28; recorded manually']),
  ('20260627000100', 'generator_redesign_profile_schema', array['-- applied via psql 2026-06-28; recorded manually'])
on conflict (version) do nothing;
```
The `schema_migrations` table columns are `version text`, `statements text[]`, `name text`.
A `supabase db push` will now correctly **skip** both. No further action needed.

**Lesson for next time:** apply migrations via the Supabase CLI (`supabase db push`) so history
records automatically, OR record the row manually right after a direct psql apply. Don't blindly
re-run a psql-applied migration through the CLI — A4 in particular is non-idempotent (e.g.
`alter table public.work_examples rename column name to title` has no column-level guard).

## Applied to production (confirmed, all recorded in schema_migrations)

- All `20260604*`–`20260623000100_public_foundation_schema.sql` foundation migrations.
- `20260626000100_public_job_scan_results.sql` — applied 2026-06-28 via psql, recorded.
- `20260627000100_generator_redesign_profile_schema.sql` — applied via psql (prior session), recorded 2026-06-28.

## Applied 2026-06-30

- `20260629000400_public_job_sources.sql` — DDL **applied to prod via the dashboard SQL editor by
  Randall** (job_sources table + new jobs columns: external_job_id, apply_url, department,
  salary_min, salary_max). **Bookkeeping NOT yet recorded** in
  `supabase_migrations.schema_migrations` (PostgREST cannot reach that schema, so it could not be
  recorded programmatically). To record it, run in the SQL editor:
  ```sql
  insert into supabase_migrations.schema_migrations (version, name, statements) values
    ('20260629000400', 'public_job_sources', array['-- applied via dashboard 2026-06-30'])
  on conflict (version) do nothing;
  ```
- After applying, `job_sources` was seeded with 16 starter companies (Greenhouse/Ashby/Lever) and a
  first source scan was run manually against prod (2105 jobs upserted). See `docs/current-state.md`.

## NOT yet applied to production

- `20260629000100_pursuit_events.sql`, `20260629000200_contact_selection.sql`,
  `20260629000300_outreach_work_examples.sql` (Codex pursuit/outreach migrations) — needed before
  the pursuit features work in prod. Apply via dashboard/psql, then record each in
  `schema_migrations` per the lesson above.

## How the app connects (context)

The app authenticates to the database with the **`service_role` key** (PostgREST, RLS-bypass),
not the database password. Direct `psql`/CLI work needs the DB connection string from the
dashboard (Direct connection, `db.<ref>.supabase.co:5432`, user `postgres`) — note the
pooler (`*.pooler.supabase.com`, user `postgres.<ref>`) lags behind password resets, so use
the Direct host right after a reset.

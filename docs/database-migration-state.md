# Database Migration State

Durable record of what has actually been applied to the **production** Supabase
database (`job-search`, ref `ngftlvlslhjsyjcbuuwv`), and where the migration-history
bookkeeping diverges from the `supabase/migrations/` folder. Read this before running
any `supabase db push` / `supabase migration` command against this project.

## ⚠️ Migration-history divergence (IMPORTANT)

`supabase/migrations/20260627000100_generator_redesign_profile_schema.sql` (the Phase A4
generator-redesign schema) was **applied directly via `psql`** on **2026-06-28**, not through
the Supabase CLI. As a result:

- The migration ran successfully and the production schema is correct (new tables
  `fit_signals`, `work_examples`, `voice_personality`, `skill_work_examples` exist; legacy
  `project_proofs`, `communication_style_settings`, `work_history_items`,
  `skill_project_proofs` are dropped; `writing_samples` migrated to the bucket model).
- **But `supabase_migrations.schema_migrations` has NO row for `20260627000100`.**

### Consequence
A future `supabase db push` (or `supabase migration up`) will think `20260627000100` is
pending and try to **re-apply** it. It is NOT safe to blindly re-run: several statements are
not idempotent (e.g. `alter table public.work_examples rename column name to title` has no
column-level `if exists` guard and will error because the rename already happened). The run
would abort partway.

### How to reconcile (pick one before using the CLI again)
1. **Record it as applied** without re-running — insert the history row so the CLI skips it:
   ```sql
   insert into supabase_migrations.schema_migrations (version, name)
   values ('20260627000100', 'generator_redesign_profile_schema')
   on conflict do nothing;
   ```
   (Confirm the exact column set on `supabase_migrations.schema_migrations` first; some CLI
   versions also expect a `statements` array.)
2. Or adopt the CLI as source of truth via `supabase migration repair --status applied 20260627000100`.

## Applied to production (confirmed)

- All `20260604*`–`20260623000100_public_foundation_schema.sql` foundation migrations.
- `20260627000100_generator_redesign_profile_schema.sql` — applied 2026-06-28 via psql (see above).

## NOT yet applied to production

- **`20260626000100_public_job_scan_results.sql`** — the `job_scan_results` bridge table for
  the public Jobs/Saved Jobs scan flow. Onboarding does not need it, but the public Jobs
  feature does. Scheduled as a near-term to-do (see `docs/project-todo.md`). When applying,
  prefer the Supabase CLI so history stays clean — but first resolve the `20260627000100`
  divergence above, or the CLI will trip on it.

## How the app connects (context)

The app authenticates to the database with the **`service_role` key** (PostgREST, RLS-bypass),
not the database password. Direct `psql`/CLI work needs the DB connection string from the
dashboard (Direct connection, `db.<ref>.supabase.co:5432`, user `postgres`) — note the
pooler (`*.pooler.supabase.com`, user `postgres.<ref>`) lags behind password resets, so use
the Direct host right after a reset.

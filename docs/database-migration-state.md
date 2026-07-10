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

## Applied 2026-06-30 (all confirmed + recorded in schema_migrations)

- `20260629000100_pursuit_events.sql`, `20260629000200_contact_selection.sql`,
  `20260629000300_outreach_work_examples.sql` — pursuit/outreach schema. Applied via the Supabase
  **Management API** (`POST /v1/projects/{ref}/database/query`). `pursuit_events` confirmed present
  with RLS + `pursuit_events_owner` policy.
- `20260629000400_public_job_sources.sql` — applied via dashboard by Randall (job_sources + new
  jobs columns). Then `job_sources` seeded with 16 starter companies and a first source scan run
  (2105 jobs upserted). See `docs/current-state.md`.
- `20260630000100_subscription_plans_rls.sql` — RLS enabled on subscription_plans (Security
  Advisor fix). Anon read now returns `[]`; service role still reads it.
- `20260630000200_jobs_posting_sections.sql` — adds `responsibilities`/`required_experience text[]`
  to `jobs` (posting parser). Applied via Management API + recorded; backfilled by re-running the
  source scan (2102 jobs).

## Applied 2026-07-07 (confirmed + recorded in schema_migrations)

- `20260706000100_resume_highlights.sql` — adds `highlights text[] not null default '{}'` to
  `public.resumes` (curated stat/company bullets for outreach). Additive + idempotent
  (`add column if not exists`). Applied via the Management API and recorded in
  `schema_migrations` (`resume_highlights`). Column confirmed present (`data_type ARRAY`,
  default `'{}'::text[]`, NOT NULL).

As of 2026-06-30, **every migration in `supabase/migrations/` is applied and recorded** — prod
schema matches the repo (reconciled by comparing files to `schema_migrations`).

## How to apply migrations (current method)

Migrations can now be applied **programmatically from the working environment** via the Supabase
Management API, which runs SQL as `postgres` (full DDL):

```bash
set -a; . ./.env.local; set +a   # provides SUPABASE_ACCESS_TOKEN (personal access token, gitignored)
curl -s -X POST "https://api.supabase.com/v1/projects/ngftlvlslhjsyjcbuuwv/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "$(jq -Rs '{query: .}' < supabase/migrations/<file>.sql)"
```

After applying, insert the row into `supabase_migrations.schema_migrations (version, name,
statements)` via the same API so `supabase db push` stays in sync. `SUPABASE_ACCESS_TOKEN` lives in
`.env.local` only (gitignored); it is not committed and not synced across machines — regenerate at
https://supabase.com/dashboard/account/tokens if missing.

## Applied 2026-07-09 (confirmed + recorded in schema_migrations)

- `20260709000100_comp_hourly_fields.sql` — adds `target_compensation_hourly_min` /
  `target_compensation_hourly_preferred numeric(8,2)` to `candidate_profiles`
  (Identity & Search remediation C2). Additive + idempotent. Applied via the
  Management API BEFORE the code deploy (new code writes these columns); columns
  confirmed present; recorded as `comp_hourly_fields`.

- `20260709000200_drop_identity_url_fields.sql` — drops `linkedin_url` /
  `portfolio_url` / `personal_website_url` from `candidate_profiles` (remediation C1).
  Applied via the Management API AFTER deploy `eeddc12` was verified live on the
  production aliases (2026-07-09); columns confirmed gone; recorded as
  `drop_identity_url_fields`.

- `20260709000300_drop_overclaim_rolefit_companytypes.sql` — drops
  `candidate_profile_preferences.target_company_types`, `role_tracks.do_not_overclaim`,
  `skill_profiles.best_role_fit`, `skill_profiles.do_not_overclaim` (findings-batch
  decisions #1-#3). Validated first on a throwaway local Postgres 16 (clean apply +
  idempotent re-apply). Applied via the Management API AFTER deploy `58c6734` was
  verified live (new OnboardingClient chunk confirmed serving); `information_schema`
  confirms all four columns gone; recorded as `drop_overclaim_rolefit_companytypes`.

## NOT yet applied to production

- `20260710000100_job_scan_results_dismissed_status.sql` — adds `dismissed` to the
  `job_scan_results.status` check constraint (Skip feature, commit `d4e662b`). Apply
  AFTER that code deploy is verified live; confirm the constraint name against prod
  first (the migration drop/recreates `job_scan_results_status_check`). Until applied,
  POST /api/jobs/skip fails gracefully (API error, nothing crashes).
- `20260710000200_job_sources_owner_user.sql` — adds `owner_user_id` to `job_sources`
  + owner-scoped unique index (`nulls not distinct`, requires PG15+ — verify with
  `select version()`) replacing the global 3-column unique key (private per-user
  boards, commit `d4e662b`). Apply AFTER the code deploy, same session as 000100.
  Until applied, GET/POST /api/jobs/boards fail gracefully and the scan's user-board
  pass no-ops. NOTE: the `job_sources` clean-slate reset Randall wants ships with this
  feature but is a SEPARATE decision at apply time (scope TBD; deleting `jobs` rows
  cascades to saved_jobs/job_scan_results/pursuits — do not bundle silently).

## How the app connects (context)

The app authenticates to the database with the **`service_role` key** (PostgREST, RLS-bypass),
not the database password. Direct `psql`/CLI work needs the DB connection string from the
dashboard (Direct connection, `db.<ref>.supabase.co:5432`, user `postgres`) — note the
pooler (`*.pooler.supabase.com`, user `postgres.<ref>`) lags behind password resets, so use
the Direct host right after a reset.

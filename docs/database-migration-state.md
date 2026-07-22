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

Every migration through `20260721000100` is applied and recorded. The most recent production
apply is the broad-source restoration migration documented below.

## Applied 2026-07-20 (confirmed + recorded in schema_migrations)

- `20260720000100_human_path_contact_reachability.sql` adds the nullable
  `professional_contact_url text` fallback to `contact_suggestions`. Validated on disposable
  PostgreSQL 16 with clean apply and idempotent reapply, applied through the Management API,
  and recorded as `human_path_contact_reachability`. Production verification confirmed the
  column and migration-history row. The verified LinkedIn URLs for the existing Perplexity
  contact rows Chris Segura and Kevin Kraft were backfilled after the schema apply.

## Applied 2026-07-21 (confirmed + recorded in schema_migrations)

- `20260721000100_restore_mapped_job_sources.sql` restores the retired scanner's broad-market
  source map into global `job_sources`, without adding the 21 targeted company mappings recovered
  from Randall's personal profile. The idempotent seed adds 69 broad rows: 20 Himalayas,
  20 Workable, 20 keyed Adzuna, 4 Remotive, 2 We Work Remotely RSS, Arbeitnow, Remote OK, and
  Magnit Direct Sourcing. Applied through the Management API and recorded as
  `restore_mapped_job_sources`. Production postflight: 85 active global sources, 1 private source,
  20 active Adzuna sources, zero active sources without `last_scanned_at`, zero source errors, and
  4,017 shared jobs after the initial backfill and one isolated Adzuna 503 retry.

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

## Applied 2026-07-10 (confirmed + recorded in schema_migrations)

- `20260710000100_job_scan_results_dismissed_status.sql` — adds `dismissed` to the
  `job_scan_results.status` check constraint (Skip feature, commit `d4e662b`). Applied
  via the Management API AFTER the code deploy was verified live (skip/boards routes
  returning 401 on prod), with Randall's explicit go. Pre-checked the constraint name
  against prod (`job_scan_results_status_check`, exact match); post-check confirms the
  4-value CHECK including `dismissed`. Recorded as `job_scan_results_dismissed_status`.
- `20260710000200_job_sources_owner_user.sql` — adds `owner_user_id uuid` to
  `job_sources` + owner-scoped `nulls not distinct` unique index
  (`job_sources_owner_board_key`) replacing the global 3-column unique key (private
  per-user boards, commit `d4e662b`). Prod is PG 17.6, so `nulls not distinct` is fine.
  Post-check confirms the column (uuid, nullable) and both new indexes; the old
  `job_sources_ats_provider_ats_board_token_careers_url_key` is gone. Recorded as
  `job_sources_owner_user`.

## Applied 2026-07-15 (confirmed + recorded in schema_migrations)

- `20260714000100_outreach_message_regeneration.sql` — adds `previous_message text` and
  `regeneration_count smallint not null default 0` (CHECK 0 or 1) to `outreach_messages`
  (single message regeneration, Codex handoff commit `9e7f1d3`). Additive + idempotent;
  validated by Codex on throwaway local Postgres first. Applied via the Management API and
  recorded as `outreach_message_regeneration`. Post-checks confirmed both columns (smallint
  default 0 NOT NULL / text nullable) and the CHECK constraint. NOTE: the code deploy
  (auto-deploy of `9e7f1d3`) reached production BEFORE this migration ran, and the deployed
  repository selects the new columns on every outreach-message read — the outreach read
  path was briefly broken on prod until this migration was applied. Lesson: for handoff
  commits that pair code + migration, apply the migration immediately after (or before)
  the push, not at next-session pickup.

## Applied 2026-07-15, second batch (confirmed + recorded in schema_migrations)

Private pasted jobs (Randall's decision 2026-07-15: "a pasted job is exclusive to that
user"), applied as a two-phase pair around deploy `d74eec3`:

- `20260715000100_jobs_owner_user.sql` — adds `jobs.owner_user_id uuid` (FK auth.users,
  on delete cascade; null = shared pool), unique index `jobs_source_url_owner_key`
  `(source, source_url, owner_user_id) nulls not distinct`, and owner-scopes the
  `jobs_read_authenticated` RLS policy. Validated on throwaway local PG 16 (clean +
  idempotent reapply, uniqueness/cascade semantics), applied via Management API BEFORE
  the deploy (old code unaffected; old 2-col key retained as its conflict target).
- `20260715000200_jobs_drop_global_source_url_key.sql` — drops the global
  `jobs_source_source_url_key` AFTER deploy `d74eec3` was verified live (new dashboard
  chunk + corrected OG confirmed serving), enabling per-user private copies of the same
  pasted URL. Post-checks: old constraint gone, new index present, history rows
  `jobs_owner_user` + `jobs_drop_global_source_url_key` recorded.
- Cleanup with the pair: the orphaned 07-15 QA `user_link` row (Reddit posting, owner
  account deleted) was removed; `user_link` rows in prod = 0 at that point.

## Applied 2026-07-18 (confirmed + recorded in schema_migrations)

Saved Pursuits chain, applied in order via the Supabase Management API with Randall's explicit
authorization (migration-first sequencing), each recorded in `schema_migrations`:

- `20260718000100_saved_pursuits_foundation.sql`
- `20260718000200_saved_pursuits_atomic_mutations.sql`
- `20260718000300_saved_pursuits_data_readiness.sql`

Read-only preflight ran clean beforehand: no duplicate/non-unit pursuit debits, no legacy Offer
rows (status 0 / event 0), no missing convertible jobs, no note conflicts, no missing profile/job
references. Prod dataset at apply time: 1 saved_job (already a pursuit — idempotent conversion),
3 pursuits, 4 outreach drafts.

Post-apply verification (Management API):
- All three versions present in `schema_migrations`.
- Plan quotas set: basic 0/0/0, pro 0/0/25, premium 50/150/50, tester 25/75/25
  (pursuit/humanpath/outreach per month) — matches `lib/public-profile/subscription/rules.ts` and
  the DUMPSTERFRIENDS→premium full-access model (default no-code = 0 pursuits).
- `pursuits_without_posting_snapshot` = 0 (backfilled from 3).
- RPCs present: `mutate_pursuit_tracking`, `record_outreach_message_copy`,
  `persist_initial_outreach_generation`, `set_canonical_job_saved`.
- Owner-select RLS policies on `pursuits`, `pursuit_events`, `pursuit_tracking_events`.
- Write privileges revoked from anon/authenticated on all five pursuit tables — confirmed via
  `has_table_privilege` (INSERT/UPDATE false) and raw ACL (`anon=rxtm`, `authenticated=rxtm`);
  `information_schema.role_table_grants` overreports under the postgres superuser context and is
  NOT authoritative here. service_role retains full DML.

Note (pre-existing Supabase default, not introduced by this chain): `pg_default_acl` for role
`postgres` still grants `arwdDxtm` to anon/authenticated on FUTURE public tables, so new tables
auto-grant broad privileges until explicitly revoked. Out of scope for this chain.

## Applied 2026-07-20 (confirmed + recorded in schema_migrations)

- `20260719000100_feedback_capture.sql` - job-match and outreach-message feedback capture.
  Applied via the Supabase Management API before the application deployment and recorded as
  `feedback_capture` immediately afterward.
- Read-only preflight: all three `20260718` prerequisites present; feedback migration absent;
  `job_match_feedback` absent; `saved_message_feedback` rows 0; duplicate groups 0; notes over
  500 characters 0; ownership mismatches 0; generation-request table present.
- Postflight: migration-history row present; nine expected new/context columns visible;
  28 feedback-related constraints present; all five expected indexes present; owner policies
  present on both feedback tables.
- Privileges: authenticated SELECT true and INSERT false for both feedback tables; service-role
  INSERT true for both tables.
- PostgREST returned HTTP 200 for the new job feedback columns, message feedback generation
  columns, and outreach regeneration context.
- The migration retains job-feedback evidence after job deletion through a nullable FK with
  `on delete set null`; immutable job/profile/match snapshots remain on the feedback row.

(Open, separate decision — NOT a migration: the `job_sources`
  clean-slate reset Randall wants alongside the private-boards feature. Scope TBD;
  deleting `jobs` rows cascades to saved_jobs/job_scan_results/pursuits — needs his
  explicit scope call before any delete runs.)

## Applied 2026-07-12 (confirmed + recorded in schema_migrations)

- `20260712000100_unrecognized_board_submissions.sql` — creates the admin-owned unreadable-board
  submission log with reason validation, user FK, created-at index, and RLS. Validated first on
  throwaway PostgreSQL 16.14, then applied to production via the Supabase Management API with
  Randall's explicit authorization. Production verification confirmed five columns, RLS enabled,
  one CHECK, one FK, the created-at index, PostgREST 200, and migration-history version
  `20260712000100` recorded as `unrecognized_board_submissions`.

## How the app connects (context)

The app authenticates to the database with the **`service_role` key** (PostgREST, RLS-bypass),
not the database password. Direct `psql`/CLI work needs the DB connection string from the
dashboard (Direct connection, `db.<ref>.supabase.co:5432`, user `postgres`) — note the
pooler (`*.pooler.supabase.com`, user `postgres.<ref>`) lags behind password resets, so use
the Direct host right after a reset.

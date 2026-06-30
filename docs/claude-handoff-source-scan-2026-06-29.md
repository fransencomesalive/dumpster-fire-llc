# Claude Handoff — Source Scan (Slice 1 + 1b) — 2026-06-29

## Where we are

Four commits on `main`, **not yet pushed** to `origin/main`:

```
1bfec5e add scheduled source scan trigger (slice 1b)
170ddd2 rename job ingestion to the Scan paradigm
69bb121 add public job ingestion engine (connectors slice 1)
eb5409f add public profile pursuit read/list API
```

Everything is validated: all test suites pass, `tsc` clean, `npm run lint` 0 errors (7 pre-existing
warnings), `npm run build` compiles, migration validated on a throwaway local Postgres,
`git diff --check` clean. Nothing is deployed and the new migration is **not applied to prod**.

## What was built

- **Pursuit read/list API** (`eb5409f`): `GET /api/public-profile/pursuits` (list + counts) and
  `GET /api/public-profile/pursuits/[id]` (full detail).
- **Source scan engine** (`69bb121`, renamed in `170ddd2`): independent connector engine in
  `lib/scan/sources/` (all providers ported: Greenhouse, Lever, Ashby, Workday, iCIMS, Magnit,
  HTML, RSS, Rippling, Adzuna, Workable). `runSourceScan` in `lib/scan/source-scan.ts` fills the
  public `jobs` table. Migration `20260629000400_public_job_sources.sql` adds the `job_sources`
  config table and extends `jobs` with `external_job_id`, `apply_url`, `department`, `salary_min`,
  `salary_max`.
- **Source scan trigger** (`1bfec5e`): `GET|POST /api/jobs/source-scan` guarded by `CRON_SECRET`,
  scheduled daily via `vercel.json`. See `docs/scan-sources-setup.md`.

## Why it's structured this way (don't re-litigate)

- Two job-scanner worlds exist. Legacy `/scans` connectors fill `job_search_jobs`; the public app
  reads a separate public `jobs` table that nothing populated. This work feeds the public table
  independently — no dependency on the legacy DB/system.
- The public app keeps its OWN matching (`lib/public-profile/matching/` + `jobMatchesProfile`), so
  the legacy relevance/scoring layer was deliberately not ported. Source scan fills a SHARED pool;
  per-user relevance is applied at scan time. Filtering the shared pool to one user would be wrong.

## Next steps, in order, when we restart

1. **`git pull`** first (cross-machine sync), then `git status --short --branch`.
2. **Push these 4 commits** (`git push`) and let Vercel deploy. The endpoint and the cron only
   exist in prod after deploy. (Vercel registers `vercel.json` crons on Production deploys.)
3. **Apply migration `20260629000400` to prod** (creates `job_sources` + the new `jobs` columns).
   Follow `docs/database-migration-state.md`: apply via psql, then record the row in
   `supabase_migrations` so history stays clean.
4. **Set `CRON_SECRET` in Vercel** — see coaching below.
5. **Seed `job_sources`** with real companies/boards — see coaching below.
6. **Verify** end to end (manual trigger + row counts) — see coaching below.
7. Optional follow-ups (unblocked, no decisions needed):
   - Wire `evaluateMatch` (the rich scorer) into per-user scan-result ranking/annotation in
     `runPublicJobsScanForUser` — today it selects with the coarse `jobMatchesProfile` only.
   - De-duplicate the connector engine shared with legacy `app/scans` (isolated refactor).

## Coaching: the cron job / CRON_SECRET

**What it is.** `/api/jobs/source-scan` is a system-wide trigger, not a per-user action, so it isn't
behind user login. It's protected by a shared secret in the `CRON_SECRET` env var. Vercel Cron
automatically attaches `Authorization: Bearer ${CRON_SECRET}` when it calls the scheduled path, and
our handler checks it. (This is an application-level guard inside the route — not Vercel's
server-level "Protection", which we never enable.)

**Behavior by state:**
- `CRON_SECRET` not set → endpoint returns `503` (won't run).
- Set, but caller sends wrong/no bearer → `401`.
- Set + correct bearer → runs and returns a JSON summary.

**Steps to turn it on:**
1. Generate a strong secret: `openssl rand -hex 32`.
2. Vercel → Project → Settings → Environment Variables → add `CRON_SECRET` (Production; Preview is
   optional). Paste the value. Do NOT commit it to the repo.
3. Redeploy (the push in step 2 above triggers this). On the Production deploy, Vercel reads
   `vercel.json` and registers the daily cron automatically.
4. Confirm in Vercel → the project's **Cron Jobs** tab: you should see
   `/api/jobs/source-scan` scheduled `0 6 * * *`, with run history after it first fires.

**Gotchas:**
- Crons run only on **Production** deployments.
- Hobby plan allows **daily** crons only — our schedule is daily, so it's fine. On Pro you can edit
  `vercel.json` to `0 */6 * * *` (every 6h) for fresher jobs.
- Set `CRON_SECRET` before/at the deploy you want it to work on.

## Coaching: the job_sources need

**What it is.** `job_sources` is the list of companies/boards the scan pulls from. It ships **empty**,
so until you add rows, every run is a safe no-op (totalSources: 0).

**What you need to gather** — for each company, the provider plus one identifier:

| provider     | identifier goes in | where to find it                                              |
|--------------|--------------------|--------------------------------------------------------------|
| `greenhouse` | `ats_board_token`  | the slug in `boards.greenhouse.io/<token>`                    |
| `lever`      | `ats_board_token`  | the slug in `jobs.lever.co/<slug>`                            |
| `ashby`      | `ats_board_token`  | the slug in `jobs.ashbyhq.com/<slug>`                         |
| `workday`    | `careers_url`      | the full Workday careers URL                                  |
| `icims`      | `careers_url`      | the full careers/listing URL                                  |
| `magnit`     | `careers_url`      | the full careers/listing URL                                  |
| `html`       | `careers_url`      | careers page or job-board API URL (Adzuna/Workable/RSS/etc.)  |

**How to add them.** After the migration is applied to prod, insert rows via the Supabase SQL editor
(or psql) with the service role:

```sql
insert into public.job_sources (company_name, ats_provider, ats_board_token, careers_url) values
  ('Stripe',  'greenhouse', 'stripe',  ''),
  ('Netflix', 'lever',      'netflix', ''),
  ('OpenAI',  'ashby',      'openai',  '');
```

- `status` defaults to `active`; set `paused` to skip a source.
- `workday_variants` (text[]) only matters for Workday (title keywords to widen coverage); leave `{}`
  otherwise.
- Easiest start: a handful of Greenhouse/Lever/Ashby orgs — they're keyless public board APIs.
- If you give me a starter list of companies next session, I'll turn it into the insert for you.

## Coaching: verification (after secret + seeds)

1. **Manual trigger:**
   ```bash
   curl -X POST https://<prod-domain>/api/jobs/source-scan \
     -H "Authorization: Bearer <your CRON_SECRET>"
   ```
   Expect JSON like `{ "ranAt": ..., "totalSources": N, "totalFetched": X, "totalUpserted": Y,
   "sources": [ { "companyName": ..., "status": "scanned"|"error", "fetched": ..., "upserted": ... } ] }`.
2. **Negative checks:** no header → `401`; (before secret set) → `503`.
3. **DB checks:**
   ```sql
   select company_name, last_scanned_at, last_error from public.job_sources order by last_scanned_at desc nulls last;
   select count(*) from public.jobs;
   ```
   Per-source `error` strings tell you which board/token is wrong; a bad source never aborts the rest.
4. Then run a normal per-user scan (`/api/jobs/scan`) and confirm the freshly ingested jobs match.

## Files touched (for reference)

- `lib/scan/sources/{types,connectors,runner,registry}.ts`, `lib/scan/source-scan.ts`,
  `lib/scan/api.ts`
- `app/api/jobs/source-scan/route.ts`, `app/api/public-profile/pursuits/route.ts`,
  `app/api/public-profile/pursuits/[id]/route.ts`
- `lib/public-jobs/repository.ts` (batch loader), `lib/public-profile/{api,pursuits/*}.ts`
- `supabase/migrations/20260629000400_public_job_sources.sql`, `vercel.json`
- `scripts/test-scan-sources.*`, `scripts/test-source-scan.*`, `scripts/test-scan-api.*`,
  `scripts/test-public-profile-{api,pursuits}.ts`
- `docs/scan-sources-setup.md` (the standalone how-to), this handoff, `docs/current-state.md`,
  `docs/project-todo.md`

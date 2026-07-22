# Source Scan Setup

How to turn on the public source scan (the system-wide job ingestion that fills the public `jobs`
table). Built 2026-06-29 (Slice 1b). Until both steps below are done, the scheduled trigger runs
but finds no sources and is a safe no-op.

## 1. Set the trigger secret

The endpoint `GET|POST /api/jobs/source-scan` is guarded by a shared secret so only the scheduler
can run it.

- In Vercel, set the `CRON_SECRET` environment variable (Production, and Preview if desired).
- Vercel Cron automatically sends `Authorization: Bearer ${CRON_SECRET}` on scheduled invocations,
  so no extra wiring is needed.
- Without `CRON_SECRET` set, the endpoint returns `503` (not configured). With it set, any caller
  must present the matching bearer token or it returns `401`.

Manual run (admin/debug):

```bash
curl -X POST https://<host>/api/jobs/source-scan \
  -H "Authorization: Bearer $CRON_SECRET"
```

## 2. Schedule

`vercel.json` schedules the source scan daily at 06:00 UTC:

```json
{ "crons": [{ "path": "/api/jobs/source-scan", "schedule": "0 6 * * *" }] }
```

Daily is compatible with all Vercel plans. On Pro you can increase frequency (e.g. `0 */6 * * *`
for every six hours) by editing the schedule.

## 3. Add or adjust scan sources

The scan reads active global rows from the `job_sources` table. Migration
`20260721000100_restore_mapped_job_sources.sql` restores only the mapped broad feeds from the
retired scanner. It intentionally excludes targeted company boards because those mappings came
from a personal watchlist and must not become defaults for other users. User-owned rows are fetched
only by that user's Run scan and are excluded from this scheduled global scan. The restored Adzuna
rows are active and require `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` in production. Each provider needs
a different identifier:

| provider     | put the identifier in        | example                                                        |
|--------------|------------------------------|----------------------------------------------------------------|
| `greenhouse` | `ats_board_token`            | board token, e.g. `stripe`                                      |
| `lever`      | `ats_board_token`            | org slug, e.g. `netflix`                                        |
| `ashby`      | `ats_board_token`            | org slug, e.g. `openai`                                         |
| `workday`    | `careers_url` (+ token opt.) | full careers URL, e.g. `https://co.wd1.myworkdayjobs.com/en-US/External` |
| `icims`      | `careers_url`                | full careers/listing URL                                       |
| `magnit`     | `careers_url`                | full careers/listing URL                                       |
| `html`       | `careers_url`                | careers page or job-board API URL (Adzuna/Workable/RSS/etc.)   |

Example insert (run against the public Supabase DB with the service role):

```sql
insert into public.job_sources (company_name, ats_provider, ats_board_token, careers_url) values
  ('Stripe',  'greenhouse', 'stripe',  ''),
  ('Netflix', 'lever',      'netflix', ''),
  ('OpenAI',  'ashby',      'openai',  '');
```

Optional columns:
- `status` — `active` (default) or `paused`. Paused sources are skipped.
- `workday_variants` — `text[]` of title keywords to fan out a Workday tenant's search across (large
  Workday boards only return ~20 newest postings per query). Leave `{}` for non-Workday sources.

After a run, each source's `last_scanned_at` and `last_error` are updated. Per-source failures are
isolated — one bad source never aborts the rest.

## What this does NOT do

- It does not filter to any one user's relevance — it fills the shared `jobs` pool. Per-user
  relevance is applied at scan time (`/api/jobs/scan`).
- It does not require any legacy `/scans` system or `job_search_*` tables. The connector engine is
  the independent port in `lib/scan/sources/`.

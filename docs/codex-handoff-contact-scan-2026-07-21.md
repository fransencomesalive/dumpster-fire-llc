# Codex handoff: Human Path contacts and scan sources, 2026-07-21

## Production state

- Implementation commit: `7df17f6` on `main`, pushed to `origin/main`.
- GitHub CI release check passed. Four existing unused-symbol warnings remain.
- Vercel production root and dashboard return 200. The deployed dashboard bundle contains the new
  zero-contact recovery state. `/api/jobs/source-scan` returns the expected protected 401 without
  its cron bearer token.
- Migration `20260721000100_restore_mapped_job_sources.sql` is applied and recorded as
  `restore_mapped_job_sources`.
- Production sources: 85 active global, 1 private, 20 active Adzuna, 0 active errors, 0 active
  sources without `last_scanned_at`.
- Shared jobs: 4,017 total. Broad-source counts: Adzuna 270, Himalayas 344, Workable 221,
  Arbeitnow 100, Remote OK 99, Remotive 41, We Work Remotely 23.

## Root causes and fixes

Contact discovery allowed the research model to infer a person or title from role-like search
evidence, then presented that unsupported title as fact. The revised provider requires a verified
direct LinkedIn profile, reconciles headline and current-experience evidence, rejects identity,
company, current-role, and eligibility conflicts, and returns no contact rather than fabricating.

A completed zero-contact search previously rendered an empty contact step and then showed the
selection validation intended for a non-empty list. The wizard now persists the zero-contact state,
does not repeat the same discovery method, disables steps 3 and 4 plus Continue, and supplies a
preloaded LinkedIn Boolean people search.

The public scan had narrowed to 16 global starter boards even though the retired source registry
contained broad-market connectors. The new migration restores 69 broad mappings. The 21 targeted
company rows are deliberately held back because they came from Randall's personal profile and must
not become defaults for new users. The global cron also now excludes private `owner_user_id` rows,
groups different hosts concurrently while keeping same-host queries sequential, retains explicit
broad-source attribution, and includes department data in matching.

## Attempts and operational findings

- The first proposed migration included the 21 targeted rows. Randall corrected that boundary;
  they were removed before commit, deploy, or production migration.
- Adzuna keys were absent initially. Randall added them to local `.env.local` and Vercel Production.
  A direct authenticated check returned HTTP 200 and 25 results without exposing the credentials.
- Local Node HTTPS stalled before source requests even though curl worked. Two stopped attempts made
  no scan writes. The one-time backfill used a temporary curl IPv4 transport with the production
  connector parsers, normalization, upsert, attribution, and error handling unchanged.
- The first completed backfill fetched 5,067 rows and attempted 3,424 idempotent upserts across
  84 successful sources in 221.7 seconds. Adzuna Brand Operations alone returned HTTP 503; its
  isolated retry succeeded with 4 jobs. Final production source errors are zero.

## Verification completed

- `npm run build -- --webpack`
- `npm run typecheck`
- `npm run test:migrations:mapped-job-sources`
- `node scripts/test-source-scan.mjs`
- `node scripts/test-scan-sources.mjs`
- `npm run test:fixtures` (28 suites)
- GitHub CI release checks
- Production root/dashboard HTTP 200 and deployed-bundle copy match
- Supabase migration-history, source-health, and shared-job count readbacks

## Next immediate starting point

1. After the next scheduled 06:00 UTC Vercel source cron, verify all 85 global rows received a new
   `last_scanned_at`, `last_error` remains empty, and the invocation completed inside the route's
   60-second function budget. The 221.7-second local backfill is not a Vercel runtime measurement.
2. Register/read back the touched `design-system/components/apply-wizard.html` card in Claude Design
   project `3af2f1ea-428c-49b3-8b02-c066ec0c7452`. Local DS and production mirrors match and the
   manifest entry exists, but the remote registration tool was unavailable in this Codex session.
3. If desired, run one authenticated production pursuit through contact discovery to verify real
   zero-contact and evidence-conflict behavior end to end. This is metered and was not run here.

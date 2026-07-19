# Codex Handoff: Saved Pursuits Backend and API

Date: 2026-07-18
Branch: `main`
Design source of truth: `docs/claude-design-saved-pursuits-brief-2026-07-18.md`
Product contract: `docs/saved-pursuits-feature-spec-2026-07-18.md`

## Completed scope

The approved backend, API, migration-readiness, security, dependency, and automated-QA work is
implemented locally. This does not include UI/CSS work, production migration execution,
deployment, or production verification.

Implemented behavior:

- Six independent tracking actions with no gates or mutual exclusion.
- Mark and unmark operations append timestamped events; reversals never remove history or
  automatically demote an Applied pursuit.
- First positive tracking or first persisted message Copy latches Applied atomically and
  idempotently.
- Applied detail is generation-free. It reads saved posting, contacts, messages, tracking, and
  structured history without calling Review, Human Path, generation, or regeneration.
- Message Copy persists immutable message and recipient snapshots. A persist failure remains a
  retryable non-success and never claims tracking was saved.
- Saved Pursuits list reads are batched instead of issuing three queries per pursuit, preserve
  private-job ownership, and return card data without message text, email, LinkedIn URLs, raw
  events, or provider internals.
- Pursuit history uses deterministic event ordering and represents migrated unknown timestamps
  as unavailable rather than displaying an invented date.
- Original posting and mutable selection context are snapshotted. Profile and job references are
  nullable and use `ON DELETE SET NULL`, so saved history survives profile/job deletion.
- Dashboard Save/Unsave uses one canonical atomic RPC when migration `180003` is installed. A
  missing-RPC-only compatibility fallback preserves the existing `saved_jobs` surface during the
  main-auto-deploy/explicit-migration authorization window; every other RPC error still surfaces.
- Existing `saved_jobs` rows convert idempotently into canonical unmetered Saved for Later
  pursuits. Notes and valid legacy facts are preserved; Offer is counted but never mapped.
- Initial outreach retries replay a prior committed result before profile, job, contact, message,
  or model dependencies. Transactional quota errors map back to the existing subscription API
  response.
- Pursuit and outreach quota enforcement is serialized per user inside the database transaction.
  The pursuit latch is ledger-authoritative and duplicate pursuit debits are prevented.
- Anon/authenticated direct mutation privileges were removed from pursuit and tracking tables;
  atomic RPCs remain service-role-only.
- Next.js, React, Nodemailer, Vercel Blob, PostCSS, and Undici dependencies were updated to patched
  versions. `npm audit` reports zero known vulnerabilities.
- One aggregate fixture runner, one release check, and CI on `main` now cover the disposable
  database migration, 28 fixture suites, typecheck, lint, and production build.

## Files in this pass

- `lib/public-jobs/repository.ts`
- `lib/public-jobs/types.ts`
- `lib/public-profile/api.ts`
- `lib/public-profile/pursuits/repository.ts`
- `lib/public-profile/pursuits/state-machine.ts`
- `lib/public-profile/pursuits/tracking.ts`
- `lib/public-profile/pursuits/types.ts`
- `supabase/migrations/20260718000300_saved_pursuits_data_readiness.sql`
- `scripts/sql/saved-pursuits-production-preflight.sql`
- `scripts/test-saved-pursuits-migration.sh`
- `scripts/test-fixtures.mjs`
- `scripts/release-check.mjs`
- `scripts/test-public-jobs-repository.ts`
- `scripts/test-public-profile-api.ts`
- `scripts/test-public-profile-regeneration.ts`
- `scripts/test-source-scan.ts`
- `.github/workflows/ci.yml`
- `package.json`
- `package-lock.json`
- `docs/database-migration-state.md`
- this handoff document

## Verification completed

Passed on the final implementation tree:

- Disposable PostgreSQL 16 clean application of migrations `180001`, `180002`, and `180003`.
- Full migration-chain idempotent reapplication.
- Saved-job conversion/count reconciliation, trusted snapshots, known/unknown timestamps, Offer
  exclusion, client privilege revocation, canonical Save/Unsave, foreign private-job rejection,
  latch/ledger integrity, quota rollback/replay, and profile/job `SET NULL` durability.
- All 28 fixture suites through `npm run test:fixtures`.
- `npm run typecheck`.
- `npm run lint`: zero errors and four pre-existing warnings listed below.
- `npm run build` with Next.js 16.2.10.
- `npm run test:public-jobs` after the final private-job list defense.
- `npm audit --json`: zero vulnerabilities at every severity.
- `bash -n scripts/test-saved-pursuits-migration.sh`.
- JavaScript syntax checks for the aggregate test runners.
- `git diff --check`.

Pre-existing lint warnings:

- `app/onboarding/OnboardingClient.tsx`: unused `listField`.
- `lib/public-profile/repository.ts`: unused `FitSignals`.
- `lib/public-profile/repository.ts`: unused `VoicePersonality`.
- `scripts/outreach-quality/gen-style-matrix.mjs`: unused `description`.

## Failed checks and root causes

1. The first full fixture run failed in `test-public-profile-regeneration` because its mocked
   handler intentionally rejected every repository call and had not injected the newly added
   idempotent-replay lookup. The production path was not failing. The fixture now injects the
   replay dependency explicitly, and all 28 suites pass.
2. The first optimized build attempt was blocked by Next.js's build lock. PID 29760 was an
   orphaned earlier `next build` from the interrupted QA worker and still held `.next/lock`.
   After confirming the owner with `lsof`, that orphan was stopped; Next removed the lock and the
   build completed successfully.
3. The first sandboxed disposable-PostgreSQL attempt could not create PostgreSQL shared memory.
   The same isolated test run with local shared-memory access passed repeatedly. No production
   database was contacted.

## Not verified or not completed

### Production migration and deployment

Migrations `20260718000100`, `20260718000200`, and `20260718000300` have not been applied to
production. No deployment or production HTTP verification was performed.

Required after explicit production authorization:

1. Run `scripts/sql/saved-pursuits-production-preflight.sql` read-only against production.
2. Stop if it reports duplicate/non-unit pursuit debits, missing convertible jobs, unexpected
   Offer counts, or another reconciliation problem. Migration `180003` intentionally aborts on
   duplicate historical pursuit debits.
3. Apply the three `20260718` migrations in order through the normal Supabase migration process
   and record all three versions in migration history.
4. Confirm table grants, RLS policies, RPC execution grants, indexes, triggers, nullable FKs,
   snapshot columns, request tables, and reconciliation counts.
5. Exercise Save/Unsave, tracking/reversal, Copy replay/failure/retry, generation replay, quota
   rollback, and owner isolation with two users.
6. Deploy the application, run `curl -I <production-url>`, and confirm HTTP 200 before inspecting
   production content.

### UI and design-system parity

No UI, CSS, design-system card, or public-copy file was edited. The next design/production pass
still owns:

- Saved Pursuits bucket toggle at every breakpoint, one bucket at a time.
- Shared Apply Wizard and Applied Tracking component using the six independent actions.
- Applied opening directly into generation-free Tracking.
- View-only, non-selectable saved-message history with no Copy or regenerate control.
- Honest clipboard-succeeded/persist-failed retry state.
- Retirement of the separate Application Details surface, including the stale `detail.html`
  design-index link discovered by the audit.
- Saved Pursuits entry points and approved vocabulary.
- Full design-system to production parity and mobile/desktop visual verification.

### Compatibility surface

`saved_jobs` remains as a compatibility table and the legacy scalar pursuit status/endpoints remain
temporarily. New Save writes are canonical and atomic after migration `180003`; until that RPC is
present, only its explicit missing-function error falls back to the legacy compatibility write.
Migration `180003` converts those rows. Retiring legacy reads/writes requires the approved UI/data
cutover and verified production reconciliation.

Initial outreach clients should send a stable idempotency key for each distinct generation intent.
A repeated key replays the exact committed request; a new key allows a later distinct generation
for additional selected contacts.

## Next immediate starting point

1. Pull `main` and run `git status --short --branch`.
2. Read this handoff, `docs/project-operating-state.md`, the Saved Pursuits product contract, and
   the Claude design brief.
3. For the approved design pass, map each production surface to the exact approved Claude Design
   card/primitive and list every production plus `design-system/` file before editing.
4. Start with the shared Saved Pursuits/Tracking component contract. Do not create gates and do
   not rebuild Application Details as a separate surface.
5. Keep production migration/deployment as a separate authorization step using the preflight and
   verification sequence above.

No other backend implementation gap is known before the design pass. Production migration and UI
integration remain intentionally unexecuted.

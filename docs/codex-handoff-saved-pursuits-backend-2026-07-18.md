# Codex Handoff: Saved Pursuits Backend and API

Date: 2026-07-18
Branch: `main`
Design source of truth: `docs/claude-design-saved-pursuits-brief-2026-07-18.md`
Product contract: `docs/saved-pursuits-feature-spec-2026-07-18.md`

## Completed scope

The approved backend and API slice is implemented. It does not include UI, CSS, production
migration execution, deployment, or production verification.

Implemented behavior:

- Six independent tracking actions with no gates or mutual exclusion.
- Mark and unmark operations append timestamped events; reversals do not remove history.
- The first positive action or first successfully persisted message Copy latches Applied.
- Applied never automatically returns to Saved for Later.
- Message Copy records immutable message and recipient snapshots from saved server data.
- Copy persistence failures return a retryable non-success response and do not claim tracking
  was saved.
- Applied detail reads load saved records only and do not call Review, Human Path, contact
  discovery, generation, regeneration, profile generation, or subscription enforcement.
- Saved Pursuits list results are bucketed only by `tracking_started_at` and return card-level
  data without message bodies, contact email, LinkedIn URLs, raw events, or provider internals.
- Pursuit history is structured and human-readable. It does not expose event codes, IDs,
  payloads, idempotency keys, sources, or provider internals.
- Saved message history preserves the exact stored message text.
- Saving or opening a pursuit no longer debits pursuit usage.
- The first successfully persisted initial outreach generation atomically stores messages,
  outreach usage, the one-time pursuit debit, the metering latch, and the pursuit event.
- Database mutation functions perform explicit user ownership checks despite the repository's
  service-role access.

## Files in the implementation commit

- `lib/public-profile/api.ts`
- `lib/public-profile/pursuits/repository.ts`
- `lib/public-profile/pursuits/state-machine.ts`
- `lib/public-profile/pursuits/tracking.ts`
- `lib/public-profile/pursuits/types.ts`
- `app/api/public-profile/saved-pursuits/route.ts`
- `app/api/public-profile/pursuits/[id]/tracking/route.ts`
- `app/api/public-profile/pursuits/outreach/[messageId]/copy/route.ts`
- `supabase/migrations/20260718000200_saved_pursuits_atomic_mutations.sql`
- `scripts/test-public-profile-api.ts`
- `scripts/test-public-profile-pursuits.ts`
- this handoff document

## Verification completed

All of these passed against the final implementation tree:

- `node scripts/test-public-profile-pursuits.mjs`
- `node scripts/test-public-profile-api.mjs`
- `npm run test:public-jobs`
- `npm run test:public-regeneration`
- `npx tsc --noEmit --incremental false`
- `npm run build`
- `git diff --check`

`npm run lint` completed with zero errors and four pre-existing warnings:

- `app/onboarding/OnboardingClient.tsx`: unused `listField`
- `lib/public-profile/repository.ts`: unused `FitSignals`
- `lib/public-profile/repository.ts`: unused `VoicePersonality`
- `scripts/outreach-quality/gen-style-matrix.mjs`: unused `description`

The new migration was also validated in a disposable PostgreSQL 16 database for clean and
repeated application, all six actions, reversals, Applied latching, Copy snapshots and replay,
owner isolation, rollback on invalid cross-pursuit contacts, legacy debit backfill, one-time
pursuit charging, and outreach quantities. The temporary database was stopped afterward.

## Failed attempt and cause

The first sandboxed `npm run build` stalled during Turbopack's optimized-build phase and emitted
no code diagnostic. The process was stopped. The exact same build run outside the restricted
sandbox completed successfully, including TypeScript, page-data collection, static generation,
and registration of all three new routes. The evidence points to the sandbox execution
environment, but the precise sandbox-level cause was not proven.

## Not verified or not completed

### Production migration and deployment

The SQL migration has not been applied to production. No deployment or production HTTP check
was performed.

Verification required after explicit production authorization:

1. Run the existing-user preflight counts required by the product contract.
2. Apply `20260718000200_saved_pursuits_atomic_mutations.sql` through the normal Supabase
   migration process.
3. Confirm `pursuit_metered_at`, request-idempotency tables, constraints, indexes, function
   signatures, and service-role-only execution permissions.
4. Exercise tracking, reversal, Copy replay, Copy persistence failure/retry, and first-generation
   metering with two owner-isolation fixtures.
5. Reconcile pursuit and usage-ledger counts before and after.
6. Deploy the application, run `curl -I <production-url>`, and confirm HTTP 200 before inspecting
   production content.

### Existing-user conversion

The product contract's broader existing-user conversion remains outstanding. This commit does
not convert legacy `saved_jobs` rows into canonical pursuits or complete the full legacy-status,
snapshot, inactive-result, and Offer preflight/reconciliation work. The migration only handles
the atomic mutations, idempotency infrastructure, metering latch, and legacy pursuit-debit
backfill needed by this approved slice.

### UI and design-system parity

No UI, CSS, design-system card, or public-copy file was edited. Therefore these approved designs
are not yet wired into production:

- Saved Pursuits bucket toggle at all breakpoints.
- Shared Apply Wizard and Applied Tracking component.
- View-only, non-selectable saved-message history without Copy or regenerate controls.
- Honest Copy-persist-failure retry state.
- Retirement of the separate Application Details surface.
- Saved Pursuits entry points and vocabulary changes.

No mobile or desktop visual verification was performed because this pass was backend-only.

### Compatibility surface

The legacy scalar pursuit status and old status/list endpoints remain temporarily for migration
and current-client compatibility. New Saved Pursuits tracking uses only the six-action endpoint;
Offer is rejected by the new tracking contract. Retire the compatibility surface only as part
of an explicitly approved UI/data cutover.

## Next immediate starting point

At the next session:

1. Run `git pull` and `git status --short --branch`; remain on `main`.
2. Read this handoff, `docs/project-operating-state.md`, the Saved Pursuits product contract,
   and the Claude design brief.
3. Ask Randall which independent scope is approved next:
   - production UI wiring from the approved cards, or
   - existing-user preflight/backfill migration work.
4. For UI wiring, identify the exact approved card/component mapping and exact production and
   design-system files, then wait for explicit scoped approval before editing.
5. For migration work, perform read-only preflight design first. Do not write to production or
   delete legacy Offer data without explicit production authorization.

No further scope should be inferred from this handoff document.

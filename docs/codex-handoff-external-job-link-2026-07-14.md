# Codex Handoff: External Job Link, Message Regeneration, and Saved Pursuits

Date: 2026-07-14
Branch: `main`
Task brief: `docs/codex-tasks-external-job-link-2026-07-14.md`

## Task 1: External Job Link Backend

Status: implemented and verified offline. Included in the requested handoff commit; not pushed by this handoff.

### What shipped

- `lib/public-jobs/ingest-link.ts`
  - Normalizes the submitted URL and removes fragments without rewriting query parameters.
  - Runs `assertSafePublicUrl` before storage lookup or fetch and before every redirect hop.
  - Uses manual redirects, a 12-second total fetch timeout, accepted text content types, a 1 MiB declared and streamed response cap, and injected fetch/DNS seams.
  - Converts HTML through the existing `textFromHtml` helper.
  - Deduplicates any exact normalized `source_url` already in `jobs` before fetch or model work.
  - Returns typed failure states and never inserts an incomplete extraction.
  - Inserts `source: "user_link"` and returns the job ID accepted by the existing pursuit creation flow.
- `lib/scan/sources/llm-extract-posting.ts`
  - Adds full job-record extraction for title, company, description, responsibilities, and required experience.
  - Preserves the existing injected `callModel`, lazy Anthropic SDK, graceful no-key behavior, and `claude-opus-4-8` convention.
- `lib/public-jobs/api.ts` and `app/api/jobs/from-link/route.ts`
  - Add session-authenticated `POST /api/jobs/from-link` for `{ "url": string }`.
  - Preserve sibling-route no-store response behavior.
  - Map invalid or unsafe URLs to 400, oversized pages to 413, unsupported content to 415, fetch failures to 502, extraction unavailability to 503, and ingested or already-known jobs to 200.
- `scripts/test-job-link.ts`, `scripts/test-job-link.mjs`, and `package.json`
  - Add `npm run test:job-link` using the repository's compiled TypeScript runner pattern.

### Offline verification completed

- `npm run test:job-link`: passed.
  - Unsafe URL rejection before storage/fetch/model calls.
  - Happy path with mocked fetch, DNS, model, and repository.
  - Same-URL dedupe without fetch/model/insert.
  - Model-unavailable degradation without partial insert.
  - Redirect-target SSRF rejection.
  - Declared and streamed response-size caps.
  - Malformed API body and no-store response hygiene.
- `node scripts/test-llm-extract-posting.mjs`: passed.
- `npm run test:public-jobs`: passed.
- `git diff --check`: passed.

### Data-model decision and tradeoff

No migration is needed. `jobs.source` is unconstrained text, so `user_link` is valid.

The `jobs` table is a shared global pool and has no owner column. Normal dashboard reads are user-scoped through `job_scan_results`, but future scans query recent global jobs and can match a pasted job for another user. Authenticated database clients can also read shared job rows, and the pursuit API accepts any existing job UUID. Adding ownership would require a broader visibility and query redesign, not a narrow Task 1 migration. Randall should decide separately whether user-pasted job metadata needs private ownership.

### External verification still required

The task brief assigns real network verification to Randall or the Claude session. Run these exactly:

1. Confirm the offline suite again:

   ```bash
   npm run test:job-link
   ```

2. With valid local Supabase auth/repository variables, `ANTHROPIC_API_KEY`, and a bearer session token, run a real posting through the route:

   ```bash
   curl -i -X POST http://localhost:3000/api/jobs/from-link \
     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"url":"REPLACE_WITH_A_REAL_PUBLIC_JOB_POSTING_URL"}'
   ```

   Verify HTTP 200 with `status: "ingested"`, a non-empty `jobId`, the correct title, and the correct company. Submit the same URL again and verify HTTP 200 with `status: "already_known"` and the same `jobId`. Then pass that `jobId` to the existing pursuit creation endpoint and verify the normal pursuit response.

No real URL fetch, Anthropic call, production database write, migration, deploy, or production smoke test was attempted from Codex.

### Full application verification completed 2026-07-15

- `npx tsc --noEmit --incremental false`: passed after correcting missing explicit parameter types in the new `scripts/test-job-link.ts` repository mock. The failure was limited to the test helper and did not affect runtime code.
- `npm run lint`: passed with zero errors and nine pre-existing warnings. None of the warnings were introduced by this task.
- `npm run build`: passed with Next.js 16.1.6; `/api/jobs/from-link` appears in the production route manifest.
  - The first sandboxed build stalled while holding `.next/lock` and produced no completed build artifact. Its sleeping `npm`/Next process was terminated.
  - Re-running the same command outside the restricted process sandbox completed successfully. No code change was required for the build.

## Task 2: Single Message Regeneration

Status: implemented and verified offline. Included in the requested handoff commit; not pushed by this handoff.

### What shipped

- `supabase/migrations/20260714000100_outreach_message_regeneration.sql`
  - Adds `previous_message text` and `regeneration_count smallint not null default 0` to `outreach_messages`.
  - Constrains regeneration count to zero or one and is safe to reapply.
- `lib/public-profile/pursuits/types.ts` and `lib/public-profile/pursuits/repository.ts`
  - Read and map regeneration metadata.
  - Atomically claim the one allowed regeneration with a conditional update on the message id, pursuit id, and zero regeneration count.
  - Persist the prior text, replacement message, pursuit event, and one-credit usage only after the conditional claim succeeds.
- `lib/public-profile/api.ts`
  - Accepts `{ pursuitId, regenerate: true, previousMessageId }`.
  - Charges one monthly outreach credit for regeneration.
  - Passes `previousMessage` through the injectable generation boundary.
  - Leaves the generator itself untouched with `TODO(message-gen-track)` marking where the separately approved prompt work consumes the prior text.
- `app/dashboard/ApplyWizardModal.tsx` and `app/dashboard/apply-wizard.module.css`
  - Replace editable approval and feedback controls with a read-only generated message and Copy action.
  - Show the existing loader inside the message card for initial generation and regeneration.
  - Offer `Regenerate once` beside Copy only while the persisted count is zero; the action disappears after use.
  - Preserve an actual already-generated 409 while surfacing unrelated conflicts.
- Local design-system parity:
  - `design-system/components/apply-wizard.html`
  - `design-system/components/copy-generation.html`
  - `design-system/components/home-human-path.html`
  - `design-system/index.html`

### Verification completed

- `node scripts/test-public-profile-pursuits.mjs`: passed.
- `node scripts/test-public-profile-api.mjs`: passed.
- Migration validated against a local throwaway PostgreSQL database from a clean state and on idempotent reapplication; the default, not-null behavior, and zero-or-one constraint were confirmed.
- Exact-width browser checks at 320, 375, 390, 1280, and 1440 pixels: no horizontal overflow.
- Mobile and desktop design-system captures inspected for the read-only state, Copy and Regenerate once actions, and in-card loader.
- `git diff --check`: passed.

### Production verification still required

1. Apply `supabase/migrations/20260714000100_outreach_message_regeneration.sql` through the normal production migration workflow.
2. Confirm the production table exposes `previous_message`, defaults `regeneration_count` to zero, rejects values outside zero or one, and accepts the application update path.
3. Generate a pursuit message, regenerate it once, and confirm:
   - the prior message is retained in `previous_message`;
   - `regeneration_count` becomes one;
   - exactly one replacement message is persisted;
   - exactly one additional outreach credit is consumed;
   - a second regeneration request is rejected without another credit charge;
   - Copy still copies the complete replacement message.

## Task 3: Saved Pursuits Profile Action

Status: implemented and verified locally. Included in the requested handoff commit; not pushed or remotely design-synced by this handoff.

Randall explicitly resolved the brief's stale label reference by approving the existing `Job scan` label unchanged. `Saved Pursuits` sits beside it and uses the same teal button primitive. Randall also explicitly approved `Coming Soon` as the tooltip copy exception for this control.

### What shipped

- `app/onboarding/OnboardingClient.tsx` and `app/onboarding/onboarding.module.css`
  - Add the focusable, non-navigating `Saved Pursuits` action beside `Job scan`.
  - Reuse the exact `btnScan` visual primitive.
  - Reuse the existing design-system tooltip treatment and expose it on hover and keyboard focus.
  - Connect the tooltip through `aria-describedby`; the button has a full interactive bounding box and `aria-disabled="true"`.
- `design-system/components/onboarding-account-bar.html`
  - Mirrors the production action and tooltip in both profile-card examples.
  - Retains its existing manifest entry.

### Verification completed

- Exact-width browser checks at 320, 375, 390, 1280, and 1440 pixels: root and body scroll widths equal the viewport width at every size.
- Mobile and desktop captures inspected. At mobile width the action wraps beneath `Job scan` without clipping; at desktop it remains beside `Job scan`.
- Keyboard focus exposes the `Coming Soon` tooltip, and the tooltip remains within the 390-pixel card.
- Added lines contain no em dashes.
- `git diff --check`: passed.

## Claude Design Sync Handoff

The repository cards and their `_ds_manifest.json` entries are present, but Codex does not have the Claude Design `register_assets` tool. The remote Design System pane is therefore **NOT VERIFIED** and must not be called synced yet.

Register every touched card, then confirm it refreshes in the Design System pane:

1. `design-system/components/apply-wizard.html`
   - Name: `Apply Wizard`
   - Subtitle: `Read-only outreach, in-card loading, and one backup regeneration`
   - Viewport: `1280`
2. `design-system/components/copy-generation.html`
   - Name: `Copy Generation`
   - Subtitle: `Copy plus one persisted regeneration action`
   - Viewport: `1280`
3. `design-system/components/home-human-path.html`
   - Name: `Home Human Path`
   - Subtitle: `Outreach slide updated for read-only copy and one regeneration`
   - Viewport: `1280`
4. `design-system/components/onboarding-account-bar.html`
   - Name: `Onboarding Account Bar`
   - Subtitle: `Saved Pursuits action with Coming Soon tooltip`
   - Viewport: `1280`

The local card files already preserve their first-line `@dsCard` markers, are mirrored under `design-system/`, and are represented in `_ds_manifest.json`. No manifest content change was necessary.

## Next immediate starting point

Start with the production migration, then complete the Claude Design registration above. Task 1's real URL and Anthropic path remains network-gated and must be exercised with valid local credentials.

The complete local verification set has passed:

```bash
npm run test:job-link
node scripts/test-llm-extract-posting.mjs
npm run test:public-jobs
node scripts/test-public-profile-pursuits.mjs
node scripts/test-public-profile-api.mjs
npx tsc --noEmit --incremental false
npm run lint
npm run build
```

The complete diff was reviewed and included in the requested handoff commit on `main`. This handoff does not push; use the repository `sync` protocol when the production migration and remote design-sync ownership are settled.

# MacBook Air Restart Handoff — Dumpster Fire Recovery

Date: 2026-06-26
Repo: `/Users/randallfransen/Sites/dumpster-fire-llc`
Status: synced from git at commit `6090b9b` with a clean working tree after the MacBook Air pull.

## Active Restart Source

This file is the active restart source for the next session. Older `NEXT SESSION`, `RESUME HERE`, or dated handoff markers in `docs/current-state.md` are historical notes only and must not be treated as active instructions unless Randall explicitly says to resume one of them.

Before doing work:

- Work only in `/Users/randallfransen/Sites/dumpster-fire-llc`.
- Do not use Lab26 unless Randall explicitly asks for it.
- Run `git status --short --branch` and report whether the tree is clean or dirty.
- If a requested sync/pull/push/check is skipped, unavailable, or intentionally not done, tell Randall plainly in the response. Do not silently decide not to do a simple sync task.

## Why This Exists

This session salvaged a poor product-roadmap/build session and got the public app back onto a documented track. The next session should not infer design or product direction from the current ad hoc UI. Product behavior is being clarified step by step; design implementation now needs to become systematic using the Claude design system instead of one-off layout choices.

## Current Product Decisions

### Approved/Protected Public Homepage Areas

Leave these alone until Randall explicitly changes them or the forthcoming Claude Design cards replace the Human Path mock visuals:

- Homepage header/hero copy.
- `Is the Job Market a Dumpster Fire?` section and four cards.
- Human Path intro and slideshow intent.

Homepage protection correction:

- Preserve the production animated grain texture exactly. It took a long time to get right.
- Do not generalize `LandingBackground`, replace it, remove its canvas layers, or touch homepage structure without explicit Randall confirmation.
- Current homepage content is not final, but approved sections should preserve copy only. Do not preserve or infer approval from eyebrow/headline layout treatments.
- Ignore any design instruction that depends on eyebrow/headline layouts unless Randall explicitly approves that layout direction.

### Profile Gate

- Profile completion is operationally pass/fail.
- Incomplete profile means Scan is locked.
- If Scan is locked, Matching, Saved Jobs, Pursuits, Human Path, Outreach, and Pursued Jobs Export are also locked.
- Weak/Good/Strong-style guidance is allowed inside questionnaire/ingest UX only; it does not create a partial operating state.
- Approved incomplete-profile justification: "Without the full picture, outreach won't be good. And if outreach isn't good, your chances drop. Finish your profile."

### Naming

- `Role Track` = maintained profile narrative/lane, such as Executive Producer or Product Manager.
- `Applying As` = pursuit-level selected Role Track/narrative for a specific job.
- Do not use `public` as a product-facing semantic for Jobs, Matching, or Pricing. Public/private only describes route/access boundaries.

### Export

- There is no profile export.
- Export means pursued jobs/pursuit history only.
- Export should include: job pursued, selected Applying As Role Track/narrative, message sent, recipient/contact, status, and timestamps.

### Jobs And Saved Jobs

- Jobs are user-scoped scan results, not a shared/global user-facing pool.
- Scan uses the user's current profile search requirements/constraints.
- Changing scan parameters happens by editing profile search requirements.
- New scans merge with unsaved and unactioned prior scan results so jobs are not lost.
- Saved Jobs means "pursue later" only.
- Saving a job does not create a pursuit.
- Duplicate scan results should merge/update by source URL/company/title.
- Expired/stale jobs should disappear automatically once source providers support stale/closed detection.

## What Was Implemented In This Recovery Session

### Step 1 — Profile Gate Copy And Lockout

Files touched include:

- `app/onboarding/OnboardingClient.tsx`
- `app/onboarding/onboarding.module.css`
- `app/dashboard/DashboardClient.tsx`
- `docs/current-state.md`
- `docs/public-product-gap-build-plan-2026-06-26.md`

Implemented:

- Incomplete-profile justification in onboarding.
- Explicit lockout copy for Scan and downstream workflow gates.
- Dashboard complete-state copy using correct product terms.

### Step 2 — Edit Career Profile Kick-Start

Files touched include:

- `app/dashboard/DashboardClient.tsx`
- `app/onboarding/OnboardingClient.tsx`
- `app/onboarding/onboarding.module.css`
- `app/site.module.css`
- `docs/project-todo.md`
- `docs/public-product-gap-build-plan-2026-06-26.md`

Implemented:

- `/dashboard` opens a full-screen `Edit Career Profile` modal after the complete-profile gate passes.
- Modal includes left-side navigation for onboarding-created profile sections.
- Existing onboarding section editor is reused in `profile-editor` mode so complete profiles can edit without redirecting out.
- Role Tracks support add/edit/duplicate/archive through existing replacement/archive semantics.

Remaining Step 2 TODOs:

- Decide whether profile editor uses debounced autosave or explicit manual section saves.
- Add profile version and last-updated metadata to the editor header.
- Add explicit profile regeneration action/status after structured edits.
- Store/display version history with restore behavior.
- Clean up Proof Library archive/delete labels and relationship management.
- Add desktop and mobile screenshot validation after design normalization.

### Step 3 — Jobs And Saved Jobs Kick-Start

Files added/touched include:

- `supabase/migrations/20260626000100_public_job_scan_results.sql`
- `lib/public-jobs/types.ts`
- `lib/public-jobs/repository.ts`
- `lib/public-jobs/api.ts`
- `app/api/jobs/route.ts`
- `app/api/jobs/scan/route.ts`
- `app/api/jobs/save/route.ts`
- `app/dashboard/DashboardClient.tsx`
- `app/site.module.css`
- `docs/project-todo.md`
- `docs/current-state.md`
- `docs/public-product-gap-build-plan-2026-06-26.md`

Implemented:

- `job_scan_results` table for user-owned scan results over normalized public `jobs`.
- `GET /api/jobs` reads active user scan results.
- `POST /api/jobs/scan` merges matching normalized public jobs into the user's active scan results using current profile search requirements.
- `POST /api/jobs/save` saves/unsaves active scan results as "pursue later."
- Dashboard functional scaffold: Run scan, Jobs list, Saved Jobs panel, v1 job card fields, save/unsave.

Important Step 3 boundaries:

- Current `/api/jobs/scan` provider scans the normalized public `jobs` table only.
- External/public connector ingestion is not wired yet.
- `job_scan_results` migration still needs to be applied to Supabase before live use.
- Job detail route/view is not built yet.
- Stale/expired pruning depends on source-provider closed-job detection and is not implemented yet.

## Current Risk: UI Consistency

The Step 2/Step 3 functionality moved forward, but the dashboard/profile/jobs UI includes ad hoc styling and layout choices that Randall does not want compounded. Treat these surfaces as functional scaffolding, not approved design.

Do not continue building Step 4 Matching on top of this ad hoc layout. Normalize the design system first.

## Design Implementation Direction

Randall approved moving into design implementation now, but it must be systematic.

Primary design source:

- `docs/design-implementation-handoff.md`
- `docs/design-system-token-mapping-audit-2026-06-25.md`
- `design-system/` directory
- Claude Design project `3af2f1ea`

### Design Guardrails

- Do not invent new visual systems.
- Reuse Claude design-system primitives: app shell, panel/card, buttons, section headers, lists, forms, modal, badges.
- Normalize existing public app surfaces before adding new product workflows.
- Homepage protected areas stay untouched. Do not generalize `LandingBackground` or touch homepage structure without explicit Randall confirmation.
- Human Path slideshow is intentional and should not be removed.
- Do not port private `/scans` defaults or private copy into public app product surfaces.
- Do not resurrect profile export.

### Recommended Next Session Sequence

1. Read `AGENTS.md` and the required design docs.
2. Re-open this handoff, `docs/current-state.md`, and `docs/design-implementation-handoff.md`.
3. Audit git status/diffs and report whether the working tree is clean.
4. Do a design-normalization pass before Step 4 Matching:
   - Port tokens/fonts baseline from Claude design system.
   - Establish shared public app primitives.
   - Normalize `/dashboard`, Edit Career Profile modal, Jobs, and Saved Jobs to those primitives.
   - Preserve functionality while reducing ad hoc CSS.
5. Screenshot desktop and mobile after each meaningful layout/style change.
6. Only after design normalization, proceed to Step 4 Matching clarification/build.

## Validation Already Run

Latest validation in this session:

- `npx tsc --noEmit --incremental false` passed.
- `npm run lint` passed with the same five known legacy warnings in `/app/scans` and scripts.
- `git diff --check` passed.

Known lint warnings are legacy and unchanged:

- `app/scans/DashboardClient.tsx`: unused `risks`.
- `app/scans/admin/tuning/TuningReviewClient.tsx`: missing `buildBatch` dependency.
- `app/scans/tuning-preview.ts`: unused `uniqueExamples`.
- `scripts/benchmark-dumpster-fire-verdicts.ts`: unused `routeForReviewRationale`.
- `scripts/export-dumpster-fire-review-batches.ts`: unused `sourceKindCounts`.

Screenshot proofs captured:

- `/private/tmp/dumpster-fire-llc-profile-editor-modal.png`
- `/private/tmp/dumpster-fire-llc-jobs-saved-jobs.png`
- `/private/tmp/dumpster-fire-llc-pursued-jobs-export-copy.png`

## Do Not Forget

- The standalone repo `dumpster-fire-llc` is canonical.
- Lab26 is legacy/reference only and must not be used as a save target.
- There is an existing dev server on `127.0.0.1:3020`; do not kill it unless Randall asks.
- This work is uncommitted. Start the MacBook Air session by checking `git status --short`.

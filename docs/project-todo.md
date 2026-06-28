# Dumpster Fire Public App TODO

## Purpose

This is the operational task list for building `thejobmarketisadumpsterfire.com`.

Canonical planning sources remain:

- `docs/implementation-roadmap.md`
- `docs/public-product-build-epics.md`
- `docs/candidate-profile-schema.md`
- `docs/database-data-model-spec.md`
- `docs/onboarding-ux-spec.md`
- `docs/profile-management-modal-spec.md`
- `docs/matching-engine-spec.md`
- `docs/pursuit-workflow-spec.md`
- `docs/subscription-enforcement-matrix.md`

## Current Priority

Finish the Step 2 Profile Management follow-ups, then clarify and build Step 3 Jobs and Saved Jobs.

## Near-Term (scheduled)

- [ ] **Apply `20260626000100_public_job_scan_results.sql` to the production Supabase DB (soon).**
  The `job_scan_results` bridge table is not yet applied; the public Jobs/Saved Jobs scan flow
  depends on it. First resolve the migration-history divergence noted in
  `docs/database-migration-state.md` (the A4 migration `20260627000100` was applied via psql and
  is not recorded in `supabase_migrations`), so a CLI `db push` doesn't trip on it.
- [ ] **Rotate exposed credentials before sending invites / full launch** — Supabase
  service_role + anon keys, DB password, and `ANTHROPIC_API_KEY` were entered locally on
  2026-06-28 and surfaced in a chat transcript. Deferred by Randall to invite time.

## Phase 1 — Foundation

### Done

- [x] Unify the public app work into `/Users/randallfransen/Sites/dumpster-fire-llc`.
- [x] Preserve the deployment-connected Git and Vercel project metadata.
- [x] Add the public product spec stack under `docs/`.
- [x] Add public foundation database migration.
- [x] Add public auth configuration contract.
- [x] Add public profile TypeScript contracts.
- [x] Add structured profile markdown generation.
- [x] Add binary profile completion engine.
- [x] Add profile generation and persistence row planner.
- [x] Add public profile repository mapping and persistence seam.
- [x] Add public profile regeneration service boundary.
- [x] Keep profile regeneration blocked when profile status is `incomplete`.
- [x] Wire service-level profile regeneration to the repository seam.
- [x] Add focused profile markdown, quality, generation, repository, and service tests.
- [x] Decide the first server API auth strategy: Supabase Auth bearer token.
- [x] Add the first authenticated public profile route boundary.
- [x] Add API-level tests for complete, incomplete, missing-profile, auth config, repository config, and unauthorized paths.
- [x] Document required Supabase environment variables for local and deployed environments.
- [x] Add structured Identity/Search section read/update service boundary.
- [x] Add Identity/Search section validation and completion-transition tests.
- [x] Add repository persistence for Identity/Search section autosave.
- [x] Add authenticated Identity/Search section GET/PATCH API endpoints.
- [x] Add Identity/Search autosave tests for valid updates, invalid payloads, incomplete profile transitions, and unauthorized/config paths.
- [x] Add local seed fixtures for a complete public profile aggregate.
- [x] Add structured Role Tracks section read/update service boundary.
- [x] Add repository persistence for Role Tracks autosave.
- [x] Add authenticated Role Tracks GET/PATCH API endpoints.
- [x] Add Role Tracks autosave tests for validation, replacement semantics, persistence order, and API responses.
- [x] Add structured Resume Uploads section read/update service boundary.
- [x] Add repository persistence for Resume Uploads autosave.
- [x] Add authenticated Resume Uploads GET/PATCH API endpoints.
- [x] Add resume-to-role-track attachment validation.
- [x] Add Resume Uploads autosave tests for validation, replacement semantics, persistence order, and API responses.
- [x] Add structured Work History section read/update service boundary.
- [x] Add repository persistence for Work History autosave.
- [x] Add authenticated Work History GET/PATCH API endpoints.
- [x] Add work-history-to-resume attachment validation.
- [x] Add Work History autosave tests for validation, replacement semantics, persistence order, and API responses.
- [x] Add structured Proof Library section read/update service boundary.
- [x] Add repository persistence for Proof Library autosave.
- [x] Add authenticated Proof Library GET/PATCH API endpoints.
- [x] Add Proof Library autosave tests for validation, replacement semantics, persistence order, and API responses.
- [x] Add structured Skills Inventory section read/update service boundary.
- [x] Add repository persistence for Skills Inventory autosave.
- [x] Add authenticated Skills Inventory GET/PATCH API endpoints.
- [x] Add skill-to-proof/work-history relationship validation.
- [x] Add Skills Inventory autosave tests for validation, replacement semantics, persistence order, and API responses.
- [x] Add quality-scored narrative section read/update service boundary.
- [x] Add repository persistence for quality-scored narrative autosave.
- [x] Add authenticated Why People Hire Me GET/PATCH API endpoint.
- [x] Add authenticated Operating Style GET/PATCH API endpoint.
- [x] Add authenticated Decision Style GET/PATCH API endpoint.
- [x] Add quality-scored narrative autosave tests for validation, replacement semantics, persistence order, and API responses.

- [x] Add Communication Style settings and quality-scored text read/update service boundary.
- [x] Add repository persistence for Communication Style autosave.
- [x] Add authenticated Communication Style GET/PATCH API endpoint.
- [x] Add AI Misreadings quality-scored text read/update service boundary.
- [x] Add authenticated AI Misreadings GET/PATCH API endpoint.
- [x] Add Communication Style and AI Misreadings autosave tests for validation, replacement semantics, persistence order, and API responses.

- [x] Add Writing Samples read/update service boundary.
- [x] Add repository persistence for Writing Samples autosave.
- [x] Add authenticated Writing Samples GET/PATCH API endpoint.
- [x] Add Writing Samples autosave tests for validation, replacement semantics, persistence order, and API responses.

- [x] Add Outreach Rules read/update service boundary.
- [x] Add repository persistence for Outreach Rules autosave.
- [x] Add authenticated Outreach Rules GET/PATCH API endpoint.
- [x] Add Outreach Rules autosave tests for validation, replacement semantics, persistence order, and API responses.

- [x] Add Leadership Profile read/update service boundary.
- [x] Add repository persistence for Leadership Profile autosave.
- [x] Add authenticated Leadership Profile GET/PATCH API endpoint.
- [x] Add Leadership Profile autosave tests for validation, optional completion behavior, persistence order, and API responses.

- [x] Apply the public foundation migration to Supabase.
- [x] Start onboarding route shell and API client wiring.
- [x] Link Supabase project with project ref.
- [x] Run Supabase migration dry-run.

### Next

- [x] Configure local public Supabase auth/env for email/password verification.
- [x] Verify authenticated public profile bootstrap and Identity/Search API calls against live Supabase.
- [x] Start editable onboarding forms with Identity/Search autosave.
- [x] Add required Supabase env vars in deployment.
- [x] Build editable onboarding form for Role Tracks.
- [x] Build editable onboarding form for Resume Uploads.

### Blocked Until External Setup

- [ ] Configure Google OAuth.
- [ ] Configure Apple OAuth.
- [ ] Confirm resume file storage provider and retention rules.
- [ ] Choose resume parsing provider.
- [ ] Choose billing provider and webhook model.

## Phase 2 — Onboarding

- [x] Build the onboarding route shell only after API foundation exists.
- [x] Add autosave service endpoints for structured profile sections.
- [x] Build Identity and Search Basics.
- [x] Build Role Tracks.
- [x] Build Resume Uploads and resume-to-role-track attachment.
- [x] Build Work History review.
- [x] Build Proof Library.
- [x] Build Skills Inventory.
- [x] Build Why People Hire Me.
- [x] Build Operating Style.
- [x] Build Decision Style.
- [x] Build Communication Style.
- [x] Build Writing Samples.
- [x] Build What AI Gets Wrong About Me.
- [x] Build Outreach Rules.
- [x] Build Leadership Profile.
- [x] Add section-level readiness/status UI.
- [ ] Add quality scoring UI once the scoring approach is selected.

## Phase 3 — Profile Management

- [x] Build the `Edit Career Profile` modal shell.
- [x] Support editing all onboarding-created profile sections through the existing section payloads.
- [x] Support Role Track add, edit, duplicate, and archive through replacement/archive semantics.
- [ ] Support Proof Library add, edit, archive, and delete.
- [ ] Support resume and proof attachment to Role Tracks.
- [ ] Add debounced autosave or explicitly standardize manual section-save behavior.
- [ ] Add profile version and last-updated metadata to the editor header.
- [ ] Add explicit profile regeneration action/status after structured edits.
- [ ] Store and display profile version history with restore behavior.
- [ ] Add desktop and mobile screenshot validation for the profile editor.
- [x] Remove profile export from Profile Management scope.

## Phase 4 — Matching Engine

- [ ] Add role fit evaluation service.
- [ ] Add Role Track recommendation.
- [ ] Add resume recommendation.
- [ ] Add proof object recommendation.
- [ ] Add risk and mismatch explanation.
- [ ] Add hard exclusion handling for salary, remote preference, and blacklisted companies.
- [ ] Add matching fixture tests.

## Phase 5 — Pursuit Workflow

- [x] Add user-scoped Jobs scan-result API/UI using current profile search requirements.
- [x] Add Saved Jobs as "pursue later" only, separate from pursuit creation.
- [x] Add save/unsave route for active user scan results.
- [ ] Apply public job scan results migration to Supabase.
- [ ] Wire external/public connector ingestion into `/api/jobs/scan`; current provider scans the normalized public `jobs` table.
- [ ] Add Pursuits.
- [ ] Add pursuit stages for review, Human Path, contacts, outreach, and tracking.
- [ ] Keep Saved Jobs free and separate from metered Pursuits.
- [ ] Add pursuit state tests.

## Phase 6 — Human Path Engine

- [ ] Add contact discovery provider boundary.
- [ ] Add hiring manager, functional leader, recruiter, and executive sponsor contact types.
- [ ] Add confidence scoring and reasoning.
- [ ] Add contact ranking by company context.
- [ ] Add Human Path usage ledger integration.

## Phase 7 — Outreach Generation

- [ ] Add message generation service.
- [ ] Generate contact-specific outreach from profile, role track, resume, proof, and contact type.
- [ ] Add outreach version/history storage.
- [ ] Add outreach usage ledger integration.
- [ ] Add fixture tests for tone, proof selection, and contact specificity.

## Phase 8 — Subscription System

- [ ] Implement Tester, Basic, and Pro plan rules.
- [ ] Enforce pursuit limits.
- [ ] Enforce Human Path limits.
- [ ] Enforce outreach limits.
- [ ] Enforce Pursued Jobs Export gate.
- [ ] Add upgrade states for limit reached and Pursued Jobs Export locked.
- [ ] Add webhook processing after billing provider is chosen.

## Phase 9 — Public Site

- [ ] Build landing page.
- [ ] Build pricing page.
- [x] Add auth routing for no profile, incomplete profile, and complete profile states.
- [ ] Verify no public surface exposes platform, deployment, agent, or AI-vendor scaffold copy.

## Not Now

- [ ] Interview prep.
- [ ] Deep company research.
- [ ] Analytics.
- [ ] Response optimization.
- [ ] Advanced coaching.
- [ ] Company intelligence.
- [ ] Premium tier.

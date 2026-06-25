# Product Roadmap Audit - 2026-06-25

## Scope

This audit compares the current standalone repo implementation against the full public Dumpster Fire roadmap and feature set.

Canonical sources:

- `docs/implementation-roadmap.md`
- `docs/project-todo.md`
- `docs/public-product-build-epics.md`
- `docs/candidate-profile-schema.md`
- `docs/database-data-model-spec.md`
- `docs/onboarding-ux-spec.md`
- `docs/profile-management-modal-spec.md`
- `docs/matching-engine-spec.md`
- `docs/pursuit-workflow-spec.md`
- `docs/subscription-enforcement-matrix.md`
- `docs/repo-cleanup-migration-matrix.md`

Lab26 was not used as an implementation source for this audit. The standalone repo is the canonical app.

## Executive Summary

The standalone public app is structurally sound but still early in the public product build.

What is strong:

- Phase 1 public profile foundation is largely built: schema, Supabase Auth bearer-token boundary, profile contracts, profile completion logic, markdown generation, section persistence, and section APIs.
- All public profile section endpoints exist for the planned onboarding/profile sections.
- The production build succeeds and the current built routes are coherent.
- The private `/scans` app remains gated and operational as legacy-active product machinery.

What is not yet built:

- The public app is not yet a complete user product. Only the root placeholder, onboarding shell, and gated private scans are built pages.
- Public onboarding UI now has editable shells and section-level readiness/status UX for every required section plus optional Leadership Profile.
- Public Saved Jobs, Pursuits, Human Path, Outreach, public matching, subscriptions, pricing, profile management, and production auth-provider polish are not yet implemented as public app workflows.
- The root landing page is still a placeholder and explicitly says the public site is in progress.

## Built Route Audit

| Route | Current Runtime Result | Built Functionality | Roadmap Gap |
|---|---|---|---|
| `/` | `200 OK` in built smoke test. Static page plus client token check. | Placeholder public home with links to `/onboarding` and `/scans`; stored public profile tokens route to `/dashboard` when complete or `/onboarding` when incomplete. | Does not satisfy Phase 9 landing page, pricing, product story, launch copy, or production OAuth routing requirements. |
| `/onboarding` | `200 OK` in built smoke test. Static shell plus client auth/forms. | Shows public onboarding hero, sign-in form, editable forms for all required sections plus optional Leadership Profile, live readiness summary, section-level blocker counts, section inventory, blocker sidebar, and complete-profile redirect to `/dashboard`. | Needs production auth-provider polish and quality-remediation guidance. |
| `/dashboard` | `200 OK` in built smoke test. Static shell plus client token/profile guard. | Profile Complete destination placeholder; missing or incomplete profile state routes back to `/onboarding`. | Public Saved Jobs, Pursuits, matching, Human Path, and outreach dashboard workflows are not built yet. |
| `/api/public-profile/bootstrap` | `401` without bearer token in smoke test. | Authenticated candidate profile bootstrap endpoint. | Needs full auth-provider UX integration. |
| `/api/public-profile/*` | `401` without bearer token in smoke test; focused tests pass. | Authenticated `GET`/`PATCH` section endpoints exist for all public profile sections, plus regenerate. | API foundation exists; next step is weak-field remediation guidance and downstream product workflows. |
| `/scans` | `200 OK` with access-code login screen in built smoke test. | Private dashboard entrypoint remains gated. | This is not the public app dashboard. Public Saved Jobs/Pursuits should be rebuilt against public tables. |
| `/scans/admin/tuning` | Built as dynamic route. | Private matcher/review tuning dashboard. | Internal operator surface only; not part of public launch workflow. |
| `/scans/api/*` | Private dashboard APIs reject unauthenticated access; `/scans/api/dashboard` returned `401` in smoke test. | Legacy-active private scan, connector, dashboard, contacts, apply-copy, settings, tuning APIs. | Keep isolated. Do not count private scan APIs as public feature completion. |

## Roadmap Coverage By Phase

| Phase | Roadmap Intent | Current Coverage | Status |
|---|---|---|---|
| Phase 0 - Specs | Product vision, philosophy, profile, data, onboarding, profile management, pursuit, matching, subscription docs. | Specs are present in `docs/`. Contradictions captured in `docs/spec-review-phase-1.md`. | Complete enough to guide build. |
| Phase 1 - Foundation | Auth, database objects, profile generation service. | Public foundation migration includes candidate profile, role tracks, resumes, work history, proofs, skills, quality fields, subscriptions, usage ledger, jobs, saved jobs, pursuits, contacts, outreach, and feedback tables. Public profile service/API tests pass. | Mostly built. External provider decisions remain. |
| Phase 2 - Onboarding | Complete profile creation flow with autosave and completion checks. | Section APIs exist for all sections. Editable UI, section readiness/status UX, and client-side Profile Complete routing now exist for every required section plus optional Leadership Profile. Binary completion engine exists. | Mostly built. Needs quality-remediation guidance and production auth-provider polish. |
| Phase 3 - Profile Management | Full-screen `Edit Career Profile` modal, autosave, version history, export gate. | Service layer can support structured edits and profile versions, but no profile management modal exists. | Not built. |
| Phase 4 - Matching Engine | Public role-fit evaluation from complete profile, role track/resume/proof recommendations, hard exclusions. | Private `/scans` matcher exists. Public matching service against public profile/jobs/pursuits is not built. | Not built for public app. |
| Phase 5 - Pursuit Workflow | Saved Jobs, Pursuits, review, Human Path, contacts, outreach, tracking. | Public schema has `jobs`, `saved_jobs`, `pursuits`, `contact_suggestions`, `outreach_messages`, and `saved_message_feedback`. No public routes/services/UI. Private Apply Wizard exists under `/scans`. | Data model exists; workflow not built. |
| Phase 6 - Human Path Engine | Contact discovery, ranking, confidence, reasoning, usage ledger integration. | Private contact research exists under `/scans/api/contacts`. Public provider boundary and usage integration are not built. | Not built for public app. |
| Phase 7 - Outreach Generation | Contact-specific message generation, version/history, usage ledger integration. | Private apply-copy exists under `/scans/api/apply-copy`. Public message generation service is not built. | Not built for public app. |
| Phase 8 - Subscription System | Tester/Basic/Pro limits, metering, upgrade states, webhooks. | Public schema has plans, subscriptions, and usage ledger. Seed plans exist in migration. No enforcement services, billing provider, or UI. | Data model exists; enforcement not built. |
| Phase 9 - Public Site | Landing, pricing, auth routing for profile state, public surface cleanup. | Root placeholder exists. Metadata exists. No pricing page, no final landing, no public auth routing. | Not built. |

## Outstanding Items

### P0 - Product Build Order

1. Resolve quality-scoring UI approach:
   - Current backend supports weak/complete field state.
   - The UI exposes manual complete/weak toggles for narrative fields but does not yet provide structured remediation guidance.

### P1 - Foundation Decisions Still Needed

1. Configure Google OAuth.
2. Configure Apple OAuth.
3. Confirm resume file storage provider and retention rules.
4. Choose resume parsing provider.
5. Choose billing provider and webhook model.
6. Choose Human Path search/provider strategy.
7. Decide whether email/password remains beta-only or becomes a supported launch path alongside OAuth.

### P1 - Public App Workflows Not Built

1. Profile management modal.
2. Public generated profile export and Pro gate.
3. Public jobs ingestion/search service.
4. Public Saved Jobs.
5. Public Pursuits.
6. Public matching service and recommendations.
7. Public Human Path generation and metering.
8. Public outreach generation and metering.
9. Account/billing/settings surfaces.

### P2 - Site And Design

1. Replace placeholder root page with the final public landing.
2. Add pricing page.
3. Add auth-aware navigation and routing.
4. Decide which `design-system/` direction is locked before porting tokens/components.
5. Keep `design-system/` non-shipping until a deliberate port happens.

### P2 - Cleanup / Documentation

1. Rewrite or retire stale Lab26-era docs inside `app/scans/`, especially:
   - `app/scans/ARCHITECTURE.md`
   - `app/scans/CLAUDE-START-HERE.md`
   - `app/scans/EXPERIMENT.md`
2. Update `README.md` after the audit if the next-step language should change from "Proof Library" to a broader onboarding completion milestone.
3. Keep `docs/repo-cleanup-migration-matrix.md` current as route ownership changes.

## Current Validation

Commands run on 2026-06-25:

- `node scripts/test-public-profile-service.mjs` - passed.
- `node scripts/test-public-profile-api.mjs` - passed.
- `node scripts/test-public-auth-session.mjs` - passed.
- `node scripts/test-public-profile-sections.mjs` - passed.
- `node scripts/test-public-profile-markdown.mjs` - passed with non-fatal Node package module type warning.
- `node scripts/test-public-profile-quality.mjs` - passed with non-fatal Node package module type warning.
- `node scripts/test-public-profile-generation.mjs` - passed.
- `node scripts/test-public-profile-repository.mjs` - passed.
- `npx tsc --noEmit --incremental false` - passed.
- `npm run lint` - passed with five warnings in legacy `/scans` and scripts.
- `npm run build` - passed.

Built route smoke test on `127.0.0.1:3017`:

- `GET /` - `200 OK`.
- `GET /onboarding` - `200 OK`.
- `GET /scans` - `200 OK`, access-code login screen.
- `GET /api/public-profile/identity-search` - `401`, missing bearer token.
- `POST /api/public-profile/bootstrap` - `401`, missing bearer token.
- `GET /scans/api/dashboard` - `401`, missing private session.

Known validation warnings:

- `app/scans/DashboardClient.tsx`: unused `risks`.
- `app/scans/admin/tuning/TuningReviewClient.tsx`: missing `useEffect` dependency.
- `app/scans/tuning-preview.ts`: unused `uniqueExamples`.
- `scripts/benchmark-dumpster-fire-verdicts.ts`: unused `routeForReviewRationale`.
- `scripts/export-dumpster-fire-review-batches.ts`: unused `sourceKindCounts`.
- Direct Node TS fixture imports warn about missing package module type in some tests.

## Current Risk Register

1. Public app completion could be overestimated because `/scans` contains mature private behavior. Treat `/scans` as legacy-active machinery, not public-app completion.
2. Onboarding UI now exposes section readiness and client-side Profile Complete routing, but it still needs polished auth-provider entry points.
3. Root page is explicitly a placeholder and should not be promoted as a launch landing page.
4. Public profile completion can remain `incomplete` until users resolve required field blockers and weak quality fields.
5. External provider choices block production-grade auth, file upload, parsing, billing, and Human Path.
6. Private Randall scan defaults must not leak into public matching, outreach, screenshots, fixtures, or copy.
7. `app/scans` docs contain stale Lab26 experiment language that could confuse future agents unless cleaned.

## Recommended Next Sequence

1. Resolve quality-scoring/remediation guidance for weak onboarding fields.
2. Add production auth-provider polish for Google/Apple and post-auth redirects.
3. Build the profile management modal on top of the same section contracts.
4. Build public Saved Jobs and Pursuits against public tables.
5. Build public matching service from complete public profiles.
6. Build Human Path and Outreach with usage ledger checks.
8. Build subscription enforcement and upgrade states.
9. Replace the placeholder public landing and add pricing after the product route promises are real.

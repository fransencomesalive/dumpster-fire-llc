# Current State

## 2026-06-30 - Posting parser Phase 2: LLM gap-fill (Claude)

Gap-fill (Randall's choice): LLM extracts Responsibilities / Required experience only for postings
the heuristic left empty (~40% missing responsibilities, ~57% missing required experience, ~30%
both — measured in prod).

- `lib/scan/sources/llm-extract-posting.ts` — `extractPostingSectionsLLM` (callModel convention:
  lazy Anthropic SDK, claude-opus-4-8, graceful no-key → empty). Returns the two lists from any
  format/language. `parsePostingModelJson` tolerates code fences/preamble, cleans + caps items.
- `lib/scan/refine-postings.ts` — `runPostingRefinement` loads jobs with an empty bucket (bounded
  limit), LLM-extracts, fills ONLY the empty bucket (never overwrites heuristic results). Injectable
  loader/extract/callModel seams.
- `GET|POST /api/jobs/refine-postings` (CRON_SECRET-guarded, `?limit=`) + daily `vercel.json` cron
  at 07:00 UTC (after the 06:00 source scan).
- **Clobber fix:** source-scan now splits its upsert — rows with parsed sections include the
  columns; rows with empty sections OMIT them, so the daily scan never wipes an LLM gap-fill (on
  conflict, omitted columns are preserved).
- Validated end-to-end against prod (ESM run): 3/3 empty jobs filled, incl. Japanese postings.
  Tests: `test-llm-extract-posting`, `test-refine-postings`, updated `test-source-scan`. tsc/lint/
  build clean.
- Backfill: the daily cron chips away (limit-bounded for function-timeout safety); for a faster
  one-time fill, hit `/api/jobs/refine-postings?limit=100` repeatedly after deploy. NOTE: the
  CommonJS test-harness can't lazy-import the ESM SDK, so local `.mjs` validation of the live
  callModel no-ops — validate via the deployed endpoint or an ESM run (as done here).

## 2026-06-30 - Dashboard rebuilt to the match-card/scan-page design (Claude)

Implemented the live dashboard to the existing approved match-card/scan-page design (Randall: the
design was already done; no new card approval needed — fix the backend and build it in full).

- `app/dashboard/DashboardClient.tsx` + `dashboard.module.css` rebuilt to the scan-page layout:
  match-card stack (main, `minmax(0,1.4fr)`) + 300px Overview/Search-settings sidebar. Cards now
  show rank disc, fit score + star row, meta grid, description + keyword pills (from match signals),
  the **Responsibilities + Required experience sub-cards** (real parsed data) with **match-term
  highlighting**, and a Save / Open posting / Pursue action rail. Rating-filter tabs (functional, by
  fit tier). Wildcard ("weird match") flag on lowest-tier matches. Sidebar: Overview (last scan,
  active/saved counts, Run scan, View saved toggle) + Search settings (remote/salary floor/target
  titles/avoided, Edit -> profile editor).
- Backend support added: `PublicJobMatchSummary.signals` (matched terms for highlighting, from
  `evaluateMatch` categoryFits) and an optional `searchSettings` summary on the jobs read response
  (from the candidate aggregate). `Pursue` posts to `/api/public-profile/pursuits`.
- Verified: card synced to Claude Design matches (screenshotted 1120/560); tsc clean; lint baseline;
  build compiles; all job/match/parser suites pass.

Still open: Phase 2 LLM posting-parser refinement for heading-less postings; Edit Profile modal +
dashboard hero are still on `site.module.css` (separate slices; hero still has an eyebrow label).

## 2026-06-30 - Posting parser: Responsibilities + Required experience (Claude)

High-priority per Randall: match cards must show Responsibilities + Required experience (the legacy
match-card spec). Phase 1 (heuristic) built and live in prod.

- `lib/scan/sources/parse-posting.ts` — `parsePosting(description)` splits a posting into
  `responsibilities[]` + `requiredExperience[]` by detecting section headings (heading set adapted
  from legacy `app/scans/near-miss-review.ts`), bucketing responsibility vs requirement headings,
  filtering boilerplate, capping 6/section. Blurb headings (About the Role/Team) are boundaries.
  Heading-less postings degrade to empty (Phase 2 LLM will cover those).
- Wired into `runSourceScan`. Migration `20260630000200_jobs_posting_sections.sql` adds
  `responsibilities`/`required_experience text[]` to `jobs` — applied to prod + recorded.
  Backfilled by re-running the source scan (2102 jobs); most yield ~6 responsibilities + ~6
  required-experience items from real postings.
- Read path: `PublicJobRecord` gains `responsibilities`/`requiredExperience`; returned by scan/read.
- Tests: `scripts/test-parse-posting.{ts,mjs}`. All suites pass; tsc clean; lint baseline; build OK.

Next: Phase 2 LLM refinement (callModel/opus, graceful no-key) for heading-less/messy postings;
DashboardClient UI rebuild to the approved card (waiting on card approval; match-term highlighting
lands with the UI).

## 2026-06-30 - All migrations applied to prod; direct DDL capability (Claude)

Prod schema is now fully in sync with `supabase/migrations/`.

- Applied the three pursuit migrations (`20260629000100/200/300`) to prod and recorded all five
  recent versions (000100/200/300/400 + 20260630000100 RLS) in `supabase_migrations`. Verified:
  pursuit_events present with RLS + owner policy; pursuits/contact_suggestions/outreach_messages
  columns present. `docs/database-migration-state.md`: every migration applied + recorded, none
  outstanding.
- **New capability:** migrations can now be applied directly from the working environment via the
  Supabase Management API (runs SQL as `postgres`), using a personal access token in
  `.env.local` (`SUPABASE_ACCESS_TOKEN`, gitignored). No more hand-applying SQL in the dashboard.
  Method documented in `docs/database-migration-state.md`.
- Security: `subscription_plans` RLS fix verified live (anon read -> `[]`).

Note: `ANTHROPIC_API_KEY` was inadvertently surfaced in a 2026-06-30 chat transcript while fixing a
malformed `.env.local` line — add to the existing key-rotation list (see project-todo "Rotate
exposed credentials").

## 2026-06-30 - Match scoring wired into scan ranking (Claude)

Per-user scans now rank and annotate results with the rich matching engine instead of only the
coarse keyword filter.

- `readPublicJobsForUser` (which both `GET /api/jobs` and `runPublicJobsScanForUser` return through)
  now scores each result via `evaluateMatch` against the candidate profile, attaches a compact
  `match` summary (`{ score, label }`) to each `PublicJobRecord`, and sorts best-first.
- The coarse `jobMatchesProfile` filter still governs which jobs enter scan results; scoring is a
  spectrum and never hard-filters — poor-fit jobs still surface, annotated with their score/label.
- `PublicJobRecord.match?` added (`PublicJobMatchSummary`). Repository test asserts the annotation.

Validation: all 8 test suites pass; `tsc` clean; `npm run lint` 0 errors / 7 pre-existing warnings;
`npm run build` compiles; `git diff --check` clean.

Remaining open: apply the three Codex pursuit migrations to prod (`20260629000100/200/300`); record
the `000400` bookkeeping row. Both need the Supabase dashboard.

## 2026-06-30 - Source scan LIVE in prod (Claude)

The source scan pipeline is running against production data.

- Migration `20260629000400` DDL applied to prod (by Randall, dashboard). Bookkeeping row in
  `supabase_migrations.schema_migrations` still pending — see `docs/database-migration-state.md`.
- `job_sources` seeded with 16 starter companies (verified working public boards):
  - Greenhouse: Stripe, Airbnb, Dropbox, Coinbase, Robinhood, GitLab, Databricks, Figma, Discord,
    Anthropic
  - Ashby: Ramp, Linear, Notion, Runway, OpenAI
  - Lever: Spotify
  - Starter set — Randall can add/remove/pause rows in `job_sources` anytime (see
    `docs/scan-sources-setup.md`).
- First source scan run manually against prod (via the real `runSourceScan` code): all 16 sources
  succeeded (0 errors), 3702 fetched, **2105 jobs upserted**. 1018 carry parsed salary; remote-type
  classification populated. Verified the new `jobs` columns and `job_sources.last_scanned_at`.

The one remaining piece for automation needs Randall's Vercel account: **set `CRON_SECRET` in Vercel,
then redeploy** so the `vercel.json` cron registers. No Vercel CLI/token exists in the working
environment, so it cannot be done from here. The endpoint + cron are deployed in code; prod is
already populated from the manual run, and the daily cron just keeps it fresh. Instructions:
`docs/scan-sources-setup.md`.

Also still pending (separate from source scan): the three Codex pursuit migrations
(`20260629000100/200/300`) are not applied to prod yet — needed before pursuit features work live.

## 2026-06-29 - Public source scan engine, Slice 1 (Claude)

Built the public product's own job source scan so the public `jobs` table can be fed independently
of the legacy `/scans` system (Randall: nothing should rely on a legacy DB/system; do not reduce
functionality). Backend-only foundation; no UI. Named under the **Scan** paradigm (Randall): the
connectors are the *sources a scan pulls from*, so this lives in `lib/scan/`, not a parallel
"connectors" concept.

Context that drove this: the mature connectors in `app/scans/` only ever fill the legacy
`job_search_jobs` table, while the public scanner (`lib/public-jobs/runPublicJobsScanForUser`)
only ever reads the separate public `jobs` table — which nothing populated. This slice closes that
gap with an independent source-scan path.

- New independent scan-source engine `lib/scan/sources/` (no `app/scans` import): full port of all
  providers (Greenhouse, Lever, Ashby, Workday, iCIMS, Magnit, HTML, RSS, Rippling, Adzuna,
  Workable) plus salary/HTML/JSON-LD extraction and the fetch runner (retries, Workday
  title-variant fan-out, Himalayas pagination, Adzuna credential injection).
- `lib/scan/source-scan.ts` `runSourceScan` + `lib/scan/sources/registry.ts`: load active
  `job_sources`, fetch + normalize per source, upsert into public `jobs`
  (`on_conflict=source,source_url`), mark each source scanned, isolate per-source errors. Empty or
  paused source list is a safe no-op. Injectable `loadSources`/`fetchSource`/`markScanned` seams.
- Migration `supabase/migrations/20260629000400_public_job_sources.sql`: new `job_sources` config
  table (RLS-enabled, service-role only, no seed rows; tracks `last_scanned_at`/`last_error`) and
  extends public `jobs` with `external_job_id`, `apply_url`, `department`, `salary_min`,
  `salary_max` so no normalized field is dropped. Validated on a throwaway local Postgres:
  non-destructive ALTER, idempotent re-apply, RLS on, check constraints enforced. Not yet applied
  to prod.
- Tests: `scripts/test-scan-sources.{ts,mjs}` (per-provider parser fixtures + plan endpoints +
  salary parsing) and `scripts/test-source-scan.{ts,mjs}` (orchestration: upsert shape, dedupe,
  empty no-op, error isolation, Workday variant passthrough, cap).

Why the legacy relevance/scoring layer was NOT ported, and what operates instead:
- Legacy `app/scans/matching.ts` (`randallPrivateMatchingConfig`, single-user hand-tuned rules) +
  `app/scans/relevance.ts` filter jobs at fetch time for one user. The public product already has
  its own profile-driven engine `lib/public-profile/matching/` (`evaluateMatch` + category
  scorers; wired into `POST /api/public-profile/match` and pursuit creation) plus the scan-time
  filter `jobMatchesProfile` in `runPublicJobsScanForUser`.
- Porting the legacy layer would create a second, conflicting scorer hardcoded to Randall, and
  would filter the SHARED `jobs` pool to one user's relevance at source-scan time — wrong layer.
  Source scan fills the shared pool; per-user relevance is applied at scan time.
- Open gap to "complete" matching: `runPublicJobsScanForUser` currently selects results with the
  coarse `jobMatchesProfile`. The richer `evaluateMatch` scoring exists but is not yet wired into
  scan-result selection/ranking/annotation. Wiring it in is the next matching step.

Validation: new + existing test suites pass; `tsc --noEmit` clean; `npm run lint` 0 errors / 7
pre-existing warnings; `npm run build` compiles; migration validated locally; `git diff --check`
clean.

## 2026-06-29 - Source scan trigger, Slice 1b (Claude)

Added the scheduled trigger for the source scan. Backend/infra only.

- `GET|POST /api/jobs/source-scan` ([app/api/jobs/source-scan/route.ts](../app/api/jobs/source-scan/route.ts))
  guarded by `CRON_SECRET` (Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`). Handler
  `handleSourceScanRequest` in [lib/scan/api.ts](../lib/scan/api.ts): 503 if `CRON_SECRET` unset,
  401 on bad/missing bearer, 503 if storage unconfigured, else runs `runSourceScan` and returns the
  summary. This is an application-level route guard, not server-level auth.
- `vercel.json` schedules it daily at 06:00 UTC (`0 6 * * *`; Hobby-compatible, bump to `0 */6 * * *`
  on Pro).
- Tests: `scripts/test-scan-api.{ts,mjs}` (not-configured / unauthorized / storage-missing /
  authorized-run).
- Setup doc: [docs/scan-sources-setup.md](scan-sources-setup.md) — how to set `CRON_SECRET`, the
  schedule, and the `job_sources` seeding shape per provider.

Still needed before it produces data (Randall):
- Set `CRON_SECRET` in Vercel env.
- Add the real `job_sources` rows (companies + ATS board tokens) — see the setup doc. Until then the
  trigger runs and is a safe no-op.

Still open (later): wire `evaluateMatch` into per-user scan-result ranking/annotation;
de-duplicate the connector engine shared with legacy `app/scans`.

## 2026-06-29 - Pursuit read/list API (Claude)

Added the read/list API layer for public pursuits so future pursuit dashboard UI has data to
consume. Backend-only, no migrations, no UI, no design-gated surfaces touched.

- `GET /api/public-profile/pursuits` lists the user's pursuits (newest activity first), excludes
  `deleted` by default, supports `?status=<status>` filter and `?includeDeleted=true`, and returns
  each pursuit with its job summary plus per-status `counts`.
- `GET /api/public-profile/pursuits/[id]` returns full detail: pursuit + job + contacts +
  outreach messages + event timeline. First dynamic route in the app (Next 16 `params: Promise`).
- Repository: `loadPursuitsForUser`, `loadOutreachMessagesForPursuit`, `loadPursuitEventsForPursuit`
  in `lib/public-profile/pursuits/repository.ts`; batch `loadPublicJobsByIds` exported from
  `lib/public-jobs/repository.ts`; `OutreachMessageRecord` type added to pursuits/types.ts.
- Handlers `handlePublicProfilePursuitsListRequest` / `handlePublicProfilePursuitReadRequest` in
  `lib/public-profile/api.ts` with injectable loader seams.
- Tests extended in `scripts/test-public-profile-pursuits.ts` (repository) and
  `scripts/test-public-profile-api.ts` (handlers).

Validation: all public-profile test suites + `test:public-jobs` pass; `tsc --noEmit` clean;
`npm run lint` 0 errors / 7 pre-existing warnings; `npm run build` registers both new routes;
`git diff --check` clean.

Next backend-adjacent options remain: wire external connector ingestion into `/api/jobs/scan`,
or move to the design-gated pursuit dashboard UI track.

## 2026-06-29 - Codex backend brief complete

Codex completed and pushed the backend-only brief from
`docs/codex-tasks-backend-2026-06-28.md`. Matching, pursuit state machine/API slices,
Human Path provider boundary, contact selection, outreach generation persistence, status
tracking, lifecycle actions, and subscription enforcement are implemented and tested as backend
foundation.

Claude restart note: read `docs/claude-handoff-codex-backend-completion-2026-06-29.md` before
deciding the next track. The backend brief is complete, but public matching/pursuit/Human
Path/outreach UI remains unbuilt and design-gated. A sensible backend continuation, if explicitly
approved, is a read/list API for public pursuits so future dashboard work has data to consume.

## 2026-06-26 - Active session rules

Use this top section as the active session memory. Older `NEXT SESSION`, `RESUME HERE`, handoff, or dated markers in this file are historical notes only and must not be treated as the active resume point unless Randall explicitly names one.

- Start by pulling from git, then report `git status --short --branch` before implementation.
- Work only in `/Users/randallfransen/Sites/dumpster-fire-llc`; Lab26 is legacy/reference only and must not be used unless Randall explicitly asks for it.
- Before implementation, report git status and any sync task that was skipped, unavailable, or intentionally not done.
- Do not proceed to Step 4 Matching before design normalization.
- Do not start design implementation until the guardrails below are verified.

Homepage guardrail correction:

- Preserve the production animated grain texture exactly.
- Do not generalize `LandingBackground`, replace it, remove its canvas layers, or touch homepage structure without explicit Randall confirmation.
- Homepage content is not final, but approved sections preserve copy only.
- Ignore eyebrow/headline layout treatments as design direction unless Randall explicitly approves them.

## 2026-06-26 - Handoff retired after sync

The temporary MacBook Air handoff file was only for transfer between machines and should not remain an active restart source. Its durable instructions have been folded into this top section, and the handoff file was removed to prevent future sessions from treating it as another resume marker.

Added `docs/restart-handoff.md` as the machine-agnostic restart source for the next session.

## 2026-06-26 - Failed Codex design pass

The latest Codex design implementation should not be treated as approved design work. Codex guessed at CSS/UI mappings instead of using the exact Claude Design items/cards. The next session must use Claude Design as implementation authority and should rebuild or correct the design pass from the exact cards, not from this Codex CSS.

- Current recovery state: Step 1 profile gate copy is implemented; Step 2 Edit Career Profile is functionally kick-started; Step 3 Jobs/Saved Jobs is functionally kick-started.
- Do not proceed to Step 4 Matching before design normalization.
- Randall approved moving into design implementation now, but it must use the Claude design system primitives and must not add more ad hoc layout/styling.
- Treat the current dashboard/profile/jobs UI as functional scaffolding, not approved design.
- `docs/design-implementation-handoff.md` was corrected to preserve the current export decision: pursued-jobs/pursuit-history export only, no profile export.

## 2026-06-25 - Design system complete; implementation handoff ready

The mid-century design system is essentially complete and synced to Claude Design (`3af2f1ea`). Read **`docs/design-implementation-handoff.md`** before any design-implementation work; it has the locked decisions (full paper, body-font split with `--font-ui`=Gotham, grain ground app-wide, teal-forward accents), the product rules baked into the cards (profile pass/fail gate, "Add a Career Page", pursued-jobs export instead of match export, Application Details, tuning removed as admin-only), three code gaps to reconcile (compiler hard gate, career-page request email, pursued-jobs export backend), and the A-to-E port sequence.

- App design foundation is NOT started: `globals.css` is still the dark theme, only Gotham loaded, no DS tokens. Step A (tokens + fonts into `globals.css`/`layout.tsx`, flip to light) is the first move and is additive/non-destructive.
- Grain carryover: `app/LandingBackground.tsx` becomes the app-wide ground. Homepage content-only lock still applies; confirm with Randall before generalizing the grain onto home.
- Do not start the port until Randall greenlights it.

## 2026-06-26 - Public product gap build plan

Added `docs/public-product-gap-build-plan-2026-06-26.md` to turn the product-roadmap audit into an execution plan for the current standalone site.

- Confirmed the current public site has `/`, `/onboarding`, `/dashboard`, and public profile APIs, while `/scans` remains private legacy machinery and should not be counted as public-product completion.
- Mapped missing public work by product area: auth/account entry, onboarding quality, profile management, public jobs/saved jobs, matching, pursuits, Human Path, outreach, subscriptions, and final public landing/pricing.
- Recommended build sequence: stabilize profile completion, build `Edit Career Profile`, add public jobs and Saved Jobs, add public matching, add Pursuits, add Human Path, add outreach, add subscription enforcement, then finalize public launch/pricing copy.
- Restored the approved homepage header, `Is the Job Market a Dumpster Fire?` section/cards, and Human Path intro copy after an over-broad first cleanup pass. Those areas should remain unchanged until Randall explicitly revises them or the forthcoming Claude Design cards replace the Human Path mock visuals.

Step 1 clarification and implementation:

- Profile completion remains operationally pass/fail: incomplete profiles cannot scan; if Scan is unavailable, Matching, Saved Jobs, Pursuits, Human Path, Outreach, and Pursued Jobs Export are unavailable too.
- Weak/Good/Strong-style guidance remains allowed inside questionnaire/ingest UX, but it does not create a partial operating state.
- `/onboarding` now shows the agreed incomplete-profile justification: "Without the full picture, outreach won't be good. And if outreach isn't good, your chances drop. Finish your profile."
- `/dashboard` complete-state copy now uses the product terms without the public/private semantic split.
- Profile export is not a feature. Export means pursued jobs/pursuit history only: job pursued, selected Applying As Role Track/narrative, message sent, recipient/contact, status, and timestamps.
- Terminology: `Role Track` is the maintained profile narrative; `Applying As` is the pursuit-level selected Role Track/narrative, such as Executive Producer or Product Manager.

Step 2 implementation kick-start:

- `/dashboard` now opens a full-screen `Edit Career Profile` modal after the complete-profile gate passes.
- The modal has left-side navigation for every onboarding-created profile section and embeds the existing section editor in `profile-editor` mode, so completed profiles no longer redirect out of editing.
- `app/onboarding/OnboardingClient.tsx` now supports `mode="profile-editor"`, section anchors, compact editor styling, and Role Track duplicate/archive controls.
- The first Step 2 slice intentionally reuses the existing section save handlers and API payloads; full debounced autosave, profile version-history UI, and regeneration controls remain follow-up work.

Step 3 clarification:

- Step 3 means the roadmap phase for Jobs and Saved Jobs, not the Human Path modal steps.
- Jobs are user-scoped scan results, not a shared/global pool.
- The existing scan button should use the user's current profile search requirements/constraints; changing scan parameters happens by editing those profile search requirements.
- Each new scan should merge with unsaved and unactioned prior scan results so jobs are not lost.
- Saved Jobs means "pursue later" only; saving does not create a pursuit.
- Repeated scan results should dedupe by source URL/company/title, and expired/stale jobs should disappear automatically.

Step 3 implementation kick-start:

- Added `job_scan_results` migration as the user-owned bridge between global normalized `jobs` and per-user scan results.
- Added public Jobs APIs: `GET /api/jobs`, `POST /api/jobs/scan`, and `POST /api/jobs/save`.
- `/api/jobs/scan` now uses the complete public profile's search requirements/constraints to merge matching normalized public jobs into the user's active scan results; external connector ingestion remains a follow-up provider seam.
- `/dashboard` now shows a Run scan button, active Jobs list, Saved Jobs panel, v1 job card fields, and save/unsave actions.
- Saved Jobs remain "pursue later" only and do not create pursuits.

## 2026-06-26 - Public homepage content cleanup kick-start

Started recovery from the failed public-homepage copy pass without changing the approved animated grain background or homepage layout.

- `app/page.tsx` briefly received over-broad copy cleanup, then the approved homepage header, `Is the Job Market a Dumpster Fire?` section/cards, and Human Path intro were restored per Randall's correction.
- Replaced premature pricing-plan language with an `Access` section that distinguishes beta profile setup, gated private scan workspace, and future public pursuit workflow.
- Removed internal/implementation handoff language from public onboarding copy and made `/dashboard` honest that it is a profile-complete placeholder, not the finished public matching dashboard.
- Updated root metadata to describe the public product around structured profile and pursuit workflow instead of private scan workflows.
- Validation passed: `npx tsc --noEmit --incremental false`, `npm run lint` with the five known legacy warnings, `git diff --check`, and local route checks for `/`, `/onboarding`, and `/dashboard` on the already-running standalone dev server at `127.0.0.1:3020`.
- Visual checks captured: `/private/tmp/dumpster-fire-llc-home-cleanup-desktop.png`, `/private/tmp/dumpster-fire-llc-home-cleanup-mobile.png`, `/private/tmp/dumpster-fire-llc-onboarding-cleanup-desktop.png`, and `/private/tmp/dumpster-fire-llc-dashboard-cleanup-desktop.png`.

Follow-up:

- Continue auditing public surfaces for private `/scans`, Lab26-era, implementation-roadmap, pricing, or not-yet-built workflow claims before adding new product copy.

## 2026-06-25 - Public homepage recovery checkpoint

Recovered the public homepage animated grain background from the live production implementation and marked this as the reversion point for future homepage work.

- `app/LandingBackground.tsx` now owns the approved background implementation: two canvases, `publicLandingMesh` and `publicLandingStatic`.
- The mesh canvas uses drifting radial blooms; the static canvas redraws animated brown grain at `1.5x` viewport size.
- `app/site.module.css` keeps the approved canvas treatment: fixed canvases, mesh `blur(90px)`, static `mix-blend-mode: multiply`.
- Validation passed: `npm run lint` with the same five legacy warnings, `npx tsc --noEmit --incremental false`, and `npm run build`.
- Browser-level canvas proof passed: both canvases present and the static canvas changed frame-to-frame (`staticChanged: true`).
- Local visual proof captured at `/private/tmp/dumpster-recovered-production-grain.png`.

Next session warning:

- The next homepage session is for **CONTENT updates only** unless Randall explicitly expands scope.
- Content means public-facing words: headline, nav labels, section copy, pricing labels, feature descriptions, CTA copy.
- Do not copy internal process notes, recommendations, roadmap sequencing, audit language, implementation order, or “recommended next step” text into public homepage content unless Randall explicitly approves that exact text.
- Do not replace the animated canvas background, remove `LandingBackground`, swap it for CSS noise, or restructure the page while making content edits.

## 2026-06-25 - Repo cleanup ownership matrix

Started the standalone repo cleanup from the issue/docs queue:

- Confirmed `dumpster-fire-llc` is the canonical public app repo; Lab26 is legacy read-only reference only and must not be used as a save target for public-app work.
- Checked GitHub open issues for `fransencomesalive/dumpster-fire-llc`; none were returned, so the actionable queue remains local docs (`docs/project-todo.md`, `docs/next-session.md`, `docs/spec-review-phase-1.md`, and `docs/implementation-roadmap.md`).
- Added `docs/repo-cleanup-migration-matrix.md` with the current inventory, classifications, migration decisions, dependency order, and guardrails.
- Current recommended implementation order after cleanup inventory: preserve the public profile/API foundation, continue remaining onboarding forms from `docs/project-todo.md`, keep `/scans` isolated as gated legacy-active product machinery, and rebuild public landing/pricing/auth routing in the standalone repo only after the product routes stabilize.

Follow-up audit completed:

- Added `docs/product-roadmap-audit-2026-06-25.md` to compare current built pages and functions against the full product roadmap and feature set.
- Summary: Phase 1 public profile foundation is largely built and validates cleanly; Phase 2 onboarding UI now has editable shells, section-level readiness/status UX, and client-side Profile Complete routing for every required and optional section; auth-provider polish, public profile management, matching, pursuits, Human Path, outreach, subscriptions, pricing, and final landing are not yet built as public workflows.
- Validation passed: all public profile focused tests, `npx tsc --noEmit --incremental false`, `npm run lint` with five legacy warnings, and `npm run build`.
- Built-route smoke on `127.0.0.1:3017`: `/` and `/onboarding` returned `200`, `/scans` returned the access-code login, public profile APIs rejected missing bearer tokens with `401`, and `/scans/api/dashboard` rejected missing private session with `401`.

Phase 2 continuation:

- Added Proof Library editing to `app/onboarding/OnboardingClient.tsx`.
- `/onboarding` now loads `/api/public-profile/proof-library` with the existing profile bootstrap, stores proof projects in client state, supports add/remove/edit for all proof-object fields, and saves through the authenticated Proof Library `PATCH` endpoint.
- Proof Library fields now cover name, link, confidence, candidate role, description, proof signals, capabilities, supported responsibilities/experience, industries, best/avoid use, metrics, and caveats.
- Added Skills Inventory editing to `app/onboarding/OnboardingClient.tsx`.
- `/onboarding` now loads `/api/public-profile/skills` with the existing profile bootstrap, stores skills in client state, supports add/remove/edit for skill evidence and guardrails, links skills to Proof Library and Work History records, and saves through the authenticated Skills Inventory `PATCH` endpoint.
- Skills Inventory fields now cover skill name, proficiency, evidence, related proof, related work history, best role fit, and do-not-overclaim guidance.
- Added editable shells for Why People Hire Me, Operating Style, Decision Style, Communication Style, Writing Samples, What AI Gets Wrong, Outreach Rules, and optional Leadership Profile.
- `/onboarding` now loads and saves every public profile onboarding section endpoint. Shared quality narrative sections use the profile-quality field keys 1:1; richer sections preserve their settings/list shapes.
- Added live section-level readiness/status UX to `/onboarding`.
- The server hero now avoids a hardcoded incomplete state before auth. The signed-in client summary shows live complete/incomplete status, required-section count, blocker count, weak response count, and last-checked timestamp.
- The section inventory now maps `profileQuality.incompleteReasons` and `weakFields` into per-section badges and blocker counts.
- Added client-side Profile Complete routing around the existing local bearer-token flow.
- `/` now checks a stored public profile token and routes complete profiles to `/dashboard` or incomplete profiles to `/onboarding`.
- `/onboarding` redirects complete profiles to `/dashboard`; `/dashboard` sends missing-token or incomplete profiles back to `/onboarding`.
- Added `/dashboard` as the Profile Complete destination placeholder until the public Saved Jobs/Pursuits dashboard exists.
- Next Phase 2 hardening step is quality-scoring/remediation guidance and production auth-provider polish.

## ▶ NEXT SESSION — RESUME HERE (handoff 2026-06-24)

**What this session did:** mid-century design-system reskin of `/scans`, in `design-system/` (repo root, never ships), all synced to the Claude Design project **"Dumpster Fire Design System" (`3af2f1ea-428c-49b3-8b02-c066ec0c7452`)** via the DesignSync tool. Screenshot loop: `node /tmp/ds-shot-*.mjs` (playwright-core from Lab26 + installed Chrome). Full locked conventions live in Claude auto-memory `project_dumpster_fire_design_system.md` — read it first.

**Built + synced this session:** modal shell (`modal.html`), Apply Wizard (`apply-wizard.html` — Pursuit/Human Path phrasing, 4 discrete steps), match-card CTA → "Pursue", and the **hero** (two options).

**Hero is the open thread.** Two options in `design-system/components/`, both synced:
- `hero-matchbook.html` — cream stock + printed cover frame, Original Surfer hand-painted wordmark in a teal+tomato off-registration overprint (slip 4/4.5px), tight centered title+mascot pair.
- `hero-atomic.html` — Tanager Red field with a regular tiled **mod lattice** (atomic-star + dot `<pattern>`), Shrikhand wordmark (cream + teal slip), tight centered title+mascot pair.
- Both: title-case lead, tagline banner ("Stop applying. Start pursuing."), pursuit copy (NO em dash), die-cut mascot, no red+yellow. Roadside concept was trashed per Randall.

**OPEN QUESTION asked, awaiting Randall's answer (resume here):**
1. On `hero-atomic`, is an **all-over mod pattern** right, or should the mid-century texture be **concentrated** (band/corner block) so type sits on cleaner field?
2. Are we close enough to **lock one of the two** (Matchbook vs Atomic) and move on?

Hard-won rules from this session (do NOT repeat the mistakes): build literally from the saved refs (El Rancho matchbook, Mr. Product) — no invented web-hero defaults; **title block + mascot = one centered flex pair** (never a `1fr/auto` grid that voids the middle); **atomic = a regular tiled pattern, never scattered icons**; **Ventura font rejected ($30)** — using free SIL OFL faces (Original Surfer / Shrikhand / Pacifico active; Lobster/Kaushan/Rye/Fontdiner downloaded as candidates), licenses bundled in `design-system/fonts/`.

**After the hero is locked:** compose the **full scan-page mock** (hero + section header + rating filter tabs + match-card stack + Overview/Config sidebar incl. `.scanNowBtn`), then port finalized tokens + component CSS into live `app/scans/scans.module.css` and verify the gated page. Secondary surfaces still undesigned: scan-progress modal, activity/scan-history list.

**Production commit update 2026-06-25:** the public-product migration (`app/scans/`, `app/onboarding/`, `app/api/public-profile/`, `lib/`, `scripts/`, `supabase/`, and product docs) is intentionally included in the production-ready handoff. `Design System Resources/` remains local-only reference material and is intentionally ignored/untracked.

---

## 2026-06-24 (cont.) - Design system: hero options revised (atomic + matchbook only)

Feedback round: roadside was off-theme (deleted entirely, local + Claude Design + manifest); the atomic elements weren't reading; layouts had dead space / vertical drift; matchbook offset too strong. Fixes:
- **Layout (both):** proper two-column grid (`minmax(0,1fr) auto`, `align-items:center`) — title block left, mascot right, vertically centered. No dead right-space, no downward drift, mascot no longer absolute.
- **Atomic (`hero-atomic.html`):** rebuilt with real, prominent mid-century motifs — **sputnik starburst, atom diagram, molecule, boomerang, diamonds** — composed across the red field as a deliberate backdrop (cream + teal), behind the lockup. Now reads as hero + atomic.
- **Matchbook (`hero-matchbook.html`):** off-registration slip dialed back 35% (6/7px → 4/4.5px); a few restrained atomic accents (sputnik/boomerang/diamond) added.
- Two options remain: Matchbook (A) + Atomic (B). Verified 1280 + 390. Synced.

Follow-up round (layout + atomic still off): replaced the `1fr/auto` grid (which left a dead middle void and pushed the mascot to the far edge) with a **centered flex pair** — title block + mascot together, vertically aligned, controlled gap. Replaced the **scattered atomic icons** (read as random clip-art) with a **regular tiled mod lattice** (atomic-star + dot `<pattern>`) for cohesive mid-century texture on the red field; matchbook has no scattered icons (clean cover). Re-synced.

## 2026-06-24 (cont.) - Design system: 3 finished hero options (build-them-all)

Per Randall ("build them all"), developed each concept into a complete, polished masthead (with the section-header context below) as three standalone components in a new "Hero options" group; retired the old Bemio `hero.html` and the rough `hero-concepts.html` (deleted locally + from Claude Design) to keep the list clean. Synced.
- `components/hero-matchbook.html` (**A**) — cream + printed frame, Original Surfer wordmark, teal+tomato off-registration overprint, sparse atomic accents (atom-star/boomerang/diamond), die-cut mascot.
- `components/hero-atomic.html` (**B**) — Tanager Red field, Shrikhand wordmark (cream + teal slip + ink keyline), atomic spread (atom orbit, spiky stars, boomerang) + faint cream diamond wallpaper, mascot.
- `components/hero-roadside.html` (**C**) — travel-poster landscape (sunset sky, setting sun at the road's vanishing point + rays, layered teal/green hills, pines, telephone poles, dashed road), Pacifico script wordmark in the sky (copy contrast fixed by keeping all text in the sky band), mascot standee on the hills.
- All: title-case lead, tagline banner, pursuit copy (no em dash), no red+yellow, verified 1280 + 390. AWAITING Randall's pick of which to lock as the canonical hero for the full page mock (fonts/field colors still swappable). Fonts synced+licensed: Original Surfer, Shrikhand, Pacifico (Rye/Fontdiner/Lobster/Kaushan downloaded, unused).

## 2026-06-24 (cont.) - Design system: 3 hero concepts to choose from

v3 (Bemio overprint) got closer but the title font was too system-display; Randall asked for script/hand-painted type, atomic-era elements, and a possible landscape, built as a separate component. Pulled more free OFL faces (Original Surfer, Shrikhand, Rye, Fontdiner Swanky; Pacifico/Kaushan/Lobster already present) with licenses bundled. Built `design-system/components/hero-concepts.html` (synced; new card):
- **A · Matchbook** — cream + printed frame, wordmark in **Original Surfer** with teal+tomato off-registration overprint, sparse atomic accents (atom-star, boomerang), die-cut mascot.
- **B · Atomic Lounge** — bold **Tanager Red field**, wordmark in **Shrikhand** (cream + teal slip), atomic spread (atom orbit, spiky star, boomerang), mascot.
- **C · Roadside** — travel-poster **landscape** (sunset sky, horizon sun+rays, layered hills, pines, road) in flat two-ink, wordmark in **Pacifico** script, mascot standee.
- All: title-case lead, tagline banner, pursuit copy (no em dash), no red+yellow. Verified 1280 + 390.
- AWAITING Randall's pick of concept (+ font). Known refinement if C: description ink overlaps the dark near-hill (contrast) — move/relighten on selection. Only Original Surfer + Shrikhand fonts synced (used); Rye/Fontdiner downloaded but unused.

## 2026-06-24 (cont.) - Design system: hero v3 (matchbook two-ink overprint)

v2 was rejected: ugly script font (Lobster), starburst + tiled-halftone background not in any reference, em dash in copy, tagline buried in a paragraph, lazy headline-left/mascot-right layout. v3 rebuilds straight from the El Rancho matchbook:
- **Cream stock** (paper-deep) + soft-light grain, inside a **matchbook cover frame** (heavy ink rule + inner hairline keyline). Dropped the bold blue field because a true overlaid-ink off-registration only reads on cream (the matchbook approach). Field-color is revisitable.
- Wordmark **"Dumpster Fire" as a two-ink off-registration overprint**: a teal plate + a tomato plate slipped down-right, multiplied so the overlap prints a dark third tone and each ink shows on one edge. Set in Bemio (the script font is dropped; Lobster/Pacifico/Kaushan files remain in fonts/ but are unused).
- Removed the starburst and the tiled-halftone wallpaper entirely.
- Lead is **title case** ("The Job Market Is A"). Tagline **"Stop applying. Start pursuing."** pulled out into its own tomato banner (ink border + hard offset), not body copy.
- Copy rephrased per Randall, **no em dash**: "…the person who actually does the hiring by leveraging your own voice and experience to make contact."
- Mascot = die-cut standee (cream sticker edge + ink offset). Verified 1280 + 390. Synced.
- Palette safe: teal+tomato+cream+ink, no red+yellow pairing.

## 2026-06-24 (cont.) - Design system: hero v2 (pushed texture + pursuit copy)

Feedback on v1: too flat, not enough of the screenprint style, badge unneeded, copy was a stale artifact. v2:
- Removed the "Private beta" pill.
- Pushed the printed-ephemera treatment: atomic **sunburst rays** behind the mascot, **ben-day halftone** across the field (masked to fade center), soft-light grain, a real **screenprint misregister** on the wordmark (mustard fill + ink keyline + cream offset plate), and the mascot as a **die-cut standee** (cream sticker edge + sunburst/halftone seal disc + hard ink offset).
- Rewrote the subhead from the product's own positioning (`public-product-build-epics.md`: "Stop applying. Start pursuing." / "stop disappearing into application portals"): portals/ATS are where candidates disappear; the fix is a direct line to the person who hires, in your own voice, with experience + proof. Tagline "Stop applying. Start pursuing." set in mustard.
- Verified 1280 + 390 (mobile: mascot leads, no overflow). Synced.

## 2026-06-24 (cont.) - Design system: hero redesign (vintage logo lockup)

First hero pass was just the original page's text + mascot. Redesigned per Randall's reference review (Mr. Product mascot logos, El Rancho matchbook, Danny Donut, Ventura script, paint deck). Chosen direction: **vintage product-logo lockup on a bold flat color field**, mascot as brand character, **Ventura script accent**, full sentence kept.

`design-system/components/hero.html` now: Egyptian Blue (`--c-bluebird`) full-bleed field (grain soft-light), a cream/ink **label badge**, wordmark = "The job market is a" (Bemio cream) + **"Dumpster Fire" in script** (mustard, ink print-outline + screenprint slip), the dumpsterfireguy mascot popping off the blue, cream description, heavy ink rule into the cream section header. Mirrors `.page/.hero/.heroInner/.heroTitleRow/.heroMascot`; drops the dark `.meshBg`. No Scan CTA (the real hero has none — `.scanNowBtn` is in the sidebar). Verified 1280 + 390 (mobile stacks, no overflow). Synced to Claude Design (`3af2f1ea`).

**OPEN / needs Randall:**
- **Script font.** Ventura ($30 commercial) rejected; replaced with free **SIL OFL** fonts now embedded in `design-system/fonts/` (with `OFL-*.txt` licenses): **Lobster** active (recommended), **Pacifico** + **Kaushan Script** also loaded — swap via `--font-script`. Comparison at `/tmp/ds-script-compare.png`. Randall to confirm the pick; then copy the chosen TTF + OFL to `app/scans/fonts/` on port.
- **Field color** is a one-token swap (`--hero-field`): Egyptian Blue now, flip to Tanager Red (`--c-tomato`) if preferred.
- **Badge copy** "Private beta · by invitation" is placeholder — set the real line.

## 2026-06-24 (cont.) - Design system: Pursuit phrasing + Human Path wizard refinements

Reviewed the modal + wizard against the actual product specs and applied corrections:
- **Pursuit phrasing across the board** (per `docs/pursuit-workflow-spec.md` — "users do not apply, they pursue"): match-card CTA `Apply` → **Pursue**; wizard title `Apply wizard` → **Human Path** (provisional — may be dropped since the stepper makes steps clear); `Open apply link` → **Open job posting**; final `Save actions` → **Save pursuit**; `Application tracking` → **Pursuit tracking**; close-confirm copy now says Pursuits, not "Previous Applications". Kept spec-correct terms: Step-1 **"Applying as"** (= Role Track recommendation) and **"Applied"** as a Track state.
- **Contacts step:** removed the manual "Re-research Contacts" button — the Human Path is found automatically on Pursue (a metered, multi-second AI lookup, so NOT instant). Added a **"Fetching potential contacts"** loading placeholder (dashed panel + pulsing dot + skeleton cards). Fixed the 0px status/button gap. Recommendation: generate once per pursuit and cache (Human Path is metered), not on every visit.
- **Outreach step:** confirmed **save-approved-message** + **rejection-reason** are real (data model `OutreachMessage.status` + `saved_message_feedback` table). Replaced the confusing standing "No rejection note" dropdown with an **Approve / Reject** control; the reason select now appears only after Reject.
- **Footer:** removed the redundant **Back** button (the numbered stepper already navigates), which also resolves the button-size mismatch.
- Re-synced apply-wizard + modal + match-card to Claude Design (`3af2f1ea`); verified 1280 + 390.

## 2026-06-24 (cont.) - Design system: modal shell + Apply Wizard

Continued the design-system reskin. Per decision, built the dialog/sub-flow surfaces before the full page mock.

Built + synced (2 new component cards):
- `design-system/components/modal.html` — reusable modal shell: ink-wash overlay, paper-stock dialog (heavy ink outline + hard offset), printed close button, info-note (`.modalNote`, calm bluebird left-accent), two-column field grid, footer (`.modalBtnClose` secondary / `.modalBtnSave` primary), and the close-confirm interrupt + `.modalBoxSmall` variant.
- `design-system/components/apply-wizard.html` — full 4-step flow shown as **4 discrete modal states** (Review → Contacts → Outreach → Track), one step visible at a time, navigated by the stepper + Back/Continue (Step 4 ends in Save actions). Active step = teal with paper-knockout disc (avoids the forbidden red+yellow pairing). Step 1 **"Applying as:"** lists the candidate's submitted title narratives from `apply-modes.ts` (Executive Producer / Program Director / AI Workflow · Product Ops) — the lens the candidate applies under, NOT a fit/matching mode. Plus contact lead cards (`.contactSuggestion` + `.seeProfileBtn`), outreach message block (`.copyHeader` + `.messageTextarea` + approval/reject row), and the tracking `.checklistGrid`.
- Class names mirror `app/scans/DashboardClient.tsx` (`.modalOverlay/.modalBox/.modalHeader/.modalTitle/.modalClose/.modalIntro/.modalFooter/.modalBtnClose/.modalBtnSave/.wizardSteps/.wizardStep/.wizardStepActive/.modeSection/.copyGenerationPanel/.contactSuggestion/.messageTextarea/.checklistGrid`) so CSS ports back ~1:1.
- Mobile (≤560px): formGrid → 1 col, wizard stepper → 2×2, checklist → 1 col, contact panel stacks. Verified at 1280 + 390 (no overflow/truncation).
- `_ds_manifest.json` cards array hand-patched with both new cards; all three files synced to the "Dumpster Fire Design System" project (`3af2f1ea`).
- **Not yet committed** — design-system/ working-tree changes (2 new files + manifest) pending `git add`/commit/push.

**RESUME HERE (next step):** design the **hero/page header** component (the one remaining main-view surface: mascot + title row + primary Scan CTA — `app/scans` `.hero/.heroInner/.heroTitleRow/.heroMascot`), then compose the **full scan-page mock** assembling hero + section header + filter tabs + match-card stack + Overview/Config panels. Screenshot mobile+desktop, sync. *Then* port finalized tokens + component CSS into live `app/scans/scans.module.css` and verify the gated page. Remaining secondary surfaces still undesigned: scan-progress modal, activity/scan-history list.

## 2026-06-24 - Mid-century design system (in progress)

Building a mid-century-mod reskin of the `/scans` dashboard as a synced Claude Design system, in `design-system/` (repo root, never ships).

State:
- Foundations (color, type, texture) + components (match card, panel, login, badges, forms, modal shell, Apply Wizard) all built, screenshotted mobile+desktop, and synced to the "Dumpster Fire Design System" project on claude.ai/design. Foundations→forms committed + pushed (`edac2c3`); modal + wizard pending commit.
- Component class names mirror `app/scans/DashboardClient.tsx` so CSS ports back ~1:1.
- Full design context, locked conventions, and gotchas live in Claude auto-memory: `project_dumpster_fire_design_system.md`.
- Workspace is additive/isolated; the in-progress `/scans` public migration in the working tree is untouched and still uncommitted.

## 2026-06-24 - Work History onboarding form

Expanded the live onboarding shell to the next structured required section.

Implemented:
- `/onboarding` now loads Work History alongside Identity/Search, Role Tracks, and Resume Uploads after bootstrap.
- Added authenticated Work History add/edit/remove/save UI in `app/onboarding/OnboardingClient.tsx`.
- Added company/title/date/current-role/source fields plus responsibilities, accomplishments, skills, and metrics.
- Added resume attachment checkboxes that use active Resume IDs.

Validated:
- `npx tsc --noEmit --incremental false`
- `npm run build`
- `npm run lint`
- Production deploy to Vercel.
- Public-domain smoke test on `https://thejobmarketisadumpsterfire.com`: `GET /onboarding`, `POST /api/public-profile/bootstrap`, `PATCH /api/public-profile/role-tracks`, `PATCH /api/public-profile/resumes`, and `PATCH /api/public-profile/work-history`; temporary user cleanup returned `200`.

Next:
- Add Proof Library editing to the onboarding shell.

## 2026-06-23 - Resume Uploads onboarding form

Expanded the live onboarding shell to cover the next required structured section.

Implemented:
- `/onboarding` now loads Resume Uploads alongside Identity/Search and Role Tracks after bootstrap.
- Added authenticated Resume Uploads add/edit/remove/save UI in `app/onboarding/OnboardingClient.tsx`.
- Added parser quality, parsed text, strengths/gaps/use/avoid/parsing issue fields.
- Added Role Track attachment checkboxes that use active Role Track IDs.
- Documented that actual file upload plumbing remains blocked on the storage/provider decision; the current form stores the parsed resume record.

Validated:
- `npx tsc --noEmit --incremental false`
- `npm run build`
- `npm run lint`
- Production deploy to Vercel.
- Public-domain smoke test on `https://thejobmarketisadumpsterfire.com`: `GET /onboarding`, unauthenticated `GET /api/public-profile/role-tracks` returns `401`, `POST /api/public-profile/bootstrap`, `PATCH /api/public-profile/role-tracks`, and `PATCH /api/public-profile/resumes`; temporary user cleanup returned `200`.

Next:
- Add Work History review/editing to the onboarding shell.

## 2026-06-23 - Deployment env and Role Tracks onboarding

Continued the public onboarding implementation after the live Supabase bootstrap path was verified.

Implemented:
- Synced required Supabase runtime variables into Vercel for Production, Preview, and Development without printing secret values.
- Verified Vercel now lists the public Supabase variables as encrypted project env vars.
- Deployed the current app to Vercel production.
- Promoted the known-good deployment after a newer incomplete deployment temporarily took the aliases.
- Expanded `/onboarding` to load both Identity/Search and Role Tracks after bootstrap.
- Added authenticated Role Tracks add/edit/remove/save UI in `app/onboarding/OnboardingClient.tsx`.
- Added repeatable Role Track editor layout styles in `app/onboarding/onboarding.module.css`.
- Added reload/sign-out controls for the live onboarding session.

Validated:
- `npx tsc --noEmit --incremental false`
- `npm run build`
- `npm run lint`
- Production smoke test with a temporary Supabase user: `GET /onboarding`, `POST /api/public-profile/bootstrap`, and `GET /api/public-profile/role-tracks`; user cleanup returned `200`.

Next:
- Add Resume Uploads to the editable onboarding shell.
- Run the full validation chain after the next onboarding slice.

## 2026-06-23 - Supabase config and onboarding shell

Started both post-autosave tracks: Supabase migration setup and onboarding UI shell.

Implemented:
- Initialized Supabase CLI metadata in `supabase/config.toml`.
- Disabled empty seed loading in local Supabase config.
- Added authenticated candidate profile bootstrap endpoint at `app/api/public-profile/bootstrap/route.ts`.
- Added public profile onboarding section manifest in `lib/public-profile/onboarding.ts`.
- Added browser-safe public profile API request helper in `lib/public-profile/client.ts`.
- Added `/onboarding` route shell in `app/onboarding/page.tsx`.
- Added first editable onboarding client form for Identity/Search in `app/onboarding/OnboardingClient.tsx`.
- Added onboarding route styles in `app/onboarding/onboarding.module.css`.
- Added public home link to `/onboarding` in `app/page.tsx`.
- Fixed `createPublicProfileRepositoryRequest` so empty successful PostgREST responses do not throw JSON parse errors.

Supabase status:
- Linked the repo to Supabase project `job-search` / `ngftlvlslhjsyjcbuuwv`.
- Applied `supabase/migrations/20260623000100_public_foundation_schema.sql` to the remote project.
- Fixed the migration before applying by quoting the Postgres keyword column `"current_role"` in `work_history_items`.
- Verified the migration is recorded remotely with `supabase migration list`.
- Retrieved Supabase anon/service keys through the CLI and populated local `.env.local` without printing secrets.
- Set local `SUPABASE_AUTH_EMAIL_ENABLED=true`.
- Verified live Supabase Auth with a temporary email/password user and deleted the user afterward.
- Verified live local public API path with a temporary Supabase user: `POST /api/public-profile/bootstrap` then `GET /api/public-profile/identity-search`, followed by user cleanup.

Next manual setup:
- Add required Supabase env vars to the deployment.
- Continue editable onboarding forms beyond Identity/Search.

## 2026-06-23 - Leadership Profile autosave route

Completed the optional Leadership Profile section-level profile autosave endpoint.

Implemented:
- `LeadershipProfileSection` modeling, parsing, normalization, and aggregate application in `lib/public-profile/sections.ts`.
- Leadership Profile read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistLeadershipProfileSection` in `lib/public-profile/repository.ts`.
- `handleLeadershipProfileSectionGetRequest` and `handleLeadershipProfileSectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/leadership-profile/route.ts` exposes authenticated `GET` and `PATCH` endpoints.
- Fixture-backed coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Behavior:
- `GET /api/public-profile/leadership-profile` returns the visibility toggle, optional leadership quality fields, and profile quality summary.
- `PATCH /api/public-profile/leadership-profile` accepts full `visible` plus `fields` replacement and returns the normalized saved section plus profile quality summary.
- Leadership Profile remains optional and does not block binary profile completion.
- Leadership longform fields are allowed under `leadership_profile` without making them required.

## 2026-06-23 - Outreach Rules autosave route

Completed the Outreach Rules section-level profile autosave endpoint.

Implemented:
- `OutreachRulesSection` modeling, parsing, normalization, Role Track relationship validation, and aggregate application in `lib/public-profile/sections.ts`.
- Outreach Rules read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistOutreachRulesSection` in `lib/public-profile/repository.ts`.
- `handleOutreachRulesSectionGetRequest` and `handleOutreachRulesSectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/outreach-rules/route.ts` exposes authenticated `GET` and `PATCH` endpoints.
- Fixture-backed coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Behavior:
- `GET /api/public-profile/outreach-rules` returns global/follow-up/link-selection settings, contact-approach quality fields, Role Track-specific rules, and profile quality summary.
- `PATCH /api/public-profile/outreach-rules` accepts full `settings`, `fields`, and `roleTrackSpecificRules` replacement and returns the normalized saved section plus profile quality summary.
- Role Track-specific rules validate `roleTrackId` against active Role Tracks before persistence.
- Missing outreach settings or weak/missing contact approach fields re-evaluate the whole profile to `incomplete`.

## 2026-06-23 - Writing Samples autosave route

Completed the Writing Samples section-level profile autosave endpoint.

Implemented:
- `WritingSamplesSection` modeling, parsing, normalization, and aggregate application in `lib/public-profile/sections.ts`.
- Writing Samples read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistWritingSamplesSection` in `lib/public-profile/repository.ts`.
- `handleWritingSamplesSectionGetRequest` and `handleWritingSamplesSectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/writing-samples/route.ts` exposes authenticated `GET` and `PATCH` endpoints.
- Fixture-backed coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Behavior:
- `GET /api/public-profile/writing-samples` returns normalized liked/hated writing samples plus profile quality summary.
- `PATCH /api/public-profile/writing-samples` accepts a full `writingSamples` array replacement and returns the normalized saved section plus profile quality summary.
- Missing liked or hated samples re-evaluate the whole profile to `incomplete`.

## 2026-06-23 - Communication Style and AI Misreadings autosave routes

Completed the next profile autosave slice after the first narrative routes.

Implemented:
- `CommunicationStyleSection` modeling, parsing, normalization, and aggregate application in `lib/public-profile/sections.ts`.
- Communication Style read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistCommunicationStyleSection` in `lib/public-profile/repository.ts`.
- `handleCommunicationStyleSectionGetRequest` and `handleCommunicationStyleSectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/communication-style/route.ts` exposes authenticated `GET` and `PATCH` endpoints.
- `app/api/public-profile/ai-misreadings/route.ts` reuses the quality-scored narrative handler for authenticated `GET` and `PATCH` endpoints.
- Fixture-backed coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Behavior:
- `GET /api/public-profile/communication-style` returns settings, voice quality-scored fields, and profile quality summary.
- `PATCH /api/public-profile/communication-style` accepts full `settings` plus `fields` replacement and returns the normalized saved section plus profile quality summary.
- `GET /api/public-profile/ai-misreadings` and `PATCH /api/public-profile/ai-misreadings` reuse the full-section quality-scored narrative replacement behavior.
- Communication settings and quality-scored text updates re-evaluate binary profile completion.

## 2026-06-23 - Quality-scored narrative autosave routes

Completed shared quality-scored narrative autosave support for the first three narrative onboarding sections.

Implemented:
- `QualityNarrativeSection` modeling, parsing, normalization, and aggregate application in `lib/public-profile/sections.ts`.
- Required quality-field truth is exported from `lib/public-profile/profile-quality.ts` and reused by narrative validation.
- Quality-scored narrative read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistQualityNarrativeSection` in `lib/public-profile/repository.ts`.
- `handleQualityNarrativeSectionGetRequest` and `handleQualityNarrativeSectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/why-people-hire-me/route.ts`, `app/api/public-profile/operating-style/route.ts`, and `app/api/public-profile/decision-style/route.ts` expose authenticated `GET` and `PATCH` endpoints.
- Fixture-backed coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Behavior:
- `GET /api/public-profile/why-people-hire-me`, `GET /api/public-profile/operating-style`, and `GET /api/public-profile/decision-style` return the normalized narrative section plus profile quality summary.
- `PATCH` on those routes accepts a full `fields` array replacement for that section and returns the normalized saved section plus profile quality summary.
- Payload field keys are validated against the required quality-field map for the requested section.
- Blank required values or `weak` quality re-evaluate the whole profile to `incomplete`.
- Persistence replaces only the targeted `quality_scored_text_fields` section, then upserts `profile_quality`.

Validated:
- `node scripts/test-public-auth-session.mjs && node scripts/test-public-profile-api.mjs && node scripts/test-public-profile-sections.mjs && node scripts/test-public-profile-service.mjs && node scripts/test-public-profile-repository.mjs && node scripts/test-public-profile-generation.mjs && node scripts/test-public-profile-quality.mjs && node scripts/test-public-profile-markdown.mjs && npx tsc --noEmit --incremental false`

## 2026-06-23 - Skills Inventory autosave route

Completed the sixth section-level profile autosave endpoint.

Implemented:
- `SkillsInventorySection` modeling, parsing, normalization, relationship validation, and aggregate application in `lib/public-profile/sections.ts`.
- Skills Inventory read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistSkillsInventorySection` in `lib/public-profile/repository.ts`.
- `handleSkillsInventorySectionGetRequest` and `handleSkillsInventorySectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/skills/route.ts` exposes authenticated `GET` and `PATCH` endpoints.
- Fixture-backed Skills Inventory coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Route contract:
- `GET /api/public-profile/skills` returns normalized Skills Inventory plus profile quality summary.
- `PATCH /api/public-profile/skills` accepts a full `skills` array replacement and returns the normalized saved section plus profile quality summary.
- Both endpoints require `Authorization: Bearer <supabase-access-token>`.
- Invalid payloads return `400`.
- Missing profile returns `404`.
- Missing/invalid auth returns `401`.
- Missing server config returns `503`.

Important behavior:
- PATCH validates `relatedProjectIds` against active proof objects and `relatedWorkHistoryIds` against active work history items before persistence.
- Repository persistence upserts active skills, deletes omitted skills because the launch schema has no `archived_at` column for `skill_profiles`, rewrites skill-to-proof and skill-to-work-history joins, and upserts `profile_quality`.
- PATCH does not regenerate markdown or create a profile version.

## 2026-06-23 - Proof Library autosave route

Completed the fifth section-level profile autosave endpoint.

Implemented:
- `ProofLibrarySection` modeling, parsing, normalization, and aggregate application in `lib/public-profile/sections.ts`.
- Proof Library read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistProofLibrarySection` in `lib/public-profile/repository.ts`.
- `handleProofLibrarySectionGetRequest` and `handleProofLibrarySectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/proof-library/route.ts` exposes authenticated `GET` and `PATCH` endpoints.
- Fixture-backed Proof Library coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Route contract:
- `GET /api/public-profile/proof-library` returns normalized Proof Library projects plus profile quality summary.
- `PATCH /api/public-profile/proof-library` accepts a full `projects` array replacement and returns the normalized saved section plus profile quality summary.
- Both endpoints require `Authorization: Bearer <supabase-access-token>`.
- Invalid payloads return `400`.
- Missing profile returns `404`.
- Missing/invalid auth returns `401`.
- Missing server config returns `503`.

Important behavior:
- PATCH persists `project_proofs` only; launch schema intentionally does not attach proof objects directly to Role Tracks.
- Repository persistence upserts active proof objects, archives omitted active proof objects, and upserts `profile_quality`.
- PATCH does not regenerate markdown or create a profile version.

## 2026-06-23 - Work History autosave route

Completed the fourth section-level profile autosave endpoint.

Implemented:
- `WorkHistorySection` modeling, parsing, normalization, attachment validation, and aggregate application in `lib/public-profile/sections.ts`.
- Work History read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistWorkHistorySection` in `lib/public-profile/repository.ts`.
- `handleWorkHistorySectionGetRequest` and `handleWorkHistorySectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/work-history/route.ts` exposes authenticated `GET` and `PATCH` endpoints.
- Fixture-backed Work History coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Route contract:
- `GET /api/public-profile/work-history` returns normalized Work History plus profile quality summary.
- `PATCH /api/public-profile/work-history` accepts a full `workHistory` array replacement and returns the normalized saved section plus profile quality summary.
- Both endpoints require `Authorization: Bearer <supabase-access-token>`.
- Invalid payloads return `400`.
- Missing profile returns `404`.
- Missing/invalid auth returns `401`.
- Missing server config returns `503`.

Important behavior:
- PATCH validates `associatedResumeIds` against active resumes before persistence.
- Repository persistence upserts active work history rows, deletes omitted work history rows because the launch schema has no `archived_at` column for `work_history_items`, rewrites current work-history-to-resume associations, and upserts `profile_quality`.
- PATCH does not regenerate markdown or create a profile version.

## 2026-06-23 - Resume Uploads autosave route

Completed the third section-level profile autosave endpoint.

Implemented:
- `ResumeUploadsSection` modeling, parsing, normalization, attachment validation, and aggregate application in `lib/public-profile/sections.ts`.
- Resume Uploads read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistResumeUploadsSection` in `lib/public-profile/repository.ts`.
- `handleResumeUploadsSectionGetRequest` and `handleResumeUploadsSectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/resumes/route.ts` exposes authenticated `GET` and `PATCH` endpoints.
- Fixture-backed Resume Uploads coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Route contract:
- `GET /api/public-profile/resumes` returns normalized Resume Uploads plus profile quality summary.
- `PATCH /api/public-profile/resumes` accepts a full `resumes` array replacement and returns the normalized saved section plus profile quality summary.
- Both endpoints require `Authorization: Bearer <supabase-access-token>`.
- Invalid payloads return `400`.
- Missing profile returns `404`.
- Missing/invalid auth returns `401`.
- Missing server config returns `503`.

Important behavior:
- PATCH validates `associatedRoleTrackIds` against active Role Tracks before persistence.
- Repository persistence upserts active resumes, archives omitted active resumes, rewrites current resume-to-role-track associations for active resumes, and upserts `profile_quality`.
- PATCH does not regenerate markdown or create a profile version.

## 2026-06-23 - Role Tracks autosave route

Completed the second section-level profile autosave endpoint.

Implemented:
- `RoleTracksSection` modeling, parsing, normalization, and aggregate application in `lib/public-profile/sections.ts`.
- Role Tracks read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistRoleTracksSection` in `lib/public-profile/repository.ts`.
- `handleRoleTracksSectionGetRequest` and `handleRoleTracksSectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/role-tracks/route.ts` exposes authenticated `GET` and `PATCH` endpoints.
- Fixture-backed Role Tracks coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Route contract:
- `GET /api/public-profile/role-tracks` returns normalized Role Tracks plus profile quality summary.
- `PATCH /api/public-profile/role-tracks` accepts a full `roleTracks` array replacement and returns the normalized saved section plus profile quality summary.
- Both endpoints require `Authorization: Bearer <supabase-access-token>`.
- Invalid payloads return `400`.
- Missing profile returns `404`.
- Missing/invalid auth returns `401`.
- Missing server config returns `503`.

Important behavior:
- PATCH uses full-section replacement semantics in the service result.
- Repository persistence upserts active Role Tracks, archives omitted active tracks, rewrites current resume associations for active tracks, and upserts `profile_quality`.
- PATCH does not regenerate markdown or create a profile version.

## 2026-06-23 - Shared public profile fixture

Added `scripts/fixtures/public-profile.ts` with a complete candidate profile aggregate factory and shared required quality-field helper.

Purpose:
- Stop duplicating large complete-profile objects across section tests.
- Provide a stable local seed shape for Role Tracks, Resume, Proof Library, and future section service tests.
- Keep fixture data out of production code while staying typechecked with the repo.

## 2026-06-23 - Identity/Search autosave route

Completed the first section-level profile autosave endpoint.

Implemented:
- `persistIdentitySearchSection` in `lib/public-profile/repository.ts` writes `candidate_profiles`, upserts `candidate_profile_preferences`, and upserts `profile_quality`.
- `handleIdentitySearchSectionGetRequest` and `handleIdentitySearchSectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/identity-search/route.ts` exposes authenticated `GET` and `PATCH` endpoints for the first onboarding section.
- `scripts/test-public-profile-repository.mjs` now verifies Identity/Search persistence write order, snake_case row shape, and upsert headers.
- `scripts/test-public-profile-api.mjs` now verifies Identity/Search found, missing, validation-error, and updated HTTP paths.

Route contract:
- `GET /api/public-profile/identity-search` returns the normalized Identity/Search section plus profile quality summary.
- `PATCH /api/public-profile/identity-search` accepts partial section updates and returns the normalized saved section plus profile quality summary.
- Both endpoints require `Authorization: Bearer <supabase-access-token>`.
- Invalid payloads return `400`.
- Missing profile returns `404`.
- Missing/invalid auth returns `401`.
- Missing server config returns `503`.

Important behavior:
- PATCH does not regenerate markdown or create a profile version. It updates structured profile data and profile quality only.
- Clearing required Identity/Search fields is allowed and transitions the profile to `incomplete`.
- Generated markdown remains internal to the explicit regeneration path.

## 2026-06-23 - Identity/Search section service boundary

Started the section-level profile editing layer without adding UI.

Implemented:
- `lib/public-profile/sections.ts` defines the Identity/Search section view model, patch parser, normalization rules, and in-memory aggregate application.
- `lib/public-profile/section-service.ts` wraps section parsing, aggregate loading, completion re-evaluation, and persistence delegation.
- `scripts/test-public-profile-sections.mjs` covers invalid payloads, enum validation, string/list normalization, clearing required fields into incomplete status, missing profiles, and persistence orchestration.

Important behavior:
- Required identity fields can be cleared, and clearing them transitions profile quality back to `incomplete`.
- Optional identity fields can be cleared with empty strings or null-like values.
- Employment type and remote preference values are enum-validated before service persistence.
- This is service-level only; repository persistence and authenticated GET/PATCH endpoints are the next backend step.

## 2026-06-23 - Authenticated profile regeneration route

Continued Phase 1 by adding the first public profile API route boundary.

Implemented:
- `lib/public-auth/session.ts` validates Supabase Auth bearer tokens through the Supabase Auth `/auth/v1/user` endpoint.
- `lib/public-profile/api.ts` maps auth, repository config, and profile regeneration outcomes into HTTP responses.
- `app/api/public-profile/regenerate/route.ts` exposes the authenticated `POST` route for profile regeneration.
- `scripts/test-public-auth-session.mjs` covers auth config, missing token, invalid token, and authenticated token paths.
- `scripts/test-public-profile-api.mjs` covers auth config errors, unauthorized requests, repository config errors, missing profiles, incomplete profiles, and successful regeneration.

Route contract:
- Request: `POST /api/public-profile/regenerate` with `Authorization: Bearer <supabase-access-token>`.
- Success: `200` with profile ID, complete status, version, and generated timestamp.
- Incomplete profile: `409` with incomplete reasons and weak fields; no generation is persisted.
- Missing profile: `404`.
- Missing/invalid auth: `401`.
- Missing server config: `503`.

Important boundary:
- The route does not return generated markdown. Markdown remains internal and is not a profile export surface.

## 2026-06-23 - Phase 1 TODO and regeneration service boundary

Continued the public app foundation pass from the unified `dumpster-fire-llc` repo.

Implemented:
- `docs/project-todo.md` as the operational task list derived from the roadmap and product epics.
- `lib/public-profile/service.ts` as the framework-neutral public profile regeneration service boundary.
- `scripts/test-public-profile-service.mjs` and `scripts/test-public-profile-service.ts` covering complete, incomplete, and missing-profile regeneration paths.

Important behavior:
- Complete profiles regenerate markdown, increment version history, and persist through the repository seam.
- Incomplete profiles return diagnostic `ProfileQuality` and do not persist a generated profile version.
- Missing profiles return `not_found` without attempting persistence.
- No Next.js route was added because the authenticated public user ID strategy still needs to be explicit.

Validation:
- `node scripts/test-public-profile-service.mjs`
- `node scripts/test-public-profile-repository.mjs`
- `node scripts/test-public-profile-generation.mjs`
- `node scripts/test-public-profile-quality.mjs`
- `node scripts/test-public-profile-markdown.mjs`
- `npx tsc --noEmit --incremental false`
- `npm run build`
- `npm run lint`

Known validation note:
- `npm run lint` passes with five warnings in ported legacy `/scans` files. No Phase 1 public profile files produce lint warnings.

## 2026-06-23 - Public repo unified

Unified the public Dumpster Fire LLC source of truth into the deployment-connected repo:

`/Users/randallfransen/Sites/dumpster-fire-llc`

This repo owns the GitHub remote, Vercel project linkage, public app foundation, schema docs, migrations, scripts, and `/scans` private dashboard port. The temporary duplicate folder `thejobmarketisadumpsterfire.com` is no longer the active source of truth.

## 2026-06-23 - Profile completion engine

Continued Phase 1 with the planned pure TypeScript profile completion engine.

Implemented:
- `lib/public-profile/profile-quality.ts` evaluates a `CandidateProfileAggregate` into `ProfileQuality`.
- `lib/public-profile/profile-generation.ts` evaluates quality, mirrors `candidate_profiles.status`, regenerates markdown, creates a profile-version draft, and returns snake_case persistence rows for future Supabase writes.
- `lib/public-profile/repository.ts` maps public Supabase rows into `CandidateProfileAggregate`, loads aggregate data by user ID through an injectable REST request function, and persists generation rows back to `candidate_profiles`, `profile_quality`, and `profile_versions`.
- `scripts/test-public-profile-quality.mjs` covers complete profiles, weak required quality fields, broken Role Track/resume relationships, weak resume parsing, and missing liked/hated writing samples.
- `scripts/test-public-profile-generation.mjs` covers complete and incomplete regeneration paths plus persistence-row shape.
- `scripts/test-public-profile-repository.mjs` covers row mapping, persistence write order, upsert headers, and aggregate loading through a fake repository request.

Important behavior:
- `candidate_profiles.status` remains the operational gate; generated `ProfileQuality` is diagnostic detail.
- Profile completion is binary: any missing required launch field or weak required quality-scored answer returns `incomplete`.
- Required quality-scored sections use the field keys from `docs/candidate-profile-schema.md`.
- Every regeneration increments or accepts an explicit profile version and produces a matching `profile_versions` insert draft.
- Public profile repository code is service-level only; no public profile UI has been started.

## 2026-06-23 - Session sync and next steps

Completed a full end-of-session sync for the public build.

Added missing ingested source docs:
- `docs/public-product-build-epics.md`
- `docs/database-data-model-spec.md`
- `docs/onboarding-ux-spec.md`
- `docs/pursuit-workflow-spec.md`

Added `docs/next-session.md` as the restart handoff for the next work session.

Recommended next implementation task:
- Continue Phase 1 by wiring profile-quality evaluation into the profile persistence/generation path before any UI work.

## 2026-06-23 - Phase 1 foundation started

Started Phase 1 only after reviewing the source specs.

Implemented:
- `docs/spec-review-phase-1.md` with contradictions, missing implementation details, and Phase 1 adjustments.
- Public foundation migration `supabase/migrations/20260623000100_public_foundation_schema.sql`.
- Auth configuration contract in `lib/public-auth/config.ts`, assuming Supabase Auth for Google, Apple, and Email.
- Public profile TypeScript contracts in `lib/public-profile/types.ts`.
- Structured profile to generated markdown service in `lib/public-profile/profile-markdown.ts`.
- Focused markdown generation fixture `scripts/test-public-profile-markdown.mjs`.

Important boundaries:
- Full OAuth/login UI was not implemented because provider setup and credentials are external.
- Resume parsing, quality scoring, onboarding UI, profile management UI, matching, Human Path, outreach generation, subscription enforcement, and landing-page redesign remain outside Phase 1 work completed here.
- Public schema intentionally avoids cover-letter objects even though the legacy private `/scans` schema still contains old private cover-letter storage.

## 2026-06-23 - Implementation roadmap ingested

Added the public Implementation Roadmap and Dependency Map as `docs/implementation-roadmap.md`. This is reference documentation only; no product implementation was started.

Key decisions captured:
- Build foundation before UI, workflows before outreach, and matching only after profile data exists.
- Phase 1 is auth, database objects, and profile generation.
- Phase 2 is onboarding and profile completion enforcement.
- Phase 3 is profile management.
- Phase 4 is matching and hard exclusions.
- Phase 5 is saved jobs and pursuits.
- Phase 6 is Human Path, identified as the moat.
- Phase 7 is outreach and usage metering.
- Phase 8 is subscription enforcement and upgrade states.
- Phase 9 is public landing/pricing/auth routing.
- Launch scope requires auth, profile creation/editing, matching, pursuits, contacts, outreach, subscriptions, and landing page.

## 2026-06-23 - Subscription enforcement matrix ingested

Added the public Subscription Enforcement Matrix as `docs/subscription-enforcement-matrix.md`. This is reference documentation only; no billing or metering implementation was started.

Key decisions captured:
- Do not meter search, browsing, profile viewing, saved jobs, or dashboard usage.
- Meter Human Path generation, outreach generation, and Pursued Jobs Export.
- Human Path usage is consumed only when Generate Human Path is clicked.
- Outreach usage is consumed per generated message for selected contacts.
- Pursued Jobs Export is Pro-only.
- Upgrade prompts should be benefit-led and avoid fake urgency, countdowns, hidden limits, and dark patterns.
- Failed billing freezes generation and Pursued Jobs Export actions but preserves login, search, saved jobs, dashboard, and profile editing.

## 2026-06-23 - Matching engine spec ingested

Added the public Matching Engine specification as `docs/matching-engine-spec.md`. This is reference documentation only; no product implementation was started.

Key decisions captured:
- Matching optimizes for quality pursuits, not application volume.
- Users see match buckets, not numeric scores.
- Hard exclusions stay visible with clear explanatory messaging.
- The engine recommends exactly one Role Track and one resume; user override always wins.
- Project recommendations are capability-driven, not title-driven.
- Every job should include specific risks and transparent why-matched / why-not-matched reasons.
- Posting freshness and Easy Apply affect prioritization but do not disqualify roles.
- Incomplete profiles block pursuit generation; weak profile sections reduce confidence.

## 2026-06-23 - Profile management modal spec ingested

Added the public Profile Management modal specification as `docs/profile-management-modal-spec.md`. This is reference documentation only; no product implementation was started.

Key decisions captured:
- Onboarding creates the profile; Profile Management maintains it.
- The editor is a full-screen modal with left section navigation and right-side editor content.
- Users edit structured fields only; generated markdown regenerates automatically.
- Profile status, last updated, version, and quality issues remain visible.
- Every edit autosaves; no Save button.
- Regeneration is debounced and triggered by meaningful profile changes, not every keystroke.
- Future hooks are reserved for interview prep, company research, response tracking, outreach performance, and profile analytics, but not built for launch.

## 2026-06-23 - Candidate profile schema ingested

Added the public Candidate Profile schema brief as `docs/candidate-profile-schema.md`. This is reference documentation only; no product implementation was started.

Key decisions captured:
- Candidate Profile status is binary: `incomplete` or `complete`.
- Incomplete profiles block pursuit generation, outreach generation, contact research, role fit messaging, and proof selection.
- Structured profile data is the source of truth; markdown is generated internally and is not exported as a profile artifact.
- Projects are capability-driven proof objects, not title-bound proof objects.
- Resume parsing generates work history; users correct parsed work history instead of entering it from scratch.
- Launch schema excludes cover letters, deep company research, interview prep, generic chat coaching, speaking engagements, and side-project categories.

## 2026-06-23 - Public site provisioned

Provisioned the standalone public-site repository for `www.thejobmarketisadumpsterfire.com`.

- Public root `/` is a minimal holding page until the source markdowns are ingested and the landing page is designed.
- Private scan workflow is ported to `/scans` from the working Dumpster Fire implementation.
- Match tuning remains available at `/scans/admin/tuning`.
- Scan APIs are retargeted under `/scans/api/*`.
- Access is code-gated by default through `DUMPSTER_FIRE_ACCESS_CODE` and `DUMPSTER_FIRE_SESSION_SECRET`; production fails closed if either value is missing.
- Supabase schema and migrations are copied into `supabase/`.
- Focused Dumpster Fire scripts and fixtures are copied into `scripts/` and retargeted to `app/scans`.

Validation:
- `npx tsc --noEmit`
- `node scripts/test-dumpster-fire-salary.mjs`
- `node scripts/test-dumpster-fire-scan-log-display.mjs`
- `npm run build`
- Local screenshot pass for `/` and `/scans` at desktop/mobile sizes

Follow-up:
- Ingest source markdowns for the public landing page and positioning.
- Define public profile route shape and privacy boundaries before exposing profile data.
- Decide deployment project/env ownership before connecting production Supabase or scheduled scans.

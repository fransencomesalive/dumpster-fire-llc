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

**Update 2026-07-05 — onboarding auth surface shipped (prod `153dbd4`).** The round-4
onboarding auth DS cards are now built into the live page: login-only signed-out state
(no dead Save buttons), account panel (email + plan chip + access code), persistent
right-column **sections rail** (new approved DS card `onboarding-sections-rail.html`),
save-blocked review panel, Profile Readiness card removed, shared `SiteHeader` on `/` +
`/onboarding`, and `GET /api/account/plan`. See completion-roadmap Phase 0 item 5 (done)
and Phase 3 item 5 (built). **NOT yet verified live: the signed-in state** (needs a real
session — ties to the Google sign-in end-to-end test).

**Reconciled 2026-06-30.** The backend across Phases 4–8 is built and tested (Codex + Claude). Prod
schema is fully migrated; source scan is live (16 sources, ~2100 jobs) with a daily cron; per-user
scans rank by match score; the subscription_plans RLS finding is fixed.

What actually remains splits three ways:
1. **Design-gated UI** (the bulk): pursuit dashboard/list/detail, match results surfacing, outreach
   review workflow, subscription upgrade states, profile-management editor follow-ups, onboarding
   quality UI, landing + pricing pages. All need an approved design source before edits (AGENTS.md
   Design Authority + `docs/design-state.md`).
2. **Decision-blocked:** Human Path contact-discovery provider; billing provider + webhooks;
   resume storage/parsing provider; Google/Apple OAuth.
3. **Unblocked backend** (small): pre-launch copy/scaffold audit (Phase 9 verify item); profile
   regeneration action wiring; outreach version pruning, etc.

Next-task selection should pick from #3, or move into #1 once Randall provides/approves design.

## Near-Term (scheduled)

- [ ] **CRITICAL — Randall: repoint the custom domain (found 2026-07-04).**
  `www.thejobmarketisadumpsterfire.com` + apex serve the Lab26 project (all real routes
  404; homepage is a ~9-day-old edge-cached copy). The current app is live at
  `https://dumpster-fire-llc.vercel.app`. In the Vercel dashboard, attach the domains
  to the `dumpster-fire-llc` project / promote the latest deployment, then verify
  `/onboarding` returns 200 on the custom domain. Blocks launch invites and the QA
  widget on the public domain. Details in `docs/current-state.md` (2026-07-04 entry).

### QA feedback relay — end-to-end go-live (added 2026-07-04)

The widget + proxy shipped 2026-07-02 (`docs/qa-feedback-widget-integration-2026-07-02.md`
has the full map). Until these are done, production submits fail soft with the friendly
error — nothing breaks. In order:

- [ ] **Deploy the relay publicly** — `~/Sites/dumpster-fire-relay` is a standalone Node
  service (Dockerfile included); it needs a persistent process, so Railway/Fly/VPS, not
  Vercel serverless. Randall picks the host; then set `HOST=0.0.0.0` + `PUBLIC_BASE_URL`
  in the relay `.env`. For durable storage add `DATABASE_URL` and run `npm run db:prepare`
  (the JSON file store loses data on redeploy).
- [ ] **Randall: create the Telegram bot via BotFather** (manual, cannot be automated) —
  display name `the-job-market-is-a-dumpster-fire-phred`, username
  `@TheJobMarketIsADumpsterPhredBot`. Run `npm run telegram:handoff` in the relay app for
  the exact walkthrough, then set `TELEGRAM_BOT_TOKEN_THE_JOB_MARKET_IS_A_DUMPSTER_FIRE`
  in the relay `.env`.
- [ ] **Randall: wire owner notifications** — message the bot once, then in the relay app
  run `npm run telegram:admins -- --write true` (captures the admin chat id) and
  `npm run telegram:setup` (registers the webhook; requires `PUBLIC_BASE_URL` live).
- [ ] **Set `QA_AGENT_URL` on Vercel** (production + preview) to the deployed relay URL,
  redeploy, submit real feedback from the production site, and confirm the ticket lands
  (`GET /api/tickets` on the relay) plus the Telegram notification arrives.
- [ ] **Give the relay a git home** — `~/Sites/dumpster-fire-relay` has no repo/remote yet
  (cross-machine sync gap). `git init`, GitHub remote, verify `.env` and `data/` stay
  gitignored before the first push.
- [ ] Optional: set `GITHUB_TOKEN` in the relay `.env` so approved tickets can open GitHub
  issues on `fransencomesalive/dumpster-fire-llc`.

- [x] **Apply `20260626000100_public_job_scan_results.sql` to production** — DONE 2026-06-28.
  `job_scan_results` table created with RLS; migration history reconciled (both `...626` and the
  A4 `...627` now recorded in `supabase_migrations`). See `docs/database-migration-state.md`.
- [ ] **Rotate exposed credentials before sending invites / full launch** — Supabase
  service_role + anon keys, DB password, and `ANTHROPIC_API_KEY` were entered locally on
  2026-06-28 and surfaced in a chat transcript. `ANTHROPIC_API_KEY` surfaced again 2026-06-30
  while fixing a malformed `.env.local`. Deferred by Randall to invite time. (The
  `SUPABASE_ACCESS_TOKEN` added 2026-06-30 stays in `.env.local` only; revoke/rotate it too at
  cleanup time.)

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

## Phase 4 — Matching Engine  (BACKEND DONE — `lib/public-profile/matching/`)

- [x] Add role fit evaluation service. (`engine.ts` `evaluateMatch` + `scorers.ts`)
- [x] Add Role Track recommendation. (`recommend.ts`)
- [x] Add resume recommendation. (`recommend.ts`)
- [x] Add proof object recommendation. (work-example recommendation, `recommend.ts`)
- [x] Add risk and mismatch explanation. (`MatchResult.risks/whyNotMatched/explanation`)
- [~] ~~Add hard exclusion handling~~ — SUPERSEDED: Randall chose soft negative signals, not hard
  drops (salary floor / remote / avoided companies are soft). See matching-spectrum decision.
- [x] Add matching fixture tests. (`scripts/test-public-profile-matching`)
- [x] Wire `evaluateMatch` into per-user scan-result ranking/annotation. (2026-06-30)
- [ ] Surface match results in UI (design-gated).

## Phase 5 — Pursuit Workflow

- [x] Add user-scoped Jobs scan-result API/UI using current profile search requirements.
- [x] Add Saved Jobs as "pursue later" only, separate from pursuit creation.
- [x] Add save/unsave route for active user scan results.
- [x] Apply public job scan results migration to Supabase. (2026-06-28)
- [x] Feed the public `jobs` table via the Scan paradigm — LIVE (2026-06-30). Independent
  `lib/scan/sources/` engine (all providers) + `runSourceScan` + `job_sources` (migration applied to
  prod) + scheduled `GET|POST /api/jobs/source-scan` (CRON_SECRET set in Vercel + daily cron). 16
  sources seeded; first run upserted ~2105 jobs; per-user scans rank by `evaluateMatch`. Curate
  `job_sources` anytime (see `docs/scan-sources-setup.md`).
- [ ] Wire external connector ingestion into the per-user scan flow if desired (currently source
  scan fills the shared pool on a schedule; per-user `/api/jobs/scan` reads + ranks it).
- [x] Add Pursuits. (backend: create/state machine + read/list API)
- [x] Add pursuit stages for review, Human Path, contacts, outreach, and tracking. (backend API slices)
- [x] Add pursuit read/list API for dashboard consumption: `GET /api/public-profile/pursuits` (list + counts) and `GET /api/public-profile/pursuits/[id]` (full detail). (2026-06-29)
- [ ] Keep Saved Jobs free and separate from metered Pursuits.
- [x] Add pursuit state tests.
- [ ] Build pursuit dashboard/list/read UI (design-gated).

## Phase 6 — Human Path Engine  (BOUNDARY DONE — `lib/public-profile/pursuits/human-path.ts`)

- [x] Add contact discovery provider boundary. (`HumanPathProvider` seam; default
  `unavailableHumanPathProvider`)
- [x] Add hiring manager, functional leader, recruiter, and executive sponsor contact types.
  (`HumanPathContact` types)
- [x] Add confidence scoring and reasoning. (contact confidence + reason fields in the contract)
- [x] Add Human Path usage ledger integration. (`human_path` usage events)
- [ ] **BLOCKED (decision):** choose + integrate a real contact-discovery provider. Until then the
  provider degrades gracefully (provider_unavailable). Contact ranking by company context lands with
  the real provider.

## Phase 7 — Outreach Generation  (BACKEND DONE — `lib/public-profile/outreach-generator.ts`)

- [x] Add message generation service. (`outreach-generator.ts`, injected callModel, graceful no-key)
- [x] Generate contact-specific outreach from profile, role track, resume, work example, contact type.
- [x] Add outreach version/history storage. (`outreach_messages` + `saved_message_feedback`)
- [x] Add outreach usage ledger integration. (`outreach_message` usage events)
- [x] Add fixture tests for tone, proof selection, and contact specificity.
  (`scripts/test-public-profile-outreach`)
- [ ] Outreach UI + review workflow (design-gated).

## Phase 8 — Subscription System  (ENFORCEMENT DONE — `lib/public-profile/subscription/`)

- [x] Implement Tester, Basic, and Pro plan rules. (`rules.ts`)
- [x] Enforce pursuit limits. (`enforcement.ts`)
- [x] Enforce Human Path limits.
- [x] Enforce outreach limits.
- [x] Enforce Pursued Jobs Export gate. (data-returning enforcement)
- [ ] Add upgrade states for limit reached and Pursued Jobs Export locked (UI, design-gated).
- [ ] **BLOCKED (decision):** billing provider + webhook processing.

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

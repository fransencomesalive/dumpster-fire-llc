> **SUPERSEDED for design state / design scope — see `docs/design-state.md` (canonical).**
> The "Hard Prohibitions" and "do not touch tokens/fonts/onboarding/dashboard CSS" sections
> below predate Randall's approval of the design phase (2026-06-26). Those surfaces are now
> IN scope under `docs/design-state.md`. This file remains valid for product/state protocol.

# Project Operating State

Date: 2026-06-26
Repo: `/Users/randallfransen/Sites/dumpster-fire-llc`
Purpose: single control point for understanding status, choosing the next task, and preventing scope jumps.

## Session Start Protocol

When a session begins, or when Randall says "pick up where we left off", do this before proposing or editing anything:

1. Run `git status --short --branch`.
2. Report whether dirty files are docs-only or include app/code/design files.
3. Check whether a localhost server is running only if Randall asks for a running app or visual proof.
4. Read this file, `AGENTS.md`, `docs/current-state.md`, `docs/project-todo.md`, `docs/public-product-gap-build-plan-2026-06-26.md`, and `docs/session-branch-map.md`.
5. Name the single next task and the exact files that would be touched.
6. Confirm the active branch and workflow ownership before editing anything.
7. Use the short reminder phrase `session check` if you need a quick state reset before work.
8. Treat prompts mentioning branch work, session ownership, parallel work, parallel sessions, or simultaneous work as a signal to follow this workflow.
9. Stop for approval before edits unless Randall explicitly named the exact task and target files.

Do not treat handoff docs, roadmap docs, design docs, or "recommended next sequence" sections as authorization to edit. They are context until Randall approves a scoped task.

## Current Git State

As of this file's creation:

- Branch: `main`, ahead of `origin/main` by 1 commit.
- Dirty state before this file was added: docs/instructions only.
- Existing dirty/untracked docs at that point:
  - `AGENTS.md`
  - `docs/current-state.md`
  - deleted `docs/macbook-air-restart-handoff-2026-06-26.md`
  - `docs/restart-handoff.md`
- No app/code/design files were dirty after the reverted design pass.
- No localhost server was running on port `3020`.

Every future session must re-check these facts. Do not assume this section is still current.

## Current Product Build State

Built or partly built:

- Public profile foundation and authenticated public profile APIs.
- `/onboarding` editable profile sections for all required profile areas plus optional Leadership Profile.
- Binary profile completion routing for no profile, incomplete profile, and complete profile.
- `/dashboard` profile-complete destination with profile editor scaffold.
- User-scoped public Jobs/Saved Jobs scaffold:
  - `GET /api/jobs`
  - `POST /api/jobs/scan`
  - `POST /api/jobs/save`
  - dashboard Jobs list and Saved Jobs panel
- Public matching backend:
  - framework-neutral matching engine
  - `POST /api/public-profile/match`
- Public pursuit backend foundation:
  - pursuit state machine and event persistence
  - create/review/Human Path boundary/contact selection/outreach/status/lifecycle APIs
  - contact-selection and outreach-message persistence migrations
- Subscription enforcement backend:
  - Tester/Basic/Pro plan rules
  - Human Path and outreach limit checks
  - Pursued Jobs Export gate as data-returning enforcement
- Private `/scans` remains legacy-active private machinery and is not public-product completion.

Not yet built as public workflows:

- Public matching UI.
- Pursuit dashboard/list/read workflow UI.
- Public outreach UI and review workflow.
- Billing provider, checkout, portal, and webhooks.
- Pursued Jobs Export backend.
- Final launch landing page and pricing page.
- Production OAuth polish.
- Resume upload storage and parsing provider path.

## Current Route Map

- `/`: public homepage. Protected recovery surface; do not revise copy/layout unless explicitly asked.
- `/onboarding`: public profile setup and editing flow. Next product work is quality-remediation guidance, not redesign.
- `/dashboard`: complete-profile destination with profile editor and Jobs/Saved Jobs scaffold.
- `/api/public-profile/*`: public profile section APIs.
- `/api/jobs*`: public Jobs/Saved Jobs scaffold APIs.
- `/scans`: private legacy-active dashboard. Useful reference only; do not count as public app completion.

## Canonical Next Product Task

> **UPDATED 2026-08-05: JOB-031 REVIEW HANDOFF LIVE; APP FIX PENDING.** Portable QA-AGENT `0.3.4`
> moves approve, discard, and rerun actions from the hosted relay to the connected worker that owns
> the checkout and patch. Factory commit `921529f` is local-only; installed relay commit `b808b76`
> is deployed successfully by Railway as `e2f3f12a-0b84-4508-a013-a482d4fc58a8`, with migration
> 010 applied and production health/readiness green. JOB-031 crossed that path successfully; its
> next execution blocked on missing runtime evidence rather than patch handling. Independent
> production checks disproved the archived snapshot-precedence patch and found stale external-link
> availability instead: confirmed-gone postings remain marked active. The application behavior is
> **NOT FIXED**. Read `docs/next-session.md`; the next scoped product task is a universal backend
> link-health lifecycle that distinguishes confirmed-gone postings from uncertain provider
> responses. Do not apply the archived JOB-031 patch.

> **UPDATED 2026-08-05: RECOVERABLE QA INVESTIGATIONS LIVE.** Portable QA-AGENT `0.3.3` is at
> local factory commit `e49180b`; installed relay commit `b40a2a1` is deployed by Railway as
> `8d4f815c-6fde-4e16-9949-fa7eab1f3f26` with migration 009 applied. App commit `770a9e6` is
> live in Vercel deployment `dpl_3ELBKTA7JDb2QGWUDg22o5V5UCNC`. Failed and blocked investigations
> now retain structured evidence and any patch, executor crashes salvage partial changes, missing
> worker dependencies self-provision from the lockfile, and future reports carry privacy-safe API
> failure breadcrumbs. JOB-030 attempt 2 correctly ended blocked because its original report lacks
> runtime request evidence; the outreach product failure remains NOT ROOT CAUSED. The Air worker is
> clean, dependency-ready, current, and idle. Read `docs/next-session.md` and wait for a new real
> occurrence carrying the added API evidence rather than approving the archived speculative patch.

> **UPDATED 2026-08-05: DURABLE HOSTED QA RELAY LIVE.** Production feedback intake, Postgres state,
> signed reply delivery, and Telegram callbacks now run on Railway at
> `https://qa-relay-production.up.railway.app`. Railway's GitHub app is authorized for private
> repository `fransencomesalive/dumpster-fire-relay`, service `qa-relay` tracks `main`, and
> automatic deployment `c3ccf7cd-7b66-4188-8d65-34ca5dbf85a6` successfully deployed `d3b6694`
> with the checked-in Dockerfile, database preparation, and health check. Vercel production
> deployment `dpl_8no8zmng3N1WbKw5JKK7Ksqe8QoL` uses the Railway URL; live
> JOB-027 persisted, delivered its Telegram card, accepted a real close callback, and remains
> closed in Postgres. The connected executor is accurately identified as `macbook-air-codex`, not
> Studio. Relay availability no longer depends on the Air, but coding-agent execution still does
> until another worker is installed. The Railway workspace is on an active paid Hobby subscription,
> no longer trialing, with its next invoice scheduled for 2026-09-05 14:46:36 UTC. Supabase signup
> email capacity is live at 30/hour. Read
> `docs/next-session.md`. The remaining optional infrastructure follow-up is worker installation
> on Studio or another persistent host.

> **UPDATED 2026-08-04: JOB-024 PROMPTED REPLY EDITING LIVE.** Portable QA-AGENT `0.3.1` is
> committed locally at `d0f4b09` and the installed relay is pushed on `origin/main` at `64f1b83`.
> Pending reply previews now expose **Edit reply**, which opens Telegram's native reply prompt and
> returns the revised draft with Send/Edit/Discard actions. Both full suites and generated-install
> verification passed; the relay was restarted; local/public health and production verification
> passed; and disposable live JOB-025 verified the complete edit path without sending email. The
> running JSON relay is the sole state authority: never mutate its backing file from another
> process. Read `docs/next-session.md` and wait for Randall's next explicit scope.

> **UPDATED 2026-08-04: JOB-023 DURABLE MULTI-CONTACT OUTREACH LIVE.** Commit `e06f62d`
> is on `origin/main`, GitHub Actions run `30963015735` passed, and Vercel deployment
> `dpl_4eGgfQbfyxSfGnbisLMMiWBk4e96` serves the canonical domain with HTTP 200. Same-job drafts are
> soft variation context, successful contacts persist independently, and retries generate only
> missing selected contacts. An authenticated production journey verified two independent contact
> messages, a recreated partial state, preserved success, missing-only retry, five responsive
> breakpoints, zero browser errors, and complete disposable cleanup. No JOB-023 implementation
> remains in flight. Read `docs/next-session.md` and wait for Randall's next explicit scope.

> **UPDATED 2026-08-04: SPECIALIZED ROLE SCAN CORRECTION LIVE.** Commit `39d5a08` is on
> `origin/main`, GitHub Actions run `30950560309` passed, and Vercel production deployment
> `dpl_Y7L9f1MN8iwWV9hL8grEfAhUiky2` returns HTTP 200. Compound marketing/creative project titles
> now retain their functional specialty instead of activating the unrestricted program/project
> lane. Successful scans replace the active recommendation snapshot and include structured job
> sections. Larissa's current production profile was replayed and rebuilt from 84 to 75 active
> rows; independent readback found zero generic program/project-lane jobs. The required disposable
> authenticated scan persisted and re-rendered 75 results and cleaned every QA row. No work remains
> in flight. Read `docs/next-session.md` and wait for Randall's next explicit scope.

> **UPDATED 2026-08-04: SCAN AND OUTREACH FEEDBACK CORRECTIONS LIVE.** Commit
> `a42a84936c94e206c68e19c3895b422aa26327fc` is on `origin/main`, GitHub Actions run
> `30947750248` passed, and Vercel production deployment
> `dpl_pKJEa7VfbEzf4XnnpoWP5uM42p6y` returns HTTP 200. A read-only audit passes all nine current
> scan-feedback and both current outreach-feedback records. Required authenticated production scan
> verification persisted and re-rendered 75 matches from a zero-result disposable account, then
> cleaned up every row. No fresh paid provider outreach was generated; that remains NOT VERIFIED
> without explicit authorization. No implementation work remains in flight. Read
> `docs/next-session.md` and wait for Randall's next explicit scope.

> **UPDATED 2026-08-04: JOB-021 / JOB-022 LIVE.** Implementation commit `d24b4d1` is on
> `origin/main`; the current release is `8230668` in Vercel production deployment
> `dpl_HEBdGpPVgT3WAvUUfzQTYh8yiUmx`. GitHub Actions run `30942635468` passed and the canonical
> domain returned HTTP 200. Production migration
> `20260804000100` is applied. An authenticated disposable-account journey verified real
> `no_preference` persistence and database readback, quiet resume/intermediate saves, blockers on
> the final completion attempt, responsive geometry at every required breakpoint, and complete
> cleanup. Remote Claude Design registration remains NOT VERIFIED.
>
> **UPDATED 2026-08-04: PORTABLE QA LIFECYCLE LIVE.** The `QA-AGENT` factory is version `0.3.0` at
> local commit `35bca55` and the installed relay is pushed on `origin/main` at `9666a36`. Workers
> claim available work, synchronize the clean clone to current `origin/main` before agent execution,
> fail closed if synchronization cannot be proven, and recheck freshness at completion. Stale work
> cannot be approved and can be archived and rerun on current main. Generated-install verification,
> both full suites, public relay HTTP 200, the complete production verifier, and live Telegram
> callback verification passed. The factory has no Git remote; its commit is local only. The
> optional Claude worker remains unavailable because its configured binary is absent; the active
> Codex worker is connected. Read `docs/next-session.md` for exact evidence.
>
> **UPDATED 2026-08-04: OUTREACH CORRECTION LIVE.** Commit `3504a87` fixes the reported Dropbox
> outreach failure and is live in Vercel production deployment
> `dpl_Ho7y9XKsEMSg1K64oca7Fy4TAaPk`. Outreach now includes structured Responsibilities and Required
> Experience in job-specific evidence ranking and prompting, requires a supported matched
> requirement to appear in the draft, and detects repeated rhetorical structure as well as repeated
> wording. Exact production-data verification selected R.E.C.O.N. and matched the Dropbox AI
> requirement; it used a local stub and did not persist or purchase a fresh provider generation.
> Begin with `docs/next-session.md` and wait for Randall's next explicit scope.
>
> **UPDATED 2026-08-04: CURRENT RELEASE STATE.** Outreach now uses universal job-aware work-example
> ranking plus recent-message diversity from each user's current profile; blocked job links have an
> exact-posting indexed fallback; and dashboard Responsibilities / Required Experience lists expand
> and collapse together. The combined release is `b7f2c999e5cef2d5229af43e0c90c096a08cd7c3`, live as
> `dpl_6AguuiHqmenUVXmJXYtKYuvGSYP8`. The exact reported Indeed URL and the paired expansion behavior
> were production-verified with disposable cleanup. No implementation work from this release is in
> flight. Start with `docs/next-session.md`, run `session check`, and wait for Randall's next explicit
> scope rather than automatically beginning an older queued task.
>
> **UPDATED 2026-07-28: CURRENT IMMEDIATE TASK.** The first-user production scan blocker is fixed
> and verified through the real authenticated dashboard control with the legacy token mirror
> deliberately absent. The final production run returned, persisted, and re-rendered 75 matches;
> Larissa's named account was remediated to 75 active results. The next planned product phase is
> Phase 4 Markdown export. Begin with `docs/next-session.md`, require explicit scope before
> implementation, and do not expand into live Stripe configuration or production enablement.
> Next.js `16.2.12` security maintenance is separately recorded and must not be silently folded
> into unrelated feature work.
>
> **UPDATED 2026-07-25 — CURRENT IMMEDIATE INITIATIVE.** The Smoldering / Roaring subscription,
> Apply Wizard metering, cost telemetry, Markdown export, Stripe billing, public pricing, legal,
> design, migration, QA, and production-release initiative is approved and specified in
> `docs/subscription-billing-production-plan-2026-07-24.md`. Smoldering is $22/month for 20
> successful new Apply Wizard pursuits. Roaring is the $32/month top plan with 45 pursuits and
> Markdown history export. No free retail tier or membership fee. Phase 1 code is on `origin/main`
> at `3a3453d`; the 2026-07-25 live preflight confirmed its migrations `20260724000200` through
> `20260724000500` are applied and recorded in production. Claude's pricing cards are approved and
> synced at `c536002`. Phase 2A is on `origin/main` at `4b4c02e`; migration
> `20260724000600` was applied, recorded, and postflight-verified on 2026-07-25. Phase 2B
> compatibility code is deployed at `b76e7f8` behind `BILLING_ENABLED`; production now runs with
> the flag enabled after a controlled authenticated test passed. Randall decided on 2026-07-25
> that the three active pre-Stripe `premium` subscriptions are
> internal `access_code` entitlements. Migration `00600` and its harness encode that decision.
> Phase 2C is implemented, applied, recorded, postflight-verified, and authenticated-production
> verified as `20260725000100_outreach_metering_removal.sql` plus its compatible billing-enabled
> app update. One explicitly authorized retry verified initial outreach, idempotent replay, one
> in-place regeneration, rejection of a second regeneration, zero retired debit rows, retained
> telemetry, and complete disposable cleanup. The immediate task is the backend-only Phase 3
> Stripe test-mode implementation. Start from `docs/next-session.md`; do not rewrite the applied
> migrations or configure live Stripe.
>
> **UPDATED 2026-07-24.** The Human Path Exa provider, approved Apply Wizard accuracy copy,
> production environment, contact-type migration, and persisted-contact-ID handoff are live and
> verified through an authenticated production pursuit. Discovery returned 19 exact-company
> LinkedIn contacts across four classifications; contact selection and outreach succeeded; all
> disposable QA data was deleted. Remote registration of the touched Apply Wizard card in Claude
> Design was subsequently completed and its readback verified. This release has no remaining work
> unless a new failure is observed. No additional provider refinement or production test is
> authorized without such evidence. See
> `docs/next-session.md` and
> `docs/human-path-retrieval-architecture-plan-2026-07-22.md`.
>
> **UPDATED 2026-06-28.** Phase D **design pass is COMPLETE** — the four new onboarding controls
> (tone chips, writing-sample buckets, type-ahead pickers, Q1/Q4) are designed, approved, and live
> as cards in the Claude Design "Onboarding" group. D3 catalogue backend merged + pushed (`dc3015c`).
> **Next task = `OnboardingClient.tsx` implementation.** START at `docs/phase-d-implementation-handoff-2026-06-28.md`.
>
> (Prior) The generator-redesign **backend spine (Phases A–E) is COMPLETE and tested** — see
> `docs/generator-redesign-implementation-plan-2026-06-26.md` (A1–A5, B1–B4, C, E all checked off).
> Test suite 11/11 green; `tsc` clean except `app/onboarding/OnboardingClient.tsx`.

**Next session kicks off Phase D — onboarding UI — and starts with Claude design / design-system
updates (Randall).** Phase D is **design-gated** (AGENTS.md Design Authority): D0 (design direction)
must be resolved before any onboarding/dashboard UI, CSS, token, or public-copy edit. `OnboardingClient.tsx`
still uses the old section shapes and must be rebuilt to the new ~7-section IA (Voice & Personality:
Q1/Q4 + 3-bucket samples + word counter + tone tags; Work Examples: title/oneHitter/link/context).

**Randall's answers (2026-06-27), to honor next session:**
- Phase D will begin with the Claude design system updates.
- **D3 catalogue research is already done & approved** (`onboarding-redesign-spec-2026-06-26.md` §7:
  Lightcast skills, industries, GeoNames locations). Leverage it. The data/lib/API layer can be
  delegated to Codex (see below) to free Claude for the UI/design work.
- **ANTHROPIC_API_KEY (Phase C1):** Randall has it; will provide safely on request (env only). Until
  set, voice fingerprint + outreach generator degrade gracefully.
- **A4 migration:** not yet run against a DB; delegate the local-only validation to Codex.

**Delegated to Codex:** see `docs/codex-tasks-sync-2026-06-27.md` for two tightly-scoped, guardrailed
tasks — (1) validate the A4 migration against a LOCAL db (no SQL edits, never prod), and (2) build the
D3 catalogue data + lookup lib + read-only search API (no onboarding UI). Both are backend/data only.

**Codex backend brief complete (2026-06-29):** matching, pursuits, Human Path boundary,
outreach persistence, and subscription enforcement backend work from
`docs/codex-tasks-backend-2026-06-28.md` is complete and handed back to Claude in
`docs/claude-handoff-codex-backend-completion-2026-06-29.md`.

Summary of the approved redesign: legacy 14 onboarding sections collapse to ~7; the 5-section
personality cluster collapses into one **Voice & Personality** section (Q1 + Q4 + writing samples
+ tone tags); Proof Library → **Work Examples** (4 fields + insertable one-hitter); Work History
removed (from resumes); Fit Signals are soft scoring (no hard filters); profile.md gains a
**Claude voice-fingerprint pre-pass**; then the outreach generator. Build order: data model →
services/API → UI (gated on design direction) → AI features.

(Historical, superseded) The prior "safest next task" was: add quality-remediation guidance for
weak or missing onboarding fields. Do not pursue this; it predates the redesign.

## Next Session To-Do

Use this as the next session's starting checklist unless Randall gives a newer explicit instruction.

1. Reconstruct state before editing.
   - Run `git status --short --branch`.
   - Confirm whether dirty files are docs-only or include app/code/design files.
   - Confirm no localhost server is assumed to be running.

2. Validate the reverted app before new work.
   - Run `npx tsc --noEmit --incremental false`.
   - Run `npm run lint`.
   - Run `npm run build`.
   - Run `npm run test:public-jobs`.
   - Run `git diff --check`.
   - Report exact results and any warnings. Do not call the build healthy without fresh validation.

3. Define onboarding quality-remediation behavior before implementation.
   - Identify what currently counts as a missing required field.
   - Identify what currently counts as a weak field.
   - Determine whether weak fields block completion or only guide improvement.
   - Keep operational profile status binary: `complete` or `incomplete`.
   - Draft the user-facing remediation states without changing public copy yet.

4. Propose the narrow implementation scope and stop for approval.
   - Likely target: existing `/onboarding` profile quality/readiness surfaces.
   - Likely files to inspect before proposing edits:
     - `app/onboarding/OnboardingClient.tsx`
     - `app/onboarding/onboarding.module.css`
     - `lib/public-profile/*`
     - relevant public profile quality/completion tests
   - Do not touch homepage, dashboard design, design tokens, global CSS, fonts, or design-system foundations.

5. After approval, implement only the approved remediation slice.
   - Reuse existing profile-quality data and section readiness UI where possible.
   - Preserve the existing visual system.
   - Preserve existing public homepage and dashboard copy.
   - Add or update focused tests for missing/weak remediation behavior.

6. Re-run validation and report.
   - `npx tsc --noEmit --incremental false`
   - `npm run lint`
   - `npm run build`
   - `npm run test:public-jobs`
   - `git diff --check`
   - Report dirty files and summarize exactly what changed.

## Blocked Decisions

These block later work and should not be silently decided by an agent:

- Google OAuth setup.
- Apple OAuth setup.
- Resume file storage provider and retention rules.
- Resume parsing provider.
- Billing provider and webhook model.
- Any future Human Path retrieval-provider replacement. Another provider change requires a
  concrete observed failure, explicit scope approval, and compatible licensing.
- Which design-system direction, if any, is locked for a specific live surface.

## Hard Prohibitions

Do not edit these without explicit scoped approval:

- Public homepage copy or layout.
- Public product copy.
- Onboarding UI layout or CSS.
- Dashboard UI layout or CSS.
- Design tokens, fonts, or global styles.
- Route structure.
- Design-system foundations.
- Any replacement of existing content with roadmap, handoff, backend, agent, provider, or implementation language.

Do not create new design primitives. If a design task is approved, identify the exact existing source card/component first and state the mapping before editing.

## Validation Commands

Run only when requested or after an approved code change:

- `npx tsc --noEmit --incremental false`
- `npm run lint`
- `npm run build`
- `npm run test:public-jobs`
- `git diff --check`

Known legacy lint warnings have previously existed in `/app/scans` and scripts. Re-check before claiming they are unchanged.

## If Instructions Conflict

Use this priority order:

1. Randall's latest explicit request in the current conversation.
2. `AGENTS.md`.
3. This file.
4. `docs/current-state.md`.
5. `docs/project-todo.md`.
6. Roadmap, audit, handoff, and design docs as context only.

If the next task cannot be identified without interpreting conflicting docs, stop and report the conflict instead of choosing creatively.

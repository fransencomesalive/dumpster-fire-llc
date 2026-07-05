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
8. Stop for approval before edits unless Randall explicitly named the exact task and target files.

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
- Real Human Path provider integration.
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
- Human Path search/provider strategy.
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

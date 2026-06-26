# Project Operating State

Date: 2026-06-26
Repo: `/Users/randallfransen/Sites/dumpster-fire-llc`
Purpose: single control point for understanding status, choosing the next task, and preventing scope jumps.

## Session Start Protocol

When a session begins, or when Randall says "pick up where we left off", do this before proposing or editing anything:

1. Run `git status --short --branch`.
2. Report whether dirty files are docs-only or include app/code/design files.
3. Check whether a localhost server is running only if Randall asks for a running app or visual proof.
4. Read this file, `AGENTS.md`, `docs/current-state.md`, `docs/project-todo.md`, and `docs/public-product-gap-build-plan-2026-06-26.md`.
5. Name the single next task and the exact files that would be touched.
6. Stop for approval before edits unless Randall explicitly named the exact task and target files.

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
- Private `/scans` remains legacy-active private machinery and is not public-product completion.

Not yet built as public workflows:

- Public matching.
- Pursuits.
- Human Path.
- Public outreach generation.
- Subscription enforcement.
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

The safest next product task from the current docs is:

Add quality-remediation guidance for weak or missing onboarding fields.

Why:

- `docs/product-roadmap-audit-2026-06-25.md` recommends resolving quality-scoring/remediation first.
- `docs/public-product-gap-build-plan-2026-06-26.md` lists onboarding quality remediation as Immediate Next Work.
- This task can be scoped without inventing a design system or touching protected homepage copy.

Do not implement it until Randall explicitly approves that task and the target files.

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

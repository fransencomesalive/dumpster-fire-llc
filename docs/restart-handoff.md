> **SUPERSEDED for design state — see `docs/design-state.md` (canonical).**
> The "Failed Codex Design Pass" history below is retained as a record. For the current
> design state, scope, and sequence, read `docs/design-state.md`, not this file.

# Restart Handoff — Dumpster Fire Recovery

Date: 2026-06-26
Repo: `/Users/randallfransen/Sites/dumpster-fire-llc`
Status: recovery work captured in git; start every resumed session by checking the actual repository state.

## 2026-06-26 (PM) — Claude design-build session: STOPPED, continue on MacBook Air

**Randall halted this session. The design build is WRONG and not approved.** Two blocking
problems reported by Randall while reviewing in-browser:

1. **Fonts are not loading.** The custom faces (Bemio / Bebas / Plantagenet) do not render —
   text falls back to system/serif, so the whole design collapses.
2. **All styles are wrong.** With fonts failing and the treatment off, the surfaces look
   broken, not designed.

Do not treat anything built this session as approved design. Continue on the MacBook Air
from this section.

### Root-cause status of the font problem (IMPORTANT — not yet solved)

Server-side checks say the pipeline *should* work, which means the failure is browser-side
or a cascade override that was not isolated. Verified this session:

- Font files exist and are non-zero: `app/fonts/{Bemio.otf,Bemio-Italic.otf,BebasNeue-Regular.woff2,PlantagenetCherokee.ttf,OriginalSurfer-Regular.ttf}`, `app/scans/fonts/Gotham-*.otf`.
- `next/font/local` is configured in `app/layout.tsx`; the generated variable classes
  (`bemio_… bebas_… plantagenet_… gotham_…`) **are** applied to `<body>` in the rendered HTML.
- The `@font-face` media files **are** served (e.g. `/_next/static/media/Bemio-s.p.*.otf`,
  `BebasNeue_Regular-s.p.*.woff2`, `PlantagenetCherokee-s.p.*.ttf`).
- `app/globals.css :root` maps `--font-display → var(--font-bemio)`, `--font-subhead →
  var(--font-bebas)`, `--font-body → var(--font-plantagenet)`. `--font-bemio` etc. are
  defined on `<body>` (via the className), inherited by descendants — standard pattern.

**NOT confirmed (do this first on MacBook Air, in real browser DevTools):**

1. Inspect a heading (e.g. `.ds-display` on `/styleguide`) → **Computed → font-family**.
   Is it the next/font Bemio family, or a fallback? This tells you if the var chain resolves.
2. Network tab → reload → are the font files **200** (not 404/blocked)? Any CORS/`crossorigin`?
3. Suspect **Tailwind v4 Preflight**: `app/globals.css` starts with `@import "tailwindcss"`.
   Preflight sets a default `font-family` and may win over the token chain on some elements.
   Test by temporarily hard-setting `font-family: "Bemio"` (the raw `@font-face` family that
   next/font also exposes) on a heading — if that renders, the issue is the var chain/cascade,
   not the font file.
4. Confirm the specific OTFs actually contain renderable glyphs (open Bemio.otf locally).

### Exactly what changed this session (uncommitted unless the commit below succeeded)

- `docs/design-state.md` — NEW canonical design source-of-truth (keep).
- SUPERSEDED banners added to: `docs/design-implementation-handoff.md`,
  `docs/design-system-token-mapping-audit-2026-06-25.md`, `docs/project-operating-state.md`,
  this file (keep).
- `app/onboarding/onboarding.module.css` — collapsed THREE conflicting CSS layers (dark
  original + two paper override layers with `!important`) into ONE clean token layer
  (863→594 lines, 0 dark literals). Renders same as before; this is a cleanup worth keeping.
- `app/ds.css` — NEW shared component layer (buttons/cards/forms/badges/type) built from the
  DS cards. **Part of the rejected design build — review/revert as needed.**
- `app/layout.tsx` — added `import "./ds.css";`.
- `app/styleguide/page.tsx` — NEW internal review page (`/styleguide`). **Rejected build artifact.**
- Memory: `no-eyebrow-headlines` saved (standing rule, below).

### Standing design rule captured this session

- **No eyebrow headlines** anywhere (no kicker label above a heading). Recorded in
  `docs/design-state.md` and in agent memory.

### Recommended restart sequence (MacBook Air)

1. `git pull` first (this session's commit should be on `origin/main`).
2. **Fix fonts before any more styling.** Use the DevTools steps above; nothing about the
   visual design can be judged until Bemio/Bebas/Plantagenet actually render.
3. Decide keep-vs-revert on the rejected build (`app/ds.css`, `app/styleguide/page.tsx`, and
   the onboarding wiring). The canonical doc, the superseded banners, and the onboarding CSS
   consolidation are independent of the rejected visual treatment and can stay.
4. Re-run `npm run build` (it was NOT re-run after `ds.css` was added).
5. `docs/design-state.md` is the canonical design doc; read it, not the older superseded ones.

### Environment note

- A `next dev` server was left running on `http://localhost:3000` (background). Safe to kill.

## 2026-06-26 Failed Codex Design Pass

The latest Codex design implementation should be treated as a failed attempt, not as approved design work. Codex did not correctly use the exact Claude Design items/cards and repeatedly guessed at UI/CSS mappings. Assume Codex has no reliable idea what it is doing on this design port without Claude Design saving the implementation.

Immediate next session instruction: stop extending this CSS from intuition. Open the exact Claude Design project/items and rebuild or correct the app from those exact cards and mappings. The design-system repo files are not loose inspiration; they are implementation authority. In particular:

- Use `docs/design-implementation-handoff.md` and `docs/design-system-token-mapping-audit-2026-06-25.md` as the sequencing map.
- Use the exact Claude Design cards/items for public homepage, onboarding, dashboard, `/scans`, panels, forms, badges, modal, header, footer, and hero before touching CSS.
- Do not trust the current public/home/onboarding CSS as a good port.
- Verify screenshots against the Claude Design cards before committing any further design changes.

## Immediate Next Session Start

Latest committed recovery checkpoint noted by this handoff: `55bb772` (`Recover public copy and codify handoff rules`). At the start of the next session:

1. Run `git status --short --branch`.
2. If `main` is still ahead of `origin/main`, decide whether to `sync` before further work.
3. Read `AGENTS.md`, this handoff, `docs/current-state.md`, and `docs/design-implementation-handoff.md`.
4. Continue recovery by normalizing `/dashboard`, Edit Career Profile, Jobs, and Saved Jobs against the approved design-system direction before Step 4 Matching.
5. After changes, run `npm run build`, `npm run lint`, `npm run test:public-jobs`, and `git diff --check`.

## Why This Exists

This session salvaged a poor product-roadmap/build session and got the public app back onto a documented track. The next session should not infer design or product direction from the current ad hoc UI. Product behavior is being clarified step by step; design implementation now needs to become systematic using the Claude design system instead of one-off layout choices.

## Current Product Decisions

### Approved/Protected Public Homepage Areas

Leave these alone until Randall explicitly changes them or the forthcoming Claude Design cards replace the Human Path mock visuals:

- Homepage header/hero copy.
- `Is the Job Market a Dumpster Fire?` section and four cards.
- Human Path intro and slideshow intent.

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
- Homepage protected areas stay untouched except for explicitly approved Claude replacement cards.
- Human Path slideshow is intentional and should not be removed.
- Do not port private `/scans` defaults or private copy into public app product surfaces.
- Do not resurrect profile export.

### Recommended Next Session Sequence

1. Read `AGENTS.md` and the required design docs.
2. Re-open this handoff, `docs/current-state.md`, and `docs/design-implementation-handoff.md`.
3. Audit current git status and diffs before editing.
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
- This handoff originally described in-progress work. Start any resumed session by checking `git status --short --branch` and do not assume the working tree is dirty or clean from this document alone.

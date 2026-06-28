# Codex Backend Task Guide — Matching, Pursuits, Subscription

Date: 2026-06-28
Author: Claude session (planning)
For: Codex, across several sessions while Claude usage is rate-limited.

This guide holds three **self-contained, backend-only** tasks. Do them **in order**
(Matching → Pursuits → Subscription); each unblocks the next. Pull the next unstarted
task at the top of each session. One task can span multiple sessions — that's expected.

---

## How to use this guide (read every session)

1. **Session Start Protocol first.** Before editing anything, follow
   `docs/project-operating-state.md` → Session Start Protocol and read `AGENTS.md`. Run
   `git status --short --branch` and report whether dirty files are docs-only or code.
2. **Handoff / Sync** on request per `AGENTS.md` (commit must produce a hash; never claim
   "synced" without a successful push). Update this guide's task status as you progress.
3. **One task per branch is fine but not required** — match the repo's main-based workflow.

### Global guardrails (apply to ALL three tasks)

- **Backend / data / logic only.** Do **not** create or edit any UI, CSS, component, layout,
  onboarding/dashboard/homepage file, design token, font, or public-facing copy. These are
  design-gated (AGENTS.md Design Authority) and owned by Claude + Randall. If a task seems to
  need UI, stop and report — the UI is a separate, later effort.
- **No production database access.** These tasks are code + local validation only. Schema
  migrations are written as `.sql` files under `supabase/migrations/` and validated locally
  (see [[dumpster-fire-local-db-migration-test]] pattern); they are applied to prod by Randall.
- **Follow existing patterns.** Mirror `lib/public-profile/` (framework-neutral service
  boundary, repository seam, fixture-backed `.mjs` tests). Reuse `CandidateProfileAggregate`
  and the existing types in `lib/public-profile/types.ts`.
- **Test-runner conventions:** see `scripts/test-public-profile-*.mjs`. Compiled runners
  compile non-strict (use `x.ok === false`, not `!x.ok`, for DU narrowing); self-contained
  runners need type-only relative imports. Do not import `catalogues/index.ts` into a compiled
  runner (it needs `resolveJsonModule`, which those runners lack).
- **Use `claude-opus-4-8`** for any model call, via the injected `callModel` dependency with
  graceful no-key degradation + lazy SDK import (the convention in `voice-fingerprint.ts` /
  `outreach-generator.ts`). Never hardcode an API key.

### Vocabulary reconciliation (the specs predate the redesign — IMPORTANT)

`matching-engine-spec.md` and `pursuit-workflow-spec.md` were written before the generator
redesign. When following them, translate:

- **"Proof" / "Proof Library" / "project" / "Project Recommendation"** → the new
  **Work Examples** model (`workExamples: WorkExampleSectionItem[]`, fields
  `title / oneHitter / link / context`). There is no proof object anymore.
- **"Work History"** → removed; experience now lives in resumes. Do not reference work-history.
- **Fit Signals are SOFT score contributors, not hard filters.** Poor-fit jobs still surface,
  rated lower, with the poor-fit reason shown as context. See [[matching-spectrum-no-hard-filters]].

### Open decisions for Randall (do NOT resolve creatively — stop and ask)

- **D-MATCH-1: Hard exclusions vs all-soft.** `matching-engine-spec.md` has a "Hard Exclusion
  Rules" section (salary floor, remote preference, blacklisted companies) AND Phase 4 of the
  roadmap lists "hard exclusion handling." But the standing product rule is "no hard filters —
  everything surfaces." **Reconcile before implementing exclusions:** are salary/remote/blacklist
  hard drops, or just strong negative score contributors that still surface with a clear flag?
  Implement the scoring first; gate the exclusion behavior behind this decision.

---

## TASK 1 — Matching Engine  ·  status: NOT STARTED

**Goal.** A framework-neutral service that scores one normalized job against a complete
candidate profile and returns the match output defined in `matching-engine-spec.md`.

**Spec.** `docs/matching-engine-spec.md` (apply the vocabulary reconciliation above).

**Files (proposed).**
- `lib/public-profile/matching/types.ts` — `MatchInput`, `MatchResult`, per-category fit types.
- `lib/public-profile/matching/scorers.ts` — one function per evaluation category: Title,
  Responsibility, Work-Example, Resume, Industry, Compensation, Location, Company, Posting
  Freshness, Apply Method (spec §"Match Evaluation Categories").
- `lib/public-profile/matching/recommend.ts` — Role Track, Resume, and Work-Example
  recommendation (spec §150–205).
- `lib/public-profile/matching/engine.ts` — composes scorers + recommenders + risks +
  explanation into one `evaluateMatch(input): MatchResult`.
- `scripts/test-public-profile-matching.mjs` (+ a `.ts` if using the compiled-runner style) —
  fixture-backed tests reusing `scripts/fixtures/public-profile.ts`.

**Build order within the task.**
1. Types + the per-category scorers (each returns a 0–1 or labelled score + reasons).
2. The three recommenders (which Role Track / resume / work example to lead with).
3. Risks + plain-English match explanation (spec §205–254).
4. Hard-exclusion behavior — **only after D-MATCH-1 is resolved.**
5. Full fixture test suite: strong-fit, weak-fit, exclusion-edge, missing-data cases.

**Do NOT** add an API route or any UI in Task 1 — pure service + tests. (The route is Task 1b
below, do it only once the engine is green.)

**Verify.**
- `node scripts/test-public-profile-matching.mjs` (all assertions pass)
- `npx tsc --noEmit --incremental false` clean
- `npm run lint` (no new warnings beyond the known baseline)

### TASK 1b — Matching API route (after 1 is green)
- `app/api/public-profile/match/route.ts` — authenticated `POST` that loads the aggregate +
  the job (by id) via the repository seam and returns `evaluateMatch(...)`. Mirror the auth +
  repository-config + error mapping in `lib/public-profile/api.ts` (401/404/503 patterns).
- Extend `scripts/test-public-profile-api.mjs` with match-route cases.

**Definition of done.** Engine + recommenders + explanation implemented to spec (with D-MATCH-1
honored), API route gated and tested, full validation green, status updated to DONE here.

---

## TASK 2 — Pursuit Workflow backend  ·  status: BLOCKED on Task 1

**Goal.** The data model + state machine + metering for pursuits, per
`docs/pursuit-workflow-spec.md`. No UI — the Apply Wizard UI is a later design-gated effort.

**Spec.** `docs/pursuit-workflow-spec.md` (§"Pursuit State Machine", §"Metering",
§"Expiration", §"Saved Job vs Pursuit"). Apply the vocabulary reconciliation above.

**Key rules from the spec / current state.**
- **Saved Jobs ≠ Pursuits.** Saving is "pursue later," free, and does not create a pursuit
  (already true in the jobs scaffold — preserve it).
- A pursuit moves through: review → human path → contact selection → outreach → tracking →
  expiration. Build the state machine + transitions + guards; the human-path/contact/outreach
  *content* is produced by existing/other services (outreach-generator already exists;
  human-path is BLOCKED, see Task notes).
- **Metering**: pursuits / human-path / outreach are metered (spec §Metering) — record usage
  events; enforcement itself is Task 3.

**Files (proposed).**
- `supabase/migrations/2026XXXXNNNNNN_pursuits.sql` — `pursuits` + `pursuit_events` (or
  similar) tables with RLS owner policies mirroring the existing public-profile tables.
  **Write defensively (`if not exists`), validate locally only**, do not apply to prod.
- `lib/public-profile/pursuits/` — types, state-machine service, repository seam.
- `scripts/test-public-profile-pursuits.mjs` — state-transition + metering fixture tests.

**Verify.** local migration validation ([[dumpster-fire-local-db-migration-test]]) + the new
test runner + `tsc` + `lint`.

**Note on Human Path.** Contact discovery (spec §"Human Path Generation") is **blocked** on
Randall's provider decision. Build only the **provider boundary/interface + a stub** so the
state machine compiles and tests run; do not pick a real contact-discovery provider.

**Definition of done.** Migration written + locally validated, state machine + metering events
implemented + tested, status updated here. Stop before any pursuit UI.

---

## TASK 3 — Subscription enforcement  ·  status: BLOCKED on Task 2

**Goal.** Enforce Tester / Basic / Pro limits on pursuits, human-path, outreach, and the
Pursued-Jobs export gate, per `docs/subscription-enforcement-matrix.md`.

**Spec.** `docs/subscription-enforcement-matrix.md`.

**Scope.** Pure gating/limit logic over the metering events from Task 2. Return "limit reached"
/ "export locked" states as data; the upgrade UI is design-gated and out of scope. Billing
webhook processing is **blocked** on the billing-provider decision — build the enforcement
layer against the metering ledger, not against a live billing provider.

**Files (proposed).**
- `lib/public-profile/subscription/` — plan rules, limit checks, enforcement results.
- `scripts/test-public-profile-subscription.mjs` — limit-reached / under-limit / export-gate tests.

**Verify.** new test runner + `tsc` + `lint`.

**Definition of done.** Plan limits + enforcement results implemented + tested against the
metering ledger, status updated here. No UI, no live billing integration.

---

## Status log (Codex: update this each session)

- 2026-06-28 — Guide created (Claude). All three tasks NOT STARTED. Build order locked
  Matching → Pursuits → Subscription. D-MATCH-1 open for Randall.

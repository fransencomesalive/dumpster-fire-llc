# Codex Session — Deferred Items: External Job Link (priority) + Re-gen Plumbing + Saved Pursuits Button

Date: 2026-07-14. Owner: Codex. Reviewer: Randall (+ Claude session for network-gated steps).

## What this is

The three items Randall deferred to a later session (recorded in
`docs/message-gen-refinement-track.md` → "Deferred to a later session"), now authorized
2026-07-14 with Randall's own placement/behavior/copy specs. Work them IN ORDER; Task 1
is the priority and must be complete before starting the others.

**Task 1 (PRIORITY) — external job link → pursue, backend only.**
Randall: a user who finds a job OUTSIDE the job scan needs a way to pursue it. The eventual
UI is: "Find a job that's not in your scan? drop the job link here:" + link input +
**[PURSUE]** button, and pressing Pursue cues the exact same pursuit workflow any scanned
job gets. This session builds the BACKEND ONLY for Task 1: URL → validated fetch →
extracted job record → a job id the existing pursue flow accepts. The Task 1 UI stays
design-gated for a later Claude Design pass.

## Hard guardrails (all standing, all apply)

- **Work on `main` only.** Never create or switch branches (AGENTS.md hard rule).
- **No UI / CSS / public copy / design edits of any kind.** Protected surfaces stay
  untouched. If a step seems to need one, stop and report instead.
- **Do not touch** `lib/public-profile/outreach-generator.ts`, `voice-fingerprint.ts`,
  `profile-markdown.ts`, or anything under `scripts/outreach-quality/` — that is the
  message-gen refinement track with its own approval loop.
- **Network egress is blocked in your sandbox** (documented in
  `docs/message-gen-refinement-track.md` → "Network step"). Do NOT retry blocked calls.
  Author everything offline with injected/mocked fetch + model calls; live verification is
  handed to the Claude session or Randall (see "Verification handoff" below).
- **Migrations:** prefer no migration (see Data model below). If one proves unavoidable,
  author the SQL + validate against a LOCAL throwaway postgres only
  (`docs/database-migration-state.md` has the protocol) — never against prod.
- **AI convention** (`callModel` injected, graceful no-key degradation, lazy SDK import,
  `claude-opus-4-8`) — mirror the existing patterns in `lib/scan/sources/llm-extract-posting.ts`.
- Follow the repo `handoff` / `sync` protocols in `AGENTS.md` when ending the session.

## Reuse these (read them first — do not reinvent)

- `lib/scan/sources/url-safety.ts` → `assertSafePublicUrl` (SSRF guard: public-IP check,
  scheme validation). Every user-supplied URL goes through this before any fetch.
- `lib/scan/sources/llm-extract-posting.ts` → `extractPostingSectionsLLM`,
  `parsePostingModelJson` (posting HTML/text → structured sections via injected model).
- `lib/scan/sources/parse-posting.ts` (non-LLM parsing helpers used by the scan).
- `lib/public-profile/pursuits/repository.ts` → `createPursuitForJob` (the pursue flow's
  entry by job id — the target hand-off point; the new endpoint does NOT create pursuits
  itself, it only produces a job the existing flow accepts).
- Auth pattern for user-scoped routes: `getPublicAuthSession` via
  `handleOutreachGeneratorRequest` in `lib/public-profile/api.ts` as the reference shape
  (bearer session → 401 paths → parsed body → service call → typed statuses).

## Data model

`jobs` columns (live): `id, source, source_url, company_name, title, location, remote_type,
employment_type, compensation_text, description, posted_at, scraped_at, created_at,
updated_at, external_job_id, apply_url, department, salary_min, salary_max,
responsibilities, required_experience`.

- Insert user-added jobs with `source: "user_link"` (VERIFY first: check for a CHECK
  constraint or enum on `source` by reading the migrations in `supabase/migrations/`; if
  constrained, adding the value is the one acceptable migration).
- `source_url` = the user's link (normalized). `scraped_at` = ingestion time.
- **Ownership question — resolve by inspection, not invention:** scanned jobs are global.
  Decide whether user-link jobs need an owner column by checking how the jobs list/matching
  queries filter (`lib/public-jobs/repository.ts`). If exposing a user's pasted job to all
  users is the only consequence, PREFER the no-migration path and record the tradeoff in
  the handoff doc for Randall to decide; do not silently add columns.

## Deliverables

1. **Service** `lib/public-jobs/ingest-link.ts` (or the module layout that matches existing
   `lib/public-jobs/` conventions):
   `ingestJobFromLink({ url, userId }, deps)` →
   - `assertSafePublicUrl` (reject with a typed `unsafe_url` status),
   - fetch the page (fetch injected via deps for tests; timeout + size cap),
   - extract title/company/description via the LLM extractor (injected `callModel`; when
     the model is unavailable, degrade to a typed `extraction_unavailable` status — do not
     half-insert),
   - dedupe: same normalized `source_url` already in `jobs` → return the existing job id
     with status `already_known` (no duplicate row),
   - insert and return `{ status: "ingested", jobId, title, company }`.
2. **API route** `app/api/jobs/from-link/route.ts` → POST, session-authed, body
   `{ url: string }`, mapping service statuses to HTTP (400 unsafe/invalid, 503 extraction
   unavailable, 200 ingested/already_known). Same response hygiene as sibling routes.
3. **Tests** (repo conventions: compiled-`.mjs` runner pattern like
   `scripts/test-public-profile-outreach.mjs`; note non-strict mode gotchas in that file's
   siblings): safety rejection, happy path with mocked fetch+model, dedupe, degradation,
   malformed body. Wire an npm script `test:job-link`.
4. **Handoff doc** update per AGENTS.md: what shipped, exact verification steps for the
   network-gated parts, open decisions (ownership tradeoff above).

## Verification handoff (network-gated — NOT yours)

You cannot fetch real URLs or call Anthropic. After offline tests pass, commit (per
handoff protocol) and list these for the Claude session / Randall to run:

1. `npm run test:job-link` (offline — you run this too).
2. Live ingest of one real posting URL through the service with real fetch + key.
3. `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run build`.

## Task 2 — single re-gen message flow (plumbing + step-3 UX; the prompt itself is NOT yours)

Randall's spec (2026-07-14): eliminate the current "Generate new message" affordance in
favor of ONE backup re-gen — a single regeneration pass meant to produce a much different
but still tone-true message. At step 3 of the pursuit flow (currently grayed out until
drafts generate): on arrival, the card itself shows the standard loading animation the app
already uses (INSIDE the card, never a popup), then shows the generated message. Done —
the user can copy the text and that's it. One re-gen allowed, then the affordance is gone.

Boundaries:

- **The regeneration prompt language is out of scope.** The "much different, same tone"
  instruction lives in the message-gen refinement track's approval loop. Your job is the
  interface and enforcement: accept a `regenerate: true` request carrying the prior
  message id, enforce the one-regen-per-message limit in persistence, and pass the
  previous message text through to the generation service behind a clearly-marked
  interface (`previousMessage` on the service input, with a `TODO(message-gen-track)`
  where the generator consumes it). Do NOT edit `lib/public-profile/outreach-generator.ts`
  — stop at its boundary.
- Persistence: check how outreach messages are stored (`outreach_messages` + pursuits
  repositories) and record the regen linkage/count there; local-only migration validation
  if a column is genuinely needed.
- UI: Randall specified the flow, which is your design authorization — but implement it
  by REUSING the existing primitives only: the exact in-card loading animation already
  used elsewhere in the flow, existing card structure, existing button/copy-to-clipboard
  patterns. If any piece would require a NEW visual primitive, a new layout, or new copy
  beyond Randall's words above, stop and report instead of inventing.
- Verify at 320/375/390/1280/1440 (AGENTS.md UI checklist; no em dashes in any copy).

## Task 3 — Saved Pursuits button + "Coming Soon" tooltip

Randall's spec (2026-07-14): add a "Saved Pursuits" button next to "Dashboard" in the top
profile card; hovering shows a tooltip "Coming Soon". It is the first step of the
saved-pursuits review track — the button does nothing else yet.

- Match the existing Dashboard button's component/styling exactly (same primitive, same
  sizing); the only new element is the tooltip. If NO tooltip primitive exists in the app
  or design system, stop and report — do not invent one.
- Full clickable bounding box; verify at the standard viewports; teal/tomato semantics per
  the design system (this is a neutral/disabled-ish affordance — do not style it as a
  destructive action).
- Remember the Design System ↔ production parity rule (AGENTS.md): if the profile-card DS
  card exists under `design-system/`, the change lands in BOTH or it is not done — list
  the DS card in your handoff for the Claude session to sync to Claude Design.

## Explicitly OUT of scope

- Task 1's UI (the link input, [PURSUE] button, placement, copy) — design-gated, later.
- Pursuit creation / wizard changes beyond Task 2's step-3 flow.
- The re-gen prompt language and anything in `outreach-generator.ts` /
  `voice-fingerprint.ts` / `profile-markdown.ts` / `scripts/outreach-quality/`.
- Stale/delisted-posting handling — Randall decided 2026-07-14 we are NOT addressing it.
- Matching/rating of user-link jobs beyond whatever falls out for free.

## Kickoff prompt (paste into Codex)

> session check. Read docs/codex-tasks-external-job-link-2026-07-14.md and complete its
> three tasks IN ORDER (Task 1 backend is the priority). Main only, no network retries
> (author offline with injected deps; hand network verification back per the doc), reuse
> existing primitives only, and stop-and-report at every boundary the doc marks.

# Codex Brief — Track A: Careers-Page Scraping + Board-Failure Logging

**Owner:** Codex (own session) · **Created:** 2026-07-12 · **Branch:** `main` only (never branch — AGENTS.md)
**Scope:** backend + one pre-approved copy string. **No design/UI/CSS work.** **Do not apply migrations to prod.**

This brief is self-contained. Read `AGENTS.md` and `docs/project-operating-state.md` first (session-start protocol,
handoff/sync rules, migration recording). Then execute the two tasks below.

---

## 0. Context (what you're touching)

Dumpster Fire is a job-pursuit app. On the authenticated dashboard there is a **"Company job boards"** card:
a user pastes a company URL, and every scan then checks that board directly for open roles.

The add flow today:

- UI: `app/dashboard/DashboardClient.tsx` → `addBoard()` → `POST /api/jobs/boards`.
- Route: `app/api/jobs/boards/route.ts` → `handlePublicJobBoardAddRequest` in `lib/public-jobs/api.ts`.
- Logic: `addPublicJobBoardForUser` in `lib/public-jobs/repository.ts`, which calls
  `resolveBoardFromUrl` in `lib/scan/sources/board-registry.ts`, then **live-verifies** the board
  (fetches it once) before inserting a `job_sources` row. Scans later fetch these boards via
  `fetchUserBoardsForScan` (same repository file).

`resolveBoardFromUrl` today only recognizes known ATS hosts — `greenhouse`, `ashby`, `lever`,
`rippling` (→ `html` provider), `workable` (→ `html` provider); `gem` is deliberately blocked.
**Any other host returns `{status:"unrecognized"}`**, which surfaces to the user as a 422
`unrecognized_board` and an error message telling them to use the feedback chat bubble.

That is the gap. A company's own careers page (e.g. `https://www.trainingpeaks.com/careers/`) is
not a known ATS host, so it fails today.

**Reuse, don't rebuild.** `lib/scan/sources/connectors.ts` already has generic careers-page
machinery: an `html` provider path, `parseHtmlJobs`, `parseAnchorJobs`, `parseJsonLdJobs`,
`isCareersUrlProvider`, plus `workday`/`icims`/`magnit` parsers. `lib/scan/sources/llm-extract-posting.ts`
does LLM extraction of a single posting. The scan-time board fetch already runs the `html` provider
against `careersUrl`. Your job is to route unrecognized hosts INTO this existing path, not to write a
new scraper.

---

## Task 1 (#8) — Careers-page scraping so non-ATS careers URLs resolve

**Goal:** pasting a real company careers page that isn't a known ATS should resolve to a board and
ingest its postings, instead of returning `unrecognized`.

**Approach (design the details yourself, within the guardrails):**

1. In `resolveBoardFromUrl` (or a new fall-through it calls), when the host matches no known ATS,
   resolve to a **generic careers board**: `provider: "html"`, `careersUrl:` the pasted URL (normalized),
   `companySlug:` derived from the hostname, `confidence: "guess"`. Do **not** immediately return
   `unrecognized`.
2. Keep `addPublicJobBoardForUser`'s existing **live-verify-before-insert** contract: the generic
   board must be fetched + parsed once at add time using the SAME `html`/careers path that
   `fetchUserBoardsForScan` uses at scan time. If parsing yields **≥1 plausible posting**, accept and
   insert. If it yields nothing, you MAY fall back to the LLM extractor (`llm-extract-posting.ts`);
   if that also yields nothing, return `unrecognized` (or `board_fetch_failed` if the fetch itself
   errored) so the user gets an honest failure.
3. Whatever resolves at add time must also work at scan time — verify `fetchUserBoardsForScan` +
   `ingestNormalizedJobs` handle the generic `html` board the same way (per-board failure stays
   isolated; a board failure never fails the scan; keep the existing timeout/concurrency caps).

**Guardrails specific to this task:**
- Bound the fetch (timeout) so a slow careers page can't hang the add request or a scan.
- If you use the LLM extractor: follow the AI-feature convention (injected `callModel`, lazy SDK,
  model `claude-opus-4-8`, **graceful degradation with no API key** — no key must not crash the add;
  fall back to structured parsing only). See existing `lib/public-profile/*` LLM callers for the pattern.
- Do not weaken ATS resolution — greenhouse/ashby/lever/rippling/workable must resolve exactly as today.
- Respect the existing per-user board cap (currently 15) and the `gem` block.

**Acceptance:**
- `https://www.trainingpeaks.com/careers/` (and 1–2 other real non-ATS careers pages you pick)
  resolve + insert + a scan ingests at least their listed roles.
- Obvious garbage (`https://example.com/about`, non-URLs) still returns `unrecognized`.
- Existing ATS URLs resolve unchanged.
- `npm run test:public-jobs` passes, **with new assertions** covering the generic-careers path
  (resolve success, resolve failure, and that a dismissed/duplicate guard still holds).

---

## Task 2 (#9) — Log unreadable board URLs + swap the failure copy

**Goal:** stop telling users to use the chat bubble; instead record every URL we couldn't read, so we
can decide which boards to support next.

1. **Migration — new table `unrecognized_board_submissions`:**
   - Columns: `id` (uuid pk default gen_random_uuid()), `user_id` (uuid, not null),
     `url` (text, not null), `reason` (text, not null — one of `unrecognized_board` / `board_fetch_failed`),
     `created_at` (timestamptz default now()).
   - Add a new file in `supabase/migrations/` using the existing `YYYYMMDDHHMMSS_name.sql` convention
     (see the six existing files; newest is `20260710000200_job_sources_owner_user.sql`).
   - **Validate LOCALLY only** (no Docker — use a throwaway `brew postgresql@16`, LC_ALL=C, TCP,
     stubbed auth schema; see the pattern in memory / prior migrations) and record the row in
     `supabase_migrations` per `docs/database-migration-state.md`. **Do NOT apply to prod — Randall
     applies prod migrations himself.** Leave a clear note in `docs/database-migration-state.md` that
     it is pending prod apply.
2. **Wire the logging:** in `handlePublicJobBoardAddRequest` (`lib/public-jobs/api.ts`), when the
   result is `unrecognized_board` or `board_fetch_failed`, insert a row (via a repository helper in
   `lib/public-jobs/repository.ts`). **Best-effort:** a logging failure must never change the HTTP
   response the user gets. Include `user_id`, the raw pasted `url`, and the `reason`.
3. **Copy swap (the ONLY UI/copy edit allowed in this brief — pre-approved by Randall):**
   In `app/dashboard/DashboardClient.tsx`, the `boardError === "unreadable"` block (currently
   *"We couldn't read that page as a job board. Try the company's careers page link — the page that
   lists their open roles. Still stuck? Use the feedback chat bubble…"*) must become **exactly**:

   > Couldn't read that one yet. We've saved the link and we'll see about adding it. Got a direct link to their listings? Paste that and it may scan right now.

   - Apply this copy change **only together with the logging** (so "we've saved the link" is true).
   - No em dashes. **No provider names** (never "Greenhouse", "Lever", etc.) — public copy boundary.
   - This is the only allowed copy/markup edit. Do not restyle the block or touch any other copy.

**Acceptance:**
- Adding an unreadable URL writes one `unrecognized_board_submissions` row and returns the same 422.
- The dashboard shows the new copy; no "chat bubble" text remains for this state.
- Logging failure is swallowed (response unchanged).

---

## Guardrails (hard — apply to both tasks)

- **`main` only.** Never create/switch/push a branch (AGENTS.md standing rule).
- **No design/UI/layout/CSS/component changes.** The single copy string in Task 2 is the only
  exception and is pre-approved. If anything seems to need a UI change, STOP and report — do not freelance.
- **No prod migrations.** Validate locally, record in `supabase_migrations`, note pending prod apply.
- **Public copy boundary:** no provider/internal/implementation terms in any user-facing string.
- **Don't touch** onboarding, homepage, global CSS, design tokens, or the design system.

## Validation (run all; report exact results)

```
npx tsc --noEmit --incremental false
npm run lint
npm run build
npm run test:public-jobs
git diff --check
```

Known pre-existing lint warnings exist (e.g. an unused `listField`, scans/scripts warnings) — confirm
you did not add new ones. Do not call the build healthy without fresh output.

## Files you will likely touch

- `lib/scan/sources/board-registry.ts` — resolve fall-through
- `lib/scan/sources/connectors.ts` — reuse html/careers parsing (read; edit only if needed)
- `lib/scan/sources/llm-extract-posting.ts` — optional LLM fallback
- `lib/public-jobs/repository.ts` — add-flow verify, scan-fetch parity, new logging insert helper
- `lib/public-jobs/api.ts` — logging call in `handlePublicJobBoardAddRequest`
- `app/dashboard/DashboardClient.tsx` — the one pre-approved copy string only
- `supabase/migrations/<new>.sql` + `docs/database-migration-state.md`
- `scripts/test-public-jobs-repository.mjs` — new assertions

## Handoff

Follow the AGENTS.md `handoff` protocol on completion: stage the intended changes, commit, report the
commit hash and any remaining dirty files, and update this file (or a handoff note) with the exact
next step — including the **pending prod migration apply** that Randall must run. Do not report done
without a real commit hash and green validation.

---

## Codex completion handoff — 2026-07-12

Track A is implemented and committed on `main` (commit hash reported in the session handoff).

- Generic non-ATS careers URLs now resolve through the existing HTML connector, and add-time
  verification requires at least one plausible posting URL before insert.
- Existing ATS resolution, Gem blocking, board limits, duplicate behavior, dismissed-job behavior,
  scan concurrency, scan timeout, and per-board failure isolation remain in place.
- Unreadable adds are logged best-effort to `unrecognized_board_submissions`; logging errors do not
  change the existing 422 response.
- The approved dashboard failure sentence is installed without layout or CSS changes.
- Migration `20260712000100_unrecognized_board_submissions.sql` passed local PostgreSQL 16.14
  validation, then was applied to production with Randall's explicit authorization on 2026-07-12.
  Production schema and migration-history verification passed.
- Real-page connector checks on 2026-07-12 found plausible postings on TrainingPeaks (5), Airbnb
  careers (10 after navigation filtering), and Mozilla careers (30).

Next immediate starting point: use an authenticated production session to verify one unreadable
board add writes a submission row while returning the same 422, then add TrainingPeaks and run a
scan to confirm its postings appear for that user.

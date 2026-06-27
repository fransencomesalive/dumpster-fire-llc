# Codex Delegable Tasks — Sync 2026-06-27

Purpose: hand two self-contained, **backend/data-only** tasks to Codex so the
Claude session can stay focused on Phase D (onboarding UI + design system).
Both are scoped to be safe and unambiguous. **Read the Operating Rules first.**

## Operating Rules for Codex (do this before any edit)

1. Read `AGENTS.md` and `docs/project-operating-state.md` and follow the Session
   Start Protocol. Run `git status --short --branch` first.
2. **Do exactly one task per branch/commit. Stay inside the "In scope" file list.**
   If a task seems to require editing anything outside that list, **STOP and report**
   — do not improvise, do not "fix" adjacent code, do not redesign.
3. **Design Authority (hard):** do not create or edit any UI, CSS, layout, component,
   design token, font, public copy, onboarding, or dashboard file. These tasks are
   data/lib/API only. If you think UI is needed, that's Phase D (Claude) — stop.
4. **Secrets:** never write API keys, tokens, or `.env` values into any file or commit.
   Randall provides keys via env at runtime only.
5. **No new dependencies without asking.** If a task seems to need a new npm package,
   stop and report which one and why.
6. **Truthful git:** "committed" means `git commit` produced a hash; "pushed" means
   `git push` succeeded. Report the exact hash + remaining dirty/untracked files.
7. If anything is ambiguous, **report the ambiguity and wait** — do not choose creatively.
   The backend spine (Phases A–E of the generator redesign) is DONE and tested; do not
   refactor it.

---

## Task 1 — DONE 2026-06-27 (Claude, local Postgres 16). NO LONGER FOR CODEX.

Validated locally without Docker: full 17-migration set applies clean on a fresh DB
(stubbed `auth` schema), and seeding old-shape rows before A4 proved data preservation
(project_proofs→work_examples name→title/description→context, sample_type hate→bucket
never_sound, skill join preserved, work_history/communication_style dropped). See the A4
entry in `docs/generator-redesign-implementation-plan-2026-06-26.md`. Optional follow-up
for whoever sets up the Supabase local stack: a `supabase db reset` for RLS-vs-real-auth
fidelity. **Codex: skip Task 1 — go to Task 2.** Original task text retained below for record.

## Task 1 (original, for record) — Validate the A4 migration against a LOCAL database (do NOT edit the SQL)

**Goal:** prove that `supabase/migrations/20260627000100_generator_redesign_profile_schema.sql`
applies cleanly on top of the existing migrations, against a **local/disposable**
database only.

**Context:** this migration was written but never run (live-data status was unknown).
It is defensive (if-exists guards) and drops/restructures profile tables.

**Steps:**
- Use a **local** Supabase stack or a throwaway local Postgres. Recommended:
  `supabase start` then `supabase db reset` (applies all migrations from scratch).
- Confirm a clean apply with no errors.
- Spot-check the resulting schema: tables `fit_signals`, `work_examples`,
  `voice_personality`, `skill_work_examples` exist; `candidate_profiles` has no
  `work_authorization` / `availability`; `writing_samples` has `bucket` + `tags`
  (no `sample_type` / `why_it_works_or_fails`); `work_history_items` and
  `communication_style_settings` are gone.

**In scope:** running commands; **no file edits** except (optionally) appending a short
"verified locally on <date>: clean apply" note to the bottom of this doc.

**Hard prohibitions:**
- **Never run against the hosted/production Supabase project.** Do not `supabase link`
  to prod and `db push`. Local only.
- **Do not edit the migration SQL.** If it errors, capture the exact error output,
  report it, and STOP. Diagnosis is fine; "fixing" by rewriting the SQL is not —
  that needs Randall's review (the schema shapes are locked by the design docs).

**Definition of done:** a report stating the migration applied cleanly locally (with
the command output), or a precise error report if it did not. No code changes.

---

## Task 2 — D3 catalogue data + lookup lib + search API (NO onboarding UI)

**Goal:** build the **data + lookup + read-only API** layer for the three approved
catalogues so Phase D (Claude) can later wire pickers/autocomplete into the UI.

**Approved sources (already researched — do not re-research or swap providers):**
see `docs/onboarding-redesign-spec-2026-06-26.md` §7:
- §7a Skills — **Lightcast Open Skills** (open data).
- §7b Industries — the catalogue named in §7b.
- §7c Location (North America: US/CA/MX) — **GeoNames** `cities15000`, filtered to
  US/CA/MX, metro-level.

**Build:**
1. Import/derive the three datasets into static, committed data files under a new
   `lib/public-profile/catalogues/` (e.g. `skills.json`, `industries.json`,
   `locations.json`) — small, deduped, license-compliant (note the license/source at
   the top of each generation script). Add a `scripts/` generator for each that
   documents exactly how the file was produced, so it's reproducible.
2. A pure lookup module `lib/public-profile/catalogues/index.ts` exporting typed
   search functions, e.g. `searchSkills(query, limit)`, `searchIndustries(...)`,
   `searchLocations(...)` — simple prefix/substring ranking, no external calls at
   request time (data is bundled).
3. Read-only API routes that return search results for a `?q=` query, following the
   exact shape/auth pattern of the existing `app/api/public-profile/*` route +
   `lib/public-profile/api.ts` handlers (session-gated GET, `Cache-Control: no-store`).
   Suggested paths: `app/api/catalogues/skills`, `.../industries`, `.../locations`.
4. Tests in the repo's existing `.mjs` runner style (see
   `scripts/test-public-profile-*.mjs`) covering the lookup functions + handlers.

**In scope:** `lib/public-profile/catalogues/**`, the catalogue generator scripts under
`scripts/`, the new `app/api/catalogues/**` route files, new test scripts. The lookup
functions may be referenced later by Identity & Search / Skills — but **do not touch
the onboarding UI, OnboardingClient, CSS, or any design file** (that wiring is Phase D).

**Hard prohibitions:**
- No UI/CSS/design/onboarding edits. No changes to the generator-redesign spine
  (types/sections/repository/service/profile-markdown/quality/voice-fingerprint/
  outreach). No new runtime npm deps without asking (build the importer with Node
  built-ins + a one-off download documented in the generator script).
- Don't invent catalogue providers or schemas — follow §7. If §7 is missing a detail
  you need, STOP and report rather than guessing.
- Keep committed data files reasonably small (metro-level locations, deduped skills);
  if a raw dataset is huge, the generator script filters/derives the committed subset.

**Definition of done:** committed data files + reproducible generator scripts + typed
lookup module + session-gated read-only search routes + passing tests, with `tsc`
clean for the new files. Report commit hash + push result.

---

## Notes for the next Claude session (Phase D)

- **Phase D kicks off with the Claude design system / design-system updates** (Randall).
  Needs an approved design source before any onboarding/dashboard UI edit (D0). The
  only file left red in `tsc` is `app/onboarding/OnboardingClient.tsx` — it still uses
  the old section shapes and must be rebuilt to the new ~7-section IA (Voice & Personality:
  Q1/Q4 + 3-bucket samples + word counter + tone tags; Work Examples: title/oneHitter/
  link/context). Do not start until design direction is set.
- **ANTHROPIC_API_KEY (Phase C1):** Randall has it and will provide it in a safe manner
  on request (env only — local `.env` + Vercel). Until set, the voice fingerprint and
  outreach generator degrade gracefully (raw inputs / `model_unavailable`).
- If Codex completes Task 2, Phase D wires its `searchSkills/Industries/Locations`
  functions + `/api/catalogues/*` routes into the onboarding pickers.

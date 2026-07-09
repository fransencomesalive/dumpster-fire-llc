# Identity & Search remediation — decisions + execution plan (2026-07-08)

Decisions locked with Randall (2026-07-08, onboarding field review). Single source of
truth for this workstream across sessions/restarts. Numbering mirrors Randall's list.

## Decisions (locked)

1. **LinkedIn URL — REMOVE everywhere** (UI + backend + profile.md). We can't scan
   OAuth-gated profiles, so it earns nothing.
2. **Portfolio URL + Personal site URL — REMOVE everywhere.** Work Examples carry their
   own link field, which outreach actually uses; the identity URLs are redundant.
3. **Compensation — BOTH hourly and yearly inputs (no toggle).** Both stored, both
   rendered in profile.md, and matching scores against jobs that post either or both
   (normalize hourly↔yearly on the profile AND job side; job parser must recognize
   /hr-style postings; inputs must tolerate commas/$; currency is USD, stated).
4. **Comma-list space bug — FIX approved** (raw text preserved while typing; parse on
   save). Employment types become a multi-choice chip control: part-time / full-time /
   contract-freelance (per Randall's original direction), and employment type becomes a
   soft matching signal (spectrum, never a hard filter).
5. **Target industries — keep the custom-add path** (free text matches job text today);
   add the italic pre-loaded placeholder **"add your own, it'll match"** in the picker
   input (same italic treatment as Card 1's track-name placeholder).
6. **Unsaved fields MUST persist** while the browser stays open — leaving the tab/page
   without closing must not lose typed input. Mechanism: local draft persistence
   (localStorage, keyed per profile + section), hydrated after server load, cleared on
   reset/sign-out. Drafts win over server values until saved.
7. **Nothing ever ghost-replaces user-visible field content.** The email seed (bootstrap
   copies the sign-in email into a NEW profile) stays creation-only; combined with #6,
   reloads can no longer clobber typed-but-unsaved values.

## Execution order

**Phase A — no-design fixes (no approval gate; start immediately):**
- A1. Comma-list space bug: per-field raw-text draft state for every comma-list input
  (identity avoid-industries/company types/avoid companies, fit signals, skills
  evidence/fit/overclaim, outreach rules/proof types); parse to arrays continuously,
  display raw text.
- A2. Draft persistence (#6/#7): localStorage drafts per profile + section for all
  onboarding sections (incl. Card 1 name + pasted résumé text), hydrated after
  loadProfile, cleared on save… drafts equal-to-server are benign; cleared on reset and
  sign-out.

**Phase B — design (created ON Claude Design; see
docs/session-failure-2026-07-08-design-invention.md for the binding pipeline):**
- B0. GATE: DesignSync must be authorized. VERIFIED TIMELINE (2026-07-08): DesignSync
  worked from this same machine + VS Code entrypoint + app version through 07-07 17:56
  (12 calls incl. write_files, zero errors, no /design-login ever run, no design
  credential on disk — it rode the claude.ai login binding). First auth failure in
  history: 07-08 ~12:20, immediately after the daily OAuth token re-mint; today's token
  has NO `user:design:*` scopes (keychain-verified). `/design-consent` grants
  design-AGENT access — a different permission; it does not satisfy DesignSync.
  Unblock candidates, in order: (1) full re-login (`/logout` → `/login`) to re-mint the
  token through the complete flow; (2) `/design-login` in a terminal `claude` session;
  (3) Claude Design → "Send to Claude Code Web" and run Phase B there (this doc carries
  the full scope). Likely app/server regression: anthropics/claude-code issue #69496.
  Until unblocked Phase B is stopped; no local mockups, no localhost previews, no
  substitutes.
- B1. Ground via DesignSync (`list_files`/`get_file`) in the project's tokens, form
  primitives, chip primitive, and sibling onboarding cards.
- B2. Build the Identity & Search card INTO the Claude Design project (Onboarding
  group): URL fields gone; compensation = Yearly (min + preferred) AND Hourly (min +
  preferred), USD stated, comma/$-tolerant; employment-type chips (part-time /
  full-time / contract-freelance); target-industries input with italic placeholder
  "add your own, it'll match".
- B3. Randall reviews and approves IN Claude Design. Only the approved card authorizes
  Phase C.
- NOTE: the 2026-07-08 locally-invented card
  (`design-system/components/onboarding-identity-search.html`) is NOT a design source;
  it awaits Randall's direction (delete or ignore).

**Phase C — implement to the approved card:**
- C1. Remove the 3 URL fields: OnboardingClient, sections parse/types, repository
  mapping, profile.md lines, fixtures/tests. DB columns dropped via migration
  (prod-gated; record in supabase_migrations after apply, per
  docs/database-migration-state.md).
- C2. Compensation: new hourly fields (migration, additive), tolerant numeric parsing
  ("150,000", "$150k", plain digits), profile.md lines for both forms, matching scorer
  normalization both sides + job-side hourly detection (/hr, /hour, hourly).
- C3. Employment-type chips wired + soft matching signal vs job.employmentType.
- C4. Industries placeholder copy.

**Phase D — validation:**
- tsc/lint/build, full test suites (+ new tests: tolerant comp parsing, hourly↔yearly
  scoring, draft persistence round-trip, space-typing regression), rule-#9 visual pass
  at 320/375/390/1280/1440, Randall's localhost review, then commit/push with
  per-action OK.

## Standing constraints

- Claude Design outranks every doc; build B1 there and 1:1 back.
- Matching stays a spectrum — employment/comp signals nudge scores, never hard-filter.
- No "proof" vocabulary, no eyebrow kickers, teal = positive / tomato = destructive.
- Working tree also carries the not-yet-committed 2026-07-08 batch: profile reset
  button/endpoint, Anthropic-down scan note, in-dropzone upload bar (validated by
  Randall pending commit OK).

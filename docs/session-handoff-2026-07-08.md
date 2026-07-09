# Session handoff — 2026-07-08 (late) → next session

Start here. Read `docs/project-operating-state.md` (Session Start Protocol),
`docs/identity-search-remediation-plan-2026-07-08.md` (the active workstream), and
`docs/session-failure-2026-07-08-design-invention.md` (BINDING design pipeline) first.

## START HERE — next immediate step

**Phase B of the Identity & Search remediation, in Claude Design.**

DesignSync is AUTHORIZED and verified working: `/design-login` was completed 2026-07-08
~22:27 (driven via pty by Claude, approved by Randall); a dedicated `designOauth`
credential now sits in the macOS keychain next to the main token, and `list_projects`
returns the project ("Dumpster Fire Design System", `3af2f1ea-428c-49b3-8b02-c066ec0c7452`).
If it ever 401s again, the fix that worked: drive the bundled CLI
(`~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude`) through a
pty, run `/design-login`, Randall clicks Approve — never hand him manual steps
(memory: drive-flows-randall-approves).

Build these into the Claude Design project (Onboarding group), per the pipeline in the
failure doc (ground via list_files/get_file → build INTO the project → Randall approves
THERE → only then implement):

1. **Identity & Search card** — locked decisions (remediation plan #1–5): LinkedIn /
   Portfolio / Personal-site URL fields REMOVED; compensation = USD, Yearly (min +
   preferred) AND Hourly (min + preferred), no toggle, comma/$-tolerant inputs;
   employment types = tap chips (part-time / full-time / contract-freelance);
   target-industries input placeholder, italic: "add your own, it'll match".
2. **Sections-rail card** — parity with shipped code: 8 sections, "Role Track & Résumé"
   first, standalone "Resume Uploads" row gone.
3. **Card 1 (onboarding-resume-upload)** — parity states now live in prod code:
   in-dropzone upload/read progress bar (small scan-progress bar; shows during first-run
   scan AND Replace), Anthropic-down errNote ("Anthropic — the AI that reads your PDF —
   is having trouble right now." + link to https://status.claude.com), count-free
   "Read." okNote degrade, allowlisted-account Reset control.

## After design approval (Phase C, in order)

1. Remove the 3 URL fields end-to-end: OnboardingClient, sections.ts parse/types,
   repository mapping, profile.md lines, fixtures/tests; DB columns dropped via
   migration (prod-gated; record in supabase_migrations per docs/database-migration-state.md).
2. Compensation: additive migration for hourly fields; tolerant numeric parsing
   ("150,000", "$150k", "72.50"); profile.md lines for both; matching normalization on
   BOTH sides (profile hourly↔yearly, job-side /hr detection in
   `lib/public-profile/matching/scorers.ts` `parseSalaryAmounts`).
3. Employment-type chips wired + soft matching signal vs `job.employmentType`
   (spectrum, never a hard filter).
4. Industries placeholder copy.
5. Phase D: tsc/lint/build, all suites, rule-#9 visual pass (320/375/390/1280/1440),
   Randall localhost review, commit/push with per-action OK.

## Then (queued behind the above)

- **Outreach ingest test** (Randall's goal): needs from Randall — the résumé PDFs'
  location and a target job posting/contact. Flow: reset his profile (Card 1 Reset
  button, his account only) → ingest résumés via Card 1 → complete required sections →
  `POST /api/public-profile/regenerate` → `POST /api/public-profile/outreach`
  (job+contact body). NOTE: the direct outreach route lacks the lazy stale-regen the
  pursuit route has — regenerate first, or add the guard.
- Delete throwaway test user `df-card1-test@example.com` (Supabase auth id
  `a9b8dc22-6b1e-4ccc-8fd1-84953b15e521`) when done testing; reset its password via the
  admin API if needed (creds file lived in the old session scratchpad, now gone).

## Committed this session (see git log 2026-07-08)

- `0a01fcd` Card 1 rebuild (pushed earlier; verified live on prod).
- This handoff's commit: profile Reset (repo fn + email-gated POST /api/public-profile/reset
  + Card 1 button for fransencomesalive@gmail.com only + tests), Anthropic-down scan note,
  in-dropzone upload bar, comma-list space-bug fix (15 fields), localStorage draft
  persistence (drafts win over server until saved; clear on reset/sign-out; known
  trade-off: stale draft on one machine shadows newer cross-device edits until saved),
  remediation plan + failure docs.

## Loose ends / state to verify at session start

- **NOT committed, awaiting Randall's direction:** the invented
  `design-system/components/onboarding-identity-search.html` (NOT a design source, NOT
  approved — delete or ignore per Randall; see failure doc). `next-env.d.ts` dirty
  (auto-generated flip; never commit).
- Possibly still running from last session: dev server on :3020, python static server
  on :3021 (serves design-system/ — was part of the violation; kill it).
- Prod deploy: this push goes to main → Vercel → verify live per the standing rule.
- Sections-rail DS card + Card 1 DS card updates are the SAME work as Phase B items 2–3
  (don't double-track).

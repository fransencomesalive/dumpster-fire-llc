# Résumé highlights + Role Track "Card 1" — decisions, state, next steps

Date: 2026-07-07 (Randall + Claude). Single source of truth for this workstream.

## Product decisions (locked with Randall)

- **Auto-derive résumé highlights.** The model pulls quotable proof (stats, scope,
  titles/companies) from résumé text; the user does not hand-type highlights.
  Metered like the voice fingerprint (**3/month**), reuses cached highlights at the cap.
- **Highlights are routed per Role Track.** Each résumé's highlights render under every
  Role Track it's attached to in profile.md, so outreach matched to a lane quotes
  lane-relevant proof. (Also kept in the Résumés section as a fallback.)
- **Résumé intake = PDF only, scan-and-discard.** Claude reads the PDF natively
  (no parser lib, no Supabase Storage, no retention). We keep the extracted **text**
  (into `parsedText`) + a parse verdict; the file is never stored. The text box is
  always a fallback for any résumé that won't upload or won't parse.
- **A résumé belongs to exactly one Role Track** (single-select, required — no "also
  serves"). A user who needs one résumé across lanes makes a general Role Track.
- **Card 1 = Role Track setup.** Onboarding opens with a Role Track selector + its
  résumé, gated (nothing else unlocks until saved). Card 1 does **NOT** replace the
  résumé's existing fields or the scanning function — strengths / gaps / use-when /
  avoid-when stay as-is; job titles + metrics come from the scan/highlights. Nothing
  about the résumé model or its completion rules changes.
- **Role Track selector:** first run = a name field pre-filled italic "Create a new
  role track"; once ≥1 track is saved it becomes a **dropdown** listing saved tracks +
  a "Create a new role track" option. Creating a new track **prefills from an existing
  track's details** (duplicate-and-edit).
- **Per-track vs global split** (each per-track card shows an active-track chip):
  - Per Role Track: Résumé, Work Examples, Skills, Fit Signals, Outreach Rules.
  - You-once (global): Identity & Search, Voice & Personality.

## Built + verified (this session)

- **Highlights backend** — `lib/public-profile/resume-highlights.ts` (metered pre-pass),
  wired through `service.ts` (cap 3 + reuse + persist), `profile-generation.ts`
  (inject), `profile-markdown.ts` (`renderRoleTrack` routes highlights per lane).
  Highlights decoupled from the client section round-trip (system cache only).
  Tests: `test:resume-highlights`, plus markdown routing assertion. tsc/lint/build green.
- **PDF scan backend** — `lib/public-profile/resume-parse.ts` (Claude native PDF →
  `{parsingQuality, extractedText, issue?, suggestion?}`), handler `handleResumeScanRequest`
  in `lib/public-profile/api.ts`, route `POST /api/public-profile/resumes/scan`
  (auth-gated, 415 non-PDF, 413 >10MB, `model_unavailable` degrade). Test: `test:resume-parse`.
- **Migrations applied to prod + recorded**: `20260706000100_resume_highlights.sql`
  (highlights column), `20260707000100_resume_highlights_usage.sql` (usage_ledger check).
- **Design approved**: `design-system/components/onboarding-resume-upload.html`
  (titled "Onboarding · Role Track + Résumé (Card 1)") synced to Claude Design
  (project `3af2f1ea-428c-49b3-8b02-c066ec0c7452`, Onboarding group) and confirmed.

## Next steps

1. **Card 1 UI build (Phase 1b/1c)** — the remaining Phase-1 work. Restructure
   `app/onboarding/OnboardingClient.tsx`: Role Track selector (name→dropdown+create-new)
   + résumé (with the scan upload wired to `POST /api/public-profile/resumes/scan`;
   fill `parsedText` + `parsingQuality` from the verdict) as the first, gated card;
   single-track assignment via active track; active-track chip on per-track cards.
   Auth header for the upload fetch: `Authorization: Bearer <accessToken>`.
   **Requires a running instance for rule-#9 visual verification (mobile 320/375/390 +
   desktop 1280/1440).** Do NOT push without the visual pass.
2. **Phase 2 — per-track content** for Work Examples / Skills / Fit Signals: add a
   `roleTrackId` to each (migration + types + repository + sections + UI + chips).
   Outreach already has per-track rules. Bigger; self-contained after Card 1.

## Open sub-questions to confirm before/while building Card 1

- `fileUrl` is currently required for résumé completion but there's no stored file in
  scan-and-discard — recommend making it optional (a plain link), not required.
- Where the Role Track's rich fields (positioning, signals, titles…) live in Card 1 —
  the selector picks/creates the track; the rich editor for the active track sits on
  Card 1. Confirm layout with Randall against the canvas card.

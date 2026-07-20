# Handoff: Job + Message Feedback Flips (for Codex)

Date: 2026-07-19
Status at handoff: **committed on `main`, NOT pushed, NOT migrated, NOT deployed.**

## Codex's next action

1. `git push origin main` (this commit carries the whole feedback feature: UI + backend + migration + tests + design mirror).
2. Do **not** apply the migration or deploy yet. Randall runs production ("then we will push to production").

## What is in this commit

### Frontend (Claude built, verified)
- `app/dashboard/DashboardClient.tsx` — new `JobCard` component. The job card flips as one card to a feedback face. Trigger **"Not a match"** (red link, stacked under Open posting) → multi-select chips + a **"Something Else"** checkbox whose inline input is the free text → **Save wired to `POST /api/jobs/feedback`**. Action row restyled (Save/Skip/Pursue all grain-textured; Save teal, Skip tomato, Pursue teal; small new-tab Open-posting icon). The unapproved teal-tint hover was removed from Skip + Open posting.
- `app/dashboard/dashboard.module.css` — action row + flip/feedback-face styles.
- `app/dashboard/ApplyWizardModal.tsx` — **"This message is not great"** (red link under the Outreach message) flips the **entire modal** to the feedback face → chips + Something-else → **Save wired to `POST /api/public-profile/pursuits/outreach/[messageId]/feedback`**. Wizard step/message preserved underneath; Escape/Close flip back.
- `app/dashboard/apply-wizard.module.css` — modal flip + feedback-face styles.
- A11y: focus moves to the feedback heading on flip, returns to the trigger on close/save; only the visible face is focusable (`inert`); reduced-motion cross-fades instead of rotating; save is disabled until at least one chip is on or Something-else is checked.

### Backend (present in the shared worktree, now committed)
- `app/api/jobs/feedback/route.ts` + `lib/public-jobs/{api,repository,types}.ts` — job match feedback. Body `{ jobId, reasonCodes[], note? }`. Server recomputes/stores score, label, matcher + profile version; client match context is not trusted. Reason codes: `wrong_role_title`, `wrong_location_preference`, `wrong_comp`, `wrong_industry`, `other`.
- `app/api/public-profile/pursuits/outreach/[messageId]/feedback/route.ts` + `lib/public-profile/api.ts` + `lib/public-profile/pursuits/{repository,types}.ts` — message feedback. Body `{ reasonCodes[], notes? }`. Stores exact message snapshot + revision + pursuit/generation context. Reason codes: `wrong_skills_title_applied`, `personal_voice_mismatch`, `selected_tone_mismatch`, `awkward_to_read`, `would_not_send`, `other`.
- `supabase/migrations/20260719000100_feedback_capture.sql` — the persistence. Upserts by (user, job, matcher version, profile version) and by (user, message, revision, feedback type). Writes are server-only; DB constraints enforce the codes, at least one chip, note length, snapshot, ownership, revision uniqueness. No feedback write mutates jobs/scans/profiles/pursuits/messages/usage/matcher/generation.
- `scripts/test-feedback-migration.sh` (+ `package.json` script `test:migrations:feedback`) and updated fixture suites in `scripts/test-public-*`.

### Design parity
- `design-system/components/{feedback,match-card,dashboard-jobs,copy-generation,apply-wizard}.html` — the approved cards, mirrored from the Claude Design project (source of truth: project `3af2f1ea-428c-49b3-8b02-c066ec0c7452`). The `apply-wizard` card gained the full-modal flip. Repo mirror == Claude Design.

## Verification done (Claude)
- `npx tsc --noEmit --incremental false` clean.
- `eslint` clean (4 pre-existing unrelated warnings).
- `npx next build --webpack` green; both feedback routes compiled.
- Headless Chrome at 320 / 375 / 390 / 1280 / 1440 on the production-fidelity cards: 0 horizontal overflow, flips work, chips wrap. (Fixed a real mobile bug: the flip/feedback grids defaulted to a `max-content` column; constrained with `minmax(0, 1fr)`.)

## NOT done / remaining
- **Push** (Codex, above).
- **Apply the migration to prod + deploy** (Randall). The feature does not persist in production until `20260719000100_feedback_capture.sql` runs.
- **Live authenticated round-trip** not exercised (needs a real logged-in session + prod DB). Design verified at all five widths + build/types only. Confirm the real save flow once the migration is live.

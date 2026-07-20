# Handoff: Job + Message Feedback Flips (for Codex)

Date: 2026-07-20
Status: **release audit complete; Claude Design synced and verified; corrected release committed;
production migration applied and postflight-verified; push and deployment verification pending.**

## Release sequence

1. Commit the corrected release tree on `main`.
2. Run `scripts/sql/feedback-production-preflight.sql` against production.
3. Apply `supabase/migrations/20260719000100_feedback_capture.sql` and immediately record it
   in `supabase_migrations.schema_migrations`.
4. Verify the new schema, constraints, indexes, policies, privileges, and PostgREST visibility.
5. Push `main`, verify the Vercel deployment and both production aliases, then exercise one
   authenticated save for each feedback surface when a QA session is available.

The migration must run before the application deployment because the corrected code reads and
writes its new context columns.

## 2026-07-20 release-audit corrections

- `Something Else` is a labeled checkbox that activates its inline input. It is not a chip.
- Job feedback stores the exact match-relevant profile snapshot, job snapshot, match details, and
  immutable SHA-256 context hash. A preference change cannot overwrite earlier evidence.
- Message feedback is bound to the exact message revision and `updated_at` value. A changed draft
  returns `409 message_changed` instead of accepting stale feedback.
- Initial and regenerated messages retain immutable generation context, including profile version,
  voice/tone state, selected role/resume/work example, pursuit, job, and recipient.
- Job deletion retains the learning record and immutable snapshot through `on delete set null`.
- The migration is safely repeatable and its integration test applies it twice.
- Save/close async races are generation-guarded; hidden flip faces are inert and `aria-hidden`;
  the wizard traps focus and locks body scrolling while open.
- The mobile `Something Else` row uses a second-line input below 420px so the field remains usable
  at 320, 375, and 390px.

## Claude Design sync receipt

- Project: `3af2f1ea-428c-49b3-8b02-c066ec0c7452`
- Plan: `plan_3af2f1ea428c49b3_da8bd4049e9f`
- Six files written together: `_ds_manifest.json` plus the five affected component cards.
- Five cards registered through `register_assets` at a 1440 x 900 viewport.
- Readback verification: all six remote files exactly match the local `design-system/` mirror;
  all five HTML files retain `<!-- @dsCard group="Components" -->` as their first line.

## What is in this commit

### Frontend (Claude built, verified)
- `app/dashboard/DashboardClient.tsx` — new `JobCard` component. The job card flips as one card to a feedback face. Trigger **"Not a match"** (red link, stacked under Open posting) → multi-select chips + a **"Something Else"** checkbox whose inline input is the free text → **Save wired to `POST /api/jobs/feedback`**. Action row restyled (Save/Skip/Pursue all grain-textured; Save teal, Skip tomato, Pursue teal; small new-tab Open-posting icon). The unapproved teal-tint hover was removed from Skip + Open posting.
- `app/dashboard/dashboard.module.css` — action row + flip/feedback-face styles.
- `app/dashboard/ApplyWizardModal.tsx` — **"This message is not great"** (red link under the Outreach message) flips the **entire modal** to the feedback face → chips + Something-else → **Save wired to `POST /api/public-profile/pursuits/outreach/[messageId]/feedback`**. Wizard step/message preserved underneath; Escape/Close flip back.
- `app/dashboard/apply-wizard.module.css` — modal flip + feedback-face styles.
- A11y: focus moves to the feedback heading on flip, returns to the trigger on close/save; only the visible face is focusable (`inert`); reduced-motion cross-fades instead of rotating; save is disabled until at least one chip is on or Something-else is checked.

### Backend
- `app/api/jobs/feedback/route.ts` + `lib/public-jobs/{api,repository,types}.ts` — job match feedback. Body `{ jobId, reasonCodes[], note? }`. Server recomputes/stores score, label, matcher + profile version; client match context is not trusted. Reason codes: `wrong_role_title`, `wrong_location_preference`, `wrong_comp`, `wrong_industry`, `other`.
- `app/api/public-profile/pursuits/outreach/[messageId]/feedback/route.ts` + `lib/public-profile/api.ts` + `lib/public-profile/pursuits/{repository,types}.ts` — message feedback. Body `{ reasonCodes[], notes? }`. Stores exact message snapshot + revision + pursuit/generation context. Reason codes: `wrong_skills_title_applied`, `personal_voice_mismatch`, `selected_tone_mismatch`, `awkward_to_read`, `would_not_send`, `other`.
- `supabase/migrations/20260719000100_feedback_capture.sql` — the persistence. Upserts job evidence by immutable match-context hash and message evidence by exact message revision. Writes are server-only; DB constraints enforce the codes, at least one selected reason, note length, snapshots, generation context, ownership, and revision uniqueness. No feedback write mutates jobs/scans/profiles/pursuits/messages/usage/matcher/generation.
- `scripts/test-feedback-migration.sh` (+ `package.json` script `test:migrations:feedback`) and updated fixture suites in `scripts/test-public-*`.

### Design parity
- `design-system/components/{feedback,match-card,dashboard-jobs,copy-generation,apply-wizard}.html` — the approved cards, mirrored from the Claude Design project (source of truth: project `3af2f1ea-428c-49b3-8b02-c066ec0c7452`). The `apply-wizard` card gained the full-modal flip. Repo mirror == Claude Design.

## Verification done
- `npm run typecheck` clean.
- `npm run lint` clean with four pre-existing unrelated warnings.
- `npm run test:fixtures`: all 28 suites passed.
- `npm run build -- --webpack` green; both feedback routes compiled.
- `npm run test:migrations:feedback` green; the migration applies twice and retention, RLS,
  grants, reason codes, snapshot, uniqueness, and note constraints pass.
- Headless Chrome at 320 / 375 / 390 / 1280 / 1440 on both full-card flips: zero
  horizontal overflow; real flips, selection gate, labeled checkbox/input, close/reset,
  focus state, and reduced-motion fallback all pass.

## Remaining
- Commit the production migration-state receipt.
- Push `main` and complete Vercel and production-route verification.
- Exercise one authenticated production save on each feedback surface and confirm the related
  job, message, pursuit, profile, and usage records are unchanged.

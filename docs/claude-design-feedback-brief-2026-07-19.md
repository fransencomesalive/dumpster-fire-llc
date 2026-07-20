# Claude Design Brief: Job and Message Feedback Flips

Date: 2026-07-19
Claude Design project: `3af2f1ea-428c-49b3-8b02-c066ec0c7452`
Status: product behavior and Claude Design approved; production implementation is in release audit

## Mandatory design and review instruction

> Start in the Claude Design project through DesignSync. Ground first with `get_file`, then use
> `finalize_plan` and `write_files` to build the proposed states in Claude Design. Do not start by
> editing local design-system HTML, production JSX, or CSS. Do not use a localhost mockup or chat
> screenshot for review. Randall reviews and approves the interaction in Claude Design first.

After approval, mirror the exact approved cards into the repo and implement the same design in
production in one parity pass. The repo-backed design-system mirror and production UI must land
together. Do not create a design-system-only repo commit that leaves production out of parity.

This brief locks product behavior and the feedback data contract. Claude owns visual hierarchy,
spacing, motion details, responsive composition, focus treatment, and any new supporting copy that
Randall has not already approved. Do not infer production UI approval from this brief. Production
implementation starts only after Randall approves the Claude Design result.

## Outcome

Bring lightweight feedback back to the public product without rebuilding the legacy feedback
dashboard or exposing tuning controls.

- A job card gets a direct feedback trigger and flips as one complete card.
- The Apply Wizard gets a message-specific feedback trigger and flips as one complete modal.
- Feedback uses multi-select chips plus an optional note.
- Saving only records evidence. It does not take another product action.
- After a meaningful sample exists, Codex analyzes the evidence and presents a proposed matching
  or generation change to Randall. Nothing tunes itself and no change is applied without approval.

Do not describe this as a beta, rollout, limited release, or coming-soon feature in public copy.

## Locked behavior

### Job match feedback

- Approved trigger label: **Not a match** (Randall confirmed the shorter Claude Design label was approved in chat.)
- The trigger belongs on the existing production job card.
- Activating it flips the entire job card to its feedback face.
- This is separate from **Skip**. Saving feedback must not dismiss, hide, skip, save, pursue, or
  otherwise change the job.
- The feedback is tied to the exact job plus the server-computed matcher and profile versions.

Approved multi-select chips and stable codes, plus the separate Other control:

| Public label | Stable code |
|---|---|
| Wrong role/title | `wrong_role_title` |
| Wrong location preference | `wrong_location_preference` |
| Wrong Comp | `wrong_comp` |
| Wrong Industry | `wrong_industry` |
| Something Else checkbox that activates its inline note input | `other` |

Preserve the approved capitalization exactly unless Randall changes it during the Claude Design
review.

### Message feedback

- Approved trigger label: **This message is not great**
- The trigger belongs to the exact generated message/draft being evaluated.
- Activating it flips the entire Apply Wizard modal, not only the message textarea or message panel.
- The feedback must remain tied to that message ID, exact message snapshot, and revision.
- Saving feedback must not edit, reject, approve, regenerate, copy, or send the message. It must not
  change pursuit state, consume usage, or change the user's profile or voice settings.

Approved multi-select chips and stable codes, plus the separate Other control:

| Public label | Stable code |
|---|---|
| Wrong skills/title applied | `wrong_skills_title_applied` |
| Doesn't sound like Me | `personal_voice_mismatch` |
| Doesn't sound like selected tone | `selected_tone_mismatch` |
| Awkward to read | `awkward_to_read` |
| I wouldn't send this | `would_not_send` |
| something else checkbox that activates its inline note input | `other` |

Preserve the approved capitalization exactly unless Randall changes it during the Claude Design
review.

### Shared save and close contract

- Chips are multi-select.
- **Something Else / something else is a labeled checkbox, not a chip.** Checking it activates the
  inline optional note input. The note has a 500-character backend maximum.
- **Save** is disabled until at least one chip is selected or the Other checkbox is checked. This
  specific gate is approved.
- A close control is always available on the feedback face.
- Closing flips back to the original face, saves nothing, and discards unsaved selections.
- A successful Save persists the feedback and flips back to the original face.
- Saving must not block the user's workflow.
- Do not add any other gate, forced sequence, required note, rating, slider, tuning control, or
  dashboard.

## Required flip behavior to design and approve

The flip is a real, simple animation, not a swap disguised as a new panel. Claude must show and
obtain approval for both the job-card and full-modal versions.

Design these requirements:

1. Front face at rest.
2. Trigger activation and transition to the feedback face.
3. Feedback face with no chip selected and Save disabled.
4. One selected chip.
5. Multiple selected chips.
6. Optional-note treatment, including the 500-character limit.
7. Saving state that prevents duplicate submission while keeping Close visibly available.
8. Persistence-error state that keeps the user's selections available for retry.
9. Successful-save transition back to the front.
10. Close-without-save transition back to the front.
11. `prefers-reduced-motion` treatment with no disorienting rotation.
12. Stable dimensions and scroll behavior so neither the card stack nor modal jumps unpredictably.

The approved animation must also define:

- Keyboard activation for the trigger, chips, Save, and Close.
- Focus transfer to the feedback heading or first meaningful control after the flip.
- Focus return to the originating trigger after Close or successful Save.
- Only the visible face in the accessibility tree. The hidden face must not remain focusable.
- Clear selected, hover, pressed, disabled, busy, error, and keyboard-focus states.
- Full clickable target bounds.
- How the Apply Wizard feedback face behaves inside the existing modal focus trap and scroll lock.

Claude must present the Escape-key and backdrop-click behavior for approval. Do not silently decide
whether either action flips back or closes the entire Apply Wizard.

## Decisions Claude must surface, not silently invent

Present a recommendation for each of these in the numbered review:

1. Resolved: the input stays visible but disabled until the labeled **Something Else** checkbox is checked.
2. The unapproved feedback-face heading, note label/help text, saved acknowledgement, and error copy.
3. Escape-key behavior on the Apply Wizard feedback face.
4. Backdrop-click behavior while the Apply Wizard feedback face is open.
5. Whether reopening feedback in the same browser session restores the last saved/selected chips or
   starts clean. The current backend has save/upsert endpoints but no feedback-read endpoint.
6. How a full-modal flip preserves the user's current wizard step, message, scroll position, and
   unsaved wizard state.
7. What Close does after a Save request has already started. Before Save starts, Close always saves
   nothing. Once a request is in flight, Claude must not imply that Close cancels or rolls back the
   write unless the implementation contract explicitly adds request cancellation and Randall
   approves it.
8. Whether a saved acknowledgement appears on the restored front face or only during the return
   transition. It must not delay or block the approved flip back after a successful Save.

Do not add public copy that exposes matcher versions, profile versions, message revisions, database
status, providers, prompts, model details, or internal feedback-analysis plans.

## Claude Design grounding sources

Start with DesignSync `get_file` against the project. Pull the current approved tokens, base
primitives, and these cards before proposing a change:

- `design-system/components/dashboard-jobs.html`
- `design-system/components/match-card.html`
- `design-system/components/apply-wizard.html`
- `design-system/components/copy-generation.html`
- `design-system/components/modal.html`
- `design-system/components/feedback.html`
- `design-system/tokens/tokens.css`
- `design-system/lib/base.css`

Important context:

- `apply-wizard` is currently revision r7 in Claude Design.
- `copy-generation` is currently revision r2.
- `modal` is currently revision r2.
- The existing `feedback.html` shows the legacy star/rating treatment. That behavior is not the new
  contract. Use it only for approved visual heritage, then replace or revise it in Claude Design to
  specify the chip-based flip interaction.
- Do not create a redundant new primitive if the existing feedback card can become the canonical
  feedback-flip specification. If Claude recommends a new card, include that decision in the review.

Legacy product behavior may be inspected read-only at commit `4e1e5d0`, especially:

- `app/scans/DashboardClient.tsx`
- `app/scans/TUNING_PLAN.md`
- `app/scans/ARCHITECTURE.md`

The legacy implementation is behavioral history only. Do not bring back its always-visible stars,
large dashboard, ratings, tuning interface, thresholds, levers, or automatic application of
changes. No legacy readiness threshold is approved for the public product.

## Required card scope

Update in Claude Design:

- `design-system/components/feedback.html` as the canonical flip and chip interaction reference
- `design-system/components/match-card.html` for the full job-card flip
- `design-system/components/dashboard-jobs.html` for the job-card behavior in page context
- `design-system/components/apply-wizard.html` for the full-modal message feedback flip
- `design-system/components/copy-generation.html` for the exact message trigger placement/context
- `design-system/components/modal.html` only if the shared modal shell or close behavior changes
- `design-system/_ds_manifest.json` for every touched or created card

Sweep any other manifested card that displays the affected job-card actions or generated-message
controls. Do not edit unrelated cards.

## Expected production mapping after design approval

The approved design is expected to map to:

- `app/dashboard/DashboardClient.tsx`
- `app/dashboard/dashboard.module.css`
- `app/dashboard/ApplyWizardModal.tsx`
- `app/dashboard/apply-wizard.module.css`

Do not touch `app/globals.css`, token foundations, homepage surfaces, onboarding, or unrelated
public copy unless the approved Claude Design result demonstrates a necessary change and Randall
separately approves that expanded file scope.

Before production edits, list the exact approved Claude Design card/revision mapped to each file and
wait for Randall's explicit design-scope approval.

## Backend contract already present in the shared worktree

Backend capture is implemented but currently uncommitted, not pushed, not deployed, and not applied
to production. Claude must re-check git status rather than assuming these files are on `origin/main`.

Job endpoint:

- `POST /api/jobs/feedback`
- Body: `{ jobId, reasonCodes, note? }`
- Route: `app/api/jobs/feedback/route.ts`
- Server recomputes and stores score, label, matched signals, matcher version, evaluated time, and
  profile version. Client-supplied match context is not trusted.

Message endpoint:

- `POST /api/public-profile/pursuits/outreach/[messageId]/feedback`
- Body: `{ reasonCodes, notes?, expectedMessageRevision, expectedMessageUpdatedAt }`
- Route: `app/api/public-profile/pursuits/outreach/[messageId]/feedback/route.ts`
- Server verifies ownership and stores the exact message snapshot, revision, and available pursuit
  and generation context.

Persistence:

- Migration: `supabase/migrations/20260719000100_feedback_capture.sql`
- Job feedback upserts by user, job, matcher version, and an immutable hash of the exact match inputs.
- Job feedback retains structured profile, job, and match-detail snapshots for later analysis even
  if the live job row is removed.
- Message feedback upserts by user, message, revision, and feedback type.
- Message feedback stores the generation request plus the generation-time profile version, voice
  settings, selected role/resume/work example, job, and recipient context. Regenerations carry a
  separate immutable context snapshot.
- Authenticated browser clients have owner-scoped reads but cannot write directly. Writes are
  server-only so analysis context cannot be forged.
- Database constraints enforce the exact codes, at least one chip, note length, message snapshot,
  ownership, and revision uniqueness.
- No feedback write mutates jobs, scans, profiles, pursuits, messages, usage, matcher behavior, or
  generation behavior.

Verification already completed on the current worktree:

- 28 fixture suites passed.
- TypeScript passed.
- ESLint passed with zero errors and four unrelated existing warnings.
- `next build --webpack` passed and included both routes.
- `npm run test:migrations:feedback` passed against isolated PostgreSQL.
- `git diff --check` passed.
- The default Turbopack build stalled during optimization twice and was stopped. This remains a
  release-check gap even though the webpack production build passed.

Do not apply the migration, deploy, push, or change backend behavior as part of the design pass
without separate authorization.

## Responsive verification requirements

Claude Design must show the job-card and Apply Wizard feedback states at:

- 320px
- 375px
- 390px
- 1280px
- 1440px

Verify chips wrap without horizontal overflow, there are no single-word orphans or widows, buttons
retain full target areas, modal content remains reachable, and both faces preserve usable
dimensions. Public copy must contain no em dashes.

After production implementation, repeat browser verification at all five widths. Confirm no
overflow, no navigation overlap, no single-word orphans or widows, full clickable target bounds,
correct focus transfer and return, no hidden-face tab stops, usable modal scrolling and focus trap,
and the approved reduced-motion behavior. Claude Design review does not replace production browser
verification.

## Claude Design review deliverables

Present a numbered review in Claude Design containing:

1. Exact card names and new revision names.
2. Exact production file/component mapping.
3. Job-card front, transition, feedback face, saving, error, Close, and saved-return states.
4. Apply Wizard front, exact-message trigger, full-modal transition, feedback face, saving, error,
   Close, and saved-return states.
5. Chip default, selected, hover, pressed, focus, disabled, and wrapping behavior.
6. Optional-note recommendation and all proposed supporting copy.
7. Stable-height, scrolling, focus-trap, and hidden-face accessibility behavior.
8. Keyboard, focus-return, reduced-motion, Escape, and backdrop behavior.
9. Behavior at all five required breakpoints.
10. Any unresolved design or product decision.

Randall should be able to reply by number. Do not use screenshots pasted into chat or localhost for
this review.

## Full design-sync checklist

For every touched card:

1. Keep `<!-- @dsCard group="..." -->` as the first line.
2. Ensure `_ds_manifest.json` contains the card.
3. Push the manifest with the card files.
4. Run `register_assets` with the card name, a subtitle describing the change, and viewport.
5. Mirror the exact approved card and manifest files into the repo's `design-system/` directory.
6. Sweep every card showing the affected job action or generated-message controls.
7. After design approval, commit the repo-backed design files and matching production UI together
   on `main`. If a remote-only design review checkpoint exists first, do not call repo parity done.
8. Report registered card names, commit hash, remaining dirty files, and incomplete parity work.

The design is not approved, synced, or complete unless every required registration and parity step
succeeds.

## File ownership

During the Claude Design phase, Claude owns:

- Claude Design project work
- The design-system cards and manifest listed in this brief

After Randall approves the design and exact file scope, Claude may own the four expected production
UI/CSS files listed above.

The current backend work owns:

- `app/api/jobs/feedback/route.ts`
- `app/api/public-profile/pursuits/outreach/[messageId]/feedback/route.ts`
- `lib/public-jobs/api.ts`
- `lib/public-jobs/repository.ts`
- `lib/public-jobs/types.ts`
- `lib/public-profile/api.ts`
- `lib/public-profile/pursuits/repository.ts`
- `lib/public-profile/pursuits/types.ts`
- `package.json`
- `scripts/test-public-jobs-repository.ts`
- `scripts/test-public-profile-api.ts`
- `scripts/test-public-profile-pursuits.ts`
- `scripts/test-feedback-migration.sh`
- `supabase/migrations/20260719000100_feedback_capture.sql`

Do not overwrite or reformat the dirty backend files during design work. All work stays on `main`.
If another session owns an overlapping file, pause and coordinate before editing.

## Next immediate starting point

1. Run `git status --short --branch` and confirm `main` plus the existing dirty backend work.
2. Read `AGENTS.md`, `docs/project-operating-state.md`, and this brief.
3. Open Claude Design project `3af2f1ea-428c-49b3-8b02-c066ec0c7452` through DesignSync.
4. Use `get_file` to ground in tokens, base primitives, `feedback`, `match-card`,
   `dashboard-jobs`, `apply-wizard`, `copy-generation`, and `modal`.
5. Build both full-surface flip interactions in Claude Design with the locked chips and behavior.
6. Present the numbered Claude Design review. Stop before production UI edits until Randall approves
   the design and exact implementation scope.

# Card 1 onboarding rebuild — mistakes to fix next session

Date: 2026-07-07. The OnboardingClient Card 1 revision attempted this session was
**bad and was reverted** (never committed — `main` deploys to prod, so broken onboarding
must not land). Backend work is committed and good (`8c2f9e7`). Next session rebuilds the
Card 1 **UI** from scratch, correctly. Read this + `docs/resume-role-track-card1-plan-2026-07-07.md`
(decisions) + the approved design before touching `app/onboarding/OnboardingClient.tsx`.

## What went wrong (Randall's feedback, verbatim intent)

1. **Did not follow the approved Claude Design.** The implementation diverged from the
   approved card `design-system/components/onboarding-resume-upload.html` ("Onboarding ·
   Role Track + Résumé (Card 1)"). That card is the **source of truth** — build to it
   (its states, structure, dropzone, chip, copy), don't improvise a different layout.

2. **Deleted fields that must be preserved.** The restructure dropped résumé fields,
   including the **résumé PDF upload control and the résumé text input**, and reorganized
   the résumé editor incorrectly. The résumé model does **not** change — every existing
   field stays: name, upload (PDF), resume text, strengths, gaps, use-when, avoid-when,
   readiness, resume link. Card 1 wraps role-track setup + the résumé around these; it does
   not remove or replace them.

3. **The Role Track selector flow is broken** — "more broken" than before. Specific bugs:
   - Auto-seeded empty "Untitled role track" entries (strict-mode effect double-fire, and
     the whole seeding approach was wrong).
   - "Create a new role track" did not open a blank name input then save — it auto-added an
     "Untitled" entry to the dropdown.
   - Selecting an option behaved wrong (no save prompt; drafts persisted incorrectly).
   - Placeholder text rendered bold (looked saved) instead of light/italic.
   - The native dropdown arrow is too small (needs styled control).

## The correct approach for next session

- **Build to the approved DS card, exactly.** Treat `onboarding-resume-upload.html` as the
  spec. Match: first-run **name input** (light/italic "Create a new role track"); once a
  track is **saved** the field becomes a **dropdown** (saved tracks + "＋ Create a new role
  track"); choosing create-new opens a **blank name input**, and nothing persists until
  **Save**; the active-track **chip**; the **PDF dropzone** (styled, not a bare file input,
  arrow/controls sized right); the résumé **text** fallback + paste helper; the error states
  (wrong file type, non-parsable).
- **Preserve every résumé field.** Do not delete upload / text / strengths / gaps /
  use-when / avoid-when / readiness / link. Résumé is single-track (belongs to exactly one
  Role Track — the active one).
- **Card 1 = role-track setup** (name/selector + the track's rich fields) **+ its résumé**,
  as the first card. It replaces the two separate Role Tracks and Résumés cards.
- **No section locking.** Gating happens naturally via incomplete fields (Randall: don't
  build explicit locks).
- **Selector state model** (get this right): distinguish *saved* tracks from the single
  *in-creation draft*; the draft is the name-input state and is not in the switch dropdown;
  do not auto-seed empty tracks; guard against strict-mode double-fire.
- **Sections rail (`sections` prop):** still lists the old order — "Resume Uploads" is now a
  dead anchor. Update the rail to reflect Card 1 (Role Track + Résumé first) and drop the
  separate Résumés entry. Note this is entangled with readiness/blocker mapping
  (`reasonBelongsToSection`, profile-quality reason prefixes like `resumes.*`) — reconcile.
- **`fileUrl` → optional** (open decision): scan-and-discard leaves no stored link, so a
  scanned-only résumé can't currently complete (`profile-quality.ts` requires `fileUrl`).
  Confirm with Randall, then relax the requirement.
- **Verify live with Randall incrementally** — build to the design, show it, iterate. Do not
  big-bang the whole component.

## Data cleanup to check

The broken version may have persisted empty "Untitled role track" rows if any got saved.
Next session: check the user's `role_tracks` for blank-name rows and clean them (via the
Management API or the app), so the dropdown isn't polluted.

## What IS good and committed (do not redo)

- Highlights backend (metered, role-track-routed) + PDF scan-and-discard backend
  (`resume-parse.ts`, `POST /api/public-profile/resumes/scan`) — committed `8c2f9e7`,
  tested, prod migrations applied. Next session only needs to WIRE the scan endpoint into
  the correctly-built Card 1 UI (auth: `Authorization: Bearer <accessToken>`; on `scanned`
  fill `parsedText` + `parsingQuality`; handle 415/413/`model_unavailable`).
- Approved design card synced to Claude Design (Onboarding group).

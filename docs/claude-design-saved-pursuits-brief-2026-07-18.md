# Claude Design Brief: Saved Pursuits

Date: 2026-07-18
Product contract: `docs/saved-pursuits-feature-spec-2026-07-18.md`

## Mandatory design and review instruction

> This work must be completed and reviewed in the Claude Design project. Do not render an
> independent mockup, create an ad hoc visual outside Claude Design, or use localhost for
> review. Claude Design is the sole design and review surface for this phase. Update the
> repo-backed design-system cards, register every touched card, and present the review in
> Claude Design.

Claude owns all visual and interaction decisions for this feature. Codex supplies the locked
behavior and data contract. Claude must not change classification, tracking semantics,
metering, persistence requirements, or backend behavior. Codex must not invent missing
hierarchy, layout, component structure, copy treatment, interaction states, or CSS after the
design handoff.

## Design order

1. Update Apply Wizard Step 4 Tracking first.
2. Treat that updated Tracking design as the sole source of truth.
3. Create the Applied saved-pursuit context by reusing the same Tracking design.
4. Design the Saved Pursuits page around Saved for Later and Applied.
5. Update entry points and affected vocabulary.
6. Sweep every card showing affected behavior, actions, vocabulary, or Offer.

Tracking is not a new standalone component. It is an update to the existing Apply Wizard
Tracking step. The saved Applied context must use the same design and production component.

## Locked product behavior

- Destination: Saved Pursuits
- Desktop buckets: Saved for Later and Applied, visible simultaneously
- Mobile buckets: toggle between Saved for Later and Applied; never stack both lists
- Any positive tracking action promotes a never-tracked pursuit to Applied
- Applied classification never automatically reverses
- Six independent actions:
  1. Sent Outreach Message
  2. Applied online
  3. Received response
  4. Interviewing
  5. Not moving forward
  6. Never Heard back
- Offer is removed and receives no replacement action
- Save for later when a never-tracked pursuit has zero positive checks
- Save to Applied after its first positive check
- Successful first Copy records Sent Outreach Message
- Applied opens Tracking directly with saved data and performs no generation
- First successful initial message generation consumes the pursuit; saving, Copy, tracking,
  and Applied classification consume no additional pursuit
- Never Heard Back is manual only
- No mutually exclusive actions or new gates

## Required card scope

Update:

- `design-system/components/apply-wizard.html`
- `design-system/components/dashboard-jobs.html`
- `design-system/components/onboarding-account-bar.html`
- `design-system/components/home-human-path.html`
- `design-system/components/detail.html` because its manifested Application Details state
  overlaps saved pursuit tracking and must be reconciled or explicitly retired
- `design-system/components/modal.html` only if the shared shell genuinely needs a new state
- Plan/pricing cards containing Saved Jobs or Offer vocabulary

Create:

- `design-system/patterns/saved-pursuits-page.html`

The new page belongs in the manifest's Patterns group. Do not create a second independent
Tracking card for Applied. Applied must map to the updated Step 4 in `apply-wizard.html`.

## Apply Wizard Tracking states to design

1. Six unchecked actions with Save for later.
2. One checked action with Save to Applied.
3. Multiple checked actions.
4. Resumed Saved for Later with prior Review, Contacts, and Outreach artifacts.
5. Successful Copy reflected as Sent Outreach Message.
6. Uncheck/reversal treatment that preserves the dated history.
7. Copy succeeded but tracking persistence failed, with an honest retry/recovery state.
8. Applied saved context with current actions and existing messages.
9. Applied context with no generation or regeneration controls.
10. Missing recipient-link state.
11. Honest legacy-history state where exact message, recipient, or timestamp is unavailable.

The saved context must preserve structural and visual parity with the Apply Wizard Tracking
state. Contextual controls may differ only where the locked behavior requires it.

## Designed pursuit history

The phrase timestamped activity log describes the data requirement, not the visual design.
Design a human-readable pursuit history rather than a literal system-log or administrator
table.

The design must support:

- Human-readable dates and times
- Tracking marks and reversals
- Message sent entries with a recipient
- Expandable exact saved-message text
- Recipient link to the original LinkedIn profile when available
- Plain recipient text when the link is unavailable
- Multiple messages and recipients without ambiguity

Do not show event codes, database status names, IDs, JSON payloads, providers, generation
internals, or recovery-session commentary. Claude owns the hierarchy, grouping, date treatment,
expansion interaction, labels, and wording.

## Saved Pursuits page states

### Desktop

- Saved for Later and Applied visible simultaneously as two columns
- Counts for both buckets
- Last-activity ordering
- Populated state
- Empty state for either or both buckets
- Loading state
- Error and retry state
- Raw saved posting with no wizard work
- Partially completed Saved for Later pursuit
- Applied pursuit
- Inactive, dismissed, expired, removed-source, and pasted-posting states

### Mobile

- Toggle between Saved for Later and Applied
- Only one bucket visible at a time
- Never stack the two buckets
- Define the default bucket
- Define selected, hover, pressed, and keyboard-focus treatment
- Include counts without causing overflow
- Full target bounds for the toggle and cards
- Validate at 320, 375, and 390 pixels

Desktop must also be reviewed at 1280 and 1440 pixels.

## Entry points and vocabulary sweep

- Activate Saved Pursuits in the onboarding/profile account bar.
- Remove its Coming Soon tooltip and disabled semantics.
- Reconcile dashboard Save and View saved behavior with Saved Pursuits.
- Replace Saved Jobs vocabulary where the new canonical feature applies.
- Remove Offer everywhere in the touched product and design surfaces.
- Reconcile the homepage Records walkthrough.
- Reconcile plan/pricing cards showing the affected capability.
- Use Work Examples or portfolio language, never proof vocabulary.
- Use no em dashes in public copy.

## Claude Design review deliverables

Present a numbered review in Claude Design containing:

1. Exact approved cards and revision names.
2. Exact production component/file mapping.
3. Desktop two-column behavior.
4. Mobile toggle behavior and default state.
5. Every Apply Wizard Tracking state.
6. Applied-context parity behavior.
7. Pursuit-history hierarchy and labels.
8. Expandable message and recipient-link behavior.
9. Copy persistence-failure and retry treatment.
10. Empty, loading, unavailable, and error states.
11. Any unresolved design decision.

Do not use screenshots pasted into chat or localhost for review. All review happens in Claude
Design.

## Full design-sync checklist

For every touched card:

1. Keep `<!-- @dsCard group="…" -->` as the first line.
2. Ensure `_ds_manifest.json` contains the card.
3. Push the manifest with the cards.
4. Run `register_assets` with the card name, a subtitle describing the change, and viewport.
5. Mirror the exact card and manifest files into the repo's `design-system/` directory.
6. Sweep every card showing the affected surface, behavior, action, vocabulary, or Offer.
7. Commit the repo-backed design files on `main`.
8. Report registered card names, commit hash, remaining dirty files, and incomplete parity work.

The design phase is not complete, approved, or synced unless every checklist item succeeds.

## File ownership during Claude's design phase

Claude owns:

- Claude Design project work
- `design-system/` cards and manifest included in this brief

Codex may work concurrently only in non-overlapping backend files after the data contract is
locked:

- `supabase/migrations/`
- pursuit backend/domain modules under `lib/`
- `app/api/` route handlers
- backend test scripts

Codex must not edit dashboard/onboarding UI, CSS, public copy, or `design-system/` while Claude
owns this phase. If file ownership overlaps, both workstreams pause and coordinate on `main`.

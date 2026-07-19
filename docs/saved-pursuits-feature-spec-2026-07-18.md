# Saved Pursuits Feature Specification

Date: 2026-07-18
Status: Product scope approved; design and implementation not yet complete
Authority: Randall's approved Saved Pursuits decisions from 2026-07-18

## Purpose and authority

This is the canonical product and backend specification for Saved Pursuits. It supersedes
the older Saved Job versus Pursuit split, linear tracking lifecycle, ten-column pursuit
board, and Offer action wherever those concepts conflict.

This specification authorizes planning, data, backend, API, migration, and test work. It
does not authorize Codex to invent or implement UI, layout, CSS, component structure, or
public copy before Claude completes and Randall approves the required work in Claude Design.

Saved Pursuits adds no onboarding questions and requires no new Candidate Profile fields.

## Locked decisions

1. `pursuits` becomes the canonical saved-opportunity record. `saved_jobs` retires only
   after a verified migration and reconciliation pass.
2. Any of the six approved tracking actions promotes a never-tracked record to Applied.
3. Review selections, contacts, and generated messages may exist while a pursuit remains
   Saved for Later.
4. The first successful clipboard copy of a specific saved message records Sent Outreach
   Message and promotes the pursuit to Applied. Re-copying the same message is idempotent.
5. Unchecking records a reversal in pursuit history. It never automatically moves an
   Applied pursuit back to Saved for Later.
6. Never Heard Back is manual only. The system never infers or schedules it.
7. Not moving forward is intentionally neutral about who ended the pursuit.
8. Offer is removed. It has no new control, public label, tracking action, accepted API
   value, or replacement mapping.
9. Inactive, dismissed, expired, removed-source, and pasted postings remain accessible
   through immutable saved snapshots.
10. Saved Pursuits is a protected full page. Applied cards open the shared Apply Wizard
    Tracking experience in a saved-pursuit context.
11. Results suppression (Randall 2026-07-18). A posting that becomes inactive, is dismissed,
    is skipped, expires, or has its source removed disappears from scan/dashboard results. It
    must also be recorded so it is never surfaced again as a result on a later scan. The
    suppression record persists independently of whether the user ever saved the posting.
    Auto-expiring suppression records after 30 days is desirable but conditional: build the
    30-day TTL only if maintaining that layer of the database is not problematic; otherwise
    suppression persists indefinitely. This is a backend/data-model requirement, not a design
    change, and is not yet implemented.

## Product vocabulary

- Destination: **Saved Pursuits**
- Buckets: **Saved for Later** and **Applied**
- Role Track selection: **Applying As**
- The user-facing dated record is a designed **pursuit history**, not a technical log.
- Do not use Saved Jobs on the new destination.
- Do not use proof vocabulary. Use Work Examples or portfolio language where relevant.
- Public copy and generated messages contain no em dashes.

## Canonical record and classification

There is one user-owned canonical pursuit per saved opportunity.

### Saved for Later

- The pursuit has never committed a positive tracking action.
- Direct save and the Apply Wizard's Save for later action create or update the same record.
- The original posting snapshot is captured on first save.
- Existing Review, Human Path, contact, and outreach artifacts do not change the bucket.
- Opening the record resumes the normal Apply Wizard with persisted choices and artifacts.
- Zero checked actions on a never-tracked pursuit keeps the CTA at **Save for later**.

### Applied

- The first committed positive tracking action latches `tracking_started_at`.
- A successful first Copy event for a message is a positive tracking action.
- Once promoted, unchecking every current action does not demote the pursuit.
- Opening an Applied record loads the shared Tracking experience directly.
- Opening Applied Tracking must not call Review, Human Path, contact discovery, message
  generation, or regeneration endpoints.
- Persisted messages, recipients, selections, tracking state, and pursuit history remain
  available without consuming generation usage.

## Tracking actions

The six independent actions are:

1. Sent Outreach Message
2. Applied online
3. Received response
4. Interviewing
5. Not moving forward
6. Never Heard back

Rules:

- The actions are independent multi-select facts. There are no mutual-exclusion gates.
- Every mark and unmark receives a server timestamp.
- Current check state is derived from the latest operation for that action.
- Unchecking appends a reversal. It does not delete or rewrite earlier history.
- Never Heard Back is never automated.
- Offer is not a tracking action, status, event, API input, or public label in the new model.
- A first positive check changes a never-tracked CTA to **Save to Applied**.
- An already Applied record remains Applied after later reversals.

## Message Copy contract

Only a confirmed successful clipboard write triggers persistence.

The first successful Copy of a specific message must atomically and idempotently:

- Mark Sent Outreach Message as currently checked.
- Latch Applied classification if it has not already started.
- Store the server timestamp.
- Link the pursuit, outreach message, and contact where available.
- Snapshot the exact copied message text.
- Snapshot recipient name, title, and original LinkedIn URL where available.

Copying another message creates a separate dated message-history entry while the shared Sent
Outreach Message action remains checked. Re-copying the same message creates no duplicate.

Copy is available only at the live Outreach step. In the pursuit history the same message is
shown as a read-only, non-selectable record with no copy control, so saved outreach cannot be
reused for a different recipient by swapping the name.

The browser clipboard operation and server persistence cannot be one physical transaction.
If Copy succeeds but persistence fails, the approved UI must expose a retry/recovery state and
must not claim that tracking was saved.

## Designed pursuit history

The user-facing history is a designed record, not a raw database or administrator log.

It must support these data capabilities:

- Human-readable dates and times for marks and reversals.
- Dated Message sent entries with the recipient.
- An expandable Message sent entry that reveals the exact saved message snapshot as a
  read-only record.
- A recipient link to the original scraped LinkedIn profile when available.
- Plain recipient text when no LinkedIn URL exists.
- Honest unavailable states for legacy data that cannot prove a date, recipient, or message.

The revealed message is view-only. The pursuit history exposes no copy control, and its
message text is not selectable, so a sent message cannot be recycled for a different
recipient by swapping the name (Randall 2026-07-18). The only message-copy action is the
live Apply Wizard Outreach step; the history is a record, not a reuse surface.

It must never expose technical IDs, event codes, raw payloads, model/provider details,
backend status names, or recovery commentary. Claude owns the hierarchy, grouping, expansion
treatment, date presentation, and public wording in Claude Design.

## Snapshot requirements

Capture the original posting on first save:

- Job ID where still available
- Source and source URL
- Title and company
- Full description
- Responsibilities and required experience
- Location, remote type, employment type, and compensation text
- Posted, scraped, first-seen, and snapshot timestamps where available
- Posting availability/source state

Snapshot mutable pursuit context when selected or used:

- Applying As Role Track label and relevant narrative
- Resume label
- Work Example label
- Contact name, title, company, and LinkedIn URL
- Exact copied/sent message text and channel

History belongs primarily to `user_id`. Rebuilding or deleting a Candidate Profile must not
destroy saved pursuit history. New or migrated profile/job foreign keys must be nullable,
`ON DELETE SET NULL`, or backed by immutable snapshots.

## Backend model

The intended model contains:

- One canonical `pursuits` row per user and opportunity.
- `pursuits.tracking_started_at`, latched by the first positive tracking action.
- Immutable posting/context snapshots on the pursuit or in a dedicated owned snapshot table.
- An append-only `pursuit_tracking_events` table containing:
  - pursuit and user ownership
  - action code
  - marked or unmarked operation
  - server occurrence and creation timestamps
  - source such as manual, message copy, or migration
  - optional outreach-message and contact relationships
  - immutable message and recipient snapshots where applicable
  - idempotency key
- A transactional database function or equivalent atomic boundary for tracking mutations.

The existing scalar pursuit status may remain temporarily for migration compatibility, but
it must not represent the six independent tracking facts. Workflow progress and tracking
facts are separate concepts.

Results suppression (locked decision 11, not yet implemented) needs its own owned ledger,
keyed by user and posting identity, that scan/dashboard result queries consult so a
dismissed, skipped, expired, inactive, or removed-source posting is never re-surfaced. It is
distinct from `pursuits`: a suppressed posting need not be a saved pursuit. A 30-day TTL /
cleanup pass on this ledger is optional and should be added only if it does not become a
maintenance burden; without it, suppression persists indefinitely.

## API contract

### List

`GET /api/public-profile/saved-pursuits`

- Returns `savedForLater`, `applied`, counts, summary fields, and last activity.
- Orders each bucket by latest user activity unless the approved design specifies an
  additional user-controlled sort.
- Does not include message bodies, contact email, LinkedIn URLs, or raw event payloads.

### Detail

Owned pursuit detail returns:

- Posting snapshot
- Applying As and other saved context
- Saved contacts and messages
- Current tracking state
- Structured pursuit-history entries suitable for the approved presentation

Applied detail reads are generation-free and must be covered by tests proving that no
generation dependency is called.

### Tracking mutation

- Accepts multiple independent changes in one request.
- Uses server timestamps and idempotency keys.
- Atomically records current state, classification, and append-only history.
- Supports correction/unmark operations without deleting history.

### Message Copy

- Ownership-checks the message through its pursuit.
- Records the first successful Copy once per message.
- Atomically links message, contact, tracking state, classification, and immutable snapshots.

All routes are owner-scoped at both the handler and database-policy layers.

## Existing-user migration

1. Run preflight counts before any production writes:
   - `saved_jobs` rows
   - pursuits by status
   - jobs represented in both tables
   - pursuit events by type
   - outreach messages by status
   - saved rows hidden by inactive scan-result filtering
   - legacy Offer rows
2. Convert `saved_jobs` without pursuits into unmetered Saved for Later pursuits.
3. Merge duplicate saved/pursuit records into the existing pursuit and preserve notes and
   all existing wizard artifacts.
4. Backfill valid tracking facts from:
   - `outreach_sent`
   - `applied`
   - `responded`
   - `interviewing`
   - `rejected`
5. Map those values to the six-action vocabulary without inventing missing information.
6. Never map Offer to Never Heard Back or any other new action. Offer is excluded from the
   user-facing history and new model. Preflight/export its legacy count before any destructive
   cleanup, and require explicit production migration approval for irreversible deletion.
7. Do not invent historical Copy timestamps, recipients, message linkage, or sent evidence.
8. Validate the migration locally, idempotently, and against representative fixtures.
9. Reconcile record counts and representative users before retiring `saved_jobs` writes.

## Access, profile, and metering

- Saved pursuit history remains accessible if the current Candidate Profile later becomes
  incomplete.
- Actions that create new Human Path or outreach content retain their existing profile and
  subscription enforcement.
- Save for later is unmetered.
- Human Path and outreach generation metering remains unchanged.
- The first successful initial outreach-message generation for an opportunity consumes one
  pursuit. This is the point at which the paid pursuit work has occurred.
- Additional messages for the same pursuit and the one allowed regeneration retain their
  existing outreach-message metering, but do not consume another pursuit.
- Opening the wizard, direct save, Save for later, tracking changes, message Copy, and the
  Applied classification do not consume pursuit usage.
- The existing pursuit-usage debit currently occurs when the wizard opens. Backend
  implementation must move that enforcement and debit to first successful initial message
  generation.
- The pursuit debit, generated messages, outreach-message debits, and pursuit-metered latch
  must commit atomically and idempotently.
- During migration, an existing pursuit usage-ledger entry for the same pursuit counts as its
  prior debit. Do not charge that pursuit again when generating its first post-migration
  message.

## Resume requirements carried from the diff audit

- A resumed Saved for Later pursuit restores contacts whose persisted
  `selected_for_outreach` value is true.
- Confidence is only an initial discovery default. It must not overwrite saved contact choices.
- Applied records never replay Review or contact-selection transitions because they open
  directly in Tracking.
- The existing intermediate resume fix is not proof that all advanced linear statuses can
  safely replay every wizard step.

## Non-goals

- No automatic application submission.
- No automatic Never Heard Back.
- No message generation or regeneration when opening Applied Tracking.
- No new onboarding/profile fields.
- No automatic archive or deletion.
- No new gating or mutual-exclusion behavior.
- No Offer replacement.
- No design or public-copy invention by Codex.

## Acceptance criteria

### Functional

- Direct save and wizard Save for later produce the same canonical record.
- Saved for Later resumes the normal Apply Wizard with persisted selections.
- Applied opens the shared Tracking experience directly.
- Every combination of the six actions can be stored.
- CTA text follows the approved classification rules.
- Reversals preserve history and Applied classification.
- Copy success, persistence failure, retry, and duplicate Copy are handled idempotently.
- Multiple recipients and message snapshots remain distinct.
- Saved messages in the pursuit history are read-only and non-selectable, with no copy or
  reuse control.
- Inactive, dismissed, expired, removed-source, and pasted postings remain accessible.
- Offer is absent from new types, APIs, tests, designs, production UI, and public copy.
- Applied Tracking invokes zero generation work.

### Security and data

- Two-user fixtures prove owner isolation for list, detail, tracking, and Copy routes.
- Profile rebuild fixtures prove history durability.
- Migration fixtures prove idempotence and record-count reconciliation.
- List responses exclude sensitive detail fields.

### Design and responsive

- The page shows one bucket at a time through a Saved for Later / Applied toggle at every
  breakpoint. The two buckets are never shown side by side and never stack. The default
  bucket is Saved for Later. (Randall 2026-07-18, supersedes the earlier two-column desktop
  model.)
- Verified at 320, 375, and 390 pixels and at 1280 and 1440 pixels.
- The Apply Wizard and saved Applied context use the same approved Tracking component.
- The pursuit history reads as a designed record, not a technical log.
- No overflow, navigation overlap, clipped targets, or partial clickable hit areas.
- No em dashes in affected public copy.

### Engineering verification

- Local migration validation and idempotent reapply
- Focused domain, repository, API, ownership, and backfill tests
- `npx tsc --noEmit --incremental false`
- `npm run lint`
- `npm run build`
- `npm run test:public-jobs`
- Public-profile API and pursuit suites
- `git diff --check`
- Production HTTP 200 and authenticated end-to-end verification before release completion

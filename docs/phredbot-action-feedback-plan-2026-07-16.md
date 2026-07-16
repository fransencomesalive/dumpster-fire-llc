# PhredBot Action Feedback and Execution Plan

Date: 2026-07-16
Status: P0 live; durable Codex lifecycle implemented; safe executor activation blocked
Scope: PhredBot owner actions for Dumpster Fire QA reports

## Product problem

Phred accepts Telegram approval taps without durable, action-specific feedback. The owner
cannot tell whether an action started, succeeded, failed, or only created a local artifact.
The original notification and its full action menu remain unchanged after a tap, so completed
and no-longer-valid actions still look available.

This makes the approval flow behave like a black box even when the relay executes the action.

## Evidence from live JOB-010

The relay store confirms that all three reported taps executed on 2026-07-16:

1. `draft_user_reply` created a pending reply draft.
2. `approve_user_reply` marked that draft sent, but the configured delivery channel was
   `local_outbox`. It wrote a text file under the relay's `outbox/user-replies/` directory.
3. `send_to_codex` created a task packet with status `ready` under `outbox/codex/`. It did
   not start a Codex session or report task progress.

The only owner-facing acknowledgement is a generic Telegram callback answer of `Approved` or
`Rejected`. It is sent after execution, is transient, and does not include the ticket, action,
result, destination, or next step. The relay does not edit the notification, disable the selected
button, or post a durable result message. Callback failures are only audited and rethrown.

The live flow also exposes lifecycle problems:

- Reply approval closed JOB-010, then Codex approval moved it to `ready_for_codex` because
  sibling approvals remain valid after a terminal action.
- Reply approval is offered before a reply draft exists, even though it depends on one.
- `send reply` implies external delivery, but the current adapter only writes a local file.
- `Approve Codex` implies work begins, but the current adapter only queues a local task packet.
- The generated Codex packet requires a branch, conflicting with this repo's `main`-only rule.

## Owner-action contract

Every action must expose a truthful lifecycle in Telegram:

1. **Accepted:** acknowledge the tap immediately and name the action being processed.
2. **Completed:** persist an action-specific result tied to the ticket.
3. **Failed:** show a durable failure with a useful reason and safe retry path.
4. **Current state:** remove or disable completed, invalid, and superseded actions.
5. **Downstream progress:** distinguish queued, claimed, running, completed, and failed work.

Labels must describe what the configured adapter actually does. Until external workers or
delivery exist, use language such as `Queue Codex task`, `Save reply draft`, and `Write reply
to outbox`. Do not call an outbox write a sent response or a started Codex task.

## Development plan

### P0: Make outcomes visible and truthful

- [x] Answer callbacks immediately with an action-specific processing acknowledgement.
- [x] Post a durable result containing ticket, action, outcome, status, and destination.
- [x] Surface action failures in Telegram and audit Telegram feedback-delivery failures.
- [x] Update the notification after every action and remove invalid buttons.
- [x] Relabel Codex, draft, and reply actions to match actual configured behavior.
- [x] Make generated Codex packets follow the Dumpster Fire `main`-only workflow.

P0 acceptance criteria:

- Success and failure produce durable messages with the ticket and action name.
- The conversation distinguishes queued Codex work from started work.
- The conversation distinguishes drafted, locally written, and externally delivered replies.
- Repeated taps cannot silently rerun a completed action.

### P1: Enforce a coherent lifecycle

- [ ] Generate actions from current ticket state instead of creating all approvals at intake.
- [x] Do not offer reply approval until a reply draft exists and is previewed.
- [x] Invalidate conflicting and terminal sibling approvals after a state change.
- [x] Prevent later actions from overwriting a terminal state without an explicit transition.
- [x] Define GitHub, backlog, and Codex routing as mutually exclusive routes.
- [x] Add Codex task states: `queued`, `claimed`, `running`, `completed`, and `failed`.
- [x] Post a durable Telegram update whenever a downstream task changes state.

P1 acceptance criteria:

- Telegram only presents actions valid for the current ticket state.
- A terminal action leaves one unambiguous terminal state.
- Reply approval shows exactly what will be delivered and through which channel.

### P2: Add QA and operating visibility

- [x] Test immediate acknowledgement, durable success, durable failure, notification update,
  invalid-button removal, timeout, duplicate tap, concurrent tap, and expired approval.
- [x] Test draft-before-send, terminal sibling invalidation, and Codex lifecycle progression.
- [x] Prevent local outbox writes from reporting external delivery in adapter-contract tests.
- [x] Add a status summary with artifacts, latest action, ticket state, and downstream state.
- [x] Measure accepted, completed, failed, timed-out, retried, and duplicate callbacks.
- [ ] Run a live rehearsal through every action outcome, including a forced failure.

P2 acceptance criteria:

- Tests prove both internal state changes and owner-visible Telegram feedback.
- One ticket can be traced from intake to final outcome without reading JSON, outbox files,
  or service logs.
- The operator can separate relay health, action health, and downstream worker health.

## Verification checklist

For every action, verify:

1. Tap acknowledgement appears immediately.
2. The selected action runs once.
3. A durable success or failure message appears.
4. Ticket status and available buttons match the result.
5. Any downstream artifact or task is locatable from Telegram.

The flow is not QA-complete until these checks pass for draft, reply, Codex, GitHub, backlog,
close, reject, duplicate tap, expiry, timeout, and adapter failure.

## Implementation and verification status

Implemented in `/Users/randallfransen/Sites/dumpster-fire-relay` on 2026-07-16:

- Action-specific `Working` or `Rejecting` callback acknowledgement is attempted before work.
- Every completed or failed action posts a durable Telegram receipt before the original
  keyboard is refreshed.
- Duplicate, expired, unauthorized, concurrent, failed, and restart-abandoned approvals have
  explicit handling. A failed or abandoned action restores alternatives it temporarily locked.
- GitHub is only reported complete when the adapter confirms issue creation; successful receipts
  include the issue URL or number.
- Draft approval is gated on a saved preview. Local outbox delivery is reported as queued locally,
  not sent externally, and does not close the ticket.
- Codex is labeled and stored as queued. The task packet follows repo instructions and the
  Dumpster Fire `main`-only rule. No downstream worker currently claims or runs that task.

Automated verification:

- Exact committed release tree: 519 tests, 510 passed, 0 failed, 9 skipped.
- The provisioning contamination was fixed by making complete CLI install identity override the
  ambient project manifest; explicit and partial manifest workflows remain intact.
- The Postgres live suite remains skipped because `TEST_DATABASE_URL` is not configured. Production
  continues to use the verified JSON store for this release.
- Syntax check and `git diff --check` passed.

Live rehearsal JOB-011:

1. Relay restarted under `com.dumpsterfire.qa-relay`; `GET /healthz` returned HTTP 200.
2. Intake delivered Telegram message 10 with truthful action labels.
3. `Save reply draft` created a preview, posted a durable receipt, and refreshed the keyboard to
   offer `Deliver approved reply` only after the draft existed.
4. The rehearsal ticket was closed through the same approval path; it ended `closed` with zero
   pending approvals.
5. Synthetic callback IDs cannot receive Telegram's transient callback toast. Those two expected
   acknowledgement failures were audited. Durable receipt and keyboard delivery succeeded. A real
   user tap supplies a valid callback ID and is covered by the callback tests.

Production release and JOB-012 validation:

1. Relay commit `def7429` was pushed to `origin/main` and activated under
   `com.dumpsterfire.qa-relay` after an exact-hash backup of the live JSON store.
2. Host-local and public `HEAD` probes for health, readiness, and service metadata returned HTTP
   200. The production verification suite passed.
3. A fresh smoke intake delivered Telegram message 13. The card excluded the unavailable GitHub
   action and retained the independently available `Queue Codex task` action.
4. Authenticated production callbacks verified draft approval, reply approval, card refresh, and
   durable receipts. Reply approval wrote to the local outbox and said so explicitly.
5. Codex approval created task `7b1902ca-15b4-4ea8-9c96-e6716c0efd74` in durable `queued` state.
   No executor claimed or started it.
6. The old JOB-010 `ready` task migrated once to `legacy_quarantined` with reason
   `legacy_task_requires_manual_review`.
7. Telegram still retains a historical 403 dated `2026-07-16T16:01:03Z`, from before the admin
   chat ID was corrected. Pending updates are zero, current webhook metadata matches, later real
   actions succeeded, and the fresh authenticated callback path returned HTTP 200.

Operator visibility release and JOB-013 validation:

1. Relay commit `c8954f3` was pushed to `origin/main` and activated after a second exact-hash JSON
   store backup.
2. `/status JOB-012` reported the latest owner action, local reply artifact and explicit
   non-delivery, canceled Codex state, task artifact, and cancellation reason in one Telegram
   response.
3. `/metrics` now reports accepted, completed, failed, timed-out, retried, and duplicate callbacks
   for the previous 24 hours. Live results were `Accepted: 2`, `Completed: 1`, `Retried: 1`, and
   `Duplicate: 2`, with zero failed or timed-out callbacks.
4. Repeating the same completed approval twice returned explicit `approval_no_longer_pending`
   conflicts, posted durable failure feedback, and incremented retry and duplicate metrics.
5. The queued JOB-012 smoke task was canceled through a loopback-only, operator-secret transition.
   It remains attempt 0 and cannot be claimed. The one-time operator secret was removed afterward.
6. JOB-013 exercised a successful post-deploy callback and ended closed with no reply or Codex task.
7. The exact committed release tree passed 526 tests: 517 passed, 0 failed, and 9 opt-in
   integration tests skipped. Public health and readiness returned HTTP 200; the service error log
   remained empty.

The downstream lifecycle foundation is also implemented:

- Approval atomically publishes one task from `pending_approval` to `queued` and persists the
  first `queued, not started` Telegram progress receipt.
- A token-fenced, loopback-only worker API supports claim, start, heartbeat, completion, failure,
  explicit retry, and lease recovery without duplicate task transitions.
- Claimed work whose lease expires before start returns to the queue. Running work whose lease
  expires fails without automatic retry because repository changes may be uncertain.
- Telegram progress delivery is durable, ordered per task, leased to one dispatcher, retried with
  backoff, and audited as a dead letter after five failures. One dead letter cannot hide a later
  state for that task.
- JSON state uses serialized atomic writes and survives restart. Matching Postgres schema,
  transaction, claim-fencing, trigger, and opt-in live tests are present.

The separate local Codex executor prototype is deliberately excluded from the release. The
prototype requires clean
`main`, verifies the canonical GitHub repository identity, locks canonical paths across symlink
aliases, preflights before claiming, invokes Codex with pinned no-network `workspace-write`
policy, kills its process group on abnormal exit, ignores raw stderr, derives changed files from
Git, and quarantines the workspace after commits or failed runs with partial changes.

Production hardening also supports `HEAD` probes for health, readiness, and service metadata.
Legacy JSON or Postgres Codex tasks left in the old `ready` state are moved once to
`legacy_quarantined` with an audit trail rather than silently stranded or automatically claimed.

This does not make activation safe. Review proved that a direct local Codex process can still
read reusable Codex authentication and ignored workspace secrets, while its private lock cannot
exclude concurrent Claude or human edits. Enabling it in the shared checkout would turn an
untrusted QA report into a credential and repository-integrity risk.

Required activation design:

1. Run each task in a disposable, secret-free checkout pinned to the approved `main` commit.
2. Broker Codex authentication outside the model-command environment so tool subprocesses cannot
   read a reusable API key or ChatGPT token.
3. Keep relay, Telegram, GitHub, Vercel, and application secrets outside the runner process and
   checkout.
4. Produce a bounded patch and verification result, then apply it to the real clean `main` only
   through a separate trusted reconciliation step.
5. Add worker registration, last-seen health, queue-age warnings, and an operator-visible
   quarantine/reconciliation workflow before making `Queue Codex task` executable.
6. Run the opt-in Postgres concurrency test and a live disposable Codex smoke before activation.

Until those gates pass, the truthful product behavior is: approval confirms the task is queued
and not started; no automatic worker claim occurs. This fixes the disappearing approval outcome,
but not automatic code execution.

## Implementation ownership

Implementation lives in `/Users/randallfransen/Sites/dumpster-fire-relay`, primarily:

- `apps/api/app.js`
- `packages/adapters/telegram/callback-handler.js`
- `packages/adapters/telegram/telegram-client.js`
- `packages/core/approvals/action-router.js`
- `packages/core/actions/action-registry.js`
- `packages/core/tickets/status-transitions.js`
- focused tests under `tests/`

Executor and lifecycle implementation also owns:

- `packages/core/codex/`
- `scripts/codex-task-lifecycle.js`
- `db/migrations/005_codex_task_lifecycle.sql`

The local executor, worker client, workspace guard, and worker entrypoint remain uncommitted
concurrent-development prototypes. They are not part of release commit `def7429`.

No Dumpster Fire UI or public copy change is authorized by this plan. Coordinate relay file
ownership before implementation because Claude has concurrent work in progress.

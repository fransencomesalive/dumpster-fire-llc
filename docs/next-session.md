# Next Session: Site Bug, Phase 4 Preserved

_Updated 2026-07-27. Read `AGENTS.md` and follow the Session Start Protocol in
`docs/project-operating-state.md` before editing._

## 2026-07-27 site bug release

The approved site-bug session is implemented in code commit `a54e3ff`
(`Fix reported dashboard and pursuit bugs`). The release contains only the reported fixes:

- feedback saves compare timestamps by instant, so equivalent database timestamp formatting no
  longer creates a false stale-draft error;
- feedback error notices use the approved resume-upload alert treatment without the exclamation
  icon, with matching production and design-system files;
- creating a pursuit also maintains the temporary `saved_jobs` compatibility row, so returning
  from Saved Pursuits preserves the saved state;
- outreach generation receives the selected Role Track, rejects titles from alternate tracks, and
  never persists a message that still violates a hard generation rule after retries;
- Saved Pursuits includes the approved Dashboard and Run scan actions above its heading, and the
  Run scan shortcut focuses the existing dashboard action without automatically spending a scan;
- Human Path accepts a finite set of employer identities only when the current posting explicitly
  states the relationship. Ordinary exact-company searches are unchanged, no extra search pass is
  added, unrelated client-company contacts remain excluded, and empty results remain unmetered.

Verification completed before the release commit:

- the full `npm run release:check` gate passed all billing and Saved Pursuits migration harnesses,
  all 34 fixture suites, TypeScript, lint with four pre-existing warnings and zero errors, and the
  production build;
- a real three-lane Exa smoke test for the Haldren/Keller posting returned three useful contacts
  without an additional provider pass;
- responsive rendered QA passed at 320, 375, 390, 1280, and 1440 pixels without horizontal
  overflow, clipped actions, or orphaned alert copy;
- dashboard and styleguide localhost header checks returned HTTP 200;
- `git diff --check` passed and the added lines contain no em dashes.

The local production/design-system parity files are committed. Remote `register_assets` for the
touched Claude Design cards was not available because this Codex session had no connected Claude
Design document session. Do not describe that remote card state as synced until it is registered
and read back.

**Resolved 2026-07-27 (Claude session).** The remote design sync below is complete and verified.
See "Claude Design remote sync result" at the end of this section.

### Claude Design follow-up for Claude

Randall wants Claude to complete this in the next Claude session. This is a remote design-system
sync task only. Production is already live at code commit `a54e3ff`; do not revise the approved
layout, copy, CSS, behavior, or production components while completing the sync.

Use Claude Design project `3af2f1ea-428c-49b3-8b02-c066ec0c7452` and bring these committed local
mirrors into remote parity:

1. `design-system/components/apply-wizard.html`
   - feedback alerts no longer include the exclamation icon;
   - the Human Path empty state explains the posting-backed Keller Executive Search fallback and
     that an empty result did not count toward the Apply Wizard total.
2. `design-system/components/dashboard-jobs.html`
   - feedback alerts no longer include the exclamation icon.
3. `design-system/components/feedback.html`
   - feedback alerts no longer include the exclamation icon.
4. `design-system/patterns/saved-pursuits-page.html`
   - Dashboard and Run scan actions appear above the Saved Pursuits heading using the approved
     mustard utility and teal proceed button roles.

Follow the full design-sync checklist:

1. Read each committed card and confirm its first-line `@dsCard` marker.
2. Confirm every card remains present in `design-system/_ds_manifest.json`.
3. Push the exact committed card state to the Claude Design project without creative changes.
4. Run `register_assets` for every card above with an accurate change subtitle and viewport.
5. Read the remote cards and asset registrations back to verify project, card content, manifest
   presence, and refreshed registration.
6. Record the successful remote sync and readback in this handoff. If any remote content differs,
   stop and report the discrepancy instead of changing production to match stale remote content.

### Claude Design remote sync result (2026-07-27, Claude session)

Completed. No design, copy, CSS, layout, or production file was changed; this was a push of the
already-committed `a54e3ff` card state plus registration and readback.

Project verified before writing: `3af2f1ea-428c-49b3-8b02-c066ec0c7452`, "Dumpster Fire Design
System", `PROJECT_TYPE_DESIGN_SYSTEM`, `canEdit: true`.

Plan `plan_3af2f1ea428c49b3_7eceab2f0a8a` wrote 5 files from `design-system/` with zero deletes:
the four cards plus `_ds_manifest.json`. `register_assets` returned 4 registered cards with change
subtitles at viewport width 1280:

- `components/apply-wizard.html` (Components): icon-free feedback alert; Human Path empty state
  explains the posting-backed search company and that it did not count toward the total.
- `components/dashboard-jobs.html` (Components): icon-free feedback alert.
- `components/feedback.html` (Components): icon-free feedback alert, all states.
- `patterns/saved-pursuits-page.html` (Patterns): Dashboard/Run scan actions above the heading.

Readback evidence, all four cards fetched from the project after the write and compared against the
committed local mirrors:

- `patterns/saved-pursuits-page.html`, `components/feedback.html`,
  `components/dashboard-jobs.html`, and `components/apply-wizard.html` each came back
  byte-identical to the local file, `truncated: false`, with the first-line `@dsCard` marker intact
  (27,138 / 44,380 / 61,280 / 93,650 bytes respectively).
- Change-specific confirmations in the remote content: no `<svg>` inside any `feedbackAlert` block;
  the new alert treatment (`color-mix(in srgb, var(--c-tomato) 10%, var(--c-paper))` plus a 6px
  tomato left border) present in both `dashboard-jobs` and `feedback`; the Keller Executive Search
  empty-state copy, the "did not count toward your Apply Wizard total" sentence, and the Keller
  LinkedIn query present in `apply-wizard` with the old OpenAI query gone; the `pageActions` nav
  present in the Saved Pursuits top bar and in both the 375 and 320 frames.
- `_ds_manifest.json` was read before the push and already listed all four cards; the local manifest
  (48 cards, unchanged since `c536002`) was pushed in the same plan.

No remote discrepancy was found, so no production file needed reconciling.

### Edit Profile shortcut correction (2026-07-27, approved by Randall in session)

Randall's correction to the `a54e3ff` Saved Pursuits buttons: the Dashboard button was right, the
Run scan button should never have been there. It is replaced by an Edit Profile action that returns
the user to the profile form, and the same action is added to the dashboard Overview card.

Approved direction, given item by item in session: keep mustard; use the edit pencil icon inside the
button; remove the now-dead scan focus plumbing; leave the retired `patterns/scan-page.html` card
stale.

Implemented:

- `app/saved-pursuits/SavedPursuitsClient.tsx`: the Run scan shortcut is now Edit Profile linking to
  `/onboarding`, carrying the canonical edit pencil.
- `app/saved-pursuits/saved-pursuits.module.css`: `.dashboardAction` and the removed teal
  `.scanAction` collapse into one shared mustard `.utilityAction`; `.pageAction` gains a
  `var(--space-2)` icon gap.
- `app/dashboard/DashboardClient.tsx`: the Overview card gains an Edit Profile button under View
  Saved Pursuits, reusing the existing mustard `.scanSecondaryBtn` primitive. The
  `#dashboard-run-scan` hash-focus effect and the matching button id, both added in `a54e3ff` only
  to serve the removed Saved Pursuits link, are deleted.
- `app/dashboard/dashboard.module.css`: a stacking gap for adjacent mustard utility buttons plus
  `.editProfileBtn` icon centering.
- Design-system parity in the same pass: `patterns/saved-pursuits-page.html` (top bar plus the 375
  and 320 frames) and `components/dashboard-jobs.html` (Overview card).

Verification:

- typecheck clean; lint 0 errors with the same four pre-existing warnings; production build passed.
- Rendered QA in headless Chrome at 320, 375, 390, 1280, and 1440 pixels. Both controls measure
  mustard `rgb(224, 165, 47)` on ink text, the pencil sits left of the label, and the two Overview
  buttons are equal width with a `var(--space-3)` gap. The nav wraps to two full-height 46px rows at
  320 and sits on one row from 375 up.
- Pre-existing and unchanged by this work: both demo cards overflow a 320-pixel viewport by 43 and 9
  pixels because of their fixed-width phone/demo frames. Rendering the committed `HEAD` cards
  produced the identical 43 and 9 pixel values. Not fixed here, per bug-fix scope discipline.
- Claude Design sync completed under plan `plan_3af2f1ea428c49b3_b0af61535e9a`: 2 writes, 2 assets
  registered, and both cards read back byte-identical to the local mirrors with `truncated: false`.

### Board-aware pasting (2026-07-27, approved by Randall in session)

A pasted link and a scanned board are the same posting reached two ways, but the paste path never
consulted the board registry: it fetched the public web page and reverse-engineered HTML, which
fails on boards that render in the browser. Pasted links now resolve against the same
`resolveBoardFromUrl` registry the scan uses.

- `lib/public-jobs/board-posting.ts` (new): reads a single posting from Greenhouse
  (`boards-api.greenhouse.io/v1/boards/{token}/jobs/{id}?content=true`), Ashby, and Lever, deriving
  the posting id from the pasted URL. Falls back silently when a board has no single-posting path
  or its API does not answer.
- `lib/public-jobs/ingest-link.ts`: resolves the board before fetching. A blocked board returns the
  new `board_unsupported` result carrying its hostname; a supported board is read through its API,
  which skips the page fetch, the extraction claim, and the model entirely; anything else keeps the
  existing HTML path unchanged.
- `lib/public-jobs/api.ts`: `board_unsupported` returns 422 naming the board, so a login-gated
  board reads as a specific reason instead of a generic extraction failure.

Verified end to end against the real boards: the Greenhouse and Ashby links both ingest with **no
model call** (Greenhouse previously required the LLM), recruiterflow still ingests via JSON-LD, and
`jobs.gem.com` returns `board_unsupported` without fetching the page, calling the model, or storing
anything.

### Scan/paste parity (2026-07-27, Randall's hard requirement)

**Requirement (Randall): any job a scan presents to the user must also be ingestible through the
single-URL input.** Board routing alone did not satisfy that, and an initial coverage claim of "34%
of presented jobs cannot be pasted" was WRONG: that probe stubbed the database and so never ran the
dedupe lookup. Corrected measurement below; do not reuse the 34% figure.

Measured against production: one real `source_url` per host from the `jobs` table, 17 hosts,
4,731 rows, of which 4,729 are shared-pool (`owner_user_id is null`) and therefore visible to the
paste dedupe. Two real gaps were found:

1. **Campaign parameters broke recognition.** Dedupe compared exact strings and `normalizeUrl` only
   stripped the fragment, while the scan stores the board's own clean URL. A link copied from
   LinkedIn (`?utm_source=`, `?src=`, `?gh_src=`, `?grnh.se=`) therefore never matched a posting we
   already held and fell through to a live fetch that several hosts refuse. `himalayas.app` and
   `weworkremotely.com` return 403 to us and to a browser user agent, because the scan reads their
   API and RSS feed rather than their pages.
2. **Wrong board token on company careers hosts.** The registry guesses the token from the
   hostname, so `careers.airbnb.com` guessed `careers` and `jobs.dropbox.com` guessed `jobs`, and
   the Greenhouse API 404s. The correct tokens are already configured in `job_sources`.

Both fixed in `lib/public-jobs/ingest-link.ts`:

- `dedupeKeyUrl` strips campaign and referral parameters (`utm_*` plus a conservative list) and the
  dedupe query matches the pasted URL **or** its stripped form. The URL the user pasted is still
  what gets stored, so "Open posting" always opens the link they had. Identifying parameters such
  as `gh_jid` are deliberately never stripped.
- `boardTokenFromConfiguredSources` prefers a `job_sources` token whose value equals a hostname
  label over the registry's guess, so a careers host resolves to the board the scan reads.

Verified: re-running every one of the 17 hosts through the real pipeline with real database reads
and campaign parameters appended returns OK for all 17 (14 recognized as already held, 3 fetched
deterministically). Two new regression cases cover the campaign-parameter match and the configured
token override. Full `npm run release:check` passed.

Known remaining gap, not yet closed: a **fresh** posting on a host that refuses page fetches
(`himalayas.app`, `weworkremotely.com`) and that the scan has not yet ingested. Parity for those
means routing the paste to the same feed the scan reads, which is unresolved because an aggregator
feed is a time-boxed query that may not contain an older posting.

### OPEN QUESTION: reading postings on browser-rendered boards (gem.com class)

**Status: unsolved, actively wanted. Randall 2026-07-27: "we need to continue to push on
solutions to pages like gem.com."** Do not close this by declaring it out of scope.

The problem: some boards send an empty JavaScript shell to any non-browser client. `jobs.gem.com`
returns 4.2 KB with 23 characters of readable text ("Function Health Careers") and no JSON-LD, so
there is nothing on the page for the ingest pipeline to read. Board-API routing (shipped) fixes
Greenhouse, Ashby, and Lever, and JSON-LD covers recruiterflow and similar, but neither helps a
board that has no public API and publishes nothing in its HTML.

Options on the table, best first:

1. **Render the page in a real browser, then read the rendered text.** Once a headless browser has
   executed the page's JavaScript, the posting text is in the DOM and can be extracted as clean
   text and fed to the existing extractor. This is the leading candidate and Randall explicitly
   wants it kept in play. Open sub-questions: run our own Chromium in a serverless function
   (heavy, cold starts, platform limits) versus a hosted rendering service (per-page cost, new
   vendor dependency); where the render step sits in the ingest path; and how to bound latency,
   since rendering adds seconds to a paste.
2. **Screenshot the rendered page and read it with vision.** Measured 2026-07-27 and priced out:
   an image caps at roughly 4,784 input tokens at full resolution, so a posting costs about $0.02
   for one downscaled page image and about $0.07 for three native-resolution tiles, against 6,703
   tokens (about $0.034, measured with `count_tokens`) for the same posting as text. Tokens are
   therefore NOT the blocker. The objection is that this still requires the same headless browser
   as option 1, then adds a lossy pixel-reading step on top of text that was already available.
   Keep it as the fallback for postings published only as images or PDF scans.
3. **Per-board integrations** where a public API exists. This is what shipped for Greenhouse,
   Ashby, and Lever. It does not generalize to the long tail.

Two constraints to carry into any solution:

- **Gem specifically is a policy question, not only a technical one.** `board-registry.ts` records
  a deliberate earlier decision not to scrape Gem because its board API is login-gated. Rendering
  Gem's page in a browser would read the same content that decision covers, so shipping a renderer
  does not by itself authorize using it on Gem. That call is Randall's and has not been made.
  Probing confirmed the position independently: Gem's public GraphQL endpoint answers ad-hoc
  queries but blocks introspection, and blind field guesses return a generic error that notifies
  their support team, so that avenue was abandoned rather than pursued.
- **Measure the tail before buying anything.** We do not yet know how many real pasted links fail
  this way. Capturing the host of every unreadable link would size the problem and tell us whether
  a rendering vendor is worth its cost. There is precedent in
  `logUnrecognizedBoardSubmissionBestEffort`, though its reason column currently allows only
  `unrecognized_board` and `board_fetch_failed`, so a new reason value needs a migration.

### Pinned, not acted on: profile vs onboarding naming

Randall's observation, logged as a potential scope change and explicitly not implemented: now that
Edit Profile sends a logged-in user to `/onboarding`, that surface is editing a finished profile
rather than onboarding a new user, so it should probably present as **Profile** when the user is
signed in. Anything here needs its own approved scope and design direction. Likely surfaces to
consider: the route itself, the page title and heading, the `SiteHeader` profile link label, and any
remaining copy that calls the surface onboarding. No decision has been made.

The next planned product task remains Phase 4 Markdown export. Start by confirming production is
serving `a54e3ff` or a later `main` commit and that the repository is clean, then return to the
preserved Phase 4 plan. Do not expand into live Stripe setup without explicit scope.

## 2026-07-27 pause point

Phase 3 and the separately approved production UI port are implemented locally. The complete
Stripe sandbox lifecycle exit gate passed on 2026-07-27. The implementation and persistent
session-closure rule are committed on `main` at `ae1ca43`. Nothing has been deployed or applied to
production.

Verified local/backend state:

- Stripe SDK `22.1.1`, configuration, exact-account validation, price allowlist, Checkout, Portal,
  plan-change, signed webhook, idempotency, reconciliation, and account subscription/usage code
  are included in commit `ae1ca43`.
- The Phase 3 target is the dedicated **Dumpster Fire sandbox**
  `acct_1TxaWWJtJtSFf8Kw`. The primary Dumpster Fire account
  `acct_1TxaN3JzLRNdHYq3` remains the later live-account target.
- `.env.local` is gitignored and contains the sandbox test secret, exact sandbox account ID,
  sandbox price IDs, Portal configuration ID, and the most recent sandbox Stripe CLI webhook
  secret. Never print or commit the secret values.
- Sandbox resources are tagged with `project=dumpster_fire_llc`,
  `integration=subscription_billing`, `environment=sandbox`,
  `account_context=dumpster_fire_sandbox`, and the sandbox account ID.
- Smoldering sandbox Product/Price: `prod_UxWMgxEgvnNs3r` /
  `price_1TxbKCJtJtSFf8Kwh6OoBQfO`.
- Roaring sandbox Product/Price: `prod_UxWMNcOUMPH6kg` /
  `price_1TxbKEJtJtSFf8KwSvD6Mb37`.
- Dedicated sandbox Portal configuration: `bpc_1TxbKGJtJtSFf8KwJvIJIZCM`. It enables payment
  method updates, invoice history, and cancellation at period end, while disabling uncontrolled
  Portal plan switching.
- The original primary-account test resources were left intact. Do not use or delete them without
  explicit scope.
- Local Supabase uses `supabase/config.toml`; Analytics is disabled because its optional Vector
  service cannot mount Colima's socket. `.env.development.local` is gitignored and overrides
  Supabase with the local stack while enabling local billing and Checkout.
- A clean `supabase db reset` applied every migration through
  `20260726000100_stripe_billing_backend.sql`. The postflight passed schema, RPC security,
  migration history, and service-role repository-read checks.
- Fresh-install testing exposed missing `service_role` `SELECT` grants on
  `user_subscriptions`, `subscription_plans`, and `usage_ledger`. The Phase 3 migration,
  postflight, and isolated migration harness now encode the fix; the corrected harness passes.
- The approved Smoldering/Roaring homepage pricing, plan selection and return states, Profile
  Plan/Billing/change-plan modals, and Apply Wizard zero-use, inactive-payment, and final-use
  states are ported to production components. Markdown export itself remains deferred.
- Responsive browser QA passed at 320, 375, 390, 1280, and 1440 pixels for the pricing, plan,
  Profile Plan modal, and Apply Wizard zero-use surfaces, with no page-width overflow.
- `npm run release:check` passed after the UI port and again after the authenticated Stripe
  lifecycle fix. It included all billing migration harnesses, 34 fixture suites, typecheck, lint
  with four existing warnings and zero errors, and the production build.

Corrected Stripe Dashboard finding and sandbox decision:

- Checkout reached the correct sandbox but Stripe rejected required Terms consent because the
  sandbox business profile is incomplete.
- The current Stripe Dashboard does not expose an independent editable Public details page for
  this sandbox. **Payments > Checkout and Payment Links > Public information > Public details**
  routes into **Business details**, where Stripe shows **Your business information is incomplete**
  and **Add business information**. The Account Status representative-review item is complete;
  it is not the missing Checkout configuration.
- Randall chose not to complete a fictional sandbox business onboarding. The local development
  environment now explicitly sets `STRIPE_CHECKOUT_TERMS_CONSENT=omit`.
- Application configuration defaults Checkout Terms consent to `required`. `omit` is accepted
  only with a Stripe test-mode secret key; a live key is rejected. The Checkout request entirely
  omits `consent_collection` in this sandbox mode.
- Live Checkout must remain `required`. Before live launch, complete the live account business
  details and configure:
  - Terms: `https://www.thejobmarketisadumpsterfire.com/legal/terms`
  - Privacy: `https://www.thejobmarketisadumpsterfire.com/legal/privacy`
- Both legal URLs returned HTTP 200 on 2026-07-26.
- Focused Stripe billing regressions, TypeScript, and the full `npm run release:check` gate passed
  on 2026-07-27 after this change.

Authenticated Stripe lifecycle evidence:

- Checkout Session `cs_test_a1Snsv4QHixNMfVWf8Q6h9gWaXowHvSwYVgYk0bXtpz0IROEdME0Xkqc5D`
  completed and was paid in test mode. Its metadata contained the correct project, user, plan,
  contract, environment, and integration tags.
- Signed Stripe CLI forwarding delivered lifecycle webhooks to localhost with HTTP 200. The local
  subscription mirror became active Smoldering with 20 uses.
- Customer Portal Session creation passed. The dedicated Portal configuration was read back as
  active with invoice history, payment-method update, and period-end cancellation enabled, while
  uncontrolled subscription updates remained disabled.
- Immediate Smoldering-to-Roaring upgrade passed. The local account API changed to 45 uses and
  enabled Markdown export.
- The first real downgrade attempt exposed the root cause
  `end_behavior: "renew"`: Stripe accepts only `release` or `cancel`. The implementation now uses
  `release`, regression coverage pins that contract, and the corrected real downgrade created a
  two-phase schedule: current Roaring, next-period Smoldering. A replay returned
  `alreadyScheduled: true` without creating another schedule.
- Period-end cancellation kept current Roaring access while setting `cancelAtPeriodEnd=true`.
  Reversal cleared both `cancelAtPeriodEnd` and `canceledAt`. Immediate final cancellation changed
  the local mirror to `canceled`.
- One already-processed signed Checkout event was replayed twice with Stripe SDK's official
  signature generator. Both responses were HTTP 200 with `duplicate=true`; the audit record
  remained one processed row with `attempt_count=1`.
- Reconciliation passed before and after cancellation: one checked, one matched, zero mismatches,
  zero errors.
- The disposable local auth user and subscription mirror were removed. The disposable Stripe
  customer `cus_Uxm5O3NapWg9YX` was deleted after its subscription was canceled. Shared products,
  prices, Portal configuration, and Stripe event history were untouched. The local
  `stripe_webhook_events` table retains 34 processed audit rows.

Remaining production-readiness gaps:

- The Stripe backend migration is not applied to production, and production Checkout remains off.
- Live-mode Stripe Products, Prices, Portal, webhook, keys, completed business details, legal URLs,
  required Terms consent, invoice/failure emails, and the tax decision remain Phase 9 work.
- Markdown export behavior remains Phase 4.

Exact next starting point:

1. Start the new site-bug session with `session check`, run the Session Start Protocol, and confirm
   `main` is clean and includes `ae1ca43` plus the following session-memory commit.
2. Get Randall's bug report, reproduce it at the correct layer, and keep the bug fix scoped to the
   diagnosed cause.
3. Preserve the phase list. Phase 4 Markdown export remains the next planned implementation phase
   after the bug session; do not begin it without explicit scope.
4. Do not expand into live Stripe setup or production deployment without explicit scope.

## Session check

1. Run `git pull`.
2. Run `git status --short --branch`.
3. Confirm the active branch is `main`.
4. Read `docs/subscription-billing-production-plan-2026-07-24.md`.
5. Read the Phase 2C production result and Phase 3 starting point below.
6. Read the relevant server/API guides in `node_modules/next/dist/docs/` before implementation.

## Unified pricing initiative state

The approved retail contract is:

- Smoldering: $22/month for 20 successful new Apply Wizard pursuits.
- Roaring: $32/month for 45 successful new Apply Wizard pursuits plus Markdown pursuit-history
  export.
- Roaring is the top plan.
- No free retail tier, one-time membership fee, rollover, or retail overages.
- A use is consumed only when a new pursuit atomically persists at least one useful contact.
- Failed, empty, cached, repeated, and revisited pursuits do not consume another use.
- The usage counter is quiet and appears only on deliberate Plan/Billing surfaces.
- Tester remains an internal access-code entitlement outside the retail plan matrix.

### Codex Phase 1: committed and production schema confirmed

Commit `3a3453d` is on `origin/main`. It added provider cost telemetry, safe rate-card estimation,
source-content reuse, posting-refinement backoff, extraction claims, and the first unit-economics
report.

The 2026-07-25 read-only production preflight directly confirmed these migration files are applied
and recorded in production:

- `20260724000200_provider_usage_events.sql`
- `20260724000300_jobs_source_content_hash.sql`
- `20260724000400_posting_refinement_backoff.sql`
- `20260724000500_job_link_extraction_claims.sql`

The same query confirmed the expected Phase 1 schema objects. This live database evidence
supersedes the earlier note that the four migrations were unapplied. A real production
unit-economics baseline still requires provider events accumulated after deployment.

Known Phase 1 limitations:

- An already-ingested URL is not refetched merely because its remote content later changes.
- Identical content arriving concurrently at different URLs can still produce duplicate provider
  work.

### Claude pricing design: approved and synced

Commit `c536002` contains five approved pricing/billing design cards. They were registered with the
Claude Design project and mirrored into the repository:

- `design-system/components/homepage-pricing.html`
- `design-system/components/plan-billing-step.html`
- `design-system/components/plan-billing-detail.html`
- `design-system/components/apply-wizard.html`
- `design-system/components/export.html`
- `design-system/_ds_manifest.json`

The approved designs cover:

- two-tier homepage pricing;
- plan acquisition, checkout return, access-code, active, canceled, and unavailable states;
- quiet Profile Plan/Billing usage, upgrade, downgrade, cancellation, and payment-recovery states;
- Apply Wizard zero-use, inactive-payment, and final-use exception states;
- Roaring Markdown export and Smoldering locked states.

The production port is now implemented locally for homepage pricing, plan acquisition and return
states, Profile Plan/Billing/change-plan states, and Apply Wizard usage states. It maps to the
approved cards above and is committed in `ae1ca43` but not deployed. Markdown export remains
deferred, and the legal pages were not changed.

### Codex Phase 2A: committed and applied to production

Phase 2A added:

- `supabase/migrations/20260724000600_subscription_billing_two_tier.sql`
- `scripts/test-subscription-billing-two-tier-migration.sh`
- the `test:migrations:subscription-billing` package command;
- automatic inclusion of that harness in `release:check`.

The migration contract:

- sets `basic` to Smoldering at $22/20/no Markdown;
- sets `premium` to Roaring at $32/45/Markdown;
- preserves tester at 25 uses with internal Roaring-equivalent capability;
- retires `pro` from new entitlement;
- adds subscription source and Stripe-ready lifecycle fields;
- backfills existing non-Stripe tester and premium rows as `access_code`, following Randall's
  2026-07-25 legacy-account decision; other pre-Stripe rows remain `manual`;
- prevents access-code writes from replacing a Stripe subscription;
- removes the database fallback that treated a missing subscription as active `basic`;
- adds the authoritative `apply_wizard` usage type, lifetime one-use-per-pursuit uniqueness, and
  immutable pursuit latch;
- backfills only pursuits with persisted useful contacts;
- adds service-role-only atomic access-code redemption;
- adds service-role-only atomic Human Path contact, event, debit, and latch persistence;
- preserves legacy pursuit, Human Path, and outreach write behavior for the application cutover;
- keeps authenticated contact reads while making contact mutations service-role-only;
- uses Stripe half-open billing periods and UTC calendar months for access-code/manual
  entitlements;
- discards raw provider contact and diagnostic fields outside the allowlist.

Verification passed:

- three idempotent migration applications;
- exact catalog, preservation, backfill, security, period, debit, empty-result, and replay checks;
- Stripe source and billing-period fail-closed checks;
- tester UTC renewal regression;
- legacy Saved Pursuits migration harness;
- 32 fixture suites;
- typecheck;
- lint with four pre-existing warnings and zero errors;
- production build;
- full `npm run release:check`.

The migration was applied and recorded on 2026-07-25 after the verification and authorization
documented below. The Phase 2B runtime calls the new RPCs only behind the disabled production flag.

### Codex Phase 2B: deployed with billing false

The application compatibility bridge is committed as `b76e7f8`, pushed to `origin/main`, and
deployed successfully by Vercel. GitHub Actions run `30178555166` passed. `BILLING_ENABLED` is
absent from the production environment, so it resolves false and the legacy paths remain active.

Implemented behavior:

1. Schema-aware subscription types and database mapping cover plan source, Stripe lifecycle,
   Apply Wizard allowance/usage, periods, and Markdown entitlement.
2. Enabled missing subscriptions fail closed; the false path retains the active-basic fallback.
3. Enabled enforcement uses database plan entitlements; the false path retains `PLAN_RULES`.
4. Enabled access-code redemption uses `redeem_access_code_subscription`.
5. Enabled Human Path uses `apply_wizard` preflight and the atomic
   `persist_human_path_generation` RPC.
6. Structured RPC results cover limit, inactive, replay, contacts, pursuit, usage, invalid period,
   invalid state, and visibility outcomes.
7. Stripe periods fail closed; access-code/manual periods derive from the current UTC month.
8. The false path keeps legacy access-code, Human Path, pursuit, and outreach behavior.
9. Outreach debits and production UI remain unchanged.

Changed application and test files:

- `.env.example`
- `lib/public-profile/subscription/types.ts`
- `lib/public-profile/subscription/repository.ts`
- `lib/public-profile/subscription/enforcement.ts`
- `lib/account/access-codes.ts`
- `lib/public-profile/pursuits/types.ts`
- `lib/public-profile/pursuits/repository.ts`
- `lib/public-profile/api.ts`
- `scripts/test-account-access-codes.ts`
- `scripts/test-account-access-codes.mjs`
- `scripts/test-public-profile-subscription.ts`
- `scripts/test-public-profile-pursuits.ts`
- `scripts/test-public-profile-api.ts`
- `scripts/test-fixtures.mjs`
- `package.json`

Verification passed:

- Phase 2A migration harness;
- legacy Saved Pursuits migration harness;
- 33 fixture suites;
- typecheck;
- lint with four pre-existing warnings and zero errors;
- production build;
- `git diff --check`.

## Production migration and postflight result

The aggregate-only read-only preflight ran on 2026-07-25:

- migrations `20260724000200` through `20260724000500` are recorded and their schema is present;
- at preflight time, only `20260724000600` was missing;
- production has three active `premium` subscriptions;
- production has one premium access code with 12 recorded uses;
- production has no durable per-user link from an access-code redemption to a subscription;
- before Randall's decision, migration `00600` would have classified the three premium
  subscriptions as `manual`;
- 10 contact-backed Apply Wizard uses, all for one user and all in the current UTC month, qualify
  for the migration backfill.

Randall selected internal `access_code` entitlement treatment on 2026-07-25. Migration `00600`
now backfills existing non-Stripe `tester` and `premium` subscriptions as `access_code`; other
pre-Stripe plans remain `manual`. Its isolated harness includes a legacy premium fixture. The
focused harness and full local release check passed after this change: three idempotent migration
applications, the Saved Pursuits harness, 33 fixture suites, typecheck, lint with four pre-existing
warnings and zero errors, and the production build.

After a fresh preflight and explicit authorization, migration `00600` was applied and recorded on
2026-07-25. `scripts/postflight-subscription-billing.sql` confirmed:

- the expected Smoldering, Roaring, tester, and retired pro catalog;
- three active premium subscriptions classified as `access_code`;
- 10 unit Apply Wizard backfill rows for 10 distinct pursuits and one user;
- zero duplicate, malformed, debit-without-latch, or latch-without-debit rows;
- all expected schema fields and both atomic RPCs;
- service-role-only execution for code redemption and Human Path persistence.

Randall authorized the controlled flag-on verification. The first attempt failed before
authentication or a provider call because the disposable fixture referenced two profile columns
removed by the redesign. Cleanup returned zero, the flag was removed, and a rollback deployment
completed. The corrected seed-only rehearsal passed while flag-off. The approved retry then passed:

- premium access-code plan read;
- atomic `already_entitled` code response without consuming a code use;
- Roaring export entitlement;
- 23 persisted Human Path contacts;
- one unit Apply Wizard debit, one event, and one pursuit latch;
- 1 of 45 used with 44 remaining;
- cached replay with no additional provider call;
- zero legacy Human Path debits;
- zero disposable rows after cleanup.

`BILLING_ENABLED` remains enabled in Production. The aggregate postflight still shows the three
real premium access-code subscriptions and 10 historical Apply Wizard rows, with no malformed,
duplicate, or unmatched rows.

The checked-in QA harness is `scripts/qa-subscription-flag-on-production.mjs`. Its final local
release check passed both migration harnesses, all 33 fixture suites, typecheck, lint with four
pre-existing warnings and zero errors, and the production build.

## Phase 2C production result

The backend cutover is implemented, migrated, and production-verified:

- new migration: `supabase/migrations/20260725000100_outreach_metering_removal.sql`;
- isolated harness: `scripts/test-outreach-metering-removal-migration.sh`;
- read-only production preflight: `scripts/preflight-outreach-metering-removal.sql`;
- aggregate postflight: `scripts/postflight-outreach-metering-removal.sql`;
- billing-enabled compatibility changes in `lib/public-profile/api.ts` and
  `lib/public-profile/pursuits/state-machine.ts`;
- focused flag-on coverage in `scripts/test-public-profile-api.ts`;
- automatic release-gate coverage through `package.json`.

The same-signature RPC now requires the Apply Wizard latch, persists messages atomically and
idempotently, returns zero retired debit metadata for new requests, and writes no new
`pursuit`/`outreach_message` ledger row. Historical requests retain their original replay
metadata. Billing-enabled initial outreach and regeneration skip legacy application quota checks
and usage events. Provider/model telemetry remains unchanged.

Local verification passed:

- three idempotent Phase 2C migration applications;
- historical positive-debit replay preservation;
- multi-contact zero-debit persistence and identical no-write replay;
- unlatched pursuit rejection with zero partial state;
- Apply Wizard-only quota enforcement;
- service-role-only RPC execution;
- legacy Saved Pursuits migration harness;
- 33 fixture suites;
- typecheck;
- lint with four pre-existing warnings and zero errors;
- production build;
- `git diff --check`.

After explicit authorization, `20260725000100` was applied and recorded as
`outreach_metering_removal`. Postflight proved the Apply Wizard-only quota function, latch
requirement, zero legacy usage writes, nonnegative compatibility metadata, service-role-only RPC,
unchanged historical rows, and zero duplicate contact messages.

The first authenticated QA attempt passed Human Path and initial outreach but regeneration failed
before persistence because the model's last retry was 873 characters against the 750-character
limit. Cleanup returned all disposable state to zero, and postflight remained green. Randall
explicitly authorized one additional provider-costing retry. It passed with 19 contacts, one Apply
Wizard debit, cached replay, one zero-debit outreach request, no legacy pursuit/outreach rows, one
in-place regeneration, a rejected second regeneration, 736- and 721-character messages, and full
cleanup. The final aggregate audit found zero disposable QA Auth users and profiles. Canonical `/`
and `/plan` return HTTP 200.

## Immediate next task: site bug session

The Phase 3 backend, authenticated Stripe sandbox lifecycle, and approved billing UI port are
committed on `main`. Resume from the exact starting point at the top of this document and diagnose
the site bug Randall supplies. Phase 4 Markdown export remains preserved as the next planned phase
after the bug work.

No live Stripe configuration, live product creation, production secret change, deployment, or
production enablement is authorized by this handoff.

## Explicitly still incomplete

- A real production unit-economics baseline after post-deploy provider events exist.
- Markdown pursuit-history export backend.
- Terms, Privacy, Billing, and Support updates plus the legal-counsel checkpoint.
- Production Stripe configuration, end-to-end verification, and release authorization.

## Production safety boundary

Do not disable `BILLING_ENABLED`, configure live Stripe, or edit protected production UI/copy
without new explicit scope. Production uses the database-backed entitlement and atomic Apply
Wizard paths. The new Stripe Checkout, Portal, webhook, and production UI work is committed on
`main` but is not deployed.

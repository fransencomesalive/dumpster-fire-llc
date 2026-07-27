# Next Session: Site Bug, Phase 4 Preserved

_Updated 2026-07-27. Read `AGENTS.md` and follow the Session Start Protocol in
`docs/project-operating-state.md` before editing._

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

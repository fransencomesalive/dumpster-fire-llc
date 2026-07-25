# Next Session: Phase 2B Flag-Off Release and Migration Preflight

_Updated 2026-07-25. Read `AGENTS.md` and follow the Session Start Protocol in
`docs/project-operating-state.md` before editing._

## Session check

1. Run `git pull`.
2. Run `git status --short --branch`.
3. Confirm the active branch is `main`.
4. Read `docs/subscription-billing-production-plan-2026-07-24.md`.
5. Re-check production migration history before creating or applying any migration.
6. Name the exact Phase 2B files and obtain scoped approval before editing.

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

### Codex Phase 1: committed; production migrations unapplied

Commit `3a3453d` is on `origin/main`. It added provider cost telemetry, safe rate-card estimation,
source-content reuse, posting-refinement backoff, extraction claims, and the first unit-economics
report.

These migration files exist in the repository but are **not applied or recorded in production**:

- `20260724000200_provider_usage_events.sql`
- `20260724000300_jobs_source_content_hash.sql`
- `20260724000400_posting_refinement_backoff.sql`
- `20260724000500_job_link_extraction_claims.sql`

Do not treat the presence of commit `3a3453d` on the remote, or any application deployment built
from it, as evidence that its database schema is live. Phase 1's schema-dependent production
behavior and a real production unit-economics baseline remain unverified until the migrations are
explicitly authorized, applied, recorded, and postflight-verified.

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

These are design-system sources only. Production UI, CSS, public copy, and legal pages have not
been ported. Any production port must map exactly to these approved cards and follow the full
design-sync checklist.

### Codex Phase 2A: committed, not applied to production

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
- conservatively backfills existing tester rows as `access_code` and other pre-Stripe rows as
  `manual`;
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

The migration has not been applied to production. At the Phase 2A commit boundary, no application
runtime called the new RPCs; the local Phase 2B work below adds those calls behind a disabled flag.

### Codex Phase 2B: implemented locally, not deployed

The application compatibility bridge is implemented behind `BILLING_ENABLED`, which defaults to
false. It is currently an uncommitted local change and has not been deployed.

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

## Immediate next task: flag-off release and read-only preflight

1. Review and commit the intended Phase 2B and migration-state documentation changes.
2. Push `main` and verify CI plus the Vercel deployment.
3. Confirm production keeps `BILLING_ENABLED` unset or explicitly false.
4. Verify the deployed access-code and legacy Human Path paths without applying a migration.
5. Run a fresh read-only production preflight for migrations `20260724000200` through
   `20260724000600`.
6. Stop and report the preflight. Do not apply or record any migration without explicit
   authorization.

## Explicitly still incomplete

- Phase 2B commit, push, flag-off deployment, and deployed legacy-path verification.
- Production proof of the enabled Human Path path against migration `00600`.
- A real production unit-economics baseline after post-deploy provider events exist.
- Outreach entitlement cutover and removal of new retail pursuit/outreach debits.
- Read-only production preflight immediately before migration authorization.
- Production application and recording of migration `20260724000600`.
- Stripe test products, Checkout, Customer Portal, webhook processing, lifecycle tests, and
  environment secrets.
- Markdown pursuit-history export backend.
- Port of Claude’s approved cards to production surfaces.
- Terms, Privacy, Billing, and Support updates plus the legal-counsel checkpoint.
- Test-mode end-to-end billing verification and production release authorization.

## Production safety boundary

Do not apply migration `20260724000600`, enable `BILLING_ENABLED`, configure live Stripe, or edit
protected production UI/copy without a new explicit scope. The current production application
continues to use the legacy entitlement and metering paths.

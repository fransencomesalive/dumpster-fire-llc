# Next Session: Smoldering / Roaring Phase 2B

_Updated 2026-07-24. Read `AGENTS.md` and follow the Session Start Protocol in
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

### Codex Phase 1: deployed

Commit `3a3453d` added provider cost telemetry, safe rate-card estimation, source-content reuse,
posting-refinement backoff, extraction claims, and the first unit-economics report.

Production migrations are applied, recorded, and postflight-verified through:

- `20260724000200_provider_usage_events.sql`
- `20260724000300_jobs_source_content_hash.sql`
- `20260724000400_posting_refinement_backoff.sql`
- `20260724000500_job_link_extraction_claims.sql`

The Phase 1 application release is deployed. The first production unit-economics report returned
zero provider events because no post-deploy paid-provider workflow had yet generated telemetry.
Do not treat that zero-event sample as a real pricing baseline.

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

### Codex Phase 2A: implemented locally, not applied to production

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

The migration has not been applied to production. No application runtime calls the new RPCs yet.

## Immediate next task: Phase 2B application compatibility cutover

Build the application side behind `BILLING_ENABLED=false`. The deployed false path must continue
to work before migration `00600` exists. Do not apply the migration or enable billing in the same
task.

Required behavior:

1. Add schema-aware subscription types for plan source, Apply Wizard allowance, period, remaining
   use, and Markdown entitlement.
2. In the enabled path only, remove the TypeScript missing-subscription-as-active-basic fallback.
   The false compatibility path remains unchanged until migration and cutover authorization.
3. In the enabled path only, load database plan entitlements instead of `PLAN_RULES`. Do not remove
   the legacy false-path rules in this slice.
4. Route access-code redemption through `redeem_access_code_subscription` only when the new path is
   enabled.
5. Add repository mapping for `persist_human_path_generation`, including structured limit,
   inactive, replay, contact, pursuit, and usage results.
6. Keep the legacy production path intact while the flag is false.
7. Add focused tests for false-path compatibility and enabled-path RPC mapping.
8. Do not change outreach debits or production UI yet. The outreach cutover follows after the
   Human Path path is proven against the migrated schema.

Expected first files:

- `lib/public-profile/subscription/types.ts`
- `lib/public-profile/subscription/repository.ts`
- `lib/public-profile/subscription/enforcement.ts`
- `lib/public-profile/subscription/rules.ts`
- `lib/account/access-codes.ts`
- `lib/public-profile/pursuits/types.ts`
- `lib/public-profile/pursuits/repository.ts`
- `lib/public-profile/api.ts`
- `scripts/test-public-profile-subscription.mjs`
- `scripts/test-public-profile-pursuits.mjs`
- `scripts/test-public-profile-api.mjs`

This list is a handoff, not authorization. Reconfirm the exact slice before editing.

## Explicitly still incomplete

- Phase 2B application compatibility and Human Path cutover.
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

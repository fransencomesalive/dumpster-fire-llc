# Subscription, Apply Wizard Metering, and Stripe Production Plan

**Created:** 2026-07-24
**Status:** Approved product direction and public tier names; implementation not started
**Repository:** `/Users/randallfransen/Sites/dumpster-fire-llc`
**Branch:** `main` only
**Production objective:** Replace the unfinished three-tier/access-code-only commercial path with two paid monthly subscriptions, a single customer-facing Apply Wizard allowance, top-tier Markdown history export, and production Stripe billing.

## 1. Outcome

Ship a self-serve paid product with:

1. No free retail tier.
2. No membership fee, initiation fee, or other one-time access charge.
3. Two monthly subscriptions:
   - **Smoldering:** 20 successful new Apply Wizard pursuits per billing period for **$22 USD/month**.
   - **Roaring:** 45 successful new Apply Wizard pursuits per billing period for **$32 USD/month**.
4. The full pursuit workflow in both paid plans:
   - profile;
   - job scan and matching;
   - saved jobs;
   - Apply Wizard review;
   - contact discovery;
   - outreach generation;
   - pursuit tracking.
5. Full pursuit-history export as a Markdown file only in Roaring.
6. No retail overage billing at launch.
7. No usage rollover.
8. Existing internal tester access codes retained outside the public retail plan matrix.
9. Stripe Checkout for new subscriptions and Stripe Customer Portal for payment methods, invoices, and cancellation.
10. A quiet usage counter that users can find deliberately in their Profile/Plan area, not a persistent count in the dashboard, navigation, job cards, or Apply Wizard.

The public tier names are approved. Backend implementation will continue to use stable internal codes so public copy never leaks into billing identity or database relationships:

| Internal code | Retail contract | Public name |
| --- | --- | --- |
| `basic` | $22/month, 20 Apply Wizard uses, no Markdown export | **Smoldering** |
| `premium` | $32/month, 45 Apply Wizard uses, Markdown export | **Roaring** |
| `tester` | Internal access-code entitlement, not publicly sold | Never shown as a retail tier |
| `pro` | Retired from new purchase | Never shown; retained only for safe migration/audit until removal is proven safe |

**Roaring is the top plan.** Claude and Codex must use Smoldering and Roaring on every public surface and must never expose `basic`, `premium`, `tester`, or `pro` as customer-facing names.

## 2. Approved Customer-Facing Contract

### 2.1 One understandable usage unit

The customer sees one metered unit:

> One Apply Wizard use means one new job successfully advanced from Review into contact discovery with at least one useful contact returned and saved.

The product must not show separate customer limits for Human Path, contact searches, outreach messages, or pursuits.

Those lower-level actions remain available as internal cost and reliability telemetry only.

### 2.2 When a use is consumed

A use is consumed only when all of the following are true:

1. The user has a current paid or tester entitlement.
2. The pursuit belongs to the user.
3. The job is valid and visible to the user.
4. Review is complete.
5. The provider returns at least one useful contact.
6. The contacts and the one-time usage debit commit successfully in the same database transaction.

### 2.3 Actions that do not consume another use

- Opening or closing Apply Wizard.
- Reviewing the job match.
- Creating or saving a pursuit before contact discovery.
- A provider failure.
- A search that returns no useful contacts.
- A persistence failure that rolls back the contact transaction.
- Returning to an existing pursuit.
- Reading cached contacts.
- Moving backward or forward through already reached wizard steps.
- Selecting or changing contacts.
- Generating the initial outreach drafts for the already-counted pursuit.
- Using the one allowed regeneration for an existing outreach message.
- Copying a message.
- Updating pursuit tracking.
- Exporting Markdown when the plan allows it.
- Returning to the same pursuit in a later billing period.

### 2.4 Monthly allowance behavior

- The allowance follows the Stripe subscription period, not a calendar month.
- A Smoldering subscriber receives 20 successful new Apply Wizard pursuits per billing period.
- A Roaring subscriber receives 45 successful new Apply Wizard pursuits per billing period.
- Unused uses expire at the period boundary.
- Uses do not roll over.
- There are no automatic overage charges.
- Existing pursuits remain readable and trackable after the allowance is exhausted.
- At zero remaining, only successful contact discovery for a new pursuit is blocked.
- Profile access, existing pursuits, saved records, and billing management remain available.
- The same pursuit can never consume a second Apply Wizard debit, even after renewal.

The zero-remaining behavior is an explicitly approved product gate. No other new feature gate is authorized by this plan.

### 2.5 Upgrade, downgrade, cancellation, and payment failure

#### Upgrade from $22 to $32

- Effective immediately after the prorated upgrade invoice is successfully paid.
- Stripe pending updates should be used so the plan does not change if the prorated payment fails.
- Usage already consumed in the current billing period carries forward.
- Example: a user who used 18 of 20 upgrades and then has 27 of 45 uses remaining.
- The billing-cycle dates do not reset merely to restore usage.
- Markdown export unlocks when the paid upgrade becomes active.

#### Downgrade from $32 to $22

- Scheduled for the next renewal.
- No mid-period refund or credit is promised.
- The user keeps the $32 allowance and Markdown export through the current paid period.
- At renewal, the next period begins with Smoldering's 20-use allowance.

#### Cancellation

- Cancellation is scheduled for the end of the current paid period.
- Access continues through that date.
- No partial-month refund is promised except where required by law or expressly approved.
- The user can reverse a scheduled cancellation before the paid period ends.
- Cancellation does not automatically delete the user's profile or pursuit history.

#### Past-due or otherwise inactive payment

- Stripe remains the payment-status authority.
- New Apply Wizard contact discovery and top-tier Markdown export are unavailable while the paid entitlement is inactive.
- The user can still sign in, reach billing management, and view existing personal records.
- No existing pursuit or message is deleted because a payment failed.
- Restoring the subscription restores the applicable remaining allowance for the same Stripe period.

### 2.6 No-subscription behavior

No active subscription is not an implicit lower tier.

- A signed-in user with no subscription can reach the plan/checkout and account recovery surfaces.
- A canceled user can view existing personal records but cannot start new paid workflow actions.
- The current repository fallback that treats a missing subscription as active `basic` must be removed.
- Access-code testers remain a separate internal entitlement source and are not a public free plan.

## 3. Quiet Counter Product Behavior

The counter is available when the user goes looking for account information. It is not a running scoreboard.

### 3.1 Default placement

Primary placement:

- Existing Profile card.
- Existing **Plan** action and Plan popup.
- The Plan view shows:
  - public plan name;
  - monthly price;
  - total Apply Wizard allowance;
  - uses remaining;
  - next reset date;
  - Markdown export availability;
  - change-plan action.

Billing placement:

- Existing **Billing** action opens billing details and the Stripe Customer Portal.
- It shows renewal/cancellation state, next billing date, and a manage-billing action.
- Usage remains primarily in Plan, not duplicated into every billing surface.

The existing signed-in header profile icon already links users back to Profile. This satisfies the requirement that the count be discoverable from Profile without adding a persistent dashboard counter.

### 3.2 Places where the counter must not appear by default

- Global header.
- Dashboard header.
- Dashboard Overview.
- Job cards.
- Match ratings.
- Saved Pursuits cards.
- Apply Wizard title.
- Apply Wizard stepper.
- Contact cards.
- Outreach cards.
- Tracking cards.

### 3.3 Contextual exceptions

Claude must design only these contextual exceptions:

1. **Last use completed:** after a successful contact result consumes the final use, show a quiet one-time confirmation in the Contacts step. Do not turn the wizard into a recurring counter.
2. **Zero remaining:** when the user attempts to advance a new pursuit from Review to Contacts, show the approved limit state with:
   - no provider call;
   - no debit;
   - exact reset date;
   - change-plan action when the user is on Smoldering;
   - billing-management action when payment is inactive.
3. **Plan popup:** show the full count whenever the user deliberately opens Plan.

No low-usage warning at 5, 3, or another threshold is approved in this plan. That avoids making the usage count feel omnipresent. A later threshold warning would be a new gate/notification behavior and requires separate approval.

## 4. Current-State Findings That Drive the Work

The current repository cannot be wrapped with Stripe without changing its subscription contract.

1. `app/page.tsx` still presents three tiers with no prices.
2. `app/plan/PlanClient.tsx` still presents Good/Gooder/Goodest and a nonfunctional checkout stub.
3. `lib/public-profile/subscription/rules.ts` exposes separate pursuit, Human Path, and outreach limits.
4. `lib/public-profile/subscription/repository.ts` grants active `basic` behavior when no subscription row exists.
5. Contact discovery currently records a `human_path` usage event, including an empty successful result.
6. The one-time `pursuit` debit currently occurs later, during initial outreach persistence.
7. Initial outreach has its own quota and database quota trigger.
8. The usage quota trigger reads the plan table while application enforcement reads hard-coded plan rules. These can drift.
9. The current export endpoint returns JSON or CSV, not Markdown.
10. The current export includes only sent outreach entries and does not produce the full structured pursuit timeline requested here.
11. Stripe is not installed and there are no checkout, portal, webhook, event-idempotency, or reconciliation paths.
12. Access-code redemption can overwrite the one `user_subscriptions` row and must not be allowed to replace a paid Stripe subscription.
13. Anthropic response token usage and provider cost are not persisted.
14. Resume PDF scanning and pasted-job LLM extraction are not tied to cost telemetry.
15. Posting refinement can retry unchanged/unfillable jobs without a durable backoff state.

## 5. Target Subscription and Entitlement Architecture

### 5.1 Source of truth

Use the database plan catalog and the Stripe subscription record as the runtime sources of truth:

- Stripe owns payment, invoice, subscription, and renewal state for retail subscribers.
- `subscription_plans` owns product entitlements and Apply Wizard limits.
- `user_subscriptions` mirrors the latest authoritative Stripe or access-code entitlement.
- `usage_ledger` owns successful customer-facing Apply Wizard debits.
- `provider_usage_events` owns provider/model cost telemetry.

Remove hard-coded runtime entitlement duplication from `PLAN_RULES`. Static plan fixtures can remain in tests, but production enforcement must use the plan loaded from the database subscription join.

### 5.2 Plan catalog changes

Extend or revise `subscription_plans` so it can safely represent:

- internal code;
- monthly price in cents;
- public availability;
- Apply Wizard limit;
- Markdown export entitlement;
- display/order metadata only if needed by server responses;
- retired status for `pro`;
- internal-only status for `tester`.

Do not store live Stripe price IDs in browser-readable plan data.

Environment-specific price allowlisting remains server-side:

- `STRIPE_PRICE_BASIC_MONTHLY`
- `STRIPE_PRICE_PREMIUM_MONTHLY`

The checkout endpoint accepts an internal plan code, not an arbitrary Stripe Price ID.

### 5.3 User subscription changes

Extend `user_subscriptions` with:

- `source`: `stripe`, `access_code`, or `manual`;
- `stripe_customer_id`;
- `stripe_subscription_id`;
- `stripe_price_id`;
- `stripe_status_raw`;
- `cancel_at_period_end`;
- `canceled_at`;
- `latest_invoice_id`;
- `last_stripe_event_created_at`;
- current period start/end;
- timestamps.

Constraints:

- One local subscription record per user remains acceptable.
- Stripe customer ID and subscription ID must be unique when present.
- Access-code writes cannot replace a Stripe-linked record.
- A user with a Stripe subscription cannot create a second retail subscription through a new Checkout Session.

### 5.4 Webhook event idempotency

Add `stripe_webhook_events` containing:

- Stripe event ID as the primary/unique key;
- event type;
- object ID;
- Stripe event creation time;
- received time;
- processed time;
- processing status;
- error summary safe for logs;
- attempt count.

Do not store full payment-method or card payloads.

Webhook processing must:

1. Read the raw request body.
2. Verify the `Stripe-Signature` using `STRIPE_WEBHOOK_SECRET`.
3. Reject invalid signatures.
4. Insert/claim the event ID once.
5. Retrieve the latest Stripe subscription/customer object when ordering could matter.
6. Upsert the local subscription transactionally.
7. Mark the event processed.
8. Return a fast `2xx` after the required local write.
9. Safely replay duplicate deliveries.

Stripe can retry and deliver events asynchronously, so local correctness must not depend on delivery order.

### 5.5 Retail entitlement status mapping

Local action entitlement remains intentionally small:

- `active`
- `trialing`
- `past_due`
- `canceled`

Persist the raw Stripe status separately. Map every raw state conservatively:

- `active`, `trialing` -> entitled.
- `past_due`, `unpaid`, `incomplete`, `incomplete_expired`, `paused` -> not entitled to new paid actions.
- `canceled` -> not entitled after the paid period ends.

Do not create a silent grace period in code. Any Stripe retry schedule is a billing setting, not a promise of product access.

## 6. Apply Wizard Metering Redesign

### 6.1 New authoritative usage type

Add `apply_wizard` to the usage ledger.

Customer quota enforcement uses only `apply_wizard`.

Retain the following as non-entitlement telemetry during migration:

- `human_path`
- `outreach_message`
- `pursuit`
- `profile_export`
- `voice_fingerprint`
- `resume_highlights`

After the migration is verified:

- stop writing new `pursuit` debits;
- stop enforcing `human_path` and `outreach_message` as retail quotas;
- keep provider/model telemetry in `provider_usage_events`;
- keep legacy rows for audit rather than deleting them.

### 6.2 Atomic Human Path commit

Create a service-role-only database RPC, provisionally:

`persist_human_path_generation`

It must:

1. Lock the owned pursuit.
2. Validate the pursuit is in an allowed state.
3. Detect an existing current/cached result.
4. Enforce one `apply_wizard` debit per user/pursuit with a partial unique index.
5. Serialize the user's quota write with a transaction advisory lock.
6. Read the active plan and Stripe period.
7. Reject the transaction if the allowance is already exhausted.
8. Replace/persist normalized contacts.
9. Record the Human Path event and diagnostics.
10. Insert one `apply_wizard` debit only when at least one contact is saved.
11. Set an immutable `apply_wizard_metered_at` latch.
12. Return persisted contact IDs, remaining usage, and replay status.
13. Roll back contacts, event, and debit together on any failure.

No raw Exa response, highlight, or search payload is persisted by this RPC.

### 6.3 Preflight and concurrency

The API performs a read-only preflight before paying for a provider call:

- subscription active;
- plan found;
- remaining usage greater than zero;
- pursuit not already metered/cached.

The database RPC repeats the authoritative quota check under lock.

If two new pursuits race for one remaining use:

- both might pass the read-only preflight;
- only one can commit the final usage slot;
- the other returns the limit response;
- its provider cost is absorbed by the product;
- the user is never overcharged or over-debited.

### 6.4 Empty and failed results

- Provider unavailable: no use.
- Provider exception: no use.
- No contacts: persist auditable zero-result diagnostics if appropriate, no use.
- Contact persistence fails: transaction rolls back, no use.
- Cached result: no use.
- Stale empty-result refresh: no use until useful contacts successfully commit.

### 6.5 Outreach persistence changes

Modify `persist_initial_outreach_generation`:

- remove the one-time `pursuit` debit;
- remove retail outreach quota enforcement;
- retain atomic idempotent message persistence;
- retain one initial message per selected contact;
- retain one regeneration per message;
- record message generation telemetry without exposing a customer-facing counter.

The Apply Wizard debit already proves the pursuit is entitled. Outreach should verify that the pursuit has a successful `apply_wizard` latch before generating.

### 6.6 Usage summary API

Return one public summary:

```ts
type ApplyWizardUsageSummary = {
  planCode: "basic" | "premium" | "tester";
  subscriptionStatus: "trialing" | "active" | "past_due" | "canceled";
  used: number;
  limit: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
  markdownExport: boolean;
  cancelAtPeriodEnd: boolean;
};
```

Do not return separate customer-facing Human Path or outreach allowances.

## 7. Stripe Integration

### 7.1 Stripe account work owned by Randall

In Stripe test mode first:

1. Complete business/public details.
2. Set the public Terms URL.
3. Set the public Privacy URL.
4. Create two recurring monthly Products/Prices:
   - $22 USD/month;
   - $32 USD/month.
5. Configure Customer Portal:
   - update payment method;
   - see invoice history;
   - cancel at period end;
   - reverse scheduled cancellation;
   - do not enable uncontrolled plan switching if it conflicts with the approved upgrade/downgrade behavior.
6. Configure invoice and failed-payment emails.
7. Decide with accounting whether Stripe Tax should be enabled and where the business is registered to collect tax.
8. Create the test webhook endpoint.
9. Provide environment values through Vercel, never chat or git.

Repeat with live-mode Products, Prices, Portal configuration, and webhook only after the full test-mode gate passes.

### 7.2 Required environment variables

Server only:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_BASIC_MONTHLY`
- `STRIPE_PRICE_PREMIUM_MONTHLY`
- `STRIPE_PORTAL_CONFIGURATION_ID` if a dedicated configuration is used
- `STRIPE_TAX_ENABLED` after the tax decision
- `BILLING_ENABLED` as the controlled production launch switch

Public/base URL:

- Reuse an existing canonical application URL helper or add one explicit `APP_BASE_URL`.
- Never derive trusted redirect targets directly from an untrusted request host.

### 7.3 Checkout Session endpoint

Add:

`POST /api/billing/checkout`

Requirements:

- authenticated Supabase user;
- body accepts only `basic` or `premium`;
- server maps plan to an allowlisted Stripe price;
- reject arbitrary price IDs;
- reuse an existing Stripe customer;
- prevent duplicate active/incomplete subscriptions;
- `mode=subscription`;
- one line item, quantity one;
- Terms consent required in Checkout;
- Terms and Privacy URLs configured in Stripe Public details;
- tax behavior controlled by the approved environment setting;
- `client_reference_id` and metadata bind the session to the authenticated user ID and internal plan code;
- success and cancel URLs return to the plan flow;
- create a new Checkout Session per payment attempt;
- access is never granted merely because the browser returned to the success URL.

The success page polls the account subscription endpoint or offers a refresh while the signed webhook completes. Webhook state, not redirect state, unlocks onboarding.

### 7.4 Billing Portal endpoint

Add:

`POST /api/billing/portal`

Requirements:

- authenticated user;
- Stripe customer belongs to that user;
- create a short-lived Customer Portal Session;
- return URL goes to Profile/Plan;
- no customer ID accepted from the browser.

### 7.5 Plan-change endpoint

Add:

`POST /api/billing/change-plan`

Requirements:

- authenticated user and owned Stripe subscription;
- `basic -> premium` uses an immediate prorated pending update;
- entitlement changes only after successful payment/webhook confirmation;
- `premium -> basic` schedules the change for renewal;
- idempotent requests;
- price allowlist only;
- response describes `immediate`, `scheduled`, or `payment_required`.

If Stripe Customer Portal can be configured to reproduce these exact mechanics safely, the app may use it. Otherwise, keep plan changes in the app endpoint and use Portal for payment, invoice, and cancellation tasks.

### 7.6 Webhook endpoint

Add:

`POST /api/billing/stripe/webhook`

Handle at minimum:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

The subscription object is the entitlement authority. Invoice events support diagnostics and prompt state reconciliation; they should not create competing entitlement logic.

### 7.7 Reconciliation

Add an internal reconciliation command or guarded route that:

- loads Stripe-linked local subscriptions;
- retrieves the latest Stripe subscription;
- reports mismatched status, price, customer, or period;
- repairs only when explicitly run with write authorization;
- never logs card or payment-method data.

Run the report before launch and after the first live transactions.

## 8. Access-Code Tester Compatibility

Access codes remain available for controlled testing.

Rules:

- Tester is not shown on the homepage or retail plan selection.
- Tester does not require Stripe.
- Tester entitlement is labeled as internal access in account data, while user-facing copy can continue to show the approved Roaring label.
- Access-code redemption cannot overwrite a Stripe-linked subscription.
- A paid subscriber attempting to redeem a tester code receives a safe no-op/error.
- A tester who intentionally becomes paid requires an explicit conversion path; do not silently create both entitlement sources.
- Existing valid access codes and current tester accounts must survive the migration.
- The plan page continues to offer the access-code path to invited testers unless Randall later removes it.

The current optimistic use-count guard for access codes should be preserved.

## 9. Markdown Pursuit-History Export

### 9.1 Product contract

Roaring includes a generated `.md` file containing the user's non-deleted pursuit history.

Smoldering receives the approved locked/upgrade state.

This is a convenience product feature. It must not interfere with a user's separate legal right to request access to personal information where applicable.

### 9.2 Output

Endpoint:

`GET /api/public-profile/pursuits/export?format=markdown`

Response:

- `Content-Type: text/markdown; charset=utf-8`
- `Content-Disposition: attachment; filename="dumpster-fire-pursuit-history-YYYY-MM-DD.md"`
- `Cache-Control: no-store`

Include:

- generated timestamp;
- billing/account-neutral export heading;
- one section per non-deleted pursuit;
- job title, company, location, and posting URL when retained;
- current pursuit status;
- Applying As role track and narrative;
- selected contact names, titles, classifications, and LinkedIn URLs when retained;
- generated outreach drafts and current draft/sent state;
- regeneration history available in the structured records;
- tracking actions and timestamps;
- pursuit created/updated timestamps.

Exclude:

- raw provider responses;
- Exa highlights or queries;
- private provider diagnostics;
- internal rank scores;
- internal cost data;
- hidden deleted records;
- secrets and database IDs that do not help the user.

### 9.3 Implementation

- Create a pure Markdown renderer with fixture tests.
- Generate on request from structured data.
- Do not store an exported file.
- Keep JSON only as an internal/test representation if still useful.
- Retire the public CSV behavior after parity and legal-copy updates.
- Retain an export audit entry if useful, but do not enforce an export quantity limit.

## 10. Cost Telemetry and Cost-Risk Work From the Audit

This section is required before price confidence is declared production-ready.

### 10.1 Provider usage ledger

Add `provider_usage_events` for operational cost accounting:

- user ID when applicable;
- pursuit/job ID when applicable;
- provider category;
- operation;
- model/version;
- request count;
- input tokens;
- output tokens;
- cache-write tokens;
- cache-read tokens;
- result count;
- success/failure outcome;
- estimated cost in integer micros;
- rate-card version;
- request correlation ID;
- timestamp.

Privacy boundary:

- no raw prompt;
- no resume text;
- no generated message;
- no contact results;
- no provider response body.

### 10.2 Instrument current paid calls

Anthropic:

- resume PDF parse;
- resume highlights;
- voice fingerprint;
- outreach generation and each hard-rule retry;
- pasted-job full extraction;
- posting-section refinement.

Exa:

- three Human Path lanes;
- request count;
- result count;
- failure/latency;
- estimated search cost.

Other connections:

- keep fixed Vercel, Supabase, Resend, and other account costs in the cost report configuration;
- treat OpenAI model cost as zero while there is no production call site;
- document Adzuna/account pricing separately if terms change.

### 10.3 Unit-economics report

Add an internal script, provisionally:

`scripts/report-subscription-unit-economics.mjs`

Report by billing period and plan:

- paid subscribers;
- collected subscription revenue from local Stripe invoice records;
- estimated Stripe processing/Billing fees;
- Apply Wizard uses;
- cost per successful Apply Wizard pursuit;
- cost of failed/empty provider attempts;
- outreach messages and retries per pursuit;
- Anthropic cost by operation;
- Exa cost;
- fixed infrastructure allocation;
- gross contribution before support/tax.

The report must avoid user-facing PII.

### 10.4 Pasted-job extraction

Reduce unmetered LLM exposure without adding a new user-facing gate:

1. Use deterministic/JSON-LD extraction first.
2. Call Claude only when required posting fields remain insufficient.
3. Record provider usage.
4. Cache/dedupe by user + canonical URL + content hash.
5. Do not re-extract unchanged content.

Any future hard monthly pasted-link limit is a new gate and requires separate approval.

### 10.5 Posting refinement

Add durable refinement state:

- attempted timestamp;
- input/content hash;
- attempt count;
- outcome;
- next eligible attempt;
- terminal/no-fill status.

Do not repeatedly pay to refine an unchanged posting that has already returned no usable sections.

### 10.6 Resume PDF exposure

Instrument:

- file bytes;
- page count when available;
- model token use;
- attempts;
- cost.

Do not introduce a new user-visible resume cap in this initiative without a separately approved gate. After telemetry exists, bring any page/attempt limit back to Randall as a numbered decision.

### 10.7 Model routing

- Keep outreach quality on the proven model until a fixture-backed comparison approves a change.
- Test lower-cost models for structured extraction tasks.
- Do not change models based on price alone.
- Require the relevant parsing/refinement fixtures and representative real samples to pass before routing production traffic.

## 11. Public Pricing and Plan-Selection Content

### 11.1 Homepage pricing contract

Replace the three-column table with Smoldering and Roaring.

Both show:

- monthly price;
- complete profile;
- scanning/matching;
- saved jobs;
- contact discovery;
- custom outreach;
- pursuit tracking.

Differences:

| Capability | Smoldering, $22/month | Roaring, $32/month |
| --- | --- | --- |
| Successful new Apply Wizard pursuits per billing period | 20 | 45 |
| Markdown pursuit-history export | No | Yes |

Required facts:

- billed monthly;
- no one-time fee;
- no free tier;
- no overage charge;
- no rollover;
- cancel effective at the end of the paid period;
- taxes may apply.

Avoid:

- fake urgency;
- countdowns;
- hidden limits;
- "unlimited" claims;
- separate Human Path/outreach counters;
- provider names;
- internal billing terminology;
- promises of interviews or employment.

### 11.2 Homepage CTA behavior

- Signed-out selection preserves only the internal plan code through sign-up.
- After authentication, the user lands on `/plan` with that plan preselected for review.
- Never send a user directly into payment without a final plan confirmation.
- Signed-in selection goes to the plan confirmation/Checkout action.

### 11.3 Plan-selection flow

Replace "Pricing coming soon" and "Checkout coming soon" with the real two-plan contract.

Required states:

- default two-plan choice;
- selected plan;
- creating Checkout Session;
- redirecting to Stripe;
- canceled Checkout return;
- successful Checkout return while webhook is processing;
- subscription active;
- access code entry;
- access code accepted;
- access code invalid/expired/exhausted;
- existing paid subscriber;
- scheduled cancellation;
- past-due recovery;
- upgrade;
- scheduled downgrade;
- Stripe unavailable/retry.

No browser state alone can mark a subscription active.

## 12. Public Terms, Privacy, Billing, and Support Documentation

These are public copy changes and require exact scoped approval before implementation.

They are not a substitute for legal advice. Before public paid launch, Randall should have the final documents reviewed by qualified counsel for the jurisdictions in which the product is sold.

### 12.1 Terms of Service

Update `app/legal/terms/page.tsx` to cover:

- effective date and document version;
- eligibility/account responsibility;
- two paid monthly subscriptions;
- acceptable use;
- no harassment, spam, impersonation, or unlawful contact use;
- user responsibility to verify contact relevance and current employment;
- public professional information may be incomplete or stale;
- generated messages are drafts, are never auto-sent, and remain the user's responsibility;
- no guarantee of interviews, offers, or employment;
- user ownership of profile/work examples;
- license needed to process user content to operate the service;
- third-party service processing categories without exposing internal implementation copy;
- subscription, cancellation, and billing terms incorporated by reference;
- service availability and change rights;
- suspension/termination;
- disclaimers;
- liability limitation;
- governing law/dispute language selected with counsel;
- contact method;
- change-notice process.

### 12.2 Privacy Policy

Update `app/legal/privacy/page.tsx` to cover:

- effective date and version;
- account/profile/resume/work-example data;
- job and pursuit activity;
- selected professional contact information derived from public sources;
- generated message and feedback data;
- subscription status, Stripe customer/subscription identifiers, invoice state, and payment metadata;
- no storage of full card numbers by Dumpster Fire;
- operational/diagnostic/provider usage telemetry;
- purposes for processing;
- service-provider categories: hosting, authentication/storage, payment processing, email, job data, contact discovery, and language-model processing;
- no sale of personal data;
- temporary provider response handling versus normalized records retained for the user's pursuit;
- resume file/transient parsing behavior, accurately matched to implementation;
- retention and deletion behavior;
- cancellation is not automatic deletion;
- account deletion/access/correction request process;
- statutory personal-data access remains available regardless of paid export entitlement;
- security practices without absolute guarantees;
- international processing if applicable;
- age/minor policy;
- cookies/analytics actually used;
- policy-change notice;
- privacy contact method.

### 12.3 Subscription and Billing Terms

Update `app/legal/billing/page.tsx` with the exact commercial mechanics:

- Smoldering at $22 USD/month for 20 successful Apply Wizard pursuits;
- Roaring at $32 USD/month for 45 successful Apply Wizard pursuits plus Markdown history export;
- applicable tax disclosure;
- monthly advance billing;
- automatic renewal;
- exact definition of an Apply Wizard use;
- failed/empty searches do not consume a use;
- same pursuit is counted once;
- no rollover;
- no retail overages;
- upgrade proration behavior;
- downgrade timing;
- cancellation at period end;
- reversing a scheduled cancellation;
- refund policy;
- payment failure and access behavior;
- price-change notice;
- how to reach Billing/Customer Portal;
- receipt/invoice availability;
- charge-error/support process.

### 12.4 Checkout disclosure and consent

- Configure Stripe Checkout to require Terms acceptance.
- Configure valid Terms and Privacy URLs in Stripe Public details.
- The in-app pre-Checkout review must visibly disclose price, cadence, automatic renewal, allowance, and cancellation path.
- Access-code tester language must not describe a public free tier.
- If counsel recommends an additional explicit in-app acceptance record for access-code users, that is a new gate and requires Randall's separate approval before implementation.

### 12.5 Support page

Review `app/legal/contact/page.tsx` for:

- billing support;
- cancellation help;
- privacy/data requests;
- expected support channel;
- no promise that conflicts with actual staffing.

## 13. Design Ownership: Claude Design

Claude owns visual and public-presentation decisions before production UI edits.

The Design Authority instruction is advisory. Claude's `.claude/hooks/design-guard.sh` is a mechanical **ASK**, not a blocking deny, for the design-file paths it matches. Randall still provides the real approval.

Claude must work in Claude Design project:

`3af2f1ea-428c-49b3-8b02-c066ec0c7452`

### 13.1 Claude Design workstream

1. **Two-tier homepage pricing**
   - Ground in the live homepage pricing section in `app/page.tsx`.
   - Create or update an explicit homepage-pricing design card because no current dedicated two-tier card exists.
   - Design mobile and desktop states.

2. **Plan and Checkout flow**
   - Revise `design-system/components/plan-billing-step.html`.
   - Replace three tiers and coming-soon checkout with the approved two-tier contract and all required billing states.

3. **Quiet Plan/Billing usage detail**
   - Ground in `design-system/components/onboarding-account-bar.html`.
   - Design the Plan popup usage summary.
   - Design Billing/Portal entry, renewal, cancellation, scheduled downgrade, and past-due states.
   - Do not add a persistent count to the bar itself unless Randall separately approves it.

4. **Apply Wizard limit states**
   - Revise `design-system/components/apply-wizard.html`.
   - Add only final-use confirmation and zero-remaining behavior.
   - Do not add the counter to normal wizard states.

5. **Markdown export**
   - Revise `design-system/components/export.html`.
   - Replace CSV/Premium copy with the approved Markdown/Roaring behavior.
   - Design available and locked/upgrade states.

6. **Checkout return and error states**
   - Map to the approved plan/billing card rather than inventing a new visual system.

### 13.2 Claude deliverables

For each touched card:

- approved desktop state;
- approved 320/375/390 mobile behavior;
- all loading, error, success, locked, and cancellation states;
- exact public copy;
- exact component mapping;
- manifest entry;
- `register_assets`;
- repo mirror parity.

Claude must present the design review as a numbered list so Randall can approve or correct by number.

## 14. Implementation Ownership: Codex

Codex owns the heavy implementation after the relevant product contract and Claude Design states are approved.

### 14.1 Backend/data

- subscription schema migration;
- Stripe schema migration;
- Apply Wizard usage migration;
- provider usage telemetry migration;
- database functions/triggers/indexes;
- subscription repository and enforcement refactor;
- access-code protection;
- Stripe SDK/config/catalog;
- Checkout endpoint;
- Portal endpoint;
- plan-change endpoint;
- webhook handler;
- reconciliation script;
- account plan/usage API;
- atomic Human Path persistence;
- outreach metering removal;
- Markdown renderer/export endpoint;
- cost instrumentation;
- cost report;
- posting-refinement backoff;
- pasted-job deterministic-first/caching work;
- tests and migration harnesses.

### 14.2 Production UI port

After Claude Design approval, Codex ports the approved result into:

- homepage;
- plan selection;
- Profile Plan/Billing popups;
- Apply Wizard limit states;
- Markdown export surface.

Codex must not invent layout, CSS, component structure, visual hierarchy, or replacement copy during the port.

### 14.3 Randall/manual ownership

- maintain the approved Smoldering/Roaring public naming;
- approve Claude designs;
- create/configure Stripe account products and prices;
- configure Stripe Portal;
- configure Stripe Public details URLs;
- decide tax setup with accounting;
- set Vercel environment variables;
- approve final legal language after counsel review;
- authorize production migrations;
- authorize any controlled live payment/refund test.

## 15. Expected File Scope

Exact files can narrow as implementation proceeds. The likely scope is:

### Existing backend files

- `lib/public-profile/subscription/types.ts`
- `lib/public-profile/subscription/rules.ts`
- `lib/public-profile/subscription/enforcement.ts`
- `lib/public-profile/subscription/repository.ts`
- `lib/public-profile/pursuits/types.ts`
- `lib/public-profile/pursuits/state-machine.ts`
- `lib/public-profile/pursuits/repository.ts`
- `lib/public-profile/api.ts`
- `lib/account/access-codes.ts`
- `lib/public-profile/outreach-generator.ts`
- `lib/public-profile/resume-parse.ts`
- `lib/public-profile/resume-highlights.ts`
- `lib/public-profile/voice-fingerprint.ts`
- `lib/public-jobs/ingest-link.ts`
- `lib/scan/refine-postings.ts`
- `lib/scan/sources/llm-extract-posting.ts`

### New backend files, provisional

- `lib/billing/config.ts`
- `lib/billing/catalog.ts`
- `lib/billing/stripe-client.ts`
- `lib/billing/service.ts`
- `lib/billing/webhook.ts`
- `lib/costs/provider-usage.ts`
- `app/api/billing/checkout/route.ts`
- `app/api/billing/portal/route.ts`
- `app/api/billing/change-plan/route.ts`
- `app/api/billing/stripe/webhook/route.ts`

### API/account routes

- `app/api/account/plan/route.ts`
- optionally a focused `app/api/account/subscription/route.ts`
- `app/api/public-profile/pursuits/export/route.ts`
- `app/api/public-profile/pursuits/human-path/route.ts`
- `app/api/public-profile/pursuits/outreach/route.ts`

### Migrations

- `supabase/migrations/20260724000200_provider_usage_events.sql`
- `supabase/migrations/20260724000300_subscription_billing_two_tier.sql`
- later same-date numbered migrations only if separation materially improves rollback/testing

### Tests/scripts

- `scripts/test-public-profile-subscription.ts`
- `scripts/test-public-profile-api.ts`
- `scripts/test-public-profile-pursuits.ts`
- `scripts/test-public-profile-export.ts`
- new Stripe checkout/webhook tests
- new subscription/billing migration harness
- new provider-usage tests
- `scripts/report-subscription-unit-economics.mjs`
- `scripts/reconcile-stripe-subscriptions.mjs`
- `package.json`

### Design/public UI files, only after Claude approval

- `design-system/components/plan-billing-step.html`
- `design-system/components/onboarding-account-bar.html`
- `design-system/components/apply-wizard.html`
- `design-system/components/export.html`
- new approved homepage-pricing card
- `design-system/_ds_manifest.json`
- `app/page.tsx`
- `app/site.module.css` only if the approved homepage design requires it
- `app/plan/PlanClient.tsx`
- `app/plan/plan.module.css`
- `app/onboarding/OnboardingClient.tsx`
- `app/onboarding/onboarding.module.css`
- `app/dashboard/ApplyWizardModal.tsx`
- `app/dashboard/apply-wizard.module.css`

### Public documentation

- `app/legal/terms/page.tsx`
- `app/legal/privacy/page.tsx`
- `app/legal/billing/page.tsx`
- `app/legal/contact/page.tsx`

## 16. Migration Strategy

### 16.1 Preflight

Before writing the migration:

- inventory all `subscription_plans`;
- inventory `user_subscriptions` by plan/source/status;
- inventory current-period usage by type;
- identify any paid Stripe fields already present (expected none);
- identify active `pro` users;
- identify tester access-code users;
- identify duplicate/invalid pursuit debits;
- confirm current migration history.

No production data changes occur during preflight.

### 16.2 Backward-compatible migration

The first migration must:

- add new columns/tables/types without breaking the deployed code;
- add `apply_wizard` to allowed usage types;
- add unique one-use-per-pursuit enforcement;
- add Stripe/provider telemetry tables;
- update `basic` to $22/20/no export;
- update `premium` to $32/45/export;
- mark `pro` unavailable for new purchase;
- preserve `tester`;
- preserve old usage rows;
- avoid deleting subscriptions.

### 16.3 Historical backfill

Backfill `apply_wizard` only where evidence proves a useful contact result existed:

- pursuit has at least one persisted contact;
- use earliest successful Human Path time;
- one row maximum per pursuit;
- no inferred debit for empty results.

Do not let the backfill unexpectedly consume a new retail subscriber's first paid period. If no retail paid subscriptions exist, record and verify that fact. If they do exist by implementation time, define a per-user migration treatment before applying.

### 16.4 Application cutover

1. Deploy code that can read old and new schema.
2. Apply migration.
3. Enable new write path behind `BILLING_ENABLED=false`.
4. Run test-mode billing and metering verification.
5. Stop old `pursuit` debit and quota writes.
6. Enable retail checkout only after production configuration is complete.

### 16.5 Rollback

Rollback is operational, not destructive:

- turn `BILLING_ENABLED=false`;
- keep access-code tester entry working;
- stop new Checkout Session creation;
- continue processing Stripe webhooks so paid state is not lost;
- do not drop new tables or erase events;
- revert application behavior only after schema compatibility is confirmed.

Never roll back by deleting customer subscriptions or payment records.

## 17. Execution Phases

### Phase 0: Contract and naming freeze

- [ ] Approve this plan.
- [x] Approve two public tier names: Smoldering and Roaring, with Roaring as the top plan.
- [ ] Confirm access-code tester path remains during paid launch.
- [ ] Confirm no annual/quarterly prices at launch.
- [ ] Confirm no overages and no rollover.

Exit gate: product contract has no unresolved behavior needed by backend or design.

### Phase 1: Cost telemetry foundation

- [ ] Add provider usage schema.
- [ ] Capture Anthropic usage fields.
- [ ] Capture Exa request/result/cost events.
- [ ] Add cost report.
- [ ] Add pasted-job deterministic-first/content-hash behavior.
- [ ] Add refinement backoff.
- [ ] Establish baseline cost per successful Apply Wizard use.

Exit gate: a test pursuit can be reconciled to its provider calls and estimated cost without storing raw provider content.

### Phase 2: Subscription and quota migration

- [x] Build migration and test harness.
- [x] Convert runtime to database-backed entitlements.
- [x] Remove no-subscription active-basic fallback.
- [x] Add `apply_wizard` usage.
- [x] Add atomic Human Path commit RPC.
- [ ] Remove pursuit debit from outreach RPC.
- [x] Stop retail Human Path quota enforcement.
- [ ] Stop retail outreach quota enforcement.
- [x] Preserve testers.
- [x] Protect Stripe subscriptions from access-code overwrite.

Exit gate: concurrency, empty-result, replay, period, and plan tests pass.

### Phase 3: Stripe test-mode backend

- [ ] Install/pin Stripe SDK.
- [ ] Add server config and price allowlist.
- [ ] Add Checkout endpoint.
- [ ] Add Portal endpoint.
- [ ] Add plan-change endpoint.
- [ ] Add signed webhook endpoint.
- [ ] Add event idempotency.
- [ ] Add reconciliation report.
- [ ] Add subscription/usage account API.

Exit gate: Stripe CLI/test-mode exercises the complete subscription lifecycle.

### Phase 4: Markdown export backend

- [ ] Define Markdown document fixture.
- [ ] Implement renderer.
- [ ] Include full structured pursuit history.
- [ ] Enforce Roaring access.
- [ ] Remove public CSV copy/behavior after parity.
- [ ] Add security and ownership tests.

Exit gate: fixture output is stable, contains no internal/provider data, and downloads correctly.

### Phase 5: Claude Design

- [ ] Two-tier homepage pricing.
- [ ] Plan/Checkout states.
- [ ] quiet Profile Plan/Billing detail.
- [ ] Apply Wizard final-use/zero-use states.
- [ ] Markdown export available/locked states.
- [ ] Mobile/desktop review.
- [ ] Randall approval.
- [ ] Full design sync.

Exit gate: exact approved designs and copy exist for every production UI state.

### Phase 6: Public copy and legal

- [ ] Draft Terms.
- [ ] Draft Privacy.
- [ ] Draft Subscription/Billing terms.
- [ ] Update Support.
- [ ] Counsel review.
- [ ] Randall approval.
- [ ] Configure Stripe Public details URLs.
- [ ] Configure Checkout Terms consent.

Exit gate: pricing, checkout, Terms, Privacy, and Billing mechanics agree word for word on material facts.

### Phase 7: Production UI implementation

- [ ] Port approved homepage pricing.
- [ ] Port approved plan/Checkout flow.
- [ ] Port approved Plan/Billing detail.
- [ ] Port approved Apply Wizard limit states.
- [ ] Port approved Markdown export states.
- [ ] Maintain design-system/production parity.

Exit gate: all approved states work at required breakpoints with real API fixtures.

### Phase 8: Full release validation

- [ ] Typecheck.
- [ ] Lint.
- [ ] Full fixture suite.
- [ ] Subscription tests.
- [ ] Stripe tests.
- [ ] Migration tests.
- [ ] Public export tests.
- [ ] Production build.
- [ ] `git diff --check`.
- [ ] Browser visual QA at 320, 375, 390, 1280, and 1440.
- [ ] Accessibility keyboard/focus tests.
- [ ] Homepage/legal/plan HTTP 200 checks.
- [ ] Protected API unauthorized checks.
- [ ] No em dashes in changed public product copy.
- [ ] No provider/internal language in public product copy.

Exit gate: release check is green and every material limitation is disclosed.

### Phase 9: Stripe live-mode setup

- [ ] Create live products/prices.
- [ ] Configure live Portal.
- [ ] Configure live Public details.
- [ ] Configure live webhook.
- [ ] Set production secrets and price IDs.
- [ ] Verify no secret value entered into git/chat.
- [ ] Run read-only production preflight.
- [ ] Apply production migration.
- [ ] Deploy with `BILLING_ENABLED=false`.
- [ ] Verify webhook reachability/signature handling.

Exit gate: live configuration and deployed code agree while retail Checkout remains disabled.

### Phase 10: Controlled production activation

- [ ] Enable retail billing.
- [ ] Complete one authorized controlled live subscription.
- [ ] Verify webhook-local subscription parity.
- [ ] Verify 20/45 entitlement.
- [ ] Verify Plan popup usage.
- [ ] Verify one successful Apply Wizard debit.
- [ ] Verify failed/empty result no debit.
- [ ] Verify Markdown export Roaring gate.
- [ ] Verify Customer Portal.
- [ ] Verify cancellation at period end.
- [ ] Refund/cancel the controlled QA transaction only with Randall's explicit approval.
- [ ] Clean disposable application QA data without deleting required Stripe audit records.

Exit gate: paid production lifecycle is proven end to end.

### Phase 11: Post-launch observation

- [ ] Check webhook failures daily for the first week.
- [ ] Run Stripe reconciliation daily for the first week.
- [ ] Review provider cost per Apply Wizard use.
- [ ] Review empty/failed contact-search rate.
- [ ] Review plan selection and upgrade rates.
- [ ] Review support/billing issues.
- [ ] Revisit price or allowance only after real usage data, not isolated anecdotes.

## 18. Required Test Matrix

### Subscription

- no subscription;
- basic active;
- premium active;
- tester active;
- scheduled cancellation;
- past due;
- canceled;
- period boundary;
- malformed/unknown plan;
- retired `pro`.

### Apply Wizard

- zero remaining preflight;
- one remaining success;
- one remaining empty result;
- provider failure;
- persistence failure;
- cached result;
- same-pursuit replay;
- later-period revisit;
- double click;
- concurrent pursuits competing for final use;
- basic 20th/21st pursuit;
- premium 45th/46th pursuit;
- tester behavior.

### Outreach

- initial message generation after counted pursuit;
- multiple selected contacts;
- one regeneration;
- second regeneration rejected;
- no separate retail quota block;
- idempotent retry;
- persistence rollback.

### Stripe

- Checkout basic;
- Checkout premium;
- invalid plan;
- arbitrary price rejected;
- duplicate subscription prevented;
- Checkout return before webhook;
- duplicate webhook;
- invalid signature;
- out-of-order subscription event;
- invoice paid;
- invoice failed;
- immediate upgrade paid;
- immediate upgrade payment failed;
- scheduled downgrade;
- cancel at period end;
- reverse cancellation;
- subscription deleted.

### Access codes

- valid tester code;
- invalid;
- expired;
- exhausted;
- concurrent final redemption;
- paid account cannot be overwritten;
- existing tester survives migration.

### Export

- premium Markdown success;
- basic locked;
- inactive subscription locked;
- tester behavior;
- owner scope;
- no pursuits;
- multiple pursuits;
- contacts/messages/tracking included;
- deleted records excluded;
- no provider/internal data;
- filename/content headers.

## 19. Release Observability

Log and alert without sensitive content:

- Checkout Session creation failures;
- webhook signature failures;
- webhook processing failures;
- duplicate/replayed webhook count;
- Stripe/local subscription mismatches;
- quota rejections by plan;
- Apply Wizard commit replays;
- provider failures and empty results;
- cost per successful pursuit;
- outreach retries;
- Markdown export failures.

Never log:

- Stripe secret/webhook secret;
- card/payment-method data;
- raw resume text;
- raw provider responses;
- raw contact-search highlights;
- generated message content in billing logs.

## 20. Production-Ready Definition

This initiative is production-ready only when:

1. Smoldering and Roaring, their approved prices, limits, and feature descriptions are consistent everywhere.
2. A missing subscription cannot receive paid workflow access.
3. One successful new pursuit consumes exactly one Apply Wizard use.
4. Failed, empty, cached, and repeated pursuits do not consume another use.
5. Concurrency cannot overspend the allowance.
6. Outreach no longer creates a second customer-facing quota.
7. The counter is quiet and discoverable in Profile/Plan.
8. The normal Apply Wizard does not display an accumulating count.
9. The zero-use state blocks only new contact discovery and clearly identifies the reset/upgrade path.
10. Stripe Checkout, Portal, webhooks, changes, cancellation, and payment failure are verified.
11. Access-code testers still work and cannot overwrite paid state.
12. Roaring downloads a correct Markdown history file.
13. The lower plan receives the approved export lock state.
14. Provider/model cost is auditable.
15. Public Terms, Privacy, Billing, Support, pricing, and Checkout disclosures agree.
16. Claude Design and production are in parity.
17. Required tests, build, visual QA, accessibility, migration preflight/postflight, and production smoke tests pass.
18. The canonical public routes return HTTP 200.
19. The commit is pushed to `origin/main`.
20. Vercel production is tied to the pushed commit and verified.

## 21. Official Stripe References Used for This Plan

- Checkout Sessions: <https://docs.stripe.com/api/checkout/sessions>
- Checkout subscriptions: <https://docs.stripe.com/payments/checkout/build-subscriptions>
- Checkout Terms consent: <https://docs.stripe.com/api/checkout/sessions/create>
- Webhook receipt/signature verification: <https://docs.stripe.com/webhooks>
- Subscription webhook lifecycle: <https://docs.stripe.com/billing/subscriptions/webhooks>
- Customer Portal: <https://docs.stripe.com/customer-management/integrate-customer-portal>
- Subscription changes: <https://docs.stripe.com/billing/subscriptions/change>
- Price changes and pending updates: <https://docs.stripe.com/billing/subscriptions/change-price>
- Proration: <https://docs.stripe.com/billing/subscriptions/prorations>
- Cancellation: <https://docs.stripe.com/billing/subscriptions/cancel>
- Checkout tax collection: <https://docs.stripe.com/payments/checkout/taxes>

Re-check the current official documentation and pin the Stripe SDK/API version at implementation time.

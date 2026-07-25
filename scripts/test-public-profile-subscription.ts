import assert from "node:assert/strict";
import {
  enforceSubscriptionFeature,
  summarizeSubscriptionUsage,
} from "../lib/public-profile/subscription/enforcement";
import {
  isBillingEnabled,
  loadSubscriptionContextForUser,
} from "../lib/public-profile/subscription/repository";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";
import type { SubscriptionContext, UsageLedgerEntry } from "../lib/public-profile/subscription/types";

const at = "2026-06-29T12:00:00.000Z";
const billingDisabledEnv = {
  NODE_ENV: "test",
  BILLING_ENABLED: "false",
} as NodeJS.ProcessEnv;
const billingEnabledEnv = {
  NODE_ENV: "test",
  BILLING_ENABLED: "true",
} as NodeJS.ProcessEnv;
const premium: SubscriptionContext = {
  planName: "premium",
  status: "active",
  currentPeriodStart: "2026-06-01T00:00:00.000Z",
  currentPeriodEnd: "2026-07-01T00:00:00.000Z",
};

function usage(usageType: UsageLedgerEntry["usageType"], quantity: number, createdAt = at): UsageLedgerEntry {
  return {
    userId: "user-1",
    usageType,
    quantity,
    createdAt,
  };
}

const entries = [
  usage("human_path", 49),
  usage("outreach_message", 148),
  usage("outreach_message", 10, "2026-05-15T00:00:00.000Z"),
  usage("pursuit", 49),
];

// premium (Goodest): pursuits 50, human path 50, outreach 150, export unlocked
const summary = summarizeSubscriptionUsage(premium, entries, at);
assert.equal(summary.humanPath.used, 49);
assert.equal(summary.humanPath.limit, 50);
assert.equal(summary.humanPath.remaining, 1);
assert.equal(summary.outreach.used, 148);
assert.equal(summary.outreach.remaining, 2);
assert.equal(summary.pursuit.limit, 50);
assert.equal(summary.pursuit.remaining, 1);
assert.equal(summary.pursuedJobsExport.unlocked, true);

const humanPathAllowed = enforceSubscriptionFeature(premium, entries, "human_path", { at });
assert.equal(humanPathAllowed.status, "allowed");
if (humanPathAllowed.status === "allowed") {
  assert.equal(humanPathAllowed.remaining, 0);
}

const humanPathLimit = enforceSubscriptionFeature(premium, entries, "human_path", { at, quantity: 2 });
assert.equal(humanPathLimit.status, "limit_reached");
if (humanPathLimit.status === "limit_reached") {
  assert.equal(humanPathLimit.used, 49);
  assert.equal(humanPathLimit.limit, 50);
}

const outreachAllowed = enforceSubscriptionFeature(premium, entries, "outreach_message", { at, quantity: 2 });
assert.equal(outreachAllowed.status, "allowed");
if (outreachAllowed.status === "allowed") assert.equal(outreachAllowed.remaining, 0);

const pursuitAllowed = enforceSubscriptionFeature(premium, entries, "pursuit", { at });
assert.equal(pursuitAllowed.status, "allowed");
if (pursuitAllowed.status === "allowed") assert.equal(pursuitAllowed.remaining, 0);

const pursuitLimit = enforceSubscriptionFeature(premium, entries, "pursuit", { at, quantity: 2 });
assert.equal(pursuitLimit.status, "limit_reached");

// basic (Good): profile only — pursuits, human path, outreach all locked at 0
const basic: SubscriptionContext = { ...premium, planName: "basic" };
const basicPursuit = enforceSubscriptionFeature(basic, [], "pursuit", { at });
assert.equal(basicPursuit.status, "limit_reached");
const basicHumanPath = enforceSubscriptionFeature(basic, [], "human_path", { at });
assert.equal(basicHumanPath.status, "limit_reached");
const basicOutreach = enforceSubscriptionFeature(basic, [], "outreach_message", { at });
assert.equal(basicOutreach.status, "limit_reached");
const exportLocked = enforceSubscriptionFeature(basic, entries, "pursued_jobs_export", { at });
assert.deepEqual(exportLocked, { status: "locked", feature: "pursued_jobs_export", requiredPlan: "premium" });

// pro (Gooder): contact discovery only — human path 25/mo, no outreach, no pursuits, no export
const pro: SubscriptionContext = { ...premium, planName: "pro" };
const proHumanPath = enforceSubscriptionFeature(pro, [usage("human_path", 24)], "human_path", { at });
assert.equal(proHumanPath.status, "allowed");
const proHumanPathLimit = enforceSubscriptionFeature(pro, [usage("human_path", 25)], "human_path", { at });
assert.equal(proHumanPathLimit.status, "limit_reached");
const proOutreach = enforceSubscriptionFeature(pro, [], "outreach_message", { at });
assert.equal(proOutreach.status, "limit_reached");
const proPursuit = enforceSubscriptionFeature(pro, [], "pursuit", { at });
assert.equal(proPursuit.status, "limit_reached");
const proExport = enforceSubscriptionFeature(pro, entries, "pursued_jobs_export", { at });
assert.deepEqual(proExport, { status: "locked", feature: "pursued_jobs_export", requiredPlan: "premium" });

const pastDue = enforceSubscriptionFeature({ ...premium, status: "past_due" }, [], "outreach_message", { at });
assert.deepEqual(pastDue, {
  status: "subscription_inactive",
  feature: "outreach_message",
  subscriptionStatus: "past_due",
});

// tester (access-code free plan): pursuits 25, human path 25, outreach 75, export unlocked
const testerSummary = summarizeSubscriptionUsage({ ...premium, planName: "tester" }, [usage("human_path", 25)], at);
assert.equal(testerSummary.humanPath.limit, 25);
assert.equal(testerSummary.humanPath.remaining, 0);
assert.equal(testerSummary.outreach.limit, 75);
assert.equal(testerSummary.pursuit.limit, 25);
assert.equal(testerSummary.pursuedJobsExport.unlocked, true);

async function repositoryAssertions() {
  assert.equal(isBillingEnabled({} as NodeJS.ProcessEnv), false);
  assert.equal(isBillingEnabled(billingDisabledEnv), false);
  assert.equal(isBillingEnabled(billingEnabledEnv), true);

  const legacyCalls: Array<{ table: string; query?: string }> = [];
  const noSubscriptionRequest: PublicProfileRepositoryRequest = async <T>(
    table: string,
    options: Parameters<PublicProfileRepositoryRequest>[1],
  ) => {
    legacyCalls.push({ table, query: options.query });
    return [] as T;
  };
  const legacyMissing = await loadSubscriptionContextForUser(noSubscriptionRequest, "user-1");
  assert.deepEqual(legacyMissing, { planName: "basic", status: "active" });
  assert.equal(legacyCalls.length, 1);
  assert.equal(legacyCalls[0].query?.includes("source"), false);

  const enabledMissing = await loadSubscriptionContextForUser(
    noSubscriptionRequest,
    "user-1",
    { billingEnabled: true },
  );
  assert.deepEqual(enabledMissing, { planName: null, status: "missing" });
  assert.deepEqual(
    enforceSubscriptionFeature(enabledMissing, [], "apply_wizard", { at }),
    { status: "subscription_missing", feature: "apply_wizard" },
  );

  const enabledCalls: Array<{ table: string; query?: string }> = [];
  const enabledRequest: PublicProfileRepositoryRequest = async <T>(
    table: string,
    options: Parameters<PublicProfileRepositoryRequest>[1],
  ) => {
    enabledCalls.push({ table, query: options.query });
    if (table === "user_subscriptions") {
      return [{
        plan_id: "plan-basic",
        status: "active",
        source: "stripe",
        current_period_start: "2026-06-01T00:00:00.000Z",
        current_period_end: "2026-07-01T00:00:00.000Z",
        cancel_at_period_end: false,
        canceled_at: null,
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_123",
        stripe_price_id: "price_123",
        stripe_status_raw: "active",
      }] as T;
    }
    return [{
      id: "plan-basic",
      name: "basic",
      pursuit_limit_monthly: 0,
      human_path_limit_monthly: 0,
      outreach_limit_monthly: 0,
      apply_wizard_limit_monthly: 20,
      profile_export: false,
      markdown_export: false,
      publicly_available: true,
      internal_only: false,
    }] as T;
  };
  const smoldering = await loadSubscriptionContextForUser(
    enabledRequest,
    "user-1",
    { billingEnabled: true },
  );
  assert.equal(smoldering.planName, "basic");
  assert.equal(smoldering.source, "stripe");
  assert.equal(smoldering.stripeSubscriptionId, "sub_123");
  assert.equal(smoldering.entitlements?.applyWizardLimitMonthly, 20);
  assert.equal(smoldering.entitlements?.markdownExport, false);
  assert.equal(enabledCalls[0].query?.includes("stripe_subscription_id"), true);
  assert.equal(enabledCalls[1].query?.includes("apply_wizard_limit_monthly"), true);

  const smolderingUsage = [usage("apply_wizard", 19)];
  const finalUse = enforceSubscriptionFeature(
    smoldering,
    smolderingUsage,
    "apply_wizard",
    { at },
  );
  assert.deepEqual(finalUse, {
    status: "allowed",
    feature: "apply_wizard",
    used: 19,
    limit: 20,
    remaining: 0,
  });
  const smolderingSummary = summarizeSubscriptionUsage(smoldering, smolderingUsage, at);
  assert.equal(smolderingSummary.applyWizard.remaining, 1);
  assert.equal(smolderingSummary.markdownExport.unlocked, false);
  assert.deepEqual(
    enforceSubscriptionFeature(smoldering, [usage("apply_wizard", 20)], "apply_wizard", { at }),
    {
      status: "limit_reached",
      feature: "apply_wizard",
      used: 20,
      limit: 20,
      remaining: 0,
    },
  );
  assert.deepEqual(
    enforceSubscriptionFeature(
      {
        ...smoldering,
        currentPeriodStart: undefined,
        currentPeriodEnd: undefined,
      },
      [],
      "apply_wizard",
      { at },
    ),
    {
      status: "subscription_period_invalid",
      feature: "apply_wizard",
    },
  );

  const accessCodeContext: SubscriptionContext = {
    ...smoldering,
    source: "access_code",
    currentPeriodStart: "2026-01-01T00:00:00.000Z",
    currentPeriodEnd: "2026-02-01T00:00:00.000Z",
  };
  assert.deepEqual(
    enforceSubscriptionFeature(
      accessCodeContext,
      [usage("apply_wizard", 19)],
      "apply_wizard",
      { at },
    ),
    {
      status: "allowed",
      feature: "apply_wizard",
      used: 19,
      limit: 20,
      remaining: 0,
    },
  );
}

repositoryAssertions()
  .then(() => {
    console.log("public profile subscription: all assertions passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

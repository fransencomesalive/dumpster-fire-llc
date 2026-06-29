import assert from "node:assert/strict";
import {
  enforceSubscriptionFeature,
  summarizeSubscriptionUsage,
} from "../lib/public-profile/subscription/enforcement";
import type { SubscriptionContext, UsageLedgerEntry } from "../lib/public-profile/subscription/types";

const at = "2026-06-29T12:00:00.000Z";
const basic: SubscriptionContext = {
  planName: "basic",
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
  usage("outreach_message", 98),
  usage("outreach_message", 10, "2026-05-15T00:00:00.000Z"),
  usage("pursuit", 300),
];

const summary = summarizeSubscriptionUsage(basic, entries, at);
assert.equal(summary.humanPath.used, 49);
assert.equal(summary.humanPath.limit, 50);
assert.equal(summary.humanPath.remaining, 1);
assert.equal(summary.outreach.used, 98);
assert.equal(summary.outreach.remaining, 2);
assert.equal(summary.pursuit.limit, undefined);
assert.equal(summary.pursuedJobsExport.unlocked, false);

const humanPathAllowed = enforceSubscriptionFeature(basic, entries, "human_path", { at });
assert.equal(humanPathAllowed.status, "allowed");
if (humanPathAllowed.status === "allowed") {
  assert.equal(humanPathAllowed.remaining, 0);
}

const humanPathLimit = enforceSubscriptionFeature(basic, entries, "human_path", { at, quantity: 2 });
assert.equal(humanPathLimit.status, "limit_reached");
if (humanPathLimit.status === "limit_reached") {
  assert.equal(humanPathLimit.used, 49);
  assert.equal(humanPathLimit.limit, 50);
}

const outreachAllowed = enforceSubscriptionFeature(basic, entries, "outreach_message", { at, quantity: 2 });
assert.equal(outreachAllowed.status, "allowed");
if (outreachAllowed.status === "allowed") assert.equal(outreachAllowed.remaining, 0);

const pursuitAllowed = enforceSubscriptionFeature(basic, entries, "pursuit", { at, quantity: 25 });
assert.equal(pursuitAllowed.status, "allowed");
if (pursuitAllowed.status === "allowed") assert.equal(pursuitAllowed.limit, undefined);

const exportLocked = enforceSubscriptionFeature(basic, entries, "pursued_jobs_export", { at });
assert.deepEqual(exportLocked, { status: "locked", feature: "pursued_jobs_export", requiredPlan: "pro" });

const proExport = enforceSubscriptionFeature({ ...basic, planName: "pro" }, entries, "pursued_jobs_export", { at });
assert.deepEqual(proExport, { status: "allowed", feature: "pursued_jobs_export" });

const proHumanPathLimit = enforceSubscriptionFeature({ ...basic, planName: "pro" }, [usage("human_path", 200)], "human_path", { at });
assert.equal(proHumanPathLimit.status, "limit_reached");

const pastDue = enforceSubscriptionFeature({ ...basic, status: "past_due" }, [], "outreach_message", { at });
assert.deepEqual(pastDue, {
  status: "subscription_inactive",
  feature: "outreach_message",
  subscriptionStatus: "past_due",
});

const testerSummary = summarizeSubscriptionUsage({ ...basic, planName: "tester" }, [usage("human_path", 25)], at);
assert.equal(testerSummary.humanPath.limit, 25);
assert.equal(testerSummary.outreach.limit, 50);

console.log("public profile subscription: all assertions passed");

import assert from "node:assert/strict";
import {
  enforceSubscriptionFeature,
  summarizeSubscriptionUsage,
} from "../lib/public-profile/subscription/enforcement";
import type { SubscriptionContext, UsageLedgerEntry } from "../lib/public-profile/subscription/types";

const at = "2026-06-29T12:00:00.000Z";
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

console.log("public profile subscription: all assertions passed");

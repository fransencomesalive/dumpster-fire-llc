import { rulesForPlan } from "./rules";
import type {
  GatedFeature,
  MeteredFeature,
  PlanRules,
  SubscriptionContext,
  SubscriptionEnforcementResult,
  SubscriptionUsageSummary,
  UsageLedgerEntry,
} from "./types";

function periodStartFor(at: string) {
  const date = new Date(at);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function periodEndFor(at: string) {
  const date = new Date(at);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString();
}

function isActiveStatus(status: SubscriptionContext["status"]) {
  return status === "active" || status === "trialing";
}

function usageInPeriod(
  entries: UsageLedgerEntry[],
  usageType: UsageLedgerEntry["usageType"],
  start: string,
  end: string,
) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  return entries
    .filter((entry) => entry.usageType === usageType)
    .filter((entry) => {
      const created = Date.parse(entry.createdAt);
      return Number.isFinite(created) && created >= startMs && created < endMs;
    })
    .reduce((sum, entry) => sum + entry.quantity, 0);
}

function limitForFeature(rules: PlanRules, feature: MeteredFeature) {
  if (feature === "pursuit") return rules.pursuitLimitMonthly;
  if (feature === "human_path") return rules.humanPathLimitMonthly;
  return rules.outreachLimitMonthly;
}

function usageTypeForFeature(feature: MeteredFeature): UsageLedgerEntry["usageType"] {
  return feature;
}

function periodFor(context: SubscriptionContext, at: string) {
  return {
    start: context.currentPeriodStart ?? periodStartFor(at),
    end: context.currentPeriodEnd ?? periodEndFor(at),
  };
}

function remainingFor(used: number, limit?: number) {
  return limit === undefined ? undefined : Math.max(0, limit - used);
}

export function summarizeSubscriptionUsage(
  context: SubscriptionContext,
  entries: UsageLedgerEntry[],
  at: string,
): SubscriptionUsageSummary {
  const rules = rulesForPlan(context.planName);
  const period = periodFor(context, at);
  const pursuitUsed = usageInPeriod(entries, "pursuit", period.start, period.end);
  const humanPathUsed = usageInPeriod(entries, "human_path", period.start, period.end);
  const outreachUsed = usageInPeriod(entries, "outreach_message", period.start, period.end);

  return {
    pursuit: {
      used: pursuitUsed,
      limit: rules.pursuitLimitMonthly,
      remaining: remainingFor(pursuitUsed, rules.pursuitLimitMonthly),
    },
    humanPath: {
      used: humanPathUsed,
      limit: rules.humanPathLimitMonthly,
      remaining: remainingFor(humanPathUsed, rules.humanPathLimitMonthly),
    },
    outreach: {
      used: outreachUsed,
      limit: rules.outreachLimitMonthly,
      remaining: remainingFor(outreachUsed, rules.outreachLimitMonthly),
    },
    pursuedJobsExport: {
      unlocked: rules.pursuedJobsExport,
    },
  };
}

export function enforceSubscriptionFeature(
  context: SubscriptionContext,
  entries: UsageLedgerEntry[],
  feature: GatedFeature,
  options: { quantity?: number; at: string },
): SubscriptionEnforcementResult {
  if (!isActiveStatus(context.status)) {
    return {
      status: "subscription_inactive",
      feature,
      subscriptionStatus: context.status,
    };
  }

  const rules = rulesForPlan(context.planName);
  if (feature === "pursued_jobs_export") {
    return rules.pursuedJobsExport
      ? { status: "allowed", feature }
      : { status: "locked", feature, requiredPlan: "premium" };
  }

  const quantity = Math.max(1, Math.round(options.quantity ?? 1));
  const limit = limitForFeature(rules, feature);
  const period = periodFor(context, options.at);
  const used = usageInPeriod(entries, usageTypeForFeature(feature), period.start, period.end);
  if (limit === undefined) {
    return { status: "allowed", feature, used };
  }

  const remaining = Math.max(0, limit - used);
  if (quantity > remaining) {
    return {
      status: "limit_reached",
      feature,
      used,
      limit,
      remaining: 0,
    };
  }

  return {
    status: "allowed",
    feature,
    used,
    limit,
    remaining: remaining - quantity,
  };
}

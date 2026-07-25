import { rulesForPlan } from "./rules";
import type {
  GatedFeature,
  MeteredFeature,
  PlanRules,
  SubscriptionContext,
  SubscriptionEnforcementResult,
  SubscriptionPlanEntitlements,
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

function limitForFeature(rules: PlanRules & { applyWizardLimitMonthly?: number }, feature: MeteredFeature) {
  if (feature === "pursuit") return rules.pursuitLimitMonthly;
  if (feature === "human_path") return rules.humanPathLimitMonthly;
  if (feature === "apply_wizard") return rules.applyWizardLimitMonthly;
  return rules.outreachLimitMonthly;
}

function usageTypeForFeature(feature: MeteredFeature): UsageLedgerEntry["usageType"] {
  return feature;
}

export function subscriptionUsagePeriod(context: SubscriptionContext, at: string) {
  if (context.source && context.source !== "stripe") {
    return {
      start: periodStartFor(at),
      end: periodEndFor(at),
    };
  }
  return {
    start: context.currentPeriodStart ?? periodStartFor(at),
    end: context.currentPeriodEnd ?? periodEndFor(at),
  };
}

function remainingFor(used: number, limit?: number) {
  return limit === undefined ? undefined : Math.max(0, limit - used);
}

function rulesForContext(context: SubscriptionContext): (PlanRules & {
  applyWizardLimitMonthly?: number;
  markdownExport: boolean;
}) | undefined {
  if (context.entitlements) {
    const entitlements: SubscriptionPlanEntitlements = context.entitlements;
    if (!context.planName) return undefined;
    return {
      planName: context.planName,
      pursuitLimitMonthly: entitlements.pursuitLimitMonthly,
      humanPathLimitMonthly: entitlements.humanPathLimitMonthly,
      outreachLimitMonthly: entitlements.outreachLimitMonthly,
      applyWizardLimitMonthly: entitlements.applyWizardLimitMonthly,
      pursuedJobsExport: entitlements.pursuedJobsExport,
      markdownExport: entitlements.markdownExport,
    };
  }
  if (!context.planName) return undefined;
  const legacyRules = rulesForPlan(context.planName);
  return {
    ...legacyRules,
    markdownExport: legacyRules.pursuedJobsExport,
  };
}

export function summarizeSubscriptionUsage(
  context: SubscriptionContext,
  entries: UsageLedgerEntry[],
  at: string,
): SubscriptionUsageSummary {
  const rules = rulesForContext(context);
  const period = subscriptionUsagePeriod(context, at);
  const pursuitUsed = usageInPeriod(entries, "pursuit", period.start, period.end);
  const humanPathUsed = usageInPeriod(entries, "human_path", period.start, period.end);
  const outreachUsed = usageInPeriod(entries, "outreach_message", period.start, period.end);
  const applyWizardUsed = usageInPeriod(entries, "apply_wizard", period.start, period.end);

  return {
    pursuit: {
      used: pursuitUsed,
      limit: rules?.pursuitLimitMonthly,
      remaining: remainingFor(pursuitUsed, rules?.pursuitLimitMonthly),
    },
    humanPath: {
      used: humanPathUsed,
      limit: rules?.humanPathLimitMonthly,
      remaining: remainingFor(humanPathUsed, rules?.humanPathLimitMonthly),
    },
    outreach: {
      used: outreachUsed,
      limit: rules?.outreachLimitMonthly,
      remaining: remainingFor(outreachUsed, rules?.outreachLimitMonthly),
    },
    applyWizard: {
      used: applyWizardUsed,
      limit: rules?.applyWizardLimitMonthly,
      remaining: remainingFor(applyWizardUsed, rules?.applyWizardLimitMonthly),
    },
    pursuedJobsExport: {
      unlocked: rules?.pursuedJobsExport ?? false,
    },
    markdownExport: {
      unlocked: rules?.markdownExport ?? false,
    },
  };
}

export function enforceSubscriptionFeature(
  context: SubscriptionContext,
  entries: UsageLedgerEntry[],
  feature: GatedFeature,
  options: { quantity?: number; at: string },
): SubscriptionEnforcementResult {
  if (context.status === "missing" || !context.planName) {
    return { status: "subscription_missing", feature };
  }

  if (!isActiveStatus(context.status)) {
    return {
      status: "subscription_inactive",
      feature,
      subscriptionStatus: context.status,
    };
  }

  if (context.source === "stripe") {
    const start = Date.parse(context.currentPeriodStart ?? "");
    const end = Date.parse(context.currentPeriodEnd ?? "");
    const requestedAt = Date.parse(options.at);
    if (!Number.isFinite(start)
      || !Number.isFinite(end)
      || !Number.isFinite(requestedAt)
      || end <= start
      || requestedAt < start
      || requestedAt >= end) {
      return { status: "subscription_period_invalid", feature };
    }
  }

  const rules = rulesForContext(context);
  if (!rules) return { status: "subscription_missing", feature };

  if (feature === "pursued_jobs_export" || feature === "markdown_export") {
    const unlocked = feature === "markdown_export"
      ? rules.markdownExport
      : rules.pursuedJobsExport;
    return unlocked
      ? { status: "allowed", feature }
      : { status: "locked", feature, requiredPlan: "premium" };
  }

  const quantity = Math.max(1, Math.round(options.quantity ?? 1));
  const limit = limitForFeature(rules, feature);
  const period = subscriptionUsagePeriod(context, options.at);
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

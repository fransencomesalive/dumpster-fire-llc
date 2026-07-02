import type { PlanRules, SubscriptionPlanName } from "./types";

// Feature-gated tiers per the public subscription matrix (Randall, 2026-07-02):
// Good=basic (profile only), Gooder=pro (+ contact discovery), Goodest=premium
// (full pursuits). tester is the internal free plan granted by access codes.
export const PLAN_RULES: Record<SubscriptionPlanName, PlanRules> = {
  tester: {
    planName: "tester",
    pursuitLimitMonthly: 25,
    humanPathLimitMonthly: 25,
    outreachLimitMonthly: 75,
    pursuedJobsExport: true,
  },
  basic: {
    planName: "basic",
    pursuitLimitMonthly: 0,
    humanPathLimitMonthly: 0,
    outreachLimitMonthly: 0,
    pursuedJobsExport: false,
  },
  pro: {
    planName: "pro",
    pursuitLimitMonthly: 0,
    humanPathLimitMonthly: 25,
    outreachLimitMonthly: 0,
    pursuedJobsExport: false,
  },
  premium: {
    planName: "premium",
    pursuitLimitMonthly: 50,
    humanPathLimitMonthly: 50,
    outreachLimitMonthly: 150,
    pursuedJobsExport: true,
  },
};

export function rulesForPlan(planName: SubscriptionPlanName): PlanRules {
  return PLAN_RULES[planName];
}

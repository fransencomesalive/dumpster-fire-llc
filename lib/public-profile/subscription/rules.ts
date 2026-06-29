import type { PlanRules, SubscriptionPlanName } from "./types";

export const PLAN_RULES: Record<SubscriptionPlanName, PlanRules> = {
  tester: {
    planName: "tester",
    humanPathLimitMonthly: 25,
    outreachLimitMonthly: 50,
    pursuedJobsExport: false,
  },
  basic: {
    planName: "basic",
    humanPathLimitMonthly: 50,
    outreachLimitMonthly: 100,
    pursuedJobsExport: false,
  },
  pro: {
    planName: "pro",
    humanPathLimitMonthly: 200,
    outreachLimitMonthly: 500,
    pursuedJobsExport: true,
  },
  premium: {
    planName: "premium",
    pursuedJobsExport: true,
  },
};

export function rulesForPlan(planName: SubscriptionPlanName): PlanRules {
  return PLAN_RULES[planName];
}

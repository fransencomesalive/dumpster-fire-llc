export type SubscriptionPlanName = "tester" | "basic" | "pro" | "premium";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export type MeteredFeature = "pursuit" | "human_path" | "outreach_message";

export type GatedFeature = MeteredFeature | "pursued_jobs_export";

export type UsageLedgerEntry = {
  userId: string;
  usageType: "pursuit" | "outreach_message" | "human_path" | "profile_export";
  quantity: number;
  createdAt: string;
};

export type SubscriptionContext = {
  planName: SubscriptionPlanName;
  status: SubscriptionStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
};

export type PlanRules = {
  planName: SubscriptionPlanName;
  pursuitLimitMonthly?: number;
  humanPathLimitMonthly?: number;
  outreachLimitMonthly?: number;
  pursuedJobsExport: boolean;
};

export type SubscriptionUsageSummary = {
  pursuit: { used: number; limit?: number; remaining?: number };
  humanPath: { used: number; limit?: number; remaining?: number };
  outreach: { used: number; limit?: number; remaining?: number };
  pursuedJobsExport: { unlocked: boolean };
};

export type SubscriptionEnforcementResult =
  | {
      status: "allowed";
      feature: GatedFeature;
      used?: number;
      limit?: number;
      remaining?: number;
    }
  | {
      status: "limit_reached";
      feature: MeteredFeature;
      used: number;
      limit: number;
      remaining: 0;
    }
  | {
      status: "locked";
      feature: "pursued_jobs_export";
      requiredPlan: "premium";
    }
  | {
      status: "subscription_inactive";
      feature: GatedFeature;
      subscriptionStatus: Exclude<SubscriptionStatus, "trialing" | "active">;
    };

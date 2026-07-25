export type SubscriptionPlanName = "tester" | "basic" | "pro" | "premium";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "missing";

export type SubscriptionSource = "stripe" | "access_code" | "manual";

export type MeteredFeature = "pursuit" | "human_path" | "outreach_message" | "apply_wizard";

export type GatedFeature = MeteredFeature | "pursued_jobs_export" | "markdown_export";

export type UsageLedgerEntry = {
  userId: string;
  usageType: "pursuit" | "outreach_message" | "human_path" | "apply_wizard" | "profile_export" | "voice_fingerprint" | "resume_highlights";
  quantity: number;
  createdAt: string;
};

export type SubscriptionPlanEntitlements = {
  pursuitLimitMonthly?: number;
  humanPathLimitMonthly?: number;
  outreachLimitMonthly?: number;
  applyWizardLimitMonthly: number;
  pursuedJobsExport: boolean;
  markdownExport: boolean;
  publiclyAvailable: boolean;
  internalOnly: boolean;
};

export type SubscriptionContext = {
  planName: SubscriptionPlanName | null;
  status: SubscriptionStatus;
  source?: SubscriptionSource;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  stripeStatusRaw?: string;
  entitlements?: SubscriptionPlanEntitlements;
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
  applyWizard: { used: number; limit?: number; remaining?: number };
  pursuedJobsExport: { unlocked: boolean };
  markdownExport: { unlocked: boolean };
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
      feature: "pursued_jobs_export" | "markdown_export";
      requiredPlan: "premium";
    }
  | {
      status: "subscription_missing";
      feature: GatedFeature;
    }
  | {
      status: "subscription_period_invalid";
      feature: GatedFeature;
    }
  | {
      status: "subscription_inactive";
      feature: GatedFeature;
      subscriptionStatus: Exclude<SubscriptionStatus, "trialing" | "active" | "missing">;
    };

import type { PublicProfileRepositoryRequest } from "../repository";
import type {
  SubscriptionContext,
  SubscriptionPlanName,
  SubscriptionSource,
  SubscriptionStatus,
  UsageLedgerEntry,
} from "./types";

type SubscriptionRow = {
  plan_id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  source?: string;
  cancel_at_period_end?: boolean;
  canceled_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_price_id?: string | null;
  stripe_status_raw?: string | null;
};

type PlanRow = {
  id: string;
  name: string;
  pursuit_limit_monthly?: number | null;
  human_path_limit_monthly?: number | null;
  outreach_limit_monthly?: number | null;
  apply_wizard_limit_monthly?: number | null;
  profile_export?: boolean;
  markdown_export?: boolean;
  publicly_available?: boolean;
  internal_only?: boolean;
};

type UsageLedgerRow = {
  usage_type: UsageLedgerEntry["usageType"];
  quantity: number;
  created_at: string;
};

const PLAN_NAMES = new Set<SubscriptionPlanName>(["tester", "basic", "pro", "premium"]);
const SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>(["trialing", "active", "past_due", "canceled"]);
const SUBSCRIPTION_SOURCES = new Set<SubscriptionSource>(["stripe", "access_code", "manual"]);

function qs(params: Record<string, string>) {
  return `?${new URLSearchParams(params).toString()}`;
}

function first<T>(rows: T[]) {
  return rows[0];
}

function periodStartFor(at: string) {
  const date = new Date(at);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function planName(value: string | undefined): SubscriptionPlanName | undefined {
  return PLAN_NAMES.has(value as SubscriptionPlanName) ? value as SubscriptionPlanName : undefined;
}

function subscriptionStatus(value: string): SubscriptionStatus {
  return SUBSCRIPTION_STATUSES.has(value as SubscriptionStatus) ? value as SubscriptionStatus : "canceled";
}

function subscriptionSource(value: string | undefined): SubscriptionSource | undefined {
  return SUBSCRIPTION_SOURCES.has(value as SubscriptionSource) ? value as SubscriptionSource : undefined;
}

function defined<T>(value: T | null | undefined) {
  return value === null || value === undefined ? undefined : value;
}

function optionalLimit(value: number | null | undefined) {
  return typeof value === "number" && value >= 0 ? value : undefined;
}

export function isBillingEnabled(env: NodeJS.ProcessEnv = process.env) {
  const value = env.BILLING_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export async function loadSubscriptionContextForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  options: { billingEnabled?: boolean } = {},
): Promise<SubscriptionContext> {
  if (!options.billingEnabled) {
    const rows = await request<SubscriptionRow[]>("user_subscriptions", {
      query: qs({
        user_id: `eq.${userId}`,
        select: "plan_id,status,current_period_start,current_period_end",
        limit: "1",
      }),
    });
    const subscription = first(rows);
    if (!subscription) return { planName: "basic", status: "active" };

    const plans = await request<PlanRow[]>("subscription_plans", {
      query: qs({
        id: `eq.${subscription.plan_id}`,
        select: "id,name",
        limit: "1",
      }),
    });

    return {
      planName: planName(first(plans)?.name) ?? "basic",
      status: subscriptionStatus(subscription.status),
      currentPeriodStart: subscription.current_period_start ?? undefined,
      currentPeriodEnd: subscription.current_period_end ?? undefined,
    };
  }

  const rows = await request<SubscriptionRow[]>("user_subscriptions", {
    query: qs({
      user_id: `eq.${userId}`,
      select: "plan_id,status,source,current_period_start,current_period_end,cancel_at_period_end,canceled_at,stripe_customer_id,stripe_subscription_id,stripe_price_id,stripe_status_raw",
      limit: "1",
    }),
  });
  const subscription = first(rows);
  if (!subscription) return { planName: null, status: "missing" };
  const mappedSource = subscriptionSource(subscription.source);
  if (!mappedSource) return { planName: null, status: "missing" };

  const plans = await request<PlanRow[]>("subscription_plans", {
    query: qs({
      id: `eq.${subscription.plan_id}`,
      select: "id,name,pursuit_limit_monthly,human_path_limit_monthly,outreach_limit_monthly,apply_wizard_limit_monthly,profile_export,markdown_export,publicly_available,internal_only",
      limit: "1",
    }),
  });
  const plan = first(plans);
  const mappedPlanName = planName(plan?.name);
  if (!plan || !mappedPlanName || optionalLimit(plan.apply_wizard_limit_monthly) === undefined) {
    return { planName: null, status: "missing" };
  }

  return {
    planName: mappedPlanName,
    status: subscriptionStatus(subscription.status),
    source: mappedSource,
    currentPeriodStart: subscription.current_period_start ?? undefined,
    currentPeriodEnd: subscription.current_period_end ?? undefined,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    canceledAt: defined(subscription.canceled_at),
    stripeCustomerId: defined(subscription.stripe_customer_id),
    stripeSubscriptionId: defined(subscription.stripe_subscription_id),
    stripePriceId: defined(subscription.stripe_price_id),
    stripeStatusRaw: defined(subscription.stripe_status_raw),
    entitlements: {
      pursuitLimitMonthly: optionalLimit(plan.pursuit_limit_monthly),
      humanPathLimitMonthly: optionalLimit(plan.human_path_limit_monthly),
      outreachLimitMonthly: optionalLimit(plan.outreach_limit_monthly),
      applyWizardLimitMonthly: plan.apply_wizard_limit_monthly as number,
      pursuedJobsExport: plan.profile_export === true,
      markdownExport: plan.markdown_export === true,
      publiclyAvailable: plan.publicly_available === true,
      internalOnly: plan.internal_only === true,
    },
  };
}

export async function loadUsageLedgerForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  options: { at: string; periodStart?: string; periodEnd?: string },
): Promise<UsageLedgerEntry[]> {
  const query: Record<string, string> = {
    user_id: `eq.${userId}`,
    created_at: `gte.${options.periodStart ?? periodStartFor(options.at)}`,
    select: "usage_type,quantity,created_at",
  };

  const rows = await request<UsageLedgerRow[]>("usage_ledger", {
    query: qs(query),
  });

  return rows.map((row) => ({
    userId,
    usageType: row.usage_type,
    quantity: row.quantity,
    createdAt: row.created_at,
  }));
}

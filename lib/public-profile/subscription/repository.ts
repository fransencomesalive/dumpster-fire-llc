import type { PublicProfileRepositoryRequest } from "../repository";
import type {
  SubscriptionContext,
  SubscriptionPlanName,
  SubscriptionStatus,
  UsageLedgerEntry,
} from "./types";

type SubscriptionRow = {
  plan_id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
};

type PlanRow = {
  id: string;
  name: string;
};

type UsageLedgerRow = {
  usage_type: UsageLedgerEntry["usageType"];
  quantity: number;
  created_at: string;
};

const PLAN_NAMES = new Set<SubscriptionPlanName>(["tester", "basic", "pro", "premium"]);
const SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>(["trialing", "active", "past_due", "canceled"]);

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

function planName(value: string | undefined): SubscriptionPlanName {
  return PLAN_NAMES.has(value as SubscriptionPlanName) ? value as SubscriptionPlanName : "basic";
}

function subscriptionStatus(value: string): SubscriptionStatus {
  return SUBSCRIPTION_STATUSES.has(value as SubscriptionStatus) ? value as SubscriptionStatus : "canceled";
}

export async function loadSubscriptionContextForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
): Promise<SubscriptionContext> {
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
    planName: planName(first(plans)?.name),
    status: subscriptionStatus(subscription.status),
    currentPeriodStart: subscription.current_period_start ?? undefined,
    currentPeriodEnd: subscription.current_period_end ?? undefined,
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

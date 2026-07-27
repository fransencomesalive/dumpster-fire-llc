import type { PublicProfileRepositoryRequest } from "../public-profile/repository";

export type BillingSubscriptionRow = {
  user_id: string;
  plan_id: string;
  status: "trialing" | "active" | "past_due" | "canceled";
  source: "stripe" | "access_code" | "manual";
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  stripe_status_raw: string | null;
  latest_invoice_id: string | null;
  last_stripe_event_created_at: string | null;
  stripe_snapshot_retrieved_at: string | null;
};

function qs(params: Record<string, string>) {
  return `?${new URLSearchParams(params).toString()}`;
}

const SUBSCRIPTION_SELECT = [
  "user_id",
  "plan_id",
  "status",
  "source",
  "current_period_start",
  "current_period_end",
  "cancel_at_period_end",
  "canceled_at",
  "stripe_customer_id",
  "stripe_subscription_id",
  "stripe_price_id",
  "stripe_status_raw",
  "latest_invoice_id",
  "last_stripe_event_created_at",
  "stripe_snapshot_retrieved_at",
].join(",");

export async function loadBillingSubscriptionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
) {
  const rows = await request<BillingSubscriptionRow[]>("user_subscriptions", {
    query: qs({
      user_id: `eq.${userId}`,
      select: SUBSCRIPTION_SELECT,
      limit: "1",
    }),
  });
  return rows[0];
}

export async function loadBillingSubscriptionByStripeIdentity(
  request: PublicProfileRepositoryRequest,
  input: { subscriptionId?: string; customerId?: string },
) {
  const filters: string[] = [];
  if (input.subscriptionId) filters.push(`stripe_subscription_id.eq.${input.subscriptionId}`);
  if (input.customerId) filters.push(`stripe_customer_id.eq.${input.customerId}`);
  if (filters.length === 0) return undefined;
  const rows = await request<BillingSubscriptionRow[]>("user_subscriptions", {
    query: qs({
      or: `(${filters.join(",")})`,
      select: SUBSCRIPTION_SELECT,
      limit: "1",
    }),
  });
  return rows[0];
}

export function listStripeBillingSubscriptions(
  request: PublicProfileRepositoryRequest,
) {
  return request<BillingSubscriptionRow[]>("user_subscriptions", {
    query: qs({
      source: "eq.stripe",
      select: SUBSCRIPTION_SELECT,
      order: "user_id.asc",
    }),
  });
}

export type BillingPlanRow = {
  id: string;
  name: string;
};

export function listRetailBillingPlans(
  request: PublicProfileRepositoryRequest,
) {
  return request<BillingPlanRow[]>("subscription_plans", {
    query: qs({
      name: "in.(basic,premium)",
      select: "id,name",
    }),
  });
}

export type ClaimStripeEventResult = {
  status: "claimed" | "duplicate" | "busy";
  attemptCount: number;
};

export function claimStripeWebhookEvent(
  request: PublicProfileRepositoryRequest,
  input: {
    eventId: string;
    eventType: string;
    objectId: string;
    eventCreatedAt: string;
    receivedAt: string;
  },
) {
  return request<ClaimStripeEventResult>("rpc/claim_stripe_webhook_event", {
    method: "POST",
    body: {
      p_event_id: input.eventId,
      p_event_type: input.eventType,
      p_object_id: input.objectId,
      p_event_created_at: input.eventCreatedAt,
      p_received_at: input.receivedAt,
    },
  });
}

export function markStripeWebhookEventFailed(
  request: PublicProfileRepositoryRequest,
  input: { eventId: string; errorSummary: string },
) {
  return request("rpc/mark_stripe_webhook_event_failed", {
    method: "POST",
    body: {
      p_event_id: input.eventId,
      p_error_summary: input.errorSummary.slice(0, 240),
    },
  });
}

export function markStripeWebhookEventProcessed(
  request: PublicProfileRepositoryRequest,
  eventId: string,
) {
  return request("rpc/mark_stripe_webhook_event_processed", {
    method: "POST",
    body: { p_event_id: eventId },
  });
}

export type PersistStripeSubscriptionResult = {
  status:
    | "persisted"
    | "snapshot_stale"
    | "event_not_claimed"
    | "plan_missing"
    | "non_stripe_entitlement_exists"
    | "stripe_identity_conflict";
};

export function persistStripeSubscriptionSnapshot(
  request: PublicProfileRepositoryRequest,
  input: {
    eventId: string;
    eventCreatedAt: string;
    snapshotRetrievedAt: string;
    userId: string;
    planCode: "basic" | "premium";
    subscriptionStatus: "trialing" | "active" | "past_due" | "canceled";
    stripeStatusRaw: string;
    customerId: string;
    subscriptionId: string;
    priceId: string;
    cancelAtPeriodEnd: boolean;
    canceledAt?: string;
    latestInvoiceId?: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
  },
) {
  return request<PersistStripeSubscriptionResult>("rpc/persist_stripe_subscription_snapshot", {
    method: "POST",
    body: {
      p_event_id: input.eventId,
      p_event_created_at: input.eventCreatedAt,
      p_snapshot_retrieved_at: input.snapshotRetrievedAt,
      p_user_id: input.userId,
      p_plan_code: input.planCode,
      p_status: input.subscriptionStatus,
      p_stripe_status_raw: input.stripeStatusRaw,
      p_stripe_customer_id: input.customerId,
      p_stripe_subscription_id: input.subscriptionId,
      p_stripe_price_id: input.priceId,
      p_cancel_at_period_end: input.cancelAtPeriodEnd,
      p_canceled_at: input.canceledAt ?? null,
      p_latest_invoice_id: input.latestInvoiceId ?? null,
      p_current_period_start: input.currentPeriodStart,
      p_current_period_end: input.currentPeriodEnd,
    },
  });
}

export type ReconcileStripeSubscriptionResult = {
  status:
    | "reconciled"
    | "snapshot_stale"
    | "subscription_missing"
    | "plan_missing"
    | "non_stripe_entitlement_exists"
    | "stripe_identity_conflict";
};

export function reconcileStripeSubscriptionSnapshot(
  request: PublicProfileRepositoryRequest,
  input: {
    userId: string;
    snapshotRetrievedAt: string;
    planCode: "basic" | "premium";
    subscriptionStatus: "trialing" | "active" | "past_due" | "canceled";
    stripeStatusRaw: string;
    customerId: string;
    subscriptionId: string;
    priceId: string;
    cancelAtPeriodEnd: boolean;
    canceledAt?: string;
    latestInvoiceId?: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
  },
) {
  return request<ReconcileStripeSubscriptionResult>(
    "rpc/reconcile_stripe_subscription_snapshot",
    {
      method: "POST",
      body: {
        p_user_id: input.userId,
        p_snapshot_retrieved_at: input.snapshotRetrievedAt,
        p_plan_code: input.planCode,
        p_status: input.subscriptionStatus,
        p_stripe_status_raw: input.stripeStatusRaw,
        p_stripe_customer_id: input.customerId,
        p_stripe_subscription_id: input.subscriptionId,
        p_stripe_price_id: input.priceId,
        p_cancel_at_period_end: input.cancelAtPeriodEnd,
        p_canceled_at: input.canceledAt ?? null,
        p_latest_invoice_id: input.latestInvoiceId ?? null,
        p_current_period_start: input.currentPeriodStart,
        p_current_period_end: input.currentPeriodEnd,
      },
    },
  );
}

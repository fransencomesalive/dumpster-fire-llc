import type { PublicProfileRepositoryRequest } from "../public-profile/repository";
import { mapStripeSubscriptionStatus } from "./lifecycle";
import {
  listRetailBillingPlans,
  listStripeBillingSubscriptions,
  reconcileStripeSubscriptionSnapshot,
} from "./repository";
import type { BillingStripeGateway } from "./types";

export type StripeReconciliationItem = {
  userId: string;
  subscriptionId: string | null;
  status: "matched" | "mismatched" | "error";
  mismatches: string[];
  repaired: boolean;
  error?: string;
};

function sameInstant(left: string | null, right: string) {
  if (!left) return false;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs;
}

function sameOptionalInstant(left: string | null, right: string | undefined) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return sameInstant(left, right);
}

export async function reconcileStripeSubscriptions(input: {
  repositoryRequest: PublicProfileRepositoryRequest;
  stripe: BillingStripeGateway;
  write: boolean;
}) {
  const [subscriptions, plans] = await Promise.all([
    listStripeBillingSubscriptions(input.repositoryRequest),
    listRetailBillingPlans(input.repositoryRequest),
  ]);
  const planIds = new Map(plans.map((plan) => [plan.name, plan.id]));
  const items: StripeReconciliationItem[] = [];

  for (const local of subscriptions) {
    if (!local.stripe_subscription_id) {
      items.push({
        userId: local.user_id,
        subscriptionId: null,
        status: "error",
        mismatches: ["stripe_subscription_id"],
        repaired: false,
        error: "missing_stripe_subscription_id",
      });
      continue;
    }
    try {
      const current = await input.stripe.retrieveSubscription(local.stripe_subscription_id);
      const snapshotRetrievedAt = new Date().toISOString();
      if (current.livemode) throw new Error("live_subscription_rejected_in_test_mode");
      const planCode = input.stripe.planCodeForPrice(current.priceId);
      if (!planCode) throw new Error("price_not_allowlisted");
      await input.stripe.validatePrice(planCode);
      const status = mapStripeSubscriptionStatus(current.statusRaw);
      const planId = planIds.get(planCode);
      if (!planId) throw new Error("local_plan_missing");

      const mismatches: string[] = [];
      if (local.plan_id !== planId) mismatches.push("plan");
      if (local.status !== status) mismatches.push("status");
      if (local.stripe_status_raw !== current.statusRaw) mismatches.push("stripe_status_raw");
      if (local.stripe_customer_id !== current.customerId) mismatches.push("customer");
      if (local.stripe_price_id !== current.priceId) mismatches.push("price");
      if (!sameInstant(local.current_period_start, current.currentPeriodStart)) mismatches.push("period_start");
      if (!sameInstant(local.current_period_end, current.currentPeriodEnd)) mismatches.push("period_end");
      if (local.cancel_at_period_end !== current.cancelAtPeriodEnd) mismatches.push("cancel_at_period_end");
      if (!sameOptionalInstant(local.canceled_at, current.canceledAt)) mismatches.push("canceled_at");
      if (local.latest_invoice_id !== (current.latestInvoiceId ?? null)) mismatches.push("latest_invoice_id");

      let repaired = false;
      if (input.write && mismatches.length > 0) {
        const result = await reconcileStripeSubscriptionSnapshot(input.repositoryRequest, {
          userId: local.user_id,
          snapshotRetrievedAt,
          planCode,
          subscriptionStatus: status,
          stripeStatusRaw: current.statusRaw,
          customerId: current.customerId,
          subscriptionId: current.id,
          priceId: current.priceId,
          cancelAtPeriodEnd: current.cancelAtPeriodEnd,
          canceledAt: current.canceledAt,
          latestInvoiceId: current.latestInvoiceId,
          currentPeriodStart: current.currentPeriodStart,
          currentPeriodEnd: current.currentPeriodEnd,
        });
        if (result.status === "snapshot_stale") {
          throw new Error("reconciliation_snapshot_stale_retry");
        }
        if (result.status !== "reconciled") {
          throw new Error(`reconciliation_${result.status}`);
        }
        repaired = true;
      }
      items.push({
        userId: local.user_id,
        subscriptionId: local.stripe_subscription_id,
        status: mismatches.length > 0 ? "mismatched" : "matched",
        mismatches,
        repaired,
      });
    } catch (error) {
      items.push({
        userId: local.user_id,
        subscriptionId: local.stripe_subscription_id,
        status: "error",
        mismatches: [],
        repaired: false,
        error: error instanceof Error ? error.message.slice(0, 120) : "reconciliation_failed",
      });
    }
  }

  return {
    mode: input.write ? "write" : "report",
    checked: items.length,
    matched: items.filter((item) => item.status === "matched").length,
    mismatched: items.filter((item) => item.status === "mismatched").length,
    errors: items.filter((item) => item.status === "error").length,
    repaired: items.filter((item) => item.repaired).length,
    items,
  };
}

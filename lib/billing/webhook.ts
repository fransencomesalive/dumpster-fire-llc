import {
  createPublicProfileRepositoryRequest,
  getPublicProfileRepositoryConfig,
  type PublicProfileRepositoryRequest,
} from "../public-profile/repository";
import { BillingConfigurationError, getBillingConfig } from "./config";
import { STRIPE_PROJECT_ID } from "./catalog";
import { mapStripeSubscriptionStatus } from "./lifecycle";
import {
  claimStripeWebhookEvent,
  loadBillingSubscriptionByStripeIdentity,
  markStripeWebhookEventFailed,
  markStripeWebhookEventProcessed,
  persistStripeSubscriptionSnapshot,
} from "./repository";
import { createStripeGateway } from "./stripe-client";
import type {
  BillingStripeGateway,
  StripeSubscriptionSnapshot,
} from "./types";

const SUBSCRIPTION_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.pending_update_applied",
  "customer.subscription.pending_update_expired",
  "invoice.paid",
  "invoice.payment_failed",
]);

type WebhookOptions = {
  env?: NodeJS.ProcessEnv;
  repositoryRequest?: PublicProfileRepositoryRequest;
  stripe?: BillingStripeGateway;
  now?: () => string;
};

function result(status: number, body: Record<string, unknown>) {
  return { status, body };
}

function safeErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "stripe_webhook_processing_failed";
  if (error.message.startsWith("stripe_")) return error.message.slice(0, 240);
  if (error.message.startsWith("Supabase ")) return "stripe_webhook_database_failed";
  return "stripe_webhook_processing_failed";
}

async function resolveUserId(
  request: PublicProfileRepositoryRequest,
  eventUserId: string | undefined,
  subscription: StripeSubscriptionSnapshot,
) {
  const local = await loadBillingSubscriptionByStripeIdentity(request, {
    subscriptionId: subscription.id,
    customerId: subscription.customerId,
  });
  if (
    subscription.metadataUserId
    && eventUserId
    && subscription.metadataUserId !== eventUserId
  ) {
    throw new Error("stripe_subscription_event_user_mismatch");
  }
  const metadataUserId = subscription.metadataUserId ?? eventUserId;
  if (local && metadataUserId && local.user_id !== metadataUserId) {
    throw new Error("stripe_subscription_user_mismatch");
  }
  return local?.user_id ?? metadataUserId;
}

export async function handleStripeWebhook(
  input: {
    rawBody: string;
    signature: string | null;
  },
  options: WebhookOptions = {},
) {
  if (!input.signature) return result(400, { error: "missing_signature" });

  let repositoryRequest = options.repositoryRequest;
  if (!repositoryRequest) {
    const repositoryConfig = getPublicProfileRepositoryConfig(options.env);
    if (!repositoryConfig) return result(503, { error: "storage_not_configured" });
    repositoryRequest = createPublicProfileRepositoryRequest(repositoryConfig);
  }

  let stripe: BillingStripeGateway;
  try {
    stripe = options.stripe ?? createStripeGateway(getBillingConfig(options.env));
  } catch (error) {
    if (error instanceof BillingConfigurationError) {
      return result(503, { error: "stripe_not_configured", missing: error.missing });
    }
    throw error;
  }

  let event;
  try {
    event = stripe.constructWebhookEvent(input.rawBody, input.signature);
  } catch {
    return result(400, { error: "invalid_signature" });
  }
  if (event.livemode) return result(400, { error: "live_event_rejected_in_test_mode" });

  const receivedAt = options.now?.() ?? new Date().toISOString();
  const claim = await claimStripeWebhookEvent(repositoryRequest, {
    eventId: event.id,
    eventType: event.type,
    objectId: event.objectId,
    eventCreatedAt: event.createdAt,
    receivedAt,
  }).catch(() => null);
  if (!claim) return result(503, { error: "event_claim_failed" });
  if (claim.status === "duplicate") {
    return result(200, { received: true, duplicate: true });
  }
  if (claim.status === "busy") {
    return result(503, { error: "event_already_processing" });
  }

  try {
    if (!SUBSCRIPTION_EVENTS.has(event.type)) {
      await markStripeWebhookEventProcessed(repositoryRequest, event.id);
      return result(200, { received: true, ignored: true });
    }
    if (event.metadataProject && event.metadataProject !== STRIPE_PROJECT_ID) {
      await markStripeWebhookEventProcessed(repositoryRequest, event.id);
      return result(200, {
        received: true,
        ignored: true,
        reason: "foreign_project",
      });
    }
    if (!event.subscriptionId) {
      await markStripeWebhookEventProcessed(repositoryRequest, event.id);
      return result(200, { received: true, diagnosticOnly: true });
    }

    const subscription = await stripe.retrieveSubscription(event.subscriptionId);
    const snapshotRetrievedAt = options.now?.() ?? new Date().toISOString();
    if (subscription.livemode) throw new Error("stripe_live_subscription_rejected");
    if (subscription.metadataProject !== STRIPE_PROJECT_ID) {
      await markStripeWebhookEventProcessed(repositoryRequest, event.id);
      return result(200, {
        received: true,
        ignored: true,
        reason: "foreign_project",
      });
    }
    const planCode = stripe.planCodeForPrice(subscription.priceId);
    if (!planCode) throw new Error("stripe_subscription_price_not_allowlisted");
    if (subscription.metadataPlanCode !== planCode) {
      throw new Error("stripe_subscription_plan_metadata_mismatch");
    }
    await stripe.validatePrice(planCode);
    const userId = await resolveUserId(
      repositoryRequest,
      event.metadataUserId,
      subscription,
    );
    if (!userId) throw new Error("stripe_subscription_user_missing");

    const persisted = await persistStripeSubscriptionSnapshot(repositoryRequest, {
      eventId: event.id,
      eventCreatedAt: event.createdAt,
      snapshotRetrievedAt,
      userId,
      planCode,
      subscriptionStatus: mapStripeSubscriptionStatus(subscription.statusRaw),
      stripeStatusRaw: subscription.statusRaw,
      customerId: subscription.customerId,
      subscriptionId: subscription.id,
      priceId: subscription.priceId,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt: subscription.canceledAt,
      latestInvoiceId: subscription.latestInvoiceId ?? event.invoiceId,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
    if (persisted.status !== "persisted" && persisted.status !== "snapshot_stale") {
      throw new Error(`stripe_${persisted.status}`);
    }
    return result(200, {
      received: true,
      persisted: persisted.status === "persisted",
      snapshotStale: persisted.status === "snapshot_stale",
    });
  } catch (error) {
    const errorSummary = safeErrorCode(error);
    await markStripeWebhookEventFailed(repositoryRequest, {
      eventId: event.id,
      errorSummary,
    }).catch(() => undefined);
    console.error("Stripe webhook processing failed", {
      project: STRIPE_PROJECT_ID,
      eventId: event.id,
      eventType: event.type,
      error: errorSummary,
    });
    return result(503, { error: "webhook_processing_failed" });
  }
}

import type { RetailPlanCode } from "./catalog";

export type StripeSubscriptionSnapshot = {
  id: string;
  customerId: string;
  itemId: string;
  priceId: string;
  statusRaw: string;
  cancelAtPeriodEnd: boolean;
  canceledAt?: string;
  latestInvoiceId?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  metadataProject?: string;
  metadataUserId?: string;
  metadataPlanCode?: RetailPlanCode;
  pendingUpdate: boolean;
  scheduleId?: string;
  livemode: boolean;
};

export type BillingWebhookEvent = {
  id: string;
  type: string;
  createdAt: string;
  objectId: string;
  subscriptionId?: string;
  invoiceId?: string;
  metadataProject?: string;
  metadataUserId?: string;
  metadataPlanCode?: RetailPlanCode;
  livemode: boolean;
};

export type BillingStripeGateway = {
  planCodeForPrice(priceId: string): RetailPlanCode | undefined;
  validatePrice(planCode: RetailPlanCode): Promise<void>;
  createCheckoutSession(input: {
    userId: string;
    email?: string;
    planCode: RetailPlanCode;
    customerId?: string;
    idempotencyKey: string;
  }): Promise<{ id: string; url: string | null }>;
  createPortalSession(customerId: string): Promise<{ id: string; url: string }>;
  retrieveSubscription(subscriptionId: string): Promise<StripeSubscriptionSnapshot>;
  upgradeSubscription(input: {
    subscription: StripeSubscriptionSnapshot;
    targetPlanCode: "premium";
    idempotencyKey: string;
  }): Promise<StripeSubscriptionSnapshot>;
  scheduleDowngrade(input: {
    subscription: StripeSubscriptionSnapshot;
    targetPlanCode: "basic";
    idempotencyKey: string;
  }): Promise<{ scheduleId: string; alreadyScheduled: boolean }>;
  constructWebhookEvent(rawBody: string, signature: string): BillingWebhookEvent;
};

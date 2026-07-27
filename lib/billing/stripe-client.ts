import Stripe from "stripe";
import {
  isRetailPlanCode,
  planCodeForPrice,
  RETAIL_PLAN_CONTRACT,
  STRIPE_PRICE_LOOKUP_KEYS,
  STRIPE_PROJECT_ID,
  STRIPE_RESOURCE_METADATA,
  type RetailPlanCode,
} from "./catalog";
import {
  getBillingConfig,
  STRIPE_API_VERSION,
  type BillingConfig,
} from "./config";
import type {
  BillingStripeGateway,
  BillingWebhookEvent,
  StripeSubscriptionSnapshot,
} from "./types";

export const STRIPE_DOWNGRADE_SCHEDULE_END_BEHAVIOR = "release" as const;

export function checkoutConsentCollection(
  consent: BillingConfig["checkoutTermsConsent"],
): { terms_of_service: "required" } | undefined {
  return consent === "required" ? { terms_of_service: "required" } : undefined;
}

function objectId(value: { id: string } | string | null | undefined) {
  if (!value) return undefined;
  return typeof value === "string" ? value : value.id;
}

function unixIso(value: number | null | undefined) {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : undefined;
}

type StripeSubscriptionLike = {
  id: string;
  customer: string | { id: string };
  items: {
    data: Array<{
      id: string;
      price: { id: string };
      current_period_start: number;
      current_period_end: number;
    }>;
  };
  status: string;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  latest_invoice: string | { id: string } | null;
  metadata: Record<string, string>;
  pending_update: unknown | null;
  schedule: string | { id: string } | null;
  livemode: boolean;
};

function snapshot(subscription: StripeSubscriptionLike): StripeSubscriptionSnapshot {
  const item = subscription.items.data[0];
  if (!item || subscription.items.data.length !== 1) {
    throw new Error("stripe_subscription_must_have_one_item");
  }
  const customerId = objectId(subscription.customer);
  if (!customerId) throw new Error("stripe_subscription_customer_missing");
  const metadataPlanCode = isRetailPlanCode(subscription.metadata.plan_code)
    ? subscription.metadata.plan_code
    : undefined;

  return {
    id: subscription.id,
    customerId,
    itemId: item.id,
    priceId: item.price.id,
    statusRaw: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: unixIso(subscription.canceled_at),
    latestInvoiceId: objectId(subscription.latest_invoice),
    currentPeriodStart: new Date(item.current_period_start * 1000).toISOString(),
    currentPeriodEnd: new Date(item.current_period_end * 1000).toISOString(),
    metadataProject: subscription.metadata.project || undefined,
    metadataUserId: subscription.metadata.app_user_id || undefined,
    metadataPlanCode,
    pendingUpdate: subscription.pending_update !== null,
    scheduleId: objectId(subscription.schedule),
    livemode: subscription.livemode,
  };
}

function eventObjectId(object: unknown) {
  const value = object as unknown as Record<string, unknown>;
  return typeof value.id === "string" ? value.id : "unknown";
}

function eventSubscriptionId(object: unknown) {
  const value = object as unknown as {
    object?: string;
    id?: string;
    subscription?: string | { id: string } | null;
    parent?: {
      subscription_details?: {
        subscription?: string | { id: string } | null;
      } | null;
    } | null;
  };
  if (value.object === "subscription") return value.id;
  if (value.object === "checkout.session") return objectId(value.subscription);
  if (value.object === "invoice") {
    return objectId(value.parent?.subscription_details?.subscription);
  }
  return undefined;
}

function eventMetadata(object: unknown) {
  const value = object as unknown as { metadata?: Record<string, string> | null };
  return value.metadata ?? {};
}

export function createStripeGateway(
  config: BillingConfig = getBillingConfig(),
): BillingStripeGateway {
  const stripe = new Stripe(config.secretKey, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 20_000,
    telemetry: false,
  });
  let accountValidation: Promise<void> | undefined;
  const validatedPrices = new Map<RetailPlanCode, Promise<void>>();

  async function validateAccount() {
    if (!accountValidation) {
      accountValidation = stripe.accounts.retrieveCurrent().then((account) => {
        if (account.id !== config.accountId) {
          throw new Error("stripe_account_mismatch");
        }
      }).catch((error) => {
        accountValidation = undefined;
        throw error;
      });
    }
    await accountValidation;
  }

  async function validatePrice(planCode: RetailPlanCode) {
    await validateAccount();
    let validation = validatedPrices.get(planCode);
    if (!validation) {
      validation = stripe.prices.retrieve(config.prices[planCode]).then((price) => {
        const contract = RETAIL_PLAN_CONTRACT[planCode];
        if (
          price.livemode
          || !price.active
          || price.currency !== "usd"
          || price.unit_amount !== contract.amountCents
          || price.type !== "recurring"
          || price.recurring?.interval !== "month"
          || price.recurring.interval_count !== 1
          || price.lookup_key !== STRIPE_PRICE_LOOKUP_KEYS[planCode]
          || price.metadata.project !== STRIPE_PROJECT_ID
          || price.metadata.plan_code !== planCode
        ) {
          throw new Error(`stripe_test_price_contract_mismatch:${planCode}`);
        }
      }).catch((error) => {
        validatedPrices.delete(planCode);
        throw error;
      });
      validatedPrices.set(planCode, validation);
    }
    await validation;
  }

  return {
    planCodeForPrice: (priceId) => planCodeForPrice(priceId, config.prices),
    validatePrice,

    async createCheckoutSession(input) {
      await validatePrice(input.planCode);
      const metadata = {
        ...STRIPE_RESOURCE_METADATA,
        app_user_id: input.userId,
        plan_code: input.planCode,
      };
      const consentCollection = checkoutConsentCollection(config.checkoutTermsConsent);
      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          customer: input.customerId,
          customer_email: input.customerId ? undefined : input.email,
          client_reference_id: input.userId,
          line_items: [{ price: config.prices[input.planCode], quantity: 1 }],
          ...(consentCollection ? { consent_collection: consentCollection } : {}),
          automatic_tax: { enabled: config.taxEnabled },
          metadata,
          subscription_data: { metadata },
          success_url: `${config.appBaseUrl}/plan?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${config.appBaseUrl}/plan?checkout=canceled`,
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return { id: session.id, url: session.url };
    },

    async createPortalSession(customerId) {
      await validateAccount();
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${config.appBaseUrl}/dashboard?panel=plan`,
        configuration: config.portalConfigurationId,
      });
      return { id: session.id, url: session.url };
    },

    async retrieveSubscription(subscriptionId) {
      await validateAccount();
      return snapshot(await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["latest_invoice"],
      }) as unknown as StripeSubscriptionLike);
    },

    async upgradeSubscription(input) {
      await validatePrice(input.targetPlanCode);
      const updated = await stripe.subscriptions.update(
        input.subscription.id,
        {
          items: [{
            id: input.subscription.itemId,
            price: config.prices[input.targetPlanCode],
            quantity: 1,
          }],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
          metadata: {
            ...STRIPE_RESOURCE_METADATA,
            app_user_id: input.subscription.metadataUserId ?? "",
            plan_code: input.targetPlanCode,
          },
          expand: ["latest_invoice"],
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return snapshot(updated as unknown as StripeSubscriptionLike);
    },

    async scheduleDowngrade(input) {
      await validatePrice(input.targetPlanCode);
      let schedule = input.subscription.scheduleId
        ? await stripe.subscriptionSchedules.retrieve(input.subscription.scheduleId)
        : await stripe.subscriptionSchedules.create(
          { from_subscription: input.subscription.id },
          { idempotencyKey: `${input.idempotencyKey}:create` },
        );

      const futurePhase = schedule.phases.find(
        (phase) => phase.start_date >= Date.parse(input.subscription.currentPeriodEnd) / 1000,
      );
      if (futurePhase?.items.some((item) => objectId(item.price) === config.prices.basic)) {
        return { scheduleId: schedule.id, alreadyScheduled: true };
      }

      const periodStart = Math.floor(Date.parse(input.subscription.currentPeriodStart) / 1000);
      const periodEnd = Math.floor(Date.parse(input.subscription.currentPeriodEnd) / 1000);
      schedule = await stripe.subscriptionSchedules.update(
        schedule.id,
        {
          end_behavior: STRIPE_DOWNGRADE_SCHEDULE_END_BEHAVIOR,
          proration_behavior: "none",
          phases: [
            {
              start_date: schedule.current_phase?.start_date ?? periodStart,
              end_date: periodEnd,
              items: [{ price: input.subscription.priceId, quantity: 1 }],
              proration_behavior: "none",
              metadata: {
                ...STRIPE_RESOURCE_METADATA,
                app_user_id: input.subscription.metadataUserId ?? "",
                plan_code: "premium",
              },
            },
            {
              start_date: periodEnd,
              duration: { interval: "month", interval_count: 1 },
              items: [{ price: config.prices.basic, quantity: 1 }],
              proration_behavior: "none",
              metadata: {
                ...STRIPE_RESOURCE_METADATA,
                app_user_id: input.subscription.metadataUserId ?? "",
                plan_code: "basic",
              },
            },
          ],
        },
        { idempotencyKey: `${input.idempotencyKey}:update` },
      );
      return { scheduleId: schedule.id, alreadyScheduled: false };
    },

    constructWebhookEvent(rawBody, signature): BillingWebhookEvent {
      const event = stripe.webhooks.constructEvent(rawBody, signature, config.webhookSecret);
      const object = event.data.object;
      const metadata = eventMetadata(object);
      return {
        id: event.id,
        type: event.type,
        createdAt: new Date(event.created * 1000).toISOString(),
        objectId: eventObjectId(object),
        subscriptionId: eventSubscriptionId(object),
        invoiceId: object.object === "invoice" ? object.id : undefined,
        metadataProject: metadata.project || undefined,
        metadataUserId: metadata.app_user_id || (
          object.object === "checkout.session" ? object.client_reference_id ?? undefined : undefined
        ),
        metadataPlanCode: isRetailPlanCode(metadata.plan_code) ? metadata.plan_code : undefined,
        livemode: event.livemode,
      };
    },
  };
}

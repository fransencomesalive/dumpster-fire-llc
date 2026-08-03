import assert from "node:assert/strict";
import Stripe from "stripe";
import {
  STRIPE_ACCOUNT_ID,
  STRIPE_PRICE_LOOKUP_KEYS,
  STRIPE_PROJECT_ID,
  STRIPE_RESOURCE_METADATA,
} from "../lib/billing/catalog";
import { getBillingConfig, STRIPE_API_VERSION, STRIPE_SDK_VERSION } from "../lib/billing/config";
import {
  handleChangePlanRequest,
  handleCreateCheckoutRequest,
  handleCreatePortalRequest,
} from "../lib/billing/service";
import { handleStripeWebhook } from "../lib/billing/webhook";
import { mapStripeSubscriptionStatus } from "../lib/billing/lifecycle";
import { reconcileStripeSubscriptions } from "../lib/billing/reconciliation";
import {
  checkoutConsentCollection,
  createStripeGateway,
  STRIPE_DOWNGRADE_SCHEDULE_END_BEHAVIOR,
} from "../lib/billing/stripe-client";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";
import type {
  BillingStripeGateway,
  BillingWebhookEvent,
  StripeSubscriptionSnapshot,
} from "../lib/billing/types";

const authenticated = async () => ({
  status: "authenticated" as const,
  userId: "20000000-0000-0000-0000-000000000001",
  email: "user@example.com",
});

const baseSubscription: StripeSubscriptionSnapshot = {
  id: "sub_test",
  customerId: "cus_test",
  itemId: "si_test",
  priceId: "price_basic",
  statusRaw: "active",
  cancelAtPeriodEnd: false,
  latestInvoiceId: "in_test",
  currentPeriodStart: "2026-07-01T00:00:00.000Z",
  currentPeriodEnd: "2026-08-01T00:00:00.000Z",
  metadataProject: "dumpster_fire_llc",
  metadataUserId: "20000000-0000-0000-0000-000000000001",
  metadataPlanCode: "basic",
  pendingUpdate: false,
  livemode: false,
};

function gateway(overrides: Partial<BillingStripeGateway> = {}): BillingStripeGateway {
  return {
    planCodeForPrice: (priceId) => priceId === "price_basic"
      ? "basic"
      : priceId === "price_premium"
        ? "premium"
        : undefined,
    validatePrice: async () => undefined,
    createCheckoutSession: async () => ({ id: "cs_test", url: "https://checkout.stripe.test/session" }),
    createPortalSession: async () => ({ id: "bps_test", url: "https://billing.stripe.test/session" }),
    retrieveSubscription: async () => baseSubscription,
    upgradeSubscription: async () => ({
      ...baseSubscription,
      priceId: "price_premium",
      metadataPlanCode: "premium",
    }),
    scheduleDowngrade: async () => ({ scheduleId: "sub_sched_test", alreadyScheduled: false }),
    constructWebhookEvent: () => ({
      id: "evt_test",
      type: "customer.subscription.updated",
      createdAt: "2026-07-26T12:00:00.000Z",
      objectId: "sub_test",
      subscriptionId: "sub_test",
      livemode: false,
    }),
    ...overrides,
  };
}

function subscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "20000000-0000-0000-0000-000000000001",
    plan_id: "plan-basic",
    status: "active",
    source: "stripe",
    current_period_start: baseSubscription.currentPeriodStart,
    current_period_end: baseSubscription.currentPeriodEnd,
    cancel_at_period_end: false,
    canceled_at: null,
    stripe_customer_id: "cus_test",
    stripe_subscription_id: "sub_test",
    stripe_price_id: "price_basic",
    stripe_status_raw: "active",
    latest_invoice_id: "in_test",
    last_stripe_event_created_at: "2026-07-25T00:00:00.000Z",
    ...overrides,
  };
}

function request(path: string, body?: unknown, idempotency = false) {
  return new Request(`https://app.example${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idempotency ? { "Idempotency-Key": "billing-test-request-1" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function responseBody(response: Response) {
  return await response.json() as Record<string, unknown>;
}

async function main() {
  assert.equal(STRIPE_SDK_VERSION, "22.1.1");
  assert.equal(STRIPE_API_VERSION, "2026-04-22.dahlia");
  assert.equal(STRIPE_ACCOUNT_ID, "acct_1TxaWWJtJtSFf8Kw");
  assert.equal(STRIPE_PROJECT_ID, "dumpster_fire_llc");
  assert.equal(STRIPE_DOWNGRADE_SCHEDULE_END_BEHAVIOR, "release");
  assert.equal(STRIPE_RESOURCE_METADATA.environment, "test");
  assert.equal(
    STRIPE_PRICE_LOOKUP_KEYS.basic,
    "dumpster_fire_smoldering_monthly_v1",
  );
  assert.equal(
    STRIPE_PRICE_LOOKUP_KEYS.premium,
    "dumpster_fire_roaring_monthly_v1",
  );
  const config = getBillingConfig({
    STRIPE_ACCOUNT_ID,
    STRIPE_SECRET_KEY: "sk_test_example",
    STRIPE_WEBHOOK_SECRET: "whsec_example",
    STRIPE_PRICE_BASIC_MONTHLY: "price_basic",
    STRIPE_PRICE_PREMIUM_MONTHLY: "price_premium",
    APP_BASE_URL: "https://app.example/path",
    STRIPE_TAX_ENABLED: "false",
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(config.appBaseUrl, "https://app.example");
  assert.equal(config.accountId, STRIPE_ACCOUNT_ID);
  assert.equal(config.checkoutTermsConsent, "required");
  assert.deepEqual(
    checkoutConsentCollection(config.checkoutTermsConsent),
    { terms_of_service: "required" },
  );
  const sandboxConfigWithoutTermsConsent = getBillingConfig({
    STRIPE_ACCOUNT_ID,
    STRIPE_SECRET_KEY: "sk_test_example",
    STRIPE_WEBHOOK_SECRET: "whsec_example",
    STRIPE_PRICE_BASIC_MONTHLY: "price_basic",
    STRIPE_PRICE_PREMIUM_MONTHLY: "price_premium",
    APP_BASE_URL: "https://app.example",
    STRIPE_TAX_ENABLED: "false",
    STRIPE_CHECKOUT_TERMS_CONSENT: "omit",
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(sandboxConfigWithoutTermsConsent.checkoutTermsConsent, "omit");
  assert.equal(
    checkoutConsentCollection(sandboxConfigWithoutTermsConsent.checkoutTermsConsent),
    undefined,
  );
  assert.throws(() => getBillingConfig({
    STRIPE_ACCOUNT_ID,
    STRIPE_SECRET_KEY: "sk_test_example",
    STRIPE_WEBHOOK_SECRET: "whsec_example",
    STRIPE_PRICE_BASIC_MONTHLY: "price_basic",
    STRIPE_PRICE_PREMIUM_MONTHLY: "price_premium",
    APP_BASE_URL: "https://app.example",
    STRIPE_CHECKOUT_TERMS_CONSENT: "sometimes",
  } as unknown as NodeJS.ProcessEnv), /must be required or omit/);
  assert.throws(() => getBillingConfig({
    STRIPE_ACCOUNT_ID,
    STRIPE_SECRET_KEY: "sk_live_forbidden",
    STRIPE_WEBHOOK_SECRET: "whsec_example",
    STRIPE_PRICE_BASIC_MONTHLY: "price_basic",
    STRIPE_PRICE_PREMIUM_MONTHLY: "price_premium",
    APP_BASE_URL: "https://app.example",
    STRIPE_CHECKOUT_TERMS_CONSENT: "omit",
  } as unknown as NodeJS.ProcessEnv), /omitted only with a Stripe test-mode secret key/);
  assert.throws(() => getBillingConfig({
    ...process.env,
    STRIPE_ACCOUNT_ID,
    STRIPE_SECRET_KEY: "sk_live_forbidden",
    STRIPE_WEBHOOK_SECRET: "whsec_example",
    STRIPE_PRICE_BASIC_MONTHLY: "price_basic",
    STRIPE_PRICE_PREMIUM_MONTHLY: "price_premium",
    APP_BASE_URL: "https://app.example",
  }), /test-mode/);
  assert.throws(() => getBillingConfig({
    ...process.env,
    STRIPE_ACCOUNT_ID: "acct_wrong",
    STRIPE_SECRET_KEY: "sk_test_example",
    STRIPE_WEBHOOK_SECRET: "whsec_example",
    STRIPE_PRICE_BASIC_MONTHLY: "price_basic",
    STRIPE_PRICE_PREMIUM_MONTHLY: "price_premium",
    APP_BASE_URL: "https://app.example",
  }), /does not match/);
  assert.equal(mapStripeSubscriptionStatus("trialing"), "trialing");
  assert.equal(mapStripeSubscriptionStatus("active"), "active");
  assert.equal(mapStripeSubscriptionStatus("past_due"), "past_due");
  assert.equal(mapStripeSubscriptionStatus("unpaid"), "past_due");
  assert.equal(mapStripeSubscriptionStatus("incomplete"), "past_due");
  assert.equal(mapStripeSubscriptionStatus("paused"), "past_due");
  assert.equal(mapStripeSubscriptionStatus("incomplete_expired"), "canceled");
  assert.equal(mapStripeSubscriptionStatus("canceled"), "canceled");

  const rawStripeEvent = JSON.stringify({
    id: "evt_signed",
    object: "event",
    api_version: STRIPE_API_VERSION,
    created: 1785088800,
    data: {
      object: {
        id: "sub_signed",
        object: "subscription",
        livemode: false,
        metadata: {
          project: "dumpster_fire_llc",
          app_user_id: "20000000-0000-0000-0000-000000000001",
          plan_code: "basic",
        },
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: "customer.subscription.updated",
  });
  const stripeForSignature = new Stripe("sk_test_example", {
    apiVersion: STRIPE_API_VERSION,
  });
  const testSignature = stripeForSignature.webhooks.generateTestHeaderString({
    payload: rawStripeEvent,
    secret: "whsec_example",
  });
  const signedEvent = createStripeGateway(config).constructWebhookEvent(
    rawStripeEvent,
    testSignature,
  );
  assert.equal(signedEvent.id, "evt_signed");
  assert.equal(signedEvent.subscriptionId, "sub_signed");
  assert.equal(signedEvent.metadataProject, "dumpster_fire_llc");
  assert.equal(signedEvent.metadataPlanCode, "basic");

  const reconciliationCalls: Array<{ table: string; method: string }> = [];
  const reconciliationSnapshot: StripeSubscriptionSnapshot = {
    ...baseSubscription,
    priceId: "price_premium",
    metadataPlanCode: "premium",
    statusRaw: "past_due",
    cancelAtPeriodEnd: true,
    canceledAt: "2026-07-20T00:00:00.000Z",
    latestInvoiceId: "in_reconcile",
  };
  const reconciliationRepository: PublicProfileRepositoryRequest = async <T>(
    table: string,
    options: Parameters<PublicProfileRepositoryRequest>[1],
  ) => {
    reconciliationCalls.push({ table, method: options.method ?? "GET" });
    if (table === "user_subscriptions" && (options.method ?? "GET") === "GET") {
      return [subscriptionRow()] as T;
    }
    if (table === "subscription_plans") {
      return [
        { id: "plan-basic", name: "basic" },
        { id: "plan-premium", name: "premium" },
      ] as T;
    }
    if (table === "rpc/reconcile_stripe_subscription_snapshot") {
      return { status: "reconciled" } as T;
    }
    return undefined as T;
  };
  const reconciliation = await reconcileStripeSubscriptions({
    repositoryRequest: reconciliationRepository,
    stripe: gateway({
      retrieveSubscription: async () => reconciliationSnapshot,
    }),
    write: false,
  });
  assert.equal(reconciliation.mismatched, 1);
  assert.deepEqual(reconciliation.items[0].mismatches, [
    "plan",
    "status",
    "stripe_status_raw",
    "price",
    "cancel_at_period_end",
    "canceled_at",
    "latest_invoice_id",
  ]);
  assert.equal(
    reconciliationCalls.some((call) => call.method === "PATCH"),
    false,
  );
  const repairedReconciliation = await reconcileStripeSubscriptions({
    repositoryRequest: reconciliationRepository,
    stripe: gateway({
      retrieveSubscription: async () => reconciliationSnapshot,
    }),
    write: true,
  });
  assert.equal(repairedReconciliation.repaired, 1);
  assert.equal(
    reconciliationCalls.some(
      (call) => call.table === "rpc/reconcile_stripe_subscription_snapshot"
        && call.method === "POST",
    ),
    true,
  );

  let checkoutInput: unknown;
  const emptyRepository: PublicProfileRepositoryRequest = async <T>(table: string) => {
    assert.equal(table, "user_subscriptions");
    return [] as T;
  };
  const checkout = await handleCreateCheckoutRequest(
    request("/api/billing/checkout", { planCode: "basic" }, true),
    {
      getSession: authenticated,
      repositoryRequest: emptyRepository,
      checkoutEnabled: true,
      stripe: gateway({
        createCheckoutSession: async (input) => {
          checkoutInput = input;
          return { id: "cs_test", url: "https://checkout.stripe.test/session" };
        },
      }),
    },
  );
  assert.equal(checkout.status, 200);
  assert.deepEqual(checkoutInput, {
    userId: "20000000-0000-0000-0000-000000000001",
    email: "user@example.com",
    planCode: "basic",
    customerId: undefined,
    idempotencyKey: "checkout:20000000-0000-0000-0000-000000000001:billing-test-request-1",
  });
  const premiumCheckout = await handleCreateCheckoutRequest(
    request("/api/billing/checkout", { planCode: "premium" }, true),
    {
      getSession: authenticated,
      repositoryRequest: emptyRepository,
      checkoutEnabled: true,
      stripe: gateway(),
    },
  );
  assert.equal(premiumCheckout.status, 200);

  const unauthorizedCheckout = await handleCreateCheckoutRequest(
    request("/api/billing/checkout", { planCode: "basic" }, true),
    {
      getSession: async () => ({
        status: "unauthenticated",
        reason: "Missing bearer token.",
      }),
      repositoryRequest: async () => {
        throw new Error("unauthorized requests must not reach storage");
      },
      checkoutEnabled: true,
      stripe: gateway(),
    },
  );
  assert.equal(unauthorizedCheckout.status, 401);

  const disabledCheckout = await handleCreateCheckoutRequest(
    request("/api/billing/checkout", { planCode: "basic" }, true),
    {
      getSession: authenticated,
      repositoryRequest: emptyRepository,
      checkoutEnabled: false,
      stripe: gateway(),
    },
  );
  assert.equal(disabledCheckout.status, 503);
  assert.equal((await responseBody(disabledCheckout)).status, "checkout_disabled");

  const arbitraryPrice = await handleCreateCheckoutRequest(
    request("/api/billing/checkout", { planCode: "price_attacker" }),
    {
      getSession: authenticated,
      repositoryRequest: emptyRepository,
      checkoutEnabled: true,
      stripe: gateway(),
    },
  );
  assert.equal(arbitraryPrice.status, 400);

  const checkoutWithoutIdempotency = await handleCreateCheckoutRequest(
    request("/api/billing/checkout", { planCode: "basic" }),
    {
      getSession: authenticated,
      repositoryRequest: emptyRepository,
      checkoutEnabled: true,
      stripe: gateway(),
    },
  );
  assert.equal(checkoutWithoutIdempotency.status, 400);

  let duplicateCalledStripe = false;
  const duplicate = await handleCreateCheckoutRequest(
    request("/api/billing/checkout", { planCode: "premium" }, true),
    {
      getSession: authenticated,
      repositoryRequest: async <T>() => [subscriptionRow()] as T,
      checkoutEnabled: true,
      stripe: gateway({
        createCheckoutSession: async () => {
          duplicateCalledStripe = true;
          throw new Error("must not create");
        },
      }),
    },
  );
  assert.equal(duplicate.status, 409);
  assert.equal(duplicateCalledStripe, false);

  const staleCanceledLocal = await handleCreateCheckoutRequest(
    request("/api/billing/checkout", { planCode: "basic" }, true),
    {
      getSession: authenticated,
      repositoryRequest: async <T>() => [subscriptionRow({
        status: "canceled",
        stripe_status_raw: "canceled",
      })] as T,
      checkoutEnabled: true,
      stripe: gateway({
        retrieveSubscription: async () => baseSubscription,
      }),
    },
  );
  assert.equal(staleCanceledLocal.status, 409);
  assert.equal((await responseBody(staleCanceledLocal)).status, "subscription_exists");

  const conversion = await handleCreateCheckoutRequest(
    request("/api/billing/checkout", { planCode: "basic" }, true),
    {
      getSession: authenticated,
      repositoryRequest: async <T>() => [subscriptionRow({
        source: "access_code",
        stripe_customer_id: null,
        stripe_subscription_id: null,
      })] as T,
      checkoutEnabled: true,
      now: () => "2026-07-25T00:00:00.000Z",
      stripe: gateway(),
    },
  );
  assert.equal(conversion.status, 409);
  assert.equal((await responseBody(conversion)).status, "conversion_required");

  let expiredConversionInput: unknown;
  const expiredConversion = await handleCreateCheckoutRequest(
    request("/api/billing/checkout", { planCode: "basic" }, true),
    {
      getSession: authenticated,
      repositoryRequest: async <T>() => [subscriptionRow({
        source: "access_code",
        current_period_start: "2026-07-02T00:00:00.000Z",
        current_period_end: "2026-08-01T00:00:00.000Z",
        stripe_customer_id: null,
        stripe_subscription_id: null,
      })] as T,
      checkoutEnabled: true,
      now: () => "2026-08-01T00:00:00.000Z",
      stripe: gateway({
        createCheckoutSession: async (input) => {
          expiredConversionInput = input;
          return { id: "cs_expired", url: "https://checkout.stripe.test/expired" };
        },
      }),
    },
  );
  assert.equal(expiredConversion.status, 200);
  assert.deepEqual(expiredConversionInput, {
    userId: "20000000-0000-0000-0000-000000000001",
    email: "user@example.com",
    planCode: "basic",
    customerId: undefined,
    idempotencyKey: "checkout:20000000-0000-0000-0000-000000000001:billing-test-request-1",
  });

  const canceledBeforePeriodEnd = await handleCreateCheckoutRequest(
    request("/api/billing/checkout", { planCode: "basic" }, true),
    {
      getSession: authenticated,
      repositoryRequest: async <T>() => [subscriptionRow({
        source: "access_code",
        status: "canceled",
        current_period_start: "2026-07-02T00:00:00.000Z",
        current_period_end: "2026-08-02T00:00:00.000Z",
        stripe_customer_id: null,
        stripe_subscription_id: null,
      })] as T,
      checkoutEnabled: true,
      now: () => "2026-08-01T00:00:00.000Z",
      stripe: gateway(),
    },
  );
  assert.equal(canceledBeforePeriodEnd.status, 409);
  assert.equal((await responseBody(canceledBeforePeriodEnd)).status, "conversion_required");

  const permanentAccessConversion = await handleCreateCheckoutRequest(
    request("/api/billing/checkout", { planCode: "basic" }, true),
    {
      getSession: authenticated,
      repositoryRequest: async <T>() => [subscriptionRow({
        source: "access_code",
        current_period_start: null,
        current_period_end: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
      })] as T,
      checkoutEnabled: true,
      now: () => "2026-08-01T00:00:00.000Z",
      stripe: gateway(),
    },
  );
  assert.equal(permanentAccessConversion.status, 409);
  assert.equal((await responseBody(permanentAccessConversion)).status, "conversion_required");

  let portalCustomer: string | undefined;
  const portal = await handleCreatePortalRequest(request("/api/billing/portal"), {
    getSession: authenticated,
    repositoryRequest: async <T>() => [subscriptionRow()] as T,
    stripe: gateway({
      createPortalSession: async (customerId) => {
        portalCustomer = customerId;
        return { id: "bps_test", url: "https://billing.stripe.test/session" };
      },
    }),
  });
  assert.equal(portal.status, 200);
  assert.equal(portalCustomer, "cus_test");

  const noIdempotency = await handleChangePlanRequest(
    request("/api/billing/change-plan", { planCode: "premium" }),
    {
      getSession: authenticated,
      repositoryRequest: async <T>() => [subscriptionRow()] as T,
      stripe: gateway(),
    },
  );
  assert.equal(noIdempotency.status, 400);

  const ownershipMismatch = await handleChangePlanRequest(
    request("/api/billing/change-plan", { planCode: "premium" }, true),
    {
      getSession: authenticated,
      repositoryRequest: async <T>() => [subscriptionRow()] as T,
      stripe: gateway({
        retrieveSubscription: async () => ({
          ...baseSubscription,
          customerId: "cus_other",
        }),
      }),
    },
  );
  assert.equal(ownershipMismatch.status, 409);

  const upgrade = await handleChangePlanRequest(
    request("/api/billing/change-plan", { planCode: "premium" }, true),
    {
      getSession: authenticated,
      repositoryRequest: async <T>() => [subscriptionRow()] as T,
      stripe: gateway(),
    },
  );
  assert.equal(upgrade.status, 200);
  assert.equal((await responseBody(upgrade)).status, "immediate");

  let upgradeIdempotencyKey = "";
  await handleChangePlanRequest(
    request("/api/billing/change-plan", { planCode: "premium" }, true),
    {
      getSession: authenticated,
      repositoryRequest: async <T>() => [subscriptionRow()] as T,
      stripe: gateway({
        upgradeSubscription: async (input) => {
          upgradeIdempotencyKey = input.idempotencyKey;
          return {
            ...baseSubscription,
            priceId: "price_premium",
            metadataPlanCode: "premium",
          };
        },
      }),
    },
  );
  assert.equal(
    upgradeIdempotencyKey,
    "change:20000000-0000-0000-0000-000000000001:billing-test-request-1",
  );

  const paymentRequired = await handleChangePlanRequest(
    request("/api/billing/change-plan", { planCode: "premium" }, true),
    {
      getSession: authenticated,
      repositoryRequest: async <T>() => [subscriptionRow()] as T,
      stripe: gateway({
        upgradeSubscription: async () => ({
          ...baseSubscription,
          pendingUpdate: true,
        }),
      }),
    },
  );
  assert.equal(paymentRequired.status, 202);
  assert.equal((await responseBody(paymentRequired)).status, "payment_required");

  const existingPendingUpdate = await handleChangePlanRequest(
    request("/api/billing/change-plan", { planCode: "premium" }, true),
    {
      getSession: authenticated,
      repositoryRequest: async <T>() => [subscriptionRow()] as T,
      stripe: gateway({
        retrieveSubscription: async () => ({
          ...baseSubscription,
          pendingUpdate: true,
        }),
      }),
    },
  );
  assert.equal(existingPendingUpdate.status, 202);
  assert.equal((await responseBody(existingPendingUpdate)).status, "payment_required");

  const pastDuePlanChange = await handleChangePlanRequest(
    request("/api/billing/change-plan", { planCode: "premium" }, true),
    {
      getSession: authenticated,
      repositoryRequest: async <T>() => [subscriptionRow()] as T,
      stripe: gateway({
        retrieveSubscription: async () => ({
          ...baseSubscription,
          statusRaw: "past_due",
        }),
      }),
    },
  );
  assert.equal(pastDuePlanChange.status, 402);
  assert.equal((await responseBody(pastDuePlanChange)).status, "payment_required");

  const canceledPlanChange = await handleChangePlanRequest(
    request("/api/billing/change-plan", { planCode: "premium" }, true),
    {
      getSession: authenticated,
      repositoryRequest: async <T>() => [subscriptionRow()] as T,
      stripe: gateway({
        retrieveSubscription: async () => ({
          ...baseSubscription,
          statusRaw: "canceled",
        }),
      }),
    },
  );
  assert.equal(canceledPlanChange.status, 409);
  assert.equal((await responseBody(canceledPlanChange)).status, "subscription_inactive");

  const downgrade = await handleChangePlanRequest(
    request("/api/billing/change-plan", { planCode: "basic" }, true),
    {
      getSession: authenticated,
      repositoryRequest: async <T>() => [subscriptionRow({
        plan_id: "plan-premium",
        stripe_price_id: "price_premium",
      })] as T,
      stripe: gateway({
        retrieveSubscription: async () => ({
          ...baseSubscription,
          priceId: "price_premium",
          metadataPlanCode: "premium",
        }),
      }),
    },
  );
  assert.equal(downgrade.status, 200);
  assert.equal((await responseBody(downgrade)).status, "scheduled");

  const webhookCalls: Array<{ table: string; body: unknown }> = [];
  const webhookRepository: PublicProfileRepositoryRequest = async <T>(
    table: string,
    options: Parameters<PublicProfileRepositoryRequest>[1],
  ) => {
    webhookCalls.push({ table, body: options.body });
    if (table === "rpc/claim_stripe_webhook_event") {
      return { status: "claimed", attemptCount: 1 } as T;
    }
    if (table === "user_subscriptions") return [] as T;
    if (table === "rpc/persist_stripe_subscription_snapshot") {
      return { status: "persisted" } as T;
    }
    return undefined as T;
  };
  const webhook = await handleStripeWebhook({
    rawBody: "{\"id\":\"evt_test\"}",
    signature: "t=1,v1=test",
  }, {
    repositoryRequest: webhookRepository,
    stripe: gateway(),
    now: () => "2026-07-26T12:00:01.000Z",
  });
  assert.equal(webhook.status, 200);
  const persisted = webhookCalls.find(
    (call) => call.table === "rpc/persist_stripe_subscription_snapshot",
  );
  assert.ok(persisted);
  assert.equal(
    (persisted.body as Record<string, unknown>).p_plan_code,
    "basic",
  );
  assert.equal(
    (persisted.body as Record<string, unknown>).p_user_id,
    baseSubscription.metadataUserId,
  );

  let duplicateRetrieve = false;
  const duplicateWebhook = await handleStripeWebhook({
    rawBody: "{}",
    signature: "t=1,v1=test",
  }, {
    repositoryRequest: async <T>(table: string) => {
      assert.equal(table, "rpc/claim_stripe_webhook_event");
      return { status: "duplicate", attemptCount: 1 } as T;
    },
    stripe: gateway({
      retrieveSubscription: async () => {
        duplicateRetrieve = true;
        throw new Error("must not retrieve");
      },
    }),
  });
  assert.equal(duplicateWebhook.status, 200);
  assert.equal(duplicateRetrieve, false);

  let foreignEventRetrieved = false;
  let foreignEventProcessed = false;
  const foreignEvent = await handleStripeWebhook({
    rawBody: "{}",
    signature: "t=1,v1=test",
  }, {
    repositoryRequest: async <T>(table: string) => {
      if (table === "rpc/claim_stripe_webhook_event") {
        return { status: "claimed", attemptCount: 1 } as T;
      }
      if (table === "rpc/mark_stripe_webhook_event_processed") {
        foreignEventProcessed = true;
        return undefined as T;
      }
      return undefined as T;
    },
    stripe: gateway({
      constructWebhookEvent: () => ({
        id: "evt_foreign_project",
        type: "customer.subscription.updated",
        createdAt: "2026-07-26T12:30:00.000Z",
        objectId: "sub_foreign",
        subscriptionId: "sub_foreign",
        metadataProject: "mettlecycling",
        livemode: false,
      }),
      retrieveSubscription: async () => {
        foreignEventRetrieved = true;
        throw new Error("foreign events must not retrieve a subscription");
      },
    }),
  });
  assert.equal(foreignEvent.status, 200);
  assert.equal(foreignEvent.body.reason, "foreign_project");
  assert.equal(foreignEventProcessed, true);
  assert.equal(foreignEventRetrieved, false);

  let foreignSubscriptionProcessed = false;
  const foreignSubscription = await handleStripeWebhook({
    rawBody: "{}",
    signature: "t=1,v1=test",
  }, {
    repositoryRequest: async <T>(table: string) => {
      if (table === "rpc/claim_stripe_webhook_event") {
        return { status: "claimed", attemptCount: 1 } as T;
      }
      if (table === "rpc/mark_stripe_webhook_event_processed") {
        foreignSubscriptionProcessed = true;
        return undefined as T;
      }
      return undefined as T;
    },
    stripe: gateway({
      constructWebhookEvent: () => ({
        id: "evt_foreign_subscription",
        type: "invoice.paid",
        createdAt: "2026-07-26T12:31:00.000Z",
        objectId: "in_foreign",
        subscriptionId: "sub_foreign",
        livemode: false,
      }),
      retrieveSubscription: async () => ({
        ...baseSubscription,
        id: "sub_foreign",
        metadataProject: "mettlecycling",
      }),
    }),
  });
  assert.equal(foreignSubscription.status, 200);
  assert.equal(foreignSubscription.body.reason, "foreign_project");
  assert.equal(foreignSubscriptionProcessed, true);

  const invalidSignature = await handleStripeWebhook({
    rawBody: "{}",
    signature: "invalid",
  }, {
    repositoryRequest: webhookRepository,
    stripe: gateway({
      constructWebhookEvent: () => {
        throw new Error("signature");
      },
    }),
  });
  assert.equal(invalidSignature.status, 400);

  const staleSnapshot = await handleStripeWebhook({
    rawBody: "{}",
    signature: "t=1,v1=test",
  }, {
    repositoryRequest: async <T>(table: string) => {
      if (table === "rpc/claim_stripe_webhook_event") {
        return { status: "claimed", attemptCount: 1 } as T;
      }
      if (table === "user_subscriptions") return [subscriptionRow()] as T;
      if (table === "rpc/persist_stripe_subscription_snapshot") {
        return { status: "snapshot_stale" } as T;
      }
      return undefined as T;
    },
    stripe: gateway(),
  });
  assert.equal(staleSnapshot.status, 200);
  assert.equal(staleSnapshot.body.snapshotStale, true);

  async function assertWebhookStatus(
    event: BillingWebhookEvent,
    statusRaw: string,
    expectedStatus: string,
    latestInvoiceId = event.invoiceId ?? baseSubscription.latestInvoiceId,
    cancelAtPeriodEnd = event.type === "customer.subscription.updated",
  ) {
    let persistBody: Record<string, unknown> | undefined;
    const repository: PublicProfileRepositoryRequest = async <T>(
      table: string,
      options: Parameters<PublicProfileRepositoryRequest>[1],
    ) => {
      if (table === "rpc/claim_stripe_webhook_event") {
        return { status: "claimed", attemptCount: 1 } as T;
      }
      if (table === "user_subscriptions") return [subscriptionRow()] as T;
      if (table === "rpc/persist_stripe_subscription_snapshot") {
        persistBody = options.body as Record<string, unknown>;
        return { status: "persisted" } as T;
      }
      return undefined as T;
    };
    const response = await handleStripeWebhook({
      rawBody: "{}",
      signature: "t=1,v1=test",
    }, {
      repositoryRequest: repository,
      stripe: gateway({
        constructWebhookEvent: () => event,
        retrieveSubscription: async () => ({
          ...baseSubscription,
          statusRaw,
          cancelAtPeriodEnd,
          latestInvoiceId,
        }),
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(persistBody?.p_status, expectedStatus);
    assert.equal(persistBody?.p_latest_invoice_id, latestInvoiceId);
    return persistBody;
  }

  await assertWebhookStatus({
    id: "evt_invoice_failed",
    type: "invoice.payment_failed",
    createdAt: "2026-07-26T13:00:00.000Z",
    objectId: "in_failed",
    subscriptionId: "sub_test",
    invoiceId: "in_failed",
    livemode: false,
  }, "past_due", "past_due");
  await assertWebhookStatus({
    id: "evt_invoice_paid",
    type: "invoice.paid",
    createdAt: "2026-07-26T13:01:00.000Z",
    objectId: "in_paid",
    subscriptionId: "sub_test",
    invoiceId: "in_paid",
    livemode: false,
  }, "active", "active");
  const latestInvoiceBody = await assertWebhookStatus({
    id: "evt_invoice_old_delivery",
    type: "invoice.paid",
    createdAt: "2026-07-26T13:01:30.000Z",
    objectId: "in_old",
    subscriptionId: "sub_test",
    invoiceId: "in_old",
    livemode: false,
  }, "active", "active", "in_new");
  assert.equal(latestInvoiceBody?.p_latest_invoice_id, "in_new");
  const cancelAtPeriodEndBody = await assertWebhookStatus({
    id: "evt_cancel_scheduled",
    type: "customer.subscription.updated",
    createdAt: "2026-07-26T13:02:00.000Z",
    objectId: "sub_test",
    subscriptionId: "sub_test",
    livemode: false,
  }, "active", "active");
  assert.equal(cancelAtPeriodEndBody?.p_cancel_at_period_end, true);
  const reversedCancellationBody = await assertWebhookStatus({
    id: "evt_cancel_reversed",
    type: "customer.subscription.updated",
    createdAt: "2026-07-26T13:02:30.000Z",
    objectId: "sub_test",
    subscriptionId: "sub_test",
    livemode: false,
  }, "active", "active", baseSubscription.latestInvoiceId, false);
  assert.equal(reversedCancellationBody?.p_cancel_at_period_end, false);
  await assertWebhookStatus({
    id: "evt_deleted",
    type: "customer.subscription.deleted",
    createdAt: "2026-07-26T13:03:00.000Z",
    objectId: "sub_test",
    subscriptionId: "sub_test",
    livemode: false,
  }, "canceled", "canceled");

  let markedMetadataMismatchFailed = false;
  const metadataMismatch = await handleStripeWebhook({
    rawBody: "{}",
    signature: "t=1,v1=test",
  }, {
    repositoryRequest: async <T>(table: string) => {
      if (table === "rpc/claim_stripe_webhook_event") {
        return { status: "claimed", attemptCount: 1 } as T;
      }
      if (table === "user_subscriptions") return [] as T;
      if (table === "rpc/mark_stripe_webhook_event_failed") {
        markedMetadataMismatchFailed = true;
        return undefined as T;
      }
      return undefined as T;
    },
    stripe: gateway({
      constructWebhookEvent: () => ({
        id: "evt_metadata_mismatch",
        type: "customer.subscription.updated",
        createdAt: "2026-07-26T13:04:00.000Z",
        objectId: "sub_test",
        subscriptionId: "sub_test",
        metadataUserId: "20000000-0000-0000-0000-000000000002",
        livemode: false,
      }),
    }),
  });
  assert.equal(metadataMismatch.status, 503);
  assert.equal(markedMetadataMismatchFailed, true);

  const liveEvent: BillingWebhookEvent = {
    id: "evt_live",
    type: "customer.subscription.updated",
    createdAt: "2026-07-26T12:00:00.000Z",
    objectId: "sub_live",
    subscriptionId: "sub_live",
    livemode: true,
  };
  const rejectedLive = await handleStripeWebhook({
    rawBody: "{}",
    signature: "t=1,v1=test",
  }, {
    repositoryRequest: webhookRepository,
    stripe: gateway({ constructWebhookEvent: () => liveEvent }),
  });
  assert.equal(rejectedLive.status, 400);
}

void main();

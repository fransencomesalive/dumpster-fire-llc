import { getPublicAuthSession, type PublicAuthSession } from "../public-auth/session";
import {
  createPublicProfileRepositoryRequest,
  getPublicProfileRepositoryConfig,
  type PublicProfileRepositoryRequest,
} from "../public-profile/repository";
import { isRetailPlanCode, STRIPE_PROJECT_ID } from "./catalog";
import {
  BillingConfigurationError,
  getBillingConfig,
  isStripeCheckoutEnabled,
} from "./config";
import { loadBillingSubscriptionForUser } from "./repository";
import { createStripeGateway } from "./stripe-client";
import type { BillingStripeGateway } from "./types";

type HandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  stripe?: BillingStripeGateway;
  checkoutEnabled?: boolean;
};

type AuthenticatedSession = Extract<PublicAuthSession, { status: "authenticated" }>;
type HandlerDependencies =
  | { response: Response }
  | {
      session: AuthenticatedSession;
      repositoryRequest: PublicProfileRepositoryRequest;
      stripe: BillingStripeGateway;
    };

function json(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store", ...init.headers },
  });
}

async function dependencies(
  request: Request,
  options: HandlerOptions,
): Promise<HandlerDependencies> {
  const session = options.getSession
    ? await options.getSession(request)
    : await getPublicAuthSession(request, { env: options.env });
  if (session.status === "config_error") {
    return { response: json({ error: "Public auth is not configured.", missing: session.missing }, { status: 503 }) };
  }
  if (session.status !== "authenticated") {
    return { response: json({ error: "Authentication required.", detail: session.reason }, { status: 401 }) };
  }
  let repositoryRequest = options.repositoryRequest;
  if (!repositoryRequest) {
    const config = getPublicProfileRepositoryConfig(options.env);
    if (!config) {
      return { response: json({ error: "Account storage is not configured." }, { status: 503 }) };
    }
    repositoryRequest = createPublicProfileRepositoryRequest(config);
  }
  try {
    return {
      session,
      repositoryRequest,
      stripe: options.stripe ?? createStripeGateway(getBillingConfig(options.env)),
    };
  } catch (error) {
    if (error instanceof BillingConfigurationError) {
      return {
        response: json({
          error: "Stripe billing is not configured.",
          missing: error.missing,
        }, { status: 503 }),
      };
    }
    throw error;
  }
}

function safeFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "billing_request_failed";
  console.error("Billing request failed", {
    project: STRIPE_PROJECT_ID,
    error: message.slice(0, 240),
  });
  return json({ error: "Billing is temporarily unavailable." }, { status: 503 });
}

function idempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim() ?? "";
  return /^[A-Za-z0-9:_-]{8,200}$/.test(value) ? value : undefined;
}

function scopedIdempotencyKey(
  operation: "checkout" | "change",
  userId: string,
  key: string,
) {
  return `${operation}:${userId}:${key}`;
}

function nonStripeSubscriptionHasActiveEntitlement(
  subscription: Awaited<ReturnType<typeof loadBillingSubscriptionForUser>>,
  at: string,
) {
  if (!subscription || subscription.source === "stripe") return false;
  if (subscription.source !== "access_code") return true;
  if (!subscription.current_period_end) return true;
  const periodEnd = Date.parse(subscription.current_period_end);
  const requestedAt = Date.parse(at);
  if (!Number.isFinite(periodEnd) || !Number.isFinite(requestedAt)) return true;
  return requestedAt < periodEnd;
}

export async function handleCreateCheckoutRequest(
  request: Request,
  options: HandlerOptions = {},
) {
  if (!(options.checkoutEnabled ?? isStripeCheckoutEnabled(options.env))) {
    return json({
      error: "Stripe Checkout is not enabled.",
      status: "checkout_disabled",
    }, { status: 503 });
  }
  const deps = await dependencies(request, options);
  if ("response" in deps) return deps.response;
  const body = await request.json().catch(() => null) as { planCode?: unknown } | null;
  if (!isRetailPlanCode(body?.planCode)) {
    return json({ error: "Expected planCode to be basic or premium." }, { status: 400 });
  }
  const key = idempotencyKey(request);
  if (!key) {
    return json({ error: "A valid Idempotency-Key header is required." }, { status: 400 });
  }

  try {
    const existing = await loadBillingSubscriptionForUser(deps.repositoryRequest, deps.session.userId);
    const now = options.now?.() ?? new Date().toISOString();
    if (nonStripeSubscriptionHasActiveEntitlement(existing, now)) {
      return json({ error: "An explicit access conversion is required.", status: "conversion_required" }, { status: 409 });
    }
    if (existing?.source === "stripe") {
      let terminal = existing.status === "canceled"
        || existing.stripe_status_raw === "canceled"
        || existing.stripe_status_raw === "incomplete_expired";
      if (existing.stripe_subscription_id) {
        const current = await deps.stripe.retrieveSubscription(existing.stripe_subscription_id);
        if (current.livemode || (
          existing.stripe_customer_id
          && current.customerId !== existing.stripe_customer_id
        )) {
          return json({ error: "Stripe subscription ownership did not match." }, { status: 409 });
        }
        terminal = current.statusRaw === "canceled"
          || current.statusRaw === "incomplete_expired";
      }
      if (!terminal) {
        return json({ error: "This account already has a Stripe subscription.", status: "subscription_exists" }, { status: 409 });
      }
    }

    const session = await deps.stripe.createCheckoutSession({
      userId: deps.session.userId,
      email: deps.session.email,
      planCode: body.planCode,
      customerId: existing?.stripe_customer_id ?? undefined,
      idempotencyKey: scopedIdempotencyKey("checkout", deps.session.userId, key),
    });
    if (!session.url) return json({ error: "Stripe did not return a Checkout URL." }, { status: 503 });
    return json({ status: "created", sessionId: session.id, url: session.url });
  } catch (error) {
    return safeFailure(error);
  }
}

export async function handleCreatePortalRequest(
  request: Request,
  options: HandlerOptions = {},
) {
  const deps = await dependencies(request, options);
  if ("response" in deps) return deps.response;
  try {
    const subscription = await loadBillingSubscriptionForUser(deps.repositoryRequest, deps.session.userId);
    if (subscription?.source !== "stripe" || !subscription.stripe_customer_id) {
      return json({ error: "No Stripe billing account is attached.", status: "billing_account_missing" }, { status: 409 });
    }
    const portal = await deps.stripe.createPortalSession(subscription.stripe_customer_id);
    return json({ status: "created", sessionId: portal.id, url: portal.url });
  } catch (error) {
    return safeFailure(error);
  }
}

export async function handleChangePlanRequest(
  request: Request,
  options: HandlerOptions = {},
) {
  const deps = await dependencies(request, options);
  if ("response" in deps) return deps.response;
  const key = idempotencyKey(request);
  if (!key) {
    return json({ error: "A valid Idempotency-Key header is required." }, { status: 400 });
  }
  const body = await request.json().catch(() => null) as { planCode?: unknown } | null;
  if (!isRetailPlanCode(body?.planCode)) {
    return json({ error: "Expected planCode to be basic or premium." }, { status: 400 });
  }

  try {
    const local = await loadBillingSubscriptionForUser(deps.repositoryRequest, deps.session.userId);
    if (
      local?.source !== "stripe"
      || !local.stripe_subscription_id
      || !local.stripe_customer_id
    ) {
      return json({ error: "An owned Stripe subscription is required.", status: "subscription_missing" }, { status: 409 });
    }
    const current = await deps.stripe.retrieveSubscription(local.stripe_subscription_id);
    if (current.livemode || current.customerId !== local.stripe_customer_id) {
      return json({ error: "Stripe subscription ownership did not match." }, { status: 409 });
    }
    const currentPlan = deps.stripe.planCodeForPrice(current.priceId);
    if (!currentPlan) {
      return json({ error: "The current Stripe price is not allowlisted." }, { status: 409 });
    }
    await deps.stripe.validatePrice(currentPlan);
    if (current.pendingUpdate) {
      return json({
        status: "payment_required",
        planCode: currentPlan,
        latestInvoiceId: current.latestInvoiceId ?? null,
      }, { status: 202 });
    }
    if (["past_due", "unpaid", "incomplete", "paused"].includes(current.statusRaw)) {
      return json({
        error: "The current subscription needs payment attention.",
        status: "payment_required",
        planCode: currentPlan,
        latestInvoiceId: current.latestInvoiceId ?? null,
      }, { status: 402 });
    }
    if (!["active", "trialing"].includes(current.statusRaw)) {
      return json({
        error: "The current subscription cannot change plans.",
        status: "subscription_inactive",
        planCode: currentPlan,
      }, { status: 409 });
    }
    if (currentPlan === body.planCode) {
      return json({ status: "unchanged", planCode: currentPlan });
    }

    if (currentPlan === "basic" && body.planCode === "premium") {
      const updated = await deps.stripe.upgradeSubscription({
        subscription: current,
        targetPlanCode: "premium",
        idempotencyKey: scopedIdempotencyKey("change", deps.session.userId, key),
      });
      const updatedPlan = deps.stripe.planCodeForPrice(updated.priceId);
      if (updated.pendingUpdate || updatedPlan !== "premium") {
        return json({
          status: "payment_required",
          planCode: currentPlan,
          pendingPlanCode: "premium",
          latestInvoiceId: updated.latestInvoiceId ?? null,
        }, { status: 202 });
      }
      return json({ status: "immediate", planCode: "premium" });
    }

    const scheduled = await deps.stripe.scheduleDowngrade({
      subscription: current,
      targetPlanCode: "basic",
      idempotencyKey: scopedIdempotencyKey("change", deps.session.userId, key),
    });
    return json({
      status: "scheduled",
      planCode: currentPlan,
      pendingPlanCode: "basic",
      effectiveAt: current.currentPeriodEnd,
      scheduleId: scheduled.scheduleId,
      alreadyScheduled: scheduled.alreadyScheduled,
    });
  } catch (error) {
    return safeFailure(error);
  }
}

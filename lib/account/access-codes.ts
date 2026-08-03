import { getPublicAuthSession, type PublicAuthSession } from "../public-auth/session";
import {
  createPublicProfileRepositoryRequest,
  getPublicProfileRepositoryConfig,
  type PublicProfileRepositoryRequest,
} from "../public-profile/repository";
import {
  isBillingEnabled,
  loadSubscriptionContextForUser,
  loadUsageLedgerForUser,
} from "../public-profile/subscription/repository";
import {
  subscriptionUsagePeriod,
  summarizeSubscriptionUsage,
} from "../public-profile/subscription/enforcement";

// Access-code redemption: an authenticated user submits an invite code and is
// provisioned onto the code's subscription plan (e.g. free "tester" access).

type AccessCodeRow = {
  id: string;
  code: string;
  plan_name: string;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
};

type PlanRow = {
  id: string;
  name: string;
};

export type RedeemAccessCodeHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
};

export type AtomicAccessCodeRedemptionResult =
  | {
      status: "redeemed";
      redeemed: true;
      planCode: string;
      periodStart: string;
      periodEnd: string;
      usesRemaining: number | null;
    }
  | {
      status:
        | "stripe_subscription_exists"
        | "already_entitled"
        | "invalid_code"
        | "expired_code"
        | "exhausted_code"
        | "plan_missing";
      redeemed: false;
      source?: string;
    };

function json(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store", ...init.headers },
  });
}

function qs(params: Record<string, string>) {
  return `?${new URLSearchParams(params).toString()}`;
}

// Access-code grants run 30 days from redemption (Randall, 2026-08-03). Mirrors the
// `interval '30 days'` the atomic RPC uses in
// supabase/migrations/20260803000100_access_code_thirty_day_grant.sql.
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeAccessCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "") : "";
}

export async function redeemAccessCodeSubscription(
  request: PublicProfileRepositoryRequest,
  input: { userId: string; code: string; now: string },
) {
  return request<AtomicAccessCodeRedemptionResult>("rpc/redeem_access_code_subscription", {
    method: "POST",
    body: {
      p_user_id: input.userId,
      p_code: input.code,
      p_now: input.now,
    },
  });
}

export async function handleRedeemAccessCodeRequest(
  request: Request,
  options: RedeemAccessCodeHandlerOptions = {},
) {
  const session = options.getSession
    ? await options.getSession(request)
    : await getPublicAuthSession(request, { env: options.env });
  if (session.status === "config_error") {
    return json({ error: "Public auth is not configured.", missing: session.missing }, { status: 503 });
  }
  if (session.status !== "authenticated") {
    return json({ error: "Authentication required.", detail: session.reason }, { status: 401 });
  }

  let repositoryRequest = options.repositoryRequest;
  if (!repositoryRequest) {
    const config = getPublicProfileRepositoryConfig(options.env);
    if (!config) {
      return json({ error: "Account storage is not configured." }, { status: 503 });
    }
    repositoryRequest = createPublicProfileRepositoryRequest(config);
  }

  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  const code = normalizeAccessCode(body?.code);
  if (!code) {
    return json({
      error: "Expected an access code.",
      status: "validation_error",
      issues: [{ field: "code", message: "code is required." }],
    }, { status: 400 });
  }

  const now = options.now?.() ?? new Date().toISOString();
  if (isBillingEnabled(options.env)) {
    const result = await redeemAccessCodeSubscription(repositoryRequest, {
      userId: session.userId,
      code,
      now,
    });
    if (result.status === "redeemed") {
      return json({
        status: "redeemed",
        planName: result.planCode,
        periodStart: result.periodStart,
        periodEnd: result.periodEnd,
        usesRemaining: result.usesRemaining,
      });
    }
    if (result.status === "invalid_code") {
      return json({ error: "That code did not match anything.", status: result.status }, { status: 404 });
    }
    if (result.status === "expired_code") {
      return json({ error: "That code has expired.", status: result.status }, { status: 410 });
    }
    if (result.status === "exhausted_code") {
      return json({ error: "That code has already been fully used.", status: result.status }, { status: 410 });
    }
    if (result.status === "plan_missing") {
      return json({ error: "The plan behind this code is not available.", status: result.status }, { status: 500 });
    }
    if (result.status === "stripe_subscription_exists") {
      return json({
        error: "This account already has a paid subscription.",
        status: result.status,
      }, { status: 409 });
    }
    if (result.status === "already_entitled") {
      return json({
        error: "This account already has active access.",
        status: result.status,
      }, { status: 409 });
    }
    return json({ error: "Could not redeem that code.", status: "redemption_failed" }, { status: 503 });
  }

  const codes = await repositoryRequest<AccessCodeRow[]>("access_codes", {
    query: qs({ code: `eq.${code}`, limit: "1" }),
  });
  const accessCode = codes[0];
  if (!accessCode) {
    return json({ error: "That code did not match anything.", status: "invalid_code" }, { status: 404 });
  }
  if (accessCode.expires_at && accessCode.expires_at < now) {
    return json({ error: "That code has expired.", status: "expired_code" }, { status: 410 });
  }
  if (accessCode.max_uses !== null && accessCode.use_count >= accessCode.max_uses) {
    return json({ error: "That code has already been fully used.", status: "exhausted_code" }, { status: 410 });
  }

  const plans = await repositoryRequest<PlanRow[]>("subscription_plans", {
    query: qs({ name: `eq.${accessCode.plan_name}`, select: "id,name", limit: "1" }),
  });
  const plan = plans[0];
  if (!plan) {
    return json({ error: "The plan behind this code is not available.", status: "plan_missing" }, { status: 500 });
  }

  // Claim a use with an optimistic guard on use_count so a concurrent redeem
  // of the final use cannot overshoot max_uses.
  const claimQuery: Record<string, string> = {
    id: `eq.${accessCode.id}`,
    use_count: `eq.${accessCode.use_count}`,
  };
  const claimed = await repositoryRequest<AccessCodeRow[]>("access_codes", {
    method: "PATCH",
    query: qs(claimQuery),
    headers: { Prefer: "return=representation" },
    body: { use_count: accessCode.use_count + 1, updated_at: now },
  });
  if (!claimed || claimed.length === 0) {
    return json({ error: "That code was just used. Try again.", status: "retry" }, { status: 409 });
  }

  // Same 30-day grant window the atomic RPC stamps (Randall, 2026-08-03). Without
  // these columns this path writes a row that never expires, which is how the three
  // pre-2026-08-03 redemptions ended up permanent.
  const grantStart = new Date(now);
  const grantEnd = new Date(grantStart.getTime() + THIRTY_DAYS_MS);

  await repositoryRequest("user_subscriptions", {
    method: "POST",
    query: "?on_conflict=user_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      user_id: session.userId,
      plan_id: plan.id,
      status: "active",
      source: "access_code",
      current_period_start: grantStart.toISOString(),
      current_period_end: grantEnd.toISOString(),
      updated_at: now,
    },
  });

  return json({
    status: "redeemed",
    planName: plan.name,
  });
}

type UserSubscriptionRow = {
  plan_id: string;
  status: string;
};

export type GetAccountPlanHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
};

// Returns the signed-in account's email and active plan name, for the account
// panel's identity row + plan chip. planName is null when the user has no active
// subscription yet (they have not redeemed a code).
export async function handleGetAccountPlanRequest(
  request: Request,
  options: GetAccountPlanHandlerOptions = {},
) {
  const session = options.getSession
    ? await options.getSession(request)
    : await getPublicAuthSession(request, { env: options.env });
  if (session.status === "config_error") {
    return json({ error: "Public auth is not configured.", missing: session.missing }, { status: 503 });
  }
  if (session.status !== "authenticated") {
    return json({ error: "Authentication required.", detail: session.reason }, { status: 401 });
  }

  let repositoryRequest = options.repositoryRequest;
  if (!repositoryRequest) {
    const config = getPublicProfileRepositoryConfig(options.env);
    if (!config) {
      return json({ error: "Account storage is not configured." }, { status: 503 });
    }
    repositoryRequest = createPublicProfileRepositoryRequest(config);
  }

  if (isBillingEnabled(options.env)) {
    const now = options.now?.() ?? new Date().toISOString();
    const context = await loadSubscriptionContextForUser(
      repositoryRequest,
      session.userId,
      { billingEnabled: true },
    );
    const periodStart = context.source === "stripe"
      ? context.currentPeriodStart
      : undefined;
    const periodEnd = context.source === "stripe"
      ? context.currentPeriodEnd
      : undefined;
    const entries = context.status === "missing"
      ? []
      : await loadUsageLedgerForUser(repositoryRequest, session.userId, {
        at: now,
        periodStart,
        periodEnd,
      });
    const usage = summarizeSubscriptionUsage(context, entries, now);
    const period = subscriptionUsagePeriod(context, now);
    const publicPlanName = context.planName === "basic"
      ? "Smoldering"
      : context.planName === "premium" || context.planName === "tester"
        ? "Roaring"
        : null;
    return json({
      email: session.email ?? null,
      planName: context.planName,
      planCode: context.planName,
      publicPlanName,
      status: context.status,
      subscriptionStatus: context.status,
      source: context.source ?? null,
      used: usage.applyWizard.used,
      limit: usage.applyWizard.limit ?? 0,
      remaining: usage.applyWizard.remaining ?? 0,
      periodStart: period.start,
      periodEnd: period.end,
      cancelAtPeriodEnd: context.cancelAtPeriodEnd ?? false,
      canceledAt: context.canceledAt ?? null,
      usage: {
        applyWizard: usage.applyWizard,
      },
      markdownExport: usage.markdownExport.unlocked,
      hasBillingManagement: context.source === "stripe" && Boolean(context.stripeCustomerId),
    });
  }

  const subscriptions = await repositoryRequest<UserSubscriptionRow[]>("user_subscriptions", {
    query: qs({ user_id: `eq.${session.userId}`, status: "eq.active", select: "plan_id,status", limit: "1" }),
  });
  const subscription = subscriptions[0];
  let planName: string | null = null;
  if (subscription) {
    const plans = await repositoryRequest<PlanRow[]>("subscription_plans", {
      query: qs({ id: `eq.${subscription.plan_id}`, select: "id,name", limit: "1" }),
    });
    planName = plans[0]?.name ?? null;
  }

  return json({ email: session.email ?? null, planName });
}

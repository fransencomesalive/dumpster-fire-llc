import assert from "node:assert/strict";
import {
  handleGetAccountPlanRequest,
  handleRedeemAccessCodeRequest,
  normalizeAccessCode,
} from "../lib/account/access-codes";
import { handleExpireAccessCodesRequest } from "../lib/account/expire-access-codes";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";

const now = "2026-07-25T12:00:00.000Z";
const billingDisabledEnv = {
  NODE_ENV: "test",
  BILLING_ENABLED: "false",
} as NodeJS.ProcessEnv;
const billingEnabledEnv = {
  NODE_ENV: "test",
  BILLING_ENABLED: "true",
} as NodeJS.ProcessEnv;
const cronEnv = {
  NODE_ENV: "test",
  CRON_SECRET: "right-secret",
} as NodeJS.ProcessEnv;

function request(code: unknown) {
  return new Request("https://app.example/api/account/redeem-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

async function body(response: Response) {
  return await response.json() as Record<string, unknown>;
}

function authenticated() {
  return {
    status: "authenticated" as const,
    userId: "user-1",
    email: "user@example.com",
  };
}

async function main() {
  assert.equal(normalizeAccessCode("  test code  "), "TESTCODE");
  assert.equal(normalizeAccessCode(null), "");

  let validationCalledRepository = false;
  const validation = await handleRedeemAccessCodeRequest(request(" "), {
    getSession: async () => authenticated(),
    repositoryRequest: async () => {
      validationCalledRepository = true;
      throw new Error("validation must stop before storage");
    },
  });
  assert.equal(validation.status, 400);
  assert.equal((await body(validation)).status, "validation_error");
  assert.equal(validationCalledRepository, false);

  const legacyCalls: Array<{ table: string; method: string; body?: unknown }> = [];
  const legacyRequest: PublicProfileRepositoryRequest = async <T>(
    table: string,
    options: Parameters<PublicProfileRepositoryRequest>[1],
  ) => {
    legacyCalls.push({
      table,
      method: options.method ?? "GET",
      body: options.body,
    });
    if (table === "access_codes" && (options.method ?? "GET") === "GET") {
      return [{
        id: "code-1",
        code: "TESTCODE",
        plan_name: "tester",
        max_uses: 10,
        use_count: 2,
        expires_at: null,
      }] as T;
    }
    if (table === "subscription_plans") {
      return [{ id: "plan-tester", name: "tester" }] as T;
    }
    if (table === "access_codes" && options.method === "PATCH") {
      return [{
        id: "code-1",
        code: "TESTCODE",
        plan_name: "tester",
        max_uses: 10,
        use_count: 3,
        expires_at: null,
      }] as T;
    }
    return undefined as T;
  };
  const legacy = await handleRedeemAccessCodeRequest(request("test code"), {
    env: billingDisabledEnv,
    now: () => now,
    getSession: async () => authenticated(),
    repositoryRequest: legacyRequest,
  });
  assert.equal(legacy.status, 200);
  assert.equal((await body(legacy)).planName, "tester");
  assert.deepEqual(
    legacyCalls.map((call) => call.table),
    ["access_codes", "subscription_plans", "access_codes", "user_subscriptions"],
  );
  assert.equal(legacyCalls.some((call) => call.table.startsWith("rpc/")), false);

  const enabledCalls: Array<{ table: string; method: string; body?: unknown }> = [];
  const enabledRequest: PublicProfileRepositoryRequest = async <T>(
    table: string,
    options: Parameters<PublicProfileRepositoryRequest>[1],
  ) => {
    enabledCalls.push({
      table,
      method: options.method ?? "GET",
      body: options.body,
    });
    return {
      status: "redeemed",
      redeemed: true,
      planCode: "tester",
      periodStart: "2026-07-01T00:00:00.000Z",
      periodEnd: "2026-08-01T00:00:00.000Z",
      usesRemaining: 7,
    } as T;
  };
  const enabled = await handleRedeemAccessCodeRequest(request("test code"), {
    env: billingEnabledEnv,
    now: () => now,
    getSession: async () => authenticated(),
    repositoryRequest: enabledRequest,
  });
  assert.equal(enabled.status, 200);
  const enabledJson = await body(enabled);
  assert.equal(enabledJson.planName, "tester");

  const alreadyRedeemed = await handleRedeemAccessCodeRequest(request("SECOND-CODE"), {
    env: billingEnabledEnv,
    now: () => now,
    getSession: async () => authenticated(),
    repositoryRequest: async <T>() => ({
      status: "access_code_already_redeemed",
      redeemed: false,
    }) as T,
  });
  assert.equal(alreadyRedeemed.status, 409);
  assert.equal((await body(alreadyRedeemed)).status, "access_code_already_redeemed");
  assert.equal(enabledJson.usesRemaining, 7);
  assert.equal(enabledCalls.length, 1);
  assert.equal(enabledCalls[0].table, "rpc/redeem_access_code_subscription");
  assert.equal(enabledCalls[0].method, "POST");
  assert.deepEqual(enabledCalls[0].body, {
    p_user_id: "user-1",
    p_code: "TESTCODE",
    p_now: now,
  });

  const invalidRequest: PublicProfileRepositoryRequest = async <T>() => ({
    status: "invalid_code",
    redeemed: false,
  }) as T;
  const invalid = await handleRedeemAccessCodeRequest(request("unknown"), {
    env: billingEnabledEnv,
    now: () => now,
    getSession: async () => authenticated(),
    repositoryRequest: invalidRequest,
  });
  assert.equal(invalid.status, 404);
  assert.equal((await body(invalid)).status, "invalid_code");

  const stripeRequest: PublicProfileRepositoryRequest = async <T>() => ({
    status: "stripe_subscription_exists",
    redeemed: false,
  }) as T;
  const stripeConflict = await handleRedeemAccessCodeRequest(request("test"), {
    env: billingEnabledEnv,
    now: () => now,
    getSession: async () => authenticated(),
    repositoryRequest: stripeRequest,
  });
  assert.equal(stripeConflict.status, 409);
  assert.equal((await body(stripeConflict)).status, "stripe_subscription_exists");

  const accountPlanRequest: PublicProfileRepositoryRequest = async <T>(table: string) => {
    if (table === "user_subscriptions") {
      return [{
        plan_id: "plan-premium",
        status: "active",
        source: "stripe",
        current_period_start: "2026-07-01T00:00:00.000Z",
        current_period_end: "2026-08-01T00:00:00.000Z",
        cancel_at_period_end: false,
        canceled_at: null,
        stripe_customer_id: "cus_test",
        stripe_subscription_id: "sub_test",
        stripe_price_id: "price_premium",
        stripe_status_raw: "active",
      }] as T;
    }
    if (table === "subscription_plans") {
      return [{
        id: "plan-premium",
        name: "premium",
        pursuit_limit_monthly: null,
        human_path_limit_monthly: null,
        outreach_limit_monthly: null,
        apply_wizard_limit_monthly: 45,
        profile_export: true,
        markdown_export: true,
        publicly_available: true,
        internal_only: false,
      }] as T;
    }
    if (table === "usage_ledger") {
      return [
        {
          usage_type: "apply_wizard",
          quantity: 1,
          created_at: "2026-07-10T00:00:00.000Z",
        },
        {
          usage_type: "apply_wizard",
          quantity: 1,
          created_at: "2026-07-11T00:00:00.000Z",
        },
      ] as T;
    }
    throw new Error(`Unexpected table ${table}`);
  };
  const accountPlan = await handleGetAccountPlanRequest(
    new Request("https://app.example/api/account/plan"),
    {
      env: billingEnabledEnv,
      now: () => now,
      getSession: async () => authenticated(),
      repositoryRequest: accountPlanRequest,
    },
  );
  assert.equal(accountPlan.status, 200);
  const accountPlanJson = await body(accountPlan);
  assert.equal(accountPlanJson.publicPlanName, "Roaring");
  assert.equal(accountPlanJson.status, "active");
  assert.equal(accountPlanJson.planCode, "premium");
  assert.equal(accountPlanJson.subscriptionStatus, "active");
  assert.equal(accountPlanJson.used, 2);
  assert.equal(accountPlanJson.limit, 45);
  assert.equal(accountPlanJson.remaining, 43);
  assert.equal(accountPlanJson.periodStart, "2026-07-01T00:00:00.000Z");
  assert.equal(accountPlanJson.periodEnd, "2026-08-01T00:00:00.000Z");
  assert.equal(accountPlanJson.hasBillingManagement, true);
  assert.deepEqual(accountPlanJson.usage, {
    applyWizard: { used: 2, limit: 45, remaining: 43 },
  });
  assert.equal(accountPlanJson.markdownExport, true);

  const activeAccessCodePlanRequest: PublicProfileRepositoryRequest = async <T>(
    table: string,
    options: Parameters<PublicProfileRepositoryRequest>[1],
  ) => {
    if (table === "user_subscriptions") {
      return [{
        plan_id: "plan-premium",
        status: "active",
        source: "access_code",
        current_period_start: "2026-07-01T00:00:00.000Z",
        current_period_end: "2026-08-01T00:00:00.000Z",
        cancel_at_period_end: false,
        canceled_at: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        stripe_price_id: null,
        stripe_status_raw: null,
      }] as T;
    }
    return accountPlanRequest<T>(table, options);
  };
  const activeAccessCodePlan = await handleGetAccountPlanRequest(
    new Request("https://app.example/api/account/plan"),
    {
      env: billingEnabledEnv,
      now: () => now,
      getSession: async () => authenticated(),
      repositoryRequest: activeAccessCodePlanRequest,
    },
  );
  const activeAccessCodePlanJson = await body(activeAccessCodePlan);
  assert.equal(activeAccessCodePlanJson.planName, "premium");
  assert.equal(activeAccessCodePlanJson.publicPlanName, "Full access");
  assert.equal(activeAccessCodePlanJson.limit, 45);
  assert.equal(activeAccessCodePlanJson.hasBillingManagement, false);

  const expiredPlanRequest: PublicProfileRepositoryRequest = async <T>(table: string) => {
    if (table === "user_subscriptions") {
      return [{
        plan_id: "plan-tester",
        status: "active",
        source: "access_code",
        current_period_start: "2026-06-25T12:00:00.000Z",
        current_period_end: now,
        cancel_at_period_end: false,
        canceled_at: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        stripe_price_id: null,
        stripe_status_raw: null,
      }] as T;
    }
    if (table === "subscription_plans") {
      return [{
        id: "plan-tester",
        name: "tester",
        pursuit_limit_monthly: 25,
        human_path_limit_monthly: 25,
        outreach_limit_monthly: 75,
        apply_wizard_limit_monthly: 25,
        profile_export: true,
        markdown_export: true,
        publicly_available: false,
        internal_only: true,
      }] as T;
    }
    if (table === "usage_ledger") return [] as T;
    throw new Error(`Unexpected table ${table}`);
  };
  const expiredPlan = await handleGetAccountPlanRequest(
    new Request("https://app.example/api/account/plan"),
    {
      env: billingEnabledEnv,
      now: () => now,
      getSession: async () => authenticated(),
      repositoryRequest: expiredPlanRequest,
    },
  );
  const expiredPlanJson = await body(expiredPlan);
  assert.equal(expiredPlanJson.status, "canceled");
  assert.equal(expiredPlanJson.subscriptionStatus, "canceled");
  assert.equal(expiredPlanJson.planName, null);
  assert.equal(expiredPlanJson.planCode, null);
  assert.equal(expiredPlanJson.publicPlanName, null);
  assert.equal(expiredPlanJson.source, "access_code");
  assert.equal(expiredPlanJson.periodStart, "2026-06-25T12:00:00.000Z");
  assert.equal(expiredPlanJson.periodEnd, now);
  assert.equal(expiredPlanJson.hasBillingManagement, false);

  let unauthorizedCronReachedStorage = false;
  const cronRepository: PublicProfileRepositoryRequest = async <T>(
    table: string,
    options: Parameters<PublicProfileRepositoryRequest>[1],
  ) => {
    assert.equal(table, "rpc/expire_access_code_subscriptions");
    assert.deepEqual(options.body, { p_now: now });
    return 2 as T;
  };
  const unconfiguredCron = await handleExpireAccessCodesRequest(
    new Request("https://app.example/api/cron/expire-access-codes"),
    {
      env: {} as NodeJS.ProcessEnv,
      repositoryRequest: async () => {
        unauthorizedCronReachedStorage = true;
        throw new Error("unconfigured cron must not reach storage");
      },
    },
  );
  assert.equal(unconfiguredCron.status, 503);
  assert.deepEqual((await body(unconfiguredCron)).missing, ["CRON_SECRET"]);

  const unauthorizedCron = await handleExpireAccessCodesRequest(
    new Request("https://app.example/api/cron/expire-access-codes", {
      headers: { Authorization: "Bearer wrong-secret" },
    }),
    {
      env: cronEnv,
      repositoryRequest: async () => {
        unauthorizedCronReachedStorage = true;
        throw new Error("unauthorized cron must not reach storage");
      },
    },
  );
  assert.equal(unauthorizedCron.status, 401);
  assert.equal(unauthorizedCronReachedStorage, false);

  const successfulCron = await handleExpireAccessCodesRequest(
    new Request("https://app.example/api/cron/expire-access-codes", {
      headers: { Authorization: "Bearer right-secret" },
    }),
    {
      env: cronEnv,
      now: () => now,
      repositoryRequest: cronRepository,
    },
  );
  assert.equal(successfulCron.status, 200);
  assert.deepEqual(await body(successfulCron), {
    status: "swept",
    expired: 2,
    sweptAt: now,
  });

  const failedCron = await handleExpireAccessCodesRequest(
    new Request("https://app.example/api/cron/expire-access-codes", {
      headers: { Authorization: "Bearer right-secret" },
    }),
    {
      env: cronEnv,
      now: () => now,
      repositoryRequest: async () => {
        throw new Error("RPC is unavailable");
      },
    },
  );
  assert.equal(failedCron.status, 503);
  assert.deepEqual(await body(failedCron), {
    error: "Could not run the access-code expiry sweep.",
    detail: "RPC is unavailable",
  });

  console.log("account access codes: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

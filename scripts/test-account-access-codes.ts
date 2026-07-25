import assert from "node:assert/strict";
import {
  handleRedeemAccessCodeRequest,
  normalizeAccessCode,
} from "../lib/account/access-codes";
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

  console.log("account access codes: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

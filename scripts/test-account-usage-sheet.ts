import assert from "node:assert/strict";

import {
  ACCOUNT_HEADERS,
  buildAccountUsageReport,
  handleAccountUsageSheetSync,
  isNinePmMountain,
  loadAccountUsageSource,
  writeAccountUsageSheet,
  type AccountUsageSource,
} from "../lib/reporting/account-usage-sheet";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";

const now = "2026-08-06T03:00:00.000Z";

const source: AccountUsageSource = {
  users: [
    { id: "user-2", email: "z@example.com", email_confirmed_at: null },
    { id: "user-1", email: "a@example.com", email_confirmed_at: now },
  ],
  profiles: [{ id: "profile-1", user_id: "user-1", status: "complete" }],
  roleTracks: [{ id: "role-1", profile_id: "profile-1" }],
  resumes: [{ id: "resume-1", profile_id: "profile-1" }],
  workExamples: [{ id: "example-1", profile_id: "profile-1" }, { id: "example-2", profile_id: "profile-1" }],
  skills: [{ id: "skill-1", profile_id: "profile-1" }],
  jobResults: [{ id: "result-1", user_id: "user-1" }],
  savedJobs: [{ id: "saved-1", user_id: "user-1" }],
  pursuits: [
    { id: "pursuit-1", user_id: "user-1", status: "outreach_sent" },
    { id: "pursuit-2", user_id: "user-1", status: "saved" },
  ],
  contacts: [{ id: "contact-1", pursuit_id: "pursuit-1" }],
  outreachMessages: [
    { id: "message-1", pursuit_id: "pursuit-1", status: "sent" },
    { id: "message-2", pursuit_id: "pursuit-2", status: "draft" },
  ],
  jobFeedback: [{ id: "job-feedback-1", user_id: "user-1" }],
  outreachFeedback: [{ id: "outreach-feedback-1", user_id: "user-1" }],
  usage: [{ id: "usage-1", user_id: "user-1", usage_type: "apply_wizard", quantity: 1 }],
  providerUsage: [{
    id: "provider-1", user_id: "user-1", request_count: 2,
    input_tokens: "1200", output_tokens: 300, estimated_cost_micros: "123456",
  }],
  subscriptions: [{
    id: "subscription-1", user_id: "user-1", plan_id: "plan-tester", status: "active",
    source: "access_code", current_period_end: "2026-09-04T00:00:00.000Z",
  }],
  plans: [{ id: "plan-tester", name: "tester" }],
  grants: [{ user_id: "user-1", redeemed_code: "DUMPSTERFRIENDS", current_period_end: "2026-09-04T00:00:00.000Z" }],
  trackingEvents: [{
    id: "tracking-1", user_id: "user-1", source: "message_copy",
    action: "outreach_sent", checked: true,
  }],
};

async function body(response: Response) {
  return await response.json() as Record<string, unknown>;
}

async function main() {
  assert.equal(isNinePmMountain("2026-08-06T03:00:00.000Z"), true);
  assert.equal(isNinePmMountain("2026-08-06T04:00:00.000Z"), false);
  assert.equal(isNinePmMountain("2026-12-06T04:00:00.000Z"), true);
  assert.equal(isNinePmMountain("2026-12-06T03:00:00.000Z"), false);

  const report = buildAccountUsageReport(source, now);
  assert.equal(report.accounts.length, 3);
  assert.deepEqual(report.accounts[0], Array.from(ACCOUNT_HEADERS));
  assert.equal(report.accounts[1]?.length, 24);
  assert.equal(report.accounts[1]?.[0], "a@example.com");
  assert.equal(report.accounts[1]?.[2], "Active tester (code)");
  assert.equal(report.accounts[1]?.[4], "Sep 3, 2026");
  assert.equal(report.accounts[1]?.[13], "outreach_sent: 1, saved: 1");
  assert.equal(report.accounts[1]?.[23], 0.123456);
  assert.equal(report.refreshedAt.includes("T03:00"), false);
  assert.equal(report.refreshedAt, "Aug 5, 2026, 9:00 PM MT");
  assert.equal(JSON.stringify(report).includes("2026-08-06T03:00:00.000Z"), false);
  assert.deepEqual(report.summary[30], [
    "Conversion funnel", "Accounts", "Converted from previous stage", "Converted from all accounts",
  ]);
  assert.deepEqual(report.summary[31], ["Account created", 2, 1, 1]);
  assert.deepEqual(report.summary[32], ["Code redeemed", 1, 0.5, 0.5]);
  assert.deepEqual(report.summary[33], ["Profile completed", 1, 1, 0.5]);
  assert.deepEqual(report.summary[34], ["Message copied", 1, 1, 0.5]);

  const missingSecret = await handleAccountUsageSheetSync(new Request("https://example.test", { method: "GET" }), {
    env: {} as NodeJS.ProcessEnv,
  });
  assert.equal(missingSecret.status, 503);
  assert.deepEqual((await body(missingSecret)).missing, ["CRON_SECRET"]);

  const unauthorized = await handleAccountUsageSheetSync(new Request("https://example.test", { method: "GET" }), {
    env: { NODE_ENV: "test", CRON_SECRET: "right" } as NodeJS.ProcessEnv,
  });
  assert.equal(unauthorized.status, 401);

  let loaded = false;
  const skipped = await handleAccountUsageSheetSync(new Request("https://example.test", {
    method: "GET", headers: { Authorization: "Bearer right" },
  }), {
    env: { NODE_ENV: "test", CRON_SECRET: "right" } as NodeJS.ProcessEnv,
    now: () => "2026-08-06T04:00:00.000Z",
    loadSource: async () => { loaded = true; return source; },
  });
  assert.equal(skipped.status, 200);
  assert.equal((await body(skipped)).status, "skipped");
  assert.equal(loaded, false);

  let writtenAccounts = 0;
  let receivedToken = "";
  const updated = await handleAccountUsageSheetSync(new Request("https://example.test", {
    method: "GET",
    headers: { Authorization: "Bearer right", "x-vercel-oidc-token": "oidc-token" },
  }), {
    env: { NODE_ENV: "test", CRON_SECRET: "right" } as NodeJS.ProcessEnv,
    now: () => now,
    loadSource: async () => source,
    writeSheet: async (value, token) => { writtenAccounts = value.accountCount; receivedToken = token; },
  });
  assert.equal(updated.status, 200);
  assert.equal((await body(updated)).status, "updated");
  assert.equal(writtenAccounts, 2);
  assert.equal(receivedToken, "oidc-token");

  const manual = await handleAccountUsageSheetSync(new Request("https://example.test", {
    method: "POST", headers: { Authorization: "Bearer right" },
  }), {
    env: { NODE_ENV: "test", CRON_SECRET: "right", VERCEL_OIDC_TOKEN: "local-token" } as NodeJS.ProcessEnv,
    now: () => "2026-08-06T12:00:00.000Z",
    loadSource: async () => source,
    writeSheet: async (_value, token) => { receivedToken = token; },
  });
  assert.equal(manual.status, 200);
  assert.equal(receivedToken, "local-token");

  const googleCalls: Array<{ url: string; init?: RequestInit }> = [];
  const googleFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    googleCalls.push({ url, init });
    if (url === "https://sts.googleapis.com/v1/token") {
      assert.match(String(init?.body), /subject_token=oidc-token/);
      return Response.json({ access_token: "federated-token" });
    }
    if (url.includes("iamcredentials.googleapis.com")) {
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer federated-token");
      return Response.json({ accessToken: "sheets-token" });
    }
    if (url.includes("?fields=sheets.properties")) {
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer sheets-token");
      return Response.json({ sheets: [
        { properties: { sheetId: 1, title: "Accounts", gridProperties: { rowCount: 5, columnCount: 24 } } },
        { properties: { sheetId: 2, title: "Summary", gridProperties: { rowCount: 30, columnCount: 3 } } },
      ] });
    }
    if (url.endsWith(":batchUpdate")) {
      const payload = JSON.parse(String(init?.body)) as { requests: Array<{ updateCells: { range: { sheetId: number }; rows: unknown[] } }> };
      assert.deepEqual(payload.requests.map((request) => request.updateCells.range.sheetId), [1, 2]);
      assert.equal(payload.requests[0]?.updateCells.rows.length, 5);
      assert.equal(payload.requests[1]?.updateCells.rows.length, 35);
      return Response.json({ replies: [{}, {}] });
    }
    throw new Error(`Unexpected Google request: ${url}`);
  };
  await writeAccountUsageSheet(report, {
    oidcToken: "oidc-token",
    env: {
      NODE_ENV: "test",
      GOOGLE_SHEETS_ACCOUNT_USAGE_ID: "sheet-id",
      GOOGLE_CLOUD_PROJECT_NUMBER: "123456789",
      GOOGLE_WORKLOAD_IDENTITY_POOL_ID: "vercel",
      GOOGLE_WORKLOAD_IDENTITY_PROVIDER_ID: "vercel",
      GOOGLE_REPORTING_SERVICE_ACCOUNT_EMAIL: "reporter@example-project.iam.gserviceaccount.com",
    } as NodeJS.ProcessEnv,
    fetchImpl: googleFetch,
  });
  assert.equal(googleCalls.length, 4);

  const calls = new Map<string, number>();
  const repositoryRequest: PublicProfileRepositoryRequest = async <T>(resource: string, options: { query?: string }) => {
    calls.set(resource, (calls.get(resource) ?? 0) + 1);
    const params = new URLSearchParams(options.query?.replace(/^\?/, ""));
    const offset = Number(params.get("offset"));
    if (resource === "candidate_profiles" && offset === 0) {
      return Array.from({ length: 500 }, (_, index) => ({ id: `p-${index}`, user_id: `u-${index}`, status: "complete" })) as T;
    }
    return [] as T;
  };
  const paginated = await loadAccountUsageSource({} as NodeJS.ProcessEnv, {
    repositoryRequest,
    loadUsers: async () => [],
  });
  assert.equal(paginated.profiles.length, 500);
  assert.equal(calls.get("candidate_profiles"), 2);

  console.log("Account usage sheet tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

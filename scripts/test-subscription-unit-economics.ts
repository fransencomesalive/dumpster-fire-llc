import assert from "node:assert/strict";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";
import {
  buildUnitEconomicsReport,
  loadAllReportPages,
  loadUnitEconomicsInputs,
  type UnitEconomicsInputs,
} from "../lib/costs/unit-economics";

const from = "2026-07-01T00:00:00.000Z";
const to = "2026-08-01T00:00:00.000Z";

const inputs: UnitEconomicsInputs = {
  from,
  to,
  providerEvents: [
    {
      id: "event-secret-1",
      pursuit_id: "pursuit-secret-success",
      provider_category: "anthropic",
      operation: "outreach_generation",
      request_count: 1,
      outcome: "success",
      estimated_cost_micros: "1000",
      rate_card_version: "anthropic-a",
      created_at: from,
    },
    {
      id: "event-secret-2",
      pursuit_id: "pursuit-secret-success",
      provider_category: "exa",
      operation: "human_path_people_search_recruiter",
      request_count: 1,
      outcome: "success",
      estimated_cost_micros: 7000,
      rate_card_version: "exa-a",
      created_at: "2026-07-02T00:00:00.000Z",
    },
    {
      id: "event-secret-3",
      pursuit_id: "pursuit-old-contact",
      provider_category: "exa",
      operation: "human_path_people_search_hiring_manager",
      request_count: 1,
      outcome: "empty",
      estimated_cost_micros: 7000,
      rate_card_version: "exa-b",
      created_at: "2026-07-03T00:00:00.000Z",
    },
    {
      id: "event-secret-4",
      pursuit_id: null,
      provider_category: "anthropic",
      operation: "resume_pdf_parse",
      request_count: 1,
      outcome: "failure",
      estimated_cost_micros: 0,
      rate_card_version: "anthropic-a",
      created_at: "2026-07-04T00:00:00.000Z",
    },
    {
      id: "outside-window",
      pursuit_id: null,
      provider_category: "anthropic",
      operation: "resume_pdf_parse",
      request_count: 1,
      outcome: "success",
      estimated_cost_micros: 999,
      rate_card_version: "anthropic-a",
      created_at: to,
    },
  ],
  contacts: [
    {
      id: "contact-secret-1",
      pursuit_id: "pursuit-secret-success",
      created_at: "2026-07-02T00:00:00.000Z",
    },
    {
      id: "contact-secret-2",
      pursuit_id: "pursuit-secret-success",
      created_at: "2026-07-03T00:00:00.000Z",
    },
    {
      id: "contact-secret-old",
      pursuit_id: "pursuit-old-contact",
      created_at: "2026-06-30T23:59:00.000Z",
    },
    {
      id: "contact-secret-newer",
      pursuit_id: "pursuit-old-contact",
      created_at: "2026-07-03T00:00:00.000Z",
    },
  ],
  usageLedger: [
    { id: "usage-1", usage_type: "human_path", quantity: 2, created_at: from },
    { id: "usage-2", usage_type: "pursuit", quantity: 1, created_at: to },
  ],
  outreachMessages: [
    { id: "message-1", regeneration_count: 1, created_at: from },
    { id: "message-2", regeneration_count: 4, created_at: to },
  ],
  subscriptions: [
    { id: "subscription-secret", plan_id: "plan-basic", status: "active" },
    { id: "subscription-secret-2", plan_id: null, status: "canceled" },
  ],
  plans: [{ id: "plan-basic", name: "basic" }],
};

const report = buildUnitEconomicsReport(inputs);
assert.equal(report.coverage.providerEvents, 4);
assert.equal(report.coverage.successfulContactBackedPursuits, 1);
assert.equal(report.coverage.providerEventsWithoutPursuit, 1);
assert.equal(report.providerCosts.totalEstimatedCostMicros, "15000");
assert.equal(report.providerCosts.failedOrEmptyEstimatedCostMicros, "7000");
assert.equal(report.providerCosts.successfulContactBackedCohortCostMicros, "8000");
assert.equal(
  report.providerCosts.averageCorrelatedCostPerSuccessfulContactBackedPursuitMicros,
  "8000",
);
assert.equal(report.providerCosts.uncorrelatedCostMicros, "0");
assert.equal(report.providerCosts.outsideSuccessfulCohortCostMicros, "7000");
assert.deepEqual(report.legacyUsage.quantities, [{ key: "human_path", count: 2 }]);
assert.equal(report.outreach.persistedMessages, 1);
assert.equal(report.outreach.userRequestedRegenerations, 1);
assert.deepEqual(report.currentEntitlements.counts, [
  { key: "basic:active", count: 1 },
  { key: "unknown:canceled", count: 1 },
]);
assert.ok(report.unavailable.some((entry) => entry.metric === "collectedRevenue"));
assert.doesNotMatch(JSON.stringify(report), /event-secret|pursuit-secret|contact-secret|subscription-secret/);

const zeroReport = buildUnitEconomicsReport({
  ...inputs,
  providerEvents: [],
  contacts: [],
});
assert.equal(
  zeroReport.providerCosts.averageCorrelatedCostPerSuccessfulContactBackedPursuitMicros,
  null,
);
assert.throws(
  () => buildUnitEconomicsReport({ ...inputs, from: to, to: from }),
  /valid increasing timestamps/,
);
assert.throws(
  () => buildUnitEconomicsReport({ ...inputs, from: "2026-07-01", to }),
  /valid increasing timestamps/,
);

const bigintReport = buildUnitEconomicsReport({
  ...inputs,
  providerEvents: [
    {
      ...inputs.providerEvents[0],
      estimated_cost_micros: "9007199254740993000",
    },
  ],
  contacts: [],
});
assert.equal(
  bigintReport.providerCosts.totalEstimatedCostMicros,
  "9007199254740993000",
);

async function testPagination() {
  const offsets: string[] = [];
  const request: PublicProfileRepositoryRequest = async <T>(
    _resource: string,
    options: Parameters<PublicProfileRepositoryRequest>[1],
  ) => {
    const params = new URLSearchParams(options.query?.slice(1));
    const offset = params.get("offset") ?? "";
    offsets.push(offset);
    const rows = offset === "0"
      ? [{ value: 1 }, { value: 2 }]
      : offset === "2"
        ? [{ value: 3 }, { value: 4 }]
        : [];
    return rows as T;
  };
  const rows = await loadAllReportPages<{ value: number }>(
    request,
    "provider_usage_events",
    { select: "id", order: "created_at.asc,id.asc" },
    2,
  );
  assert.deepEqual(rows, [{ value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }]);
  assert.deepEqual(offsets, ["0", "2", "4"]);

  const queries = new Map<string, string>();
  const emptyRequest: PublicProfileRepositoryRequest = async <T>(
    resource: string,
    options: Parameters<PublicProfileRepositoryRequest>[1],
  ) => {
    queries.set(resource, decodeURIComponent(options.query ?? ""));
    return [] as T;
  };
  await loadUnitEconomicsInputs(emptyRequest, { from, to });
  assert.match(
    queries.get("provider_usage_events") ?? "",
    /and=\(created_at\.gte\.2026-07-01T00:00:00\.000Z,created_at\.lt\.2026-08-01T00:00:00\.000Z\)/,
  );
}

void testPagination().then(() => {
  console.log("subscription unit economics: all assertions passed");
}).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

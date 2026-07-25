import assert from "node:assert/strict";
import {
  createBestEffortProviderUsageSink,
  createProviderUsageSink,
  providerUsageInsert,
  recordProviderUsageEvent,
  type ProviderUsageEventInput,
  type ProviderUsageRepositoryRequest,
} from "../lib/costs/provider-usage";

const completeInput: ProviderUsageEventInput = {
  userId: "00000000-0000-0000-0000-000000000001",
  pursuitId: "00000000-0000-0000-0000-000000000002",
  jobId: "00000000-0000-0000-0000-000000000003",
  providerCategory: "anthropic",
  operation: "outreach_generation",
  modelVersion: "claude-opus-4-8",
  requestCount: 2,
  inputTokens: 4_000,
  outputTokens: 900,
  cacheWriteTokens: 250,
  cacheReadTokens: 1_500,
  resultCount: 1,
  durationMs: 1_250,
  outcome: "success" as const,
  estimatedCostMicros: 18_750,
  rateCardVersion: "anthropic-2026-07-24",
  requestCorrelationId: "outreach:user-1:pursuit-1:request-1",
};

const insert = providerUsageInsert(completeInput);
assert.deepEqual(insert, {
  user_id: completeInput.userId,
  pursuit_id: completeInput.pursuitId,
  job_id: completeInput.jobId,
  provider_category: "anthropic",
  operation: "outreach_generation",
  model_version: "claude-opus-4-8",
  request_count: 2,
  input_tokens: 4_000,
  output_tokens: 900,
  cache_write_tokens: 250,
  cache_read_tokens: 1_500,
  result_count: 1,
  duration_ms: 1_250,
  outcome: "success",
  estimated_cost_micros: 18_750,
  rate_card_version: "anthropic-2026-07-24",
  request_correlation_id: "outreach:user-1:pursuit-1:request-1",
});

const serializedKeys = Object.keys(insert);
for (const forbiddenKey of [
  "raw_prompt",
  "resume_text",
  "generated_message",
  "contact_results",
  "provider_response",
  "exa_highlights",
]) {
  assert.equal(serializedKeys.includes(forbiddenKey), false);
}

assert.deepEqual(
  providerUsageInsert({
    providerCategory: "exa",
    operation: "people_search",
    modelVersion: "people-search-v1",
    outcome: "empty",
    estimatedCostMicros: 2_000,
    rateCardVersion: "exa-2026-07-24",
  }),
  {
    user_id: undefined,
    pursuit_id: undefined,
    job_id: undefined,
    provider_category: "exa",
    operation: "people_search",
    model_version: "people-search-v1",
    request_count: 1,
    input_tokens: 0,
    output_tokens: 0,
    cache_write_tokens: 0,
    cache_read_tokens: 0,
    result_count: 0,
    duration_ms: undefined,
    outcome: "empty",
    estimated_cost_micros: 2_000,
    rate_card_version: "exa-2026-07-24",
    request_correlation_id: undefined,
  },
);

assert.throws(
  () => providerUsageInsert({ ...completeInput, providerCategory: "openai" as "anthropic" }),
  /providerCategory is not supported/,
);
assert.throws(
  () => providerUsageInsert({ ...completeInput, operation: " " }),
  /operation must not be empty/,
);
assert.throws(
  () => providerUsageInsert({ ...completeInput, requestCount: 0 }),
  /requestCount must be a positive safe integer/,
);
assert.throws(
  () => providerUsageInsert({ ...completeInput, estimatedCostMicros: -1 }),
  /estimatedCostMicros must be a non-negative safe integer/,
);
assert.throws(
  () => providerUsageInsert({ ...completeInput, outcome: "unknown" as "success" }),
  /outcome is not supported/,
);

let capturedResource = "";
let capturedOptions: Parameters<ProviderUsageRepositoryRequest>[1] | undefined;
const request: ProviderUsageRepositoryRequest = async <T>(resource: string, options: Parameters<ProviderUsageRepositoryRequest>[1]) => {
  capturedResource = resource;
  capturedOptions = options;
  return [{
    id: "00000000-0000-0000-0000-000000000004",
    ...insert,
    input_tokens: String(insert.input_tokens),
    estimated_cost_micros: String(insert.estimated_cost_micros),
    created_at: "2026-07-24T12:00:00.000Z",
  }] as T;
};

async function main() {
  const recorded = await recordProviderUsageEvent(request, completeInput);
  assert.equal(capturedResource, "provider_usage_events");
  assert.equal(capturedOptions?.method, "POST");
  assert.equal(capturedOptions?.headers?.Prefer, "return=representation");
  assert.equal(recorded.id, "00000000-0000-0000-0000-000000000004");
  assert.equal(recorded.inputTokens, 4_000);
  assert.equal(recorded.estimatedCostMicros, 18_750);
  assert.equal(recorded.createdAt, "2026-07-24T12:00:00.000Z");

  await createProviderUsageSink(request)(completeInput);
  assert.equal(capturedResource, "provider_usage_events");

  const persistenceErrors: Array<{
    providerCategory: string;
    operation: string;
    errorName: string;
  }> = [];
  const bestEffortSink = createBestEffortProviderUsageSink(
    async () => {
      throw new TypeError("telemetry unavailable");
    },
    (details) => {
      persistenceErrors.push(details);
    },
  );
  await bestEffortSink(completeInput);
  assert.deepEqual(persistenceErrors, [{
    providerCategory: "anthropic",
    operation: "outreach_generation",
    errorName: "TypeError",
  }]);

  await assert.rejects(
    () => recordProviderUsageEvent(
      async <T>() => [] as T,
      completeInput,
    ),
    /Provider usage insert returned no row/,
  );

  console.log("provider usage: all assertions passed");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

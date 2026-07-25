import assert from "node:assert/strict";
import {
  ANTHROPIC_MODEL,
  ANTHROPIC_RATE_CARD_VERSION,
  anthropicUsageCounters,
  callMeteredAnthropicText,
  estimateAnthropicCostMicros,
} from "../lib/costs/anthropic-usage";
import type { ProviderUsageEventInput } from "../lib/costs/provider-usage";

const usage = {
  input_tokens: 100,
  output_tokens: 20,
  cache_creation_input_tokens: 40,
  cache_read_input_tokens: 50,
  cache_creation: {
    ephemeral_5m_input_tokens: 30,
    ephemeral_1h_input_tokens: 10,
  },
};

assert.deepEqual(anthropicUsageCounters(usage), {
  inputTokens: 100,
  outputTokens: 20,
  cacheWriteTokens: 40,
  cacheReadTokens: 50,
  cacheWrite5mTokens: 30,
  cacheWrite1hTokens: 10,
});
assert.equal(estimateAnthropicCostMicros(usage), 1_313);

const request = {
  model: ANTHROPIC_MODEL,
  max_tokens: 128,
  system: "system",
  messages: [{ role: "user" as const, content: "user" }],
};

async function main() {
  const events: ProviderUsageEventInput[] = [];
  const times = [1_000, 1_250];
  const text = await callMeteredAnthropicText({
    operation: "outreach_generation",
    logLabel: "test",
    usageContext: {
      sink: async (event) => {
        events.push(event);
      },
      userId: "user-1",
      pursuitId: "pursuit-1",
      jobId: "job-1",
      requestCorrelationId: "correlation-1",
    },
    request,
  }, {
    call: async () => ({
      content: [{ type: "text", text: "generated text" }],
      model: "claude-opus-4-8-20260701",
      usage,
      _request_id: "provider-request-1",
    }),
    nowMs: () => times.shift() ?? 1_250,
  });

  assert.equal(text, "generated text");
  assert.deepEqual(events, [{
    userId: "user-1",
    pursuitId: "pursuit-1",
    jobId: "job-1",
    providerCategory: "anthropic",
    operation: "outreach_generation",
    modelVersion: "claude-opus-4-8-20260701",
    requestCount: 1,
    inputTokens: 100,
    outputTokens: 20,
    cacheWriteTokens: 40,
    cacheReadTokens: 50,
    resultCount: 1,
    durationMs: 250,
    outcome: "success",
    estimatedCostMicros: 1_313,
    rateCardVersion: ANTHROPIC_RATE_CARD_VERSION,
    requestCorrelationId: "correlation-1",
  }]);

  const emptyEvents: ProviderUsageEventInput[] = [];
  const empty = await callMeteredAnthropicText({
    operation: "voice_fingerprint",
    logLabel: "test",
    usageContext: {
      sink: async (event) => {
        emptyEvents.push(event);
      },
    },
    request,
  }, {
    call: async () => ({
      content: [],
      model: ANTHROPIC_MODEL,
      usage: {
        input_tokens: 10,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation: null,
      },
    }),
    nowMs: () => 10,
  });
  assert.equal(empty, undefined);
  assert.equal(emptyEvents[0]?.outcome, "empty");
  assert.equal(emptyEvents[0]?.resultCount, 0);

  const failureEvents: ProviderUsageEventInput[] = [];
  const originalError = console.error;
  console.error = () => undefined;
  const failed = await callMeteredAnthropicText({
    operation: "resume_pdf_parse",
    logLabel: "test",
    usageContext: {
      sink: async (event) => {
        failureEvents.push(event);
      },
      requestCorrelationId: "correlation-failure",
    },
    request,
  }, {
    call: async () => {
      throw Object.assign(new Error("provider failed"), { status: 503 });
    },
    nowMs: () => 20,
  });
  assert.equal(failed, undefined);
  assert.equal(failureEvents[0]?.outcome, "failure");
  assert.equal(failureEvents[0]?.estimatedCostMicros, 0);

  const survivesSinkFailure = await callMeteredAnthropicText({
    operation: "resume_highlights",
    logLabel: "test",
    usageContext: {
      sink: async () => {
        throw new Error("telemetry unavailable");
      },
    },
    request,
  }, {
    call: async () => ({
      content: [{ type: "text", text: "still returned" }],
      model: ANTHROPIC_MODEL,
      usage,
    }),
    nowMs: () => 30,
  });
  console.error = originalError;
  assert.equal(survivesSinkFailure, "still returned");

  const originalInfo = console.info;
  console.info = () => undefined;
  const skipped = await callMeteredAnthropicText({
    operation: "posting_section_refinement",
    logLabel: "test",
    usageContext: {
      sink: async () => {
        throw new Error("must not record");
      },
    },
    request,
  }, { apiKey: "" });
  console.info = originalInfo;
  assert.equal(skipped, undefined);

  console.log("anthropic usage: all assertions passed");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

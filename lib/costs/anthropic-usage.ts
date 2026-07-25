import type {
  MessageCreateParamsNonStreaming,
  Usage,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { ProviderUsageSink } from "./provider-usage";

export const ANTHROPIC_MODEL = "claude-opus-4-8";
export const ANTHROPIC_RATE_CARD_VERSION =
  "anthropic-opus-4-8-standard-global-2026-07-24";

export type ProviderUsageContext = {
  sink?: ProviderUsageSink;
  userId?: string;
  pursuitId?: string;
  jobId?: string;
  requestCorrelationId?: string;
};

type AnthropicUsageLike = Pick<
  Usage,
  | "input_tokens"
  | "output_tokens"
  | "cache_creation_input_tokens"
  | "cache_read_input_tokens"
  | "cache_creation"
>;

type AnthropicMessageLike = {
  content: Array<{ type: string; text?: string }>;
  model: string;
  usage: AnthropicUsageLike;
  _request_id?: string | null;
};

export type MeteredAnthropicCallDependencies = {
  apiKey?: string;
  call?: (
    request: MessageCreateParamsNonStreaming,
  ) => Promise<AnthropicMessageLike>;
  nowMs?: () => number;
};

export type MeteredAnthropicTextInput = {
  operation: string;
  request: MessageCreateParamsNonStreaming;
  usageContext?: ProviderUsageContext;
  logLabel: string;
  timeoutMs?: number;
};

function nonNegative(value: number | null | undefined) {
  return Number.isFinite(value) && (value ?? 0) > 0 ? Math.floor(value as number) : 0;
}

export function anthropicUsageCounters(usage: AnthropicUsageLike) {
  return {
    inputTokens: nonNegative(usage.input_tokens),
    outputTokens: nonNegative(usage.output_tokens),
    cacheWriteTokens: nonNegative(usage.cache_creation_input_tokens),
    cacheReadTokens: nonNegative(usage.cache_read_input_tokens),
    cacheWrite5mTokens: nonNegative(
      usage.cache_creation?.ephemeral_5m_input_tokens,
    ),
    cacheWrite1hTokens: nonNegative(
      usage.cache_creation?.ephemeral_1h_input_tokens,
    ),
  };
}

export function estimateAnthropicCostMicros(usage: AnthropicUsageLike) {
  const counters = anthropicUsageCounters(usage);
  const detailedCacheTokens =
    counters.cacheWrite5mTokens + counters.cacheWrite1hTokens;
  const cacheWrite5mTokens = detailedCacheTokens > 0
    ? counters.cacheWrite5mTokens
    : counters.cacheWriteTokens;

  // Quarter-micro arithmetic preserves the $6.25/M and $0.50/M rates until the
  // final integer-micro persistence boundary.
  const quarterMicros =
    counters.inputTokens * 20
    + cacheWrite5mTokens * 25
    + counters.cacheWrite1hTokens * 40
    + counters.cacheReadTokens * 2
    + counters.outputTokens * 100;
  return Math.round(quarterMicros / 4);
}

async function emitUsage(
  sink: ProviderUsageSink | undefined,
  input: Parameters<ProviderUsageSink>[0],
) {
  if (!sink) return;
  try {
    await sink(input);
  } catch (error) {
    console.error("[costs] provider usage sink rejected", {
      providerCategory: input.providerCategory,
      operation: input.operation,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

export async function callMeteredAnthropicText(
  input: MeteredAnthropicTextInput,
  dependencies: MeteredAnthropicCallDependencies = {},
): Promise<string | undefined> {
  const execute = dependencies.call ?? (async (request) => {
    const apiKey = dependencies.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("anthropic_api_key_missing");
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({
      apiKey,
      timeout: input.timeoutMs ?? 30_000,
      maxRetries: 1,
    });
    return client.messages.create(request);
  });
  const apiKey = dependencies.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!dependencies.call && !apiKey) {
    console.info(`[llm:${input.logLabel}] skipped: no ANTHROPIC_API_KEY`);
    return undefined;
  }

  const nowMs = dependencies.nowMs ?? Date.now;
  const startedAt = nowMs();
  try {
    const response = await execute(input.request);
    const textBlock = response.content.find((block) => block.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text : undefined;
    const counters = anthropicUsageCounters(response.usage);
    await emitUsage(input.usageContext?.sink, {
      userId: input.usageContext?.userId,
      pursuitId: input.usageContext?.pursuitId,
      jobId: input.usageContext?.jobId,
      providerCategory: "anthropic",
      operation: input.operation,
      modelVersion: response.model || String(input.request.model),
      requestCount: 1,
      inputTokens: counters.inputTokens,
      outputTokens: counters.outputTokens,
      cacheWriteTokens: counters.cacheWriteTokens,
      cacheReadTokens: counters.cacheReadTokens,
      resultCount: text?.trim() ? 1 : 0,
      durationMs: Math.max(0, Math.round(nowMs() - startedAt)),
      outcome: text?.trim() ? "success" : "empty",
      estimatedCostMicros: estimateAnthropicCostMicros(response.usage),
      rateCardVersion: ANTHROPIC_RATE_CARD_VERSION,
      requestCorrelationId:
        input.usageContext?.requestCorrelationId
        ?? response._request_id
        ?? undefined,
    });
    return text;
  } catch (error) {
    if (error instanceof Error && error.message === "anthropic_api_key_missing") {
      console.info(`[llm:${input.logLabel}] skipped: no ANTHROPIC_API_KEY`);
      return undefined;
    }
    await emitUsage(input.usageContext?.sink, {
      userId: input.usageContext?.userId,
      pursuitId: input.usageContext?.pursuitId,
      jobId: input.usageContext?.jobId,
      providerCategory: "anthropic",
      operation: input.operation,
      modelVersion: String(input.request.model),
      requestCount: 1,
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      resultCount: 0,
      durationMs: Math.max(0, Math.round(nowMs() - startedAt)),
      outcome: "failure",
      estimatedCostMicros: 0,
      rateCardVersion: ANTHROPIC_RATE_CARD_VERSION,
      requestCorrelationId: input.usageContext?.requestCorrelationId,
    });
    const providerError = error as {
      name?: string;
      status?: number;
    };
    console.error(`[llm:${input.logLabel}] call failed`, {
      name: providerError?.name,
      status: providerError?.status,
    });
    return undefined;
  }
}

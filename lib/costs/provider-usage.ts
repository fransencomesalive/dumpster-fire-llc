export const PROVIDER_CATEGORIES = [
  "anthropic",
  "exa",
] as const;

export type ProviderCategory = typeof PROVIDER_CATEGORIES[number];

export const PROVIDER_USAGE_OUTCOMES = [
  "success",
  "empty",
  "partial",
  "failure",
] as const;

export type ProviderUsageOutcome = typeof PROVIDER_USAGE_OUTCOMES[number];

export type ProviderUsageEventInput = {
  userId?: string;
  pursuitId?: string;
  jobId?: string;
  providerCategory: ProviderCategory;
  operation: string;
  modelVersion: string;
  requestCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  resultCount?: number;
  durationMs?: number;
  outcome: ProviderUsageOutcome;
  estimatedCostMicros: number;
  rateCardVersion: string;
  requestCorrelationId?: string;
};

export type ProviderUsageEventRecord = Required<
  Pick<
    ProviderUsageEventInput,
    | "providerCategory"
    | "operation"
    | "modelVersion"
    | "requestCount"
    | "inputTokens"
    | "outputTokens"
    | "cacheWriteTokens"
    | "cacheReadTokens"
    | "resultCount"
    | "outcome"
    | "estimatedCostMicros"
    | "rateCardVersion"
  >
> & Pick<
  ProviderUsageEventInput,
  "userId" | "pursuitId" | "jobId" | "durationMs" | "requestCorrelationId"
> & {
  id: string;
  createdAt: string;
};

export type ProviderUsageRepositoryRequest = <T>(
  resource: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    query?: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
) => Promise<T>;

export type ProviderUsageSink = (
  input: ProviderUsageEventInput,
) => Promise<void>;

type ProviderUsageEventRow = {
  id: string;
  user_id: string | null;
  pursuit_id: string | null;
  job_id: string | null;
  provider_category: string;
  operation: string;
  model_version: string;
  request_count: number;
  input_tokens: number | string;
  output_tokens: number | string;
  cache_write_tokens: number | string;
  cache_read_tokens: number | string;
  result_count: number;
  duration_ms: number | null;
  outcome: ProviderUsageOutcome;
  estimated_cost_micros: number | string;
  rate_card_version: string;
  request_correlation_id: string | null;
  created_at: string;
};

const CATEGORIES = new Set<string>(PROVIDER_CATEGORIES);
const OUTCOMES = new Set<string>(PROVIDER_USAGE_OUTCOMES);

function nonEmpty(value: string, field: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new TypeError(`${field} must not be empty`);
  return trimmed;
}

function nonNegativeInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative safe integer`);
  }
  return value;
}

function positiveInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive safe integer`);
  }
  return value;
}

function optionalNonEmpty(value: string | undefined, field: string) {
  if (value === undefined) return undefined;
  return nonEmpty(value, field);
}

function providerCategory(value: string) {
  if (!CATEGORIES.has(value)) {
    throw new TypeError("providerCategory is not supported");
  }
  return value as ProviderCategory;
}

function numericRowValue(value: number | string, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  return nonNegativeInteger(parsed, field);
}

export function providerUsageInsert(input: ProviderUsageEventInput) {
  providerCategory(input.providerCategory);
  if (!OUTCOMES.has(input.outcome)) {
    throw new TypeError("outcome is not supported");
  }

  return {
    user_id: optionalNonEmpty(input.userId, "userId"),
    pursuit_id: optionalNonEmpty(input.pursuitId, "pursuitId"),
    job_id: optionalNonEmpty(input.jobId, "jobId"),
    provider_category: input.providerCategory,
    operation: nonEmpty(input.operation, "operation"),
    model_version: nonEmpty(input.modelVersion, "modelVersion"),
    request_count: positiveInteger(input.requestCount ?? 1, "requestCount"),
    input_tokens: nonNegativeInteger(input.inputTokens ?? 0, "inputTokens"),
    output_tokens: nonNegativeInteger(input.outputTokens ?? 0, "outputTokens"),
    cache_write_tokens: nonNegativeInteger(input.cacheWriteTokens ?? 0, "cacheWriteTokens"),
    cache_read_tokens: nonNegativeInteger(input.cacheReadTokens ?? 0, "cacheReadTokens"),
    result_count: nonNegativeInteger(input.resultCount ?? 0, "resultCount"),
    duration_ms: input.durationMs === undefined
      ? undefined
      : nonNegativeInteger(input.durationMs, "durationMs"),
    outcome: input.outcome,
    estimated_cost_micros: nonNegativeInteger(
      input.estimatedCostMicros,
      "estimatedCostMicros",
    ),
    rate_card_version: nonEmpty(input.rateCardVersion, "rateCardVersion"),
    request_correlation_id: optionalNonEmpty(
      input.requestCorrelationId,
      "requestCorrelationId",
    ),
  };
}

function mapProviderUsageEvent(row: ProviderUsageEventRow): ProviderUsageEventRecord {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    pursuitId: row.pursuit_id ?? undefined,
    jobId: row.job_id ?? undefined,
    providerCategory: providerCategory(row.provider_category),
    operation: row.operation,
    modelVersion: row.model_version,
    requestCount: positiveInteger(row.request_count, "requestCount"),
    inputTokens: numericRowValue(row.input_tokens, "inputTokens"),
    outputTokens: numericRowValue(row.output_tokens, "outputTokens"),
    cacheWriteTokens: numericRowValue(row.cache_write_tokens, "cacheWriteTokens"),
    cacheReadTokens: numericRowValue(row.cache_read_tokens, "cacheReadTokens"),
    resultCount: nonNegativeInteger(row.result_count, "resultCount"),
    durationMs: row.duration_ms === null
      ? undefined
      : nonNegativeInteger(row.duration_ms, "durationMs"),
    outcome: row.outcome,
    estimatedCostMicros: numericRowValue(
      row.estimated_cost_micros,
      "estimatedCostMicros",
    ),
    rateCardVersion: row.rate_card_version,
    requestCorrelationId: row.request_correlation_id ?? undefined,
    createdAt: row.created_at,
  };
}

export async function recordProviderUsageEvent(
  request: ProviderUsageRepositoryRequest,
  input: ProviderUsageEventInput,
): Promise<ProviderUsageEventRecord> {
  const rows = await request<ProviderUsageEventRow[]>("provider_usage_events", {
    method: "POST",
    query: "?select=*",
    headers: { Prefer: "return=representation" },
    body: providerUsageInsert(input),
  });
  const row = rows[0];
  if (!row) throw new Error("Provider usage insert returned no row");
  return mapProviderUsageEvent(row);
}

export function createProviderUsageSink(
  request: ProviderUsageRepositoryRequest,
): ProviderUsageSink {
  return async (input) => {
    await recordProviderUsageEvent(request, input);
  };
}

export function createBestEffortProviderUsageSink(
  request: ProviderUsageRepositoryRequest,
  onError: (details: {
    providerCategory: ProviderCategory;
    operation: string;
    errorName: string;
  }) => void = (details) => console.error(
    "[costs] provider usage persistence failed",
    details,
  ),
): ProviderUsageSink {
  const sink = createProviderUsageSink(request);
  return async (input) => {
    try {
      await sink(input);
    } catch (error) {
      onError({
        providerCategory: input.providerCategory,
        operation: input.operation,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  };
}

const STORAGE_KEY = "dumpster-fire-qa-api-failures";
const MAX_FAILURES = 8;
const MAX_AGE_MS = 30 * 60 * 1000;

export type ClientApiFailureBreadcrumb = {
  occurred_at: string;
  route: string;
  method: string;
  status: number;
  error_code: string;
  request_id?: string;
  duration_ms?: number;
  pursuit_id?: string;
  job_id?: string;
  previous_message_id?: string;
  contact_ids?: string;
};

export function recordClientApiFailure(input: {
  path: string;
  method?: string;
  status?: number;
  body?: unknown;
  requestId?: string | null;
  durationMs?: number;
  requestBody?: unknown;
}) {
  if (typeof window === "undefined") return;
  const breadcrumb = sanitizeClientApiFailure(input);
  const current = readRecentClientApiFailures();
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...current, breadcrumb].slice(-MAX_FAILURES)));
  } catch {
    // Diagnostics are best effort and must never interfere with the user action.
  }
}

export function readRecentClientApiFailures(now = Date.now()): ClientApiFailureBreadcrumb[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => sanitizeStoredBreadcrumb(item))
      .filter((item): item is ClientApiFailureBreadcrumb => Boolean(item))
      .filter((item) => now - new Date(item.occurred_at).getTime() <= MAX_AGE_MS)
      .slice(-MAX_FAILURES);
  } catch {
    return [];
  }
}

export function sanitizeClientApiFailure(input: {
  path: string;
  method?: string;
  status?: number;
  body?: unknown;
  requestId?: string | null;
  durationMs?: number;
  requestBody?: unknown;
}): ClientApiFailureBreadcrumb {
  const request = object(input.requestBody);
  return compact({
    occurred_at: new Date().toISOString(),
    route: safeRoute(input.path),
    method: safeMethod(input.method),
    status: safeStatus(input.status),
    error_code: safeErrorCode(input.body, input.status),
    request_id: safeText(input.requestId, 200),
    duration_ms: safeDuration(input.durationMs),
    pursuit_id: safeIdentifier(request.pursuitId),
    job_id: safeIdentifier(request.jobId),
    previous_message_id: safeIdentifier(request.previousMessageId),
    contact_ids: safeIdentifierList(request.contactIds)
  });
}

function sanitizeStoredBreadcrumb(value: unknown): ClientApiFailureBreadcrumb | null {
  const input = object(value);
  const occurredAt = safeText(input.occurred_at, 40);
  if (!occurredAt || !Number.isFinite(new Date(occurredAt).getTime())) return null;
  return compact({
    occurred_at: occurredAt,
    route: safeRoute(input.route),
    method: safeMethod(input.method),
    status: safeStatus(input.status),
    error_code: safeText(input.error_code, 100) || "unknown_error",
    request_id: safeText(input.request_id, 200),
    duration_ms: safeDuration(input.duration_ms),
    pursuit_id: safeIdentifier(input.pursuit_id),
    job_id: safeIdentifier(input.job_id),
    previous_message_id: safeIdentifier(input.previous_message_id),
    contact_ids: safeText(input.contact_ids, 500)
  });
}

function safeRoute(value: unknown) {
  const text = safeText(value, 1000) || "unknown";
  try {
    return new URL(text, "https://local.invalid").pathname.slice(0, 500) || "unknown";
  } catch {
    return "unknown";
  }
}

function safeMethod(value: unknown) {
  const method = String(value || "GET").trim().toUpperCase();
  return /^[A-Z]{3,10}$/.test(method) ? method : "UNKNOWN";
}

function safeStatus(value: unknown) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 0 && status <= 599 ? status : 0;
}

function safeDuration(value: unknown) {
  const duration = Math.round(Number(value));
  return Number.isFinite(duration) && duration >= 0 ? Math.min(duration, 120_000) : undefined;
}

function safeErrorCode(body: unknown, status: unknown) {
  const source = object(body);
  for (const value of [source.error, source.status, source.code]) {
    const text = safeText(value, 100);
    if (text && /^[a-z0-9_.-]+$/i.test(text)) return text;
  }
  return Number(status) === 0 ? "network_error" : "http_error";
}

function safeIdentifier(value: unknown) {
  const text = safeText(value, 200);
  return text && /^[a-zA-Z0-9._:-]+$/.test(text) ? text : undefined;
}

function safeIdentifierList(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const ids = value.map(safeIdentifier).filter((item): item is string => Boolean(item)).slice(0, 8);
  return ids.length ? ids.join(",") : undefined;
}

function safeText(value: unknown, max: number) {
  if (typeof value !== "string") return undefined;
  const text = value.replaceAll(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : undefined;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

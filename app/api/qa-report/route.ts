export const dynamic = "force-dynamic";

const MESSAGE_MAX = 5000;
const CONTACT_MAX = 320;
const URL_MAX = 2000;
const BROWSER_MAX = 400;
const FAILURE_MAX = 8;
const DEVICES = new Set(["mobile", "tablet", "desktop"]);

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  const base = process.env.QA_AGENT_URL?.trim().replace(/\/+$/, "");
  if (!base) {
    return json(503, { ok: false, error: "qa_agent_unconfigured" });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const message = typeof input.user_message === "string" ? input.user_message.trim() : "";
  if (message.length === 0 || message.length > MESSAGE_MAX) {
    return json(400, { ok: false, error: "invalid_message" });
  }

  const context = (input.system_context && typeof input.system_context === "object"
    ? input.system_context
    : {}) as Record<string, unknown>;
  const systemContext: Record<string, unknown> = {
    app_version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "dev",
  };
  if (typeof context.url === "string" && context.url.length > 0) {
    systemContext.url = context.url.slice(0, URL_MAX);
  }
  if (typeof context.browser === "string" && context.browser.length > 0) {
    systemContext.browser = context.browser.slice(0, BROWSER_MAX);
  }
  if (typeof context.device === "string" && DEVICES.has(context.device)) {
    systemContext.device = context.device;
  }
  if (typeof context.signed_in === "boolean") {
    systemContext.signed_in = context.signed_in;
  }
  const recentFailures = sanitizeRecentFailures(context.recent_failures);
  if (recentFailures.length > 0) {
    systemContext.recent_failures = recentFailures;
  }

  const report: Record<string, unknown> = {
    source: "qa-feedback-widget",
    user_message: message,
    system_context: systemContext,
  };
  const contact = typeof input.user_contact === "string" ? input.user_contact.trim() : "";
  if (contact.length > 0) {
    report.user_contact = contact.slice(0, CONTACT_MAX);
  }

  try {
    const response = await fetch(`${base}/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return json(502, { ok: false, error: "qa_agent_unavailable" });
    }
    const result = (await response.json()) as { ticket_id?: string };
    return json(200, { ok: true, ticket_id: result.ticket_id ?? null });
  } catch {
    return json(502, { ok: false, error: "qa_agent_unavailable" });
  }
}

function sanitizeRecentFailures(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(-FAILURE_MAX).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const source = item as Record<string, unknown>;
    const route = safeString(source.route, 500);
    const occurredAt = safeString(source.occurred_at, 40);
    if (!route || !route.startsWith("/api/") || !occurredAt || !Number.isFinite(new Date(occurredAt).getTime())) return [];
    const status = Number(source.status);
    const duration = Number(source.duration_ms);
    return [Object.fromEntries(Object.entries({
      occurred_at: occurredAt,
      route,
      method: safeToken(source.method, 10),
      status: Number.isInteger(status) && status >= 0 && status <= 599 ? status : 0,
      error_code: safeToken(source.error_code, 100),
      request_id: safeToken(source.request_id, 200),
      duration_ms: Number.isFinite(duration) && duration >= 0 ? Math.min(Math.round(duration), 120_000) : undefined,
      pursuit_id: safeToken(source.pursuit_id, 200),
      job_id: safeToken(source.job_id, 200),
      previous_message_id: safeToken(source.previous_message_id, 200),
      contact_ids: safeIdentifierList(source.contact_ids, 500),
    }).filter(([, field]) => field !== undefined))];
  });
}

function safeString(value: unknown, max: number) {
  if (typeof value !== "string") return undefined;
  const text = value.replaceAll(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : undefined;
}

function safeToken(value: unknown, max: number) {
  const text = safeString(value, max);
  return text && /^[a-zA-Z0-9._:-]+$/.test(text) ? text : undefined;
}

function safeIdentifierList(value: unknown, max: number) {
  const text = safeString(value, max);
  return text && /^[a-zA-Z0-9._:,\-]+$/.test(text) ? text : undefined;
}

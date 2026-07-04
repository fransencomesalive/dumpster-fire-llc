export const dynamic = "force-dynamic";

const MESSAGE_MAX = 5000;
const CONTACT_MAX = 320;
const URL_MAX = 2000;
const BROWSER_MAX = 400;
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

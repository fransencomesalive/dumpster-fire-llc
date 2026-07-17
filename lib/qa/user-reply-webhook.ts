import crypto from "node:crypto";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export type ApprovedUserReply = {
  event: "user_reply.approved";
  ticket: { id: string; key: string; project_id: string };
  reply: { id: string; recipient: string; body: string };
};

type HandlerResult = { status: number; body: Record<string, unknown> };

export async function handleUserReplyWebhook({
  rawBody,
  headers,
  env,
  sendEmail,
  nowMs = Date.now(),
}: {
  rawBody: string;
  headers: Headers;
  env: NodeJS.ProcessEnv;
  sendEmail: (payload: ApprovedUserReply) => Promise<{ messageId?: string | null }>;
  nowMs?: number;
}): Promise<HandlerResult> {
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return failure(413, "payload_too_large");
  }
  const verified = verifySignature({ rawBody, headers, secret: env.QA_REPLY_WEBHOOK_SIGNING_SECRET, nowMs });
  if (!verified) return failure(401, "invalid_signature");

  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return failure(400, "invalid_json");
  }
  const payload = validatePayload(input, env.QA_REPLY_PROJECT_ID);
  if (!payload) return failure(400, "invalid_payload");

  try {
    const result = await sendEmail(payload);
    return { status: 202, body: { ok: true, accepted: true, message_id: result.messageId || null } };
  } catch {
    return failure(502, "email_delivery_failed");
  }
}

export function signApprovedReply({ rawBody, timestamp, secret }: { rawBody: string; timestamp: string; secret: string }) {
  return `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

function verifySignature({ rawBody, headers, secret, nowMs }: { rawBody: string; headers: Headers; secret?: string; nowMs: number }) {
  const event = headers.get("x-qa-agent-event");
  const timestamp = headers.get("x-qa-agent-timestamp") || "";
  const supplied = headers.get("x-qa-agent-signature") || "";
  const normalizedSecret = String(secret || "").trim();
  if (event !== "user_reply.approved" || normalizedSecret.length < 32 || !/^\d{10}$/.test(timestamp)) return false;
  const age = Math.abs(Math.floor(nowMs / 1000) - Number(timestamp));
  if (age > MAX_CLOCK_SKEW_SECONDS) return false;
  const expected = signApprovedReply({ rawBody, timestamp, secret: normalizedSecret });
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function validatePayload(value: unknown, expectedProjectId?: string): ApprovedUserReply | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (!payload.ticket || typeof payload.ticket !== "object" || Array.isArray(payload.ticket)) return null;
  if (!payload.reply || typeof payload.reply !== "object" || Array.isArray(payload.reply)) return null;
  const ticket = payload.ticket as Record<string, unknown>;
  const reply = payload.reply as Record<string, unknown>;
  if (![ticket.id, ticket.key, ticket.project_id, reply.id, reply.recipient, reply.body].every((item) => typeof item === "string")) return null;
  const projectId = ticket.project_id as string;
  const recipient = reply.recipient as string;
  const body = reply.body as string;
  const replyId = reply.id as string;
  if (payload.event !== "user_reply.approved" || !expectedProjectId || projectId !== expectedProjectId) return null;
  if (!ID_PATTERN.test(ticket.id as string) || !/^JOB-\d+$/.test(ticket.key as string)) return null;
  if (!ID_PATTERN.test(replyId) || recipient.length > 320 || !EMAIL_PATTERN.test(recipient)) return null;
  if (!body.trim() || body.length > 5000) return null;
  return {
    event: "user_reply.approved",
    ticket: { id: ticket.id as string, key: ticket.key as string, project_id: projectId },
    reply: { id: replyId, recipient, body },
  };
}

function failure(status: number, error: string): HandlerResult {
  return { status, body: { ok: false, error } };
}

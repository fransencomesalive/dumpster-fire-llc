import { sendApprovedUserReply } from "@/lib/qa/user-reply-email";
import { handleUserReplyWebhook } from "@/lib/qa/user-reply-webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 16 * 1024) {
    return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }
  const rawBody = await request.text();
  const result = await handleUserReplyWebhook({
    rawBody,
    headers: request.headers,
    env: process.env,
    sendEmail: (payload) => sendApprovedUserReply(payload),
  });
  return Response.json(result.body, { status: result.status });
}

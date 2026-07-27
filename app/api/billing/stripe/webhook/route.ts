import { handleStripeWebhook } from "@/lib/billing/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 512 * 1024) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 512 * 1024) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }
  const response = await handleStripeWebhook({
    rawBody,
    signature: request.headers.get("stripe-signature"),
  });
  return Response.json(response.body, {
    status: response.status,
    headers: { "Cache-Control": "no-store" },
  });
}

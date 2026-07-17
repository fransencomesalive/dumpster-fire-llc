import assert from "node:assert/strict";
import { handleUserReplyWebhook, signApprovedReply, type ApprovedUserReply } from "../lib/qa/user-reply-webhook";
import { buildApprovedUserReplyEmail } from "../lib/qa/user-reply-email";

const secret = "0123456789abcdef0123456789abcdef";
const timestamp = "1784253600";
const payload: ApprovedUserReply = {
  event: "user_reply.approved",
  ticket: { id: "f01bbde9-3b6e-4dda-a9ff-0a491148b784", key: "JOB-017", project_id: "the-job-market-is-a-dumpster-fire" },
  reply: { id: "a01bbde9-3b6e-4dda-a9ff-0a491148b785", recipient: "reporter@example.com", body: "Approved reply." },
};
const rawBody = JSON.stringify(payload);
assert.equal(
  signApprovedReply({ rawBody, timestamp, secret }),
  "sha256=b6161d060ef23a6b75234f37164c735a572039821d4cb9506c419622312bcfec",
);
const env: NodeJS.ProcessEnv = {
  ...process.env,
  QA_REPLY_WEBHOOK_SIGNING_SECRET: secret,
  QA_REPLY_PROJECT_ID: payload.ticket.project_id,
};

function signedHeaders(body = rawBody, at = timestamp) {
  return new Headers({
    "x-qa-agent-event": "user_reply.approved",
    "x-qa-agent-timestamp": at,
    "x-qa-agent-signature": signApprovedReply({ rawBody: body, timestamp: at, secret }),
  });
}

async function main() {
  let deliveries = 0;
  const accepted = await handleUserReplyWebhook({
    rawBody,
    headers: signedHeaders(),
    env,
    nowMs: Number(timestamp) * 1000,
    sendEmail: async (input) => {
      deliveries += 1;
      assert.deepEqual(input, payload);
      return { messageId: "provider-message" };
    },
  });
  assert.equal(accepted.status, 202);
  assert.equal(deliveries, 1);

  for (const result of [
    await handleUserReplyWebhook({ rawBody, headers: new Headers(), env, nowMs: Number(timestamp) * 1000, sendEmail: async () => ({}) }),
    await handleUserReplyWebhook({ rawBody, headers: signedHeaders(rawBody, "1784250000"), env, nowMs: Number(timestamp) * 1000, sendEmail: async () => ({}) }),
    await handleUserReplyWebhook({ rawBody: `${rawBody} `, headers: signedHeaders(), env, nowMs: Number(timestamp) * 1000, sendEmail: async () => ({}) }),
  ]) {
    assert.equal(result.status, 401);
  }

  const wrongProjectBody = JSON.stringify({ ...payload, ticket: { ...payload.ticket, project_id: "another-project" } });
  const wrongProject = await handleUserReplyWebhook({
    rawBody: wrongProjectBody,
    headers: signedHeaders(wrongProjectBody),
    env,
    nowMs: Number(timestamp) * 1000,
    sendEmail: async () => ({ messageId: null }),
  });
  assert.equal(wrongProject.status, 400);

  for (const invalidReply of [
    { ...payload.reply, recipient: "first@example.com,second@example.com" },
    { ...payload.reply, recipient: "Group:first@example.com;" },
    { ...payload.reply, body: ["not", "text"] },
  ]) {
    const invalidBody = JSON.stringify({ ...payload, reply: invalidReply });
    const invalid = await handleUserReplyWebhook({
      rawBody: invalidBody,
      headers: signedHeaders(invalidBody),
      env,
      nowMs: Number(timestamp) * 1000,
      sendEmail: async () => ({ messageId: null }),
    });
    assert.equal(invalid.status, 400);
  }

  const providerFailure = await handleUserReplyWebhook({
    rawBody,
    headers: signedHeaders(),
    env,
    nowMs: Number(timestamp) * 1000,
    sendEmail: async () => { throw new Error("provider failed"); },
  });
  assert.equal(providerFailure.status, 502);

  const email = buildApprovedUserReplyEmail(payload, {
    ...process.env,
    RESEND_API_KEY: "re_test",
    QA_REPLY_FROM: "Phred <phred@example.com>",
    QA_REPLY_SUBJECT_PREFIX: "Reply",
    QA_REPLY_REPLY_TO: "support@example.com",
  });
  assert.deepEqual(email.transportOptions, {
    host: "smtp.resend.com",
    port: 465,
    secure: true,
    auth: { user: "resend", pass: "re_test" },
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 8000,
  });
  assert.equal(email.message.subject, "Reply JOB-017");
  assert.equal(email.message.headers["Resend-Idempotency-Key"], `qa-reply/${payload.reply.id}`);

  console.log("QA user reply webhook tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

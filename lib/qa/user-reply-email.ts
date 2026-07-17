import nodemailer from "nodemailer";
import type { ApprovedUserReply } from "./user-reply-webhook";

export async function sendApprovedUserReply(payload: ApprovedUserReply, env: NodeJS.ProcessEnv = process.env) {
  const { transportOptions, message } = buildApprovedUserReplyEmail(payload, env);
  const transport = nodemailer.createTransport(transportOptions);
  const info = await transport.sendMail(message);
  return { messageId: info.messageId || null };
}

export function buildApprovedUserReplyEmail(payload: ApprovedUserReply, env: NodeJS.ProcessEnv) {
  const apiKey = required(env.RESEND_API_KEY, "RESEND_API_KEY");
  const from = safeHeader(required(env.QA_REPLY_FROM, "QA_REPLY_FROM"), "QA_REPLY_FROM");
  const subjectPrefix = safeHeader(required(env.QA_REPLY_SUBJECT_PREFIX, "QA_REPLY_SUBJECT_PREFIX"), "QA_REPLY_SUBJECT_PREFIX");
  const replyTo = env.QA_REPLY_REPLY_TO?.trim()
    ? safeHeader(env.QA_REPLY_REPLY_TO.trim(), "QA_REPLY_REPLY_TO")
    : undefined;
  return {
    transportOptions: {
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      auth: { user: "resend", pass: apiKey },
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 8000,
    },
    message: {
      from,
      to: payload.reply.recipient,
      subject: `${subjectPrefix} ${payload.ticket.key}`,
      text: payload.reply.body,
      replyTo,
      headers: { "Resend-Idempotency-Key": `qa-reply/${payload.reply.id}` },
    },
  };
}

function required(value: string | undefined, name: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function safeHeader(value: string, name: string) {
  if (!value || value.length > 320 || /[\r\n]/.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

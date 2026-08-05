import assert from "node:assert/strict";
import {
  recordClientApiFailure,
  readRecentClientApiFailures,
  sanitizeClientApiFailure,
} from "../lib/qa/client-diagnostics.ts";
import { POST as submitQaReport } from "../app/api/qa-report/route.ts";

const storage = new Map();
globalThis.window = {
  sessionStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  },
};

const sanitized = sanitizeClientApiFailure({
  path: "https://example.com/api/public-profile/pursuits/outreach?token=secret",
  method: "post",
  status: 502,
  body: { error: "outreach_unavailable", private: "do not store" },
  requestId: "iad1::request-1",
  durationMs: 1450,
  requestBody: {
    pursuitId: "pursuit-1",
    contactIds: ["contact-1", "contact-2"],
    privateMessage: "must not persist",
  },
});
assert.deepEqual(sanitized, {
  occurred_at: sanitized.occurred_at,
  route: "/api/public-profile/pursuits/outreach",
  method: "POST",
  status: 502,
  error_code: "outreach_unavailable",
  request_id: "iad1::request-1",
  duration_ms: 1450,
  pursuit_id: "pursuit-1",
  contact_ids: "contact-1,contact-2",
});
assert.equal(JSON.stringify(sanitized).includes("secret"), false);
assert.equal(JSON.stringify(sanitized).includes("privateMessage"), false);

recordClientApiFailure({
  path: "/api/public-profile/pursuits/outreach",
  method: "POST",
  status: 500,
  body: { error: "generation_failed" },
  requestId: "request-500",
  requestBody: { pursuitId: "pursuit-2", contactIds: ["contact-3"] },
});
const recorded = readRecentClientApiFailures();
assert.equal(recorded.length, 1);
assert.equal(recorded[0].route, "/api/public-profile/pursuits/outreach");
assert.equal(recorded[0].request_id, "request-500");
assert.equal(recorded[0].pursuit_id, "pursuit-2");

let forwarded;
const originalFetch = globalThis.fetch;
process.env.QA_AGENT_URL = "https://relay.example.com";
globalThis.fetch = async (_url, options) => {
  forwarded = JSON.parse(options.body);
  return Response.json({ ok: true, ticket_id: "JOB-TEST" });
};
const response = await submitQaReport(new Request("https://app.example.com/api/qa-report", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    user_message: "Outreach failed",
    system_context: {
      url: "https://app.example.com/saved-pursuits",
      recent_failures: [
        recorded[0],
        { route: "https://evil.example.com/not-api", occurred_at: new Date().toISOString() },
        { route: "/api/private", occurred_at: "not-a-date", token: "secret" },
      ],
    },
  }),
}));
assert.equal(response.status, 200);
assert.equal(forwarded.system_context.recent_failures.length, 1);
assert.equal(forwarded.system_context.recent_failures[0].route, "/api/public-profile/pursuits/outreach");
assert.equal(JSON.stringify(forwarded).includes("fixture-token"), false);
assert.equal(JSON.stringify(forwarded).includes("secret"), false);

globalThis.fetch = originalFetch;
delete globalThis.window;
delete process.env.QA_AGENT_URL;
console.log("QA diagnostic breadcrumb tests passed.");

import assert from "node:assert/strict";
import {
  buildOutreachUserPrompt,
  generateOutreachMessage,
  generateOutreachMessageForUser,
  outreachHardRuleViolations,
  parseOutreachRequest,
} from "../lib/public-profile/outreach-generator.ts";
import { completeCandidateProfileAggregate } from "./fixtures/public-profile.ts";

const now = "2026-06-27T00:00:00.000Z";

const job = { title: "Program Director", company: "Useful Studio", description: "Lead ambiguous cross-functional delivery." };
const contact = { name: "Dana", role: "Hiring Manager", seniority: "Director" };

// Hard-rule-compliant fixture: no em dash, no numbers absent from the profile, and the
// inserted example's link appears in the body (the v4 contract).
const modelJson = JSON.stringify({
  message: "Hi Dana, systems before acceleration is how I run delivery; the write-up lives at https://example.com/phred. Would love to talk about the Program Director role.",
  insertedExample: { oneHitter: "Cut workflow turnaround 40% in two quarters.", link: "https://example.com/phred" },
});

// 1. Parses a well-formed model response.
const generated = await generateOutreachMessage(
  { profileMarkdown: "# Candidate Profile\n## Voice Profile\nDirect.", job, contact },
  { callModel: async () => modelJson },
);
assert.ok(generated);
assert.match(generated.message, /Program Director role/);
assert.ok(generated.insertedExample);
assert.equal(generated.insertedExample.oneHitter, "Cut workflow turnaround 40% in two quarters.");
assert.equal(generated.insertedExample.link, "https://example.com/phred");

// 2. The user prompt carries profile + job + contact.
const prompt = buildOutreachUserPrompt({ profileMarkdown: "PROFILE_MD", job, contact });
assert.match(prompt, /PROFILE_MD/);
assert.match(prompt, /Program Director/);
assert.match(prompt, /Hiring Manager/);
assert.match(prompt, /Dana/);

// 2b. Prompt caching: profile.md is passed as the cacheable prefix; the per-message
// job + contact are the uncached tail. (No message reuse — every message is fresh.)
let capturedArgs;
await generateOutreachMessage(
  { profileMarkdown: "PROFILE_MD_XYZ", job, contact },
  { callModel: async (args) => { capturedArgs = args; return modelJson; } },
);
assert.ok(capturedArgs.cachePrefix.includes("PROFILE_MD_XYZ"), "profile.md goes in the cached prefix");
assert.ok(!capturedArgs.user.includes("PROFILE_MD_XYZ"), "tail must not repeat profile.md");
assert.match(capturedArgs.user, /Program Director/);
assert.match(capturedArgs.user, /Dana/);

// 3. insertedExample: null is honored; fences are tolerated.
const noExample = await generateOutreachMessage(
  { profileMarkdown: "x", job, contact },
  { callModel: async () => "```json\n" + JSON.stringify({ message: "Hello there.", insertedExample: null }) + "\n```" },
);
assert.ok(noExample);
assert.equal(noExample.insertedExample, null);

// 4. Graceful degradation: no model output / malformed -> undefined.
assert.equal(await generateOutreachMessage({ profileMarkdown: "x", job, contact }, { callModel: async () => undefined }), undefined);
assert.equal(await generateOutreachMessage({ profileMarkdown: "x", job, contact }, { callModel: async () => "not json" }), undefined);

// 4b. Hard-rule contract: violating responses are regenerated; a compliant retry wins.
const emDashJson = JSON.stringify({ message: "Hi Dana — direct note about the role.", insertedExample: null });
const cleanJson = JSON.stringify({ message: "Hi Dana, direct note about the role.", insertedExample: null });
{
  const responses = [emDashJson, cleanJson];
  let calls = 0;
  const retried = await generateOutreachMessage(
    { profileMarkdown: "x", job, contact },
    { callModel: async () => { calls += 1; return responses.shift(); } },
  );
  assert.equal(calls, 2, "violating first attempt must trigger a retry");
  assert.ok(retried);
  assert.equal(retried.message.includes("—"), false);
}

// 4c. Hard-rule contract: after exhausting attempts, the best near-miss is returned.
{
  let calls = 0;
  const stubborn = await generateOutreachMessage(
    { profileMarkdown: "x", job, contact },
    { callModel: async () => { calls += 1; return emDashJson; } },
  );
  assert.equal(calls, 3, "retries are bounded");
  assert.ok(stubborn, "a near-miss beats returning nothing");
  assert.match(stubborn.message, /direct note/);
}

// 4d. Violation detection: cap, em dash, missing example link, ungrounded numbers.
const profileWithNumbers = "## Résumé\n- Cut workflow turnaround 40% in two quarters (15+ years).";
assert.deepEqual(outreachHardRuleViolations({ message: "Hi Dana, I cut turnaround 40% and the write-up is at https://x.co/a. Worth a chat?", insertedExample: { oneHitter: "x", link: "https://x.co/a" } }, profileWithNumbers), []);
assert.ok(outreachHardRuleViolations({ message: "x".repeat(751), insertedExample: null }, profileWithNumbers)[0].startsWith("over_750_characters"));
assert.deepEqual(outreachHardRuleViolations({ message: "Hi — there.", insertedExample: null }, profileWithNumbers), ["em_dash_present"]);
assert.deepEqual(outreachHardRuleViolations({ message: "No link here.", insertedExample: { oneHitter: "x", link: "https://x.co/a" } }, profileWithNumbers), ["example_link_missing_from_body"]);
assert.deepEqual(outreachHardRuleViolations({ message: "I wrangled forty docs.", insertedExample: null }, profileWithNumbers), ["ungrounded_numbers(forty)"]);
// "15+" in the profile grounds the digits 15, but not the word "fifteen".
assert.deepEqual(outreachHardRuleViolations({ message: "Spent 15 years doing this.", insertedExample: null }, profileWithNumbers), []);
assert.deepEqual(outreachHardRuleViolations({ message: "Spent fifteen years doing this.", insertedExample: null }, profileWithNumbers), ["ungrounded_numbers(fifteen)"]);

// 5. Request validation.
const badRequest = parseOutreachRequest({ job: { title: "" }, contact: {} });
assert.equal(badRequest.ok, false);
if (!badRequest.ok) {
  assert.ok(badRequest.issues.some((issue) => issue.field === "job.title"));
  assert.ok(badRequest.issues.some((issue) => issue.field === "job.company"));
  assert.ok(badRequest.issues.some((issue) => issue.field === "contact.role"));
}
const goodRequest = parseOutreachRequest({ job, contact });
assert.equal(goodRequest.ok, true);
if (goodRequest.ok) {
  assert.equal(goodRequest.value.job.title, "Program Director");
  assert.equal(goodRequest.value.contact.role, "Hiring Manager");
}

// 6. Service-for-user status mapping.
const notFound = await generateOutreachMessageForUser({ loadAggregate: async () => undefined }, "user-404", { job, contact });
assert.equal(notFound.status, "not_found");

const incompleteAgg = completeCandidateProfileAggregate(now);
incompleteAgg.profile.generatedMarkdown = "";
const incomplete = await generateOutreachMessageForUser({ loadAggregate: async () => incompleteAgg }, "user-1", { job, contact });
assert.equal(incomplete.status, "profile_incomplete");

const modelDown = await generateOutreachMessageForUser(
  { loadAggregate: async () => completeCandidateProfileAggregate(now), callModel: async () => undefined },
  "user-1",
  { job, contact },
);
assert.equal(modelDown.status, "model_unavailable");

const ok = await generateOutreachMessageForUser(
  { loadAggregate: async () => completeCandidateProfileAggregate(now), callModel: async () => modelJson },
  "user-1",
  { job, contact },
);
assert.equal(ok.status, "generated");
if (ok.status === "generated") {
  assert.match(ok.outreach.message, /Program Director role/);
  assert.ok(ok.outreach.insertedExample);
}

console.log("public profile outreach: all assertions passed");

import assert from "node:assert/strict";
import {
  buildOutreachUserPrompt,
  generateOutreachMessage,
  generateOutreachMessageForUser,
  parseOutreachRequest,
} from "../lib/public-profile/outreach-generator.ts";
import { completeCandidateProfileAggregate } from "./fixtures/public-profile.ts";

const now = "2026-06-27T00:00:00.000Z";

const job = { title: "Program Director", company: "Useful Studio", description: "Lead ambiguous cross-functional delivery." };
const contact = { name: "Dana", role: "Hiring Manager", seniority: "Director" };

const modelJson = JSON.stringify({
  message: "Hi Dana — I cut workflow turnaround 40% in two quarters; would love to talk about the Program Director role.",
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

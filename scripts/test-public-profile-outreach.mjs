import assert from "node:assert/strict";
import {
  buildOutreachUserPrompt,
  generateOutreachMessage,
  generateOutreachMessageOutcome,
  generateOutreachMessageForUser,
  outreachHardRuleViolations,
  parseOutreachRequest,
} from "../lib/public-profile/outreach-generator.ts";
import { completeCandidateProfileAggregate } from "./fixtures/public-profile.ts";

const now = "2026-06-27T00:00:00.000Z";

const job = { title: "Program Director", company: "Useful Studio", description: "Lead ambiguous cross-functional delivery." };
const contact = { name: "Dana", role: "Hiring Manager", seniority: "Director" };
const profileMarkdown = [
  "# Candidate Profile",
  "## Voice Profile",
  "Direct.",
  "## Work Examples",
  "Cut workflow turnaround 40% in two quarters.",
  "https://example.com/phred",
].join("\n");

// Hard-rule-compliant fixture: no em dash, no numbers absent from the profile, and the
// inserted example's link appears in the body (the v4 contract).
const modelJson = JSON.stringify({
  message: "Hi Dana, systems before acceleration is how I run delivery; the write-up lives at https://example.com/phred. Would love to talk about the Program Director role.",
  insertedExample: { oneHitter: "Cut workflow turnaround 40% in two quarters.", link: "https://example.com/phred" },
});

// 1. Parses a well-formed model response.
const generated = await generateOutreachMessage(
  { profileMarkdown, job, contact },
  { callModel: async () => modelJson },
);
assert.ok(generated);
assert.match(generated.message, /Program Director role/);
assert.ok(generated.insertedExample);
assert.equal(generated.insertedExample.oneHitter, "Cut workflow turnaround 40% in two quarters.");
assert.equal(generated.insertedExample.link, "https://example.com/phred");

// 2. The user prompt carries profile + selected role track + job + contact. Other tracks can
// remain in the full profile as factual history, but they are not alternate application titles.
const prompt = buildOutreachUserPrompt({
  profileMarkdown: "PROFILE_MD\n## Role Tracks\n### Executive Producer\nTarget titles:\n- Executive Producer",
  roleTrack: {
    name: "Program Director",
    targetTitles: ["Program Director", "Program Operations Lead"],
    otherTrackTitles: ["Executive Producer"],
  },
  job,
  contact,
});
assert.match(prompt, /PROFILE_MD/);
assert.match(prompt, /Program Director/);
assert.match(prompt, /Program Operations Lead/);
assert.match(prompt, /Do not describe the candidate using titles from any other Role Track/);
assert.match(prompt, /Hiring Manager/);
assert.match(prompt, /Dana/);

const regenerationPrompt = buildOutreachUserPrompt({
  profileMarkdown: "PROFILE_MD",
  job,
  contact,
  previousMessage: "Hi Dana, this is the previous draft.",
});
assert.match(regenerationPrompt, /Previous draft to replace/);
assert.match(regenerationPrompt, /this is the previous draft/);
assert.match(regenerationPrompt, /meaningfully revised alternative/);

const selectedEvidence = {
  id: "example-phred",
  profileId: "profile-1",
  title: "Workflow system",
  oneHitter: "Cut workflow turnaround 40% in two quarters.",
  link: "https://example.com/phred",
  context: "Built an internal workflow system for ambiguous cross-functional delivery.",
  createdAt: now,
  updatedAt: now,
};
const evidenceDecision = {
  selected: selectedEvidence,
  relevanceScore: 0.45,
  matchedSignals: ["ambiguous cross-functional delivery"],
  responsibilityMatchedSignals: [],
  requiredExperienceMatchedSignals: [],
  recentUsageCount: 0,
  consideredCount: 4,
  comparableCandidateCount: 2,
  diversityAffectedSelection: false,
  candidates: [],
};
const evidencePrompt = buildOutreachUserPrompt({
  profileMarkdown,
  job,
  contact,
  evidenceDecision,
  recentMessages: ["I previously described a different delivery system in this exact sentence."],
  companionMessages: ["I used the strongest job evidence in a note to another contact."],
});
assert.match(evidencePrompt, /Job-specific Work Example decision/);
assert.match(evidencePrompt, /Selected ID: example-phred/);
assert.match(evidencePrompt, /Recent outreach language to avoid repeating/);
assert.match(evidencePrompt, /different delivery system/);
assert.match(evidencePrompt, /Other drafts for this same job/);
assert.match(evidencePrompt, /Shared job facts and the strongest relevant evidence may repeat/);

const requiredEvidenceDecision = {
  ...evidenceDecision,
  matchedSignals: ["AI"],
  requiredExperienceMatchedSignals: ["AI"],
};
const structuredJob = {
  ...job,
  responsibilities: ["Own planning cycles and executive reporting."],
  requiredExperience: ["Use automation and AI-enabled tools to simplify operational workflows."],
};
const structuredPrompt = buildOutreachUserPrompt({
  profileMarkdown,
  job: structuredJob,
  contact,
  evidenceDecision: requiredEvidenceDecision,
});
assert.match(structuredPrompt, /Required Experience:/);
assert.match(structuredPrompt, /AI-enabled tools/);
assert.match(structuredPrompt, /Matched Required Experience signals: AI/);
assert.match(structuredPrompt, /MUST use this selected Work Example and address at least one/);

// 2b. Prompt caching: profile.md is passed as the cacheable prefix; the per-message
// job + contact are the uncached tail. (No message reuse — every message is fresh.)
let capturedArgs;
await generateOutreachMessage(
  { profileMarkdown: "PROFILE_MD_XYZ", job, contact },
  { callModel: async (args) => {
    capturedArgs = args;
    return JSON.stringify({ message: "Hi Dana, direct note about the role.", insertedExample: null });
  } },
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
assert.equal(
  (await generateOutreachMessageOutcome(
    { profileMarkdown: "x", job, contact },
    { callModel: async () => "not json" },
  )).status,
  "invalid_output",
);

// 4b. Hard-rule contract: violating responses are regenerated; a compliant retry wins.
const emDashJson = JSON.stringify({ message: "Hi Dana — direct note about the role.", insertedExample: null });
const cleanJson = JSON.stringify({ message: "Hi Dana, direct note about the role.", insertedExample: null });
{
  const responses = [emDashJson, cleanJson];
  const prompts = [];
  let calls = 0;
  const retried = await generateOutreachMessage(
    { profileMarkdown: "x", job, contact },
    { callModel: async (args) => { calls += 1; prompts.push(args.user); return responses.shift(); } },
  );
  assert.equal(calls, 2, "violating first attempt must trigger a retry");
  assert.doesNotMatch(prompts[0], /Required correction/);
  assert.match(prompts[1], /em_dash_present/, "the retry must explain why the prior draft was rejected");
  assert.ok(retried);
  assert.equal(retried.message.includes("—"), false);
}

// 4bb. The production failure class gets a corrective retry rather than three
// identical calls that repeat invented counts.
{
  const inventedCounts = JSON.stringify({
    message: "Hi Dana, I have wrangled a dozen programs across four teams.",
    insertedExample: null,
  });
  const responses = [inventedCounts, cleanJson];
  const prompts = [];
  const corrected = await generateOutreachMessage(
    { profileMarkdown: "No numeric claims in this profile.", job, contact },
    { callModel: async (args) => { prompts.push(args.user); return responses.shift(); } },
  );
  assert.ok(corrected);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /ungrounded_numbers\(dozen\/four\)/);
  assert.match(prompts[1], /Do not repeat the rejected wording/);
}

// 4c. Role-track isolation is enforced after generation, not left to prompt compliance alone.
{
  const responses = [
    JSON.stringify({ message: "Hi Dana, my Executive Producer background maps well to this work.", insertedExample: null }),
    JSON.stringify({ message: "Hi Dana, my program leadership background maps well to this work.", insertedExample: null }),
  ];
  let calls = 0;
  const trackScoped = await generateOutreachMessage(
    {
      profileMarkdown: "## Role Tracks\n### Executive Producer\n### Program Director",
      roleTrack: {
        name: "Program Director",
        targetTitles: ["Program Director"],
        otherTrackTitles: ["Executive Producer"],
      },
      job,
      contact,
    },
    { callModel: async () => { calls += 1; return responses.shift(); } },
  );
  assert.equal(calls, 2, "an alternate Role Track title must trigger a retry");
  assert.ok(trackScoped);
  assert.equal(trackScoped.message.includes("Executive Producer"), false);
}

// 4cc. The job-aware decision rejects a different example and accepts the ranked example.
{
  const wrongExample = JSON.stringify({
    message: "Hi Dana, I have relevant delivery experience at https://example.com/other.",
    insertedExample: { id: "other", oneHitter: "Other example.", link: "https://example.com/other" },
  });
  const selectedExample = JSON.stringify({
    message: "Hi Dana, I built a relevant workflow system at https://example.com/phred.",
    insertedExample: {
      id: "example-phred",
      oneHitter: "Cut workflow turnaround 40% in two quarters.",
      link: "https://example.com/phred",
    },
  });
  const responses = [wrongExample, selectedExample];
  const prompts = [];
  const result = await generateOutreachMessage(
    {
      profileMarkdown: `${profileMarkdown}\nOther example.\nhttps://example.com/other`,
      job,
      contact,
      evidenceDecision,
    },
    { callModel: async (args) => { prompts.push(args.user); return responses.shift(); } },
  );
  assert.ok(result);
  assert.equal(result.insertedExample?.id, "example-phred");
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /work_example_does_not_match_job_selection/);
  assert.match(prompts[1], /Rejected draft/);
}

// 4cd. An inventory with no relevant example cannot be bent into the message.
{
  const noRelevantDecision = {
    ...evidenceDecision,
    selected: undefined,
    relevanceScore: undefined,
    matchedSignals: [],
    responsibilityMatchedSignals: [],
    requiredExperienceMatchedSignals: [],
    comparableCandidateCount: 0,
  };
  const violations = outreachHardRuleViolations(
    {
      message: "Hi Dana, see https://example.com/phred.",
      insertedExample: {
        id: "example-phred",
        oneHitter: "Cut workflow turnaround 40% in two quarters.",
        link: "https://example.com/phred",
      },
    },
    profileMarkdown,
    { job, contact, evidenceDecision: noRelevantDecision },
  );
  assert.ok(violations.includes("work_example_not_relevant_to_job"));
}

// 4cf. A selected example that supports a stated requirement cannot be ignored.
{
  const missingRequirement = outreachHardRuleViolations(
    { message: "Hi Dana, I build clear operating rhythms for complex programs.", insertedExample: null },
    profileMarkdown,
    { job: structuredJob, contact, evidenceDecision: requiredEvidenceDecision },
  );
  assert.ok(missingRequirement.includes("matched_requirement_missing"));
  assert.ok(missingRequirement.includes("matched_requirement_example_missing"));
  const requirementAddressed = outreachHardRuleViolations(
    { message: "Hi Dana, I use AI to keep complex program workflows connected.", insertedExample: null },
    profileMarkdown,
    { job: structuredJob, contact, evidenceDecision: requiredEvidenceDecision },
  );
  assert.equal(requirementAddressed.includes("matched_requirement_missing"), false);
  assert.ok(requirementAddressed.includes("matched_requirement_example_missing"));
  const requirementExampleUsed = outreachHardRuleViolations(
    {
      message: "Hi Dana, I use AI to keep complex program workflows connected. https://example.com/phred",
      insertedExample: {
        id: selectedEvidence.id,
        oneHitter: selectedEvidence.oneHitter,
        link: selectedEvidence.link,
      },
    },
    profileMarkdown,
    { job: structuredJob, contact, evidenceDecision: requiredEvidenceDecision },
  );
  assert.equal(requirementExampleUsed.includes("matched_requirement_missing"), false);
  assert.equal(requirementExampleUsed.includes("matched_requirement_example_missing"), false);
}

// 4cg. Structural repetition is rejected even when the model swaps vocabulary.
{
  const repeatedStructure = outreachHardRuleViolations(
    {
      message: "Hi Dana. What pulls me in here is the operating challenge. Most of my career has been this kind of work. I'm happiest bringing order to it. Would love to talk.",
      insertedExample: null,
    },
    "Most of my career is program work.",
    {
      job,
      contact,
      recentMessages: [
        "Hi Lee. The systems part caught my eye. I'm a generalist who's happiest making the pieces connect. Would love to talk.",
      ],
    },
  );
  assert.ok(repeatedStructure.includes("repeated_recent_structure"));
}

// 4ch. Reusing multiple marquee credentials is rejected even when the surrounding prose changes.
{
  const repeatedEvidence = outreachHardRuleViolations(
    {
      message: "Hi Dana, Swift taught me the operating cadence, and AKQA sharpened how I align senior teams.",
      insertedExample: null,
    },
    "Swift and AKQA are verified resume employers.",
    {
      job,
      contact,
      recentMessages: [
        "Hi Lee, I managed a major retainer at Swift and won new accounts while leading programs at AKQA.",
      ],
    },
  );
  assert.ok(repeatedEvidence.includes("repeated_recent_evidence"));

  const singleRelevantCredential = outreachHardRuleViolations(
    {
      message: "Hi Dana, Swift is the most relevant operating example for this role.",
      insertedExample: null,
    },
    "Swift is a verified resume employer.",
    {
      job,
      contact,
      recentMessages: ["Hi Lee, I managed a major retainer at Swift while leading programs at AKQA."],
    },
  );
  assert.equal(singleRelevantCredential.includes("repeated_recent_evidence"), false);

  const sameJobCompanion = outreachHardRuleViolations(
    {
      message: "Hi Dana, Swift taught me the operating cadence, and AKQA sharpened how I align senior teams.",
      insertedExample: null,
    },
    "Swift and AKQA are verified resume employers.",
    {
      job,
      contact,
      companionMessages: [
        "Hi Lee, I managed a major retainer at Swift and won new accounts while leading programs at AKQA.",
      ],
    },
  );
  assert.equal(sameJobCompanion.includes("repeated_recent_evidence"), false, "same-job evidence is soft context, not a hard rejection");
}

// 4ce. Distinctive recent language is rejected, while a fresh rewrite succeeds.
{
  const repeated = JSON.stringify({
    message: "Hi Dana, I turn tangled approval chains into clear operating decisions without adding ceremony.",
    insertedExample: null,
  });
  const fresh = JSON.stringify({
    message: "Hi Dana, my background is simplifying delivery systems while keeping ownership visible.",
    insertedExample: null,
  });
  const responses = [repeated, fresh];
  const prompts = [];
  const result = await generateOutreachMessage(
    {
      profileMarkdown: "I simplify delivery systems and keep ownership visible.",
      job,
      contact,
      recentMessages: ["I turn tangled approval chains into clear operating decisions without adding ceremony."],
    },
    { callModel: async (args) => { prompts.push(args.user); return responses.shift(); } },
  );
  assert.ok(result);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /repeated_recent_language/);
  assert.match(prompts[1], /tangled approval chains/);
}

// 4d. Hard-rule contract: after exhausting attempts, no violating near-miss is returned.
{
  let calls = 0;
  const stubborn = await generateOutreachMessageOutcome(
    { profileMarkdown: "x", job, contact },
    { callModel: async () => { calls += 1; return emDashJson; } },
  );
  assert.equal(calls, 3, "retries are bounded");
  assert.equal(stubborn.status, "quality_exhausted");
  if (stubborn.status === "quality_exhausted") {
    assert.deepEqual(stubborn.violations, ["em_dash_present"]);
  }
}

// 4e. Violation detection: cap, em dash, missing example link, ungrounded numbers.
const profileWithNumbers = "## Resume\n- Cut workflow turnaround 40% in two quarters (15+ years).\n- x\n- https://x.co/a";
assert.deepEqual(outreachHardRuleViolations({ message: "Hi Dana, I cut turnaround 40% and the write-up is at https://x.co/a. Worth a chat?", insertedExample: { oneHitter: "x", link: "https://x.co/a" } }, profileWithNumbers), []);
assert.ok(outreachHardRuleViolations({ message: "x".repeat(751), insertedExample: null }, profileWithNumbers)[0].startsWith("over_750_characters"));
assert.deepEqual(outreachHardRuleViolations({ message: "Hi — there.", insertedExample: null }, profileWithNumbers), ["em_dash_present"]);
assert.deepEqual(outreachHardRuleViolations({ message: "No link here.", insertedExample: { oneHitter: "x", link: "https://x.co/a" } }, profileWithNumbers), ["example_link_missing_from_body"]);
assert.deepEqual(outreachHardRuleViolations({ message: "I can be in-office as needed.", insertedExample: null }, profileWithNumbers), ["logistics_mentioned(in-office)"]);
assert.deepEqual(outreachHardRuleViolations({ message: "See https://x.co/a and https://x.co/b.", insertedExample: null }, `${profileWithNumbers}\nhttps://x.co/b`), ["too_many_links(2)"]);
assert.deepEqual(outreachHardRuleViolations({ message: "See https://invented.example/work.", insertedExample: null }, profileWithNumbers), ["ungrounded_link"]);
assert.deepEqual(outreachHardRuleViolations({ message: "Hi Dana.", insertedExample: { oneHitter: "Invented example" } }, profileWithNumbers), ["inserted_example_not_in_profile"]);
assert.deepEqual(
  outreachHardRuleViolations(
    { message: "Same draft.", insertedExample: null },
    profileWithNumbers,
    { job, contact, previousMessage: "  same   draft. " },
  ),
  ["unchanged_from_previous_draft"],
);
assert.deepEqual(
  outreachHardRuleViolations(
    {
      message: "Hi Dana, I simplify ambiguous delivery work by making ownership visible. https://x.co/a",
      insertedExample: null,
    },
    profileWithNumbers,
    {
      job,
      contact,
      recentMessages: [
        "Hi Dana, the Program Director role at Acme caught my eye because I build durable operating rhythms. https://x.co/a",
      ],
    },
  ),
  [],
  "shared recipient, job, company, and link alone do not count as repeated language",
);
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
const structuredRequest = parseOutreachRequest({ job: structuredJob, contact });
assert.equal(structuredRequest.ok, true);
if (structuredRequest.ok) {
  assert.deepEqual(structuredRequest.value.job.requiredExperience, structuredJob.requiredExperience);
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

const qualityExhausted = await generateOutreachMessageForUser(
  { loadAggregate: async () => completeCandidateProfileAggregate(now), callModel: async () => emDashJson },
  "user-1",
  { job, contact },
);
assert.equal(qualityExhausted.status, "quality_exhausted");

const ok = await generateOutreachMessageForUser(
  {
    loadAggregate: async () => completeCandidateProfileAggregate(now),
    callModel: async () => JSON.stringify({
      message: "Hi Dana, interested in the Program Director role.",
      insertedExample: null,
    }),
  },
  "user-1",
  { job, contact },
);
assert.equal(ok.status, "generated");
if (ok.status === "generated") {
  assert.match(ok.outreach.message, /Program Director role/);
  assert.equal(ok.outreach.insertedExample, null);
}

console.log("public profile outreach: all assertions passed");

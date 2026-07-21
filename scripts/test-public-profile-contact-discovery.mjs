import assert from "node:assert/strict";
import {
  buildUserPrompt,
  createOpenAIHumanPathProvider,
  parseResearchedContacts,
} from "../lib/public-profile/pursuits/contact-provider.ts";

const job = {
  id: "job-1",
  title: "Programmatic Media Director",
  companyName: "Useful Studio",
  description: "Own paid media and performance marketing for a growth-stage brand.",
};
const pursuit = { id: "pursuit-1" };

// 1. No key / model unavailable -> provider_unavailable (graceful degradation).
const unavailable = await createOpenAIHumanPathProvider({ callModel: async () => undefined })({ pursuit, job });
assert.equal(unavailable.status, "provider_unavailable");
assert.match(unavailable.reason, /OPENAI_API_KEY/);

// 2. A well-formed response where every contact has a route -> generated with one call.
const strongResponse = JSON.stringify({
  contacts: [
    { name: "Dana Reyes", title: "VP Media", candidateRole: "Functional Leader", confidence: 82, linkedinUrl: "https://linkedin.com/in/danareyes", evidenceUrl: "https://useful.example/leadership", reason: "Owns the media practice this role sits under." },
    { name: "Priya Nadar", title: "Director, Paid Media", candidateRole: "Hiring Manager", confidence: 0.6, professionalContactUrl: "https://priya.example/contact", evidenceUrl: "https://useful.example/team", reason: "One level above the opening." },
    { name: "Sam Cole", title: "Talent Partner", candidateRole: "Recruiter", confidence: 55, linkedinUrl: "https://www.linkedin.com/in/sam-cole", reason: "Assigned recruiter for media roles." },
  ],
});
let calls = 0;
const strong = await createOpenAIHumanPathProvider({
  callModel: async () => { calls += 1; return strongResponse; },
})({ pursuit, job });
assert.equal(strong.status, "generated");
assert.equal(calls, 1, "no gap-fill or enrichment call when all accepted contacts have routes");
// Ranked: hiring manager first, then functional leader, then recruiter.
assert.equal(strong.contacts[0].contactType, "likely_hiring_manager");
assert.equal(strong.contacts[1].contactType, "functional_leader");
assert.equal(strong.contacts[2].contactType, "recruiter");
// Mapping: confidence bucketed, company defaulted, verification notes cite evidence.
assert.equal(strong.contacts[0].confidence, "medium"); // 0.6 -> 60 -> medium
assert.equal(strong.contacts[1].confidence, "high"); // 82 -> high
assert.equal(strong.contacts[0].companyName, "Useful Studio");
assert.ok(strong.contacts[1].verificationNotes.some((note) => note.includes("useful.example/leadership")));
assert.equal(strong.contacts[0].linkedinUrl, undefined);
assert.deepEqual(strong.contacts[0].reachability, { method: "contact_page", url: "https://priya.example/contact" });
assert.deepEqual(strong.contacts[1].reachability, { method: "linkedin", url: "https://linkedin.com/in/danareyes" });
assert.deepEqual(strong.contacts[2].reachability, { method: "linkedin", url: "https://www.linkedin.com/in/sam-cole" });

// 2b. One invalid LinkedIn post triggers one batched enrichment call for that exact person.
const missingRouteResponse = JSON.stringify({
  contacts: [
    { name: "Dana Reyes", title: "VP Media", candidateRole: "Functional Leader", confidence: 82, linkedinUrl: "https://linkedin.com/in/danareyes", reason: "Owns the media practice." },
    { name: "Priya Nadar", title: "Director, Paid Media", candidateRole: "Hiring Manager", confidence: 60, professionalContactUrl: "https://priya.example/contact", reason: "One level above." },
    { name: "Sam Cole", title: "Talent Partner", candidateRole: "Recruiter", confidence: 55, linkedinUrl: "https://www.linkedin.com/posts/sam-example", reason: "Assigned recruiter." },
  ],
});
const enrichmentResponse = JSON.stringify({
  contacts: [
    { name: "Sam Cole", title: "Talent Partner", linkedinUrl: "https://www.linkedin.com/in/sam-cole?trk=search", evidenceUrl: "https://www.linkedin.com/in/sam-cole" },
    { name: "New Person", title: "Recruiter", linkedinUrl: "https://www.linkedin.com/in/new-person" },
  ],
});
let enrichmentCalls = 0;
const enriched = await createOpenAIHumanPathProvider({
  callModel: async () => {
    enrichmentCalls += 1;
    return enrichmentCalls === 1 ? missingRouteResponse : enrichmentResponse;
  },
})({ pursuit, job });
assert.equal(enrichmentCalls, 2, "all missing routes are enriched in one additional call");
assert.equal(enriched.status, "generated");
assert.equal(enriched.contacts.length, 3, "enrichment cannot introduce a new contact");
assert.deepEqual(enriched.contacts[2].reachability, { method: "linkedin", url: "https://www.linkedin.com/in/sam-cole" });

// 2c. An enrichment transport failure preserves the accepted contacts and explicit none state.
let failedEnrichmentCalls = 0;
const failedEnrichment = await createOpenAIHumanPathProvider({
  callModel: async () => {
    failedEnrichmentCalls += 1;
    return failedEnrichmentCalls === 1 ? missingRouteResponse : undefined;
  },
})({ pursuit, job });
assert.equal(failedEnrichmentCalls, 2);
assert.equal(failedEnrichment.status, "generated");
assert.deepEqual(failedEnrichment.contacts[2].reachability, { method: "none" });

// 3. Thin first response (1 recruiter, no functional lead) -> gap-fill call, merged + deduped.
const thinResponse = JSON.stringify({
  contacts: [
    { name: "Sam Cole", title: "Talent Partner", candidateRole: "Recruiter", confidence: 90, reason: "Recruiter." },
  ],
});
const gapResponse = JSON.stringify({
  contacts: [
    { name: "Priya Nadar", title: "Director, Paid Media", candidateRole: "Hiring Manager", confidence: 60, reason: "One level up." },
    { name: "Sam Cole", title: "Talent Partner", candidateRole: "Recruiter", confidence: 90, reason: "Dup of first pass." },
  ],
});
let gapCalls = 0;
const gapped = await createOpenAIHumanPathProvider({
  callModel: async () => {
    gapCalls += 1;
    if (gapCalls === 1) return thinResponse;
    if (gapCalls === 2) return gapResponse;
    return JSON.stringify({ contacts: [] });
  },
})({ pursuit, job });
assert.equal(gapCalls, 3, "thin discovery runs one gap-fill and one batched route-enrichment call");
assert.equal(gapped.contacts.length, 2, "duplicate contact deduped across passes");
// Hiring manager ranked ahead of recruiter even though recruiter has higher confidence.
assert.equal(gapped.contacts[0].contactType, "likely_hiring_manager");
assert.equal(gapped.contacts[1].contactType, "recruiter");

// 4. Junk names (title-only / placeholder) are filtered out.
const junk = parseResearchedContacts({
  contacts: [
    { name: "Director", title: "Director of Media", confidence: 50 },
    { name: "(unknown)", title: "VP", confidence: 50 },
    { name: "Real Person", title: "VP Media", candidateRole: "Functional Leader", confidence: 50 },
  ],
}, "Useful Studio");
assert.equal(junk.length, 1);
assert.equal(junk[0].name, "Real Person");

// 4b. Underscore role labels ("long_shot") map like their spaced form.
const underscore = parseResearchedContacts({
  contacts: [{ name: "Alex Kim", title: "Head of Growth", candidateRole: "long_shot", confidence: 50 }],
}, "Useful Studio");
assert.equal(underscore[0].contactType, "executive_sponsor");

// 5. buildUserPrompt carries the role context and a media-specific research plan.
const prompt = buildUserPrompt(job);
assert.match(prompt, /Programmatic Media Director/);
assert.match(prompt, /Useful Studio/);
assert.match(prompt, /performance marketing/i);
assert.match(prompt, /Paid Media|Performance Marketing/);

console.log("public profile contact discovery: all assertions passed");

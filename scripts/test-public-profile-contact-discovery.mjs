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

function verifiedCandidate(candidateKey, currentName, currentTitle, contactType, linkedinUrl, overrides = {}) {
  const currentExperienceCompany = overrides.currentExperienceCompany ?? "Useful Studio";
  const linkedinHeadline = overrides.linkedinHeadline ?? currentTitle;
  return {
    candidateKey,
    currentName,
    linkedinHeadline,
    linkedinHeadlineEvidenceText: `${currentName} | ${linkedinHeadline}`,
    currentExperienceTitle: currentTitle,
    currentExperienceCompany,
    currentExperienceEvidenceText: `${currentTitle} at ${currentExperienceCompany}`,
    currentExperienceIsCurrent: true,
    linkedinUrl,
    identityMatches: true,
    companyMatches: true,
    roleEligible: true,
    contactType,
    confidence: 90,
    reason: "Verified current role is relevant to this hiring chain.",
    roleConnection: "Verified current hiring-chain contact.",
    headlineEvidenceUrl: linkedinUrl,
    experienceEvidenceUrl: linkedinUrl,
    ...overrides,
  };
}

// 1. No key / model unavailable -> provider_unavailable (graceful degradation).
const unavailable = await createOpenAIHumanPathProvider({ callModel: async () => undefined })({ pursuit, job });
assert.equal(unavailable.status, "provider_unavailable");
assert.match(unavailable.reason, /OPENAI_API_KEY/);

// 2. Even a well-formed discovery response requires an independent profile-verification call.
const strongResponse = JSON.stringify({
  contacts: [
    { name: "Dana Reyes", title: "VP Media", candidateRole: "Functional Leader", confidence: 82, linkedinUrl: "https://linkedin.com/in/danareyes", evidenceUrl: "https://useful.example/leadership", reason: "Owns the media practice this role sits under." },
    { name: "Priya Nadar", title: "Director, Paid Media", candidateRole: "Hiring Manager", confidence: 0.6, linkedinUrl: "https://linkedin.com/in/priyanadar", evidenceUrl: "https://useful.example/team", reason: "One level above the opening." },
    { name: "Sam Cole", title: "Talent Partner", candidateRole: "Recruiter", confidence: 55, linkedinUrl: "https://www.linkedin.com/in/sam-cole", reason: "Assigned recruiter for media roles." },
  ],
});
let calls = 0;
const strong = await createOpenAIHumanPathProvider({
  callModel: async () => {
    calls += 1;
    if (calls === 1) return strongResponse;
    return JSON.stringify({ verifications: [
      verifiedCandidate("0", "Priya Nadar", "Director, Paid Media", "likely_hiring_manager", "https://linkedin.com/in/priyanadar", { confidence: 60 }),
      verifiedCandidate("1", "Dana Reyes", "VP Media", "functional_leader", "https://linkedin.com/in/danareyes", { confidence: 82 }),
      verifiedCandidate("2", "Sam Cole", "Talent Partner", "recruiter", "https://www.linkedin.com/in/sam-cole", { confidence: 55 }),
    ] });
  },
})({ pursuit, job });
assert.equal(strong.status, "generated");
assert.equal(calls, 2, "all discovered contacts receive a mandatory independent verification call");
// Ranked: hiring manager first, then functional leader, then recruiter.
assert.equal(strong.contacts[0].contactType, "likely_hiring_manager");
assert.equal(strong.contacts[1].contactType, "functional_leader");
assert.equal(strong.contacts[2].contactType, "recruiter");
// Mapping: confidence bucketed, company defaulted, verification notes cite evidence.
assert.equal(strong.contacts[0].confidence, "medium"); // 0.6 -> 60 -> medium
assert.equal(strong.contacts[1].confidence, "high"); // 82 -> high
assert.equal(strong.contacts[0].companyName, "Useful Studio");
assert.ok(strong.contacts[1].verificationNotes.some((note) => note.includes("linkedin.com/in/danareyes")));
assert.equal(strong.contacts[0].linkedinUrl, "https://linkedin.com/in/priyanadar");
assert.deepEqual(strong.contacts[0].reachability, { method: "linkedin", url: "https://linkedin.com/in/priyanadar" });
assert.deepEqual(strong.contacts[1].reachability, { method: "linkedin", url: "https://linkedin.com/in/danareyes" });
assert.deepEqual(strong.contacts[2].reachability, { method: "linkedin", url: "https://www.linkedin.com/in/sam-cole" });

// 2b. Mandatory verification repairs missing or invalid LinkedIn routes without adding people.
const missingRouteResponse = JSON.stringify({
  contacts: [
    { name: "Dana Reyes", title: "VP Media", candidateRole: "Functional Leader", confidence: 82, linkedinUrl: "https://linkedin.com/in/danareyes", reason: "Owns the media practice." },
    { name: "Priya Nadar", title: "Director, Paid Media", candidateRole: "Hiring Manager", confidence: 60, professionalContactUrl: "https://priya.example/contact", reason: "One level above." },
    { name: "Sam Cole", title: "Talent Partner", candidateRole: "Recruiter", confidence: 55, linkedinUrl: "https://www.linkedin.com/posts/sam-example", reason: "Assigned recruiter." },
  ],
});
const enrichmentResponse = JSON.stringify({
  verifications: [
    verifiedCandidate("0", "Priya Nadar", "Director, Paid Media", "likely_hiring_manager", "https://www.linkedin.com/in/priyanadar", { confidence: 60 }),
    verifiedCandidate("1", "Dana Reyes", "VP Media", "functional_leader", "https://linkedin.com/in/danareyes", { confidence: 82 }),
    verifiedCandidate("2", "Sam Cole", "Talent Partner", "recruiter", "https://www.linkedin.com/in/sam-cole?trk=search", { confidence: 55 }),
  ],
});
let enrichmentCalls = 0;
const enriched = await createOpenAIHumanPathProvider({
  callModel: async () => {
    enrichmentCalls += 1;
    return enrichmentCalls === 1 ? missingRouteResponse : enrichmentResponse;
  },
})({ pursuit, job });
assert.equal(enrichmentCalls, 2, "all candidates are verified in one additional batched call");
assert.equal(enriched.status, "generated");
assert.equal(enriched.contacts.length, 3, "enrichment cannot introduce a new contact");
assert.deepEqual(enriched.contacts[0].reachability, { method: "linkedin", url: "https://www.linkedin.com/in/priyanadar" });
assert.deepEqual(enriched.contacts[2].reachability, { method: "linkedin", url: "https://www.linkedin.com/in/sam-cole" });

// 2c. A verification transport failure exposes no unverified contacts, even pre-linked ones.
let failedEnrichmentCalls = 0;
const failedEnrichment = await createOpenAIHumanPathProvider({
  callModel: async () => {
    failedEnrichmentCalls += 1;
    return failedEnrichmentCalls === 1 ? missingRouteResponse : undefined;
  },
})({ pursuit, job });
assert.equal(failedEnrichmentCalls, 2);
assert.equal(failedEnrichment.status, "generated");
assert.equal(failedEnrichment.contacts.length, 0);

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
    return JSON.stringify({ verifications: [
      verifiedCandidate("0", "Priya Nadar", "Director, Paid Media", "likely_hiring_manager", "https://linkedin.com/in/priyanadar", { confidence: 60 }),
      verifiedCandidate("1", "Sam Cole", "Talent Partner", "recruiter", "https://linkedin.com/in/sam-cole"),
    ] });
  },
})({ pursuit, job });
assert.equal(gapCalls, 3, "thin discovery runs one gap-fill and one batched profile-verification call");
assert.equal(gapped.contacts.length, 2, "duplicate contact deduped across passes");
// Hiring manager ranked ahead of recruiter even though recruiter has higher confidence.
assert.equal(gapped.contacts[0].contactType, "likely_hiring_manager");
assert.equal(gapped.contacts[1].contactType, "recruiter");

// 3b. A valid LinkedIn URL cannot rescue an irrelevant current role. Joe's
// verified Senior Project Analyst role is not part of this program-management hiring chain.
const airbnbJob = {
  id: "job-airbnb",
  title: "Director, Roadmap Planning & Program Management",
  companyName: "Airbnb",
  description: "Lead roadmap planning and program management.",
};
let joeCalls = 0;
const joeResult = await createOpenAIHumanPathProvider({
  callModel: async () => {
    joeCalls += 1;
    if (joeCalls === 1) return JSON.stringify({ contacts: [{
      name: "Joe Andrews",
      title: "Program Manager, Roadmap Planning & Program Management at Airbnb",
      candidateRole: "Hiring Manager",
      confidence: 90,
      linkedinUrl: "https://linkedin.com/in/joe-andrews",
      reason: "Claimed program-management leader.",
    }] });
    if (joeCalls === 2) return JSON.stringify({ contacts: [] });
    return JSON.stringify({ verifications: [{
      ...verifiedCandidate("0", "Joe Andrews", "Senior Project Analyst", "unknown", "https://linkedin.com/in/joe-andrews", {
        currentExperienceCompany: "Airbnb",
        roleEligible: true,
        contactType: "likely_hiring_manager",
        reason: "Verified current role is not in the program-management hiring chain.",
      }),
    }] });
  },
})({ pursuit, job: airbnbJob });
assert.equal(joeCalls, 3);
assert.equal(joeResult.status, "generated");
assert.equal(joeResult.contacts.length, 0, "irrelevant verified role is rejected instead of mislabeled as Hiring Manager");

// 3c. When a candidate is still relevant, the verifier owns the displayed current title.
let correctedTitleCalls = 0;
const correctedTitle = await createOpenAIHumanPathProvider({
  callModel: async () => {
    correctedTitleCalls += 1;
    if (correctedTitleCalls === 1) return JSON.stringify({ contacts: [{
      name: "Morgan Lee",
      title: "Director of Program Management",
      candidateRole: "Hiring Manager",
      confidence: 80,
      linkedinUrl: "https://linkedin.com/in/morgan-lee",
    }] });
    if (correctedTitleCalls === 2) return JSON.stringify({ contacts: [] });
    return JSON.stringify({ verifications: [{
      ...verifiedCandidate("0", "Morgan Lee", "Senior Program Manager", "likely_hiring_manager", "https://linkedin.com/in/morgan-lee", {
        currentExperienceCompany: "Airbnb",
        confidence: 75,
      }),
    }] });
  },
})({ pursuit, job: airbnbJob });
assert.equal(correctedTitle.contacts.length, 1);
assert.equal(correctedTitle.contacts[0].title, "Senior Program Manager");
assert.equal(correctedTitle.contacts[0].contactType, "likely_hiring_manager");

// 3d. Conflicting LinkedIn headline and Experience text remain separate facts.
// The exact current Experience title is canonical; no shortened third title is allowed.
let sarahCalls = 0;
const sarahResult = await createOpenAIHumanPathProvider({
  callModel: async () => {
    sarahCalls += 1;
    if (sarahCalls === 1) return JSON.stringify({ contacts: [{
      name: "Sarah Kim",
      title: "Principal Recruiter, Product",
      candidateRole: "Recruiter",
      confidence: 65,
      linkedinUrl: "https://linkedin.com/in/sarah-kim",
    }] });
    if (sarahCalls === 2) return JSON.stringify({ contacts: [] });
    return JSON.stringify({ verifications: [{
      ...verifiedCandidate("0", "Sarah Kim", "Principal Recruiter, Product and Creative", "recruiter", "https://linkedin.com/in/sarah-kim", {
        currentExperienceCompany: "Airbnb",
        linkedinHeadline: "Principal Recruiter, Product and Design",
      }),
    }] });
  },
})({ pursuit, job: airbnbJob });
assert.equal(sarahResult.contacts.length, 1);
assert.equal(sarahResult.contacts[0].title, "Principal Recruiter, Product and Creative");
assert.notEqual(sarahResult.contacts[0].title, "Principal Recruiter, Product and Design");
assert.notEqual(sarahResult.contacts[0].title, "Principal Recruiter, Product");

// 4. Junk names (title-only / placeholder / organization-plus-role) are filtered out.
const junk = parseResearchedContacts({
  contacts: [
    { name: "Director", title: "Director of Media", confidence: 50 },
    { name: "(unknown)", title: "VP", confidence: 50 },
    { name: "Coinbase Principal Recruiter", title: "Principal Recruiter, Core Recruiting team", candidateRole: "Recruiter", confidence: 90 },
    { name: "Real Person", title: "VP Media", candidateRole: "Functional Leader", confidence: 50 },
  ],
}, "Coinbase");
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

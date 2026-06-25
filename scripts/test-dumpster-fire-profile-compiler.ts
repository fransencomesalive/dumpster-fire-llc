import assert from "node:assert/strict";
import { evaluateJobMatch } from "../app/scans/matching";
import { compileSearchProfile } from "../app/scans/profile-compiler";

const compiled = compileSearchProfile({
  resumeText: `
    Senior Creative Operations and Program Director with 12 years leading cross-functional brand studio programs.
    Owned vendor workflow, campaign launch operations, budget planning, stakeholder roadmaps, and production systems.
    Managed a team across in-house studio and technology company environments.
  `,
  profileText: "Interested in remote creative program leadership, studio operations, and AI-enabled production workflows.",
  preferences: {
    desiredTitles: ["Creative Program Director", "Studio Operations Director", "Head of Production"],
    avoidedTitles: ["Software Engineer", "Counsel", "Compliance Manager"],
    desiredIndustries: ["internal creative studio", "technology", "ai"],
    compensationFloor: 150000,
    freelanceRateFloor: 125,
    remoteOnly: true,
    approvedLoginEmail: "candidate@example.com",
    roleTracks: [{
      id: "creative_program",
      label: "Creative Program",
      titlePatterns: ["Creative Program Director", "Director Program Management", "Senior Creative Producer"],
      responsibilityPatterns: ["program leadership", "creative production", "studio operations", "campaign delivery", "vendor workflow"],
      contextPatterns: ["internal creative studio", "technology"],
      proofPatterns: ["agency", "brand studio"],
      weakPatterns: ["scrum master"],
    }],
  },
});

assert.equal(compiled.confidence, "high");
assert.ok(compiled.searchProfile.targetTitles.includes("creative program director"));
assert.ok(compiled.searchProfile.targetTitles.includes("head of production"));
assert.ok(compiled.searchProfile.positiveKeywords.includes("cross functional"));
assert.ok(compiled.searchProfile.targetIndustries.includes("internal creative studio"));
assert.ok(compiled.matchingConfig.hardExcludedTitlePatterns.includes("software engineer"));
assert.ok(compiled.matchingConfig.titleFamilyRules.length > 0);
assert.ok((compiled.matchingConfig.resumeRoleSignals?.roleTracks ?? []).length > 0);
assert.equal(compiled.matchingConfig.resumeRoleSignals?.roleTracks?.[0]?.label, "Creative Program");
assert.ok(compiled.evidence.roleTracks.length > 0);

const goodMatch = evaluateJobMatch({
  title: "Creative Program Director",
  companyName: "Future Studio",
  department: "Brand Studio",
  location: "Remote",
  remoteType: "remote",
  employmentType: "full-time",
  salaryMin: 175000,
  salaryMax: 195000,
  salaryText: "$175k-$195k",
  descriptionText: "Lead cross-functional studio operations, campaign delivery, stakeholder roadmap, vendor workflow, budget planning, and AI-enabled production systems.",
  firstSeenAt: new Date().toISOString(),
  needsContactResearch: true,
}, compiled.searchProfile, compiled.matchingConfig);
assert.equal(goodMatch.included, true);

const programVariantMatch = evaluateJobMatch({
  title: "Director, Program Management",
  companyName: "Future Studio",
  department: "Operations",
  location: "Remote",
  remoteType: "remote",
  employmentType: "full-time",
  salaryMin: 175000,
  salaryMax: 195000,
  salaryText: "$175k-$195k",
  descriptionText: "Own cross-functional program leadership, studio operations, stakeholder workflow, vendor planning, budget coordination, and AI-enabled delivery systems for a technology brand studio.",
  firstSeenAt: new Date().toISOString(),
  needsContactResearch: true,
}, compiled.searchProfile, compiled.matchingConfig);
assert.equal(programVariantMatch.included, true);

const producerVariantMatch = evaluateJobMatch({
  title: "Senior Creative Producer",
  companyName: "Future Studio",
  department: "Brand Studio",
  location: "Remote",
  remoteType: "remote",
  employmentType: "full-time",
  salaryMin: 175000,
  salaryMax: 195000,
  salaryText: "$175k-$195k",
  descriptionText: "Lead creative production, campaign delivery, stakeholder workflow, vendor coordination, budget planning, and launch operations.",
  firstSeenAt: new Date().toISOString(),
  needsContactResearch: true,
}, compiled.searchProfile, compiled.matchingConfig);
assert.equal(producerVariantMatch.included, true);

const badMatch = evaluateJobMatch({
  title: "Software Engineer, Creative Tools",
  companyName: "Future Studio",
  department: "Engineering",
  location: "Remote",
  remoteType: "remote",
  employmentType: "full-time",
  salaryMin: 190000,
  salaryMax: 220000,
  salaryText: "$190k-$220k",
  descriptionText: "Build internal tools with cross-functional teams and support AI production workflows.",
  firstSeenAt: new Date().toISOString(),
  needsContactResearch: true,
}, compiled.searchProfile, compiled.matchingConfig);
assert.equal(badMatch.included, false);
assert.ok(badMatch.risks.some((risk) => risk.includes("software engineer")));

const thinProfile = compileSearchProfile({
  resumeText: "I have worked a few jobs and want something better.",
});
assert.equal(thinProfile.confidence, "low");
assert.ok(thinProfile.missingInputs.includes("target titles"));
assert.ok(thinProfile.missingInputs.includes("remote/location constraint"));

console.log("Dumpster Fire profile compiler tests passed.");

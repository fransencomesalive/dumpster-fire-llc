import assert from "node:assert/strict";
import {
  rankOutreachWorkExamples,
  resolveInsertedWorkExample,
} from "../lib/public-profile/outreach-evidence";
import type { WorkExample } from "../lib/public-profile/types";
import { completeCandidateProfileAggregate } from "./fixtures/public-profile";

const now = "2026-08-04T18:00:00.000Z";

function example(id: string, title: string, oneHitter: string, context: string, link?: string): WorkExample {
  return {
    id,
    profileId: "profile-1",
    title,
    oneHitter,
    context,
    ...(link ? { link } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

function profileWith(examples: WorkExample[]) {
  const aggregate = completeCandidateProfileAggregate(now);
  aggregate.workExamples = examples;
  aggregate.skills = [];
  return aggregate;
}

const aiExample = example(
  "ai",
  "AI evaluation operations",
  "Built an AI retrieval evaluation workflow.",
  "Designed model evaluation, retrieval quality, and human review operations.",
);
const clinicalExample = example(
  "clinical",
  "Clinical workflow redesign",
  "Rebuilt a patient intake workflow.",
  "Coordinated clinical operations, patient safety, and nursing handoffs.",
);
const fieldExample = example(
  "field",
  "Field crew scheduling",
  "Reworked field crew scheduling.",
  "Improved technician dispatch, safety checks, and regional field operations.",
);

const universalProfile = profileWith([clinicalExample, fieldExample, aiExample]);
const aiJob = {
  title: "AI Operations Specialist",
  company: "Example AI",
  description: "Own model evaluation, retrieval quality, and human review workflows.",
};
const clinicalJob = {
  title: "Clinical Operations Coordinator",
  company: "Example Health",
  description: "Improve patient intake, nursing handoffs, and clinical safety workflows.",
};
const fieldJob = {
  title: "Field Operations Manager",
  company: "Example Field",
  description: "Lead technician dispatch, crew scheduling, and field safety.",
};

assert.equal(rankOutreachWorkExamples({ aggregate: universalProfile, job: aiJob }).selected?.id, "ai");
assert.equal(rankOutreachWorkExamples({ aggregate: universalProfile, job: clinicalJob }).selected?.id, "clinical");
assert.equal(rankOutreachWorkExamples({ aggregate: universalProfile, job: fieldJob }).selected?.id, "field");

const reversedProfile = profileWith([aiExample, fieldExample, clinicalExample].reverse());
assert.equal(
  rankOutreachWorkExamples({ aggregate: reversedProfile, job: aiJob }).selected?.id,
  "ai",
  "inventory order must not change a clear relevance result",
);

const comparableA = example(
  "a",
  "Operations system A",
  "Built a cross-functional launch system.",
  "Led ambiguous cross-functional delivery and launch operations.",
);
const comparableB = example(
  "b",
  "Operations system B",
  "Built a cross-functional launch system.",
  "Led ambiguous cross-functional delivery and launch operations.",
);
const comparableProfile = profileWith([comparableA, comparableB]);
const programJob = {
  title: "Program Director",
  company: "Useful Studio",
  description: "Lead ambiguous cross-functional delivery and launch operations.",
};
const noHistoryDecision = rankOutreachWorkExamples({ aggregate: comparableProfile, job: programJob });
assert.equal(noHistoryDecision.selected?.id, "a", "stable title/id tie-break chooses the same initial candidate");
const diversifiedDecision = rankOutreachWorkExamples({
  aggregate: comparableProfile,
  job: programJob,
  history: [{ message: "Prior draft.", selectedWorkExampleId: "a" }],
});
assert.equal(diversifiedDecision.selected?.id, "b");
assert.equal(diversifiedDecision.diversityAffectedSelection, true);

const strongProfile = profileWith([
  clinicalExample,
  example("brand", "Brand photography", "Produced a brand campaign.", "Led studio photography and campaign art direction."),
]);
const strongDespiteHistory = rankOutreachWorkExamples({
  aggregate: strongProfile,
  job: clinicalJob,
  history: Array.from({ length: 5 }, () => ({ message: "Prior clinical draft.", selectedWorkExampleId: "clinical" })),
});
assert.equal(strongDespiteHistory.selected?.id, "clinical", "diversity cannot promote an irrelevant example");
assert.equal(strongDespiteHistory.diversityAffectedSelection, false);

const unrelatedDecision = rankOutreachWorkExamples({
  aggregate: profileWith([
    example("ceramics", "Ceramics exhibition", "Curated a ceramics exhibition.", "Selected glazes and gallery lighting."),
  ]),
  job: aiJob,
});
assert.equal(unrelatedDecision.selected, undefined, "an unrelated inventory must resolve to no Work Example");

// Regression: Dropbox stored its AI requirement in requiredExperience, not the
// general description. The selector must score that structured section. Recent
// usage may only rotate when another current example remains comparably relevant.
const phredExample = example(
  "phred",
  "P.H.R.E.D.",
  "Project Hub for Retrieval, Execution, & Delivery",
  "Built an operating system and orchestration agent that keeps AI-assisted work connected.",
  "https://example.com/phred",
);
const reconExample = example(
  "recon",
  "R.E.C.O.N.",
  "Route Environment & Condition Observation for Navigation",
  "Built an AI-assisted route intelligence platform with workflow automation and AI-generated analysis.",
  "https://example.com/recon",
);
const dropboxProfile = profileWith([phredExample, reconExample, clinicalExample]);
dropboxProfile.skills = [{
  id: "skill-ai",
  profileId: "profile-1",
  skillName: "AI Workflow Design",
  proficiency: "expert",
  evidence: ["Created a workflow for AI-assisted product development."],
  relatedWorkExampleIds: ["phred"],
  createdAt: now,
  updatedAt: now,
}];
const dropboxDecision = rankOutreachWorkExamples({
  aggregate: dropboxProfile,
  selectedRoleTrackId: dropboxProfile.roleTracks[0]?.id,
  job: {
    title: "Program Manager, Workforce Planning",
    company: "Dropbox",
    description: "Build and operate systems, operating rhythms, and governance for workforce planning.",
    responsibilities: ["Own planning cycles, executive reporting, and delivery infrastructure."],
    requiredExperience: ["Use automation and AI-enabled tools to simplify operational workflows."],
  },
  history: [{ message: `Prior AI note ${phredExample.link}`, selectedWorkExampleId: "phred" }],
});
assert.equal(dropboxDecision.selected?.id, "phred");
assert.ok(dropboxDecision.requiredExperienceMatchedSignals.includes("AI"));
assert.equal(dropboxDecision.diversityAffectedSelection, false);

// Regression: ordinary grammatical variants must not hide a curated skill.
// This mirrors a creative-production posting that says "coordinating",
// "designers", and "workflow" while the profile says AI Workflow Design.
const workflowProfile = profileWith([
  example(
    "workflow-example",
    "Project OS",
    "A structured operating methodology for a production MVP.",
    "I coordinated a complex mobile app and built workflow patterns that kept AI-assisted work connected.",
  ),
]);
workflowProfile.skills = [{
  id: "workflow-skill",
  profileId: "profile-1",
  skillName: "AI Workflow Design",
  proficiency: "strong",
  evidence: ["Created a new workflow for mobile app development."],
  relatedWorkExampleIds: ["workflow-example"],
  createdAt: now,
  updatedAt: now,
}];
const workflowDecision = rankOutreachWorkExamples({
  aggregate: workflowProfile,
  job: {
    title: "Creative Producer",
    company: "Software Company",
    description: "Be the operational backbone coordinating projects across a fast-moving creative team.",
    responsibilities: ["Build and run a production workflow and intake process."],
    requiredExperience: ["Strong project management instincts and fluency with creative workflows."],
  },
});
assert.equal(workflowDecision.selected?.id, "workflow-example");
assert.equal(workflowDecision.matchedSignals.includes("AI Workflow Design"), true);

assert.equal(
  resolveInsertedWorkExample([aiExample], { id: "ai", oneHitter: aiExample.oneHitter })?.id,
  "ai",
);
assert.equal(
  resolveInsertedWorkExample([aiExample], { id: "wrong", oneHitter: aiExample.oneHitter }),
  undefined,
  "a supplied ID must agree with the exact stored content",
);
assert.equal(
  resolveInsertedWorkExample([aiExample, { ...aiExample, id: "duplicate" }], { oneHitter: aiExample.oneHitter }),
  undefined,
  "ambiguous content must never receive a persisted example ID",
);

console.log("outreach evidence selection: all assertions passed");

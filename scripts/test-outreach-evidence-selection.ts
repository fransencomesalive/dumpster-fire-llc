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

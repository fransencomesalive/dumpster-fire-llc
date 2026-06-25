import assert from "node:assert/strict";
import { analyzeNearMissReviewDecisions } from "../app/scans/review-learning";
import { serializeReviewReason } from "../app/scans/review-feedback";
import { buildTuningPreviewImpact } from "../app/scans/tuning-preview";
import type { NearMissReviewDecision } from "../app/scans/types";

let decisionId = 0;
function makeDecision(overrides: Partial<NearMissReviewDecision>): NearMissReviewDecision {
  decisionId += 1;
  return {
    id: `decision-${decisionId}`,
    reviewKey: `key-${decisionId}`,
    decision: "approve",
    reason: "",
    titleSignal: "",
    companyName: `Company ${decisionId}`,
    provider: "greenhouse",
    title: "Creative Producer",
    sourceUrl: "https://example.com/job",
    reviewBucket: "included_stretch_match",
    rulesVersion: "test-rules",
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    ...overrides,
  };
}

const analysisDecisions = [
  makeDecision({
    title: "Creative Producer",
    companyName: "Studio A",
    reason: serializeReviewReason({ verdict: "good", rationale: ["experience_match"], note: "" }),
  }),
  makeDecision({
    title: "Senior Creative Producer",
    companyName: "Studio B",
    reason: serializeReviewReason({ verdict: "good", rationale: ["experience_match", "seniority_acceptable"], note: "" }),
  }),
  makeDecision({
    title: "Product Operations Manager",
    companyName: "Tech Co",
    reason: serializeReviewReason({ verdict: "stretch", rationale: ["adjacent"], note: "Could work with positioning." }),
  }),
  makeDecision({
    decision: "not_for_me",
    title: "Design Program Manager",
    companyName: "Hybrid Co",
    reason: serializeReviewReason({ verdict: "not_a_match", rationale: ["hybrid_not_acceptable"], note: "" }),
  }),
  makeDecision({
    decision: "not_for_me",
    title: "Sales Operations Lead",
    companyName: "Sales Co",
    reason: serializeReviewReason({ verdict: "not_a_match", rationale: ["wrong_function"], note: "" }),
  }),
  makeDecision({
    decision: "not_for_me",
    title: "Mystery Role",
    companyName: "Thin Co",
    reason: serializeReviewReason({ verdict: "not_a_match", rationale: ["missing_available_description"], note: "" }),
  }),
];

// Verdict-aware analysis: Match/Good/Stretch stay distinct and chips are counted.

const analysis = analyzeNearMissReviewDecisions(analysisDecisions);
assert.deepEqual(analysis.verdictCounts, { match: 0, good: 2, stretch: 1, not_a_match: 3 });
assert.equal(analysis.sourceQaOnlyCount, 1);

const goodGroup = analysis.groups.find((group) => group.verdict === "good");
assert.ok(goodGroup, "expected a good-verdict group");
assert.equal(goodGroup.count, 2);
assert.equal(goodGroup.rationaleChips[0]?.chip, "experience_match");
assert.deepEqual([...goodGroup.routes].sort(), ["role_track", "seniority"]);

const stretchGroup = analysis.groups.find((group) => group.verdict === "stretch");
assert.ok(stretchGroup, "expected a distinct stretch-verdict group");
assert.equal(analysis.groups.some((group) => group.label === "Mystery Role"), false, "source-QA-only decisions must not form fit groups");

// Draft routing: stretch is boundary evidence, eligibility-only rejections do not become title penalties.

const impact = buildTuningPreviewImpact({
  decisions: [],
  reviewDecisions: analysisDecisions,
  rulesVersion: "test-rules",
});

const titleFamilyDrafts = impact.drafts.filter((draft) => draft.group === "title_family");
const stretchDrafts = impact.drafts.filter((draft) => draft.group === "stretch_boundary");
const negativeDrafts = impact.drafts.filter((draft) => draft.group === "negative_signal");

assert.equal(titleFamilyDrafts.length, 1);
assert.equal(titleFamilyDrafts[0].verdict, "good");
assert.equal(stretchDrafts.length, 1);
assert.equal(negativeDrafts.length, 1);
assert.equal(negativeDrafts[0].label, "Revenue or regulated operations");
assert.equal(
  impact.drafts.some((draft) => draft.label === "General program management"),
  false,
  "eligibility-only not-a-match groups must not become negative title drafts",
);
assert.ok(
  impact.warnings.some((warning) => warning.includes("scrape/source issues")),
  "expected a source-QA exclusion warning",
);

console.log("Dumpster Fire review learning fixtures passed.");

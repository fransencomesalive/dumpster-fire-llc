import assert from "node:assert/strict";
import {
  fallbackVerdictForLegacyDecision,
  labelForReviewRationale,
  legacyDecisionForReviewVerdict,
  parseReviewReason,
  routeForReviewRationale,
  serializeReviewReason,
  structureReviewDecision,
} from "../app/scans/review-feedback.ts";

const saved = serializeReviewReason({
  verdict: "stretch",
  rationale: ["adjacent", "seniority_acceptable", "missing_available_salary"],
  note: "Worth seeing during calibration.",
});

assert.equal(
  saved,
  "[verdict: stretch][rationale: adjacent, seniority_acceptable, missing_available_salary] Worth seeing during calibration.",
);

assert.deepEqual(parseReviewReason(saved), {
  verdict: "stretch",
  rationale: ["adjacent", "seniority_acceptable", "missing_available_salary"],
  note: "Worth seeing during calibration.",
  format: "review",
});

assert.deepEqual(parseReviewReason("[tags: stretch_adjacent, bad_experience_scrape] Legacy note"), {
  verdict: "stretch",
  rationale: ["adjacent", "missing_available_reqd_experience"],
  note: "Legacy note",
  format: "legacy_tags",
});

assert.equal(legacyDecisionForReviewVerdict("match"), "approve");
assert.equal(legacyDecisionForReviewVerdict("good"), "approve");
assert.equal(legacyDecisionForReviewVerdict("stretch"), "approve");
assert.equal(legacyDecisionForReviewVerdict("not_a_match"), "not_for_me");
assert.equal(fallbackVerdictForLegacyDecision("approve"), "good");
assert.equal(labelForReviewRationale("missing_available_reqd_experience"), "Missing available Req'd Experience");

// Structured review layer: verdicts, chips, and pipeline routes.

assert.equal(routeForReviewRationale("hybrid_not_acceptable"), "eligibility");
assert.equal(routeForReviewRationale("salary_too_low_for_scope_comp"), "compensation");
assert.equal(routeForReviewRationale("wrong_function"), "occupation_lane");
assert.equal(routeForReviewRationale("seniority_mismatch"), "seniority");
assert.equal(routeForReviewRationale("experience_match"), "role_track");
assert.equal(routeForReviewRationale("missing_available_description"), "source_qa");

let decisionId = 0;
function makeDecision(overrides) {
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

const structuredNew = structureReviewDecision(makeDecision({
  decision: "approve",
  reason: serializeReviewReason({ verdict: "match", rationale: ["experience_match", "seniority_match"], note: "Exactly my lane." }),
}));
assert.equal(structuredNew.verdict, "match");
assert.equal(structuredNew.verdictSource, "review");
assert.deepEqual(structuredNew.rationale, ["experience_match", "seniority_match"]);
assert.deepEqual(structuredNew.routes, ["role_track", "seniority"]);
assert.equal(structuredNew.sourceQaOnly, false);
assert.equal(structuredNew.note, "Exactly my lane.");

const structuredLegacy = structureReviewDecision(makeDecision({ decision: "not_for_me", reason: "Just wrong." }));
assert.equal(structuredLegacy.verdict, "not_a_match");
assert.equal(structuredLegacy.verdictSource, "legacy_decision");
assert.equal(structuredLegacy.note, "Just wrong.");

const structuredSourceQa = structureReviewDecision(makeDecision({
  decision: "not_for_me",
  reason: serializeReviewReason({ verdict: "not_a_match", rationale: ["missing_available_description", "missing_available_salary"], note: "" }),
}));
assert.equal(structuredSourceQa.sourceQaOnly, true);

console.log("Dumpster Fire review feedback fixtures passed.");

import assert from "node:assert/strict";
import { evaluateCandidateProfileQuality } from "../lib/public-profile/profile-quality.ts";
import { completeCandidateProfileAggregate } from "./fixtures/public-profile.ts";

const now = "2026-06-23T00:00:00.000Z";

const complete = evaluateCandidateProfileQuality(completeCandidateProfileAggregate(now), now);
assert.equal(complete.status, "complete");
assert.equal(complete.weakResponseCount, 0);
assert.deepEqual(complete.incompleteReasons, []);
assert.ok(complete.completeFields.includes("roleTracks.track-1.resumeIds"));
assert.ok(complete.completeFields.includes("outreach_rules.noContactRoutingApproach"));

const weak = completeCandidateProfileAggregate(now);
weak.qualityFields = weak.qualityFields.map((field) =>
  field.section === "outreach_rules" && field.fieldKey === "hiringManagerApproach"
    ? { ...field, quality: "weak" }
    : field,
);
const weakResult = evaluateCandidateProfileQuality(weak, now);
assert.equal(weakResult.status, "incomplete");
assert.equal(weakResult.weakResponseCount, 1);
assert.ok(weakResult.weakFields.includes("outreach_rules.hiringManagerApproach"));
assert.ok(weakResult.incompleteReasons.includes("Weak required profile answer: outreach_rules.hiringManagerApproach"));

const missingRelationship = completeCandidateProfileAggregate(now);
missingRelationship.resumes[0].associatedRoleTrackIds = [];
missingRelationship.roleTracks[0].resumeIds = [];
const missingRelationshipResult = evaluateCandidateProfileQuality(missingRelationship, now);
assert.equal(missingRelationshipResult.status, "incomplete");
assert.ok(missingRelationshipResult.incompleteReasons.some((reason) => reason.includes("needs a résumé")));
assert.ok(missingRelationshipResult.incompleteReasons.some((reason) => reason.includes("must be attached to a Role Track")));

// Card 1 is pass/fail: parsing quality and the derived matching/outreach fields
// (positioning, titles, signals, strengths/gaps, fileUrl) do not gate completion —
// they come from the résumé extract, not hand entry.
const derivedFieldsBlank = completeCandidateProfileAggregate(now);
derivedFieldsBlank.resumes[0].parsingQuality = "weak";
derivedFieldsBlank.resumes[0].fileUrl = "";
derivedFieldsBlank.resumes[0].strengths = [];
derivedFieldsBlank.resumes[0].gaps = [];
derivedFieldsBlank.resumes[0].useWhen = [];
derivedFieldsBlank.resumes[0].avoidWhen = [];
derivedFieldsBlank.roleTracks[0].description = "";
derivedFieldsBlank.roleTracks[0].corePositioning = "";
derivedFieldsBlank.roleTracks[0].targetTitles = [];
derivedFieldsBlank.roleTracks[0].keyResponsibilities = [];
derivedFieldsBlank.roleTracks[0].requiredExperiencePatterns = [];
derivedFieldsBlank.roleTracks[0].strongJobSignals = [];
derivedFieldsBlank.roleTracks[0].weakJobSignals = [];
derivedFieldsBlank.roleTracks[0].mismatchSignals = [];
derivedFieldsBlank.roleTracks[0].outreachAngle = "";
derivedFieldsBlank.roleTracks[0].doNotOverclaim = [];
const derivedFieldsBlankResult = evaluateCandidateProfileQuality(derivedFieldsBlank, now);
assert.equal(derivedFieldsBlankResult.status, "complete");

// …but the résumé text itself still gates: scan-and-discard keeps only the text.
const missingText = completeCandidateProfileAggregate(now);
missingText.resumes[0].parsedText = "";
const missingTextResult = evaluateCandidateProfileQuality(missingText, now);
assert.equal(missingTextResult.status, "incomplete");
assert.ok(missingTextResult.incompleteReasons.some((reason) => reason.includes("needs résumé text")));

const missingWritingSample = completeCandidateProfileAggregate(now);
missingWritingSample.writingSamples = missingWritingSample.writingSamples.filter((sample) => sample.bucket !== "never_sound");
const missingWritingSampleResult = evaluateCandidateProfileQuality(missingWritingSample, now);
assert.equal(missingWritingSampleResult.status, "incomplete");
assert.ok(missingWritingSampleResult.incompleteReasons.includes("At least one \"never sound like this\" writing sample is required."));

console.log("public profile quality: all assertions passed");

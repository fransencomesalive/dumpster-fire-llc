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
assert.ok(missingRelationshipResult.incompleteReasons.some((reason) => reason.includes("must be attached to a resume")));
assert.ok(missingRelationshipResult.incompleteReasons.some((reason) => reason.includes("must be attached to a Role Track")));

const weakResume = completeCandidateProfileAggregate(now);
weakResume.resumes[0].parsingQuality = "weak";
const weakResumeResult = evaluateCandidateProfileQuality(weakResume, now);
assert.equal(weakResumeResult.status, "incomplete");
assert.ok(weakResumeResult.incompleteReasons.includes("Resume Program Director Resume parsing quality must be complete."));

const missingWritingSample = completeCandidateProfileAggregate(now);
missingWritingSample.writingSamples = missingWritingSample.writingSamples.filter((sample) => sample.bucket !== "never_sound");
const missingWritingSampleResult = evaluateCandidateProfileQuality(missingWritingSample, now);
assert.equal(missingWritingSampleResult.status, "incomplete");
assert.ok(missingWritingSampleResult.incompleteReasons.includes("At least one \"never sound like this\" writing sample is required."));

console.log("public profile quality: all assertions passed");

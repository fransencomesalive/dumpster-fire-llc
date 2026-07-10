import assert from "node:assert/strict";
import { regenerateCandidateProfileArtifacts } from "../lib/public-profile/profile-generation";
import { completeCandidateProfileAggregate } from "./fixtures/public-profile";

const now = "2026-06-23T12:00:00.000Z";
const baseVersion = completeCandidateProfileAggregate(now).profile.version;
const nextVersion = baseVersion + 1;

const complete = regenerateCandidateProfileArtifacts(completeCandidateProfileAggregate(now), {
  generatedAt: now,
  changeSummary: "Fixture regeneration.",
});

assert.equal(complete.profileQuality.status, "complete");
assert.equal(complete.aggregate.profile.status, "complete");
assert.equal(complete.aggregate.profile.version, nextVersion);
assert.equal(complete.aggregate.profile.markdownGeneratedAt, now);
assert.equal(complete.generatedMarkdown.profileVersion, nextVersion);
assert.equal(complete.profileVersion.version, nextVersion);
assert.equal(complete.profileVersion.changeSummary, "Fixture regeneration.");
// Profile status lives in structured rows only; the compiled markdown deliberately
// carries no quality/status block (it is outreach-generation context).
assert.doesNotMatch(complete.profileVersion.generatedMarkdown, /## Profile Quality/);
assert.doesNotMatch(complete.profileVersion.generatedMarkdown, /Status: complete/);
assert.equal(complete.persistenceRows.candidateProfile.status, "complete");
assert.equal(complete.persistenceRows.candidateProfile.version, nextVersion);
assert.equal(complete.persistenceRows.profileQuality.weak_response_count, 0);
assert.equal(complete.persistenceRows.profileVersion.change_summary, "Fixture regeneration.");

// Outreach Rules quality fields no longer gate completion — a still-required
// structural gap (a skill without evidence) drives the incomplete scenario.
const missingEvidence = completeCandidateProfileAggregate(now);
missingEvidence.skills[0].evidence = [];
const incomplete = regenerateCandidateProfileArtifacts(missingEvidence, {
  generatedAt: now,
  nextVersion: 12,
});

assert.equal(incomplete.profileQuality.status, "incomplete");
assert.equal(incomplete.aggregate.profile.status, "incomplete");
assert.equal(incomplete.aggregate.profile.version, 12);
assert.equal(incomplete.persistenceRows.candidateProfile.status, "incomplete");
assert.equal(incomplete.persistenceRows.profileQuality.weak_response_count, 0);
assert.ok(incomplete.profileQuality.incompleteReasons.some((reason) => reason.includes("needs evidence")));
assert.doesNotMatch(incomplete.profileVersion.generatedMarkdown, /Status: incomplete/);

console.log("public profile generation: all assertions passed");

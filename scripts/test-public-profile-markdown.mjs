import assert from "node:assert/strict";
import { generateCandidateProfileMarkdown } from "../lib/public-profile/profile-markdown.ts";
import { completeCandidateProfileAggregate } from "./fixtures/public-profile.ts";

const now = "2026-06-23T00:00:00.000Z";
const generated = generateCandidateProfileMarkdown(completeCandidateProfileAggregate(now), now);

assert.equal(generated.generatedAt, now);
assert.equal(generated.profileVersion, 7);
assert.match(generated.markdown, /# Candidate Profile/);
assert.match(generated.markdown, /## Voice Profile/);
assert.match(generated.markdown, /## Identity & Search/);
assert.match(generated.markdown, /## Fit Signals/);
assert.match(generated.markdown, /Program Director/);
assert.match(generated.markdown, /## Work Examples/);
assert.match(generated.markdown, /Phred/);
assert.match(generated.markdown, /Cut internal workflow turnaround 40% in two quarters\./);
assert.match(generated.markdown, /## Guardrails/);
assert.match(generated.markdown, /Never sound like this/);
assert.match(generated.markdown, /Excited to announce synergy\./);
assert.doesNotMatch(generated.markdown, /undefined|null|\[object Object\]/);

// Resume highlights are rendered so the outreach generator can quote a stat/company.
assert.match(generated.markdown, /Highlights \(stats \/ companies you can quote\):/);
assert.match(generated.markdown, /Cut release cycle time 40% at Acme Robotics/);
// ...and routed into the attached Role Track so outreach matched to a lane can quote
// lane-relevant résumé proof (resume-1 is attached to the Program Director track).
assert.match(generated.markdown, /Résumé highlights \(quotable proof from attached résumés\):/);
// Internal QA metadata must NOT reach the compiled profile.md (outreach + matching read it).
assert.doesNotMatch(generated.markdown, /## Profile Quality/);
// Search-preference lists are scan/match inputs read from the structured aggregate;
// they are deliberately absent from profile.md (outreach-generation context only).
assert.doesNotMatch(generated.markdown, /Employment types:/);
assert.doesNotMatch(generated.markdown, /Target industries:/);
assert.doesNotMatch(generated.markdown, /Avoid industries:/);
assert.doesNotMatch(generated.markdown, /Target company types:/);
assert.doesNotMatch(generated.markdown, /Avoid companies:/);
// Identity URL fields removed end-to-end (2026-07-09 remediation).
assert.doesNotMatch(generated.markdown, /LinkedIn:|Portfolio:|Website:/);
// Compensation renders in both forms, USD stated (locked decision #3).
assert.match(generated.markdown, /Compensation floor \(yearly, USD\):/);
assert.match(generated.markdown, /Preferred compensation \(yearly, USD\):/);
assert.match(generated.markdown, /Compensation floor \(hourly, USD\):/);
assert.match(generated.markdown, /Preferred compensation \(hourly, USD\):/);

console.log("public profile markdown generation: all assertions passed");

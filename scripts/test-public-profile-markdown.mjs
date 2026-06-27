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

console.log("public profile markdown generation: all assertions passed");

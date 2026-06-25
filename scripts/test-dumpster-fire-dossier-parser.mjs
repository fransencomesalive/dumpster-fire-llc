import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parseCandidateDossier, selectRelevantExamples } from "../app/scans/dossier-parser.ts";

const synthetic = `# Candidate Dossier - Test Person
version: 1
updated: 2026-06-12

## Identity & Positioning
A senior production leader useful in messy cross-functional work.
Links:
- Portfolio: https://example.com
- LinkedIn: https://linkedin.com/in/test

## Applying-As Tracks
### Track: Executive Producer
Frame: Production leadership across agencies and tech.
Target titles: Executive Producer, Head of Production
Proof points:
- Managed a $10MM retainer with a team of 4.
Not this track:
- Do not claim engineering ownership.

## Work Examples
### Example: Big Campaign
Role: Executive Producer
Story: Produced a connected campaign across digital and physical.
Metrics:
- 6 activations and 10 launches in 4 months.
Link: https://example.com/work/big
Proves: Executive Producer
Keywords: campaign, experiential, genai, production

### Example: Ops System
Role: Program lead
Story: Built an intake and approval system.
Metrics:
- Connected 4 departments and 11 tools.
Link: private
Proves: Executive Producer
Keywords: ai workflows, intake, operations

## Writing Style
Voice: Direct, specific, lightly wry.
Rules:
- DO: Use concrete nouns.
- DON'T: Use boilerplate.
Banned: synergy, passionate about
### Sample: Outreach
Short sample message text here.

## Operating Style
Looks for the real operational problem before naming qualifications.

## Decision Style
- What is actually broken?
- What proof object shows the work is familiar?

## Communication Posture
- useful
- direct
- senior
- human

## What AI Gets Wrong About Randall
- generic project manager
- corporate program manager

## Why People Hire Randall
- ambiguous work needs structure
- messy stakeholder work needs ownership

## Proof Objects
### Proof Object: Phred
Link: https://example.com/phred
Best for:
- ai workflow
- internal tools
Avoid for:
- pure event production

## Resume Facts
### Resume: Executive Producer
- Company | Title | 2020 - 2024: Did concrete things.

## Constraints
- Compensation floor: $150,000

## Outreach Strategy
- Forwardness: Direct.
- Follow-up: None.
`;

const parsed = parseCandidateDossier(synthetic);
assert.equal(parsed.name, "Test Person");
assert.equal(parsed.version, "1");
assert.equal(parsed.links.length, 2);
assert.equal(parsed.tracks.length, 1);
assert.equal(parsed.tracks[0].label, "Executive Producer");
assert.equal(parsed.tracks[0].targetTitles.length, 2);
assert.equal(parsed.tracks[0].proofPoints.length, 1);
assert.equal(parsed.examples.length, 2);
assert.equal(parsed.examples[0].metrics.length, 1);
assert.deepEqual(parsed.examples[1].keywords, ["ai workflows", "intake", "operations"]);
assert.equal(parsed.voice, "Direct, specific, lightly wry.");
assert.equal(parsed.rules.length, 2);
assert.deepEqual(parsed.banned, ["synergy", "passionate about"]);
assert.equal(parsed.samples.length, 1);
assert.ok(parsed.samples[0].text.includes("Short sample message"));
assert.ok(parsed.operatingStyle.includes("operational problem"));
assert.deepEqual(parsed.decisionStyle, ["What is actually broken?", "What proof object shows the work is familiar?"]);
assert.deepEqual(parsed.communicationPosture, ["useful", "direct", "senior", "human"]);
assert.equal(parsed.proofObjects.length, 1);
assert.equal(parsed.proofObjects[0].name, "Phred");
assert.deepEqual(parsed.proofObjects[0].bestFor, ["ai workflow", "internal tools"]);
assert.deepEqual(parsed.proofObjects[0].avoidFor, ["pure event production"]);
assert.equal(parsed.resumes.length, 1);
assert.equal(parsed.constraints.length, 1);
assert.equal(parsed.validation.missingSections.length, 0);
assert.equal(parsed.validation.needsInput.length, 0);
assert.equal(parsed.validation.ok, true);

const picked = selectRelevantExamples(parsed.examples, "We need someone for AI workflows and intake operations.", "Executive Producer", 1);
assert.equal(picked[0].name, "Ops System");

// Missing sections and NEEDS INPUT are reported, not silently accepted.
const broken = parseCandidateDossier("# Candidate Dossier - X\n\n## Identity & Positioning\nNEEDS INPUT: everything\n");
assert.ok(broken.validation.missingSections.length >= 5);
assert.equal(broken.validation.needsInput.length, 1);
assert.equal(broken.validation.ok, false);

// Randall's real dossier parses clean when present (local-only artifact).
const realPath = "local-artifacts/scans/candidate-dossier-randall-v1.md";
if (existsSync(realPath)) {
  const real = parseCandidateDossier(readFileSync(realPath, "utf8"));
  assert.equal(real.validation.ok, true, `real dossier validation failed: ${JSON.stringify(real.validation)}`);
  assert.equal(real.tracks.length, 3);
  assert.equal(real.examples.length, 8);
  assert.equal(real.samples.length, 3);
  assert.equal(real.proofObjects.length, 3);
  assert.equal(real.resumes.length, 2);
  console.log("Real dossier: ok=true |", real.examples.length, "examples |", real.resumes.reduce((a, r) => a + r.bullets.length, 0), "resume bullets");
}

console.log("Dumpster Fire dossier parser fixtures passed.");

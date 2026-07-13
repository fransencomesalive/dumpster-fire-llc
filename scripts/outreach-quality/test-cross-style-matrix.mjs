import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildControlledJobs,
  createArtifactManifest,
  buildExpectedCells,
  buildOutreachPromptParts,
  contractViolations,
  evidenceSlice,
  fingerprintInputForPersona,
  messageStyleMetrics,
  parseOutreachJson,
  renderPersonaProfile,
  sha256,
  summarizeSelectionStability,
  validateCompleteMatrix,
  validateMatrixConfig,
  verifyArtifactManifest,
  workExampleBodyViolations,
} from "./cross-style-matrix.mjs";
import { generateCandidateProfileMarkdown } from "../../lib/public-profile/profile-markdown.ts";
import { completeCandidateProfileAggregate } from "../fixtures/public-profile.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "data");
const config = JSON.parse(readFileSync(resolve(dataDir, "voice-matrix-personas-v3.json"), "utf8"));
const baseProfile = readFileSync(resolve(dataDir, "inputs/v3-profile.md"), "utf8");
const v3Corpus = JSON.parse(readFileSync(resolve(dataDir, "corpus-v3.json"), "utf8"));
const allJobs = JSON.parse(readFileSync(resolve(here, "scan-jobs.json"), "utf8"));

const shape = validateMatrixConfig(config);
assert.deepEqual(shape, { personaCount: 6, cellCount: 28 });
assert.equal(config.personas.filter((persona) => persona.kind === "full").length, 4);
assert.equal(config.personas.filter((persona) => persona.kind === "diagnostic").length, 2);
assert.deepEqual(config.shared.precedence, [
  "universal_policy",
  "hard_negatives",
  "sounds_like_me",
  "want_to_sound",
  "tone_tags",
]);
assert.equal(config.shared.approvedV3PromptHash, sha256(readFileSync(resolve(dataDir, "prompts/v3.txt"), "utf8")));

const invalidConfig = structuredClone(config);
invalidConfig.shared.sentinelJobIds[0] = "not-a-full-job";
invalidConfig.personas[0].expectations.targetCharacters = [800, 200];
invalidConfig.personas[1].avoidTags = "cold";
assert.throws(() => validateMatrixConfig(invalidConfig), /Sentinel jobs.*target character.*avoidTags/i);

const calm = config.personas.find((persona) => persona.id === "calm-polished");
assert.ok(calm.toneTags.includes("measured"), "custom tags survive as modifiers");
const conflict = config.personas.find((persona) => persona.id === "conflict-sentinel");
const conflictInput = fingerprintInputForPersona(config, conflict);
assert.ok(conflictInput.toneTags.includes("funny"));
assert.ok(conflictInput.avoidTags.includes("snarky"));
assert.match(conflictInput.avoidNote, /override/i);
assert.match(conflictInput.neverSoundSamples[0], /broken/i);
assert.equal(conflictInput.q1Value, config.shared.q1Value);
assert.equal(conflictInput.q4Opinion, config.shared.q4Opinion);

const controlledJobs = buildControlledJobs(config, v3Corpus, allJobs);
assert.equal(controlledJobs.length, 6);
assert.deepEqual(controlledJobs.map((job) => job.jobId), config.shared.fullJobIds);
assert.ok(controlledJobs.every((job) => job.description && job.inputHash.length === 64));
assert.throws(() => buildControlledJobs(config, v3Corpus, [...allJobs, allJobs[0]]), /Duplicate job ids/);
const changedJobs = structuredClone(allJobs);
changedJobs.find((job) => job.id === config.shared.fullJobIds[0]).description += " changed";
assert.throws(() => buildControlledJobs(config, v3Corpus, changedJobs), /input hash changed/);
const expectedCells = buildExpectedCells(config);
assert.equal(expectedCells.length, 28);
assert.equal(new Set(expectedCells.map((cell) => cell.cellId)).size, 28);

const originalVoice = baseProfile.slice(
  baseProfile.indexOf("## Voice Profile"),
  baseProfile.indexOf("## Identity & Search"),
);
const baseEvidence = evidenceSlice(baseProfile);
const renderedProfiles = new Map();
for (const persona of config.personas) {
  const fingerprint = `**Voice fingerprint (write like this):**\n\nSynthetic fingerprint for ${persona.id}.`;
  const rendered = renderPersonaProfile(baseProfile, config, persona, fingerprint);
  renderedProfiles.set(persona.id, rendered);
  assert.match(rendered, /^# Candidate Profile/);
  assert.equal((rendered.match(/## Voice Profile/g) || []).length, 1);
  assert.equal((rendered.match(/## Identity & Search/g) || []).length, 1);
  assert.equal((rendered.match(/## Guardrails/g) || []).length, 1);
  assert.equal(evidenceSlice(rendered), baseEvidence, "only voice/guardrail content may vary");
  assert.ok(!rendered.includes(originalVoice.trim()), "Randall's original voice block must not leak");
  assert.ok(rendered.includes(persona.soundsLikeSamples[0]));
  assert.ok(rendered.includes(persona.neverSoundSamples[0]));
  assert.ok(rendered.includes(config.shared.q1Value));
  assert.ok(rendered.includes(config.shared.q4Opinion));
}

// The harness must render Voice Profile and Guardrails exactly as production does.
const parityPersona = config.personas.find((persona) => persona.id === "warm-peer");
const parityFingerprint = "**Voice fingerprint (write like this):**\n\nSynthetic production-parity fingerprint.";
const parityAggregate = completeCandidateProfileAggregate("2026-07-13T00:00:00.000Z");
parityAggregate.voicePersonality = {
  ...parityAggregate.voicePersonality,
  q1Value: config.shared.q1Value,
  q4Opinion: config.shared.q4Opinion,
  toneTags: parityPersona.toneTags,
  avoidTags: parityPersona.avoidTags,
  avoidNote: parityPersona.avoidNote,
};
parityAggregate.writingSamples = [
  ...parityPersona.soundsLikeSamples.map((text, index) => ({
    id: `sounds-${index}`, profileId: parityAggregate.profile.id, bucket: "sounds_like_me", channel: "other", text, tags: [], createdAt: "2026-07-13T00:00:00.000Z", updatedAt: "2026-07-13T00:00:00.000Z",
  })),
  ...parityPersona.wantToSoundSamples.map((text, index) => ({
    id: `want-${index}`, profileId: parityAggregate.profile.id, bucket: "want_to_sound", channel: "other", text, tags: [], createdAt: "2026-07-13T00:00:00.000Z", updatedAt: "2026-07-13T00:00:00.000Z",
  })),
  ...parityPersona.neverSoundSamples.map((text, index) => ({
    id: `never-${index}`, profileId: parityAggregate.profile.id, bucket: "never_sound", channel: "other", text, tags: [], createdAt: "2026-07-13T00:00:00.000Z", updatedAt: "2026-07-13T00:00:00.000Z",
  })),
];
const productionMarkdown = generateCandidateProfileMarkdown(parityAggregate, "2026-07-13T00:00:00.000Z", parityFingerprint).markdown;
const harnessMarkdown = renderPersonaProfile(baseProfile, config, parityPersona, parityFingerprint);
const section = (markdown, start, end) => markdown.slice(markdown.indexOf(start), end ? markdown.indexOf(end, markdown.indexOf(start)) : undefined).trim();
assert.equal(section(harnessMarkdown, "## Voice Profile", "## Identity & Search"), section(productionMarkdown, "## Voice Profile", "## Identity & Search"));
assert.equal(section(harnessMarkdown, "## Guardrails"), section(productionMarkdown, "## Guardrails"));

for (const persona of config.personas) {
  const rendered = renderedProfiles.get(persona.id);
  for (const other of config.personas.filter((candidate) => candidate.id !== persona.id)) {
    assert.ok(!rendered.includes(other.soundsLikeSamples[0]), `${persona.id} leaked ${other.id}'s signature sample`);
  }
}

const promptParts = buildOutreachPromptParts(renderedProfiles.get("warm-peer"), controlledJobs[0]);
assert.match(promptParts.cachePrefix, /Synthetic fingerprint for warm-peer/);
assert.match(promptParts.tail, new RegExp(controlledJobs[0].title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(promptParts.tail, new RegExp(controlledJobs[0].contact.role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

const parsed = parseOutreachJson(JSON.stringify({ message: "A grounded message.", insertedExample: null }));
assert.deepEqual(parsed, { message: "A grounded message.", insertedExample: null });
assert.equal(parseOutreachJson("preface\n" + JSON.stringify({ message: "A grounded message.", insertedExample: null })), undefined);
assert.equal(parseOutreachJson(JSON.stringify({ message: "A grounded message.", insertedExample: null, extra: true })), undefined);
assert.equal(parseOutreachJson(JSON.stringify({ message: "A grounded message.", insertedExample: { link: "https://example.com" } })), undefined);
assert.equal(parseOutreachJson('{"message":"   ","insertedExample":null}'), undefined);

const metrics = messageStyleMetrics("I’ve led this work. Worth a conversation?");
assert.equal(metrics.questions, 1);
assert.equal(metrics.sentences, 2);
assert.ok(metrics.words > 4);
assert.equal(messageStyleMetrics("I'll be honest: three docs are enough. You need this. I do.").inventedNumber, 1);
assert.equal(messageStyleMetrics("I'll be honest: three docs are enough. You need this. I do.").concessionOpener, 1);

const examples = [{ oneHitter: "Exact example line.", link: "https://example.com/work" }];
assert.deepEqual(workExampleBodyViolations("Exact example line.", null, examples), ["unreported_work_example"]);
assert.deepEqual(workExampleBodyViolations("No visible example.", examples[0], examples), ["selected_example_not_obvious"]);
assert.deepEqual(workExampleBodyViolations("See https://example.com/work", examples[0], examples), []);

assert.deepEqual(contractViolations({
  message: "A grounded message.",
  insertedExample: null,
  selection: null,
  config,
}), []);
assert.ok(contractViolations({
  message: config.shared.q4Opinion,
  insertedExample: { oneHitter: "Unknown" },
  selection: null,
  config,
}).includes("q4_quoted_verbatim"));

const completeCells = expectedCells.map((cell) => ({ ...cell, message: "A grounded message.", insertedExample: null, workExampleSelection: null }));
assert.equal(validateCompleteMatrix(config, completeCells), true);
assert.throws(() => validateCompleteMatrix(config, completeCells.slice(1)), /incomplete/);
assert.throws(() => validateCompleteMatrix(config, completeCells.map((cell, index) => index === 0 ? {
  ...cell,
  insertedExample: { oneHitter: "Unknown" },
  workExampleSelection: null,
} : cell)), /unmatched/);

const selectionCells = completeCells.map((cell) => ({
  ...cell,
  workExampleSelection: cell.personaId === "minimal-direct" ? { key: "work-example-a", title: "A" } : null,
}));
const stability = summarizeSelectionStability(config, selectionCells);
assert.equal(stability.length, 6);
assert.ok(stability.every((entry) => entry.varies));

const artifactFiles = { "style-matrix-v3.json": "matrix", "prompts/style-matrix-v3.txt": "prompt" };
const manifest = createArtifactManifest(config.matrixId, "2026-07-13T00:00:00.000Z", artifactFiles);
assert.equal(verifyArtifactManifest(manifest, artifactFiles), true);
assert.throws(() => verifyArtifactManifest(manifest, { ...artifactFiles, "style-matrix-v3.json": "changed" }), /hash mismatch/);
assert.throws(() => verifyArtifactManifest(manifest, { "style-matrix-v3.json": "matrix" }), /does not match/);

console.log("outreach-quality cross-style matrix: all assertions passed");

import assert from "node:assert/strict";
import {
  buildVoiceFingerprintUserPrompt,
  generateVoiceFingerprint,
  generateVoiceProfileBlock,
  renderVoiceFingerprint,
  voiceFingerprintInput,
} from "../lib/public-profile/voice-fingerprint.ts";
import { completeCandidateProfileAggregate } from "./fixtures/public-profile.ts";

const now = "2026-06-27T00:00:00.000Z";

const sampleFingerprintJson = JSON.stringify({
  toneDescription: "Direct, specific, allergic to corporate fluff.",
  doList: ["Lead with the concrete outcome", "Keep it short"],
  dontList: ["No synergy", "No excited-to-announce"],
  exemplarLines: ["Clear and useful."],
});

// 1. Parses a well-formed model response into a fingerprint.
const fp = await generateVoiceFingerprint(
  {
    q1Value: "Untangling messy delivery.",
    q4Opinion: "Most PM is theater.",
    toneTags: ["direct", "no-fluff"],
    avoidTags: ["Corporate Jargon"],
    avoidNote: "No synergy.",
    soundsLikeSamples: ["Clear and useful."],
    wantToSoundSamples: [],
    neverSoundSamples: ["Excited to announce synergy."],
  },
  { callModel: async () => sampleFingerprintJson },
);
assert.ok(fp);
assert.equal(fp.toneDescription, "Direct, specific, allergic to corporate fluff.");
assert.deepEqual(fp.doList, ["Lead with the concrete outcome", "Keep it short"]);
assert.deepEqual(fp.exemplarLines, ["Clear and useful."]);

// 2. The user prompt carries the inputs.
const prompt = buildVoiceFingerprintUserPrompt({
  q1Value: "Untangling messy delivery.",
  q4Opinion: "Most PM is theater.",
  toneTags: ["direct"],
  avoidTags: ["Corporate Jargon"],
  avoidNote: "No synergy.",
  soundsLikeSamples: ["Clear and useful."],
  wantToSoundSamples: [],
  neverSoundSamples: ["Excited to announce synergy."],
});
assert.match(prompt, /Untangling messy delivery\./);
assert.match(prompt, /Corporate Jargon/);
assert.match(prompt, /Clear and useful\./);

// 3. Tolerates fences / surrounding prose by extracting the JSON object.
const fenced = await generateVoiceFingerprint(
  { q1Value: "x", q4Opinion: "y", toneTags: [], avoidTags: [], avoidNote: "", soundsLikeSamples: [], wantToSoundSamples: [], neverSoundSamples: [] },
  { callModel: async () => "Here you go:\n```json\n" + sampleFingerprintJson + "\n```" },
);
assert.ok(fenced);
assert.equal(fenced.toneDescription, "Direct, specific, allergic to corporate fluff.");

// 4. Graceful degradation: no model output -> undefined.
const none = await generateVoiceFingerprint(
  { q1Value: "x", q4Opinion: "y", toneTags: [], avoidTags: [], avoidNote: "", soundsLikeSamples: [], wantToSoundSamples: [], neverSoundSamples: [] },
  { callModel: async () => undefined },
);
assert.equal(none, undefined);

// 5. Malformed JSON -> undefined.
const garbage = await generateVoiceFingerprint(
  { q1Value: "x", q4Opinion: "y", toneTags: [], avoidTags: [], avoidNote: "", soundsLikeSamples: [], wantToSoundSamples: [], neverSoundSamples: [] },
  { callModel: async () => "not json at all" },
);
assert.equal(garbage, undefined);

// 6. Input builder pulls from the aggregate's voice personality + bucketed samples.
const aggregate = completeCandidateProfileAggregate(now);
const input = voiceFingerprintInput(aggregate);
assert.ok(input);
assert.equal(input.q1Value, aggregate.voicePersonality.q1Value);
assert.ok(input.soundsLikeSamples.includes("Clear and useful."));
assert.ok(input.neverSoundSamples.includes("Excited to announce synergy."));

// 7. No voice personality -> no input.
const noVoice = voiceFingerprintInput({ ...aggregate, voicePersonality: undefined });
assert.equal(noVoice, undefined);

// 8. renderVoiceFingerprint produces a usable block.
const block = renderVoiceFingerprint(fp);
assert.match(block, /Voice fingerprint \(write like this\):/);
assert.match(block, /Direct, specific/);
assert.match(block, /Do:/);
assert.match(block, /Don't:/);
assert.match(block, /> Clear and useful\./);

// 9. generateVoiceProfileBlock: aggregate -> rendered block (mocked model).
const wired = await generateVoiceProfileBlock(aggregate, { callModel: async () => sampleFingerprintJson });
assert.ok(wired);
assert.match(wired, /Voice fingerprint \(write like this\):/);

// 10. generateVoiceProfileBlock returns undefined when there's nothing to distill.
const wiredNone = await generateVoiceProfileBlock({ ...aggregate, voicePersonality: undefined }, { callModel: async () => sampleFingerprintJson });
assert.equal(wiredNone, undefined);

console.log("public profile voice fingerprint: all assertions passed");

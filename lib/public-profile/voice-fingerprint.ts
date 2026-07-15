import type { CandidateProfileAggregate } from "./types";

// Voice-fingerprint pre-pass: distill the raw Voice & Personality inputs into a
// compact "write like this" block that sits at the top of profile.md. The model
// call is injected (deps.callModel) so it can be mocked in tests and skipped
// gracefully when no ANTHROPIC_API_KEY is provisioned.

export type VoiceFingerprintInput = {
  q1Value: string;
  q4Opinion: string;
  toneTags: string[];
  avoidTags: string[];
  avoidNote: string;
  soundsLikeSamples: string[];
  wantToSoundSamples: string[];
  neverSoundSamples: string[];
};

export type VoiceFingerprint = {
  toneDescription: string;
  doList: string[];
  dontList: string[];
  exemplarLines: string[];
};

export type VoiceFingerprintModelCall = (args: {
  system: string;
  user: string;
}) => Promise<string | undefined>;

export type VoiceFingerprintDependencies = {
  callModel?: VoiceFingerprintModelCall;
};

// Register-only extraction (revised 2026-07-14). The original pre-pass lifted exemplar
// lines straight from the user's samples — the generator then mined those quotes for
// vocabulary, so one user's pet imagery ("nautical") became a per-message template. The
// fingerprint must capture HOW a person writes (rhythm, formality, humor register,
// confidence), never WHAT they write about (imagery, metaphor domains, pet phrases) —
// that boundary is what keeps any single user's quirks from templating their messages.
const systemPrompt = [
  "You distill how a person WRITES — their register — into a compact directive an outreach",
  "generator will obey when writing as them. You are given their answers, tone tags, and short",
  "writing samples.",
  "",
  "Extract the HOW, never the WHAT. Describe rhythm, sentence shape, formality, directness,",
  "humor register, and confidence level. Do NOT catalogue or prescribe their subject matter,",
  "imagery, metaphor domains, running jokes, or pet phrases: those are content, and repeating",
  "them would turn this person's writing into a template. If the samples lean on one vivid",
  "metaphor family (say, sports or seafaring), you may note the appetite ('comfortable reaching",
  "for a playful metaphor') without naming or reusing the family.",
  "",
  "Describe QUALITIES, never prescribe devices. A directive like 'use fragments,' 'use",
  "asides,' 'open cold,' or 'state opinions with confidence' becomes a per-message quota the",
  "generator over-applies — turning one person's occasional habit into every message's",
  "template, and licensing over-confident or choppy writing. Say what the voice is like",
  "('direct,' 'warm,' 'economical,' 'lightly self-deprecating'), not which grammatical or",
  "rhetorical moves to make.",
  "",
  "Output ONLY a JSON object with these keys:",
  '"toneDescription" (2-3 sentences on how they sound: rhythm, formality, humor register,',
  "confidence — no imagery, topics, or phrases from the samples),",
  '"doList" (array of short QUALITY directives — how the voice should feel, never which',
  "devices to deploy),",
  '"dontList" (array of short avoid-directives, including any anti-patterns they flagged),',
  '"exemplarLines" (1-2 short lines that demonstrate the RHYTHM and register using neutral,',
  "generic subject matter — never their signature imagery, phrases, or topics).",
  "No prose outside the JSON. No markdown fences.",
].join("\n");

function bulletize(label: string, values: string[]) {
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  if (cleaned.length === 0) return `${label}: (none)`;
  return `${label}:\n${cleaned.map((value) => `- ${value}`).join("\n")}`;
}

export function buildVoiceFingerprintUserPrompt(input: VoiceFingerprintInput) {
  return [
    `What they are the person for: ${input.q1Value.trim() || "(not captured)"}`,
    `An opinion they will defend: ${input.q4Opinion.trim() || "(not captured)"}`,
    bulletize("Tone tags", input.toneTags),
    bulletize("Avoid (anti-pattern tags)", input.avoidTags),
    `Avoid note: ${input.avoidNote.trim() || "(none)"}`,
    bulletize("Sounds-like-me samples", input.soundsLikeSamples),
    bulletize("Want-to-sound-like-this samples", input.wantToSoundSamples),
    bulletize("Never-sound-like-this samples", input.neverSoundSamples),
  ].join("\n\n");
}

export function voiceFingerprintInput(aggregate: CandidateProfileAggregate): VoiceFingerprintInput | undefined {
  const voice = aggregate.voicePersonality;
  if (!voice) return undefined;
  const samplesByBucket = (bucket: "sounds_like_me" | "want_to_sound" | "never_sound") =>
    aggregate.writingSamples
      .filter((sample) => sample.bucket === bucket)
      .map((sample) => sample.text);
  return {
    q1Value: voice.q1Value,
    q4Opinion: voice.q4Opinion,
    toneTags: voice.toneTags,
    avoidTags: voice.avoidTags,
    avoidNote: voice.avoidNote,
    soundsLikeSamples: samplesByBucket("sounds_like_me"),
    wantToSoundSamples: samplesByBucket("want_to_sound"),
    neverSoundSamples: samplesByBucket("never_sound"),
  };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function extractJsonObject(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return undefined;
  return trimmed.slice(start, end + 1);
}

// Default model call. Lazily imports the SDK so the module has no hard runtime
// dependency on it (tests inject callModel and never reach this path). Returns
// undefined when no API key is configured, so the pipeline degrades to the raw
// Voice & Personality inputs in profile.md.
const defaultCallModel: VoiceFingerprintModelCall = async ({ system, user }) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.info("[llm:voice-fingerprint] skipped: no ANTHROPIC_API_KEY");
    return undefined;
  }
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
    });
    const textBlock = response.content.find((block) => block.type === "text");
    return textBlock && "text" in textBlock ? textBlock.text : undefined;
  } catch (error) {
    const err = error as { name?: string; status?: number; message?: string };
    console.error("[llm:voice-fingerprint] call failed", { name: err?.name, status: err?.status, message: err?.message });
    return undefined;
  }
};

export async function generateVoiceFingerprint(
  input: VoiceFingerprintInput,
  dependencies: VoiceFingerprintDependencies = {},
): Promise<VoiceFingerprint | undefined> {
  const callModel = dependencies.callModel ?? defaultCallModel;
  const raw = await callModel({ system: systemPrompt, user: buildVoiceFingerprintUserPrompt(input) });
  if (!raw) return undefined;
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return undefined;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    if (typeof parsed.toneDescription !== "string" || !parsed.toneDescription.trim()) return undefined;
    return {
      toneDescription: parsed.toneDescription.trim(),
      doList: toStringArray(parsed.doList),
      dontList: toStringArray(parsed.dontList),
      exemplarLines: toStringArray(parsed.exemplarLines),
    };
  } catch {
    return undefined;
  }
}

export function renderVoiceFingerprint(fingerprint: VoiceFingerprint): string {
  const lines = [
    "**Voice fingerprint (write like this):**",
    "",
    fingerprint.toneDescription,
  ];
  if (fingerprint.doList.length > 0) {
    lines.push("", "Do:", ...fingerprint.doList.map((item) => `- ${item}`));
  }
  if (fingerprint.dontList.length > 0) {
    lines.push("", "Don't:", ...fingerprint.dontList.map((item) => `- ${item}`));
  }
  if (fingerprint.exemplarLines.length > 0) {
    lines.push("", "Exemplar lines (rhythm and register reference only — not vocabulary to reuse):", ...fingerprint.exemplarLines.map((item) => `> ${item}`));
  }
  return lines.join("\n");
}

// Convenience: aggregate -> rendered Voice Profile block (or undefined). Wired
// into the regeneration flow so profile.md leads with the distilled fingerprint.
export async function generateVoiceProfileBlock(
  aggregate: CandidateProfileAggregate,
  dependencies: VoiceFingerprintDependencies = {},
): Promise<string | undefined> {
  const input = voiceFingerprintInput(aggregate);
  if (!input) return undefined;
  const fingerprint = await generateVoiceFingerprint(input, dependencies);
  if (!fingerprint) return undefined;
  return renderVoiceFingerprint(fingerprint);
}

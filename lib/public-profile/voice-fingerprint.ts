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

const systemPrompt = [
  "You distill a person's writing voice into a compact directive an outreach",
  "generator will obey when writing as them. You are given their answers, tone",
  "tags, and short writing samples. Output ONLY a JSON object with these keys:",
  '"toneDescription" (2-3 sentences describing how they sound),',
  '"doList" (array of short do-this directives),',
  '"dontList" (array of short avoid-this directives),',
  '"exemplarLines" (1-2 short lines lifted or closely modeled on their',
  '"sounds like me" samples). No prose outside the JSON. No markdown fences.',
].join(" ");

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
    lines.push("", "Exemplar lines:", ...fingerprint.exemplarLines.map((item) => `> ${item}`));
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

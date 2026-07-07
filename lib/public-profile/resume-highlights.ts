import type { CandidateProfileAggregate } from "./types";

// Résumé-highlights pre-pass: read a résumé's plain text and pull out the short,
// quotable stat / company / title bullets an outreach message can cite — a
// résumé-level proof point that sits alongside a Work Example and a Skill. This
// is a metered model pass (capped per month, like the voice fingerprint) and the
// model call is injected (deps.callModel) so it can be mocked in tests and
// skipped gracefully when no ANTHROPIC_API_KEY is provisioned. When it degrades,
// the caller keeps whatever highlights are already cached on the résumé.

export type ResumeHighlightsInput = {
  resumeName: string;
  parsedText: string;
};

export type ResumeHighlightsModelCall = (args: {
  system: string;
  user: string;
}) => Promise<string | undefined>;

export type ResumeHighlightsDependencies = {
  callModel?: ResumeHighlightsModelCall;
};

const MAX_HIGHLIGHTS = 6;

const systemPrompt = [
  "You pull quotable proof points out of a résumé so an outreach generator can",
  "cite them. Return the concrete, specific lines a candidate could drop into a",
  "message to a hiring contact: metrics and outcomes (\"cut deploy time 40%\"),",
  "scope (\"managed a team of 8\"), and notable titles or companies (\"Director of",
  "Engineering at Stripe\"). Keep each highlight to one short phrase; do not copy",
  "whole sentences or responsibilities. Use ONLY facts present in the résumé text",
  "— never invent numbers, companies, or titles. If the text is too sparse,",
  "garbled, or unstructured to yield real proof points, return an empty list.",
  `Return AT MOST ${MAX_HIGHLIGHTS} highlights, strongest first. Output ONLY a`,
  'JSON object: {"highlights": string[]}. No prose, no markdown fences.',
].join(" ");

export function buildResumeHighlightsUserPrompt(input: ResumeHighlightsInput) {
  return [
    `Résumé: ${input.resumeName.trim() || "(untitled)"}`,
    "",
    "Résumé text:",
    input.parsedText.trim(),
  ].join("\n");
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
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
// undefined when no API key is configured, so the caller keeps cached highlights.
const defaultCallModel: ResumeHighlightsModelCall = async ({ system, user }) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.info("[llm:resume-highlights] skipped: no ANTHROPIC_API_KEY");
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
    console.error("[llm:resume-highlights] call failed", { name: err?.name, status: err?.status, message: err?.message });
    return undefined;
  }
};

// Derive highlights for a single résumé. Returns undefined when the model is
// unavailable or the response is unusable (caller preserves cached highlights),
// or a (possibly empty) array when the model ran — an empty array is a real
// answer meaning "nothing quotable here".
export async function generateResumeHighlights(
  input: ResumeHighlightsInput,
  dependencies: ResumeHighlightsDependencies = {},
): Promise<string[] | undefined> {
  if (!input.parsedText.trim()) return undefined;
  const callModel = dependencies.callModel ?? defaultCallModel;
  const raw = await callModel({ system: systemPrompt, user: buildResumeHighlightsUserPrompt(input) });
  if (!raw) return undefined;
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return undefined;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    if (!("highlights" in parsed)) return undefined;
    return toStringArray(parsed.highlights).slice(0, MAX_HIGHLIGHTS);
  } catch {
    return undefined;
  }
}

// Derive highlights for every résumé in the aggregate that has text. Returns a
// map keyed by résumé id containing only the résumés the model actually produced
// a result for; résumés absent from the map keep their cached highlights. Returns
// undefined when nothing was derived at all (no text, or the model was skipped).
export async function deriveResumeHighlightsForAggregate(
  aggregate: CandidateProfileAggregate,
  dependencies: ResumeHighlightsDependencies = {},
): Promise<Map<string, string[]> | undefined> {
  const results = new Map<string, string[]>();
  for (const resume of aggregate.resumes) {
    if (!resume.parsedText.trim()) continue;
    const highlights = await generateResumeHighlights(
      { resumeName: resume.name, parsedText: resume.parsedText },
      dependencies,
    );
    if (highlights !== undefined) results.set(resume.id, highlights);
  }
  return results.size > 0 ? results : undefined;
}

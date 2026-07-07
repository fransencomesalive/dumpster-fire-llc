import type { ParsingQuality } from "./types";

// Résumé PDF scan — scan-and-discard. Claude reads an uploaded PDF natively (no
// separate parser library, PDF only) and returns its plain text plus a parse-quality
// verdict; we never store the file. The model call is injected so it can be mocked in
// tests and skipped gracefully when no ANTHROPIC_API_KEY is provisioned — in which
// case the caller falls back to the paste-the-text path.

export type ResumeParseVerdict = {
  parsingQuality: ParsingQuality; // complete | weak | failed
  extractedText: string;
  issue?: string; // short, human reason when the text is weak/failed
  suggestion?: string; // how to fix (re-export as a text PDF, paste the text, …)
};

export type ResumeParseModelCall = (args: {
  system: string;
  instruction: string;
  pdfBase64: string;
}) => Promise<string | undefined>;

export type ResumeParseDependencies = {
  callModel?: ResumeParseModelCall;
};

const parsingQualities = new Set<ParsingQuality>(["failed", "weak", "complete"]);

const systemPrompt = [
  "You read a candidate's résumé from a PDF and return two things: the résumé's",
  "plain text, and an honest verdict on how cleanly it read. Output ONLY a JSON",
  "object with keys:",
  '"parsingQuality" — one of "complete" (clean selectable text, fully extracted),',
  '"weak" (text came through but messy or partial — heavy tables/columns/graphics),',
  'or "failed" (no usable text — scanned images, encrypted, or empty);',
  '"extractedText" — the résumé text as plain text (empty string when failed);',
  '"issue" — one short human sentence on what went wrong (omit or empty when complete);',
  '"suggestion" — one short human sentence on how to fix it (omit or empty when complete).',
  "Never invent content that is not in the PDF. No prose or markdown outside the JSON.",
].join(" ");

const instruction = "Extract this résumé's text and judge how cleanly it parsed. Return the JSON object only.";

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function extractJsonObject(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return undefined;
  return trimmed.slice(start, end + 1);
}

// Default model call. Sends the PDF as a base64 document block (native PDF support —
// no beta header). Lazily imports the SDK so the module has no hard runtime dependency
// on it (tests inject callModel and never reach this path).
const defaultCallModel: ResumeParseModelCall = async ({ system, instruction: userInstruction, pdfBase64 }) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.info("[llm:resume-parse] skipped: no ANTHROPIC_API_KEY");
    return undefined;
  }
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8192,
      system,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
            { type: "text", text: userInstruction },
          ],
        },
      ],
    });
    const textBlock = response.content.find((block) => block.type === "text");
    return textBlock && "text" in textBlock ? textBlock.text : undefined;
  } catch (error) {
    const err = error as { name?: string; status?: number; message?: string };
    console.error("[llm:resume-parse] call failed", { name: err?.name, status: err?.status, message: err?.message });
    return undefined;
  }
};

// Read a résumé PDF (base64) into text + a parse verdict. Returns undefined when the
// model is unavailable or the response is unusable, so the caller can fall back to the
// paste-the-text path.
export async function generateResumeParse(
  pdfBase64: string,
  dependencies: ResumeParseDependencies = {},
): Promise<ResumeParseVerdict | undefined> {
  const callModel = dependencies.callModel ?? defaultCallModel;
  const raw = await callModel({ system: systemPrompt, instruction, pdfBase64 });
  if (!raw) return undefined;
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return undefined;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const parsingQuality = parsingQualities.has(parsed.parsingQuality as ParsingQuality)
      ? (parsed.parsingQuality as ParsingQuality)
      : undefined;
    if (!parsingQuality) return undefined;
    const extractedText = typeof parsed.extractedText === "string" ? parsed.extractedText.trim() : "";
    // A "complete"/"weak" verdict with no text is contradictory — treat as failed.
    const normalizedQuality: ParsingQuality = extractedText ? parsingQuality : "failed";
    return {
      parsingQuality: normalizedQuality,
      extractedText,
      issue: optionalString(parsed.issue),
      suggestion: optionalString(parsed.suggestion),
    };
  } catch {
    return undefined;
  }
}

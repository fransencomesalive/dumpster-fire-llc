// Phase 2 LLM posting extractor — gap-fills Responsibilities / Required experience for postings
// the heuristic parser (parse-posting.ts) could not read (no recognizable section headings).
// Follows the repo AI convention: injected callModel, lazy Anthropic SDK, claude-opus-4-8,
// graceful no-key degradation (returns empty so the caller leaves the field empty).
import type { ParsedPosting } from "./parse-posting";
import {
  ANTHROPIC_MODEL,
  callMeteredAnthropicText,
  type ProviderUsageContext,
} from "../../costs/anthropic-usage";

export type PostingModelCall = (input: {
  system: string;
  user: string;
  maxTokens?: number;
}) => Promise<string | undefined>;

export type PostingExtractInput = {
  title: string;
  companyName: string;
  description: string;
};

export type PostingSectionExtractionOutcome =
  | "complete"
  | "partial"
  | "no_fill"
  | "invalid"
  | "unavailable";

export type PostingSectionExtractionResult = {
  sections: ParsedPosting;
  outcome: PostingSectionExtractionOutcome;
};

const MAX_ITEMS = 6;
const MAX_DESCRIPTION_CHARS = 6000;
const MAX_SOURCE_TEXT_CHARS = 30_000;
const MAX_EXTRACTED_DESCRIPTION_CHARS = 12_000;

const SYSTEM_PROMPT = [
  "You extract two lists from a job posting.",
  "Return ONLY a JSON object of the form:",
  '{"responsibilities": string[], "requiredExperience": string[]}',
  "responsibilities = what the person will do in the role.",
  "requiredExperience = qualifications, skills, and experience the role requires.",
  "Each array holds up to 6 short, concrete bullet strings taken from the posting (no numbering, no markdown).",
  "Use the posting's own wording, condensed. If a list is genuinely absent, return [].",
  "Output the JSON only — no preamble, no code fences, no commentary.",
].join("\n");

const FULL_POSTING_SYSTEM_PROMPT = [
  "You extract one job posting from plain text captured from a public job page.",
  "Return ONLY a JSON object of the form:",
  '{"title": string, "companyName": string, "description": string, "responsibilities": string[], "requiredExperience": string[]}',
  "title and companyName must identify the specific role and employer.",
  "description must contain the substantive job-posting text, excluding navigation, cookie notices, and generic site chrome.",
  "responsibilities = up to 6 short, concrete items describing what the person will do.",
  "requiredExperience = up to 6 short, concrete qualifications, skills, or experience requirements.",
  "Do not invent missing details. If this is not a specific readable job posting, return an empty title, companyName, and description.",
  "Output the JSON only, with no preamble, code fences, or commentary.",
].join("\n");

function buildUserPrompt(input: PostingExtractInput) {
  return [
    `Title: ${input.title}`,
    `Company: ${input.companyName}`,
    "",
    "Posting:",
    input.description.slice(0, MAX_DESCRIPTION_CHARS),
  ].join("\n");
}

function defaultCallModel(
  operation: "pasted_job_extraction" | "posting_section_refinement",
  providerUsage?: ProviderUsageContext,
): PostingModelCall {
  return async ({ system, user, maxTokens }) =>
    callMeteredAnthropicText({
      operation,
      logLabel: "posting-extract",
      usageContext: providerUsage,
      request: {
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens ?? 1024,
        system,
        messages: [{ role: "user", content: user }],
      },
    });
}

export type ExtractedJobPosting = ParsedPosting & {
  title: string;
  companyName: string;
  description: string;
};

export type JobPostingExtractionOutcome =
  | "success"
  | "no_fill"
  | "invalid"
  | "unavailable";

export type JobPostingExtractionResult = {
  posting?: ExtractedJobPosting;
  outcome: JobPostingExtractionOutcome;
};

function cleanRequiredText(value: unknown, maxChars: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, maxChars);
}

export function parseJobPostingModelJson(raw: string | undefined): ExtractedJobPosting | undefined {
  return parseJobPostingModelJsonDetailed(raw).posting;
}

export function parseJobPostingModelJsonDetailed(
  raw: string | undefined,
): JobPostingExtractionResult {
  if (raw === undefined) return { outcome: "unavailable" };
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return { outcome: "invalid" };

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const title = cleanRequiredText(parsed.title, 300);
    const companyName = cleanRequiredText(parsed.companyName, 300);
    const description = cleanRequiredText(parsed.description, MAX_EXTRACTED_DESCRIPTION_CHARS);
    if (!title || !companyName || !description) return { outcome: "no_fill" };

    return {
      outcome: "success",
      posting: {
        title,
        companyName,
        description,
        ...parsePostingModelJson(raw),
      },
    };
  } catch {
    return { outcome: "invalid" };
  }
}

export async function extractJobPostingDetailedLLM(
  input: { sourceUrl: string; pageText: string },
  dependencies: {
    callModel?: PostingModelCall;
    providerUsage?: ProviderUsageContext;
  } = {},
): Promise<JobPostingExtractionResult> {
  const callModel = dependencies.callModel
    ?? defaultCallModel("pasted_job_extraction", dependencies.providerUsage);
  const raw = await callModel({
    system: FULL_POSTING_SYSTEM_PROMPT,
    user: [
      `Source URL: ${input.sourceUrl}`,
      "",
      "Captured page text:",
      input.pageText.slice(0, MAX_SOURCE_TEXT_CHARS),
    ].join("\n"),
    maxTokens: 4096,
  });
  return parseJobPostingModelJsonDetailed(raw);
}

export async function extractJobPostingLLM(
  input: { sourceUrl: string; pageText: string },
  dependencies: {
    callModel?: PostingModelCall;
    providerUsage?: ProviderUsageContext;
  } = {},
): Promise<ExtractedJobPosting | undefined> {
  return (await extractJobPostingDetailedLLM(input, dependencies)).posting;
}

function cleanItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const item = entry.replace(/^[\s•●▪‣*\-–—]+/, "").replace(/\s+/g, " ").trim();
    const key = item.toLowerCase();
    if (item.length < 8 || item.length > 240 || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= MAX_ITEMS) break;
  }
  return output;
}

// Pull the JSON object out of a model response (tolerate stray prose or code fences).
export function parsePostingModelJson(raw: string | undefined): ParsedPosting {
  return parsePostingModelJsonDetailed(raw).sections;
}

export function parsePostingModelJsonDetailed(
  raw: string | undefined,
): PostingSectionExtractionResult {
  const empty: ParsedPosting = { responsibilities: [], requiredExperience: [] };
  if (raw === undefined) return { sections: empty, outcome: "unavailable" };
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return { sections: empty, outcome: "invalid" };
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const sections = {
      responsibilities: cleanItems(parsed.responsibilities),
      requiredExperience: cleanItems(parsed.requiredExperience),
    };
    const outcome = sections.responsibilities.length > 0
      && sections.requiredExperience.length > 0
      ? "complete"
      : sections.responsibilities.length > 0
        || sections.requiredExperience.length > 0
        ? "partial"
        : "no_fill";
    return { sections, outcome };
  } catch {
    return { sections: empty, outcome: "invalid" };
  }
}

export async function extractPostingSectionsDetailedLLM(
  input: PostingExtractInput,
  dependencies: {
    callModel?: PostingModelCall;
    providerUsage?: ProviderUsageContext;
  } = {},
): Promise<PostingSectionExtractionResult> {
  const callModel = dependencies.callModel
    ?? defaultCallModel("posting_section_refinement", dependencies.providerUsage);
  const raw = await callModel({ system: SYSTEM_PROMPT, user: buildUserPrompt(input) });
  return parsePostingModelJsonDetailed(raw);
}

export async function extractPostingSectionsLLM(
  input: PostingExtractInput,
  dependencies: {
    callModel?: PostingModelCall;
    providerUsage?: ProviderUsageContext;
  } = {},
): Promise<ParsedPosting> {
  return (
    await extractPostingSectionsDetailedLLM(input, dependencies)
  ).sections;
}

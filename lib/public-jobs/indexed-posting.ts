import {
  ANTHROPIC_HAIKU_MODEL,
  callMeteredAnthropicText,
  type ProviderUsageContext,
} from "../costs/anthropic-usage";
import {
  parseJobPostingModelJsonDetailed,
  type ExtractedJobPosting,
} from "../scan/sources/llm-extract-posting";

export type IndexedPostingResolution = {
  posting: ExtractedJobPosting;
  canonicalUrl: string;
  evidenceUrls: string[];
};

export type IndexedPostingCall = (input: {
  system: string;
  user: string;
  sourceUrl: string;
}) => Promise<string | undefined>;

export type IndexedPostingDependencies = {
  callModel?: IndexedPostingCall;
  providerUsage?: ProviderUsageContext;
};

const SYSTEM_PROMPT = [
  "You recover one specific public job posting when its original page blocks a normal server fetch.",
  "Fetch the exact URL first. If that fails, search by its durable posting identifier and locate the",
  "same current role on the employer's official careers site or another indexed public source.",
  "Never substitute a similar role. Title and employer must be supported by the retrieved sources.",
  "Return ONLY one JSON object with this shape:",
  '{"sourceUrl": string, "canonicalUrl": string, "title": string, "companyName": string,',
  '"description": string, "responsibilities": string[], "requiredExperience": string[],',
  '"evidenceUrls": string[]}',
  "sourceUrl must exactly repeat the supplied URL. canonicalUrl is the employer page when verified,",
  "otherwise the exact supplied posting URL. description must preserve the substantive posting text.",
  "Use up to 6 concrete responsibilities and 6 concrete requirements. Do not invent missing details.",
  'If the exact posting cannot be verified, return {"status":"unavailable"}.',
  "No markdown fences, preamble, notes, or commentary.",
].join("\n");

function normalizeComparableUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((entry) => {
    if (typeof entry !== "string") return [];
    const normalized = normalizeComparableUrl(entry.trim());
    return normalized ? [normalized] : [];
  }))];
}

export function parseIndexedPostingResponse(
  raw: string | undefined,
  sourceUrl: string,
): IndexedPostingResolution | undefined {
  if (!raw) return undefined;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;

  try {
    const json = raw.slice(start, end + 1);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (parsed.status === "unavailable") return undefined;
    const expectedSource = normalizeComparableUrl(sourceUrl);
    const returnedSource = typeof parsed.sourceUrl === "string"
      ? normalizeComparableUrl(parsed.sourceUrl)
      : undefined;
    const canonicalUrl = typeof parsed.canonicalUrl === "string"
      ? normalizeComparableUrl(parsed.canonicalUrl)
      : undefined;
    const evidenceUrls = stringArray(parsed.evidenceUrls);
    if (!expectedSource || returnedSource !== expectedSource || !canonicalUrl) return undefined;
    if (!evidenceUrls.includes(expectedSource) && !evidenceUrls.includes(canonicalUrl)) return undefined;

    const extraction = parseJobPostingModelJsonDetailed(json);
    if (
      extraction.outcome !== "success"
      || !extraction.posting
      || extraction.posting.description.length < 80
    ) {
      return undefined;
    }
    return {
      posting: extraction.posting,
      canonicalUrl,
      evidenceUrls,
    };
  } catch {
    return undefined;
  }
}

function defaultCallModel(providerUsage?: ProviderUsageContext): IndexedPostingCall {
  return async ({ system, user }) => callMeteredAnthropicText({
    operation: "pasted_job_indexed_retrieval",
    logLabel: "job-link-indexed-retrieval",
    usageContext: providerUsage,
    timeoutMs: 40_000,
    maxRetries: 0,
    request: {
      model: ANTHROPIC_HAIKU_MODEL,
      max_tokens: 4096,
      system,
      tools: [
        {
          type: "web_fetch_20250910",
          name: "web_fetch",
          max_uses: 1,
          max_content_tokens: 10_000,
        },
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 2,
        },
      ],
      messages: [{ role: "user", content: user }],
    },
  });
}

export async function resolveIndexedJobPosting(
  sourceUrl: string,
  dependencies: IndexedPostingDependencies = {},
): Promise<IndexedPostingResolution | undefined> {
  const callModel = dependencies.callModel ?? defaultCallModel(dependencies.providerUsage);
  const raw = await callModel({
    system: SYSTEM_PROMPT,
    sourceUrl,
    user: [
      `Source URL: ${sourceUrl}`,
      "",
      "Recover and verify this exact posting. Return the required JSON only.",
    ].join("\n"),
  });
  return parseIndexedPostingResponse(raw, sourceUrl);
}

import { createHash, randomUUID } from "node:crypto";
import type { PublicProfileRepositoryRequest } from "../public-profile/repository";
import { createBestEffortProviderUsageSink } from "../costs/provider-usage";
import {
  extractJobPostingDetailedLLM,
  type ExtractedJobPosting,
  type JobPostingExtractionOutcome,
  type PostingModelCall,
} from "../scan/sources/llm-extract-posting";
import { parsePosting } from "../scan/sources/parse-posting";
import { textFromHtml } from "../scan/sources/connectors";
import { assertSafePublicUrl, type HostnameResolver } from "../scan/sources/url-safety";

type StoredJob = {
  id: string;
  title: string;
  company_name: string;
};

type ReusableJob = StoredJob & {
  description: string;
  responsibilities: string[] | null;
  required_experience: string[] | null;
};

type ExtractionClaimRow = {
  claimed: boolean;
  claim_token: string | null;
  claim_state: string;
  attempt_count: number;
};

export type IngestJobFromLinkResult =
  | { status: "invalid_url" }
  | { status: "unsafe_url" }
  | { status: "fetch_failed" }
  | { status: "unsupported_content" }
  | { status: "response_too_large" }
  | { status: "extraction_unavailable" }
  | { status: "already_known"; jobId: string; title: string; company: string }
  | { status: "ingested"; jobId: string; title: string; company: string };

export type IngestJobFromLinkDependencies = {
  request: PublicProfileRepositoryRequest;
  fetchImpl?: typeof fetch;
  resolveHostname?: HostnameResolver;
  callModel?: PostingModelCall;
  now?: () => string;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 5;

function qs(params: Record<string, string>) {
  return `?${new URLSearchParams(params).toString()}`;
}

function normalizeUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl.trim());
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

// Dedupe against shared-pool rows and the user's own private rows only; another
// user's private paste must never match (returning its id would leak it).
async function findJobBySourceUrl(request: PublicProfileRepositoryRequest, sourceUrl: string, userId: string) {
  const rows = await request<StoredJob[]>("jobs", {
    query: qs({
      source_url: `eq.${sourceUrl}`,
      or: `(owner_user_id.is.null,owner_user_id.eq.${userId})`,
      select: "id,title,company_name",
      limit: "1",
    }),
  });
  return rows[0];
}

async function findJobBySourceContentHash(
  request: PublicProfileRepositoryRequest,
  sourceContentHash: string,
  userId: string,
) {
  const rows = await request<ReusableJob[]>("jobs", {
    query: qs({
      source: "eq.user_link",
      owner_user_id: `eq.${userId}`,
      source_content_hash: `eq.${sourceContentHash}`,
      select: "id,title,company_name,description,responsibilities,required_experience",
      limit: "1",
    }),
  });
  return rows[0];
}

function knownResult(job: StoredJob): Extract<IngestJobFromLinkResult, { status: "already_known" }> {
  return {
    status: "already_known",
    jobId: job.id,
    title: job.title,
    company: job.company_name,
  };
}

// Client-rendered boards (Ashby, new Greenhouse, Lever) serve an HTML shell
// whose visible text is just "enable JavaScript" — but the posting ships in a
// schema.org JSON-LD JobPosting block. Read that before falling back to
// stripped page text.
function jobPostingFromJsonLd(html: string): {
  pageText: string;
  posting?: ExtractedJobPosting;
} | undefined {
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      continue;
    }
    const top = Array.isArray(parsed) ? parsed : [parsed];
    const nodes = top.flatMap((node) =>
      node && typeof node === "object" && Array.isArray((node as Record<string, unknown>)["@graph"])
        ? ((node as Record<string, unknown>)["@graph"] as unknown[])
        : [node]);
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const posting = node as Record<string, unknown>;
      const type = posting["@type"];
      const isJobPosting = type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
      if (!isJobPosting) continue;
      const description = typeof posting.description === "string" ? textFromHtml(posting.description) : "";
      if (!description) continue;
      const organization = posting.hiringOrganization;
      const companyName = organization && typeof organization === "object"
        && typeof (organization as Record<string, unknown>).name === "string"
        ? (organization as Record<string, unknown>).name as string
        : "";
      const title = typeof posting.title === "string" ? posting.title.trim() : "";
      const pageText = [
        title ? `Job title: ${title}` : "",
        companyName ? `Company: ${companyName}` : "",
        typeof posting.employmentType === "string" && posting.employmentType ? `Employment type: ${posting.employmentType}` : "",
        description,
      ].filter(Boolean).join("\n");
      if (!title || !companyName.trim()) return { pageText };
      return {
        pageText,
        posting: {
          title,
          companyName: companyName.trim(),
          description,
          ...parsePosting(description),
        },
      };
    }
  }
  return undefined;
}

function sourceContentHash(pageText: string) {
  const normalized = pageText.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

function sourceUrlHash(sourceUrl: string) {
  return createHash("sha256").update(sourceUrl, "utf8").digest("hex");
}

async function claimModelExtraction(
  request: PublicProfileRepositoryRequest,
  input: {
    userId: string;
    sourceUrlHash: string;
    contentHash: string;
    now: string;
  },
) {
  const rows = await request<ExtractionClaimRow[]>("rpc/claim_job_link_extraction", {
    method: "POST",
    body: {
      p_user_id: input.userId,
      p_source_url_hash: input.sourceUrlHash,
      p_content_hash: input.contentHash,
      p_now: input.now,
    },
  });
  const row = rows[0];
  return row?.claimed && row.claim_token ? row.claim_token : undefined;
}

async function finishModelExtraction(
  request: PublicProfileRepositoryRequest,
  input: {
    userId: string;
    sourceUrlHash: string;
    contentHash: string;
    claimToken: string;
    outcome: JobPostingExtractionOutcome | "error";
    jobId?: string;
    now: string;
  },
) {
  await request("rpc/finish_job_link_extraction", {
    method: "POST",
    body: {
      p_user_id: input.userId,
      p_source_url_hash: input.sourceUrlHash,
      p_content_hash: input.contentHash,
      p_claim_token: input.claimToken,
      p_outcome: input.outcome,
      p_job_id: input.jobId,
      p_now: input.now,
    },
  });
}

async function readResponseWithLimit(response: Response, maxBytes: number, controller: AbortController) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return { status: "response_too_large" } as const;
  if (!response.body) return { status: "fetch_failed" } as const;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let body = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        controller.abort();
        await reader.cancel().catch(() => undefined);
        return { status: "response_too_large" } as const;
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return { status: "ok", body } as const;
  } catch {
    return { status: "fetch_failed" } as const;
  }
}

async function fetchJobPage(
  sourceUrl: string,
  dependencies: IngestJobFromLinkDependencies,
): Promise<
  | {
      status: "ok";
      pageText: string;
      sourceContentHash: string;
      deterministicPosting?: ExtractedJobPosting;
    }
  | { status: "unsafe_url" | "fetch_failed" | "unsupported_content" | "response_too_large" | "extraction_unavailable" }
> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let requestUrl = sourceUrl;

  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      try {
        await assertSafePublicUrl(requestUrl, dependencies.resolveHostname);
      } catch {
        return { status: "unsafe_url" };
      }

      let response: Response;
      try {
        response = await fetchImpl(requestUrl, {
          method: "GET",
          headers: {
            Accept: "text/html,application/xhtml+xml,text/plain",
            "User-Agent": "The Job Market Is a Dumpster Fire job-link ingestion",
          },
          cache: "no-store",
          redirect: "manual",
          signal: controller.signal,
        });
      } catch {
        return { status: "fetch_failed" };
      }

      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        if (redirectCount === MAX_REDIRECTS) return { status: "fetch_failed" };
        await response.body?.cancel().catch(() => undefined);
        try {
          requestUrl = new URL(location, requestUrl).toString();
        } catch {
          return { status: "fetch_failed" };
        }
        continue;
      }

      if (!response.ok) return { status: "fetch_failed" };
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.startsWith("text/html")
        && !contentType.startsWith("application/xhtml+xml")
        && !contentType.startsWith("text/plain")) {
        return { status: "unsupported_content" };
      }

      const bodyResult = await readResponseWithLimit(
        response,
        dependencies.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
        controller,
      );
      if (bodyResult.status !== "ok") return bodyResult;

      if (contentType.startsWith("text/plain")) {
        const plainText = bodyResult.body.trim();
        return plainText
          ? {
              status: "ok",
              pageText: plainText,
              sourceContentHash: sourceContentHash(plainText),
            }
          : { status: "extraction_unavailable" };
      }
      const strippedText = textFromHtml(bodyResult.body);
      const structured = jobPostingFromJsonLd(bodyResult.body);
      const pageText = structured && structured.pageText.length > strippedText.length
        ? structured.pageText
        : strippedText;
      return pageText
        ? {
            status: "ok",
            pageText,
            sourceContentHash: sourceContentHash(pageText),
            deterministicPosting: structured?.posting,
          }
        : { status: "extraction_unavailable" };
    }

    return { status: "fetch_failed" };
  } finally {
    clearTimeout(timer);
  }
}

export async function ingestJobFromLink(
  input: { url: string; userId: string },
  dependencies: IngestJobFromLinkDependencies,
): Promise<IngestJobFromLinkResult> {
  const sourceUrl = normalizeUrl(input.url);
  if (!sourceUrl) return { status: "invalid_url" };

  try {
    await assertSafePublicUrl(sourceUrl, dependencies.resolveHostname);
  } catch {
    return { status: "unsafe_url" };
  }

  const existing = await findJobBySourceUrl(dependencies.request, sourceUrl, input.userId);
  if (existing) return knownResult(existing);

  const fetched = await fetchJobPage(sourceUrl, dependencies);
  if (fetched.status !== "ok") return fetched;

  const reusable = fetched.deterministicPosting
    ? undefined
    : await findJobBySourceContentHash(
        dependencies.request,
        fetched.sourceContentHash,
        input.userId,
      );
  let extracted = fetched.deterministicPosting
    ?? (reusable
      ? {
          title: reusable.title,
          companyName: reusable.company_name,
          description: reusable.description,
          responsibilities: reusable.responsibilities ?? [],
          requiredExperience: reusable.required_experience ?? [],
        }
      : undefined);
  const attemptedAt = dependencies.now?.() ?? new Date().toISOString();
  const hashedSourceUrl = sourceUrlHash(sourceUrl);
  let extractionClaimToken: string | undefined;
  if (!extracted) {
    extractionClaimToken = await claimModelExtraction(dependencies.request, {
      userId: input.userId,
      sourceUrlHash: hashedSourceUrl,
      contentHash: fetched.sourceContentHash,
      now: attemptedAt,
    });
    if (!extractionClaimToken) {
      const completedWhileClaiming = await findJobBySourceUrl(
        dependencies.request,
        sourceUrl,
        input.userId,
      );
      return completedWhileClaiming
        ? knownResult(completedWhileClaiming)
        : { status: "extraction_unavailable" };
    }

    let extractionOutcome: JobPostingExtractionOutcome | "error";
    try {
      const extraction = await extractJobPostingDetailedLLM(
        { sourceUrl, pageText: fetched.pageText },
        {
          callModel: dependencies.callModel,
          providerUsage: {
            sink: createBestEffortProviderUsageSink(dependencies.request),
            userId: input.userId,
            requestCorrelationId: randomUUID(),
          },
        },
      );
      extracted = extraction.posting;
      extractionOutcome = extraction.outcome;
    } catch {
      extractionOutcome = "error";
    }
    if (!extracted) {
      await finishModelExtraction(dependencies.request, {
        userId: input.userId,
        sourceUrlHash: hashedSourceUrl,
        contentHash: fetched.sourceContentHash,
        claimToken: extractionClaimToken,
        outcome: extractionOutcome,
        now: attemptedAt,
      }).catch(() => undefined);
      return { status: "extraction_unavailable" };
    }
  }
  if (!extracted) return { status: "extraction_unavailable" };

  const heuristicSections = parsePosting(extracted.description);
  const scrapedAt = attemptedAt;
  let inserted: StoredJob[];
  try {
    inserted = await dependencies.request<StoredJob[]>("jobs", {
      method: "POST",
      query: "?on_conflict=source,source_url,owner_user_id&select=id,title,company_name",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: {
        source: "user_link",
        source_url: sourceUrl,
        source_content_hash: fetched.sourceContentHash,
        owner_user_id: input.userId,
        company_name: extracted.companyName,
        title: extracted.title,
        description: extracted.description,
        responsibilities: extracted.responsibilities.length > 0
          ? extracted.responsibilities
          : heuristicSections.responsibilities,
        required_experience: extracted.requiredExperience.length > 0
          ? extracted.requiredExperience
          : heuristicSections.requiredExperience,
        scraped_at: scrapedAt,
        updated_at: scrapedAt,
      },
    });
  } catch (error) {
    if (extractionClaimToken) {
      await finishModelExtraction(dependencies.request, {
        userId: input.userId,
        sourceUrlHash: hashedSourceUrl,
        contentHash: fetched.sourceContentHash,
        claimToken: extractionClaimToken,
        outcome: "error",
        now: attemptedAt,
      }).catch(() => undefined);
    }
    throw error;
  }

  const job = inserted[0];
  if (!job) {
    const concurrentlyInserted = await findJobBySourceUrl(dependencies.request, sourceUrl, input.userId);
    if (!concurrentlyInserted) throw new Error("Job insert did not return a row.");
    if (extractionClaimToken) {
      await finishModelExtraction(dependencies.request, {
        userId: input.userId,
        sourceUrlHash: hashedSourceUrl,
        contentHash: fetched.sourceContentHash,
        claimToken: extractionClaimToken,
        outcome: "success",
        jobId: concurrentlyInserted.id,
        now: attemptedAt,
      }).catch(() => undefined);
    }
    return knownResult(concurrentlyInserted);
  }

  if (extractionClaimToken) {
    await finishModelExtraction(dependencies.request, {
      userId: input.userId,
      sourceUrlHash: hashedSourceUrl,
      contentHash: fetched.sourceContentHash,
      claimToken: extractionClaimToken,
      outcome: "success",
      jobId: job.id,
      now: attemptedAt,
    }).catch(() => undefined);
  }

  return {
    status: "ingested",
    jobId: job.id,
    title: job.title,
    company: job.company_name,
  };
}

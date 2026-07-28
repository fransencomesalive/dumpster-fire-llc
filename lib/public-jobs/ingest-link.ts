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
import { resolveBoardFromUrl, type ResolvedBoard } from "../scan/sources/board-registry";
import { fetchBoardPosting, type BoardPostingDependencies } from "./board-posting";
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
  // A board we deliberately do not read (login-gated). `board` is the hostname so
  // the user can be told which one, instead of a generic extraction failure.
  | { status: "board_unsupported"; board: string }
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
  boardPosting?: BoardPostingDependencies;
  fetchBoardPostingImpl?: typeof fetchBoardPosting;
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

// Campaign and referral parameters that identify where a link was shared, never
// which posting it points at. A link copied out of LinkedIn carries these; the
// scan stores the board's own clean URL, so without stripping them for the
// comparison a user pastes a posting we already hold and we fail to recognize it.
// Deliberately conservative: anything that could identify the posting (gh_jid,
// lever ids, query-encoded slugs) is left alone.
const TRACKING_PARAMS = new Set([
  "src", "source", "ref", "referer", "referrer", "trk", "trackingid",
  "gh_src", "grnh.se", "fbclid", "gclid", "msclkid", "igshid", "mc_cid", "mc_eid",
  "li_fat_id", "at_medium", "at_campaign",
]);

// The URL as the user pasted it stays the stored source_url, so "Open posting"
// always opens the link they actually had. This is only a comparison key.
function dedupeKeyUrl(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
        url.searchParams.delete(key);
      }
    }
    // A trailing "?" left by stripping every parameter is a different string.
    if ([...url.searchParams.keys()].length === 0) url.search = "";
    return url.toString();
  } catch {
    return sourceUrl;
  }
}

function sourceUrlLookupValues(sourceUrl: string) {
  const values = [sourceUrl, dedupeKeyUrl(sourceUrl)];
  try {
    const url = new URL(sourceUrl);
    if (url.hostname.toLowerCase().replace(/^www\./, "") === "remoteok.com") {
      // Remote OK historically emitted a mixed-case hostname. URL() correctly
      // lowercases the pasted host, but old scan rows retain the original string.
      // Keep this read-only compatibility key while the connector now emits a
      // canonical, job-specific URL.
      values.push(
        dedupeKeyUrl(sourceUrl).replace(
          `${url.protocol}//${url.hostname}`,
          `${url.protocol}//remoteOK.com`,
        ),
      );
    }
  } catch {
    // sourceUrl was already validated by the caller.
  }
  return [...new Set(values)];
}

function quotedIn(values: string[]) {
  const unique = [...new Set(values)];
  return `in.(${unique.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(",")})`;
}

type ScanJobIdentity = {
  sources: string[];
  externalJobId: string;
};

// The scan pipeline stores a provider's durable posting id alongside source_url.
// URL equality remains the fastest lookup, but it cannot be the only one: some
// providers put their own tracking parameters in the stored URL, and URL()
// normalizes hostname casing. Derive the same id the scan connector persisted so
// every scan-produced link remains recognizable across harmless URL variations.
function scanJobIdentityFromUrl(sourceUrl: string): ScanJobIdentity | undefined {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return undefined;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  const greenhouseId = url.searchParams.get("gh_jid")
    || (parts.includes("jobs") ? parts[parts.indexOf("jobs") + 1] : undefined);
  if (greenhouseId && (
    host === "boards.greenhouse.io"
    || host === "job-boards.greenhouse.io"
    || url.searchParams.has("gh_jid")
  )) {
    return { sources: ["greenhouse"], externalJobId: greenhouseId };
  }

  if (host === "jobs.ashbyhq.com" && parts[1]) {
    return { sources: ["ashby"], externalJobId: parts[1] };
  }
  if (host === "jobs.lever.co" && parts[1]) {
    return { sources: ["lever"], externalJobId: parts[1] };
  }
  if (host === "adzuna.com" && parts[0] === "details" && parts[1]) {
    return { sources: ["adzuna"], externalJobId: parts[1] };
  }
  if (host === "remoteok.com") {
    const remoteOkId = url.pathname.match(/-(\d+)\/?$/)?.[1];
    if (remoteOkId) return { sources: ["remote_ok"], externalJobId: remoteOkId };
  }
  if ((host === "arbeitnow.com" || host === "arbeitnow.co.uk") && parts.at(-1)) {
    return { sources: ["arbeitnow", "html"], externalJobId: parts.at(-1)! };
  }
  if (host === "directsource.magnitglobal.com" && parts.includes("jobs")) {
    const magnitId = parts[parts.indexOf("jobs") + 1];
    if (magnitId) return { sources: ["magnit"], externalJobId: magnitId };
  }

  // These connectors persist the clean posting URL itself as external_job_id.
  // Using it here makes the identity path explicit and keeps tracking parameters
  // out of the comparison.
  if (host === "himalayas.app") {
    return { sources: ["himalayas"], externalJobId: dedupeKeyUrl(sourceUrl) };
  }
  if (host === "remotive.com") {
    return { sources: ["remotive"], externalJobId: dedupeKeyUrl(sourceUrl) };
  }
  if (host === "weworkremotely.com") {
    return { sources: ["we_work_remotely"], externalJobId: dedupeKeyUrl(sourceUrl) };
  }

  return undefined;
}

// Dedupe against shared-pool rows and the user's own private rows only; another
// user's private paste must never match (returning its id would leak it).
async function findJobBySourceUrl(request: PublicProfileRepositoryRequest, sourceUrl: string, userId: string) {
  const rows = await request<StoredJob[]>("jobs", {
    query: qs({
      source_url: quotedIn(sourceUrlLookupValues(sourceUrl)),
      or: `(owner_user_id.is.null,owner_user_id.eq.${userId})`,
      select: "id,title,company_name",
      limit: "1",
    }),
  });
  return rows[0];
}

async function findJobByScanIdentity(
  request: PublicProfileRepositoryRequest,
  sourceUrl: string,
  userId: string,
) {
  const identity = scanJobIdentityFromUrl(sourceUrl);
  if (!identity) return undefined;

  const rows = await request<StoredJob[]>("jobs", {
    query: qs({
      source: quotedIn(identity.sources),
      external_job_id: `eq.${identity.externalJobId}`,
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

type BoardTokenRow = { ats_board_token: string; company_name: string };

// The registry infers a board token from the hostname, which is right for an ATS
// host (job-boards.greenhouse.io/gitlab) and wrong for a company's own careers
// host: careers.airbnb.com guesses "careers", jobs.dropbox.com guesses "jobs".
// The correct tokens are already configured in job_sources for exactly the boards
// the scan reads, so prefer those before trusting a guess.
async function boardTokenFromConfiguredSources(
  request: PublicProfileRepositoryRequest,
  provider: string,
  hostname: string,
  userId: string,
): Promise<string | undefined> {
  let rows: BoardTokenRow[];
  try {
    rows = await request<BoardTokenRow[]>("job_sources", {
      query: qs({
        ats_provider: `eq.${provider}`,
        // Shared starter boards and this user's own boards only, matching the
        // dedupe scope: another user's private board must not steer this paste.
        or: `(owner_user_id.is.null,owner_user_id.eq.${userId})`,
        select: "ats_board_token,company_name",
        limit: "200",
      }),
    });
  } catch {
    return undefined;
  }

  const host = hostname.toLowerCase().replace(/^www\./, "");
  const labels = new Set(host.split("."));
  // Match a configured token against a hostname label so careers.airbnb.com and
  // jobs.dropbox.com resolve to "airbnb" and "dropbox", while a token that merely
  // appears as a substring of an unrelated host does not.
  const match = rows.find((row) => {
    const token = (row.ats_board_token ?? "").trim().toLowerCase();
    return token.length > 0 && labels.has(token);
  });
  return match?.ats_board_token;
}

// Reads a pasted posting from its ATS API and shapes it like a successful page
// fetch, so the rest of ingestion is identical. Returns undefined when the board
// has no single-posting path or its API did not answer, leaving the HTML reader
// as the fallback.
async function fetchViaBoardApi(
  sourceUrl: string,
  board: ResolvedBoard,
  dependencies: IngestJobFromLinkDependencies,
): Promise<Extract<Awaited<ReturnType<typeof fetchJobPage>>, { status: "ok" }> | undefined> {
  const fetchPosting = dependencies.fetchBoardPostingImpl ?? fetchBoardPosting;
  const result = await fetchPosting(sourceUrl, board, dependencies.boardPosting ?? {});
  if (result.status !== "ok") return undefined;

  const { title, companyName, description } = result.posting;
  const pageText = [
    `Job title: ${title}`,
    `Company: ${companyName}`,
    description,
  ].join("\n");

  return {
    status: "ok",
    pageText,
    sourceContentHash: sourceContentHash(pageText),
    deterministicPosting: {
      title,
      companyName,
      description,
      ...parsePosting(description),
    },
  };
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

  const scanned = await findJobByScanIdentity(dependencies.request, sourceUrl, input.userId);
  if (scanned) return knownResult(scanned);

  // Resolve the link against the board registry the scan already uses. A board we
  // decline to read is reported as exactly that; a board we can talk to is read
  // through its structured API instead of its web page.
  const boardResolution = resolveBoardFromUrl(sourceUrl);
  if (boardResolution.status === "blocked") {
    return { status: "board_unsupported", board: new URL(sourceUrl).hostname };
  }

  let board = boardResolution.status === "resolved" || boardResolution.status === "posting_only"
    ? boardResolution.board
    : undefined;
  if (board && board.confidence === "guess") {
    const configuredToken = await boardTokenFromConfiguredSources(
      dependencies.request,
      board.provider,
      new URL(sourceUrl).hostname,
      input.userId,
    );
    if (configuredToken) board = { ...board, atsBoardToken: configuredToken, confidence: "exact" };
  }

  const fetched = board
    ? await fetchViaBoardApi(sourceUrl, board, dependencies) ?? await fetchJobPage(sourceUrl, dependencies)
    : await fetchJobPage(sourceUrl, dependencies);
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

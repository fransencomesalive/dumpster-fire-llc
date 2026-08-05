import type { PublicProfileRepositoryRequest } from "../public-profile/repository";
import { assertSafePublicUrl, type HostnameResolver } from "../scan/sources/url-safety";

export const PUBLIC_JOB_LINK_STATUSES = ["unknown", "healthy", "gone", "uncertain"] as const;
export type PublicJobLinkStatus = typeof PUBLIC_JOB_LINK_STATUSES[number];

export type PostingLinkHealthResult = {
  status: Exclude<PublicJobLinkStatus, "unknown">;
  reason: string;
  checkedAt: string;
  httpStatus?: number;
  resolvedUrl?: string;
};

export type InspectPostingLinkOptions = {
  now?: () => string;
  fetchImpl?: typeof fetch;
  resolveHostname?: HostnameResolver;
  timeoutMs?: number;
  maxRedirects?: number;
};

type SafeFetchResult =
  | { ok: true; response: Response; resolvedUrl: string }
  | { ok: false; reason: "network_error" | "timeout" | "unsafe_url" | "redirect_limit" | "redirect_without_location" };

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const GONE_HTTP_STATUSES = new Set([404, 410]);
const GET_FALLBACK_STATUSES = new Set([404, 405, 410, 501]);
const DEFAULT_LINK_TIMEOUT_MS = 4_000;
const DEFAULT_MAX_REDIRECTS = 6;

function normalizedPath(url: URL) {
  let path = url.pathname.replace(/\/+$/, "").toLowerCase() || "/";
  const parts = path.split("/").filter(Boolean);
  if (parts.length > 1 && /^[a-z]{2}(?:-[a-z]{2})?$/.test(parts[0])) {
    path = `/${parts.slice(1).join("/")}`;
  }
  return path;
}

export function isGenericJobLandingUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  const path = normalizedPath(url);
  if (["/", "/jobs", "/careers", "/positions", "/search", "/job-search", "/jobs/search", "/careers/search"].includes(path)) {
    return true;
  }
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return false;
  return ["jobs", "careers", "positions", "search", "job-search"].includes(parts.at(-1) ?? "");
}

async function cancelBody(response: Response) {
  await response.body?.cancel().catch(() => undefined);
}

async function safeFetchWithRedirects(
  rawUrl: string,
  method: "HEAD" | "GET",
  options: InspectPostingLinkOptions,
): Promise<SafeFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_LINK_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let currentUrl = rawUrl;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    try {
      await assertSafePublicUrl(currentUrl, options.resolveHostname);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      return {
        ok: false,
        reason: /safe public http url|non-public network address/i.test(message) ? "unsafe_url" : "network_error",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        method,
        redirect: "manual",
        signal: controller.signal,
        headers: method === "GET"
          ? { Accept: "text/html,application/xhtml+xml", Range: "bytes=0-0" }
          : { Accept: "text/html,application/xhtml+xml" },
      });
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
      };
    } finally {
      clearTimeout(timeout);
    }

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { ok: true, response, resolvedUrl: currentUrl };
    }

    const location = response.headers.get("location");
    await cancelBody(response);
    if (!location) return { ok: false, reason: "redirect_without_location" };
    if (redirectCount === maxRedirects) return { ok: false, reason: "redirect_limit" };
    try {
      currentUrl = new URL(location, currentUrl).toString();
    } catch {
      return { ok: false, reason: "unsafe_url" };
    }
  }

  return { ok: false, reason: "redirect_limit" };
}

function uncertainResult(reason: string, checkedAt: string, httpStatus?: number, resolvedUrl?: string): PostingLinkHealthResult {
  return {
    status: "uncertain",
    reason,
    checkedAt,
    ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(resolvedUrl ? { resolvedUrl } : {}),
  };
}

async function classifyResponse(
  rawUrl: string,
  result: Extract<SafeFetchResult, { ok: true }>,
  method: "HEAD" | "GET",
  options: InspectPostingLinkOptions,
  checkedAt: string,
): Promise<PostingLinkHealthResult> {
  const { response, resolvedUrl } = result;
  const httpStatus = response.status;
  await cancelBody(response);

  if (method === "HEAD" && GET_FALLBACK_STATUSES.has(httpStatus)) {
    const fallback = await safeFetchWithRedirects(rawUrl, "GET", options);
    if ("reason" in fallback) return uncertainResult(fallback.reason, checkedAt);
    return classifyResponse(rawUrl, fallback, "GET", options, checkedAt);
  }

  if (GONE_HTTP_STATUSES.has(httpStatus)) {
    return { status: "gone", reason: "http_gone", checkedAt, httpStatus, resolvedUrl };
  }

  if (httpStatus >= 200 && httpStatus < 300) {
    if (isGenericJobLandingUrl(resolvedUrl)) {
      return { status: "gone", reason: "generic_landing_redirect", checkedAt, httpStatus, resolvedUrl };
    }
    return { status: "healthy", reason: "exact_posting", checkedAt, httpStatus, resolvedUrl };
  }

  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) {
    return uncertainResult("access_limited", checkedAt, httpStatus, resolvedUrl);
  }
  if (httpStatus >= 500) {
    return uncertainResult("provider_error", checkedAt, httpStatus, resolvedUrl);
  }
  return uncertainResult("unexpected_http_status", checkedAt, httpStatus, resolvedUrl);
}

export async function inspectPublicPostingLink(
  rawUrl: string,
  options: InspectPostingLinkOptions = {},
): Promise<PostingLinkHealthResult> {
  const checkedAt = options.now?.() ?? new Date().toISOString();
  try {
    new URL(rawUrl);
  } catch {
    return { status: "gone", reason: "invalid_url", checkedAt };
  }

  const result = await safeFetchWithRedirects(rawUrl, "HEAD", options);
  if ("reason" in result) {
    if (result.reason === "unsafe_url") return { status: "gone", reason: result.reason, checkedAt };
    return uncertainResult(result.reason, checkedAt);
  }
  return classifyResponse(rawUrl, result, "HEAD", options, checkedAt);
}

type PursuitLinkRow = { job_id: string | null };
type JobLinkRow = {
  id: string;
  source_url: string;
  owner_user_id: string | null;
  link_status?: PublicJobLinkStatus | null;
  link_checked_at?: string | null;
};

export type SavedPursuitLinkHealthResult = {
  candidates: number;
  checked: number;
  healthy: number;
  gone: number;
  uncertain: number;
  skippedPrivate: number;
  skippedFresh: number;
};

export type ReconcileSavedPursuitLinkHealthOptions = InspectPostingLinkOptions & {
  inspectLink?: typeof inspectPublicPostingLink;
  maxPursuits?: number;
  maxChecks?: number;
  concurrency?: number;
  recheckAfterMs?: number;
};

const DEFAULT_MAX_PURSUITS = 500;
const DEFAULT_MAX_CHECKS = 24;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_RECHECK_AFTER_MS = 20 * 60 * 60 * 1000;

function query(params: Record<string, string>) {
  return `?${new URLSearchParams(params).toString()}`;
}

export async function reconcileSavedPursuitLinkHealth(
  request: PublicProfileRepositoryRequest,
  options: ReconcileSavedPursuitLinkHealthOptions = {},
): Promise<SavedPursuitLinkHealthResult> {
  const checkedAt = options.now?.() ?? new Date().toISOString();
  const pursuits = await request<PursuitLinkRow[]>("pursuits", {
    query: query({
      status: "neq.deleted",
      job_id: "not.is.null",
      select: "job_id",
      order: "updated_at.desc",
      limit: String(options.maxPursuits ?? DEFAULT_MAX_PURSUITS),
    }),
  });
  const jobIds = [...new Set(pursuits.flatMap((row) => row.job_id ? [row.job_id] : []))];
  const jobs = jobIds.length === 0 ? [] : await request<JobLinkRow[]>("jobs", {
    query: query({
      id: `in.(${jobIds.join(",")})`,
      select: "id,source_url,owner_user_id,link_status,link_checked_at",
      limit: String(jobIds.length),
    }),
  });

  const result: SavedPursuitLinkHealthResult = {
    candidates: jobs.length,
    checked: 0,
    healthy: 0,
    gone: 0,
    uncertain: 0,
    skippedPrivate: 0,
    skippedFresh: 0,
  };
  const staleBefore = Date.parse(checkedAt) - (options.recheckAfterMs ?? DEFAULT_RECHECK_AFTER_MS);
  const queued: JobLinkRow[] = [];
  for (const job of jobs) {
    if (job.owner_user_id) {
      result.skippedPrivate += 1;
      continue;
    }
    const lastChecked = job.link_checked_at ? Date.parse(job.link_checked_at) : Number.NaN;
    if (Number.isFinite(lastChecked) && lastChecked > staleBefore) {
      result.skippedFresh += 1;
      continue;
    }
    queued.push(job);
  }

  const inspectLink = options.inspectLink ?? inspectPublicPostingLink;
  const queue = queued.slice(0, options.maxChecks ?? DEFAULT_MAX_CHECKS);
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const job = queue[cursor++];
      const health = await inspectLink(job.source_url, {
        now: () => checkedAt,
        fetchImpl: options.fetchImpl,
        resolveHostname: options.resolveHostname,
        timeoutMs: options.timeoutMs,
        maxRedirects: options.maxRedirects,
      });
      result.checked += 1;
      result[health.status] += 1;
      // An uncertain recheck cannot overturn a prior confirmed-gone result. Only a
      // positive exact-posting response may restore a retired link.
      const persistedStatus = health.status === "uncertain" && job.link_status === "gone"
        ? "gone"
        : health.status;
      await request("jobs", {
        method: "PATCH",
        query: query({ id: `eq.${job.id}` }),
        body: {
          link_status: persistedStatus,
          link_checked_at: checkedAt,
          link_http_status: health.httpStatus ?? null,
          link_health_reason: persistedStatus === "gone" && health.status === "uncertain"
            ? `gone_recheck_${health.reason}`
            : health.reason,
        },
      });
      if (persistedStatus === "gone") {
        await request("job_scan_results", {
          method: "PATCH",
          query: query({ job_id: `eq.${job.id}`, status: "eq.active" }),
          body: { status: "expired", updated_at: checkedAt },
        });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, queue.length) }, worker));
  return result;
}

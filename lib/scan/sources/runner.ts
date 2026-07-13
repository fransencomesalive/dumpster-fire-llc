// Ported from the legacy `app/scans/connector-runner.ts` fetch path, minus the legacy
// relevance/scoring layer (the public product matches at scan time with its own engine). Preserves
// the full fetch behavior: per-provider request shaping, retries, Workday title-variant fan-out,
// Himalayas pagination, and Adzuna credential injection.
import { buildConnectorPlan, normalizeConnectorPayload, type NormalizedConnectorJob } from "./connectors";
import type { JobSource } from "./types";
import { assertSafePublicUrl, type HostnameResolver } from "./url-safety";

export type FetchConnectorJobsOptions = {
  // Workday tenants only return the newest ~20 postings per request. Supplying title variants lets
  // the runner fan out across them and merge results for fuller coverage of large boards. When
  // empty, only the baseline query runs (still valid, just narrower for giant Workday boards).
  workdayVariants?: string[];
  env?: NodeJS.ProcessEnv;
  resolveHostname?: HostnameResolver;
  fetchImpl?: typeof fetch;
};

const HIMALAYAS_PAGE_SIZE = 20;
const HIMALAYAS_MAX_PAGES = 3;
const WWR_RSS_ERROR = "RSS feed error";
// Workday tenants are queried once per title variant; run a few of those variant requests in
// parallel against the same tenant so one large board does not serialize many sub-requests. Kept
// low to stay gentle on a single tenant.
const WORKDAY_VARIANT_CONCURRENCY = 4;
const WORKDAY_MAX_VARIANTS = 12;

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }));
  return results;
}

function himalayasPageUrl(endpointUrl: string, page: number) {
  const url = new URL(endpointUrl);
  url.searchParams.set("page", String(page));
  return url.toString();
}

function withRequestCredentials(endpointUrl: string, env: NodeJS.ProcessEnv) {
  try {
    const url = new URL(endpointUrl);
    if (url.hostname === "api.adzuna.com" && env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY) {
      url.searchParams.set("app_id", env.ADZUNA_APP_ID);
      url.searchParams.set("app_key", env.ADZUNA_APP_KEY);
    }
    return url.toString();
  } catch {
    return endpointUrl;
  }
}

function isWeWorkRemotelyRssSource(company: JobSource, endpointUrl: string) {
  return company.companyName.startsWith("We Work Remotely RSS") || endpointUrl.includes("weworkremotely.com/categories/");
}

async function requestConnectorResponse(
  endpointUrl: string,
  plan: { provider: string },
  isHtmlResponse: boolean,
  workdaySearchText: string,
  env: NodeJS.ProcessEnv,
  resolveHostname?: HostnameResolver,
  fetchImpl: typeof fetch = fetch,
) {
  let requestUrl = withRequestCredentials(endpointUrl, env);
  let method = plan.provider === "workday" ? "POST" : "GET";
  let body = method === "POST"
    ? JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: workdaySearchText })
    : undefined;
  const headers = {
      "Accept": isHtmlResponse ? "text/html,application/xhtml+xml" : "application/json",
      "User-Agent": "The Job Market Is a Dumpster Fire job ingestion",
      ...(plan.provider === "workday" ? { "Content-Type": "application/json" } : {}),
  };

  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    await assertSafePublicUrl(requestUrl, resolveHostname);
    const response = await fetchImpl(requestUrl, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      // Cap every request in the redirect chain so one slow board can't hang ingestion.
      signal: AbortSignal.timeout(12_000),
    });

    if (response.status < 300 || response.status >= 400 || !response.headers.get("location")) return response;
    if (redirectCount === 5) throw new Error("Source returned too many redirects.");

    requestUrl = new URL(response.headers.get("location")!, requestUrl).toString();
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
      method = "GET";
      body = undefined;
    }
  }

  throw new Error("Unable to follow source redirect.");
}

async function fetchConnectorPayloadJobs(
  endpointUrl: string,
  plan: { provider: string },
  company: JobSource,
  isHtmlResponse: boolean,
  workdaySearchText: string,
  env: NodeJS.ProcessEnv,
  resolveHostname?: HostnameResolver,
  fetchImpl?: typeof fetch,
) {
  const isWwrRss = isWeWorkRemotelyRssSource(company, endpointUrl);
  const attempts = isWwrRss ? 2 : 1;
  let response: Response | null = null;
  let fetchError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      response = await requestConnectorResponse(endpointUrl, plan, isHtmlResponse, workdaySearchText, env, resolveHostname, fetchImpl);
      if (response.ok) break;
      fetchError = new Error(`Source returned ${response.status}.`);
    } catch (error) {
      fetchError = error;
    }

    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  if (!response?.ok) {
    if (isWwrRss) throw new Error(WWR_RSS_ERROR);
    if (fetchError instanceof Error) throw fetchError;
    throw new Error("Unable to fetch source.");
  }

  const payload = isHtmlResponse ? await response.text() : await response.json();
  return normalizeConnectorPayload(payload, company);
}

export async function fetchNormalizedConnectorJobs(
  company: JobSource,
  options: FetchConnectorJobsOptions = {},
): Promise<NormalizedConnectorJob[]> {
  const env = options.env ?? process.env;
  const plan = buildConnectorPlan(company);

  if (!plan.canPreview || !plan.endpointUrl) {
    throw new Error(plan.warnings.join(" ") || "Connector is not ready.");
  }

  const expectsJson = (
    company.careersUrl.includes("remotive.com/api/") ||
    company.careersUrl.includes("remoteok.com/api") ||
    company.careersUrl.includes("himalayas.app/jobs/api") ||
    company.careersUrl.includes("remotejobs.org/api/") ||
    company.careersUrl.includes("careernest.cloud/api/") ||
    company.careersUrl.includes("arbeitnow.com/api/") ||
    company.careersUrl.includes("api.adzuna.com/") ||
    company.careersUrl.includes("apply.workable.com/api/") ||
    company.careersUrl.includes("jobs.workable.com/api/")
  );
  const isHtmlResponse = !expectsJson && (plan.provider === "html" || plan.provider === "icims" || plan.provider === "magnit");
  const isPaginatedHimalayasSearch = company.careersUrl.includes("himalayas.app/jobs/api/search");

  // Workday tenants only return the newest 20 postings per request, which is a keyhole for giant
  // boards. Query per supplied title variant and merge the results.
  if (plan.provider === "workday") {
    const variants = ["", ...(options.workdayVariants ?? []).slice(0, WORKDAY_MAX_VARIANTS)];
    // The baseline ("") query must succeed; if the tenant itself is unreachable the whole source
    // fails. The remaining title-variant queries are best-effort coverage, so a single variant
    // failure is tolerated instead of aborting the rest.
    const baselineJobs = await fetchConnectorPayloadJobs(plan.endpointUrl, plan, company, isHtmlResponse, variants[0], env, options.resolveHostname, options.fetchImpl);
    const variantResults = await mapLimit(variants.slice(1), WORKDAY_VARIANT_CONCURRENCY, async (variant) => {
      try {
        return await fetchConnectorPayloadJobs(plan.endpointUrl, plan, company, isHtmlResponse, variant, env, options.resolveHostname, options.fetchImpl);
      } catch {
        return [] as NormalizedConnectorJob[];
      }
    });

    const mergedWorkdayJobs: NormalizedConnectorJob[] = [];
    const seenWorkdayIds = new Set<string>();
    for (const variantJobs of [baselineJobs, ...variantResults]) {
      for (const job of variantJobs) {
        if (seenWorkdayIds.has(job.externalJobId)) continue;
        seenWorkdayIds.add(job.externalJobId);
        mergedWorkdayJobs.push(job);
      }
    }

    return mergedWorkdayJobs;
  }

  if (!isPaginatedHimalayasSearch) {
    return fetchConnectorPayloadJobs(plan.endpointUrl, plan, company, isHtmlResponse, "", env, options.resolveHostname, options.fetchImpl);
  }

  const mergedJobs: NormalizedConnectorJob[] = [];
  const seenExternalIds = new Set<string>();

  for (let page = 1; page <= HIMALAYAS_MAX_PAGES; page += 1) {
    let pageJobs: NormalizedConnectorJob[];

    try {
      pageJobs = await fetchConnectorPayloadJobs(himalayasPageUrl(plan.endpointUrl, page), plan, company, isHtmlResponse, "", env, options.resolveHostname, options.fetchImpl);
    } catch (error) {
      if (page === 1) throw error;
      break;
    }

    let added = 0;
    for (const job of pageJobs) {
      if (seenExternalIds.has(job.externalJobId)) continue;
      seenExternalIds.add(job.externalJobId);
      mergedJobs.push(job);
      added += 1;
    }

    if (pageJobs.length < HIMALAYAS_PAGE_SIZE || added === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return mergedJobs;
}

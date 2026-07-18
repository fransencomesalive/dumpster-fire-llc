import { buildConnectorFetchPreview, buildConnectorPlan, normalizeConnectorPayload } from "./connectors";
import { filterConnectorJobsByRelevance } from "./relevance";
import { sourceQueryVariants } from "./search-sources";
import type { MatchingRuleConfig } from "./matching";
import type { Company, Job, UserSearchProfile } from "./types";

export type ConnectorFetchSummary = {
  companyId: string;
  companyName: string;
  provider: string;
  status: "ready" | "blocked" | "error";
  warnings: string[];
  totalFetched: number;
  totalRelevant: number;
  filteredOut: number;
  stretchCapped: number;
  newJobs: number;
  existingJobs: number;
  missingExistingJobs: number;
};

const HIMALAYAS_PAGE_SIZE = 20;
const HIMALAYAS_MAX_PAGES = 3;
const WWR_RSS_ERROR = "RSS feed error";
// Workday tenants are queried once per title variant; run a few of those variant requests in
// parallel against the same tenant so one large board (e.g. Accenture, 13 variants) does not
// serialize ~50s of sub-requests. Kept low to stay gentle on a single tenant.
const WORKDAY_VARIANT_CONCURRENCY = 4;

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

function withRequestCredentials(endpointUrl: string) {
  try {
    const url = new URL(endpointUrl);
    if (url.hostname === "api.adzuna.com" && process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
      url.searchParams.set("app_id", process.env.ADZUNA_APP_ID);
      url.searchParams.set("app_key", process.env.ADZUNA_APP_KEY);
    }
    return url.toString();
  } catch {
    return endpointUrl;
  }
}

function isWeWorkRemotelyRssSource(company: Company, endpointUrl: string) {
  return company.companyName.startsWith("We Work Remotely RSS") || endpointUrl.includes("weworkremotely.com/categories/");
}

async function requestConnectorResponse(endpointUrl: string, plan: { provider: string }, isHtmlResponse: boolean, workdaySearchText: string) {
  return fetch(withRequestCredentials(endpointUrl), {
    method: plan.provider === "workday" ? "POST" : "GET",
    headers: {
      "Accept": isHtmlResponse ? "text/html,application/xhtml+xml" : "application/json",
      "User-Agent": "The Job Market Is a Dumpster Fire scan QA (manual private scan)",
      ...(plan.provider === "workday" ? { "Content-Type": "application/json" } : {}),
    },
    body: plan.provider === "workday"
      ? JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: workdaySearchText })
      : undefined,
    cache: "no-store",
    // Cap any single source fetch so one slow/hanging board can't consume the whole scan budget.
    signal: AbortSignal.timeout(12_000),
  });
}

async function fetchConnectorPayloadJobs(endpointUrl: string, plan: { provider: string }, company: Company, isHtmlResponse: boolean, workdaySearchText = "") {
  const isWwrRss = isWeWorkRemotelyRssSource(company, endpointUrl);
  const attempts = isWwrRss ? 2 : 1;
  let response: Response | null = null;
  let fetchError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      response = await requestConnectorResponse(endpointUrl, plan, isHtmlResponse, workdaySearchText);
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

export async function fetchNormalizedConnectorJobs(company: Company) {
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

  // Workday tenants only return the newest 20 postings per request, which is a keyhole
  // for giant boards. Query per profile title variant and merge the results.
  if (plan.provider === "workday") {
    const variants = ["", ...sourceQueryVariants().slice(0, 12)];
    // The baseline ("") query must succeed; if the tenant itself is unreachable the whole source
    // fails, same as before. The remaining title-variant queries are best-effort coverage, so a
    // single variant failure is tolerated instead of aborting the rest.
    const baselineJobs = await fetchConnectorPayloadJobs(plan.endpointUrl, plan, company, isHtmlResponse, variants[0]);
    const variantResults = await mapLimit(variants.slice(1), WORKDAY_VARIANT_CONCURRENCY, async (variant) => {
      try {
        return await fetchConnectorPayloadJobs(plan.endpointUrl, plan, company, isHtmlResponse, variant);
      } catch {
        return [] as Awaited<ReturnType<typeof fetchConnectorPayloadJobs>>;
      }
    });

    const mergedWorkdayJobs: Awaited<ReturnType<typeof fetchConnectorPayloadJobs>> = [];
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
    return fetchConnectorPayloadJobs(plan.endpointUrl, plan, company, isHtmlResponse);
  }

  const mergedJobs: Awaited<ReturnType<typeof fetchConnectorPayloadJobs>> = [];
  const seenExternalIds = new Set<string>();

  for (let page = 1; page <= HIMALAYAS_MAX_PAGES; page += 1) {
    let pageJobs: Awaited<ReturnType<typeof fetchConnectorPayloadJobs>>;

    try {
      pageJobs = await fetchConnectorPayloadJobs(himalayasPageUrl(plan.endpointUrl, page), plan, company, isHtmlResponse);
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

export async function summarizeConnectorFetch(
  company: Company,
  jobs: Job[],
  profile?: UserSearchProfile,
  matchingConfig?: MatchingRuleConfig,
  maxStretchJobsPerCompany?: number
): Promise<ConnectorFetchSummary> {
  const plan = buildConnectorPlan(company);

  if (!plan.canPreview || !plan.endpointUrl) {
    return {
      companyId: company.id,
      companyName: company.companyName,
      provider: plan.provider,
      status: "blocked",
      warnings: plan.warnings,
      totalFetched: 0,
      totalRelevant: 0,
      filteredOut: 0,
      stretchCapped: 0,
      newJobs: 0,
      existingJobs: 0,
      missingExistingJobs: 0,
    };
  }

  try {
    const normalizedJobs = await fetchNormalizedConnectorJobs(company);
    const relevance = profile
      ? filterConnectorJobsByRelevance(normalizedJobs, company, profile, { matchingConfig, maxStretchJobsPerCompany })
      : { relevantJobs: normalizedJobs, filteredOut: 0, duplicatesFiltered: 0, stretchCapped: 0 };
    const preview = buildConnectorFetchPreview(plan, relevance.relevantJobs, jobs, new Date().toISOString(), normalizedJobs.length, relevance.filteredOut);

    return {
      companyId: company.id,
      companyName: company.companyName,
      provider: plan.provider,
      status: "ready",
      warnings: [],
      totalFetched: preview.totalFetched,
      totalRelevant: preview.totalRelevant,
      filteredOut: preview.filteredOut,
      stretchCapped: relevance.stretchCapped,
      newJobs: preview.newJobs.length,
      existingJobs: preview.existingJobs.length,
      missingExistingJobs: preview.missingExistingJobs.length,
    };
  } catch (error) {
    return {
      companyId: company.id,
      companyName: company.companyName,
      provider: plan.provider,
      status: "error",
      warnings: [error instanceof Error ? error.message : "Unable to fetch source."],
      totalFetched: 0,
      totalRelevant: 0,
      filteredOut: 0,
      stretchCapped: 0,
      newJobs: 0,
      existingJobs: 0,
      missingExistingJobs: 0,
    };
  }
}

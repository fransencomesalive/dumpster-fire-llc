import type { PublicProfileRepositoryRequest } from "../public-profile/repository";
import { fetchNormalizedConnectorJobs, type FetchConnectorJobsOptions } from "../job-connectors/runner";
import type { JobSource, NormalizedConnectorJob } from "../job-connectors/types";
import { loadActiveJobSources, markJobSourceIngested, type JobSourceRecord } from "./job-sources";

export type JobIngestionSourceResult = {
  sourceId: string;
  companyName: string;
  provider: string;
  status: "ingested" | "error";
  fetched: number;
  upserted: number;
  error?: string;
};

export type JobIngestionResult = {
  ranAt: string;
  totalSources: number;
  totalFetched: number;
  totalUpserted: number;
  sources: JobIngestionSourceResult[];
};

export type JobIngestionOptions = {
  loadSources?: (request: PublicProfileRepositoryRequest) => Promise<JobSourceRecord[]>;
  fetchSource?: (source: JobSource, options: FetchConnectorJobsOptions) => Promise<NormalizedConnectorJob[]>;
  markIngested?: (
    request: PublicProfileRepositoryRequest,
    sourceId: string,
    options: { at: string; error?: string },
  ) => Promise<void>;
  now?: () => string;
  env?: NodeJS.ProcessEnv;
  maxJobsPerSource?: number;
};

const DEFAULT_MAX_JOBS_PER_SOURCE = 200;

function jobRowBody(job: NormalizedConnectorJob, scrapedAt: string) {
  return {
    source: job.sourceProvider,
    source_url: job.sourceUrl,
    company_name: job.companyName,
    title: job.title,
    location: job.location || null,
    remote_type: job.remoteType,
    employment_type: job.employmentType,
    compensation_text: job.salaryText || null,
    description: job.descriptionText,
    external_job_id: job.externalJobId || null,
    apply_url: job.applyUrl || null,
    department: job.department || null,
    salary_min: job.salaryMin ?? null,
    salary_max: job.salaryMax ?? null,
    scraped_at: scrapedAt,
    updated_at: scrapedAt,
  };
}

// The public `jobs` upsert conflict target is (source, source_url). Drop rows without a usable
// source_url and collapse in-batch duplicates so a single upsert never tries to affect the same
// conflict key twice.
function ingestableJobs(jobs: NormalizedConnectorJob[], limit: number): NormalizedConnectorJob[] {
  const seen = new Set<string>();
  const output: NormalizedConnectorJob[] = [];
  for (const job of jobs) {
    const sourceUrl = job.sourceUrl?.trim();
    if (!sourceUrl) continue;
    const key = `${job.sourceProvider}::${sourceUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(job);
    if (output.length >= limit) break;
  }
  return output;
}

// Fetch from each active connector source and upsert normalized postings into the public `jobs`
// table. Per-source failures are isolated and recorded; an empty/paused source list is a safe
// no-op. This is the system-wide ingestion step; user scans match against the populated table.
export async function runJobIngestion(
  request: PublicProfileRepositoryRequest,
  options: JobIngestionOptions = {},
): Promise<JobIngestionResult> {
  const now = options.now?.() ?? new Date().toISOString();
  const loadSources = options.loadSources ?? loadActiveJobSources;
  const fetchSource = options.fetchSource ?? fetchNormalizedConnectorJobs;
  const markIngested = options.markIngested ?? markJobSourceIngested;
  const limit = options.maxJobsPerSource ?? DEFAULT_MAX_JOBS_PER_SOURCE;

  const sources = await loadSources(request);
  const results: JobIngestionSourceResult[] = [];
  let totalFetched = 0;
  let totalUpserted = 0;

  for (const source of sources) {
    try {
      const jobs = await fetchSource(source, { workdayVariants: source.workdayVariants, env: options.env });
      const upsertable = ingestableJobs(jobs, limit);

      if (upsertable.length > 0) {
        await request("jobs", {
          method: "POST",
          query: "?on_conflict=source,source_url",
          headers: { Prefer: "resolution=merge-duplicates" },
          body: upsertable.map((job) => jobRowBody(job, now)),
        });
      }

      await markIngested(request, source.id, { at: now });
      totalFetched += jobs.length;
      totalUpserted += upsertable.length;
      results.push({
        sourceId: source.id,
        companyName: source.companyName,
        provider: source.atsProvider,
        status: "ingested",
        fetched: jobs.length,
        upserted: upsertable.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to ingest source.";
      await markIngested(request, source.id, { at: now, error: message });
      results.push({
        sourceId: source.id,
        companyName: source.companyName,
        provider: source.atsProvider,
        status: "error",
        fetched: 0,
        upserted: 0,
        error: message,
      });
    }
  }

  return {
    ranAt: now,
    totalSources: sources.length,
    totalFetched,
    totalUpserted,
    sources: results,
  };
}

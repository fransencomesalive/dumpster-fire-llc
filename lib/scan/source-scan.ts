import type { PublicProfileRepositoryRequest } from "../public-profile/repository";
import { fetchNormalizedConnectorJobs, type FetchConnectorJobsOptions } from "./sources/runner";
import type { JobSource, NormalizedConnectorJob } from "./sources/types";
import { loadActiveJobSources, markJobSourceScanned, type JobSourceRecord } from "./sources/registry";
import { parsePosting } from "./sources/parse-posting";

export type SourceScanSourceResult = {
  sourceId: string;
  companyName: string;
  provider: string;
  status: "scanned" | "error";
  fetched: number;
  upserted: number;
  error?: string;
};

export type SourceScanResult = {
  ranAt: string;
  totalSources: number;
  totalFetched: number;
  totalUpserted: number;
  sources: SourceScanSourceResult[];
};

export type SourceScanOptions = {
  loadSources?: (request: PublicProfileRepositoryRequest) => Promise<JobSourceRecord[]>;
  fetchSource?: (source: JobSource, options: FetchConnectorJobsOptions) => Promise<NormalizedConnectorJob[]>;
  markScanned?: (
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
  const parsed = parsePosting(job.descriptionText);
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
    responsibilities: parsed.responsibilities,
    required_experience: parsed.requiredExperience,
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

// Fetch from each active scan source and upsert normalized postings into the public `jobs` table.
// Per-source failures are isolated and recorded; an empty/paused source list is a safe no-op. This
// is the system-wide source scan; per-user scans match against the populated table.
export async function runSourceScan(
  request: PublicProfileRepositoryRequest,
  options: SourceScanOptions = {},
): Promise<SourceScanResult> {
  const now = options.now?.() ?? new Date().toISOString();
  const loadSources = options.loadSources ?? loadActiveJobSources;
  const fetchSource = options.fetchSource ?? fetchNormalizedConnectorJobs;
  const markScanned = options.markScanned ?? markJobSourceScanned;
  const limit = options.maxJobsPerSource ?? DEFAULT_MAX_JOBS_PER_SOURCE;

  const sources = await loadSources(request);
  const results: SourceScanSourceResult[] = [];
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

      await markScanned(request, source.id, { at: now });
      totalFetched += jobs.length;
      totalUpserted += upsertable.length;
      results.push({
        sourceId: source.id,
        companyName: source.companyName,
        provider: source.atsProvider,
        status: "scanned",
        fetched: jobs.length,
        upserted: upsertable.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to scan source.";
      await markScanned(request, source.id, { at: now, error: message });
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

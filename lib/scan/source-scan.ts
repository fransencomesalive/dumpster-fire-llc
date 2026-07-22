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
  hostConcurrency?: number;
};

const DEFAULT_MAX_JOBS_PER_SOURCE = 200;
const DEFAULT_HOST_CONCURRENCY = 4;

function sourceName(job: NormalizedConnectorJob) {
  try {
    const hostname = new URL(job.sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
    if (hostname === "remotive.com") return "remotive";
    if (hostname === "himalayas.app") return "himalayas";
    if (hostname === "jobs.workable.com") return "workable";
    if (hostname === "arbeitnow.com" || hostname.endsWith(".arbeitnow.com")) return "arbeitnow";
    if (hostname === "remoteok.com") return "remote_ok";
    if (hostname === "weworkremotely.com") return "we_work_remotely";
    if (hostname === "adzuna.com" || hostname.endsWith(".adzuna.com")) return "adzuna";
  } catch {
    // A malformed URL is dropped by ingestableJobs; preserve the provider here.
  }
  return job.sourceProvider;
}

function sourceHostname(source: JobSource) {
  if (source.atsProvider === "greenhouse") return "boards-api.greenhouse.io";
  if (source.atsProvider === "lever") return "api.lever.co";
  if (source.atsProvider === "ashby") return "api.ashbyhq.com";
  try {
    return new URL(source.careersUrl).hostname.toLowerCase();
  } catch {
    return `${source.atsProvider}:${source.id}`;
  }
}

async function mapWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(Math.max(1, limit), queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await task(item);
  });
  await Promise.all(workers);
}

function jobRowBody(job: NormalizedConnectorJob, scrapedAt: string) {
  const parsed = parsePosting(job.descriptionText);
  return {
    source: sourceName(job),
    source_url: job.sourceUrl,
    // Scanned postings are shared-pool rows; only user-pasted jobs carry an owner.
    owner_user_id: null,
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

// The `jobs` row shape returned when an ingest asks for its upserted rows back.
export type IngestedJobRow = {
  id: string;
  source: string;
  source_url: string;
  company_name: string;
  title: string;
  location: string | null;
  remote_type: string | null;
  employment_type: string | null;
  compensation_text: string | null;
  department: string | null;
  description: string;
  posted_at: string | null;
  scraped_at: string;
  created_at: string;
  updated_at: string;
  responsibilities: string[] | null;
  required_experience: string[] | null;
};

const INGESTED_ROW_SELECT = "id,source,source_url,company_name,title,location,remote_type,employment_type,compensation_text,department,description,posted_at,scraped_at,created_at,updated_at,responsibilities,required_experience";

// Upsert normalized postings into the shared `jobs` pool. Rows whose heuristic produced
// sections carry them; rows with empty sections OMIT those columns so an ingest never
// clobbers an LLM gap-fill (on conflict, omitted columns are preserved). See
// lib/scan/refine-postings.ts. With `returnRows`, the upserted rows (ids included) come
// back so a per-user scan can put them straight into its candidate set.
export async function ingestNormalizedJobs(
  request: PublicProfileRepositoryRequest,
  jobs: NormalizedConnectorJob[],
  scrapedAt: string,
  options: { limit?: number; returnRows?: boolean } = {},
): Promise<{ upserted: number; rows: IngestedJobRow[] }> {
  const upsertable = ingestableJobs(jobs, options.limit ?? DEFAULT_MAX_JOBS_PER_SOURCE);
  if (upsertable.length === 0) return { upserted: 0, rows: [] };

  const rows = upsertable.map((job) => jobRowBody(job, scrapedAt));
  const withSections = rows.filter((row) => row.responsibilities.length > 0 || row.required_experience.length > 0);
  const withoutSections = rows
    .filter((row) => row.responsibilities.length === 0 && row.required_experience.length === 0)
    .map((row) => {
      const copy = { ...row } as Record<string, unknown>;
      delete copy.responsibilities;
      delete copy.required_experience;
      return copy;
    });

  const query = options.returnRows
    ? `?on_conflict=source,source_url,owner_user_id&select=${INGESTED_ROW_SELECT}`
    : "?on_conflict=source,source_url,owner_user_id";
  const headers = options.returnRows
    ? { Prefer: "resolution=merge-duplicates,return=representation" }
    : { Prefer: "resolution=merge-duplicates" };

  const returned: IngestedJobRow[] = [];
  if (withSections.length > 0) {
    const result = await request<IngestedJobRow[] | undefined>("jobs", { method: "POST", query, headers, body: withSections });
    if (options.returnRows && Array.isArray(result)) returned.push(...result);
  }
  if (withoutSections.length > 0) {
    const result = await request<IngestedJobRow[] | undefined>("jobs", { method: "POST", query, headers, body: withoutSections });
    if (options.returnRows && Array.isArray(result)) returned.push(...result);
  }

  return { upserted: upsertable.length, rows: returned };
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
  const hostConcurrency = options.hostConcurrency ?? DEFAULT_HOST_CONCURRENCY;

  const sources = await loadSources(request);
  const grouped = new Map<string, Array<{ source: JobSourceRecord; index: number }>>();
  sources.forEach((source, index) => {
    const hostname = sourceHostname(source);
    const group = grouped.get(hostname) ?? [];
    group.push({ source, index });
    grouped.set(hostname, group);
  });

  const results = new Array<SourceScanSourceResult>(sources.length);
  await mapWithConcurrency([...grouped.values()], hostConcurrency, async (group) => {
    // Same-host sources stay sequential so query variants do not hammer one public API.
    for (const { source, index } of group) {
      try {
        const jobs = await fetchSource(source, { workdayVariants: source.workdayVariants, env: options.env });
        const { upserted } = await ingestNormalizedJobs(request, jobs, now, { limit });
        await markScanned(request, source.id, { at: now });
        results[index] = {
          sourceId: source.id,
          companyName: source.companyName,
          provider: source.atsProvider,
          status: "scanned",
          fetched: jobs.length,
          upserted,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to scan source.";
        await markScanned(request, source.id, { at: now, error: message });
        results[index] = {
          sourceId: source.id,
          companyName: source.companyName,
          provider: source.atsProvider,
          status: "error",
          fetched: 0,
          upserted: 0,
          error: message,
        };
      }
    }
  });

  const totalFetched = results.reduce((total, result) => total + result.fetched, 0);
  const totalUpserted = results.reduce((total, result) => total + result.upserted, 0);

  return {
    ranAt: now,
    totalSources: sources.length,
    totalFetched,
    totalUpserted,
    sources: results,
  };
}

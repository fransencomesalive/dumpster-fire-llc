import { evaluateCandidateProfileQuality } from "../public-profile/profile-quality";
import {
  loadCandidateProfileAggregate,
  type PublicProfileRepositoryRequest,
} from "../public-profile/repository";
import type { CandidateProfileAggregate } from "../public-profile/types";
import type { PublicJobRecord, PublicJobsResponse, PublicJobsScanResponse, PublicJobsSummary } from "./types";

type JobRow = {
  id: string;
  source: string;
  source_url: string;
  company_name: string;
  title: string;
  location: string | null;
  remote_type: string | null;
  employment_type: string | null;
  compensation_text: string | null;
  description: string;
  posted_at: string | null;
  scraped_at: string;
  created_at: string;
  updated_at: string;
};

type JobScanResultRow = {
  job_id: string;
  first_seen_at: string;
  last_seen_at: string;
  scan_context: Record<string, unknown>;
};

type SavedJobRow = {
  job_id: string;
  created_at: string;
};

type PublicJobsReadiness =
  | {
      status: "ready";
      aggregate: CandidateProfileAggregate;
      scanParameters: string[];
    }
  | {
      status: "not_found";
    }
  | {
      status: "incomplete";
      reasons: string[];
    };

function qs(params: Record<string, string>) {
  return `?${new URLSearchParams(params).toString()}`;
}

function defined<T>(value: T | null | undefined) {
  return value === null || value === undefined ? undefined : value;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalize(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(trimmed);
  }
  return output;
}

function scanParametersForAggregate(aggregate: CandidateProfileAggregate) {
  return unique([
    ...aggregate.roleTracks.flatMap((track) => [track.name, ...track.targetTitles]),
    ...(aggregate.preferences?.targetIndustries ?? []),
    ...(aggregate.preferences?.targetCompanyTypes ?? []),
  ]).slice(0, 30);
}

function avoidCompaniesForAggregate(aggregate: CandidateProfileAggregate) {
  return new Set((aggregate.preferences?.avoidCompanies ?? []).map(normalize).filter(Boolean));
}

function jobMatchesProfile(job: JobRow, aggregate: CandidateProfileAggregate, scanParameters: string[]) {
  const avoidedCompanies = avoidCompaniesForAggregate(aggregate);
  if (avoidedCompanies.has(normalize(job.company_name))) return false;

  if (aggregate.profile.remotePreference === "remote_only" && normalize(job.remote_type ?? "") === "onsite") {
    return false;
  }

  if (scanParameters.length === 0) return true;

  const haystack = normalize([
    job.title,
    job.company_name,
    job.location ?? "",
    job.remote_type ?? "",
    job.employment_type ?? "",
    job.compensation_text ?? "",
    job.description,
  ].join(" "));

  return scanParameters.some((parameter) => {
    const normalized = normalize(parameter);
    if (!normalized) return false;
    return haystack.includes(normalized) || normalized.split(" ").some((part) => part.length >= 5 && haystack.includes(part));
  });
}

function mapJob(job: JobRow, result: JobScanResultRow, savedJobIds: Set<string>): PublicJobRecord {
  return {
    id: job.id,
    source: job.source,
    sourceUrl: job.source_url,
    companyName: job.company_name,
    title: job.title,
    location: defined(job.location),
    remoteType: defined(job.remote_type),
    employmentType: defined(job.employment_type),
    compensationText: defined(job.compensation_text),
    description: job.description,
    postedAt: defined(job.posted_at),
    scrapedAt: job.scraped_at,
    firstSeenAt: result.first_seen_at,
    lastSeenAt: result.last_seen_at,
    saved: savedJobIds.has(job.id),
  };
}

async function ensureReadyProfile(
  request: PublicProfileRepositoryRequest,
  userId: string,
  checkedAt: string,
): Promise<PublicJobsReadiness> {
  const aggregate = await loadCandidateProfileAggregate(request, userId);
  if (!aggregate) return { status: "not_found" };

  const profileQuality = aggregate.profileQuality ?? evaluateCandidateProfileQuality(aggregate, checkedAt);
  if (profileQuality.status !== "complete") {
    return {
      status: "incomplete",
      reasons: profileQuality.incompleteReasons,
    };
  }

  return {
    status: "ready",
    aggregate,
    scanParameters: scanParametersForAggregate(aggregate),
  };
}

async function savedJobIdsForUser(request: PublicProfileRepositoryRequest, userId: string) {
  const rows = await request<SavedJobRow[]>("saved_jobs", {
    query: qs({ user_id: `eq.${userId}`, select: "job_id,created_at" }),
  });
  return new Set(rows.map((row) => row.job_id));
}

async function activeResultsForUser(request: PublicProfileRepositoryRequest, userId: string) {
  return request<JobScanResultRow[]>("job_scan_results", {
    query: qs({
      user_id: `eq.${userId}`,
      status: "eq.active",
      select: "job_id,first_seen_at,last_seen_at,scan_context",
      order: "last_seen_at.desc",
    }),
  });
}

async function jobsById(request: PublicProfileRepositoryRequest, jobIds: string[]) {
  if (jobIds.length === 0) return [];
  return request<JobRow[]>("jobs", {
    query: qs({
      id: `in.(${jobIds.join(",")})`,
      select: "id,source,source_url,company_name,title,location,remote_type,employment_type,compensation_text,description,posted_at,scraped_at,created_at,updated_at",
    }),
  });
}

function summaryForJobs(jobs: PublicJobRecord[], scanParameters: string[]): PublicJobsSummary {
  const lastScanAt = jobs
    .map((job) => job.lastSeenAt)
    .sort()
    .at(-1);

  return {
    totalJobs: jobs.length,
    savedJobs: jobs.filter((job) => job.saved).length,
    lastScanAt,
    scanParameters,
  };
}

export async function readPublicJobsForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  checkedAt: string,
): Promise<PublicJobsResponse | PublicJobsReadiness> {
  const readiness = await ensureReadyProfile(request, userId, checkedAt);
  if (readiness.status !== "ready") return readiness;

  const results = await activeResultsForUser(request, userId);
  const savedJobIds = await savedJobIdsForUser(request, userId);
  const rows = await jobsById(request, results.map((result) => result.job_id));
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const jobs = results
    .map((result) => {
      const job = rowsById.get(result.job_id);
      return job ? mapJob(job, result, savedJobIds) : undefined;
    })
    .filter((job): job is PublicJobRecord => Boolean(job));

  return {
    jobs,
    summary: summaryForJobs(jobs, readiness.scanParameters),
  };
}

export async function runPublicJobsScanForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  scannedAt: string,
): Promise<PublicJobsScanResponse | PublicJobsReadiness> {
  const readiness = await ensureReadyProfile(request, userId, scannedAt);
  if (readiness.status !== "ready") return readiness;

  const candidateRows = await request<JobRow[]>("jobs", {
    query: qs({
      select: "id,source,source_url,company_name,title,location,remote_type,employment_type,compensation_text,description,posted_at,scraped_at,created_at,updated_at",
      order: "scraped_at.desc",
      limit: "250",
    }),
  });
  const matchedJobs = candidateRows
    .filter((job) => jobMatchesProfile(job, readiness.aggregate, readiness.scanParameters))
    .slice(0, 75);

  if (matchedJobs.length > 0) {
    await request("job_scan_results", {
      method: "POST",
      query: "?on_conflict=user_id,job_id",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: matchedJobs.map((job) => ({
        user_id: userId,
        profile_id: readiness.aggregate.profile.id,
        job_id: job.id,
        status: "active",
        scan_context: {
          providerMode: "normalized_public_jobs",
          parameters: readiness.scanParameters,
        },
        last_seen_at: scannedAt,
        updated_at: scannedAt,
      })),
    });
  }

  const response = await readPublicJobsForUser(request, userId, scannedAt);
  if ("status" in response) return response;

  return {
    ...response,
    scan: {
      scannedAt,
      matchedJobs: matchedJobs.length,
      mergedResults: response.jobs.length,
      providerMode: "normalized_public_jobs",
    },
  };
}

export async function setPublicJobSavedForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  jobId: string,
  saved: boolean,
  updatedAt: string,
): Promise<PublicJobsResponse | PublicJobsReadiness | { status: "not_in_results" }> {
  const readiness = await ensureReadyProfile(request, userId, updatedAt);
  if (readiness.status !== "ready") return readiness;

  const resultRows = await request<JobScanResultRow[]>("job_scan_results", {
    query: qs({
      user_id: `eq.${userId}`,
      job_id: `eq.${jobId}`,
      status: "eq.active",
      select: "job_id,first_seen_at,last_seen_at,scan_context",
      limit: "1",
    }),
  });
  if (resultRows.length === 0) return { status: "not_in_results" };

  if (saved) {
    await request("saved_jobs", {
      method: "POST",
      query: "?on_conflict=user_id,job_id",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: {
        user_id: userId,
        profile_id: readiness.aggregate.profile.id,
        job_id: jobId,
        updated_at: updatedAt,
      },
    });
  } else {
    await request("saved_jobs", {
      method: "DELETE",
      query: qs({ user_id: `eq.${userId}`, job_id: `eq.${jobId}` }),
    });
  }

  return readPublicJobsForUser(request, userId, updatedAt);
}

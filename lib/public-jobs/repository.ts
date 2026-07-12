import { evaluateCandidateProfileQuality } from "../public-profile/profile-quality";
import { evaluateMatch } from "../public-profile/matching/engine";
import type { MatchJob } from "../public-profile/matching/types";
import {
  loadCandidateProfileAggregate,
  type PublicProfileRepositoryRequest,
} from "../public-profile/repository";
import type { CandidateProfileAggregate } from "../public-profile/types";
import { ingestNormalizedJobs } from "../scan/source-scan";
import { resolveBoardFromUrl } from "../scan/sources/board-registry";
import {
  deleteUserJobSource,
  insertUserJobSource,
  loadUserJobSources,
  markJobSourceScanned,
  type UserJobSourceRecord,
} from "../scan/sources/registry";
import { fetchNormalizedConnectorJobs } from "../scan/sources/runner";
import type { PublicJobBoardRecord, PublicJobBoardsResponse, PublicJobMatchSummary, PublicJobRecord, PublicJobSearchSettings, PublicJobsResponse, PublicJobsScanResponse, PublicJobsSummary } from "./types";

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
  responsibilities: string[] | null;
  required_experience: string[] | null;
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
      titleParameters: string[];
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
  ]).slice(0, 30);
}

// The job-title subset of the scan parameters (track names + target titles, no
// industries) — surfaced read-only on the dashboard's "Job titles in this scan" card.
function titleParametersForAggregate(aggregate: CandidateProfileAggregate) {
  return unique(
    aggregate.roleTracks.flatMap((track) => [track.name, ...track.targetTitles]),
  ).slice(0, 30);
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
    responsibilities: job.responsibilities ?? [],
    requiredExperience: job.required_experience ?? [],
  };
}

function mapPublicJobRecord(job: JobRow, saved = false): PublicJobRecord {
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
    firstSeenAt: job.created_at,
    lastSeenAt: job.updated_at,
    saved,
    responsibilities: job.responsibilities ?? [],
    requiredExperience: job.required_experience ?? [],
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
    titleParameters: titleParametersForAggregate(aggregate),
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
      select: "id,source,source_url,company_name,title,location,remote_type,employment_type,compensation_text,description,posted_at,scraped_at,created_at,updated_at,responsibilities,required_experience",
    }),
  });
}

export async function loadPublicJobById(
  request: PublicProfileRepositoryRequest,
  jobId: string,
): Promise<PublicJobRecord | undefined> {
  const rows = await jobsById(request, [jobId]);
  const row = rows[0];
  return row ? mapPublicJobRecord(row) : undefined;
}

export async function loadPublicJobsByIds(
  request: PublicProfileRepositoryRequest,
  jobIds: string[],
): Promise<Map<string, PublicJobRecord>> {
  const uniqueIds = [...new Set(jobIds)];
  const rows = await jobsById(request, uniqueIds);
  return new Map(rows.map((row) => [row.id, mapPublicJobRecord(row)]));
}

function summaryForJobs(jobs: PublicJobRecord[], scanParameters: string[], titleParameters: string[]): PublicJobsSummary {
  const lastScanAt = jobs
    .map((job) => job.lastSeenAt)
    .sort()
    .at(-1);

  return {
    totalJobs: jobs.length,
    savedJobs: jobs.filter((job) => job.saved).length,
    lastScanAt,
    scanParameters,
    titleParameters,
  };
}

function matchJobFromRecord(job: PublicJobRecord): MatchJob {
  return {
    id: job.id,
    title: job.title,
    companyName: job.companyName,
    description: job.description,
    location: job.location,
    remoteType: job.remoteType,
    employmentType: job.employmentType,
    compensationText: job.compensationText,
    postedAt: job.postedAt,
    scrapedAt: job.scrapedAt,
    sourceUrl: job.sourceUrl,
  };
}

// Score each result against the candidate profile, annotate it, and rank best-first. Scoring is a
// spectrum — poor-fit jobs are still returned (with their score/label), never hard-filtered out.
function rankJobsForProfile(
  jobs: PublicJobRecord[],
  aggregate: CandidateProfileAggregate,
  evaluatedAt: string,
): PublicJobRecord[] {
  const annotated = jobs.map((job): PublicJobRecord => {
    const result = evaluateMatch({ profile: aggregate, job: matchJobFromRecord(job), evaluatedAt });
    const signals = unique(result.categoryFits.flatMap((fit) => fit.matchedSignals)).slice(0, 12);
    const match: PublicJobMatchSummary = { score: result.internalScore, label: result.label, signals };
    return { ...job, match };
  });
  return annotated.sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
}

function searchSettingsForAggregate(aggregate: CandidateProfileAggregate): PublicJobSearchSettings {
  const targetTitles = unique(aggregate.roleTracks.flatMap((track) => track.targetTitles));
  return {
    remotePreference: aggregate.profile.remotePreference,
    salaryFloor: aggregate.profile.targetCompensationMin,
    targetTitleCount: targetTitles.length,
    avoidedCompanyCount: (aggregate.preferences?.avoidCompanies ?? []).length,
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

  const rankedJobs = rankJobsForProfile(jobs, readiness.aggregate, checkedAt);

  return {
    jobs: rankedJobs,
    summary: summaryForJobs(rankedJobs, readiness.scanParameters, readiness.titleParameters),
    searchSettings: searchSettingsForAggregate(readiness.aggregate),
  };
}

export type PublicJobsScanOptions = {
  loadUserSources?: typeof loadUserJobSources;
  fetchSource?: typeof fetchNormalizedConnectorJobs;
  ingestJobs?: typeof ingestNormalizedJobs;
  markScanned?: typeof markJobSourceScanned;
  env?: NodeJS.ProcessEnv;
  // Boards fetched live per scan; least-recently-scanned first so every board rotates
  // through even when a user owns more than the budget.
  maxUserBoards?: number;
};

const DEFAULT_MAX_USER_BOARDS = 6;
const USER_BOARD_FETCH_CONCURRENCY = 3;
const MAX_JOBS_PER_USER_BOARD = 100;

async function mapWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await task(item);
    }
  });
  await Promise.all(workers);
}

// Fetch the user's private company boards live and pour their postings into the shared
// jobs pool, returning the upserted rows so this scan's candidate set always includes
// them (the newest-250 window alone could miss board postings in a large pool). Failures
// are isolated per board and recorded on the source row; a failure here never fails the
// scan (e.g. the job_sources owner column not yet migrated).
async function fetchUserBoardsForScan(
  request: PublicProfileRepositoryRequest,
  userId: string,
  scannedAt: string,
  options: PublicJobsScanOptions,
): Promise<{ rows: JobRow[]; userBoards?: { scanned: number; errors: number } }> {
  const loadUserSources = options.loadUserSources ?? loadUserJobSources;
  const fetchSource = options.fetchSource ?? fetchNormalizedConnectorJobs;
  const ingestJobs = options.ingestJobs ?? ingestNormalizedJobs;
  const markScanned = options.markScanned ?? markJobSourceScanned;

  let sources: UserJobSourceRecord[];
  try {
    sources = await loadUserSources(request, userId);
  } catch {
    return { rows: [] };
  }
  if (sources.length === 0) return { rows: [], userBoards: { scanned: 0, errors: 0 } };

  const rotation = [...sources]
    .sort((a, b) => {
      if (a.lastScannedAt === b.lastScannedAt) return 0;
      if (a.lastScannedAt === null) return -1;
      if (b.lastScannedAt === null) return 1;
      return a.lastScannedAt < b.lastScannedAt ? -1 : 1;
    })
    .slice(0, options.maxUserBoards ?? DEFAULT_MAX_USER_BOARDS);

  const rows: JobRow[] = [];
  let scanned = 0;
  let errors = 0;
  await mapWithConcurrency(rotation, USER_BOARD_FETCH_CONCURRENCY, async (source) => {
    try {
      const jobs = await fetchSource(source, { workdayVariants: source.workdayVariants, env: options.env });
      const ingested = await ingestJobs(request, jobs, scannedAt, { limit: MAX_JOBS_PER_USER_BOARD, returnRows: true });
      rows.push(...(ingested.rows as JobRow[]));
      await markScanned(request, source.id, { at: scannedAt });
      scanned += 1;
    } catch (error) {
      errors += 1;
      const message = error instanceof Error ? error.message : "Unable to scan board.";
      await markScanned(request, source.id, { at: scannedAt, error: message }).catch(() => {});
    }
  });

  return { rows, userBoards: { scanned, errors } };
}

export async function runPublicJobsScanForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  scannedAt: string,
  options: PublicJobsScanOptions = {},
): Promise<PublicJobsScanResponse | PublicJobsReadiness> {
  const readiness = await ensureReadyProfile(request, userId, scannedAt);
  if (readiness.status !== "ready") return readiness;

  const boards = await fetchUserBoardsForScan(request, userId, scannedAt, options);

  const candidateRows = await request<JobRow[]>("jobs", {
    query: qs({
      select: "id,source,source_url,company_name,title,location,remote_type,employment_type,compensation_text,description,posted_at,scraped_at,created_at,updated_at",
      order: "scraped_at.desc",
      limit: "250",
    }),
  });

  // Skipped jobs stay gone: the results upsert below force-sets status "active" on
  // conflict, so dismissed rows must never re-enter the candidate set.
  const dismissedRows = await request<{ job_id: string }[]>("job_scan_results", {
    query: qs({ user_id: `eq.${userId}`, status: "eq.dismissed", select: "job_id" }),
  });
  const dismissedIds = new Set(dismissedRows.map((row) => row.job_id));

  const seenCandidateIds = new Set<string>();
  const candidates = [...boards.rows, ...candidateRows].filter((job) => {
    if (seenCandidateIds.has(job.id)) return false;
    seenCandidateIds.add(job.id);
    return true;
  });

  const matchedJobs = candidates
    .filter((job) => !dismissedIds.has(job.id))
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
      ...(boards.userBoards ? { userBoards: boards.userBoards } : {}),
    },
  };
}

// --- Private company job boards (user-owned job_sources rows, Randall 2026-07-10) ---

const MAX_USER_BOARDS_PER_USER = 15;

function mapUserBoard(record: UserJobSourceRecord): PublicJobBoardRecord {
  return {
    id: record.id,
    companyName: record.companyName,
    careersUrl: record.careersUrl || record.websiteUrl,
    provider: record.atsProvider,
  };
}

export async function listPublicJobBoardsForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
): Promise<PublicJobBoardsResponse> {
  const sources = await loadUserJobSources(request, userId);
  return { boards: sources.map(mapUserBoard) };
}

export type AddPublicJobBoardResult =
  | PublicJobBoardsResponse
  | { status: "unrecognized_board" }
  | { status: "board_limit" }
  | { status: "board_fetch_failed"; message: string };

export type UnrecognizedBoardReason = "unrecognized_board" | "board_fetch_failed";

export async function logUnrecognizedBoardSubmission(
  request: PublicProfileRepositoryRequest,
  userId: string,
  url: string,
  reason: UnrecognizedBoardReason,
): Promise<void> {
  await request("unrecognized_board_submissions", {
    method: "POST",
    body: { user_id: userId, url, reason },
  });
}

export async function logUnrecognizedBoardSubmissionBestEffort(
  request: PublicProfileRepositoryRequest,
  userId: string,
  url: string,
  reason: UnrecognizedBoardReason,
): Promise<void> {
  try {
    await logUnrecognizedBoardSubmission(request, userId, url, reason);
  } catch {
    // Failure telemetry must never alter the user's add-board response.
  }
}

function isPlausibleGenericBoardJob(job: { title: string; sourceUrl: string }) {
  const title = job.title.trim();
  if (title.length < 4) return false;
  if (/^(?:skip to|view all|see all|browse all)\b/i.test(title)) return false;
  if (/\b(?:careers?|jobs?|openings?|opportunities?)$/i.test(title)) return false;
  try {
    const url = new URL(job.sourceUrl);
    return /\/(?:jobs?|careers?|positions?|openings?|vacancies?|opportunities?)(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

// Add flow: resolve the pasted URL to a supported board, verify it live (a pattern-valid
// token can still 404), insert the owner-scoped source row, and pour the fetched postings
// into the shared jobs pool so the very next scan can match them.
export async function addPublicJobBoardForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  url: string,
  now: string,
  options: PublicJobsScanOptions = {},
): Promise<AddPublicJobBoardResult> {
  const resolution = resolveBoardFromUrl(url);
  if (resolution.status !== "resolved") return { status: "unrecognized_board" };

  const existing = await loadUserJobSources(request, userId);
  if (existing.length >= MAX_USER_BOARDS_PER_USER) return { status: "board_limit" };

  const fetchSource = options.fetchSource ?? fetchNormalizedConnectorJobs;
  const ingestJobs = options.ingestJobs ?? ingestNormalizedJobs;
  const markScanned = options.markScanned ?? markJobSourceScanned;

  const board = resolution.board;
  let jobs;
  try {
    jobs = await fetchSource(
      {
        id: "pending",
        companyName: board.companySlug,
        websiteUrl: "",
        careersUrl: board.careersUrl,
        atsBoardToken: board.atsBoardToken,
        atsProvider: board.provider,
      },
      { env: options.env },
    );
  } catch (error) {
    return {
      status: "board_fetch_failed",
      message: error instanceof Error ? error.message : "Board fetch failed.",
    };
  }

  if (board.provider === "html" && board.confidence === "guess") {
    jobs = jobs.filter(isPlausibleGenericBoardJob);
    if (jobs.length === 0) return { status: "unrecognized_board" };
  }

  const source = await insertUserJobSource(request, userId, board, now);
  await ingestJobs(request, jobs, now, { limit: MAX_JOBS_PER_USER_BOARD });
  await markScanned(request, source.id, { at: now });

  return listPublicJobBoardsForUser(request, userId);
}

export async function removePublicJobBoardForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  sourceId: string,
): Promise<PublicJobBoardsResponse> {
  await deleteUserJobSource(request, userId, sourceId);
  return listPublicJobBoardsForUser(request, userId);
}

// Skip ("not interested"): flip the user's result row to 'dismissed'. Dismissed rows drop
// out of every read (activeResultsForUser filters status=eq.active) and the scan's
// dismissed-exclusion keeps them from being resurrected by future upserts.
export async function setPublicJobDismissedForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  jobId: string,
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

  await request("job_scan_results", {
    method: "PATCH",
    query: qs({ user_id: `eq.${userId}`, job_id: `eq.${jobId}` }),
    body: { status: "dismissed", updated_at: updatedAt },
  });

  return readPublicJobsForUser(request, userId, updatedAt);
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

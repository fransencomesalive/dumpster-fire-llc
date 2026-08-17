import { createHash } from "node:crypto";
import { evaluateCandidateProfileQuality } from "../public-profile/profile-quality";
import {
  evaluatePublicJobDecision,
  matchingSignalsForAggregate,
  type PublicMatchDecision,
  type ProfileMatchingSignals,
} from "../public-profile/matching/decision";
import { duplicatePostingKey } from "../public-profile/matching/dedupe";
import { evaluateMatch } from "../public-profile/matching/engine";
import {
  classifyOccupation,
  lanePolarityForProfile,
  type OccupationLane,
} from "../public-profile/matching/occupation";
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
import {
  PUBLIC_JOB_MATCHER_VERSION,
  snapshotPublicJob,
  type PublicJobBoardRecord,
  type PublicJobBoardsResponse,
  type PublicJobMatchFeedbackInput,
  type PublicJobMatchFeedbackResponse,
  type PublicJobMatchSummary,
  type PublicJobRecord,
  type PublicJobSearchSettings,
  type PublicJobsResponse,
  type PublicJobsScanResponse,
  type PublicJobsSummary,
} from "./types";

type JobRow = {
  id: string;
  source: string;
  source_url: string;
  link_status?: "unknown" | "healthy" | "gone" | "uncertain" | null;
  link_checked_at?: string | null;
  link_http_status?: number | null;
  link_health_reason?: string | null;
  owner_user_id: string | null;
  company_name: string;
  title: string;
  location: string | null;
  remote_type: string | null;
  employment_type: string | null;
  compensation_text: string | null;
  department?: string | null;
  description: string;
  posted_at: string | null;
  scraped_at: string;
  created_at: string;
  updated_at: string;
  responsibilities: string[] | null;
  required_experience: string[] | null;
};

type JobScanResultRow = {
  profile_id: string;
  job_id: string;
  first_seen_at: string;
  last_seen_at: string;
  scan_context: Record<string, unknown>;
};

type SavedJobRow = {
  job_id: string;
  created_at: string;
};

type PursuedJobRow = {
  job_id: string | null;
  status: string;
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

function titleIncludesIntent(title: string, intent: string) {
  const normalizedIntent = normalize(intent);
  if (!normalizedIntent) return false;
  return ` ${normalize(title)} `.includes(` ${normalizedIntent} `);
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
  const titleParameters = unique(aggregate.roleTracks.flatMap((track) => (
    track.targetTitles.length > 0 ? track.targetTitles : [track.name]
  )));
  return unique([
    ...titleParameters,
    ...(aggregate.preferences?.targetIndustries ?? []),
  ]).slice(0, 30);
}

// The job-title subset of the scan parameters. Explicit target titles take
// precedence; Role Track names remain a fallback for older profiles.
function titleParametersForAggregate(aggregate: CandidateProfileAggregate) {
  return unique(aggregate.roleTracks.flatMap((track) => (
    track.targetTitles.length > 0 ? track.targetTitles : [track.name]
  )))
    .slice(0, 30);
}

function matchJobFromRow(job: JobRow): MatchJob {
  return {
    id: job.id,
    title: job.title,
    companyName: job.company_name,
    description: job.description,
    responsibilities: job.responsibilities ?? [],
    requiredExperience: job.required_experience ?? [],
    location: defined(job.location),
    remoteType: defined(job.remote_type),
    employmentType: defined(job.employment_type),
    compensationText: defined(job.compensation_text),
    department: defined(job.department),
    postedAt: defined(job.posted_at),
    scrapedAt: job.scraped_at,
    sourceUrl: job.source_url,
  };
}

function mapJob(job: JobRow, result: JobScanResultRow, savedJobIds: Set<string>): PublicJobRecord {
  return {
    id: job.id,
    source: job.source,
    sourceUrl: job.source_url,
    linkStatus: job.link_status ?? "unknown",
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
    linkStatus: job.link_status ?? "unknown",
    ownerUserId: defined(job.owner_user_id),
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

async function savedOrPursuedJobIdsForUser(request: PublicProfileRepositoryRequest, userId: string) {
  // Pursuits are the canonical Saved-for-later / Applied records. saved_jobs remains
  // in the union as a release-window compatibility source if the canonical Save RPC
  // has not been migrated yet.
  const [savedRows, pursuedRows] = await Promise.all([
    request<SavedJobRow[]>("saved_jobs", {
      query: qs({ user_id: `eq.${userId}`, select: "job_id,created_at" }),
    }),
    request<PursuedJobRow[]>("pursuits", {
      query: qs({
        user_id: `eq.${userId}`,
        job_id: "not.is.null",
        select: "job_id,status",
      }),
    }),
  ]);
  const canonicalJobIds = new Set(
    pursuedRows.flatMap((row) => row.job_id ? [row.job_id] : []),
  );
  return new Set([
    // A canonical lifecycle row wins over its compatibility row. In particular,
    // a deleted pursuit must not remain hidden merely because an old saved_jobs row
    // was not cleaned up.
    ...savedRows
      .filter((row) => !canonicalJobIds.has(row.job_id))
      .map((row) => row.job_id),
    ...pursuedRows.flatMap((row) => (
      row.job_id && row.status !== "deleted" ? [row.job_id] : []
    )),
  ]);
}

async function activeResultsForUser(request: PublicProfileRepositoryRequest, userId: string) {
  return request<JobScanResultRow[]>("job_scan_results", {
    query: qs({
      user_id: `eq.${userId}`,
      status: "eq.active",
      select: "profile_id,job_id,first_seen_at,last_seen_at,scan_context",
      order: "last_seen_at.desc",
    }),
  });
}

async function jobsById(request: PublicProfileRepositoryRequest, jobIds: string[]) {
  if (jobIds.length === 0) return [];
  return request<JobRow[]>("jobs", {
    query: qs({
      id: `in.(${jobIds.join(",")})`,
      select: "id,source,source_url,owner_user_id,company_name,title,location,remote_type,employment_type,compensation_text,department,description,posted_at,scraped_at,created_at,updated_at,responsibilities,required_experience,link_status,link_checked_at,link_http_status,link_health_reason",
    }),
  });
}

async function jobsByIdForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  jobIds: string[],
) {
  if (jobIds.length === 0) return [];
  const rows = await request<JobRow[]>("jobs", {
    query: qs({
      id: `in.(${jobIds.join(",")})`,
      or: `(owner_user_id.is.null,owner_user_id.eq.${userId})`,
      select: "id,source,source_url,owner_user_id,company_name,title,location,remote_type,employment_type,compensation_text,department,description,posted_at,scraped_at,created_at,updated_at,responsibilities,required_experience,link_status,link_checked_at,link_http_status,link_health_reason",
    }),
  });
  return rows.filter((row) => !row.owner_user_id || row.owner_user_id === userId);
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

export async function loadPublicJobByIdForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  jobId: string,
): Promise<PublicJobRecord | undefined> {
  const rows = await jobsByIdForUser(request, userId, [jobId]);
  const row = rows[0];
  return row ? mapPublicJobRecord(row) : undefined;
}

export async function loadPublicJobsByIdsForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  jobIds: string[],
): Promise<Map<string, PublicJobRecord>> {
  const uniqueIds = [...new Set(jobIds)];
  const rows = await jobsByIdForUser(request, userId, uniqueIds);
  return new Map(rows.map((row) => [row.id, mapPublicJobRecord(row)]));
}

function summaryForJobs(
  jobs: PublicJobRecord[],
  savedJobs: number,
  lastScanAt: string | undefined,
  scanParameters: string[],
  titleParameters: string[],
): PublicJobsSummary {
  return {
    totalJobs: jobs.length,
    savedJobs,
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
    responsibilities: job.responsibilities,
    requiredExperience: job.requiredExperience,
    location: job.location,
    remoteType: job.remoteType,
    employmentType: job.employmentType,
    compensationText: job.compensationText,
    postedAt: job.postedAt,
    scrapedAt: job.scrapedAt,
    sourceUrl: job.sourceUrl,
  };
}

function matchSummaryForJob(
  job: PublicJobRecord,
  aggregate: CandidateProfileAggregate,
  evaluatedAt: string,
): PublicJobMatchSummary {
  const result = evaluateMatch({ profile: aggregate, job: matchJobFromRecord(job), evaluatedAt });
  return {
    score: result.internalScore,
    label: result.label,
    signals: unique(result.categoryFits.flatMap((fit) => fit.matchedSignals)).slice(0, 12),
    matcherVersion: PUBLIC_JOB_MATCHER_VERSION,
    evaluatedAt,
  };
}

function feedbackContextForJob(
  job: PublicJobRecord,
  aggregate: CandidateProfileAggregate,
  evaluatedAt: string,
) {
  const matchJob = matchJobFromRecord(job);
  const matchingSignals = matchingSignalsForAggregate(aggregate);
  const serializableMatchingSignals = {
    ...matchingSignals,
    lanes: {
      coreLanes: [...matchingSignals.lanes.coreLanes].sort(),
      stretchLanes: [...matchingSignals.lanes.stretchLanes].sort(),
    },
  };
  const result = evaluateMatch({ profile: aggregate, job: matchJob, evaluatedAt });
  const match: PublicJobMatchSummary = {
    score: result.internalScore,
    label: result.label,
    signals: unique(result.categoryFits.flatMap((fit) => fit.matchedSignals)).slice(0, 12),
    matcherVersion: PUBLIC_JOB_MATCHER_VERSION,
    evaluatedAt,
  };
  const matchContextHash = createHash("sha256")
    .update(JSON.stringify({
      matcherVersion: PUBLIC_JOB_MATCHER_VERSION,
      matchingSignals: serializableMatchingSignals,
      job: matchJob,
    }))
    .digest("hex");

  return {
    match,
    matchContextHash,
    profileContext: {
      profileId: aggregate.profile.id,
      profileVersion: aggregate.profile.version,
      profileUpdatedAt: aggregate.profile.updatedAt,
      matchingSignals: serializableMatchingSignals,
    },
    jobSnapshot: matchJob,
    matchDetails: {
      categoryFits: result.categoryFits,
      recommendations: result.recommendations,
      risks: result.risks,
      whyMatched: result.whyMatched,
      whyNotMatched: result.whyNotMatched,
      softExclusions: result.softExclusions,
      explanation: result.explanation,
    },
  };
}

// Score each result against the candidate profile, annotate it, and rank best-first. Scoring is a
// spectrum — poor-fit jobs are still returned (with their score/label), never hard-filtered out.
// Duplicate postings of the same role (same company + title, distinct req ids) collapse to one
// row: the saved one if any copy is saved, otherwise the best-scored copy.
function rankJobsForProfile(
  jobs: PublicJobRecord[],
  aggregate: CandidateProfileAggregate,
  evaluatedAt: string,
): PublicJobRecord[] {
  const annotated = jobs.map((job): PublicJobRecord => {
    const match = matchSummaryForJob(job, aggregate, evaluatedAt);
    return { ...job, match };
  });
  annotated.sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));

  const byPostingKey = new Map<string, PublicJobRecord>();
  for (const job of annotated) {
    const key = duplicatePostingKey({ companyName: job.companyName, title: job.title });
    const existing = byPostingKey.get(key);
    if (!existing || (job.saved && !existing.saved)) byPostingKey.set(key, job);
  }
  return [...byPostingKey.values()].sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
}

function searchSettingsForAggregate(aggregate: CandidateProfileAggregate): PublicJobSearchSettings {
  const targetTitles = unique(aggregate.roleTracks.flatMap((track) => track.targetTitles));
  const avoidCompanies = aggregate.preferences?.avoidCompanies ?? [];
  return {
    remotePreference: aggregate.profile.remotePreference,
    salaryFloor: aggregate.profile.targetCompensationMin,
    targetTitles,
    targetTitleCount: targetTitles.length,
    avoidCompanies,
    avoidedCompanyCount: avoidCompanies.length,
  };
}

export async function readPublicJobsForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  checkedAt: string,
): Promise<PublicJobsResponse | PublicJobsReadiness> {
  const readiness = await ensureReadyProfile(request, userId, checkedAt);
  if (readiness.status !== "ready") return readiness;

  const [results, savedJobIds] = await Promise.all([
    activeResultsForUser(request, userId),
    savedOrPursuedJobIdsForUser(request, userId),
  ]);
  const [rows, savedRows] = await Promise.all([
    jobsByIdForUser(request, userId, results.map((result) => result.job_id)),
    jobsByIdForUser(request, userId, [...savedJobIds]),
  ]);
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  // A saved pursuit has left the active scan queue. Exclude both its exact job id and
  // equivalent copies of the same company/title posting so another board's duplicate
  // cannot make the card reappear after a reload or future scan.
  const savedPostingKeys = new Set(savedRows.map((row) => duplicatePostingKey({
    companyName: row.company_name,
    title: row.title,
  })));
  const jobs = results
    .map((result) => {
      const job = rowsById.get(result.job_id);
      return job ? mapJob(job, result, savedJobIds) : undefined;
    })
    .filter((job): job is PublicJobRecord => Boolean(job))
    .filter((job) => job.linkStatus !== "gone")
    .filter((job) => (
      !savedJobIds.has(job.id)
      && !savedPostingKeys.has(duplicatePostingKey(job))
    ));

  const rankedJobs = rankJobsForProfile(jobs, readiness.aggregate, checkedAt);

  return {
    jobs: rankedJobs,
    summary: summaryForJobs(
      rankedJobs,
      savedJobIds.size,
      results.map((result) => result.last_seen_at).sort().at(-1),
      readiness.scanParameters,
      readiness.titleParameters,
    ),
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
  // Injectable completion clock for immutable scan-run diagnostics.
  diagnosticsNow?: () => string;
};

const DEFAULT_MAX_USER_BOARDS = 6;
const USER_BOARD_FETCH_CONCURRENCY = 3;
const MAX_JOBS_PER_USER_BOARD = 100;
const SCAN_POOL_PAGE_SIZE = 1000;
const MAX_SCAN_POOL_ROWS = 10000;

export type TargetAwareScanCandidate<TJob> = {
  job: TJob;
  id: string;
  title: string;
  companyName: string;
  score: number;
  roleFamily: string;
};

type TargetIntent = ProfileMatchingSignals["explicitTitleIntents"][number];

type TargetGroup = {
  key: string;
  lane?: string;
  terms: string[];
};

function targetGroupsForIntents(intents: TargetIntent[]): TargetGroup[] {
  const groups = new Map<string, TargetGroup>();
  for (const intent of intents) {
    const normalizedTerm = normalize(intent.term);
    if (!normalizedTerm) continue;
    // Known titles use their occupation lane. Explicitly modeled ambiguous
    // titles use only their declared context lanes. A truly unknown title with
    // no context remains exact-only and cannot borrow an unrelated family.
    const lanes = intent.titleLane !== "unknown"
      ? [intent.titleLane]
      : [...new Set(intent.contextLanes.filter((lane) => lane !== "unknown"))];
    const groupKeys = lanes.length > 0
      ? lanes.map((lane) => ({ key: `lane:${lane}`, lane }))
      : [{ key: `title:${normalizedTerm}`, lane: undefined }];
    for (const { key, lane } of groupKeys) {
      const group = groups.get(key) ?? {
        key,
        ...(lane ? { lane } : {}),
        terms: [],
      };
      if (!group.terms.includes(intent.term)) group.terms.push(intent.term);
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      terms: [...group.terms].sort((a, b) => normalize(a).localeCompare(normalize(b))),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function exactIntentMatches<TJob>(
  candidate: TargetAwareScanCandidate<TJob>,
  intents: TargetIntent[],
) {
  return intents.filter((intent) => titleIncludesIntent(candidate.title, intent.term));
}

function compareSelectionCandidates<TJob>(
  a: TargetAwareScanCandidate<TJob>,
  b: TargetAwareScanCandidate<TJob>,
  intents: TargetIntent[],
) {
  const exactDifference = exactIntentMatches(b, intents).length - exactIntentMatches(a, intents).length;
  if (exactDifference !== 0) return exactDifference;
  if (a.score !== b.score) return b.score - a.score;
  return normalize(a.companyName).localeCompare(normalize(b.companyName))
    || normalize(a.title).localeCompare(normalize(b.title))
    || a.id.localeCompare(b.id);
}

function candidateSupportsTargetGroup<TJob>(
  candidate: TargetAwareScanCandidate<TJob>,
  group: TargetGroup,
) {
  return group.terms.some((term) => titleIncludesIntent(candidate.title, term))
    || (Boolean(group.lane) && candidate.roleFamily === group.lane);
}

/**
 * Selects a capped scan set without allowing one abundant target family to erase
 * every result from another explicit target family. The decision gate remains
 * authoritative for inclusion; this function only deduplicates and orders jobs
 * that already passed it.
 */
export function selectTargetAwareScanJobs<TJob>(
  candidates: TargetAwareScanCandidate<TJob>[],
  explicitTitleIntents: TargetIntent[],
  limit = 75,
): TJob[] {
  const cappedLimit = Math.max(0, Math.floor(limit));
  if (cappedLimit === 0 || candidates.length === 0) return [];

  const ranked = [...candidates].sort((a, b) => (
    compareSelectionCandidates(a, b, explicitTitleIntents)
  ));

  // Dedupe after deterministic ranking so shuffled database/input order cannot
  // change which source copy survives a tie.
  const byPostingKey = new Map<string, TargetAwareScanCandidate<TJob>>();
  for (const candidate of ranked) {
    const key = duplicatePostingKey({
      companyName: candidate.companyName,
      title: candidate.title,
    });
    if (!byPostingKey.has(key)) byPostingKey.set(key, candidate);
  }
  const deduplicated = [...byPostingKey.values()];

  const selected = new Map<string, TargetAwareScanCandidate<TJob>>();
  const sortedIntents = [...explicitTitleIntents]
    .filter((intent) => normalize(intent.term))
    .sort((a, b) => normalize(a.term).localeCompare(normalize(b.term)));

  // Reserve one exact posting for every explicit title that has one. This is
  // intentionally separate from family balancing so multiple title intents in
  // the same occupation lane remain visible when the pool supports them.
  for (const intent of sortedIntents) {
    if (selected.size >= cappedLimit) break;
    const representative = deduplicated
      .filter((candidate) => !selected.has(candidate.id))
      .filter((candidate) => titleIncludesIntent(candidate.title, intent.term))
      .sort((a, b) => compareSelectionCandidates(a, b, explicitTitleIntents))[0];
    if (representative) selected.set(representative.id, representative);
  }

  // Interleave the explicit occupation-family pools before global score-fill.
  // This lets a smaller eligible family contribute its whole useful pool rather
  // than being reduced to one token result by an abundant higher-scoring lane.
  const familyPools = targetGroupsForIntents(explicitTitleIntents).map((group) => ({
    candidates: deduplicated.filter((candidate) => candidateSupportsTargetGroup(candidate, group)),
    cursor: 0,
  }));
  while (selected.size < cappedLimit) {
    let selectedInRound = false;
    for (const pool of familyPools) {
      while (
        pool.cursor < pool.candidates.length
        && selected.has(pool.candidates[pool.cursor].id)
      ) {
        pool.cursor += 1;
      }
      const candidate = pool.candidates[pool.cursor];
      if (!candidate) continue;
      selected.set(candidate.id, candidate);
      pool.cursor += 1;
      selectedInRound = true;
      if (selected.size >= cappedLimit) break;
    }
    if (!selectedInRound) break;
  }

  // Only candidates that passed the decision gate reach this fallback. It fills
  // unused capacity after all explicit family pools have been exhausted.
  for (const candidate of deduplicated) {
    if (selected.size >= cappedLimit) break;
    if (!selected.has(candidate.id)) selected.set(candidate.id, candidate);
  }

  return [...selected.values()]
    .sort((a, b) => compareSelectionCandidates(a, b, explicitTitleIntents))
    .map((candidate) => candidate.job);
}

type EvaluatedScanCandidate = {
  job: JobRow;
  decision: PublicMatchDecision;
  lane: OccupationLane;
  targetTitle: string;
  matchTier: "exact" | "core" | "stretch";
};

type DiagnosticCountBucket = {
  candidate: number;
  eligible: number;
  selected: number;
  cutoff: number;
};

function serializableMatchingSignals(signals: ProfileMatchingSignals) {
  return {
    ...signals,
    lanes: {
      coreLanes: [...signals.lanes.coreLanes].sort(),
      stretchLanes: [...signals.lanes.stretchLanes].sort(),
    },
  };
}

function scanCandidateLane(job: JobRow) {
  return classifyOccupation({
    title: job.title,
    department: defined(job.department),
    description: [
      job.description,
      ...(job.responsibilities ?? []),
      ...(job.required_experience ?? []),
    ].join(" "),
    companyName: job.company_name,
  }).lane;
}

function targetTitleForCandidate(
  title: string,
  lane: OccupationLane,
  intents: TargetIntent[],
) {
  const exact = intents
    .filter((intent) => titleIncludesIntent(title, intent.term))
    .sort((a, b) => normalize(a.term).localeCompare(normalize(b.term)))[0];
  if (exact) return exact.term;

  const family = intents
    .filter((intent) => intent.titleLane === lane || intent.contextLanes.includes(lane))
    .sort((a, b) => normalize(a.term).localeCompare(normalize(b.term)))[0];
  return family?.term ?? `unassigned:${lane}`;
}

function matchTierForCandidate(
  title: string,
  lane: OccupationLane,
  signals: ProfileMatchingSignals,
): EvaluatedScanCandidate["matchTier"] {
  if (signals.explicitTitleIntents.some((intent) => titleIncludesIntent(title, intent.term))) {
    return "exact";
  }
  return lanePolarityForProfile(lane, signals.lanes) === "stretch" ? "stretch" : "core";
}

function incrementDiagnosticCount(
  counts: Record<string, DiagnosticCountBucket>,
  key: string,
  field: keyof DiagnosticCountBucket,
) {
  const bucket = counts[key] ?? { candidate: 0, eligible: 0, selected: 0, cutoff: 0 };
  bucket[field] += 1;
  counts[key] = bucket;
}

function compareEvaluatedScanCandidates(first: EvaluatedScanCandidate, second: EvaluatedScanCandidate) {
  const firstExact = first.matchTier === "exact" ? 1 : 0;
  const secondExact = second.matchTier === "exact" ? 1 : 0;
  return secondExact - firstExact
    || second.decision.score - first.decision.score
    || normalize(first.job.company_name).localeCompare(normalize(second.job.company_name))
    || normalize(first.job.title).localeCompare(normalize(second.job.title))
    || first.job.id.localeCompare(second.job.id);
}

async function finalizeCompletedScan(
  request: PublicProfileRepositoryRequest,
  input: {
    userId: string;
    profile: CandidateProfileAggregate;
    startedAt: string;
    completedAt: string;
    signals: ProfileMatchingSignals;
    evaluated: EvaluatedScanCandidate[];
    selectedJobs: JobRow[];
    env?: NodeJS.ProcessEnv;
  },
) {
  const selectedRankById = new Map(input.selectedJobs.map((job, index) => [job.id, index + 1]));
  const selectedIds = new Set(selectedRankById.keys());
  const selectedPostingKeys = new Set(input.selectedJobs.map((job) => duplicatePostingKey({
    companyName: job.company_name,
    title: job.title,
  })));
  const eligible = input.evaluated
    .filter((candidate) => candidate.decision.included)
    .sort(compareEvaluatedScanCandidates);
  const laneCounts: Record<string, DiagnosticCountBucket> = {};
  const targetCounts: Record<string, DiagnosticCountBucket> = {};
  const exclusionCounts: Record<string, number> = {};

  for (const candidate of input.evaluated) {
    incrementDiagnosticCount(laneCounts, candidate.lane, "candidate");
    incrementDiagnosticCount(targetCounts, candidate.targetTitle, "candidate");
    if (!candidate.decision.included) {
      const hardRisks = [...new Set(candidate.decision.risks.filter((risk) => risk.startsWith("hard ")))];
      const reasons = hardRisks.length > 0
        ? hardRisks
        : candidate.decision.roleFamily === "unclassified"
        ? ["decision gate: no confirmed role family"]
        : ["decision gate: insufficient supporting evidence"];
      for (const reason of reasons) exclusionCounts[reason] = (exclusionCounts[reason] ?? 0) + 1;
      continue;
    }
    incrementDiagnosticCount(laneCounts, candidate.lane, "eligible");
    incrementDiagnosticCount(targetCounts, candidate.targetTitle, "eligible");
    const outcome = selectedIds.has(candidate.job.id) ? "selected" : "cutoff";
    incrementDiagnosticCount(laneCounts, candidate.lane, outcome);
    incrementDiagnosticCount(targetCounts, candidate.targetTitle, outcome);
  }

  const contextHash = createHash("sha256")
    .update(JSON.stringify({
      matcherVersion: PUBLIC_JOB_MATCHER_VERSION,
      profileId: input.profile.profile.id,
      profileVersion: input.profile.profile.version,
      profileUpdatedAt: input.profile.profile.updatedAt,
      matchingSignals: serializableMatchingSignals(input.signals),
    }))
    .digest("hex");
  const runtimeEnv = input.env ?? process.env;
  const results = eligible.map((candidate, index) => {
    const selectedRank = selectedRankById.get(candidate.job.id);
    const duplicateKey = duplicatePostingKey({
      companyName: candidate.job.company_name,
      title: candidate.job.title,
    });
    return {
      job_id: candidate.job.id,
      disposition: selectedRank ? "selected" : "cutoff",
      candidate_rank: index + 1,
      selected_rank: selectedRank ?? null,
      score: candidate.decision.score,
      lane: candidate.lane,
      target_title: candidate.targetTitle,
      match_tier: candidate.matchTier,
      cutoff_reason: selectedRank
        ? null
        : selectedPostingKeys.has(duplicateKey)
        ? "duplicate_posting"
        : "family_balanced_result_limit",
    };
  });

  const response = await request<unknown>("rpc/finalize_public_job_scan", {
    method: "POST",
    body: {
      p_run: {
        user_id: input.userId,
        profile_id: input.profile.profile.id,
        started_at: input.startedAt,
        completed_at: input.completedAt,
        matcher_version: PUBLIC_JOB_MATCHER_VERSION,
        source_commit_sha: runtimeEnv.VERCEL_GIT_COMMIT_SHA || runtimeEnv.GITHUB_SHA || null,
        deployment_id: runtimeEnv.VERCEL_DEPLOYMENT_ID || null,
        profile_context_hash: contextHash,
        candidate_count: input.evaluated.length,
        eligible_count: eligible.length,
        selected_count: input.selectedJobs.length,
        scan_context: {
          providerMode: "normalized_public_jobs",
          parameters: scanParametersForAggregate(input.profile),
        },
        lane_counts: laneCounts,
        target_counts: targetCounts,
        exclusion_counts: exclusionCounts,
      },
      p_results: results,
      p_selected: input.selectedJobs.map((job) => ({ job_id: job.id })),
    },
  });
  const scanRunId = typeof response === "string"
    ? response
    : Array.isArray(response) && typeof response[0] === "string"
    ? response[0]
    : undefined;
  if (!scanRunId) throw new Error("Job scan diagnostics did not return a scan run id.");
  return scanRunId;
}

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

  // Shared-pool rows plus this user's own pasted jobs only — other users' private
  // pastes must never surface as scan candidates. The WHOLE eligible pool is
  // paged in, newest-first: a fixed newest-N window silently dropped >90% of the
  // pool once the shared boards grew (the 2026-07-16 "4 results" bug). The row
  // cap only bounds a runaway pool, and newest-first keeps the freshest postings
  // if it ever bites.
  const candidateRows: JobRow[] = [];
  for (let offset = 0; candidateRows.length < MAX_SCAN_POOL_ROWS; offset += SCAN_POOL_PAGE_SIZE) {
    const page = await request<JobRow[]>("jobs", {
      query: qs({
        select: "id,source,source_url,owner_user_id,company_name,title,location,remote_type,employment_type,compensation_text,department,description,posted_at,scraped_at,created_at,updated_at,responsibilities,required_experience,link_status,link_checked_at,link_http_status,link_health_reason",
        or: `(owner_user_id.is.null,owner_user_id.eq.${userId})`,
        order: "scraped_at.desc,id.asc",
        limit: String(SCAN_POOL_PAGE_SIZE),
        offset: String(offset),
      }),
    });
    candidateRows.push(...page);
    if (page.length < SCAN_POOL_PAGE_SIZE) break;
  }

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

  // Evidence-gated inclusion (ported from the refined private engine): a job
  // enters the results only when its title family, supporting evidence, and
  // hard constraints clear the decision gate. Duplicate postings of the same
  // role collapse to the best-scored copy before the cap.
  const profileSignals = matchingSignalsForAggregate(readiness.aggregate);
  const evaluatedCandidates: EvaluatedScanCandidate[] = candidates
    .filter((job) => job.link_status !== "gone")
    .filter((job) => !dismissedIds.has(job.id))
    .map((job) => {
      const decision = evaluatePublicJobDecision(matchJobFromRow(job), profileSignals, scannedAt);
      const lane = scanCandidateLane(job);
      return {
        job,
        decision,
        lane,
        targetTitle: targetTitleForCandidate(job.title, lane, profileSignals.explicitTitleIntents),
        matchTier: matchTierForCandidate(job.title, lane, profileSignals),
      };
    });
  const decided = evaluatedCandidates.filter((item) => item.decision.included);

  const matchedJobs = selectTargetAwareScanJobs(
    decided.map(({ job, decision }) => ({
      job,
      id: job.id,
      title: job.title,
      companyName: job.company_name,
      score: decision.score,
      roleFamily: decision.roleFamily,
    })),
    profileSignals.explicitTitleIntents,
    75,
  );

  // Recommendation replacement and immutable decision diagnostics finalize in
  // one database transaction. A failed diagnostics write cannot leave active
  // results mutated without a corresponding scan-run record.
  const scanRunId = await finalizeCompletedScan(request, {
    userId,
    profile: readiness.aggregate,
    startedAt: scannedAt,
    completedAt: options.diagnosticsNow?.() ?? new Date().toISOString(),
    signals: profileSignals,
    evaluated: evaluatedCandidates,
    selectedJobs: matchedJobs,
    env: options.env,
  });

  const response = await readPublicJobsForUser(request, userId, scannedAt);
  if ("status" in response) return response;

  return {
    ...response,
    scan: {
      scannedAt,
      matchedJobs: matchedJobs.length,
      mergedResults: response.jobs.length,
      providerMode: "normalized_public_jobs",
      scanRunId,
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
    const hasPostingPath = /\/(?:jobs?|careers?|positions?|openings?|vacancies?|opportunities?|job-search|job-detail)\/[^/]+/i.test(url.pathname);
    const hasPostingQuery = [...url.searchParams.keys()].some((key) => /^(?:job|job_?id|gh_jid)$/i.test(key));
    return hasPostingPath || hasPostingQuery;
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
      select: "profile_id,job_id,first_seen_at,last_seen_at,scan_context",
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

  const visibleJobs = await jobsByIdForUser(request, userId, [jobId]);
  const jobRow = visibleJobs[0];
  if (!jobRow) return { status: "not_in_results" };
  let job: PublicJobRecord;
  if (saved) {
    const resultRows = await request<JobScanResultRow[]>("job_scan_results", {
      query: qs({
        user_id: `eq.${userId}`,
        job_id: `eq.${jobId}`,
        status: "eq.active",
        select: "profile_id,job_id,first_seen_at,last_seen_at,scan_context",
        limit: "1",
      }),
    });
    if (resultRows.length === 0) return { status: "not_in_results" };
    job = mapJob(jobRow, resultRows[0], new Set());
  } else {
    // Unsave removes only the compatibility row. It remains possible after the
    // scan result expires or is dismissed because the canonical pursuit is history.
    job = mapPublicJobRecord(jobRow);
  }

  try {
    await request("rpc/set_canonical_job_saved", {
      method: "POST",
      body: {
        p_user_id: userId,
        p_profile_id: readiness.aggregate.profile.id,
        p_job_id: jobId,
        p_saved: saved,
        p_job_snapshot: snapshotPublicJob(job, updatedAt),
        p_now: updatedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const rpcMissing = message.includes("set_canonical_job_saved")
      && (message.includes("PGRST202") || message.includes("(404)"));
    if (!rpcMissing) throw error;

    // Main auto-deploys before production migrations are explicitly authorized.
    // Preserve the existing Save surface during that release window; once migration
    // 180003 installs the RPC, every write automatically uses the canonical path above.
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
  }

  return readPublicJobsForUser(request, userId, updatedAt);
}

export type SavePublicJobMatchFeedbackResult =
  | PublicJobMatchFeedbackResponse
  | PublicJobsReadiness
  | { status: "not_in_results" };

export async function savePublicJobMatchFeedbackForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  input: PublicJobMatchFeedbackInput,
  submittedAt: string,
): Promise<SavePublicJobMatchFeedbackResult> {
  const readiness = await ensureReadyProfile(request, userId, submittedAt);
  if (readiness.status !== "ready") return readiness;

  const resultRows = await request<JobScanResultRow[]>("job_scan_results", {
    query: qs({
      user_id: `eq.${userId}`,
      job_id: `eq.${input.jobId}`,
      status: "eq.active",
      select: "profile_id,job_id,first_seen_at,last_seen_at,scan_context",
      limit: "1",
    }),
  });
  if (resultRows.length === 0) return { status: "not_in_results" };

  const jobRow = (await jobsByIdForUser(request, userId, [input.jobId]))[0];
  if (!jobRow) return { status: "not_in_results" };

  const context = feedbackContextForJob(mapPublicJobRecord(jobRow), readiness.aggregate, submittedAt);
  await request("job_match_feedback", {
    method: "POST",
    query: "?on_conflict=user_id,job_id,matcher_version,match_context_hash",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      user_id: userId,
      profile_id: readiness.aggregate.profile.id,
      job_id: input.jobId,
      reason_codes: input.reasonCodes,
      note: input.note ?? null,
      match_score: context.match.score,
      match_label: context.match.label,
      match_signals: context.match.signals,
      matcher_version: context.match.matcherVersion,
      match_evaluated_at: context.match.evaluatedAt,
      profile_version: readiness.aggregate.profile.version,
      match_context_hash: context.matchContextHash,
      profile_context: context.profileContext,
      job_snapshot: context.jobSnapshot,
      match_details: context.matchDetails,
      updated_at: submittedAt,
    },
  });

  return {
    feedback: {
      jobId: input.jobId,
      reasonCodes: input.reasonCodes,
      ...(input.note ? { note: input.note } : {}),
      profileId: readiness.aggregate.profile.id,
      profileVersion: readiness.aggregate.profile.version,
      matchContextHash: context.matchContextHash,
      match: context.match,
      updatedAt: submittedAt,
    },
  };
}

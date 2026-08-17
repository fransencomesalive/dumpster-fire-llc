import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  createPublicProfileRepositoryRequest,
  getPublicProfileRepositoryConfig,
  loadCandidateProfileAggregate,
  type PublicProfileRepositoryRequest,
} from "../../lib/public-profile/repository";
import type { MatchJob } from "../../lib/public-profile/matching/types";
import {
  auditScanSelection,
  calculateScanChurn,
  DEFAULT_MAX_SCAN_CHURN_SHARE,
  replayScanSelection,
  scanChurnFailure,
} from "../scan-shadow-audit";

type ProfileIndexRow = {
  id: string;
  user_id: string;
};

type JobRow = {
  id: string;
  source_url: string;
  owner_user_id: string | null;
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
  responsibilities: string[] | null;
  required_experience: string[] | null;
  link_status: "unknown" | "healthy" | "gone" | "uncertain" | null;
};

type ScanResultRow = {
  job_id: string;
  status: string;
};

const PAGE_SIZE = 1000;
const MAX_SCAN_POOL_ROWS = 10000;

function readonlyRequest(base: PublicProfileRepositoryRequest): PublicProfileRepositoryRequest {
  return (table, options) => {
    const method = options.method ?? "GET";
    assert.equal(method, "GET", `Production shadow replay refused non-GET ${method} on ${table}.`);
    assert.equal(options.body, undefined, `Production shadow replay refused a request body on ${table}.`);
    return base(table, { ...options, method: "GET", body: undefined });
  };
}

function matchJob(row: JobRow): MatchJob & { id: string } {
  return {
    id: row.id,
    title: row.title,
    companyName: row.company_name,
    description: row.description,
    responsibilities: row.responsibilities ?? [],
    requiredExperience: row.required_experience ?? [],
    location: row.location ?? undefined,
    remoteType: row.remote_type ?? undefined,
    employmentType: row.employment_type ?? undefined,
    compensationText: row.compensation_text ?? undefined,
    department: row.department ?? undefined,
    postedAt: row.posted_at ?? undefined,
    scrapedAt: row.scraped_at,
    sourceUrl: row.source_url,
  };
}

async function loadJobRows(
  request: PublicProfileRepositoryRequest,
  ownerFilter: string,
  maximumRows?: number,
) {
  const rows: JobRow[] = [];
  for (let offset = 0; maximumRows === undefined || rows.length < maximumRows; offset += PAGE_SIZE) {
    const limit = maximumRows === undefined
      ? PAGE_SIZE
      : Math.min(PAGE_SIZE, maximumRows - rows.length);
    const query = new URLSearchParams({
      select: "id,source_url,owner_user_id,company_name,title,location,remote_type,employment_type,compensation_text,department,description,posted_at,scraped_at,responsibilities,required_experience,link_status",
      owner_user_id: ownerFilter,
      order: "scraped_at.desc,id.asc",
      limit: String(limit),
      offset: String(offset),
    });
    const page = await request<JobRow[]>("jobs", { query: `?${query}` });
    rows.push(...page);
    if (page.length < limit) break;
  }
  return rows;
}

function compareJobRows(first: JobRow, second: JobRow) {
  const scraped = second.scraped_at.localeCompare(first.scraped_at);
  return scraped || first.id.localeCompare(second.id);
}

function pseudonymFor(userId: string, secret: string) {
  return `account-${createHmac("sha256", secret).update(userId).digest("hex").slice(0, 12)}`;
}

function configuredMaximumChurnShare() {
  const configured = process.env.SCAN_SHADOW_MAX_CHURN_SHARE;
  if (configured === undefined || configured.trim() === "") return DEFAULT_MAX_SCAN_CHURN_SHARE;
  const parsed = Number(configured);
  assert.ok(
    Number.isFinite(parsed) && parsed >= 0 && parsed <= 1,
    "SCAN_SHADOW_MAX_CHURN_SHARE must be a number from 0 through 1.",
  );
  return parsed;
}

async function main() {
  assert.equal(
    process.env.CONFIRM_PRODUCTION_SCAN_SHADOW_READ,
    "1",
    "Set CONFIRM_PRODUCTION_SCAN_SHADOW_READ=1 for the read-only production scan shadow replay.",
  );
  const config = getPublicProfileRepositoryConfig();
  assert.ok(config, "Production Supabase configuration is required.");
  const request = readonlyRequest(createPublicProfileRepositoryRequest(config));
  const evaluatedAt = new Date().toISOString();
  const maximumChurnShare = configuredMaximumChurnShare();

  const profiles = await request<ProfileIndexRow[]>("candidate_profiles", {
    query: "?status=eq.complete&select=id,user_id&order=id.asc",
  });
  const [sharedJobs, privateJobs] = await Promise.all([
    loadJobRows(request, "is.null", MAX_SCAN_POOL_ROWS),
    loadJobRows(request, "not.is.null"),
  ]);

  const reports = [];
  let failedAccounts = 0;
  for (const profileRow of profiles) {
    const aggregate = await loadCandidateProfileAggregate(request, profileRow.user_id);
    assert.ok(aggregate, "A complete indexed profile could not be loaded.");
    const [scanRows] = await Promise.all([
      request<ScanResultRow[]>("job_scan_results", {
        query: `?user_id=eq.${profileRow.user_id}&status=in.(active,dismissed)&select=job_id,status`,
      }),
    ]);
    const dismissedIds = new Set(scanRows.filter((row) => row.status === "dismissed").map((row) => row.job_id));
    const baselineIds = scanRows.filter((row) => row.status === "active").map((row) => row.job_id);
    const rows = [
      ...sharedJobs,
      ...privateJobs.filter((job) => job.owner_user_id === profileRow.user_id),
    ]
      .sort(compareJobRows)
      .slice(0, MAX_SCAN_POOL_ROWS)
      .filter((job) => job.link_status !== "gone" && !dismissedIds.has(job.id));

    const { candidates, selected } = replayScanSelection(
      aggregate,
      rows.map(matchJob),
      evaluatedAt,
      75,
    );
    const audit = auditScanSelection(aggregate, candidates, selected);
    const churn = baselineIds.length > 0
      ? calculateScanChurn(baselineIds, selected.map((item) => item.job.id))
      : undefined;
    const churnFailure = churn ? scanChurnFailure(churn, maximumChurnShare) : undefined;
    const failures = [...audit.failures, ...(churnFailure ? [churnFailure] : [])];
    if (failures.length > 0) failedAccounts += 1;
    reports.push({
      account: pseudonymFor(profileRow.user_id, config.serviceRoleKey),
      audit,
      ...(churn ? { churn } : {}),
      failures,
    });
  }

  process.stdout.write(`${JSON.stringify({
    mode: "read-only",
    evaluatedAt,
    completeProfileCount: profiles.length,
    sharedPoolCount: sharedJobs.length,
    privatePoolCount: privateJobs.length,
    maximumChurnShare,
    failedAccounts,
    accounts: reports,
  }, null, 2)}\n`);

  if (failedAccounts > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

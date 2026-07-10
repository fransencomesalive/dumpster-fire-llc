import assert from "node:assert/strict";
import {
  readPublicJobsForUser,
  runPublicJobsScanForUser,
  setPublicJobSavedForUser,
} from "../lib/public-jobs/repository";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";

const now = "2026-06-26T18:00:00.000Z";
const userId = "user-1";
const profileId = "profile-1";

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

type ScanResultRow = {
  user_id: string;
  profile_id: string;
  job_id: string;
  status: "active" | "actioned" | "expired";
  scan_context: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

type SavedJobRow = {
  user_id: string;
  profile_id: string;
  job_id: string;
  created_at: string;
  updated_at: string;
};

const jobs: JobRow[] = [
  {
    id: "job-1",
    source: "greenhouse",
    source_url: "https://jobs.example/product-director",
    company_name: "Useful Studio",
    title: "Program Director",
    location: "Remote",
    remote_type: "remote",
    employment_type: "full_time",
    compensation_text: "$150k-$180k",
    description: "Lead AI workflow programs and stakeholder alignment.",
    posted_at: "2026-06-20T00:00:00.000Z",
    scraped_at: "2026-06-25T00:00:00.000Z",
    created_at: now,
    updated_at: now,
  },
  {
    id: "job-2",
    source: "lever",
    source_url: "https://jobs.example/legal-counsel",
    company_name: "Wrong Lane LLC",
    title: "Legal Counsel",
    location: "New York, NY",
    remote_type: "onsite",
    employment_type: "full_time",
    compensation_text: null,
    description: "Draft contracts and advise legal team.",
    posted_at: "2026-06-20T00:00:00.000Z",
    scraped_at: "2026-06-24T00:00:00.000Z",
    created_at: now,
    updated_at: now,
  },
];

const scanResults: ScanResultRow[] = [];
const savedJobs: SavedJobRow[] = [];

const request: PublicProfileRepositoryRequest = async <T>(
  table: string,
  options: Parameters<PublicProfileRepositoryRequest>[1],
) => {
  const query = decodeURIComponent(options.query ?? "");

  if (table === "candidate_profiles") {
    return [{
      id: profileId,
      user_id: userId,
      status: "complete",
      version: 1,
      full_name: "Avery Candidate",
      preferred_name: null,
      location: "Denver, CO",
      work_authorization: "US authorized",
      email: "avery@example.com",
      remote_preference: "remote_preferred",
      target_compensation_min: null,
      target_compensation_preferred: null,
      target_compensation_hourly_min: null,
      target_compensation_hourly_preferred: null,
      availability: "Two weeks",
      generated_markdown: "",
      markdown_generated_at: null,
      created_at: now,
      updated_at: now,
    }] as T;
  }

  if (table === "candidate_profile_preferences") {
    return [{
      id: "preferences-1",
      profile_id: profileId,
      employment_types: ["full_time"],
      target_industries: ["AI"],
      avoid_industries: [],
      avoid_companies: ["Wrong Lane LLC"],
      created_at: now,
      updated_at: now,
    }] as T;
  }

  if (table === "role_tracks") {
    return [{
      id: "track-1",
      profile_id: profileId,
      name: "Program Director",
      description: "Leads ambiguous delivery.",
      core_positioning: "Turns messy work into shipped systems.",
      outreach_angle: "Workflow alignment.",
      global_proof_rules: null,
      target_titles: ["Program Director"],
      key_responsibilities: ["Stakeholder alignment"],
      required_experience_patterns: ["Cross-functional programs"],
      strong_job_signals: ["AI workflow"],
      weak_job_signals: [],
      mismatch_signals: ["Legal counsel"],
      created_at: now,
      updated_at: now,
    }] as T;
  }

  if (table === "profile_quality") {
    return [{
      id: "quality-1",
      profile_id: profileId,
      status: "complete",
      incomplete_reasons: [],
      weak_fields: [],
      complete_fields: ["identity.fullName"],
      weak_response_count: 0,
      last_checked_at: now,
      created_at: now,
      updated_at: now,
    }] as T;
  }

  if ([
    "company_watchlist_items",
    "resumes",
    "fit_signals",
    "work_examples",
    "skill_profiles",
    "quality_scored_text_fields",
    "voice_personality",
    "writing_samples",
    "outreach_rule_sets",
    "leadership_profiles",
    "resume_role_tracks",
    "skill_work_examples",
    "role_track_outreach_rules",
  ].includes(table)) {
    return [] as T;
  }

  if (table === "jobs") {
    if (query.includes("id=in.")) {
      const ids = query.match(/id=in\.\(([^)]+)\)/)?.[1].split(",") ?? [];
      return jobs.filter((job) => ids.includes(job.id)) as T;
    }
    return jobs as T;
  }

  if (table === "job_scan_results") {
    if (options.method === "POST") {
      const rows = Array.isArray(options.body) ? options.body : [options.body];
      for (const row of rows as Array<Partial<ScanResultRow> & { job_id: string }>) {
        const existing = scanResults.find((result) => result.user_id === row.user_id && result.job_id === row.job_id);
        if (existing) {
          existing.profile_id = row.profile_id ?? existing.profile_id;
          existing.status = row.status ?? existing.status;
          existing.scan_context = row.scan_context ?? existing.scan_context;
          existing.last_seen_at = row.last_seen_at ?? existing.last_seen_at;
          existing.updated_at = row.updated_at ?? existing.updated_at;
        } else {
          scanResults.push({
            user_id: row.user_id ?? userId,
            profile_id: row.profile_id ?? profileId,
            job_id: row.job_id,
            status: row.status ?? "active",
            scan_context: row.scan_context ?? {},
            first_seen_at: row.first_seen_at ?? row.last_seen_at ?? now,
            last_seen_at: row.last_seen_at ?? now,
            created_at: row.created_at ?? now,
            updated_at: row.updated_at ?? now,
          });
        }
      }
      return {} as T;
    }

    let rows = scanResults.filter((result) => result.user_id === userId && result.status === "active");
    const jobId = query.match(/job_id=eq\.([^&]+)/)?.[1];
    if (jobId) rows = rows.filter((result) => result.job_id === jobId);
    return rows as T;
  }

  if (table === "saved_jobs") {
    if (options.method === "POST") {
      const row = options.body as Partial<SavedJobRow> & { job_id: string };
      const existing = savedJobs.find((saved) => saved.user_id === row.user_id && saved.job_id === row.job_id);
      if (existing) {
        existing.profile_id = row.profile_id ?? existing.profile_id;
        existing.updated_at = row.updated_at ?? existing.updated_at;
      } else {
        savedJobs.push({
          user_id: row.user_id ?? userId,
          profile_id: row.profile_id ?? profileId,
          job_id: row.job_id,
          created_at: row.created_at ?? now,
          updated_at: row.updated_at ?? now,
        });
      }
      return {} as T;
    }

    if (options.method === "DELETE") {
      const jobId = query.match(/job_id=eq\.([^&]+)/)?.[1];
      const index = savedJobs.findIndex((saved) => saved.user_id === userId && saved.job_id === jobId);
      if (index >= 0) savedJobs.splice(index, 1);
      return {} as T;
    }

    return savedJobs.filter((saved) => saved.user_id === userId) as T;
  }

  throw new Error(`Unhandled table in public jobs test: ${table}`);
};

async function main() {
  const emptyRead = await readPublicJobsForUser(request, userId, now);
  assert.equal("status" in emptyRead, false);
  if ("status" in emptyRead) throw new Error("Expected jobs response");
  assert.equal(emptyRead.jobs.length, 0);

  const scan = await runPublicJobsScanForUser(request, userId, now);
  assert.equal("status" in scan, false);
  if ("status" in scan) throw new Error("Expected scan response");
  assert.equal(scan.scan.matchedJobs, 1);
  assert.equal(scan.jobs.length, 1);
  assert.equal(scan.jobs[0].id, "job-1");
  assert.equal(scan.jobs[0].saved, false);
  // Scan results are annotated with a profile-driven match score + label for ranking.
  assert.equal(typeof scan.jobs[0].match?.score, "number");
  assert.equal(typeof scan.jobs[0].match?.label, "string");

  const saved = await setPublicJobSavedForUser(request, userId, "job-1", true, now);
  assert.equal("status" in saved, false);
  if ("status" in saved) throw new Error("Expected save response");
  assert.equal(saved.summary.savedJobs, 1);
  assert.equal(saved.jobs[0].saved, true);

  const unsaved = await setPublicJobSavedForUser(request, userId, "job-1", false, now);
  assert.equal("status" in unsaved, false);
  if ("status" in unsaved) throw new Error("Expected unsave response");
  assert.equal(unsaved.summary.savedJobs, 0);
  assert.equal(unsaved.jobs[0].saved, false);

  const missing = await setPublicJobSavedForUser(request, userId, "job-missing", true, now);
  assert.deepEqual(missing, { status: "not_in_results" });

  console.log("public jobs repository: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

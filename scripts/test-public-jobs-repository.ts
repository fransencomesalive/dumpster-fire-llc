import assert from "node:assert/strict";
import {
  addPublicJobBoardForUser,
  logUnrecognizedBoardSubmissionBestEffort,
  readPublicJobsForUser,
  removePublicJobBoardForUser,
  runPublicJobsScanForUser,
  setPublicJobDismissedForUser,
  setPublicJobSavedForUser,
} from "../lib/public-jobs/repository";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";
import type { NormalizedConnectorJob } from "../lib/scan/sources/types";
import { parseHtmlJobs } from "../lib/scan/sources/connectors";
import { assertSafePublicUrl, isPublicIpAddress } from "../lib/scan/sources/url-safety";
import { fetchNormalizedConnectorJobs } from "../lib/scan/sources/runner";

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
  status: "active" | "actioned" | "expired" | "dismissed";
  scan_context: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

type JobSourceRow = {
  id: string;
  company_name: string;
  website_url: string | null;
  careers_url: string | null;
  ats_provider: string;
  ats_board_token: string | null;
  status: string;
  workday_variants: string[];
  owner_user_id: string | null;
  last_scanned_at: string | null;
  last_error: string | null;
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
const jobSources: JobSourceRow[] = [];
const unrecognizedBoardSubmissions: Array<{ user_id: string; url: string; reason: string }> = [];
let failSubmissionLogging = false;

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
    if (options.method === "POST") {
      // Upsert on (source, source_url); honor return=representation like PostgREST.
      const rows = Array.isArray(options.body) ? options.body : [options.body];
      const returned: JobRow[] = [];
      for (const row of rows as Array<Record<string, unknown>>) {
        const source = row.source as string;
        const sourceUrl = row.source_url as string;
        let existing = jobs.find((job) => job.source === source && job.source_url === sourceUrl);
        if (existing) {
          existing.title = (row.title as string) ?? existing.title;
          existing.description = (row.description as string) ?? existing.description;
          existing.updated_at = (row.updated_at as string) ?? existing.updated_at;
          existing.scraped_at = (row.scraped_at as string) ?? existing.scraped_at;
        } else {
          existing = {
            id: `job-${jobs.length + 1}`,
            source,
            source_url: sourceUrl,
            company_name: (row.company_name as string) ?? "",
            title: (row.title as string) ?? "",
            location: (row.location as string | null) ?? null,
            remote_type: (row.remote_type as string | null) ?? null,
            employment_type: (row.employment_type as string | null) ?? null,
            compensation_text: (row.compensation_text as string | null) ?? null,
            description: (row.description as string) ?? "",
            posted_at: (row.posted_at as string | null) ?? null,
            scraped_at: (row.scraped_at as string) ?? now,
            created_at: now,
            updated_at: (row.updated_at as string) ?? now,
          };
          jobs.push(existing);
        }
        returned.push(existing);
      }
      const prefer = (options.headers as Record<string, string> | undefined)?.Prefer ?? "";
      return (prefer.includes("return=representation") ? returned : {}) as T;
    }
    if (query.includes("id=in.")) {
      const ids = query.match(/id=in\.\(([^)]+)\)/)?.[1].split(",") ?? [];
      return jobs.filter((job) => ids.includes(job.id)) as T;
    }
    return jobs as T;
  }

  if (table === "job_sources") {
    if (options.method === "POST") {
      const row = options.body as Record<string, unknown>;
      const inserted: JobSourceRow = {
        id: `source-${jobSources.length + 1}`,
        company_name: (row.company_name as string) ?? "",
        website_url: (row.website_url as string | null) ?? null,
        careers_url: (row.careers_url as string | null) ?? null,
        ats_provider: (row.ats_provider as string) ?? "html",
        ats_board_token: (row.ats_board_token as string | null) ?? null,
        status: (row.status as string) ?? "active",
        workday_variants: [],
        owner_user_id: (row.owner_user_id as string | null) ?? null,
        last_scanned_at: null,
        last_error: null,
        created_at: now,
        updated_at: (row.updated_at as string) ?? now,
      };
      jobSources.push(inserted);
      return [inserted] as T;
    }
    if (options.method === "PATCH") {
      const id = query.match(/(?:^|[?&])id=eq\.([^&]+)/)?.[1];
      const body = options.body as Partial<JobSourceRow>;
      for (const row of jobSources) {
        if (row.id !== id) continue;
        if (body.last_scanned_at !== undefined) row.last_scanned_at = body.last_scanned_at;
        if (body.last_error !== undefined) row.last_error = body.last_error;
        if (body.updated_at !== undefined) row.updated_at = body.updated_at;
      }
      return {} as T;
    }
    if (options.method === "DELETE") {
      const id = query.match(/(?:^|[?&])id=eq\.([^&]+)/)?.[1];
      const owner = query.match(/owner_user_id=eq\.([^&]+)/)?.[1];
      const index = jobSources.findIndex((row) => row.id === id && row.owner_user_id === owner);
      if (index >= 0) jobSources.splice(index, 1);
      return {} as T;
    }
    let rows = jobSources;
    const owner = query.match(/owner_user_id=eq\.([^&]+)/)?.[1];
    if (owner) rows = rows.filter((row) => row.owner_user_id === owner);
    const status = query.match(/status=eq\.([^&]+)/)?.[1];
    if (status) rows = rows.filter((row) => row.status === status);
    const provider = query.match(/ats_provider=eq\.([^&]+)/)?.[1];
    if (provider) rows = rows.filter((row) => row.ats_provider === provider);
    const token = query.match(/ats_board_token=eq\.([^&]+)/)?.[1];
    if (token) rows = rows.filter((row) => row.ats_board_token === token);
    const careersUrl = query.match(/careers_url=eq\.([^&]+)/)?.[1];
    if (careersUrl) rows = rows.filter((row) => row.careers_url === careersUrl);
    return rows as T;
  }

  if (table === "unrecognized_board_submissions" && options.method === "POST") {
    if (failSubmissionLogging) throw new Error("submission logging unavailable");
    unrecognizedBoardSubmissions.push(options.body as { user_id: string; url: string; reason: string });
    return {} as T;
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

    if (options.method === "PATCH") {
      const jobId = query.match(/job_id=eq\.([^&]+)/)?.[1];
      const body = options.body as Partial<ScanResultRow>;
      for (const row of scanResults) {
        if (row.user_id !== userId) continue;
        if (jobId && row.job_id !== jobId) continue;
        if (body.status) row.status = body.status;
        if (body.updated_at) row.updated_at = body.updated_at;
      }
      return {} as T;
    }

    let rows = scanResults.filter((result) => result.user_id === userId);
    const statusFilter = query.match(/status=eq\.([^&]+)/)?.[1];
    if (statusFilter) rows = rows.filter((result) => result.status === statusFilter);
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
  assert.equal(isPublicIpAddress("8.8.8.8"), true);
  assert.equal(isPublicIpAddress("127.0.0.1"), false);
  assert.equal(isPublicIpAddress("169.254.169.254"), false);
  assert.equal(isPublicIpAddress("::1"), false);
  assert.equal(isPublicIpAddress("fc00::1"), false);
  assert.equal(isPublicIpAddress("2606:4700:4700::1111"), true);
  await assert.doesNotReject(assertSafePublicUrl("https://careers.example.test/jobs/1", async () => [
    { address: "203.0.114.10", family: 4 },
  ]));
  await assert.rejects(assertSafePublicUrl("https://careers.example.test/jobs/1", async () => [
    { address: "10.0.0.5", family: 4 },
  ]), /non-public network/);
  await assert.rejects(assertSafePublicUrl("https://careers.example.test/jobs/1", async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "192.168.1.5", family: 4 },
  ]), /non-public network/);

  let redirectFetchCount = 0;
  await assert.rejects(fetchNormalizedConnectorJobs({
    id: "redirect-fixture",
    companyName: "Redirect Fixture",
    websiteUrl: "https://public.example.test",
    careersUrl: "https://public.example.test/careers",
    atsProvider: "html",
    atsBoardToken: "redirect-fixture",
  }, {
    resolveHostname: async (hostname) => [{
      address: hostname === "internal.example.test" ? "10.0.0.5" : "203.0.114.10",
      family: 4,
    }],
    fetchImpl: async () => {
      redirectFetchCount += 1;
      return new Response(null, { status: 302, headers: { Location: "http://internal.example.test/jobs" } });
    },
  }), /non-public network/);
  assert.equal(redirectFetchCount, 1);

  // Real careers pages often wrap the title and location in nested elements. The generic HTML
  // path must keep common technical/marketing titles while the add-flow plausibility gate rejects
  // ordinary navigation links that happen to contain title-like words.
  const careersFixtureJobs = parseHtmlJobs(`
    <a href="https://jobs.example.test/jobs/1001"><div><p>Data Scientist &ndash; Platform</p><p>Denver, CO</p></div></a>
    <a href="https://jobs.example.test/jobs/1002"><div><p>iOS Engineer</p><p>Remote</p></div></a>
    <a href="/#content">Skip to content</a>
  `, {
    id: "fixture-company",
    companyName: "Fixture Company",
    websiteUrl: "https://example.test",
    careersUrl: "https://example.test/careers/",
    atsProvider: "html",
    atsBoardToken: "fixture-company",
  });
  assert.equal(careersFixtureJobs.length, 2);
  assert.equal((careersFixtureJobs[0] as { title: string }).title.includes("Data Scientist – Platform"), true);
  assert.equal((careersFixtureJobs[0] as { title: string }).title.includes("&ndash;"), false);
  assert.equal((careersFixtureJobs[1] as { title: string }).title.includes("iOS Engineer"), true);

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

  // titleParameters = track names + target titles (deduped — the track name matches its
  // single target title here), no industries.
  assert.deepEqual(scan.summary.titleParameters, ["Program Director"]);
  assert.deepEqual(scan.scan.userBoards, { scanned: 0, errors: 0 });

  // Skip: the job drops out of results…
  const skipped = await setPublicJobDismissedForUser(request, userId, "job-1", now);
  assert.equal("status" in skipped, false);
  if ("status" in skipped) throw new Error("Expected skip response");
  assert.equal(skipped.jobs.length, 0);

  // …and a re-scan must NOT resurrect it (the results upsert would flip status back to
  // active if dismissed ids weren't excluded from the candidate set).
  const rescan = await runPublicJobsScanForUser(request, userId, now);
  assert.equal("status" in rescan, false);
  if ("status" in rescan) throw new Error("Expected rescan response");
  assert.equal(rescan.jobs.some((job) => job.id === "job-1"), false);
  assert.equal(scanResults.find((row) => row.job_id === "job-1")?.status, "dismissed");

  const missingSkip = await setPublicJobDismissedForUser(request, userId, "job-missing", now);
  assert.deepEqual(missingSkip, { status: "not_in_results" });

  // Company boards: add resolves the URL, verifies the board live, and ingests postings.
  const boardPosting: NormalizedConnectorJob = {
    companyId: "watched-co",
    externalJobId: "wc-1",
    sourceProvider: "ashby",
    sourceUrl: "https://jobs.ashbyhq.com/watched-co/wc-1",
    applyUrl: "https://jobs.ashbyhq.com/watched-co/wc-1/apply",
    title: "Senior Program Director",
    companyName: "Watched Co",
    location: "Remote",
    remoteType: "remote",
    employmentType: "full-time",
    department: "Programs",
    salaryText: "",
    descriptionText: "Run cross-functional programs with stakeholder alignment.",
    rawPayload: {},
  };
  const fetchBoard = async () => [boardPosting];

  const added = await addPublicJobBoardForUser(request, userId, "https://jobs.ashbyhq.com/watched-co", now, { fetchSource: fetchBoard });
  assert.equal("status" in added, false);
  if ("status" in added) throw new Error("Expected boards response");
  assert.equal(added.boards.length, 1);
  assert.equal(added.boards[0].companyName, "Watched Co");
  assert.equal(added.boards[0].provider, "ashby");
  assert.ok(jobSources[0].last_scanned_at);

  // Duplicate add is idempotent (no second row, no 409).
  const duplicate = await addPublicJobBoardForUser(request, userId, "https://jobs.ashbyhq.com/watched-co", now, { fetchSource: fetchBoard });
  assert.equal("status" in duplicate, false);
  if ("status" in duplicate) throw new Error("Expected boards response");
  assert.equal(duplicate.boards.length, 1);
  assert.equal(jobSources.length, 1);

  // A URL that isn't a supported board is rejected before any insert.
  const unrecognized = await addPublicJobBoardForUser(request, userId, "https://example.com/blog", now, { fetchSource: fetchBoard });
  assert.deepEqual(unrecognized, { status: "unrecognized_board" });

  // A board that resolves but can't be fetched is rejected without inserting.
  const unfetchable = await addPublicJobBoardForUser(request, userId, "https://jobs.lever.co/ghost-co", now, {
    fetchSource: async () => { throw new Error("404 from board"); },
  });
  assert.equal("status" in unfetchable && unfetchable.status === "board_fetch_failed", true);
  assert.equal(jobSources.length, 1);

  // Scan fetches the user's board live; its matching posting lands in results.
  const boardScan = await runPublicJobsScanForUser(request, userId, now, { fetchSource: fetchBoard });
  assert.equal("status" in boardScan, false);
  if ("status" in boardScan) throw new Error("Expected board scan response");
  assert.deepEqual(boardScan.scan.userBoards, { scanned: 1, errors: 0 });
  assert.equal(boardScan.jobs.some((job) => job.companyName === "Watched Co"), true);
  assert.equal(boardScan.jobs.some((job) => job.id === "job-1"), false);

  // A failing board fetch is isolated: the scan still succeeds and the error is recorded.
  const failingScan = await runPublicJobsScanForUser(request, userId, now, {
    fetchSource: async () => { throw new Error("board down"); },
  });
  assert.equal("status" in failingScan, false);
  if ("status" in failingScan) throw new Error("Expected failing-board scan response");
  assert.deepEqual(failingScan.scan.userBoards, { scanned: 0, errors: 1 });
  assert.equal(jobSources[0].last_error, "board down");
  assert.equal(failingScan.jobs.some((job) => job.companyName === "Watched Co"), true);

  // Remove the board; the shared jobs pool keeps its postings.
  const removed = await removePublicJobBoardForUser(request, userId, jobSources[0].id);
  assert.equal(removed.boards.length, 0);
  assert.equal(jobSources.length, 0);

  // A generic company careers page uses the existing HTML connector, then inserts only
  // after the live parse returns at least one posting.
  const genericAdded = await addPublicJobBoardForUser(
    request,
    userId,
    "https://www.trainingpeaks.com/careers/#openings",
    now,
    { fetchSource: async (source) => [{
      ...boardPosting,
      companyId: source.id,
      sourceProvider: "html",
      companyName: source.companyName,
      sourceUrl: "https://peaksware.workable.com/jobs/5566576",
      applyUrl: "https://peaksware.workable.com/jobs/5566576",
    }] },
  );
  assert.equal("status" in genericAdded, false);
  assert.equal(jobSources[0].ats_provider, "html");
  assert.equal(jobSources[0].careers_url, "https://www.trainingpeaks.com/careers/");

  await removePublicJobBoardForUser(request, userId, jobSources[0].id);
  const genericEmpty = await addPublicJobBoardForUser(request, userId, "https://careers.acme.test/open-roles", now, {
    fetchSource: async () => [],
  });
  assert.deepEqual(genericEmpty, { status: "unrecognized_board" });
  assert.equal(jobSources.length, 0);

  const genericFalsePositive = await addPublicJobBoardForUser(request, userId, "https://acme.test/careers", now, {
    fetchSource: async () => [{
      ...boardPosting,
      sourceProvider: "html",
      title: "Skip to content",
      sourceUrl: "https://acme.test/#content",
      applyUrl: "https://acme.test/#content",
    }],
  });
  assert.deepEqual(genericFalsePositive, { status: "unrecognized_board" });
  assert.equal(jobSources.length, 0);

  const genericLandingFalsePositive = await addPublicJobBoardForUser(request, userId, "https://acme.test/careers", now, {
    fetchSource: async () => [{
      ...boardPosting,
      sourceProvider: "html",
      title: "Product Manager",
      sourceUrl: "https://acme.test/careers/",
      applyUrl: "https://acme.test/careers/",
    }],
  });
  assert.deepEqual(genericLandingFalsePositive, { status: "unrecognized_board" });
  assert.equal(jobSources.length, 0);

  // Failure logging retains the raw pasted URL. Telemetry failure is swallowed so the API can
  // preserve its existing add-board response.
  const rawUnreadableUrl = " https://careers.acme.test/about#jobs ";
  await logUnrecognizedBoardSubmissionBestEffort(request, userId, rawUnreadableUrl, "unrecognized_board");
  assert.deepEqual(unrecognizedBoardSubmissions.at(-1), {
    user_id: userId,
    url: rawUnreadableUrl,
    reason: "unrecognized_board",
  });

  failSubmissionLogging = true;
  await assert.doesNotReject(
    logUnrecognizedBoardSubmissionBestEffort(request, userId, rawUnreadableUrl, "board_fetch_failed"),
  );

  console.log("public jobs repository: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import assert from "node:assert/strict";
import { handlePublicProfilePursuedJobsExportRequest } from "../lib/public-profile/api";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";
import type { CandidateProfileAggregate, RoleTrack } from "../lib/public-profile/types";
import type {
  HumanPathContactSuggestion,
  OutreachMessageRecord,
  Pursuit,
} from "../lib/public-profile/pursuits/types";
import type { PublicJobRecord } from "../lib/public-jobs/types";
import type { SubscriptionContext } from "../lib/public-profile/subscription/types";

const now = "2026-07-05T16:00:00.000Z";

type ExportRow = {
  pursuitId: string;
  status: string;
  job: { id: string; title: string; companyName: string; location: string | null; sourceUrl: string | null } | null;
  applyingAs: { roleTrackId: string | null; roleTrackName: string | null; narrative: string | null };
  outreach: Array<{
    contactName: string | null;
    contactTitle: string | null;
    contactType: string | null;
    status: string;
    sentAt: string;
  }>;
};

const repositoryRequest: PublicProfileRepositoryRequest = async () => {
  throw new Error("repository should not be called by mocked handlers");
};

function authed() {
  return { status: "authenticated" as const, userId: "user-1" };
}

function subscription(planName: SubscriptionContext["planName"]): SubscriptionContext {
  return {
    planName,
    status: "active",
    currentPeriodStart: "2026-07-01T00:00:00.000Z",
    currentPeriodEnd: "2026-08-01T00:00:00.000Z",
  };
}

function roleTrack(overrides: Partial<RoleTrack> = {}): RoleTrack {
  return {
    id: "track-1",
    profileId: "profile-1",
    name: "Program Leadership",
    description: "Cross-functional delivery leadership.",
    corePositioning: "Lead cross-functional delivery with measurable outcomes.",
    outreachAngle: "Workflow alignment.",
    targetTitles: [],
    keyResponsibilities: [],
    requiredExperiencePatterns: [],
    strongJobSignals: [],
    weakJobSignals: [],
    mismatchSignals: [],
    resumeIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function aggregate(): CandidateProfileAggregate {
  return {
    profile: {
      id: "profile-1",
      userId: "user-1",
      status: "complete",
      version: 3,
      fullName: "Avery Candidate",
      location: "Denver, CO",
      remotePreference: "remote_preferred",
      generatedMarkdown: "",
      createdAt: now,
      updatedAt: now,
    },
    companyWatchlist: [],
    roleTracks: [roleTrack()],
    resumes: [],
    workExamples: [],
    skills: [],
    qualityFields: [],
    writingSamples: [],
    roleTrackOutreachRules: [],
  };
}

function pursuit(overrides: Partial<Pursuit> = {}): Pursuit {
  return {
    id: "pursuit-1",
    userId: "user-1",
    profileId: "profile-1",
    jobId: "job-1",
    selectedRoleTrackId: "track-1",
    status: "outreach_sent",
    risks: [],
    recommendedWorkExampleIds: [],
    outreachAngle: "Stakeholder alignment.",
    lastActivityAt: now,
    createdAt: "2026-07-02T09:00:00.000Z",
    updatedAt: now,
    ...overrides,
  };
}

function publicJob(overrides: Partial<PublicJobRecord> = {}): PublicJobRecord {
  return {
    id: "job-1",
    source: "fixture",
    sourceUrl: "https://jobs.example/1",
    companyName: "Useful Studio",
    title: "Program Director",
    location: "Remote",
    description: "Lead stakeholder alignment.",
    scrapedAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    saved: false,
    responsibilities: [],
    requiredExperience: [],
    ...overrides,
  };
}

function contact(overrides: Partial<HumanPathContactSuggestion> = {}): HumanPathContactSuggestion {
  return {
    id: "contact-1",
    name: "Dana Lee",
    title: "VP Product",
    companyName: "Useful Studio",
    contactType: "likely_hiring_manager",
    confidence: "high",
    relevanceReason: "Owns the program area.",
    roleConnection: "Likely sponsor.",
    verificationNotes: [],
    selectedForOutreach: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function outreachMessage(overrides: Partial<OutreachMessageRecord> = {}): OutreachMessageRecord {
  return {
    id: "message-1",
    pursuitId: "pursuit-1",
    contactSuggestionId: "contact-1",
    recipientType: "likely_hiring_manager",
    channel: "email",
    message: "Hi Dana, I lead cross-functional delivery, and \"here's proof\".",
    status: "sent",
    createdAt: now,
    updatedAt: "2026-07-04T18:30:00.000Z",
    ...overrides,
  };
}

function getRequest(query = "") {
  return new Request(`https://app.example/api/public-profile/pursuits/export${query}`, { method: "GET" });
}

async function json(response: Response) {
  return await response.json() as Record<string, unknown>;
}

function baseOptions(planName: SubscriptionContext["planName"], recordSpy: { calls: number }) {
  return {
    getSession: async () => authed(),
    repositoryRequest,
    now: () => now,
    loadAggregate: async () => aggregate(),
    loadSubscriptionContext: async () => subscription(planName),
    loadUsageEntries: async () => [],
    loadPursuits: async () => [pursuit()],
    loadJobs: async () => new Map([["job-1", publicJob()]]),
    loadOutreachMessages: async () => [
      outreachMessage(),
      outreachMessage({ id: "message-2", status: "draft", message: "unsent draft" }),
    ],
    loadContactSuggestions: async () => [contact()],
    recordExportUsage: async () => {
      recordSpy.calls += 1;
    },
  };
}

async function main() {
// --- Unauthorized -----------------------------------------------------------
{
  const response = await handlePublicProfilePursuedJobsExportRequest(getRequest(), {
    getSession: async () => ({ status: "unauthenticated", reason: "Missing bearer token." }),
    repositoryRequest,
  });
  assert.equal(response.status, 401);
}

// --- Locked for a plan without export (basic) -------------------------------
{
  const recordSpy = { calls: 0 };
  const response = await handlePublicProfilePursuedJobsExportRequest(getRequest(), baseOptions("basic", recordSpy));
  assert.equal(response.status, 402);
  const payload = await json(response);
  assert.equal(payload.status, "locked");
  const subscriptionResult = payload.subscription as Record<string, unknown>;
  assert.equal(subscriptionResult.feature, "pursued_jobs_export");
  assert.equal(subscriptionResult.requiredPlan, "premium");
  assert.equal(recordSpy.calls, 0, "usage must not be recorded when the export is locked");
}

// --- Allowed for a plan with export (premium), JSON -------------------------
{
  const recordSpy = { calls: 0 };
  const response = await handlePublicProfilePursuedJobsExportRequest(getRequest(), baseOptions("premium", recordSpy));
  assert.equal(response.status, 200);
  const payload = await json(response);
  assert.equal(payload.status, "ok");
  assert.equal(payload.exportedAt, now);
  assert.equal(payload.total, 1);

  const rows = payload.pursuedJobs as ExportRow[];
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.pursuitId, "pursuit-1");
  assert.equal(row.status, "outreach_sent");
  assert.ok(row.job);
  assert.equal(row.job.title, "Program Director");
  assert.equal(row.job.companyName, "Useful Studio");
  assert.equal(row.applyingAs.roleTrackName, "Program Leadership");
  assert.equal(row.applyingAs.narrative, "Lead cross-functional delivery with measurable outcomes.");

  // Only the sent message is exported; the draft is filtered out.
  assert.equal(row.outreach.length, 1);
  assert.equal(row.outreach[0].status, "sent");
  assert.equal(row.outreach[0].contactName, "Dana Lee");
  assert.equal(row.outreach[0].contactType, "likely_hiring_manager");
  assert.equal(row.outreach[0].sentAt, "2026-07-04T18:30:00.000Z");

  assert.equal(recordSpy.calls, 1, "a successful export records exactly one usage event");
}

// --- Narrative falls back to the pursuit angle when no role track resolves ---
{
  const recordSpy = { calls: 0 };
  const options = {
    ...baseOptions("premium", recordSpy),
    loadPursuits: async () => [pursuit({ selectedRoleTrackId: undefined })],
  };
  const response = await handlePublicProfilePursuedJobsExportRequest(getRequest(), options);
  const payload = await json(response);
  const row = (payload.pursuedJobs as ExportRow[])[0];
  assert.equal(row.applyingAs.roleTrackId, null);
  assert.equal(row.applyingAs.roleTrackName, null);
  assert.equal(row.applyingAs.narrative, "Stakeholder alignment.");
}

// --- CSV format -------------------------------------------------------------
{
  const recordSpy = { calls: 0 };
  const response = await handlePublicProfilePursuedJobsExportRequest(getRequest("?format=csv"), baseOptions("premium", recordSpy));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/csv/);
  assert.match(response.headers.get("content-disposition") ?? "", /attachment; filename="pursued-jobs-2026-07-05\.csv"/);
  const text = await response.text();
  const lines = text.split("\r\n");
  assert.match(lines[0], /^pursuitId,status,jobTitle/);
  assert.equal(lines.length, 2, "one header row and one data row for a single sent message");
  // The message contains a comma and quotes, so the cell must be CSV-escaped.
  assert.match(lines[1], /"Hi Dana, I lead cross-functional delivery, and ""here's proof""\."/);
  assert.equal(recordSpy.calls, 1);
}

// --- CSV: pursuit with no sent message still yields one blank-outreach row ---
{
  const recordSpy = { calls: 0 };
  const options = {
    ...baseOptions("premium", recordSpy),
    loadOutreachMessages: async () => [outreachMessage({ status: "draft" })],
  };
  const response = await handlePublicProfilePursuedJobsExportRequest(getRequest("?format=csv"), options);
  const text = await response.text();
  const lines = text.split("\r\n");
  assert.equal(lines.length, 2, "no sent message still emits one pursuit row");
  assert.match(lines[1], /^pursuit-1,outreach_sent,Program Director/);
}

  console.log("public-profile export tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

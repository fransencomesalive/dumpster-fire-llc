import assert from "node:assert/strict";
import {
  handleFitSignalsSectionGetRequest,
  handleFitSignalsSectionPatchRequest,
  handleIdentitySearchSectionGetRequest,
  handleIdentitySearchSectionPatchRequest,
  handleLeadershipProfileSectionGetRequest,
  handleLeadershipProfileSectionPatchRequest,
  handleOutreachRulesSectionGetRequest,
  handleOutreachRulesSectionPatchRequest,
  handleOutreachGeneratorRequest,
  handlePublicProfileMatchRequest,
  handlePublicProfilePursuitContactSelectionRequest,
  handlePublicProfilePursuitCreateRequest,
  handlePublicProfilePursuitHumanPathRequest,
  handlePublicProfilePursuitLifecycleRequest,
  handlePublicProfilePursuitOutreachRequest,
  handlePublicProfilePursuitOutreachMessageUpdateRequest,
  handlePublicProfilePursuitReadRequest,
  handlePublicProfilePursuitReviewRequest,
  handlePublicProfilePursuitsListRequest,
  handlePublicProfilePursuitStatusRequest,
  handlePublicProfileBootstrapRequest,
  handlePublicProfileRegenerationRequest,
  handleProfileResetRequest,
  handleResumeUploadsSectionGetRequest,
  handleResumeUploadsSectionPatchRequest,
  handleRoleTracksSectionGetRequest,
  handleRoleTracksSectionPatchRequest,
  handleSkillsInventorySectionGetRequest,
  handleSkillsInventorySectionPatchRequest,
  handleVoicePersonalitySectionGetRequest,
  handleVoicePersonalitySectionPatchRequest,
  handleWorkExamplesSectionGetRequest,
  handleWorkExamplesSectionPatchRequest,
  handleWritingSamplesSectionGetRequest,
  handleWritingSamplesSectionPatchRequest,
} from "../lib/public-profile/api";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";
import type { GeneratedOutreachDraft, HumanPathContact, HumanPathContactSuggestion, OutreachMessageRecord, Pursuit, PursuitEvent } from "../lib/public-profile/pursuits/types";
import type { PublicJobRecord } from "../lib/public-jobs/types";
import type { SubscriptionContext, UsageLedgerEntry } from "../lib/public-profile/subscription/types";
import type { PublicProfileRegenerationResult } from "../lib/public-profile/service";
import {
  fitSignalsSection,
  identitySearchSection,
  leadershipProfileSection,
  outreachRulesSection,
  resumeUploadsSection,
  roleTracksSection,
  skillsInventorySection,
  voicePersonalitySection,
  workExamplesSection,
  writingSamplesSection,
} from "../lib/public-profile/sections";
import type { ProfileQuality } from "../lib/public-profile/types";
import { completeCandidateProfileAggregate } from "./fixtures/public-profile";

const now = "2026-06-23T16:00:00.000Z";
const regenerateRequest = new Request("https://app.example/api/public-profile/regenerate", { method: "POST" });
const repositoryRequest: PublicProfileRepositoryRequest = async () => {
  throw new Error("repository should not be called by mocked handlers");
};

async function body(response: Response) {
  return await response.json() as Record<string, unknown>;
}

function authed() {
  return { status: "authenticated" as const, userId: "user-1" };
}

function completeQuality(): ProfileQuality {
  return {
    id: "profile-quality-profile-1",
    profileId: "profile-1",
    status: "complete",
    incompleteReasons: [],
    weakFields: [],
    completeFields: ["identity.fullName"],
    weakResponseCount: 0,
    lastCheckedAt: now,
  };
}

function savedPursuit(overrides: Partial<Pursuit> = {}): Pursuit {
  return {
    id: "pursuit-1",
    userId: "user-1",
    profileId: "profile-1",
    jobId: "job-1",
    status: "saved",
    fitSummary: "Strong match.",
    risks: ["Easy Apply volume"],
    recommendedWorkExampleIds: ["example-1"],
    outreachAngle: "Use this Role Track.",
    lastActivityAt: now,
    createdAt: now,
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

function humanPathContact(overrides: Partial<HumanPathContact> = {}): HumanPathContact {
  return {
    name: "Dana Lee",
    title: "VP Product",
    companyName: "Useful Studio",
    linkedinUrl: "https://linkedin.example/dana",
    contactType: "likely_hiring_manager",
    confidence: "high",
    relevanceReason: "Owns the program area.",
    roleConnection: "Likely sponsor for cross-functional delivery.",
    verificationNotes: ["Title matches the function."],
    ...overrides,
  };
}

function contactSuggestion(overrides: Partial<HumanPathContactSuggestion> = {}): HumanPathContactSuggestion {
  return {
    id: "contact-1",
    ...humanPathContact(),
    selectedForOutreach: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function activeBasicSubscription(overrides: Partial<SubscriptionContext> = {}): SubscriptionContext {
  return {
    planName: "premium",
    status: "active",
    currentPeriodStart: "2026-06-01T00:00:00.000Z",
    currentPeriodEnd: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function usage(usageType: UsageLedgerEntry["usageType"], quantity: number): UsageLedgerEntry {
  return {
    userId: "user-1",
    usageType,
    quantity,
    createdAt: now,
  };
}

function getRequest(path: string) {
  return new Request(`https://app.example/api/public-profile/${path}`, { method: "GET" });
}

function patchRequest(path: string, payload: unknown) {
  return new Request(`https://app.example/api/public-profile/${path}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

function postRequest(path: string, payload: unknown) {
  return new Request(`https://app.example/api/public-profile/${path}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function incompleteResult(): Extract<PublicProfileRegenerationResult, { status: "incomplete" }> {
  return {
    status: "incomplete",
    userId: "user-1",
    aggregate: {
      profile: {
        id: "profile-1",
        userId: "user-1",
        status: "incomplete",
        version: 2,
        fullName: "Avery Candidate",
        location: "Denver, CO",
        remotePreference: "remote_preferred",
        generatedMarkdown: "",
        createdAt: now,
        updatedAt: now,
      },
      companyWatchlist: [],
      roleTracks: [],
      resumes: [],
      workExamples: [],
      skills: [],
      qualityFields: [],
      writingSamples: [],
      roleTrackOutreachRules: [],
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "incomplete",
      incompleteReasons: ["At least one Role Track is required."],
      weakFields: ["roleTracks"],
      completeFields: [],
      weakResponseCount: 1,
      lastCheckedAt: now,
    },
  };
}

function regeneratedResult(): PublicProfileRegenerationResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "regenerated",
    userId: "user-1",
    generation: {
      aggregate,
      generatedMarkdown: { markdown: "generated markdown", generatedAt: now, profileVersion: 3 },
      profileQuality: completeQuality(),
      profileVersion: {
        profileId: "profile-1",
        version: 3,
        generatedMarkdown: "generated markdown",
        changeSummary: "Profile regenerated through public profile API.",
        createdAt: now,
      },
      persistenceRows: {
        candidateProfile: {
          id: "profile-1",
          status: "complete",
          version: 3,
          generated_markdown: "generated markdown",
          markdown_generated_at: now,
          updated_at: now,
        },
        profileQuality: {
          profile_id: "profile-1",
          status: "complete",
          incomplete_reasons: [],
          weak_fields: [],
          complete_fields: ["identity.fullName"],
          weak_response_count: 0,
          last_checked_at: now,
        },
        profileVersion: {
          profile_id: "profile-1",
          version: 3,
          generated_markdown: "generated markdown",
          change_summary: "Profile regenerated through public profile API.",
          created_at: now,
        },
      },
    },
  };
}

async function main() {
  // ---- Regeneration cross-cutting paths ----
  const configError = await handlePublicProfileRegenerationRequest(regenerateRequest, {
    getSession: async () => ({ status: "config_error", missing: ["NEXT_PUBLIC_SUPABASE_URL"] }),
  });
  assert.equal(configError.status, 503);
  assert.equal((await body(configError)).error, "Public auth is not configured.");

  const unauthorized = await handlePublicProfileRegenerationRequest(regenerateRequest, {
    getSession: async () => ({ status: "unauthenticated", reason: "Missing bearer token." }),
  });
  assert.equal(unauthorized.status, 401);
  assert.equal((await body(unauthorized)).detail, "Missing bearer token.");

  const repoConfigError = await handlePublicProfileRegenerationRequest(regenerateRequest, {
    getSession: async () => authed(),
    env: {} as NodeJS.ProcessEnv,
  });
  assert.equal(repoConfigError.status, 503);
  assert.equal((await body(repoConfigError)).error, "Public profile repository is not configured.");

  const missing = await handlePublicProfileRegenerationRequest(regenerateRequest, {
    getSession: async () => authed(),
    repositoryRequest,
    regenerateProfile: async () => ({ status: "not_found", userId: "user-1" }),
  });
  assert.equal(missing.status, 404);
  assert.equal((await body(missing)).status, "not_found");

  const incomplete = await handlePublicProfileRegenerationRequest(regenerateRequest, {
    getSession: async () => authed(),
    repositoryRequest,
    regenerateProfile: async () => incompleteResult(),
  });
  assert.equal(incomplete.status, 409);
  assert.deepEqual(await body(incomplete), {
    status: "incomplete",
    profileId: "profile-1",
    profileStatus: "incomplete",
    incompleteReasons: ["At least one Role Track is required."],
    weakFields: ["roleTracks"],
    weakResponseCount: 1,
    lastCheckedAt: now,
  });

  let regenUser = "";
  const regenerated = await handlePublicProfileRegenerationRequest(regenerateRequest, {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    regenerateProfile: async (_request, userId) => {
      regenUser = userId;
      return regeneratedResult();
    },
  });
  assert.equal(regenerated.status, 200);
  assert.equal(regenUser, "user-1");
  assert.deepEqual(await body(regenerated), {
    status: "regenerated",
    profileId: "profile-1",
    profileStatus: "complete",
    version: 3,
    generatedAt: now,
  });
  assert.equal(regenerated.headers.get("cache-control"), "no-store");

  // ---- Bootstrap ----
  const bootstrap = await handlePublicProfileBootstrapRequest(getRequest("bootstrap"), {
    now: () => now,
    getSession: async () => ({ status: "authenticated", userId: "user-1", email: "avery@example.com" }),
    repositoryRequest,
    ensureProfile: async () => completeCandidateProfileAggregate(now),
  });
  assert.equal(bootstrap.status, 200);
  assert.equal((await body(bootstrap)).status, "ready");

  // ---- Profile reset (testing control: allowlisted email only) ----
  const resetForbidden = await handleProfileResetRequest(postRequest("reset", {}), {
    getSession: async () => ({ status: "authenticated", userId: "user-1", email: "avery@example.com" }),
    repositoryRequest,
    resetProfile: async () => {
      throw new Error("reset must not run for non-allowlisted accounts");
    },
  });
  assert.equal(resetForbidden.status, 403);
  assert.equal((await body(resetForbidden)).status, "forbidden");

  const resetNoEmail = await handleProfileResetRequest(postRequest("reset", {}), {
    getSession: async () => authed(),
    repositoryRequest,
    resetProfile: async () => {
      throw new Error("reset must not run without a session email");
    },
  });
  assert.equal(resetNoEmail.status, 403);

  let resetRanFor: string | undefined;
  const resetAllowed = await handleProfileResetRequest(postRequest("reset", {}), {
    getSession: async () => ({ status: "authenticated", userId: "user-1", email: "FransenComesAlive@gmail.com" }),
    repositoryRequest,
    resetProfile: async (_repo, userId) => {
      resetRanFor = userId;
      return { status: "reset" as const };
    },
  });
  assert.equal(resetAllowed.status, 200);
  assert.equal((await body(resetAllowed)).status, "reset");
  assert.equal(resetRanFor, "user-1");

  const agg = completeCandidateProfileAggregate(now);

  // ---- Match route ----
  const matchValidation = await handlePublicProfileMatchRequest(postRequest("match", {}), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => { throw new Error("should not load aggregate on validation error"); },
    loadJob: async () => { throw new Error("should not load job on validation error"); },
  });
  assert.equal(matchValidation.status, 400);
  assert.equal((await body(matchValidation)).status, "validation_error");

  const matchUnauthorized = await handlePublicProfileMatchRequest(postRequest("match", { jobId: "job-1" }), {
    getSession: async () => ({ status: "unauthenticated", reason: "Missing bearer token." }),
  });
  assert.equal(matchUnauthorized.status, 401);

  const matchRepoConfig = await handlePublicProfileMatchRequest(postRequest("match", { jobId: "job-1" }), {
    getSession: async () => authed(),
    env: {} as NodeJS.ProcessEnv,
  });
  assert.equal(matchRepoConfig.status, 503);

  const matchMissingProfile = await handlePublicProfileMatchRequest(postRequest("match", { jobId: "job-1" }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => undefined,
  });
  assert.equal(matchMissingProfile.status, 404);

  const incompleteProfileResult = incompleteResult();
  const matchIncomplete = await handlePublicProfileMatchRequest(postRequest("match", { jobId: "job-1" }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => incompleteProfileResult.aggregate,
  });
  assert.equal(matchIncomplete.status, 409);
  assert.equal((await body(matchIncomplete)).status, "profile_incomplete");

  const matchMissingJob = await handlePublicProfileMatchRequest(postRequest("match", { jobId: "job-404" }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadJob: async () => undefined,
  });
  assert.equal(matchMissingJob.status, 404);

  let matchedJobTitle = "";
  let matchedAt = "";
  const matchOk = await handlePublicProfileMatchRequest(postRequest("match", { jobId: "job-1" }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadJob: async () => ({
      id: "job-1",
      source: "fixture",
      sourceUrl: "https://jobs.example/1",
      companyName: "Useful Studio",
      title: "Program Director",
      location: "Remote",
      remoteType: "remote",
      employmentType: "full_time",
      compensationText: "$170k-$190k",
      description: "Lead stakeholder alignment.",
      postedAt: "2026-06-22T00:00:00.000Z",
      scrapedAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      saved: false,
      responsibilities: [],
      requiredExperience: [],
    }),
    evaluate: ({ job, evaluatedAt }) => {
      matchedJobTitle = job.title;
      matchedAt = evaluatedAt;
      return {
        internalScore: 84,
        label: "Strong Match",
        categoryFits: [],
        recommendations: { alternativeWorkExamples: [] },
        risks: [],
        whyMatched: ["Title lines up with Program Director."],
        whyNotMatched: [],
        softExclusions: [],
        explanation: "Strong match.",
      };
    },
  });
  assert.equal(matchOk.status, 200);
  assert.equal(matchedJobTitle, "Program Director");
  assert.equal(matchedAt, now);
  const matchJson = await body(matchOk);
  assert.equal(matchJson.status, "matched");
  assert.equal(matchJson.profileId, "profile-1");
  assert.equal((matchJson.job as Record<string, unknown>).id, "job-1");
  assert.equal((matchJson.match as Record<string, unknown>).label, "Strong Match");

  // ---- Pursuit list route ----
  const pursuitsListUnauthorized = await handlePublicProfilePursuitsListRequest(getRequest("pursuits"), {
    getSession: async () => ({ status: "unauthenticated", reason: "Missing bearer token." }),
  });
  assert.equal(pursuitsListUnauthorized.status, 401);

  const pursuitsListRepoConfig = await handlePublicProfilePursuitsListRequest(getRequest("pursuits"), {
    getSession: async () => authed(),
    env: {} as NodeJS.ProcessEnv,
  });
  assert.equal(pursuitsListRepoConfig.status, 503);

  const pursuitsListBadStatus = await handlePublicProfilePursuitsListRequest(getRequest("pursuits?status=banana"), {
    getSession: async () => authed(),
    repositoryRequest,
    loadPursuits: async () => { throw new Error("should not load on validation error"); },
  });
  assert.equal(pursuitsListBadStatus.status, 400);
  assert.equal((await body(pursuitsListBadStatus)).status, "validation_error");

  let listOptionsSeen: { status?: string; includeDeleted?: boolean } | undefined;
  const pursuitsListOk = await handlePublicProfilePursuitsListRequest(getRequest("pursuits?status=outreach_sent"), {
    getSession: async () => authed(),
    repositoryRequest,
    loadPursuits: async (_request, _userId, listOptions) => {
      listOptionsSeen = listOptions;
      return [savedPursuit({ id: "pursuit-1", jobId: "job-1", status: "outreach_sent" })];
    },
    loadJobs: async () => new Map([["job-1", publicJob({ id: "job-1" })]]),
  });
  assert.equal(pursuitsListOk.status, 200);
  assert.equal(listOptionsSeen?.status, "outreach_sent");
  const pursuitsListJson = await body(pursuitsListOk);
  assert.equal(pursuitsListJson.status, "ok");
  assert.equal(pursuitsListJson.total, 1);
  assert.deepEqual(pursuitsListJson.counts, { outreach_sent: 1 });
  const listItems = pursuitsListJson.pursuits as Array<Record<string, unknown>>;
  assert.equal((listItems[0].pursuit as Record<string, unknown>).id, "pursuit-1");
  assert.equal((listItems[0].job as Record<string, unknown>).id, "job-1");

  const pursuitsListMissingJob = await handlePublicProfilePursuitsListRequest(getRequest("pursuits"), {
    getSession: async () => authed(),
    repositoryRequest,
    loadPursuits: async () => [savedPursuit({ id: "pursuit-1", jobId: "job-gone" })],
    loadJobs: async () => new Map(),
  });
  assert.equal(pursuitsListMissingJob.status, 200);
  const missingJobItems = (await body(pursuitsListMissingJob)).pursuits as Array<Record<string, unknown>>;
  assert.equal(missingJobItems[0].job, null);

  // ---- Pursuit read route ----
  const pursuitReadUnauthorized = await handlePublicProfilePursuitReadRequest(getRequest("pursuits/pursuit-1"), "pursuit-1", {
    getSession: async () => ({ status: "unauthenticated", reason: "Missing bearer token." }),
  });
  assert.equal(pursuitReadUnauthorized.status, 401);

  const pursuitReadValidation = await handlePublicProfilePursuitReadRequest(getRequest("pursuits/"), "  ", {
    getSession: async () => authed(),
    repositoryRequest,
    loadPursuit: async () => { throw new Error("should not load on validation error"); },
  });
  assert.equal(pursuitReadValidation.status, 400);

  const pursuitReadNotFound = await handlePublicProfilePursuitReadRequest(getRequest("pursuits/pursuit-404"), "pursuit-404", {
    getSession: async () => authed(),
    repositoryRequest,
    loadPursuit: async () => undefined,
  });
  assert.equal(pursuitReadNotFound.status, 404);

  const readOutreachMessage: OutreachMessageRecord = {
    id: "message-1",
    pursuitId: "pursuit-1",
    contactSuggestionId: "contact-1",
    recipientType: "likely_hiring_manager",
    channel: "email",
    message: "Hi Dana.",
    status: "draft",
    selectedRoleTrackId: "track-1",
    selectedResumeId: "resume-1",
    selectedWorkExampleId: "example-1",
    createdAt: now,
    updatedAt: now,
  };
  const readEvent: PursuitEvent = {
    id: "event-1",
    pursuitId: "pursuit-1",
    userId: "user-1",
    eventType: "created",
    toStatus: "saved",
    usageType: "pursuit",
    payload: {},
    createdAt: now,
  };
  const pursuitReadOk = await handlePublicProfilePursuitReadRequest(getRequest("pursuits/pursuit-1"), "pursuit-1", {
    getSession: async () => authed(),
    repositoryRequest,
    loadPursuit: async () => savedPursuit({ id: "pursuit-1", jobId: "job-1" }),
    loadJob: async () => publicJob({ id: "job-1" }),
    loadContactSuggestions: async () => [contactSuggestion({ id: "contact-1", selectedForOutreach: true })],
    loadOutreachMessages: async () => [readOutreachMessage],
    loadPursuitEvents: async () => [readEvent],
  });
  assert.equal(pursuitReadOk.status, 200);
  const pursuitReadJson = await body(pursuitReadOk);
  assert.equal(pursuitReadJson.status, "ok");
  assert.equal((pursuitReadJson.pursuit as Record<string, unknown>).id, "pursuit-1");
  assert.equal((pursuitReadJson.job as Record<string, unknown>).id, "job-1");
  assert.equal((pursuitReadJson.contacts as unknown[]).length, 1);
  assert.equal(((pursuitReadJson.outreachMessages as Array<Record<string, unknown>>)[0]).id, "message-1");
  assert.equal(((pursuitReadJson.events as Array<Record<string, unknown>>)[0]).eventType, "created");

  // ---- Pursuit create route ----
  const pursuitValidation = await handlePublicProfilePursuitCreateRequest(postRequest("pursuits", {}), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => { throw new Error("should not load aggregate on validation error"); },
    loadJob: async () => { throw new Error("should not load job on validation error"); },
  });
  assert.equal(pursuitValidation.status, 400);
  assert.equal((await body(pursuitValidation)).status, "validation_error");

  const pursuitUnauthorized = await handlePublicProfilePursuitCreateRequest(postRequest("pursuits", { jobId: "job-1" }), {
    getSession: async () => ({ status: "unauthenticated", reason: "Missing bearer token." }),
  });
  assert.equal(pursuitUnauthorized.status, 401);

  const pursuitRepoConfig = await handlePublicProfilePursuitCreateRequest(postRequest("pursuits", { jobId: "job-1" }), {
    getSession: async () => authed(),
    env: {} as NodeJS.ProcessEnv,
  });
  assert.equal(pursuitRepoConfig.status, 503);

  const pursuitMissingProfile = await handlePublicProfilePursuitCreateRequest(postRequest("pursuits", { jobId: "job-1" }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => undefined,
  });
  assert.equal(pursuitMissingProfile.status, 404);

  const pursuitIncomplete = await handlePublicProfilePursuitCreateRequest(postRequest("pursuits", { jobId: "job-1" }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => incompleteProfileResult.aggregate,
  });
  assert.equal(pursuitIncomplete.status, 409);
  assert.equal((await body(pursuitIncomplete)).status, "profile_incomplete");

  const pursuitMissingJob = await handlePublicProfilePursuitCreateRequest(postRequest("pursuits", { jobId: "job-404" }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadJob: async () => undefined,
  });
  assert.equal(pursuitMissingJob.status, 404);

  const pursuitTransitionError = await handlePublicProfilePursuitCreateRequest(postRequest("pursuits", { jobId: "job-1" }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadJob: async () => ({
      id: "job-1",
      source: "fixture",
      sourceUrl: "https://jobs.example/1",
      companyName: "Useful Studio",
      title: "Program Director",
      description: "Lead stakeholder alignment.",
      scrapedAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      saved: false,
      responsibilities: [],
      requiredExperience: [],
    }),
    loadSubscriptionContext: async () => activeBasicSubscription(),
    loadUsageEntries: async () => [],
    createPursuit: async () => ({ ok: false, issues: ["Nope."] }),
  });
  assert.equal(pursuitTransitionError.status, 409);
  assert.equal((await body(pursuitTransitionError)).status, "transition_error");

  let createdPursuitInput: unknown;
  const pursuitCreated = await handlePublicProfilePursuitCreateRequest(postRequest("pursuits", { jobId: "job-1" }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadSubscriptionContext: async () => activeBasicSubscription(),
    loadUsageEntries: async () => [],
    loadJob: async () => ({
      id: "job-1",
      source: "fixture",
      sourceUrl: "https://jobs.example/1",
      companyName: "Useful Studio",
      title: "Program Director",
      description: "Lead stakeholder alignment.",
      scrapedAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      saved: false,
      responsibilities: [],
      requiredExperience: [],
    }),
    createId: () => "pursuit-1",
    evaluate: () => ({
      internalScore: 84,
      label: "Strong Match",
      categoryFits: [],
      recommendations: {
        roleTrack: { roleTrack: { id: "track-1", name: "Program Director" }, confidence: "high", reason: "Use this Role Track." },
        workExample: { workExample: { id: "example-1", title: "Phred", oneHitter: "Cut turnaround 40%." }, confidence: "high", reason: "Relevant." },
        alternativeWorkExamples: [{ workExample: { id: "example-2", title: "Alt", oneHitter: "Shipped it." }, confidence: "medium", reason: "Also relevant." }],
      },
      risks: ["Easy Apply volume"],
      whyMatched: ["Program Director overlap"],
      whyNotMatched: [],
      softExclusions: [],
      explanation: "Strong match.",
    }),
    createPursuit: async (_request, input) => {
      createdPursuitInput = input;
      return {
        ok: true,
        pursuit: {
          id: input.id,
          userId: input.userId,
          profileId: input.profileId,
          jobId: input.jobId,
          status: "saved",
          fitSummary: input.fitSummary,
          risks: input.risks ?? [],
          recommendedWorkExampleIds: input.recommendedWorkExampleIds ?? [],
          outreachAngle: input.outreachAngle,
          lastActivityAt: input.now,
          createdAt: input.now,
          updatedAt: input.now,
        },
        event: {
          pursuitId: input.id,
          userId: input.userId,
          eventType: "created",
          toStatus: "saved",
          usageType: "pursuit",
          payload: {},
          createdAt: input.now,
        },
        usageEvents: [],
      };
    },
  });
  assert.equal(pursuitCreated.status, 201);
  assert.deepEqual(createdPursuitInput, {
    id: "pursuit-1",
    userId: "user-1",
    profileId: "profile-1",
    jobId: "job-1",
    now,
    fitSummary: "Strong match.",
    risks: ["Easy Apply volume"],
    recommendedWorkExampleIds: ["example-1", "example-2"],
    outreachAngle: "Use this Role Track.",
  });
  const pursuitJson = await body(pursuitCreated);
  assert.equal(pursuitJson.status, "created");
  assert.equal((pursuitJson.pursuit as Record<string, unknown>).id, "pursuit-1");

  // ---- Pursuit review route ----
  const reviewValidation = await handlePublicProfilePursuitReviewRequest(postRequest("pursuits/review", {}), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => { throw new Error("should not load aggregate on validation error"); },
    loadPursuit: async () => { throw new Error("should not load pursuit on validation error"); },
  });
  assert.equal(reviewValidation.status, 400);
  assert.equal((await body(reviewValidation)).status, "validation_error");

  const reviewUnauthorized = await handlePublicProfilePursuitReviewRequest(postRequest("pursuits/review", { pursuitId: "pursuit-1" }), {
    getSession: async () => ({ status: "unauthenticated", reason: "Missing bearer token." }),
  });
  assert.equal(reviewUnauthorized.status, 401);

  const reviewRepoConfig = await handlePublicProfilePursuitReviewRequest(postRequest("pursuits/review", { pursuitId: "pursuit-1" }), {
    getSession: async () => authed(),
    env: {} as NodeJS.ProcessEnv,
  });
  assert.equal(reviewRepoConfig.status, 503);

  const reviewMissingProfile = await handlePublicProfilePursuitReviewRequest(postRequest("pursuits/review", { pursuitId: "pursuit-1" }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => undefined,
  });
  assert.equal(reviewMissingProfile.status, 404);

  const reviewIncomplete = await handlePublicProfilePursuitReviewRequest(postRequest("pursuits/review", { pursuitId: "pursuit-1" }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => incompleteProfileResult.aggregate,
  });
  assert.equal(reviewIncomplete.status, 409);
  assert.equal((await body(reviewIncomplete)).status, "profile_incomplete");

  const reviewMissingPursuit = await handlePublicProfilePursuitReviewRequest(postRequest("pursuits/review", { pursuitId: "pursuit-404" }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => undefined,
  });
  assert.equal(reviewMissingPursuit.status, 404);

  const reviewWrongProfile = await handlePublicProfilePursuitReviewRequest(postRequest("pursuits/review", { pursuitId: "pursuit-1" }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ profileId: "profile-2" }),
  });
  assert.equal(reviewWrongProfile.status, 404);

  const reviewInvalidSelection = await handlePublicProfilePursuitReviewRequest(postRequest("pursuits/review", {
    pursuitId: "pursuit-1",
    selectedRoleTrackId: "track-404",
    selectedResumeId: "resume-404",
    selectedWorkExampleId: "example-404",
    recommendedWorkExampleIds: ["example-404"],
  }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit(),
  });
  assert.equal(reviewInvalidSelection.status, 400);
  const reviewInvalidJson = await body(reviewInvalidSelection);
  assert.equal(reviewInvalidJson.status, "validation_error");
  assert.equal((reviewInvalidJson.issues as unknown[]).length, 4);

  const reviewTransitionError = await handlePublicProfilePursuitReviewRequest(postRequest("pursuits/review", { pursuitId: "pursuit-1" }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ status: "outreach_ready" }),
  });
  assert.equal(reviewTransitionError.status, 409);
  assert.equal((await body(reviewTransitionError)).status, "transition_error");

  let persistedReview: unknown;
  const reviewComplete = await handlePublicProfilePursuitReviewRequest(postRequest("pursuits/review", {
    pursuitId: "pursuit-1",
    selectedRoleTrackId: "track-1",
    selectedResumeId: "resume-1",
    selectedWorkExampleId: "example-1",
    fitSummary: "Reviewed and ready.",
    risks: ["Volume risk"],
    recommendedWorkExampleIds: ["example-1"],
    outreachAngle: "Lead with operational clarity.",
  }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit(),
    persistTransition: async (_request, result) => {
      persistedReview = result;
    },
  });
  assert.equal(reviewComplete.status, 200);
  const reviewCompleteJson = await body(reviewComplete);
  assert.equal(reviewCompleteJson.status, "review_complete");
  assert.equal((reviewCompleteJson.pursuit as Record<string, unknown>).status, "review_complete");
  assert.equal((reviewCompleteJson.pursuit as Record<string, unknown>).selectedRoleTrackId, "track-1");
  assert.equal((reviewCompleteJson.pursuit as Record<string, unknown>).selectedResumeId, "resume-1");
  assert.equal((reviewCompleteJson.pursuit as Record<string, unknown>).selectedWorkExampleId, "example-1");
  assert.deepEqual((persistedReview as { pursuit: Pursuit }).pursuit.recommendedWorkExampleIds, ["example-1"]);

  // ---- Pursuit Human Path route ----
  const humanPathValidation = await handlePublicProfilePursuitHumanPathRequest(postRequest("pursuits/human-path", {}), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => { throw new Error("should not load aggregate on validation error"); },
    loadPursuit: async () => { throw new Error("should not load pursuit on validation error"); },
  });
  assert.equal(humanPathValidation.status, 400);
  assert.equal((await body(humanPathValidation)).status, "validation_error");

  const humanPathUnauthorized = await handlePublicProfilePursuitHumanPathRequest(postRequest("pursuits/human-path", { pursuitId: "pursuit-1" }), {
    getSession: async () => ({ status: "unauthenticated", reason: "Missing bearer token." }),
  });
  assert.equal(humanPathUnauthorized.status, 401);

  const humanPathRepoConfig = await handlePublicProfilePursuitHumanPathRequest(postRequest("pursuits/human-path", { pursuitId: "pursuit-1" }), {
    getSession: async () => authed(),
    env: {} as NodeJS.ProcessEnv,
  });
  assert.equal(humanPathRepoConfig.status, 503);

  const humanPathMissingProfile = await handlePublicProfilePursuitHumanPathRequest(postRequest("pursuits/human-path", { pursuitId: "pursuit-1" }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => undefined,
  });
  assert.equal(humanPathMissingProfile.status, 404);

  const humanPathIncomplete = await handlePublicProfilePursuitHumanPathRequest(postRequest("pursuits/human-path", { pursuitId: "pursuit-1" }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => incompleteProfileResult.aggregate,
  });
  assert.equal(humanPathIncomplete.status, 409);
  assert.equal((await body(humanPathIncomplete)).status, "profile_incomplete");

  const humanPathMissingPursuit = await handlePublicProfilePursuitHumanPathRequest(postRequest("pursuits/human-path", { pursuitId: "pursuit-404" }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => undefined,
  });
  assert.equal(humanPathMissingPursuit.status, 404);

  const humanPathMissingJob = await handlePublicProfilePursuitHumanPathRequest(postRequest("pursuits/human-path", { pursuitId: "pursuit-1" }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ status: "review_complete" }),
    loadJob: async () => undefined,
  });
  assert.equal(humanPathMissingJob.status, 404);

  let providerCalledAfterLimit = false;
  const humanPathLimitReached = await handlePublicProfilePursuitHumanPathRequest(postRequest("pursuits/human-path", { pursuitId: "pursuit-1" }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ status: "review_complete" }),
    loadJob: async () => publicJob(),
    loadSubscriptionContext: async () => activeBasicSubscription(),
    loadUsageEntries: async () => [usage("human_path", 50)],
    humanPathProvider: async () => {
      providerCalledAfterLimit = true;
      return { status: "generated", contacts: [humanPathContact()] };
    },
  });
  assert.equal(humanPathLimitReached.status, 429);
  assert.equal((await body(humanPathLimitReached)).status, "limit_reached");
  assert.equal(providerCalledAfterLimit, false);

  const humanPathProviderUnavailable = await handlePublicProfilePursuitHumanPathRequest(postRequest("pursuits/human-path", { pursuitId: "pursuit-1" }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ status: "review_complete" }),
    loadJob: async () => publicJob(),
    loadSubscriptionContext: async () => activeBasicSubscription(),
    loadUsageEntries: async () => [],
  });
  assert.equal(humanPathProviderUnavailable.status, 503);
  assert.equal((await body(humanPathProviderUnavailable)).status, "provider_unavailable");

  const humanPathTransitionError = await handlePublicProfilePursuitHumanPathRequest(postRequest("pursuits/human-path", { pursuitId: "pursuit-1" }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ status: "saved" }),
    loadJob: async () => publicJob(),
    loadSubscriptionContext: async () => activeBasicSubscription(),
    loadUsageEntries: async () => [],
    humanPathProvider: async () => ({ status: "generated", contacts: [humanPathContact()] }),
  });
  assert.equal(humanPathTransitionError.status, 409);
  assert.equal((await body(humanPathTransitionError)).status, "transition_error");

  let persistedHumanPath: unknown;
  let persistedContacts: unknown;
  let usageOptions: unknown;
  const humanPathGenerated = await handlePublicProfilePursuitHumanPathRequest(postRequest("pursuits/human-path", { pursuitId: "pursuit-1" }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ status: "review_complete" }),
    loadJob: async () => publicJob(),
    loadSubscriptionContext: async () => activeBasicSubscription(),
    loadUsageEntries: async (_request, _userId, options) => {
      usageOptions = options;
      return [usage("human_path", 12)];
    },
    humanPathProvider: async ({ job, pursuit }) => {
      assert.equal(job.companyName, "Useful Studio");
      assert.equal(pursuit.status, "review_complete");
      return { status: "generated", contacts: [humanPathContact()] };
    },
    persistHumanPath: async (_request, result, contacts) => {
      persistedHumanPath = result;
      persistedContacts = contacts;
    },
  });
  assert.equal(humanPathGenerated.status, 200);
  assert.deepEqual(usageOptions, {
    at: now,
    periodStart: "2026-06-01T00:00:00.000Z",
    periodEnd: "2026-07-01T00:00:00.000Z",
  });
  const humanPathJson = await body(humanPathGenerated);
  assert.equal(humanPathJson.status, "human_path_generated");
  assert.equal((humanPathJson.pursuit as Record<string, unknown>).status, "human_path_generated");
  assert.equal((humanPathJson.event as Record<string, unknown>).usageType, "human_path");
  assert.deepEqual((persistedHumanPath as { pursuit: Pursuit }).pursuit.status, "human_path_generated");
  assert.equal((persistedContacts as HumanPathContact[]).length, 1);
  assert.equal(((humanPathJson.contacts as HumanPathContact[])[0]).name, "Dana Lee");

  // ---- Pursuit contact selection route ----
  const contactSelectionValidation = await handlePublicProfilePursuitContactSelectionRequest(postRequest("pursuits/contacts", {}), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => { throw new Error("should not load aggregate on validation error"); },
    loadPursuit: async () => { throw new Error("should not load pursuit on validation error"); },
  });
  assert.equal(contactSelectionValidation.status, 400);
  const contactSelectionValidationJson = await body(contactSelectionValidation);
  assert.equal(contactSelectionValidationJson.status, "validation_error");
  assert.equal((contactSelectionValidationJson.issues as unknown[]).length, 2);

  const contactSelectionUnauthorized = await handlePublicProfilePursuitContactSelectionRequest(postRequest("pursuits/contacts", {
    pursuitId: "pursuit-1",
    contactIds: ["contact-1"],
  }), {
    getSession: async () => ({ status: "unauthenticated", reason: "Missing bearer token." }),
  });
  assert.equal(contactSelectionUnauthorized.status, 401);

  const contactSelectionMissingProfile = await handlePublicProfilePursuitContactSelectionRequest(postRequest("pursuits/contacts", {
    pursuitId: "pursuit-1",
    contactIds: ["contact-1"],
  }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => undefined,
  });
  assert.equal(contactSelectionMissingProfile.status, 404);

  const contactSelectionIncomplete = await handlePublicProfilePursuitContactSelectionRequest(postRequest("pursuits/contacts", {
    pursuitId: "pursuit-1",
    contactIds: ["contact-1"],
  }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => incompleteProfileResult.aggregate,
  });
  assert.equal(contactSelectionIncomplete.status, 409);
  assert.equal((await body(contactSelectionIncomplete)).status, "profile_incomplete");

  const contactSelectionMissingPursuit = await handlePublicProfilePursuitContactSelectionRequest(postRequest("pursuits/contacts", {
    pursuitId: "pursuit-404",
    contactIds: ["contact-1"],
  }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => undefined,
  });
  assert.equal(contactSelectionMissingPursuit.status, 404);

  const contactSelectionUnknownContact = await handlePublicProfilePursuitContactSelectionRequest(postRequest("pursuits/contacts", {
    pursuitId: "pursuit-1",
    contactIds: ["contact-404"],
  }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ status: "human_path_generated" }),
    loadContactSuggestions: async () => [contactSuggestion()],
    loadOutreachMessages: async () => [],
  });
  assert.equal(contactSelectionUnknownContact.status, 400);
  assert.equal((await body(contactSelectionUnknownContact)).status, "validation_error");

  const contactSelectionTransitionError = await handlePublicProfilePursuitContactSelectionRequest(postRequest("pursuits/contacts", {
    pursuitId: "pursuit-1",
    contactIds: ["contact-1"],
  }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ status: "saved" }),
    loadContactSuggestions: async () => [contactSuggestion()],
    loadOutreachMessages: async () => [],
  });
  assert.equal(contactSelectionTransitionError.status, 409);
  assert.equal((await body(contactSelectionTransitionError)).status, "transition_error");

  let persistedContactSelection: unknown;
  let persistedContactIds: unknown;
  const contactSelection = await handlePublicProfilePursuitContactSelectionRequest(postRequest("pursuits/contacts", {
    pursuitId: "pursuit-1",
    contactIds: ["contact-1", "contact-1"],
  }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ status: "human_path_generated" }),
    loadContactSuggestions: async () => [contactSuggestion(), contactSuggestion({ id: "contact-2", name: "Riley Chen" })],
    loadOutreachMessages: async () => [],
    persistContactSelection: async (_request, result, contactIds) => {
      persistedContactSelection = result;
      persistedContactIds = contactIds;
    },
  });
  assert.equal(contactSelection.status, 200);
  const contactSelectionJson = await body(contactSelection);
  assert.equal(contactSelectionJson.status, "outreach_ready");
  assert.deepEqual(contactSelectionJson.selectedContactIds, ["contact-1"]);
  assert.equal((contactSelectionJson.pursuit as Record<string, unknown>).status, "outreach_ready");
  assert.equal((contactSelectionJson.event as Record<string, unknown>).eventType, "contacts_selected");
  assert.deepEqual(persistedContactIds, ["contact-1"]);
  assert.equal((persistedContactSelection as { pursuit: Pursuit }).pursuit.status, "outreach_ready");

  // ---- Pursuit outreach route ----
  const pursuitOutreachValidation = await handlePublicProfilePursuitOutreachRequest(postRequest("pursuits/outreach", {}), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => { throw new Error("should not load aggregate on validation error"); },
    loadPursuit: async () => { throw new Error("should not load pursuit on validation error"); },
  });
  assert.equal(pursuitOutreachValidation.status, 400);
  assert.equal((await body(pursuitOutreachValidation)).status, "validation_error");

  const pursuitOutreachUnauthorized = await handlePublicProfilePursuitOutreachRequest(postRequest("pursuits/outreach", { pursuitId: "pursuit-1" }), {
    getSession: async () => ({ status: "unauthenticated", reason: "Missing bearer token." }),
  });
  assert.equal(pursuitOutreachUnauthorized.status, 401);

  const noGeneratedProfile = {
    ...agg,
    profile: { ...agg.profile, generatedMarkdown: "", markdownGeneratedAt: undefined },
  };
  // Compile-on-missing (Randall, 2026-07-11): a COMPLETE profile with no compiled profile.md
  // must compile it at the outreach step, not dead-end at profile_incomplete. Here regenerate
  // yields fresh markdown, so the handler moves past the markdown gate (reaching a later 404
  // for the missing pursuit) instead of 409ing.
  let compiledOnMissing = false;
  const pursuitOutreachCompilesMissingMarkdown = await handlePublicProfilePursuitOutreachRequest(postRequest("pursuits/outreach", { pursuitId: "pursuit-404" }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => noGeneratedProfile,
    regenerateProfile: async () => {
      compiledOnMissing = true;
      return regeneratedResult();
    },
    loadPursuit: async () => undefined,
  });
  assert.equal(compiledOnMissing, true);
  assert.equal(pursuitOutreachCompilesMissingMarkdown.status, 404);

  // If compilation still yields no markdown (e.g. profile vanished mid-flight), fall back to
  // the 409 profile_incomplete guard.
  const pursuitOutreachProfileIncomplete = await handlePublicProfilePursuitOutreachRequest(postRequest("pursuits/outreach", { pursuitId: "pursuit-1" }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => noGeneratedProfile,
    regenerateProfile: async () => ({ status: "not_found", userId: "user-1" }),
  });
  assert.equal(pursuitOutreachProfileIncomplete.status, 409);
  assert.equal((await body(pursuitOutreachProfileIncomplete)).status, "profile_incomplete");

  const pursuitOutreachMissingPursuit = await handlePublicProfilePursuitOutreachRequest(postRequest("pursuits/outreach", { pursuitId: "pursuit-404" }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => undefined,
  });
  assert.equal(pursuitOutreachMissingPursuit.status, 404);

  const pursuitOutreachMissingJob = await handlePublicProfilePursuitOutreachRequest(postRequest("pursuits/outreach", { pursuitId: "pursuit-1" }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ status: "outreach_ready" }),
    loadJob: async () => undefined,
  });
  assert.equal(pursuitOutreachMissingJob.status, 404);

  const pursuitOutreachNoContacts = await handlePublicProfilePursuitOutreachRequest(postRequest("pursuits/outreach", { pursuitId: "pursuit-1" }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ status: "outreach_ready" }),
    loadJob: async () => publicJob(),
    loadContactSuggestions: async () => [contactSuggestion({ selectedForOutreach: false })],
  });
  assert.equal(pursuitOutreachNoContacts.status, 400);
  assert.equal((await body(pursuitOutreachNoContacts)).status, "validation_error");

  let outreachGeneratorCalledAfterLimit = false;
  const pursuitOutreachLimit = await handlePublicProfilePursuitOutreachRequest(postRequest("pursuits/outreach", { pursuitId: "pursuit-1" }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ status: "outreach_ready" }),
    loadJob: async () => publicJob(),
    loadContactSuggestions: async () => [contactSuggestion({ selectedForOutreach: true })],
    loadOutreachMessages: async () => [],
    loadSubscriptionContext: async () => activeBasicSubscription(),
    loadUsageEntries: async () => [usage("outreach_message", 150)],
    generateOutreachForContact: async () => {
      outreachGeneratorCalledAfterLimit = true;
      return { message: "Nope.", insertedExample: null };
    },
  });
  assert.equal(pursuitOutreachLimit.status, 429);
  assert.equal((await body(pursuitOutreachLimit)).status, "limit_reached");
  assert.equal(outreachGeneratorCalledAfterLimit, false);

  let outreachGeneratorCalledAfterTransitionError = false;
  const pursuitOutreachTransitionError = await handlePublicProfilePursuitOutreachRequest(postRequest("pursuits/outreach", { pursuitId: "pursuit-1" }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ status: "human_path_generated" }),
    loadJob: async () => publicJob(),
    loadContactSuggestions: async () => [contactSuggestion({ selectedForOutreach: true })],
    loadOutreachMessages: async () => [],
    loadSubscriptionContext: async () => activeBasicSubscription(),
    loadUsageEntries: async () => [],
    generateOutreachForContact: async () => {
      outreachGeneratorCalledAfterTransitionError = true;
      return { message: "Nope.", insertedExample: null };
    },
  });
  assert.equal(pursuitOutreachTransitionError.status, 409);
  assert.equal((await body(pursuitOutreachTransitionError)).status, "transition_error");
  assert.equal(outreachGeneratorCalledAfterTransitionError, false);

  const pursuitOutreachUnavailable = await handlePublicProfilePursuitOutreachRequest(postRequest("pursuits/outreach", { pursuitId: "pursuit-1" }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ status: "outreach_ready" }),
    loadJob: async () => publicJob(),
    loadContactSuggestions: async () => [contactSuggestion({ selectedForOutreach: true })],
    loadOutreachMessages: async () => [],
    loadSubscriptionContext: async () => activeBasicSubscription(),
    loadUsageEntries: async () => [],
    generateOutreachForContact: async () => undefined,
  });
  assert.equal(pursuitOutreachUnavailable.status, 503);
  assert.equal((await body(pursuitOutreachUnavailable)).status, "model_unavailable");

  let persistedOutreach: unknown;
  let persistedDrafts: unknown;
  let outreachUsageOptions: unknown;
  const generatedForContacts: unknown[] = [];
  const pursuitOutreachGenerated = await handlePublicProfilePursuitOutreachRequest(postRequest("pursuits/outreach", { pursuitId: "pursuit-1" }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({
      status: "outreach_ready",
      selectedRoleTrackId: "track-1",
      selectedResumeId: "resume-1",
      selectedWorkExampleId: "example-1",
    }),
    loadJob: async () => publicJob(),
    loadOutreachMessages: async () => [],
    loadContactSuggestions: async () => [
      contactSuggestion({ selectedForOutreach: true }),
      contactSuggestion({ id: "contact-2", name: "Riley Chen", contactType: "recruiter", selectedForOutreach: true }),
    ],
    loadSubscriptionContext: async () => activeBasicSubscription(),
    loadUsageEntries: async (_request, _userId, options) => {
      outreachUsageOptions = options;
      return [usage("outreach_message", 12)];
    },
    generateOutreachForContact: async (input) => {
      generatedForContacts.push(input);
      return {
        message: `Hi ${input.contact.name ?? input.contact.role} - interested in ${input.job.title}.`,
        insertedExample: { oneHitter: "Cut turnaround 40%.", link: "https://example.com/x" },
      };
    },
    persistOutreach: async (_request, result, drafts) => {
      persistedOutreach = result;
      persistedDrafts = drafts;
    },
  });
  assert.equal(pursuitOutreachGenerated.status, 200);
  assert.deepEqual(outreachUsageOptions, {
    at: now,
    periodStart: "2026-06-01T00:00:00.000Z",
    periodEnd: "2026-07-01T00:00:00.000Z",
  });
  assert.equal(generatedForContacts.length, 2);
  const pursuitOutreachJson = await body(pursuitOutreachGenerated);
  assert.equal(pursuitOutreachJson.status, "outreach_generated");
  assert.equal((pursuitOutreachJson.event as Record<string, unknown>).usageType, "outreach_message");
  assert.equal((pursuitOutreachJson.messages as unknown[]).length, 2);
  assert.equal((persistedOutreach as { pursuit: Pursuit }).pursuit.status, "outreach_ready");
  assert.equal((persistedDrafts as GeneratedOutreachDraft[]).length, 2);
  assert.deepEqual((persistedDrafts as GeneratedOutreachDraft[]).map((draft) => draft.recipientType), ["likely_hiring_manager", "recruiter"]);
  assert.equal((persistedDrafts as GeneratedOutreachDraft[])[0].selectedWorkExampleId, "example-1");

  // ---- Per-message outreach update route ----
  const draftMessage: OutreachMessageRecord = {
    id: "message-1",
    pursuitId: "pursuit-1",
    contactSuggestionId: "contact-1",
    recipientType: "likely_hiring_manager",
    channel: "email",
    message: "Hi Dana.",
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };

  const messageUpdateValidation = await handlePublicProfilePursuitOutreachMessageUpdateRequest(
    patchRequest("pursuits/outreach/message-1", {}),
    "message-1",
    {
      getSession: async () => authed(),
      repositoryRequest,
      loadOutreachMessage: async () => { throw new Error("should not load message on validation error"); },
    },
  );
  assert.equal(messageUpdateValidation.status, 400);
  assert.equal((await body(messageUpdateValidation)).status, "validation_error");

  const messageUpdateUnauthorized = await handlePublicProfilePursuitOutreachMessageUpdateRequest(
    patchRequest("pursuits/outreach/message-1", { action: "approve" }),
    "message-1",
    { getSession: async () => ({ status: "unauthenticated", reason: "Missing bearer token." }) },
  );
  assert.equal(messageUpdateUnauthorized.status, 401);

  const messageUpdateNotFound = await handlePublicProfilePursuitOutreachMessageUpdateRequest(
    patchRequest("pursuits/outreach/message-404", { action: "approve" }),
    "message-404",
    {
      getSession: async () => authed(),
      repositoryRequest,
      loadOutreachMessage: async () => undefined,
    },
  );
  assert.equal(messageUpdateNotFound.status, 404);

  const messageUpdateNotOwned = await handlePublicProfilePursuitOutreachMessageUpdateRequest(
    patchRequest("pursuits/outreach/message-1", { action: "approve" }),
    "message-1",
    {
      getSession: async () => authed(),
      repositoryRequest,
      loadOutreachMessage: async () => draftMessage,
      loadPursuit: async () => undefined,
      updateOutreachMessage: async () => { throw new Error("should not persist when pursuit is not owned"); },
    },
  );
  assert.equal(messageUpdateNotOwned.status, 404);

  const messageUpdateBadTransition = await handlePublicProfilePursuitOutreachMessageUpdateRequest(
    patchRequest("pursuits/outreach/message-1", { action: "send" }),
    "message-1",
    {
      getSession: async () => authed(),
      repositoryRequest,
      loadOutreachMessage: async () => draftMessage,
      loadPursuit: async () => savedPursuit({ status: "outreach_ready" }),
      updateOutreachMessage: async () => { throw new Error("should not persist an invalid transition"); },
    },
  );
  assert.equal(messageUpdateBadTransition.status, 409);
  assert.equal((await body(messageUpdateBadTransition)).status, "transition_error");

  let persistedMessage: OutreachMessageRecord | undefined;
  const messageUpdateApproved = await handlePublicProfilePursuitOutreachMessageUpdateRequest(
    patchRequest("pursuits/outreach/message-1", { action: "approve" }),
    "message-1",
    {
      now: () => now,
      getSession: async () => authed(),
      repositoryRequest,
      loadOutreachMessage: async () => draftMessage,
      loadPursuit: async () => savedPursuit({ status: "outreach_ready" }),
      updateOutreachMessage: async (_request, message) => { persistedMessage = message; },
    },
  );
  assert.equal(messageUpdateApproved.status, 200);
  const messageUpdateApprovedJson = await body(messageUpdateApproved);
  assert.equal(messageUpdateApprovedJson.status, "outreach_message_updated");
  assert.equal((messageUpdateApprovedJson.message as OutreachMessageRecord).status, "approved");
  assert.equal(persistedMessage?.status, "approved");

  // ---- Pursuit status route ----
  const pursuitStatusValidation = await handlePublicProfilePursuitStatusRequest(postRequest("pursuits/status", {}), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => { throw new Error("should not load aggregate on validation error"); },
    loadPursuit: async () => { throw new Error("should not load pursuit on validation error"); },
  });
  assert.equal(pursuitStatusValidation.status, 400);
  const pursuitStatusValidationJson = await body(pursuitStatusValidation);
  assert.equal(pursuitStatusValidationJson.status, "validation_error");
  assert.equal((pursuitStatusValidationJson.issues as unknown[]).length, 2);

  const pursuitStatusInvalidAction = await handlePublicProfilePursuitStatusRequest(postRequest("pursuits/status", {
    pursuitId: "pursuit-1",
    action: "made_up",
  }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => { throw new Error("should not load aggregate on validation error"); },
  });
  assert.equal(pursuitStatusInvalidAction.status, 400);
  assert.equal((await body(pursuitStatusInvalidAction)).status, "validation_error");

  const pursuitStatusUnauthorized = await handlePublicProfilePursuitStatusRequest(postRequest("pursuits/status", {
    pursuitId: "pursuit-1",
    action: "outreach_sent",
  }), {
    getSession: async () => ({ status: "unauthenticated", reason: "Missing bearer token." }),
  });
  assert.equal(pursuitStatusUnauthorized.status, 401);

  const pursuitStatusMissingProfile = await handlePublicProfilePursuitStatusRequest(postRequest("pursuits/status", {
    pursuitId: "pursuit-1",
    action: "outreach_sent",
  }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => undefined,
  });
  assert.equal(pursuitStatusMissingProfile.status, 404);

  const pursuitStatusMissingPursuit = await handlePublicProfilePursuitStatusRequest(postRequest("pursuits/status", {
    pursuitId: "pursuit-404",
    action: "outreach_sent",
  }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => undefined,
  });
  assert.equal(pursuitStatusMissingPursuit.status, 404);

  const pursuitStatusWrongProfile = await handlePublicProfilePursuitStatusRequest(postRequest("pursuits/status", {
    pursuitId: "pursuit-1",
    action: "outreach_sent",
  }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ profileId: "profile-2", status: "outreach_ready" }),
  });
  assert.equal(pursuitStatusWrongProfile.status, 404);

  const pursuitStatusTransitionError = await handlePublicProfilePursuitStatusRequest(postRequest("pursuits/status", {
    pursuitId: "pursuit-1",
    action: "responded",
  }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ status: "outreach_ready" }),
  });
  assert.equal(pursuitStatusTransitionError.status, 409);
  assert.equal((await body(pursuitStatusTransitionError)).status, "transition_error");

  let persistedStatus: unknown;
  const pursuitStatusUpdated = await handlePublicProfilePursuitStatusRequest(postRequest("pursuits/status", {
    pursuitId: "pursuit-1",
    action: "outreach_sent",
  }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ status: "outreach_ready" }),
    persistTransition: async (_request, result) => {
      persistedStatus = result;
    },
  });
  assert.equal(pursuitStatusUpdated.status, 200);
  const pursuitStatusJson = await body(pursuitStatusUpdated);
  assert.equal(pursuitStatusJson.status, "updated");
  assert.equal((pursuitStatusJson.pursuit as Record<string, unknown>).status, "outreach_sent");
  assert.equal((pursuitStatusJson.event as Record<string, unknown>).eventType, "outreach_sent");
  assert.equal((persistedStatus as { pursuit: Pursuit }).pursuit.status, "outreach_sent");

  // ---- Pursuit lifecycle route ----
  const pursuitLifecycleValidation = await handlePublicProfilePursuitLifecycleRequest(postRequest("pursuits/lifecycle", {
    action: "made_up",
  }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => { throw new Error("should not load aggregate on validation error"); },
    loadPursuit: async () => { throw new Error("should not load pursuit on validation error"); },
  });
  assert.equal(pursuitLifecycleValidation.status, 400);
  const pursuitLifecycleValidationJson = await body(pursuitLifecycleValidation);
  assert.equal(pursuitLifecycleValidationJson.status, "validation_error");
  assert.equal((pursuitLifecycleValidationJson.issues as unknown[]).length, 2);

  const pursuitLifecycleUnauthorized = await handlePublicProfilePursuitLifecycleRequest(postRequest("pursuits/lifecycle", {
    pursuitId: "pursuit-1",
    action: "note_added",
    note: "Sent follow-up.",
  }), {
    getSession: async () => ({ status: "unauthenticated", reason: "Missing bearer token." }),
  });
  assert.equal(pursuitLifecycleUnauthorized.status, 401);

  const pursuitLifecycleMissingProfile = await handlePublicProfilePursuitLifecycleRequest(postRequest("pursuits/lifecycle", {
    pursuitId: "pursuit-1",
    action: "note_added",
    note: "Sent follow-up.",
  }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => undefined,
  });
  assert.equal(pursuitLifecycleMissingProfile.status, 404);

  const pursuitLifecycleMissingPursuit = await handlePublicProfilePursuitLifecycleRequest(postRequest("pursuits/lifecycle", {
    pursuitId: "pursuit-404",
    action: "note_added",
    note: "Sent follow-up.",
  }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => undefined,
  });
  assert.equal(pursuitLifecycleMissingPursuit.status, 404);

  const pursuitLifecycleWrongProfile = await handlePublicProfilePursuitLifecycleRequest(postRequest("pursuits/lifecycle", {
    pursuitId: "pursuit-1",
    action: "note_added",
    note: "Sent follow-up.",
  }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ profileId: "profile-2" }),
  });
  assert.equal(pursuitLifecycleWrongProfile.status, 404);

  const pursuitLifecycleMissingNote = await handlePublicProfilePursuitLifecycleRequest(postRequest("pursuits/lifecycle", {
    pursuitId: "pursuit-1",
    action: "note_added",
  }), {
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => { throw new Error("should not load aggregate on validation error"); },
  });
  assert.equal(pursuitLifecycleMissingNote.status, 400);
  assert.equal((await body(pursuitLifecycleMissingNote)).status, "validation_error");

  let persistedLifecycleNote: unknown;
  const pursuitLifecycleNoteAdded = await handlePublicProfilePursuitLifecycleRequest(postRequest("pursuits/lifecycle", {
    pursuitId: "pursuit-1",
    action: "note_added",
    note: "Sent follow-up.",
  }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit(),
    persistTransition: async (_request, result) => {
      persistedLifecycleNote = result;
    },
  });
  assert.equal(pursuitLifecycleNoteAdded.status, 200);
  const pursuitLifecycleNoteJson = await body(pursuitLifecycleNoteAdded);
  assert.equal(pursuitLifecycleNoteJson.status, "updated");
  assert.equal((pursuitLifecycleNoteJson.pursuit as Record<string, unknown>).status, "saved");
  assert.equal((pursuitLifecycleNoteJson.event as Record<string, unknown>).eventType, "note_added");
  assert.equal(((pursuitLifecycleNoteJson.event as Record<string, unknown>).payload as Record<string, unknown>).note, "Sent follow-up.");
  assert.equal((persistedLifecycleNote as { pursuit: Pursuit }).pursuit.status, "saved");

  const pursuitLifecycleFreshExpired = await handlePublicProfilePursuitLifecycleRequest(postRequest("pursuits/lifecycle", {
    pursuitId: "pursuit-1",
    action: "expired",
  }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ lastActivityAt: "2026-06-01T00:00:00.000Z" }),
  });
  assert.equal(pursuitLifecycleFreshExpired.status, 409);
  assert.equal((await body(pursuitLifecycleFreshExpired)).status, "transition_error");

  let persistedLifecycleExpired: unknown;
  const pursuitLifecycleExpired = await handlePublicProfilePursuitLifecycleRequest(postRequest("pursuits/lifecycle", {
    pursuitId: "pursuit-1",
    action: "expired",
  }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit({ lastActivityAt: "2026-02-01T00:00:00.000Z" }),
    persistTransition: async (_request, result) => {
      persistedLifecycleExpired = result;
    },
  });
  assert.equal(pursuitLifecycleExpired.status, 200);
  const pursuitLifecycleExpiredJson = await body(pursuitLifecycleExpired);
  assert.equal((pursuitLifecycleExpiredJson.pursuit as Record<string, unknown>).status, "expired");
  assert.equal((pursuitLifecycleExpiredJson.event as Record<string, unknown>).eventType, "expired");
  assert.equal((persistedLifecycleExpired as { pursuit: Pursuit }).pursuit.status, "expired");

  let persistedLifecycleDeleted: unknown;
  const pursuitLifecycleDeleted = await handlePublicProfilePursuitLifecycleRequest(postRequest("pursuits/lifecycle", {
    pursuitId: "pursuit-1",
    action: "deleted",
  }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => agg,
    loadPursuit: async () => savedPursuit(),
    persistTransition: async (_request, result) => {
      persistedLifecycleDeleted = result;
    },
  });
  assert.equal(pursuitLifecycleDeleted.status, 200);
  const pursuitLifecycleDeletedJson = await body(pursuitLifecycleDeleted);
  assert.equal((pursuitLifecycleDeletedJson.pursuit as Record<string, unknown>).status, "deleted");
  assert.equal((pursuitLifecycleDeletedJson.event as Record<string, unknown>).eventType, "deleted");
  assert.equal((persistedLifecycleDeleted as { pursuit: Pursuit }).pursuit.status, "deleted");

  // ---- Identity & Search (full GET/PATCH coverage) ----
  const identityView = identitySearchSection(agg);
  const identityGet = await handleIdentitySearchSectionGetRequest(getRequest("identity-search"), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    readIdentitySearch: async () => ({ status: "found", userId: "user-1", section: identityView, profileQuality: completeQuality(), aggregate: agg }),
  });
  assert.equal(identityGet.status, 200);
  assert.deepEqual((await body(identityGet)).section, JSON.parse(JSON.stringify(identityView)));

  const identityGetMissing = await handleIdentitySearchSectionGetRequest(getRequest("identity-search"), {
    getSession: async () => authed(),
    repositoryRequest,
    readIdentitySearch: async () => ({ status: "not_found", userId: "user-1" }),
  });
  assert.equal(identityGetMissing.status, 404);

  const identityPatchValidation = await handleIdentitySearchSectionPatchRequest(patchRequest("identity-search", { remotePreference: "mars" }), {
    getSession: async () => authed(),
    repositoryRequest,
    updateIdentitySearch: async () => ({ status: "validation_error", issues: [{ field: "remotePreference", message: "Invalid remote preference." }] }),
  });
  assert.equal(identityPatchValidation.status, 400);
  assert.equal((await body(identityPatchValidation)).status, "validation_error");

  let identityPatchInput: unknown;
  const identityPatch = await handleIdentitySearchSectionPatchRequest(patchRequest("identity-search", { location: "Boulder, CO" }), {
    now: () => now,
    getSession: async () => authed(),
    repositoryRequest,
    updateIdentitySearch: async (_request, _userId, input) => {
      identityPatchInput = input;
      return { status: "updated", userId: "user-1", section: identityView, profileQuality: completeQuality(), aggregate: agg };
    },
  });
  assert.equal(identityPatch.status, 200);
  assert.deepEqual(identityPatchInput, { location: "Boulder, CO" });
  assert.equal((await body(identityPatch)).profileStatus, "complete");

  const identityPatchMissing = await handleIdentitySearchSectionPatchRequest(patchRequest("identity-search", { location: "Boulder, CO" }), {
    getSession: async () => authed(),
    repositoryRequest,
    updateIdentitySearch: async () => ({ status: "not_found", userId: "user-1" }),
  });
  assert.equal(identityPatchMissing.status, 404);

  // ---- Per-section GET found / PATCH validation / PATCH updated ----
  async function expectGet(response: Response, section: unknown) {
    assert.equal(response.status, 200);
    const b = await body(response);
    assert.equal(b.status, "found");
    assert.equal(b.profileId, "profile-1");
    assert.equal(b.profileStatus, "complete");
    assert.deepEqual(b.section, JSON.parse(JSON.stringify(section)));
  }
  async function expectValidation(response: Response) {
    assert.equal(response.status, 400);
    assert.equal((await body(response)).status, "validation_error");
  }
  async function expectUpdated(response: Response, section: unknown) {
    assert.equal(response.status, 200);
    const b = await body(response);
    assert.equal(b.status, "updated");
    assert.deepEqual(b.section, JSON.parse(JSON.stringify(section)));
  }

  // Fit Signals
  const fitView = fitSignalsSection(agg);
  await expectGet(await handleFitSignalsSectionGetRequest(getRequest("fit-signals"), {
    now: () => now, getSession: async () => authed(), repositoryRequest,
    readFitSignals: async () => ({ status: "found", userId: "user-1", section: fitView, profileQuality: completeQuality(), aggregate: agg }),
  }), fitView);
  await expectValidation(await handleFitSignalsSectionPatchRequest(patchRequest("fit-signals", { goodSignals: "no" }), {
    getSession: async () => authed(), repositoryRequest,
    updateFitSignals: async () => ({ status: "validation_error", issues: [{ field: "goodSignals", message: "bad" }] }),
  }));
  await expectUpdated(await handleFitSignalsSectionPatchRequest(patchRequest("fit-signals", { goodSignals: [], poorFitSignals: [] }), {
    now: () => now, getSession: async () => authed(), repositoryRequest,
    updateFitSignals: async () => ({ status: "updated", userId: "user-1", section: fitView, profileQuality: completeQuality(), aggregate: agg }),
  }), fitView);

  // Role Tracks
  const roleView = roleTracksSection(agg);
  await expectGet(await handleRoleTracksSectionGetRequest(getRequest("role-tracks"), {
    now: () => now, getSession: async () => authed(), repositoryRequest,
    readRoleTracks: async () => ({ status: "found", userId: "user-1", section: roleView, profileQuality: completeQuality(), aggregate: agg }),
  }), roleView);
  await expectValidation(await handleRoleTracksSectionPatchRequest(patchRequest("role-tracks", { roleTracks: [{ id: "" }] }), {
    getSession: async () => authed(), repositoryRequest,
    updateRoleTracks: async () => ({ status: "validation_error", issues: [{ field: "roleTracks.0.id", message: "id is required." }] }),
  }));
  await expectUpdated(await handleRoleTracksSectionPatchRequest(patchRequest("role-tracks", { roleTracks: roleView.roleTracks }), {
    now: () => now, getSession: async () => authed(), repositoryRequest,
    updateRoleTracks: async () => ({ status: "updated", userId: "user-1", section: roleView, profileQuality: completeQuality(), aggregate: agg }),
  }), roleView);

  // Resumes
  const resumeView = resumeUploadsSection(agg);
  await expectGet(await handleResumeUploadsSectionGetRequest(getRequest("resumes"), {
    now: () => now, getSession: async () => authed(), repositoryRequest,
    readResumeUploads: async () => ({ status: "found", userId: "user-1", section: resumeView, profileQuality: completeQuality(), aggregate: agg }),
  }), resumeView);
  await expectValidation(await handleResumeUploadsSectionPatchRequest(patchRequest("resumes", { resumes: [{ id: "" }] }), {
    getSession: async () => authed(), repositoryRequest,
    updateResumeUploads: async () => ({ status: "validation_error", issues: [{ field: "resumes.0.id", message: "id is required." }] }),
  }));
  await expectUpdated(await handleResumeUploadsSectionPatchRequest(patchRequest("resumes", { resumes: resumeView.resumes }), {
    now: () => now, getSession: async () => authed(), repositoryRequest,
    updateResumeUploads: async () => ({ status: "updated", userId: "user-1", section: resumeView, profileQuality: completeQuality(), aggregate: agg }),
  }), resumeView);

  // Work Examples
  const workExampleView = workExamplesSection(agg);
  await expectGet(await handleWorkExamplesSectionGetRequest(getRequest("work-examples"), {
    now: () => now, getSession: async () => authed(), repositoryRequest,
    readWorkExamples: async () => ({ status: "found", userId: "user-1", section: workExampleView, profileQuality: completeQuality(), aggregate: agg }),
  }), workExampleView);
  await expectValidation(await handleWorkExamplesSectionPatchRequest(patchRequest("work-examples", { workExamples: [{ id: "" }] }), {
    getSession: async () => authed(), repositoryRequest,
    updateWorkExamples: async () => ({ status: "validation_error", issues: [{ field: "workExamples.0.title", message: "title is required." }] }),
  }));
  await expectUpdated(await handleWorkExamplesSectionPatchRequest(patchRequest("work-examples", { workExamples: workExampleView.workExamples }), {
    now: () => now, getSession: async () => authed(), repositoryRequest,
    updateWorkExamples: async () => ({ status: "updated", userId: "user-1", section: workExampleView, profileQuality: completeQuality(), aggregate: agg }),
  }), workExampleView);

  // Skills
  const skillsView = skillsInventorySection(agg);
  await expectGet(await handleSkillsInventorySectionGetRequest(getRequest("skills"), {
    now: () => now, getSession: async () => authed(), repositoryRequest,
    readSkillsInventory: async () => ({ status: "found", userId: "user-1", section: skillsView, profileQuality: completeQuality(), aggregate: agg }),
  }), skillsView);
  await expectValidation(await handleSkillsInventorySectionPatchRequest(patchRequest("skills", { skills: [{ id: "" }] }), {
    getSession: async () => authed(), repositoryRequest,
    updateSkillsInventory: async () => ({ status: "validation_error", issues: [{ field: "skills.0.id", message: "id is required." }] }),
  }));
  await expectUpdated(await handleSkillsInventorySectionPatchRequest(patchRequest("skills", { skills: skillsView.skills }), {
    now: () => now, getSession: async () => authed(), repositoryRequest,
    updateSkillsInventory: async () => ({ status: "updated", userId: "user-1", section: skillsView, profileQuality: completeQuality(), aggregate: agg }),
  }), skillsView);

  // Voice & Personality
  const voiceView = voicePersonalitySection(agg);
  await expectGet(await handleVoicePersonalitySectionGetRequest(getRequest("voice-personality"), {
    now: () => now, getSession: async () => authed(), repositoryRequest,
    readVoicePersonality: async () => ({ status: "found", userId: "user-1", section: voiceView, profileQuality: completeQuality(), aggregate: agg }),
  }), voiceView);
  await expectValidation(await handleVoicePersonalitySectionPatchRequest(patchRequest("voice-personality", { toneTags: "no" }), {
    getSession: async () => authed(), repositoryRequest,
    updateVoicePersonality: async () => ({ status: "validation_error", issues: [{ field: "toneTags", message: "bad" }] }),
  }));
  await expectUpdated(await handleVoicePersonalitySectionPatchRequest(patchRequest("voice-personality", voiceView), {
    now: () => now, getSession: async () => authed(), repositoryRequest,
    updateVoicePersonality: async () => ({ status: "updated", userId: "user-1", section: voiceView, profileQuality: completeQuality(), aggregate: agg }),
  }), voiceView);

  // Writing Samples
  const writingView = writingSamplesSection(agg);
  await expectGet(await handleWritingSamplesSectionGetRequest(getRequest("writing-samples"), {
    now: () => now, getSession: async () => authed(), repositoryRequest,
    readWritingSamples: async () => ({ status: "found", userId: "user-1", section: writingView, profileQuality: completeQuality(), aggregate: agg }),
  }), writingView);
  await expectValidation(await handleWritingSamplesSectionPatchRequest(patchRequest("writing-samples", { writingSamples: [{ id: "1", bucket: "love" }] }), {
    getSession: async () => authed(), repositoryRequest,
    updateWritingSamples: async () => ({ status: "validation_error", issues: [{ field: "writingSamples.0.bucket", message: "bad" }] }),
  }));
  await expectUpdated(await handleWritingSamplesSectionPatchRequest(patchRequest("writing-samples", { writingSamples: writingView.writingSamples }), {
    now: () => now, getSession: async () => authed(), repositoryRequest,
    updateWritingSamples: async () => ({ status: "updated", userId: "user-1", section: writingView, profileQuality: completeQuality(), aggregate: agg }),
  }), writingView);

  // Outreach Rules
  const outreachView = outreachRulesSection(agg);
  await expectGet(await handleOutreachRulesSectionGetRequest(getRequest("outreach-rules"), {
    now: () => now, getSession: async () => authed(), repositoryRequest,
    readOutreachRules: async () => ({ status: "found", userId: "user-1", section: outreachView, profileQuality: completeQuality(), aggregate: agg }),
  }), outreachView);
  await expectValidation(await handleOutreachRulesSectionPatchRequest(patchRequest("outreach-rules", { settings: {}, fields: [], roleTrackSpecificRules: [{ id: "x", roleTrackId: "" }] }), {
    getSession: async () => authed(), repositoryRequest,
    updateOutreachRules: async () => ({ status: "validation_error", issues: [{ field: "roleTrackSpecificRules.0.roleTrackId", message: "bad" }] }),
  }));
  await expectUpdated(await handleOutreachRulesSectionPatchRequest(patchRequest("outreach-rules", outreachView), {
    now: () => now, getSession: async () => authed(), repositoryRequest,
    updateOutreachRules: async () => ({ status: "updated", userId: "user-1", section: outreachView, profileQuality: completeQuality(), aggregate: agg }),
  }), outreachView);

  // Leadership Profile
  const leadershipView = leadershipProfileSection(agg);
  await expectGet(await handleLeadershipProfileSectionGetRequest(getRequest("leadership-profile"), {
    now: () => now, getSession: async () => authed(), repositoryRequest,
    readLeadershipProfile: async () => ({ status: "found", userId: "user-1", section: leadershipView, profileQuality: completeQuality(), aggregate: agg }),
  }), leadershipView);
  await expectValidation(await handleLeadershipProfileSectionPatchRequest(patchRequest("leadership-profile", { visible: "yes", fields: [] }), {
    getSession: async () => authed(), repositoryRequest,
    updateLeadershipProfile: async () => ({ status: "validation_error", issues: [{ field: "visible", message: "bad" }] }),
  }));
  await expectUpdated(await handleLeadershipProfileSectionPatchRequest(patchRequest("leadership-profile", { visible: true, fields: [] }), {
    now: () => now, getSession: async () => authed(), repositoryRequest,
    updateLeadershipProfile: async () => ({ status: "updated", userId: "user-1", section: leadershipView, profileQuality: completeQuality(), aggregate: agg }),
  }), leadershipView);

  // ---- Outreach generator ----
  const outreachBody = {
    job: { title: "Program Director", company: "Useful Studio", description: "Lead delivery." },
    contact: { name: "Dana", role: "Hiring Manager" },
  };

  const outreachValidation = await handleOutreachGeneratorRequest(patchRequest("outreach", { job: {}, contact: {} }), {
    getSession: async () => authed(),
    repositoryRequest,
    generateOutreach: async () => { throw new Error("should not generate on validation error"); },
  });
  assert.equal(outreachValidation.status, 400);
  assert.equal((await body(outreachValidation)).status, "validation_error");

  const outreachNotFound = await handleOutreachGeneratorRequest(patchRequest("outreach", outreachBody), {
    getSession: async () => authed(),
    repositoryRequest,
    generateOutreach: async (_request, userId) => ({ status: "not_found", userId }),
  });
  assert.equal(outreachNotFound.status, 404);

  const outreachIncomplete = await handleOutreachGeneratorRequest(patchRequest("outreach", outreachBody), {
    getSession: async () => authed(),
    repositoryRequest,
    generateOutreach: async (_request, userId) => ({ status: "profile_incomplete", userId }),
  });
  assert.equal(outreachIncomplete.status, 409);

  const outreachUnavailable = await handleOutreachGeneratorRequest(patchRequest("outreach", outreachBody), {
    getSession: async () => authed(),
    repositoryRequest,
    generateOutreach: async (_request, userId) => ({ status: "model_unavailable", userId }),
  });
  assert.equal(outreachUnavailable.status, 503);

  let outreachReceived: unknown;
  const outreachGenerated = await handleOutreachGeneratorRequest(patchRequest("outreach", outreachBody), {
    getSession: async () => authed(),
    repositoryRequest,
    generateOutreach: async (_request, userId, parsedBody) => {
      outreachReceived = parsedBody;
      return {
        status: "generated",
        userId,
        outreach: {
          message: "Hi Dana — excited about the Program Director role.",
          insertedExample: { oneHitter: "Cut turnaround 40%.", link: "https://example.com/x" },
        },
      };
    },
  });
  assert.equal(outreachGenerated.status, 200);
  assert.deepEqual(outreachReceived, {
    job: { title: "Program Director", company: "Useful Studio", description: "Lead delivery." },
    contact: { name: "Dana", role: "Hiring Manager", seniority: undefined },
  });
  const outreachJson = await body(outreachGenerated);
  assert.equal(outreachJson.status, "generated");
  assert.match(outreachJson.message as string, /Program Director role/);
  assert.deepEqual(outreachJson.insertedExample, { oneHitter: "Cut turnaround 40%.", link: "https://example.com/x" });

  console.log("public profile api: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

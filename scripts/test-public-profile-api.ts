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
  handlePublicProfileBootstrapRequest,
  handlePublicProfileRegenerationRequest,
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

function getRequest(path: string) {
  return new Request(`https://app.example/api/public-profile/${path}`, { method: "GET" });
}

function patchRequest(path: string, payload: unknown) {
  return new Request(`https://app.example/api/public-profile/${path}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

function incompleteResult(): PublicProfileRegenerationResult {
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

  const agg = completeCandidateProfileAggregate(now);

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

  console.log("public profile api: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

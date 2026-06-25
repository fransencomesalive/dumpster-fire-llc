import assert from "node:assert/strict";
import {
  loadCandidateProfileAggregate,
  mapPublicProfileRows,
  persistCandidateProfileGeneration,
  persistCommunicationStyleSection,
  persistIdentitySearchSection,
  persistLeadershipProfileSection,
  persistOutreachRulesSection,
  persistProofLibrarySection,
  persistQualityNarrativeSection,
  persistResumeUploadsSection,
  persistRoleTracksSection,
  persistSkillsInventorySection,
  persistWorkHistorySection,
  persistWritingSamplesSection,
  type PublicProfileRepositoryRequest,
} from "../lib/public-profile/repository";
import { regenerateCandidateProfileArtifacts } from "../lib/public-profile/profile-generation";
import {
  applyIdentitySearchSectionPatch,
  applyLeadershipProfileSectionPatch,
  applyOutreachRulesSectionPatch,
  applyCommunicationStyleSectionPatch,
  applyProofLibrarySectionPatch,
  applyQualityNarrativeSectionPatch,
  applyResumeUploadsSectionPatch,
  applyRoleTracksSectionPatch,
  applySkillsInventorySectionPatch,
  applyWorkHistorySectionPatch,
  applyWritingSamplesSectionPatch,
} from "../lib/public-profile/sections";

const now = "2026-06-23T14:00:00.000Z";

const profileRow = {
  id: "profile-1",
  user_id: "user-1",
  status: "incomplete",
  version: 2,
  full_name: "Avery Candidate",
  preferred_name: "Avery",
  location: "Denver, CO",
  work_authorization: "US authorized",
  linkedin_url: "https://linkedin.example/avery",
  portfolio_url: "https://portfolio.example",
  personal_website_url: null,
  email: "avery@example.com",
  remote_preference: "remote_preferred",
  target_compensation_min: 140000,
  target_compensation_preferred: 175000,
  availability: "Two weeks",
  generated_markdown: "",
  markdown_generated_at: null,
  created_at: now,
  updated_at: now,
};

const qualityFields = [
  "problemsPeopleBringMe",
  "whatBreaksIfImNotThere",
  "messesICleanUp",
  "teamsThatBenefitFromMe",
  "situationsWhereIAmMostUseful",
  "situationsWhereIAmNotUseful",
].map((fieldKey) => ({
  id: `why-${fieldKey}`,
  profile_id: "profile-1",
  section: "why_people_hire_me",
  field_key: fieldKey,
  value: `Specific ${fieldKey}`,
  quality: "complete",
  feedback: null,
  created_at: now,
  updated_at: now,
}));

function rows() {
  return {
    profile: profileRow,
    preferences: {
      id: "preferences-1",
      profile_id: "profile-1",
      employment_types: ["full_time"],
      target_industries: ["AI"],
      avoid_industries: ["Gambling"],
      target_company_types: ["Product-led"],
      avoid_companies: [],
      created_at: now,
      updated_at: now,
    },
    companyWatchlist: [{
      id: "company-1",
      profile_id: "profile-1",
      company_name: "Useful Studio",
      reason: "Strong workflow fit",
      priority: "high",
      notes: null,
      created_at: now,
      updated_at: now,
    }],
    roleTracks: [{
      id: "track-1",
      profile_id: "profile-1",
      name: "Program Director",
      description: "Leads ambiguous delivery.",
      core_positioning: "Turns messy work into shipped systems.",
      outreach_angle: "Workflow alignment.",
      global_proof_rules: null,
      target_titles: ["Program Director"],
      key_responsibilities: ["Stakeholder alignment"],
      required_experience_patterns: ["Cross-functional programs"],
      strong_job_signals: ["Ambiguous systems work"],
      weak_job_signals: ["Pure scrum ceremony"],
      mismatch_signals: ["Staffing-only delivery"],
      do_not_overclaim: ["Deep platform engineering"],
      created_at: now,
      updated_at: now,
    }],
    resumes: [{
      id: "resume-1",
      profile_id: "profile-1",
      name: "Program Resume",
      file_url: "https://files.example/resume.pdf",
      parsed_text: "Program leadership.",
      strengths: ["Program leadership"],
      gaps: ["No deep engineering management"],
      use_when: ["Program roles"],
      avoid_when: ["Engineering roles"],
      parsing_quality: "complete",
      parsing_issues: [],
      created_at: now,
      updated_at: now,
    }],
    resumeRoleTracks: [{ resume_id: "resume-1", role_track_id: "track-1" }],
    workHistory: [{
      id: "work-1",
      profile_id: "profile-1",
      company: "Studio Co",
      title: "Director of Programs",
      start_date: "2022",
      end_date: null,
      current_role: true,
      responsibilities: ["Led launch operations"],
      accomplishments: [],
      skills: ["Stakeholder leadership"],
      metrics: [],
      source: "resume_parse",
      created_at: now,
      updated_at: now,
    }],
    workHistoryResumes: [{ work_history_item_id: "work-1", resume_id: "resume-1" }],
    projects: [{
      id: "project-1",
      profile_id: "profile-1",
      name: "Phred",
      link: null,
      description: "Internal AI workflow system.",
      candidate_role: "Product and program lead",
      what_this_proves: ["Can orchestrate AI workflow"],
      capabilities_demonstrated: ["Workflow design"],
      key_responsibilities_supported: ["Delivery governance"],
      required_experience_supported: ["Systems thinking"],
      industries_relevant: ["AI"],
      best_used_for: ["AI operations roles"],
      avoid_using_for: ["Pure software engineering"],
      metrics_results: [],
      caveats: ["Not a commercial SaaS"],
      confidence: "high",
      created_at: now,
      updated_at: now,
    }],
    skills: [{
      id: "skill-1",
      profile_id: "profile-1",
      skill_name: "Workflow Strategy",
      proficiency: "expert",
      evidence: ["Phred"],
      best_role_fit: ["Program Director"],
      do_not_overclaim: ["Backend architecture"],
      created_at: now,
      updated_at: now,
    }],
    skillProjects: [{ skill_id: "skill-1", project_proof_id: "project-1" }],
    skillWorkHistory: [{ skill_id: "skill-1", work_history_item_id: "work-1" }],
    qualityFields,
    communicationStyle: {
      id: "communication-1",
      profile_id: "profile-1",
      preferred_tone: ["direct"],
      formality_level: "medium",
      humor_level: "light",
      message_length_preference: "short",
      greeting_preferences: ["Hi first-name"],
      signoff_preferences: ["Thanks"],
      phrases_to_avoid: ["I am excited to apply"],
      phrases_that_sound_like_me: ["Here is the useful bit"],
      created_at: now,
      updated_at: now,
    },
    writingSamples: [{
      id: "sample-1",
      profile_id: "profile-1",
      sample_type: "like",
      channel: "email",
      text: "Short, direct, useful.",
      why_it_works_or_fails: "It gets to the point.",
      created_at: now,
      updated_at: now,
    }],
    outreachRules: {
      id: "rules-1",
      profile_id: "profile-1",
      global_rules: ["No cover-letter posture"],
      follow_up_rules: ["One useful follow-up"],
      link_selection_rules: ["Use Phred for AI workflow roles"],
      created_at: now,
      updated_at: now,
    },
    roleTrackOutreachRules: [{
      id: "track-rule-1",
      role_track_id: "track-1",
      rules: ["Lead with systems proof"],
      preferred_proof_types: ["workflow"],
      avoid_proof_types: ["deep engineering"],
      created_at: now,
      updated_at: now,
    }],
    leadershipProfile: {
      id: "leadership-1",
      profile_id: "profile-1",
      visible: false,
      created_at: now,
      updated_at: now,
    },
    profileQuality: {
      id: "quality-1",
      profile_id: "profile-1",
      status: "incomplete",
      incomplete_reasons: ["Still filling sections"],
      weak_fields: [],
      complete_fields: ["identity.fullName"],
      weak_response_count: 0,
      last_checked_at: now,
    },
  };
}

async function main() {
  const mapped = mapPublicProfileRows(rows() as Parameters<typeof mapPublicProfileRows>[0]);
  assert.equal(mapped.profile.id, "profile-1");
  assert.equal(mapped.profile.preferredName, "Avery");
  assert.equal(mapped.profile.personalWebsiteUrl, undefined);
  assert.equal(mapped.preferences?.employmentTypes[0], "full_time");
  assert.equal(mapped.roleTracks[0].resumeIds[0], "resume-1");
  assert.equal(mapped.resumes[0].associatedRoleTrackIds[0], "track-1");
  assert.equal(mapped.workHistory[0].associatedResumeIds[0], "resume-1");
  assert.equal(mapped.skills[0].relatedProjectIds[0], "project-1");
  assert.equal(mapped.skills[0].relatedWorkHistoryIds[0], "work-1");
  assert.equal(mapped.roleTrackOutreachRules[0].roleTrackId, "track-1");
  assert.equal(mapped.profileQuality?.status, "incomplete");

  const calls: Array<{ table: string; method?: string; query?: string; body?: unknown; headers?: Record<string, string> }> = [];
  const generation = regenerateCandidateProfileArtifacts({
    ...mapped,
    qualityFields: mapped.qualityFields.map((field) => ({
      ...field,
      section: "operating_style",
      fieldKey: "howIApproachProblems",
      value: "Specific.",
      quality: "weak",
    })),
  }, { generatedAt: now, nextVersion: 3 });

  await persistCandidateProfileGeneration(async (table, options) => {
    calls.push({ table, ...options });
    return undefined as never;
  }, generation);

  assert.deepEqual(calls.map((call) => [call.table, call.method]), [
    ["candidate_profiles", "PATCH"],
    ["profile_quality", "POST"],
    ["profile_versions", "POST"],
  ]);
  assert.equal((calls[0].body as { status: string }).status, "incomplete");
  assert.equal(calls[1].query, "?on_conflict=profile_id");
  assert.equal(calls[1].headers?.Prefer, "resolution=merge-duplicates");
  assert.equal((calls[2].body as { version: number }).version, 3);

  const identityCalls: Array<{ table: string; method?: string; query?: string; body?: unknown; headers?: Record<string, string> }> = [];
  const identityUpdate = applyIdentitySearchSectionPatch(mapped, {
    fullName: "Avery Updated",
    preferredName: undefined,
    employmentTypes: ["full_time", "contract"],
    avoidCompanies: ["Bad Co"],
  }, now);
  await persistIdentitySearchSection(async (table, options) => {
    identityCalls.push({ table, ...options });
    return undefined as never;
  }, identityUpdate);
  assert.deepEqual(identityCalls.map((call) => [call.table, call.method]), [
    ["candidate_profiles", "PATCH"],
    ["candidate_profile_preferences", "POST"],
    ["profile_quality", "POST"],
  ]);
  assert.equal((identityCalls[0].body as { full_name: string }).full_name, "Avery Updated");
  assert.equal((identityCalls[0].body as { preferred_name: string | null }).preferred_name, null);
  assert.deepEqual((identityCalls[1].body as { employment_types: string[] }).employment_types, ["full_time", "contract"]);
  assert.deepEqual((identityCalls[1].body as { avoid_companies: string[] }).avoid_companies, ["Bad Co"]);
  assert.equal(identityCalls[1].query, "?on_conflict=profile_id");
  assert.equal(identityCalls[1].headers?.Prefer, "resolution=merge-duplicates");
  assert.equal(identityCalls[2].query, "?on_conflict=profile_id");
  assert.equal(identityCalls[2].headers?.Prefer, "resolution=merge-duplicates");

  const roleTrackCalls: Array<{ table: string; method?: string; query?: string; body?: unknown; headers?: Record<string, string> }> = [];
  const roleTrackUpdate = applyRoleTracksSectionPatch(mapped, {
    roleTracks: [{
      ...mapped.roleTracks[0],
      name: "Updated Program Director",
      resumeIds: ["resume-1"],
    }],
  }, now);
  await persistRoleTracksSection(async (table, options) => {
    roleTrackCalls.push({ table, ...options });
    return undefined as never;
  }, roleTrackUpdate);
  assert.deepEqual(roleTrackCalls.map((call) => [call.table, call.method]), [
    ["candidate_profiles", "PATCH"],
    ["role_tracks", "PATCH"],
    ["role_tracks", "POST"],
    ["resume_role_tracks", "DELETE"],
    ["resume_role_tracks", "POST"],
    ["profile_quality", "POST"],
  ]);
  assert.equal((roleTrackCalls[0].body as { status: string }).status, roleTrackUpdate.profileQuality.status);
  assert.ok(roleTrackCalls[1].query?.includes("archived_at=is.null"));
  assert.equal(roleTrackCalls[2].query, "?on_conflict=id");
  assert.equal(roleTrackCalls[2].headers?.Prefer, "resolution=merge-duplicates");
  assert.equal((roleTrackCalls[2].body as Array<{ name: string }>)[0].name, "Updated Program Director");
  assert.equal(roleTrackCalls[3].query, "?role_track_id=eq.track-1");
  assert.deepEqual((roleTrackCalls[4].body as Array<{ resume_id: string; role_track_id: string }>)[0], {
    resume_id: "resume-1",
    role_track_id: "track-1",
  });
  assert.equal(roleTrackCalls[5].query, "?on_conflict=profile_id");

  const resumeCalls: Array<{ table: string; method?: string; query?: string; body?: unknown; headers?: Record<string, string> }> = [];
  const resumeUpdate = applyResumeUploadsSectionPatch(mapped, {
    resumes: [{
      ...mapped.resumes[0],
      name: "Updated Program Resume",
      associatedRoleTrackIds: ["track-1"],
    }],
  }, now);
  await persistResumeUploadsSection(async (table, options) => {
    resumeCalls.push({ table, ...options });
    return undefined as never;
  }, resumeUpdate);
  assert.deepEqual(resumeCalls.map((call) => [call.table, call.method]), [
    ["candidate_profiles", "PATCH"],
    ["resumes", "PATCH"],
    ["resumes", "POST"],
    ["resume_role_tracks", "DELETE"],
    ["resume_role_tracks", "POST"],
    ["profile_quality", "POST"],
  ]);
  assert.equal((resumeCalls[0].body as { status: string }).status, resumeUpdate.profileQuality.status);
  assert.ok(resumeCalls[1].query?.includes("archived_at=is.null"));
  assert.equal(resumeCalls[2].query, "?on_conflict=id");
  assert.equal(resumeCalls[2].headers?.Prefer, "resolution=merge-duplicates");
  assert.equal((resumeCalls[2].body as Array<{ name: string }>)[0].name, "Updated Program Resume");
  assert.equal(resumeCalls[3].query, "?resume_id=eq.resume-1");
  assert.deepEqual((resumeCalls[4].body as Array<{ resume_id: string; role_track_id: string }>)[0], {
    resume_id: "resume-1",
    role_track_id: "track-1",
  });
  assert.equal(resumeCalls[5].query, "?on_conflict=profile_id");

  const workHistoryCalls: Array<{ table: string; method?: string; query?: string; body?: unknown; headers?: Record<string, string> }> = [];
  const workHistoryUpdate = applyWorkHistorySectionPatch(mapped, {
    workHistory: [{
      ...mapped.workHistory[0],
      title: "Updated Program Director",
      associatedResumeIds: ["resume-1"],
    }],
  }, now);
  await persistWorkHistorySection(async (table, options) => {
    workHistoryCalls.push({ table, ...options });
    return undefined as never;
  }, workHistoryUpdate);
  assert.deepEqual(workHistoryCalls.map((call) => [call.table, call.method]), [
    ["candidate_profiles", "PATCH"],
    ["work_history_items", "DELETE"],
    ["work_history_items", "POST"],
    ["work_history_resumes", "DELETE"],
    ["work_history_resumes", "POST"],
    ["profile_quality", "POST"],
  ]);
  assert.equal((workHistoryCalls[0].body as { status: string }).status, workHistoryUpdate.profileQuality.status);
  assert.ok(workHistoryCalls[1].query?.includes("id=not.in.(work-1)"));
  assert.equal(workHistoryCalls[2].query, "?on_conflict=id");
  assert.equal(workHistoryCalls[2].headers?.Prefer, "resolution=merge-duplicates");
  assert.equal((workHistoryCalls[2].body as Array<{ title: string }>)[0].title, "Updated Program Director");
  assert.equal(workHistoryCalls[3].query, "?work_history_item_id=eq.work-1");
  assert.deepEqual((workHistoryCalls[4].body as Array<{ work_history_item_id: string; resume_id: string }>)[0], {
    work_history_item_id: "work-1",
    resume_id: "resume-1",
  });
  assert.equal(workHistoryCalls[5].query, "?on_conflict=profile_id");

  const proofCalls: Array<{ table: string; method?: string; query?: string; body?: unknown; headers?: Record<string, string> }> = [];
  const proofUpdate = applyProofLibrarySectionPatch(mapped, {
    projects: [{
      ...mapped.projects[0],
      name: "Updated Phred",
      link: undefined,
    }],
  }, now);
  await persistProofLibrarySection(async (table, options) => {
    proofCalls.push({ table, ...options });
    return undefined as never;
  }, proofUpdate);
  assert.deepEqual(proofCalls.map((call) => [call.table, call.method]), [
    ["candidate_profiles", "PATCH"],
    ["project_proofs", "PATCH"],
    ["project_proofs", "POST"],
    ["profile_quality", "POST"],
  ]);
  assert.equal((proofCalls[0].body as { status: string }).status, proofUpdate.profileQuality.status);
  assert.ok(proofCalls[1].query?.includes("archived_at=is.null"));
  assert.equal(proofCalls[2].query, "?on_conflict=id");
  assert.equal(proofCalls[2].headers?.Prefer, "resolution=merge-duplicates");
  assert.equal((proofCalls[2].body as Array<{ name: string; link: string | null }>)[0].name, "Updated Phred");
  assert.equal((proofCalls[2].body as Array<{ name: string; link: string | null }>)[0].link, null);
  assert.equal(proofCalls[3].query, "?on_conflict=profile_id");

  const skillsCalls: Array<{ table: string; method?: string; query?: string; body?: unknown; headers?: Record<string, string> }> = [];
  const skillsUpdate = applySkillsInventorySectionPatch(mapped, {
    skills: [{
      ...mapped.skills[0],
      skillName: "Updated Program Leadership",
      relatedProjectIds: ["project-1"],
      relatedWorkHistoryIds: ["work-1"],
    }],
  }, now);
  await persistSkillsInventorySection(async (table, options) => {
    skillsCalls.push({ table, ...options });
    return undefined as never;
  }, skillsUpdate);
  assert.deepEqual(skillsCalls.map((call) => [call.table, call.method]), [
    ["candidate_profiles", "PATCH"],
    ["skill_profiles", "DELETE"],
    ["skill_profiles", "POST"],
    ["skill_project_proofs", "DELETE"],
    ["skill_project_proofs", "POST"],
    ["skill_work_history_items", "DELETE"],
    ["skill_work_history_items", "POST"],
    ["profile_quality", "POST"],
  ]);
  assert.equal((skillsCalls[0].body as { status: string }).status, skillsUpdate.profileQuality.status);
  assert.ok(skillsCalls[1].query?.includes("id=not.in.(skill-1)"));
  assert.equal(skillsCalls[2].query, "?on_conflict=id");
  assert.equal(skillsCalls[2].headers?.Prefer, "resolution=merge-duplicates");
  assert.equal((skillsCalls[2].body as Array<{ skill_name: string }>)[0].skill_name, "Updated Program Leadership");
  assert.equal(skillsCalls[3].query, "?skill_id=eq.skill-1");
  assert.deepEqual((skillsCalls[4].body as Array<{ skill_id: string; project_proof_id: string }>)[0], {
    skill_id: "skill-1",
    project_proof_id: "project-1",
  });
  assert.equal(skillsCalls[5].query, "?skill_id=eq.skill-1");
  assert.deepEqual((skillsCalls[6].body as Array<{ skill_id: string; work_history_item_id: string }>)[0], {
    skill_id: "skill-1",
    work_history_item_id: "work-1",
  });
  assert.equal(skillsCalls[7].query, "?on_conflict=profile_id");

  const narrativeCalls: Array<{ table: string; method?: string; query?: string; body?: unknown; headers?: Record<string, string> }> = [];
  const narrativeUpdate = applyQualityNarrativeSectionPatch(mapped, "why_people_hire_me", {
    section: "why_people_hire_me",
    fields: mapped.qualityFields.map((field) => ({
      id: field.id,
      fieldKey: field.fieldKey,
      value: field.fieldKey === "problemsPeopleBringMe" ? "Updated specific problem." : field.value,
      quality: field.quality,
      feedback: field.feedback,
    })),
  }, now);
  await persistQualityNarrativeSection(async (table, options) => {
    narrativeCalls.push({ table, ...options });
    return undefined as never;
  }, narrativeUpdate);
  assert.deepEqual(narrativeCalls.map((call) => [call.table, call.method]), [
    ["candidate_profiles", "PATCH"],
    ["quality_scored_text_fields", "DELETE"],
    ["quality_scored_text_fields", "POST"],
    ["profile_quality", "POST"],
  ]);
  assert.equal((narrativeCalls[0].body as { status: string }).status, narrativeUpdate.profileQuality.status);
  assert.equal(narrativeCalls[1].query, "?profile_id=eq.profile-1&section=eq.why_people_hire_me");
  assert.equal(narrativeCalls[2].query, "?on_conflict=profile_id,section,field_key");
  assert.equal(narrativeCalls[2].headers?.Prefer, "resolution=merge-duplicates");
  assert.equal((narrativeCalls[2].body as Array<{ field_key: string; value: string }>)[0].field_key, "problemsPeopleBringMe");
  assert.equal((narrativeCalls[2].body as Array<{ field_key: string; value: string }>)[0].value, "Updated specific problem.");
  assert.equal(narrativeCalls[3].query, "?on_conflict=profile_id");

  const communicationFields = [
    "voiceDescription",
    "whatIShouldSoundLike",
    "whatIShouldNeverSoundLike",
  ].map((fieldKey) => ({
    id: `communication-${fieldKey}`,
    profileId: "profile-1",
    section: "communication_style" as const,
    fieldKey,
    value: `Specific ${fieldKey}`,
    quality: "complete" as const,
    createdAt: now,
    updatedAt: now,
  }));
  const communicationCalls: Array<{ table: string; method?: string; query?: string; body?: unknown; headers?: Record<string, string> }> = [];
  const communicationUpdate = applyCommunicationStyleSectionPatch({
    ...mapped,
    qualityFields: [
      ...mapped.qualityFields,
      ...communicationFields,
    ],
  }, {
    settings: {
      ...mapped.communicationStyle!,
      preferredTone: ["Direct", "Warm"],
      phrasesToAvoid: ["rockstar", "ninja"],
    },
    fields: communicationFields.map((field) => ({
      id: field.id,
      fieldKey: field.fieldKey,
      value: field.fieldKey === "voiceDescription" ? "Updated voice." : field.value,
      quality: field.quality,
    })),
  }, now);
  await persistCommunicationStyleSection(async (table, options) => {
    communicationCalls.push({ table, ...options });
    return undefined as never;
  }, communicationUpdate);
  assert.deepEqual(communicationCalls.map((call) => [call.table, call.method]), [
    ["candidate_profiles", "PATCH"],
    ["communication_style_settings", "POST"],
    ["quality_scored_text_fields", "DELETE"],
    ["quality_scored_text_fields", "POST"],
    ["profile_quality", "POST"],
  ]);
  assert.equal((communicationCalls[0].body as { status: string }).status, communicationUpdate.profileQuality.status);
  assert.equal(communicationCalls[1].query, "?on_conflict=profile_id");
  assert.equal(communicationCalls[1].headers?.Prefer, "resolution=merge-duplicates");
  assert.deepEqual((communicationCalls[1].body as { preferred_tone: string[] }).preferred_tone, ["Direct", "Warm"]);
  assert.deepEqual((communicationCalls[1].body as { phrases_to_avoid: string[] }).phrases_to_avoid, ["rockstar", "ninja"]);
  assert.equal(communicationCalls[2].query, "?profile_id=eq.profile-1&section=eq.communication_style");
  assert.equal(communicationCalls[3].query, "?on_conflict=profile_id,section,field_key");
  assert.equal((communicationCalls[3].body as Array<{ field_key: string; value: string }>)[0].field_key, "voiceDescription");
  assert.equal((communicationCalls[3].body as Array<{ field_key: string; value: string }>)[0].value, "Updated voice.");
  assert.equal(communicationCalls[4].query, "?on_conflict=profile_id");

  const writingSampleCalls: Array<{ table: string; method?: string; query?: string; body?: unknown; headers?: Record<string, string> }> = [];
  const writingSamplesUpdate = applyWritingSamplesSectionPatch(mapped, {
    writingSamples: [{
      ...mapped.writingSamples[0],
      text: "Updated short, direct sample.",
    }, {
      id: "sample-hate-1",
      profileId: "profile-1",
      sampleType: "hate",
      channel: "linkedin",
      text: "Excited to announce synergy.",
      whyItWorksOrFails: "Too generic.",
      createdAt: now,
      updatedAt: now,
    }],
  }, now);
  await persistWritingSamplesSection(async (table, options) => {
    writingSampleCalls.push({ table, ...options });
    return undefined as never;
  }, writingSamplesUpdate);
  assert.deepEqual(writingSampleCalls.map((call) => [call.table, call.method]), [
    ["candidate_profiles", "PATCH"],
    ["writing_samples", "DELETE"],
    ["writing_samples", "POST"],
    ["profile_quality", "POST"],
  ]);
  assert.equal((writingSampleCalls[0].body as { status: string }).status, writingSamplesUpdate.profileQuality.status);
  assert.ok(writingSampleCalls[1].query?.includes("id=not.in.(sample-1,sample-hate-1)"));
  assert.equal(writingSampleCalls[2].query, "?on_conflict=id");
  assert.equal(writingSampleCalls[2].headers?.Prefer, "resolution=merge-duplicates");
  assert.equal((writingSampleCalls[2].body as Array<{ text: string }>)[0].text, "Updated short, direct sample.");
  assert.equal(writingSampleCalls[3].query, "?on_conflict=profile_id");

  const outreachFields = [
    "hiringManagerApproach",
    "recruiterApproach",
    "functionalLeaderApproach",
    "executiveSponsorApproach",
    "noContactRoutingApproach",
  ].map((fieldKey) => ({
    id: `outreach-${fieldKey}`,
    profileId: "profile-1",
    section: "outreach_rules" as const,
    fieldKey,
    value: `Specific ${fieldKey}`,
    quality: "complete" as const,
    createdAt: now,
    updatedAt: now,
  }));
  const outreachCalls: Array<{ table: string; method?: string; query?: string; body?: unknown; headers?: Record<string, string> }> = [];
  const outreachUpdate = applyOutreachRulesSectionPatch({
    ...mapped,
    qualityFields: [
      ...mapped.qualityFields,
      ...outreachFields,
    ],
  }, {
    settings: {
      ...mapped.outreachRules!,
      globalRules: ["Be specific.", "Lead with proof."],
    },
    fields: outreachFields.map((field) => ({
      id: field.id,
      fieldKey: field.fieldKey,
      value: field.fieldKey === "hiringManagerApproach" ? "Updated approach." : field.value,
      quality: field.quality,
    })),
    roleTrackSpecificRules: [{
      id: "track-rule-2",
      roleTrackId: "track-1",
      rules: ["Lead with systems proof"],
      preferredProofTypes: ["workflow"],
      avoidProofTypes: ["deep engineering"],
    }],
  }, now);
  await persistOutreachRulesSection(async (table, options) => {
    outreachCalls.push({ table, ...options });
    return undefined as never;
  }, outreachUpdate);
  assert.deepEqual(outreachCalls.map((call) => [call.table, call.method]), [
    ["candidate_profiles", "PATCH"],
    ["outreach_rule_sets", "POST"],
    ["quality_scored_text_fields", "DELETE"],
    ["quality_scored_text_fields", "POST"],
    ["role_track_outreach_rules", "DELETE"],
    ["role_track_outreach_rules", "POST"],
    ["profile_quality", "POST"],
  ]);
  assert.equal((outreachCalls[0].body as { status: string }).status, outreachUpdate.profileQuality.status);
  assert.equal(outreachCalls[1].query, "?on_conflict=profile_id");
  assert.deepEqual((outreachCalls[1].body as { global_rules: string[] }).global_rules, ["Be specific.", "Lead with proof."]);
  assert.equal(outreachCalls[2].query, "?profile_id=eq.profile-1&section=eq.outreach_rules");
  assert.equal((outreachCalls[3].body as Array<{ field_key: string; value: string }>)[0].field_key, "hiringManagerApproach");
  assert.equal((outreachCalls[3].body as Array<{ field_key: string; value: string }>)[0].value, "Updated approach.");
  assert.equal(outreachCalls[4].query, "?role_track_id=in.(track-1)&id=not.in.(track-rule-2)");
  assert.equal((outreachCalls[5].body as Array<{ role_track_id: string; rules: string[] }>)[0].role_track_id, "track-1");
  assert.deepEqual((outreachCalls[5].body as Array<{ role_track_id: string; rules: string[] }>)[0].rules, ["Lead with systems proof"]);
  assert.equal(outreachCalls[6].query, "?on_conflict=profile_id");

  const leadershipCalls: Array<{ table: string; method?: string; query?: string; body?: unknown; headers?: Record<string, string> }> = [];
  const leadershipUpdate = applyLeadershipProfileSectionPatch(mapped, {
    visible: true,
    fields: [{
      id: "leadership-style",
      fieldKey: "leadershipStyle",
      value: "Calm operator in messy systems.",
      quality: "complete",
    }],
  }, now);
  await persistLeadershipProfileSection(async (table, options) => {
    leadershipCalls.push({ table, ...options });
    return undefined as never;
  }, leadershipUpdate);
  assert.deepEqual(leadershipCalls.map((call) => [call.table, call.method]), [
    ["candidate_profiles", "PATCH"],
    ["leadership_profiles", "POST"],
    ["quality_scored_text_fields", "DELETE"],
    ["quality_scored_text_fields", "POST"],
    ["profile_quality", "POST"],
  ]);
  assert.equal((leadershipCalls[0].body as { status: string }).status, leadershipUpdate.profileQuality.status);
  assert.equal(leadershipCalls[1].query, "?on_conflict=profile_id");
  assert.equal((leadershipCalls[1].body as { visible: boolean }).visible, true);
  assert.equal(leadershipCalls[2].query, "?profile_id=eq.profile-1&section=eq.leadership_profile");
  assert.equal((leadershipCalls[3].body as Array<{ field_key: string; value: string }>)[0].field_key, "leadershipStyle");
  assert.equal((leadershipCalls[3].body as Array<{ field_key: string; value: string }>)[0].value, "Calm operator in messy systems.");
  assert.equal(leadershipCalls[4].query, "?on_conflict=profile_id");

  const freshRows = rows();
  const tableRows: Record<string, unknown[]> = {
    candidate_profiles: [profileRow],
    candidate_profile_preferences: [freshRows.preferences],
    company_watchlist_items: freshRows.companyWatchlist,
    role_tracks: freshRows.roleTracks,
    resumes: freshRows.resumes,
    work_history_items: freshRows.workHistory,
    project_proofs: freshRows.projects,
    skill_profiles: freshRows.skills,
    quality_scored_text_fields: freshRows.qualityFields,
    communication_style_settings: [freshRows.communicationStyle],
    writing_samples: freshRows.writingSamples,
    outreach_rule_sets: [freshRows.outreachRules],
    leadership_profiles: [freshRows.leadershipProfile],
    profile_quality: [freshRows.profileQuality],
    resume_role_tracks: freshRows.resumeRoleTracks,
    work_history_resumes: freshRows.workHistoryResumes,
    skill_project_proofs: freshRows.skillProjects,
    skill_work_history_items: freshRows.skillWorkHistory,
    role_track_outreach_rules: freshRows.roleTrackOutreachRules,
  };
  const fakeRequest: PublicProfileRepositoryRequest = async (table) => tableRows[table] as never;
  const loaded = await loadCandidateProfileAggregate(fakeRequest, "user-1");
  assert.equal(loaded?.profile.id, "profile-1");
  assert.equal(loaded?.roleTracks[0].resumeIds[0], "resume-1");

  console.log("public profile repository: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

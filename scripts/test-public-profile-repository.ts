import assert from "node:assert/strict";
import {
  loadCandidateProfileAggregate,
  mapPublicProfileRows,
  persistCandidateProfileGeneration,
  persistFitSignalsSection,
  persistIdentitySearchSection,
  persistLeadershipProfileSection,
  persistOutreachRulesSection,
  persistResumeUploadsSection,
  persistRoleTracksSection,
  persistSkillsInventorySection,
  persistVoicePersonalitySection,
  persistWorkExamplesSection,
  persistWritingSamplesSection,
  type PublicProfileRepositoryRequest,
} from "../lib/public-profile/repository";
import { regenerateCandidateProfileArtifacts } from "../lib/public-profile/profile-generation";
import {
  applyFitSignalsSectionPatch,
  applyIdentitySearchSectionPatch,
  applyLeadershipProfileSectionPatch,
  applyOutreachRulesSectionPatch,
  applyResumeUploadsSectionPatch,
  applyRoleTracksSectionPatch,
  applySkillsInventorySectionPatch,
  applyVoicePersonalitySectionPatch,
  applyWorkExamplesSectionPatch,
  applyWritingSamplesSectionPatch,
} from "../lib/public-profile/sections";

const now = "2026-06-23T14:00:00.000Z";

type Call = { table: string; method?: string; query?: string; body?: unknown; headers?: Record<string, string> };

const profileRow = {
  id: "profile-1",
  user_id: "user-1",
  status: "incomplete",
  version: 2,
  full_name: "Avery Candidate",
  preferred_name: "Avery",
  location: "Denver, CO",
  email: "avery@example.com",
  remote_preference: "remote_preferred",
  target_compensation_min: 140000,
  target_compensation_preferred: 175000,
  // PostgREST can serialize numeric columns as strings — the mapper must coerce.
  target_compensation_hourly_min: "72.50",
  target_compensation_hourly_preferred: 85,
  generated_markdown: "",
  markdown_generated_at: null,
  created_at: now,
  updated_at: now,
};

const qualityFields = [
  "hiringManagerApproach",
  "recruiterApproach",
  "functionalLeaderApproach",
  "executiveSponsorApproach",
  "noContactRoutingApproach",
].map((fieldKey) => ({
  id: `outreach-${fieldKey}`,
  profile_id: "profile-1",
  section: "outreach_rules",
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
      created_at: now,
      updated_at: now,
    }],
    resumes: [{
      id: "resume-1",
      profile_id: "profile-1",
      name: "Program Resume",
      file_url: "https://files.example/resume.pdf",
      parsed_text: "Program leadership.",
      highlights: ["Cut release cycle time 40% at Acme Robotics"],
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
    fitSignals: {
      id: "fit-1",
      profile_id: "profile-1",
      good_signals: ["Ambiguous systems work"],
      poor_fit_signals: ["Staffing-only delivery"],
      created_at: now,
      updated_at: now,
    },
    workExamples: [{
      id: "example-1",
      profile_id: "profile-1",
      title: "Phred",
      one_hitter: "Cut workflow turnaround 40%.",
      link: null,
      context: "Internal AI workflow system.",
      created_at: now,
      updated_at: now,
    }],
    skills: [{
      id: "skill-1",
      profile_id: "profile-1",
      skill_name: "Workflow Strategy",
      proficiency: "expert",
      evidence: ["Phred"],
      created_at: now,
      updated_at: now,
    }],
    skillWorkExamples: [{ skill_id: "skill-1", work_example_id: "example-1" }],
    qualityFields,
    voicePersonality: {
      id: "voice-1",
      profile_id: "profile-1",
      q1_value: "Untangling messy delivery and shipping the fix.",
      q4_opinion: "Most program management is theater.",
      tone_tags: ["direct", "no-fluff"],
      avoid_tags: ["Corporate Jargon"],
      avoid_note: "No synergy.",
      created_at: now,
      updated_at: now,
    },
    writingSamples: [{
      id: "sample-1",
      profile_id: "profile-1",
      bucket: "sounds_like_me",
      channel: "email",
      text: "Short, direct, useful.",
      tags: ["direct"],
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
  assert.equal(mapped.profile.targetCompensationHourlyMin, 72.5);
  assert.equal(mapped.profile.targetCompensationHourlyPreferred, 85);
  assert.equal(mapped.preferences?.employmentTypes[0], "full_time");
  assert.equal(mapped.roleTracks[0].resumeIds[0], "resume-1");
  assert.equal(mapped.resumes[0].associatedRoleTrackIds[0], "track-1");
  assert.equal(mapped.fitSignals?.goodSignals[0], "Ambiguous systems work");
  assert.equal(mapped.workExamples[0].oneHitter, "Cut workflow turnaround 40%.");
  assert.equal(mapped.skills[0].relatedWorkExampleIds[0], "example-1");
  assert.equal(mapped.voicePersonality?.q1Value, "Untangling messy delivery and shipping the fix.");
  assert.equal(mapped.writingSamples[0].bucket, "sounds_like_me");
  assert.equal(mapped.roleTrackOutreachRules[0].roleTrackId, "track-1");
  assert.equal(mapped.profileQuality?.status, "incomplete");

  const calls: Call[] = [];
  const generation = regenerateCandidateProfileArtifacts({
    ...mapped,
    qualityFields: mapped.qualityFields.map((field) => ({ ...field, quality: "weak" })),
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

  const identityCalls: Call[] = [];
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

  const fitSignalsCalls: Call[] = [];
  const fitSignalsUpdate = applyFitSignalsSectionPatch(mapped, {
    id: mapped.fitSignals?.id,
    goodSignals: ["Ambiguous systems work", "Strong product partner"],
    poorFitSignals: ["Staffing-only delivery"],
  }, now);
  await persistFitSignalsSection(async (table, options) => {
    fitSignalsCalls.push({ table, ...options });
    return undefined as never;
  }, fitSignalsUpdate);
  assert.deepEqual(fitSignalsCalls.map((call) => [call.table, call.method]), [
    ["candidate_profiles", "PATCH"],
    ["fit_signals", "POST"],
    ["profile_quality", "POST"],
  ]);
  assert.equal(fitSignalsCalls[1].query, "?on_conflict=profile_id");
  assert.deepEqual((fitSignalsCalls[1].body as { good_signals: string[] }).good_signals, ["Ambiguous systems work", "Strong product partner"]);

  const roleTrackCalls: Call[] = [];
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
  assert.ok(roleTrackCalls[1].query?.includes("archived_at=is.null"));
  assert.equal((roleTrackCalls[2].body as Array<{ name: string }>)[0].name, "Updated Program Director");
  assert.equal(roleTrackCalls[3].query, "?role_track_id=eq.track-1");

  const resumeCalls: Call[] = [];
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
  assert.equal((resumeCalls[2].body as Array<{ name: string }>)[0].name, "Updated Program Resume");

  const workExampleCalls: Call[] = [];
  const workExampleUpdate = applyWorkExamplesSectionPatch(mapped, {
    workExamples: [{
      ...mapped.workExamples[0],
      title: "Updated Phred",
      link: undefined,
    }],
  }, now);
  await persistWorkExamplesSection(async (table, options) => {
    workExampleCalls.push({ table, ...options });
    return undefined as never;
  }, workExampleUpdate);
  assert.deepEqual(workExampleCalls.map((call) => [call.table, call.method]), [
    ["candidate_profiles", "PATCH"],
    ["work_examples", "DELETE"],
    ["work_examples", "POST"],
    ["profile_quality", "POST"],
  ]);
  assert.ok(workExampleCalls[1].query?.includes("id=not.in.(example-1)"));
  assert.equal((workExampleCalls[2].body as Array<{ title: string; link: string | null }>)[0].title, "Updated Phred");
  assert.equal((workExampleCalls[2].body as Array<{ title: string; link: string | null }>)[0].link, null);

  const skillsCalls: Call[] = [];
  const skillsUpdate = applySkillsInventorySectionPatch(mapped, {
    skills: [{
      ...mapped.skills[0],
      skillName: "Updated Program Leadership",
      relatedWorkExampleIds: ["example-1"],
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
    ["skill_work_examples", "DELETE"],
    ["skill_work_examples", "POST"],
    ["profile_quality", "POST"],
  ]);
  assert.equal((skillsCalls[2].body as Array<{ skill_name: string }>)[0].skill_name, "Updated Program Leadership");
  assert.equal(skillsCalls[3].query, "?skill_id=eq.skill-1");
  assert.deepEqual((skillsCalls[4].body as Array<{ skill_id: string; work_example_id: string }>)[0], {
    skill_id: "skill-1",
    work_example_id: "example-1",
  });

  const voiceCalls: Call[] = [];
  const voiceUpdate = applyVoicePersonalitySectionPatch(mapped, {
    id: mapped.voicePersonality?.id,
    q1Value: "Updated value.",
    q4Opinion: mapped.voicePersonality!.q4Opinion,
    toneTags: ["direct", "no-fluff"],
    avoidTags: ["Corporate Jargon", "LinkedIn malarky"],
    avoidNote: "No synergy.",
  }, now);
  await persistVoicePersonalitySection(async (table, options) => {
    voiceCalls.push({ table, ...options });
    return undefined as never;
  }, voiceUpdate);
  assert.deepEqual(voiceCalls.map((call) => [call.table, call.method]), [
    ["candidate_profiles", "PATCH"],
    ["voice_personality", "POST"],
    ["profile_quality", "POST"],
  ]);
  assert.equal(voiceCalls[1].query, "?on_conflict=profile_id");
  assert.equal((voiceCalls[1].body as { q1_value: string }).q1_value, "Updated value.");
  assert.deepEqual((voiceCalls[1].body as { avoid_tags: string[] }).avoid_tags, ["Corporate Jargon", "LinkedIn malarky"]);

  const writingSampleCalls: Call[] = [];
  const writingSamplesUpdate = applyWritingSamplesSectionPatch(mapped, {
    writingSamples: [{
      ...mapped.writingSamples[0],
      text: "Updated short, direct sample.",
    }, {
      id: "sample-never-1",
      profileId: "profile-1",
      bucket: "never_sound",
      channel: "linkedin",
      text: "Excited to announce synergy.",
      tags: [],
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
  // New items get server-minted UUIDs: the client id "sample-never-1" is never honored.
  const writingSampleKeepQuery = writingSampleCalls[1].query ?? "";
  assert.ok(writingSampleKeepQuery.includes("id=not.in.(sample-1,"));
  assert.ok(!writingSampleKeepQuery.includes("sample-never-1"));
  const mintedSampleId = writingSamplesUpdate.aggregate.writingSamples[1].id;
  assert.match(mintedSampleId, /^[0-9a-f-]{36}$/);
  assert.ok(writingSampleKeepQuery.includes(mintedSampleId));
  assert.equal((writingSampleCalls[2].body as Array<{ text: string }>)[0].text, "Updated short, direct sample.");
  assert.equal((writingSampleCalls[2].body as Array<{ bucket: string }>)[1].bucket, "never_sound");

  const outreachCalls: Call[] = [];
  const outreachUpdate = applyOutreachRulesSectionPatch(mapped, {
    settings: {
      ...mapped.outreachRules!,
      globalRules: ["Be specific.", "Lead with proof."],
    },
    fields: mapped.qualityFields.map((field) => ({
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
  assert.deepEqual((outreachCalls[1].body as { global_rules: string[] }).global_rules, ["Be specific.", "Lead with proof."]);
  assert.equal(outreachCalls[2].query, "?profile_id=eq.profile-1&section=eq.outreach_rules");
  // The new rule's client id is replaced with a server-minted UUID.
  const mintedRuleId = outreachUpdate.aggregate.roleTrackOutreachRules
    .map((rule) => rule.id)
    .find((id) => id !== "track-rule-1");
  assert.ok(mintedRuleId && /^[0-9a-f-]{36}$/.test(mintedRuleId));
  assert.equal(outreachCalls[4].query, `?role_track_id=in.(track-1)&id=not.in.(${mintedRuleId})`);
  assert.equal((outreachCalls[5].body as Array<{ role_track_id: string }>)[0].role_track_id, "track-1");

  const leadershipCalls: Call[] = [];
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
  assert.equal((leadershipCalls[1].body as { visible: boolean }).visible, true);
  assert.equal(leadershipCalls[2].query, "?profile_id=eq.profile-1&section=eq.leadership_profile");
  assert.equal((leadershipCalls[3].body as Array<{ field_key: string }>)[0].field_key, "leadershipStyle");

  const freshRows = rows();
  const tableRows: Record<string, unknown[]> = {
    candidate_profiles: [profileRow],
    candidate_profile_preferences: [freshRows.preferences],
    company_watchlist_items: freshRows.companyWatchlist,
    role_tracks: freshRows.roleTracks,
    resumes: freshRows.resumes,
    fit_signals: [freshRows.fitSignals],
    work_examples: freshRows.workExamples,
    skill_profiles: freshRows.skills,
    quality_scored_text_fields: freshRows.qualityFields,
    voice_personality: [freshRows.voicePersonality],
    writing_samples: freshRows.writingSamples,
    outreach_rule_sets: [freshRows.outreachRules],
    leadership_profiles: [freshRows.leadershipProfile],
    profile_quality: [freshRows.profileQuality],
    resume_role_tracks: freshRows.resumeRoleTracks,
    skill_work_examples: freshRows.skillWorkExamples,
    role_track_outreach_rules: freshRows.roleTrackOutreachRules,
  };
  const fakeRequest: PublicProfileRepositoryRequest = async (table) => tableRows[table] as never;
  const loaded = await loadCandidateProfileAggregate(fakeRequest, "user-1");
  assert.equal(loaded?.profile.id, "profile-1");
  assert.equal(loaded?.roleTracks[0].resumeIds[0], "resume-1");
  assert.equal(loaded?.workExamples[0].title, "Phred");
  assert.equal(loaded?.voicePersonality?.q1Value, "Untangling messy delivery and shipping the fix.");
  assert.equal(loaded?.skills[0].relatedWorkExampleIds[0], "example-1");

  console.log("public profile repository: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

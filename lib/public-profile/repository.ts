import type {
  CandidateProfileAggregate,
  CandidateProfilePreferences,
  CandidateProfileRecord,
  CommunicationStyleSettings,
  CompanyWatchlistItem,
  ProfileQuality,
  Quality,
  QualityScoredTextField,
  QualitySection,
  RoleTrack,
  RoleTrackOutreachRule,
  WritingSample,
  WorkHistoryItem,
  ProjectProof,
  Resume,
  SkillProfile,
} from "./types";
import type { CandidateProfileGenerationResult } from "./profile-generation";
import { evaluateCandidateProfileQuality } from "./profile-quality";
import type {
  ApplyIdentitySearchSectionResult,
  ApplyCommunicationStyleSectionResult,
  ApplyLeadershipProfileSectionResult,
  ApplyOutreachRulesSectionResult,
  ApplyProofLibrarySectionResult,
  ApplyQualityNarrativeSectionResult,
  ApplyResumeUploadsSectionResult,
  ApplyRoleTracksSectionResult,
  ApplySkillsInventorySectionResult,
  ApplyWorkHistorySectionResult,
  ApplyWritingSamplesSectionResult,
} from "./sections";

export type PublicProfileRepositoryConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

export type PublicProfileRepositoryRequest = <T>(
  table: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    query?: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
) => Promise<T>;

type CandidateProfileRow = {
  id: string;
  user_id: string;
  status: CandidateProfileRecord["status"];
  version: number;
  full_name: string;
  preferred_name: string | null;
  location: string;
  work_authorization: string;
  linkedin_url: string | null;
  portfolio_url: string | null;
  personal_website_url: string | null;
  email: string | null;
  remote_preference: CandidateProfileRecord["remotePreference"];
  target_compensation_min: number | null;
  target_compensation_preferred: number | null;
  availability: string;
  generated_markdown: string;
  markdown_generated_at: string | null;
  created_at: string;
  updated_at: string;
};

type PreferencesRow = {
  id: string;
  profile_id: string;
  employment_types: CandidateProfilePreferences["employmentTypes"];
  target_industries: string[];
  avoid_industries: string[];
  target_company_types: string[];
  avoid_companies: string[];
  created_at: string;
  updated_at: string;
};

type CompanyWatchlistRow = {
  id: string;
  profile_id: string;
  company_name: string;
  reason: string;
  priority: CompanyWatchlistItem["priority"];
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type RoleTrackRow = {
  id: string;
  profile_id: string;
  name: string;
  description: string;
  core_positioning: string;
  outreach_angle: string;
  global_proof_rules: string | null;
  target_titles: string[];
  key_responsibilities: string[];
  required_experience_patterns: string[];
  strong_job_signals: string[];
  weak_job_signals: string[];
  mismatch_signals: string[];
  do_not_overclaim: string[];
  created_at: string;
  updated_at: string;
};

type ResumeRow = {
  id: string;
  profile_id: string;
  name: string;
  file_url: string;
  parsed_text: string;
  strengths: string[];
  gaps: string[];
  use_when: string[];
  avoid_when: string[];
  parsing_quality: Resume["parsingQuality"];
  parsing_issues: string[];
  created_at: string;
  updated_at: string;
};

type ResumeRoleTrackRow = {
  resume_id: string;
  role_track_id: string;
};

type WorkHistoryRow = {
  id: string;
  profile_id: string;
  company: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  current_role: boolean;
  responsibilities: string[];
  accomplishments: string[];
  skills: string[];
  metrics: string[];
  source: WorkHistoryItem["source"];
  created_at: string;
  updated_at: string;
};

type WorkHistoryResumeRow = {
  work_history_item_id: string;
  resume_id: string;
};

type ProjectProofRow = {
  id: string;
  profile_id: string;
  name: string;
  link: string | null;
  description: string;
  candidate_role: string;
  what_this_proves: string[];
  capabilities_demonstrated: string[];
  key_responsibilities_supported: string[];
  required_experience_supported: string[];
  industries_relevant: string[];
  best_used_for: string[];
  avoid_using_for: string[];
  metrics_results: string[];
  caveats: string[];
  confidence: ProjectProof["confidence"];
  created_at: string;
  updated_at: string;
};

type SkillRow = {
  id: string;
  profile_id: string;
  skill_name: string;
  proficiency: SkillProfile["proficiency"];
  evidence: string[];
  best_role_fit: string[];
  do_not_overclaim: string[];
  created_at: string;
  updated_at: string;
};

type SkillProjectRow = {
  skill_id: string;
  project_proof_id: string;
};

type SkillWorkHistoryRow = {
  skill_id: string;
  work_history_item_id: string;
};

type QualityFieldRow = {
  id: string;
  profile_id: string;
  section: QualitySection;
  field_key: string;
  value: string;
  quality: Quality;
  feedback: string | null;
  created_at: string;
  updated_at: string;
};

type CommunicationStyleRow = {
  id: string;
  profile_id: string;
  preferred_tone: string[];
  formality_level: CommunicationStyleSettings["formalityLevel"];
  humor_level: CommunicationStyleSettings["humorLevel"];
  message_length_preference: CommunicationStyleSettings["messageLengthPreference"];
  greeting_preferences: string[];
  signoff_preferences: string[];
  phrases_to_avoid: string[];
  phrases_that_sound_like_me: string[];
  created_at: string;
  updated_at: string;
};

type WritingSampleRow = {
  id: string;
  profile_id: string;
  sample_type: WritingSample["sampleType"];
  channel: WritingSample["channel"];
  text: string;
  why_it_works_or_fails: string;
  created_at: string;
  updated_at: string;
};

type OutreachRuleSetRow = {
  id: string;
  profile_id: string;
  global_rules: string[];
  follow_up_rules: string[];
  link_selection_rules: string[];
  created_at: string;
  updated_at: string;
};

type RoleTrackOutreachRuleRow = {
  id: string;
  role_track_id: string;
  rules: string[];
  preferred_proof_types: string[];
  avoid_proof_types: string[];
  created_at: string;
  updated_at: string;
};

type LeadershipProfileRow = {
  id: string;
  profile_id: string;
  visible: boolean;
  created_at: string;
  updated_at: string;
};

type ProfileQualityRow = {
  id: string;
  profile_id: string;
  status: ProfileQuality["status"];
  incomplete_reasons: string[];
  weak_fields: string[];
  complete_fields: string[];
  weak_response_count: number;
  last_checked_at: string;
};

function qs(params: Record<string, string>) {
  return `?${new URLSearchParams(params).toString()}`;
}

function first<T>(rows: T[]) {
  return rows[0];
}

function defined<T>(value: T | null | undefined) {
  return value === null || value === undefined ? undefined : value;
}

function idsByLeft(rows: Array<Record<string, string>>, leftKey: string, rightKey: string) {
  return rows.reduce((map, row) => {
    const left = row[leftKey];
    const right = row[rightKey];
    const values = map.get(left) ?? [];
    values.push(right);
    map.set(left, values);
    return map;
  }, new Map<string, string[]>());
}

export function createPublicProfileRepositoryRequest(
  config: PublicProfileRepositoryConfig,
): PublicProfileRepositoryRequest {
  const baseUrl = config.supabaseUrl.replace(/\/$/, "");

  return async function request<T>(
    table: string,
    options: Parameters<PublicProfileRepositoryRequest>[1],
  ) {
    const response = await fetch(`${baseUrl}/rest/v1/${table}${options.query ?? ""}`, {
      method: options.method ?? "GET",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Supabase ${options.method ?? "GET"} ${table} failed (${response.status}): ${text}`);
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  };
}

export function getPublicProfileRepositoryConfig(env: NodeJS.ProcessEnv = process.env) {
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || "";

  if (!supabaseUrl || !serviceRoleKey) return undefined;
  return { supabaseUrl, serviceRoleKey };
}

export function mapPublicProfileRows(rows: {
  profile: CandidateProfileRow;
  preferences?: PreferencesRow;
  companyWatchlist: CompanyWatchlistRow[];
  roleTracks: RoleTrackRow[];
  resumes: ResumeRow[];
  resumeRoleTracks: ResumeRoleTrackRow[];
  workHistory: WorkHistoryRow[];
  workHistoryResumes: WorkHistoryResumeRow[];
  projects: ProjectProofRow[];
  skills: SkillRow[];
  skillProjects: SkillProjectRow[];
  skillWorkHistory: SkillWorkHistoryRow[];
  qualityFields: QualityFieldRow[];
  communicationStyle?: CommunicationStyleRow;
  writingSamples: WritingSampleRow[];
  outreachRules?: OutreachRuleSetRow;
  roleTrackOutreachRules: RoleTrackOutreachRuleRow[];
  leadershipProfile?: LeadershipProfileRow;
  profileQuality?: ProfileQualityRow;
}): CandidateProfileAggregate {
  const resumeIdsByRoleTrack = idsByLeft(
    rows.resumeRoleTracks.map((row) => ({ left: row.role_track_id, right: row.resume_id })),
    "left",
    "right",
  );
  const roleTrackIdsByResume = idsByLeft(
    rows.resumeRoleTracks.map((row) => ({ left: row.resume_id, right: row.role_track_id })),
    "left",
    "right",
  );
  const resumeIdsByWorkHistory = idsByLeft(
    rows.workHistoryResumes.map((row) => ({ left: row.work_history_item_id, right: row.resume_id })),
    "left",
    "right",
  );
  const projectIdsBySkill = idsByLeft(
    rows.skillProjects.map((row) => ({ left: row.skill_id, right: row.project_proof_id })),
    "left",
    "right",
  );
  const workHistoryIdsBySkill = idsByLeft(
    rows.skillWorkHistory.map((row) => ({ left: row.skill_id, right: row.work_history_item_id })),
    "left",
    "right",
  );

  return {
    profile: {
      id: rows.profile.id,
      userId: rows.profile.user_id,
      status: rows.profile.status,
      version: rows.profile.version,
      fullName: rows.profile.full_name,
      preferredName: defined(rows.profile.preferred_name),
      location: rows.profile.location,
      workAuthorization: rows.profile.work_authorization,
      linkedInUrl: defined(rows.profile.linkedin_url),
      portfolioUrl: defined(rows.profile.portfolio_url),
      personalWebsiteUrl: defined(rows.profile.personal_website_url),
      email: defined(rows.profile.email),
      remotePreference: rows.profile.remote_preference,
      targetCompensationMin: defined(rows.profile.target_compensation_min),
      targetCompensationPreferred: defined(rows.profile.target_compensation_preferred),
      availability: rows.profile.availability,
      generatedMarkdown: rows.profile.generated_markdown,
      markdownGeneratedAt: defined(rows.profile.markdown_generated_at),
      createdAt: rows.profile.created_at,
      updatedAt: rows.profile.updated_at,
    },
    preferences: rows.preferences ? {
      id: rows.preferences.id,
      profileId: rows.preferences.profile_id,
      employmentTypes: rows.preferences.employment_types,
      targetIndustries: rows.preferences.target_industries,
      avoidIndustries: rows.preferences.avoid_industries,
      targetCompanyTypes: rows.preferences.target_company_types,
      avoidCompanies: rows.preferences.avoid_companies,
      createdAt: rows.preferences.created_at,
      updatedAt: rows.preferences.updated_at,
    } : undefined,
    companyWatchlist: rows.companyWatchlist.map((row): CompanyWatchlistItem => ({
      id: row.id,
      profileId: row.profile_id,
      companyName: row.company_name,
      reason: row.reason,
      priority: row.priority,
      notes: defined(row.notes),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    roleTracks: rows.roleTracks.map((row): RoleTrack => ({
      id: row.id,
      profileId: row.profile_id,
      name: row.name,
      description: row.description,
      corePositioning: row.core_positioning,
      outreachAngle: row.outreach_angle,
      globalProofRules: defined(row.global_proof_rules),
      targetTitles: row.target_titles,
      keyResponsibilities: row.key_responsibilities,
      requiredExperiencePatterns: row.required_experience_patterns,
      strongJobSignals: row.strong_job_signals,
      weakJobSignals: row.weak_job_signals,
      mismatchSignals: row.mismatch_signals,
      doNotOverclaim: row.do_not_overclaim,
      resumeIds: resumeIdsByRoleTrack.get(row.id) ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    resumes: rows.resumes.map((row): Resume => ({
      id: row.id,
      profileId: row.profile_id,
      name: row.name,
      fileUrl: row.file_url,
      parsedText: row.parsed_text,
      associatedRoleTrackIds: roleTrackIdsByResume.get(row.id) ?? [],
      strengths: row.strengths,
      gaps: row.gaps,
      useWhen: row.use_when,
      avoidWhen: row.avoid_when,
      parsingQuality: row.parsing_quality,
      parsingIssues: row.parsing_issues,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    workHistory: rows.workHistory.map((row): WorkHistoryItem => ({
      id: row.id,
      profileId: row.profile_id,
      company: row.company,
      title: row.title,
      startDate: defined(row.start_date),
      endDate: defined(row.end_date),
      currentRole: row.current_role,
      responsibilities: row.responsibilities,
      accomplishments: row.accomplishments,
      skills: row.skills,
      metrics: row.metrics,
      associatedResumeIds: resumeIdsByWorkHistory.get(row.id) ?? [],
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    projects: rows.projects.map((row): ProjectProof => ({
      id: row.id,
      profileId: row.profile_id,
      name: row.name,
      link: defined(row.link),
      description: row.description,
      candidateRole: row.candidate_role,
      whatThisProves: row.what_this_proves,
      capabilitiesDemonstrated: row.capabilities_demonstrated,
      keyResponsibilitiesSupported: row.key_responsibilities_supported,
      requiredExperienceSupported: row.required_experience_supported,
      industriesRelevant: row.industries_relevant,
      bestUsedFor: row.best_used_for,
      avoidUsingFor: row.avoid_using_for,
      metricsResults: row.metrics_results,
      caveats: row.caveats,
      confidence: row.confidence,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    skills: rows.skills.map((row): SkillProfile => ({
      id: row.id,
      profileId: row.profile_id,
      skillName: row.skill_name,
      proficiency: row.proficiency,
      evidence: row.evidence,
      relatedProjectIds: projectIdsBySkill.get(row.id) ?? [],
      relatedWorkHistoryIds: workHistoryIdsBySkill.get(row.id) ?? [],
      bestRoleFit: row.best_role_fit,
      doNotOverclaim: row.do_not_overclaim,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    qualityFields: rows.qualityFields.map((row): QualityScoredTextField => ({
      id: row.id,
      profileId: row.profile_id,
      section: row.section,
      fieldKey: row.field_key,
      value: row.value,
      quality: row.quality,
      feedback: defined(row.feedback),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    communicationStyle: rows.communicationStyle ? {
      id: rows.communicationStyle.id,
      profileId: rows.communicationStyle.profile_id,
      preferredTone: rows.communicationStyle.preferred_tone,
      formalityLevel: rows.communicationStyle.formality_level,
      humorLevel: rows.communicationStyle.humor_level,
      messageLengthPreference: rows.communicationStyle.message_length_preference,
      greetingPreferences: rows.communicationStyle.greeting_preferences,
      signoffPreferences: rows.communicationStyle.signoff_preferences,
      phrasesToAvoid: rows.communicationStyle.phrases_to_avoid,
      phrasesThatSoundLikeMe: rows.communicationStyle.phrases_that_sound_like_me,
      createdAt: rows.communicationStyle.created_at,
      updatedAt: rows.communicationStyle.updated_at,
    } : undefined,
    writingSamples: rows.writingSamples.map((row): WritingSample => ({
      id: row.id,
      profileId: row.profile_id,
      sampleType: row.sample_type,
      channel: row.channel,
      text: row.text,
      whyItWorksOrFails: row.why_it_works_or_fails,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    outreachRules: rows.outreachRules ? {
      id: rows.outreachRules.id,
      profileId: rows.outreachRules.profile_id,
      globalRules: rows.outreachRules.global_rules,
      followUpRules: rows.outreachRules.follow_up_rules,
      linkSelectionRules: rows.outreachRules.link_selection_rules,
      createdAt: rows.outreachRules.created_at,
      updatedAt: rows.outreachRules.updated_at,
    } : undefined,
    roleTrackOutreachRules: rows.roleTrackOutreachRules.map((row): RoleTrackOutreachRule => ({
      id: row.id,
      roleTrackId: row.role_track_id,
      rules: row.rules,
      preferredProofTypes: row.preferred_proof_types,
      avoidProofTypes: row.avoid_proof_types,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    leadershipProfile: rows.leadershipProfile ? {
      id: rows.leadershipProfile.id,
      profileId: rows.leadershipProfile.profile_id,
      visible: rows.leadershipProfile.visible,
      createdAt: rows.leadershipProfile.created_at,
      updatedAt: rows.leadershipProfile.updated_at,
    } : undefined,
    profileQuality: rows.profileQuality ? {
      id: rows.profileQuality.id,
      profileId: rows.profileQuality.profile_id,
      status: rows.profileQuality.status,
      incompleteReasons: rows.profileQuality.incomplete_reasons,
      weakFields: rows.profileQuality.weak_fields,
      completeFields: rows.profileQuality.complete_fields,
      weakResponseCount: rows.profileQuality.weak_response_count,
      lastCheckedAt: rows.profileQuality.last_checked_at,
    } : undefined,
  };
}

export async function loadCandidateProfileAggregate(
  request: PublicProfileRepositoryRequest,
  userId: string,
): Promise<CandidateProfileAggregate | undefined> {
  const profile = first(await request<CandidateProfileRow[]>("candidate_profiles", {
    query: qs({ user_id: `eq.${userId}`, limit: "1" }),
  }));
  if (!profile) return undefined;

  const profileQuery = qs({ profile_id: `eq.${profile.id}` });
  const [
    preferences,
    companyWatchlist,
    roleTracks,
    resumes,
    workHistory,
    projects,
    skills,
    qualityFields,
    communicationStyle,
    writingSamples,
    outreachRules,
    leadershipProfile,
    profileQuality,
  ] = await Promise.all([
    request<PreferencesRow[]>("candidate_profile_preferences", { query: qs({ profile_id: `eq.${profile.id}`, limit: "1" }) }),
    request<CompanyWatchlistRow[]>("company_watchlist_items", { query: profileQuery }),
    request<RoleTrackRow[]>("role_tracks", { query: `${profileQuery}&archived_at=is.null` }),
    request<ResumeRow[]>("resumes", { query: `${profileQuery}&archived_at=is.null` }),
    request<WorkHistoryRow[]>("work_history_items", { query: profileQuery }),
    request<ProjectProofRow[]>("project_proofs", { query: `${profileQuery}&archived_at=is.null` }),
    request<SkillRow[]>("skill_profiles", { query: profileQuery }),
    request<QualityFieldRow[]>("quality_scored_text_fields", { query: profileQuery }),
    request<CommunicationStyleRow[]>("communication_style_settings", { query: qs({ profile_id: `eq.${profile.id}`, limit: "1" }) }),
    request<WritingSampleRow[]>("writing_samples", { query: profileQuery }),
    request<OutreachRuleSetRow[]>("outreach_rule_sets", { query: qs({ profile_id: `eq.${profile.id}`, limit: "1" }) }),
    request<LeadershipProfileRow[]>("leadership_profiles", { query: qs({ profile_id: `eq.${profile.id}`, limit: "1" }) }),
    request<ProfileQualityRow[]>("profile_quality", { query: qs({ profile_id: `eq.${profile.id}`, limit: "1" }) }),
  ]);
  const roleTrackIds = roleTracks.map((row) => row.id);
  const resumeIds = resumes.map((row) => row.id);
  const workHistoryIds = workHistory.map((row) => row.id);
  const projectIds = projects.map((row) => row.id);
  const skillIds = skills.map((row) => row.id);
  const [
    resumeRoleTracks,
    workHistoryResumes,
    skillProjects,
    skillWorkHistory,
    roleTrackOutreachRules,
  ] = await Promise.all([
    roleTrackIds.length === 0 ? [] : request<ResumeRoleTrackRow[]>("resume_role_tracks", { query: qs({ role_track_id: `in.(${roleTrackIds.join(",")})` }) }),
    resumeIds.length === 0 || workHistoryIds.length === 0 ? [] : request<WorkHistoryResumeRow[]>("work_history_resumes", { query: qs({ work_history_item_id: `in.(${workHistoryIds.join(",")})` }) }),
    skillIds.length === 0 || projectIds.length === 0 ? [] : request<SkillProjectRow[]>("skill_project_proofs", { query: qs({ skill_id: `in.(${skillIds.join(",")})` }) }),
    skillIds.length === 0 || workHistoryIds.length === 0 ? [] : request<SkillWorkHistoryRow[]>("skill_work_history_items", { query: qs({ skill_id: `in.(${skillIds.join(",")})` }) }),
    roleTrackIds.length === 0 ? [] : request<RoleTrackOutreachRuleRow[]>("role_track_outreach_rules", { query: qs({ role_track_id: `in.(${roleTrackIds.join(",")})` }) }),
  ]);

  return mapPublicProfileRows({
    profile,
    preferences: first(preferences),
    companyWatchlist,
    roleTracks,
    resumes,
    resumeRoleTracks,
    workHistory,
    workHistoryResumes,
    projects,
    skills,
    skillProjects,
    skillWorkHistory,
    qualityFields,
    communicationStyle: first(communicationStyle),
    writingSamples,
    outreachRules: first(outreachRules),
    roleTrackOutreachRules,
    leadershipProfile: first(leadershipProfile),
    profileQuality: first(profileQuality),
  });
}

export async function ensureCandidateProfileAggregate(
  request: PublicProfileRepositoryRequest,
  userId: string,
  options: {
    email?: string;
    checkedAt?: string;
  } = {},
): Promise<CandidateProfileAggregate> {
  const existing = await loadCandidateProfileAggregate(request, userId);
  if (existing) return existing;

  const createdProfiles = await request<CandidateProfileRow[]>("candidate_profiles", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      user_id: userId,
      email: options.email ?? null,
    },
  });
  const profile = first(createdProfiles);
  if (!profile) {
    throw new Error("Candidate profile creation did not return a profile row.");
  }

  await request("candidate_profile_preferences", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      profile_id: profile.id,
      employment_types: [],
      target_industries: [],
      avoid_industries: [],
      target_company_types: [],
      avoid_companies: [],
    },
  });

  const aggregate = await loadCandidateProfileAggregate(request, userId);
  if (!aggregate) {
    throw new Error("Candidate profile creation could not be loaded.");
  }

  const profileQuality = evaluateCandidateProfileQuality(aggregate, options.checkedAt);
  await request("candidate_profiles", {
    method: "PATCH",
    query: qs({ id: `eq.${aggregate.profile.id}` }),
    body: {
      id: aggregate.profile.id,
      status: profileQuality.status,
      updated_at: aggregate.profile.updatedAt,
    },
  });
  await request("profile_quality", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      profile_id: profileQuality.profileId,
      status: profileQuality.status,
      incomplete_reasons: profileQuality.incompleteReasons,
      weak_fields: profileQuality.weakFields,
      complete_fields: profileQuality.completeFields,
      weak_response_count: profileQuality.weakResponseCount,
      last_checked_at: profileQuality.lastCheckedAt,
    },
  });

  return {
    ...aggregate,
    profile: {
      ...aggregate.profile,
      status: profileQuality.status,
    },
    profileQuality,
  };
}

export async function persistCandidateProfileGeneration(
  request: PublicProfileRepositoryRequest,
  generation: CandidateProfileGenerationResult,
) {
  await request("candidate_profiles", {
    method: "PATCH",
    query: qs({ id: `eq.${generation.aggregate.profile.id}` }),
    body: generation.persistenceRows.candidateProfile,
  });
  await request("profile_quality", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: generation.persistenceRows.profileQuality,
  });
  await request("profile_versions", {
    method: "POST",
    body: generation.persistenceRows.profileVersion,
  });
}

export async function persistIdentitySearchSection(
  request: PublicProfileRepositoryRequest,
  result: ApplyIdentitySearchSectionResult,
) {
  const { profile, preferences } = result.aggregate;
  await request("candidate_profiles", {
    method: "PATCH",
    query: qs({ id: `eq.${profile.id}` }),
    body: {
      id: profile.id,
      status: profile.status,
      full_name: profile.fullName,
      preferred_name: profile.preferredName ?? null,
      location: profile.location,
      work_authorization: profile.workAuthorization,
      linkedin_url: profile.linkedInUrl ?? null,
      portfolio_url: profile.portfolioUrl ?? null,
      personal_website_url: profile.personalWebsiteUrl ?? null,
      email: profile.email ?? null,
      remote_preference: profile.remotePreference,
      target_compensation_min: profile.targetCompensationMin ?? null,
      target_compensation_preferred: profile.targetCompensationPreferred ?? null,
      availability: profile.availability,
      updated_at: profile.updatedAt,
    },
  });

  if (preferences) {
    await request("candidate_profile_preferences", {
      method: "POST",
      query: "?on_conflict=profile_id",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: {
        profile_id: preferences.profileId,
        employment_types: preferences.employmentTypes,
        target_industries: preferences.targetIndustries,
        avoid_industries: preferences.avoidIndustries,
        target_company_types: preferences.targetCompanyTypes,
        avoid_companies: preferences.avoidCompanies,
        updated_at: preferences.updatedAt,
      },
    });
  }

  await request("profile_quality", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      profile_id: result.profileQuality.profileId,
      status: result.profileQuality.status,
      incomplete_reasons: result.profileQuality.incompleteReasons,
      weak_fields: result.profileQuality.weakFields,
      complete_fields: result.profileQuality.completeFields,
      weak_response_count: result.profileQuality.weakResponseCount,
      last_checked_at: result.profileQuality.lastCheckedAt,
    },
  });
}

export async function persistRoleTracksSection(
  request: PublicProfileRepositoryRequest,
  result: ApplyRoleTracksSectionResult,
) {
  const { profile, roleTracks } = result.aggregate;
  const activeTrackIds = roleTracks.map((track) => track.id);

  await request("candidate_profiles", {
    method: "PATCH",
    query: qs({ id: `eq.${profile.id}` }),
    body: {
      id: profile.id,
      status: profile.status,
      updated_at: profile.updatedAt,
    },
  });

  if (activeTrackIds.length === 0) {
    await request("role_tracks", {
      method: "PATCH",
      query: `${qs({ profile_id: `eq.${profile.id}` })}&archived_at=is.null`,
      body: {
        archived_at: profile.updatedAt,
        updated_at: profile.updatedAt,
      },
    });
  } else {
    await request("role_tracks", {
      method: "PATCH",
      query: `${qs({ profile_id: `eq.${profile.id}` })}&id=not.in.(${activeTrackIds.join(",")})&archived_at=is.null`,
      body: {
        archived_at: profile.updatedAt,
        updated_at: profile.updatedAt,
      },
    });
    await request("role_tracks", {
      method: "POST",
      query: "?on_conflict=id",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: roleTracks.map((track) => ({
        id: track.id,
        profile_id: track.profileId,
        name: track.name,
        description: track.description,
        core_positioning: track.corePositioning,
        outreach_angle: track.outreachAngle,
        global_proof_rules: track.globalProofRules ?? null,
        target_titles: track.targetTitles,
        key_responsibilities: track.keyResponsibilities,
        required_experience_patterns: track.requiredExperiencePatterns,
        strong_job_signals: track.strongJobSignals,
        weak_job_signals: track.weakJobSignals,
        mismatch_signals: track.mismatchSignals,
        do_not_overclaim: track.doNotOverclaim,
        archived_at: null,
        created_at: track.createdAt,
        updated_at: track.updatedAt,
      })),
    });
  }

  for (const track of roleTracks) {
    await request("resume_role_tracks", {
      method: "DELETE",
      query: qs({ role_track_id: `eq.${track.id}` }),
    });

    if (track.resumeIds.length > 0) {
      await request("resume_role_tracks", {
        method: "POST",
        query: "?on_conflict=resume_id,role_track_id",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: track.resumeIds.map((resumeId) => ({
          resume_id: resumeId,
          role_track_id: track.id,
        })),
      });
    }
  }

  await request("profile_quality", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      profile_id: result.profileQuality.profileId,
      status: result.profileQuality.status,
      incomplete_reasons: result.profileQuality.incompleteReasons,
      weak_fields: result.profileQuality.weakFields,
      complete_fields: result.profileQuality.completeFields,
      weak_response_count: result.profileQuality.weakResponseCount,
      last_checked_at: result.profileQuality.lastCheckedAt,
    },
  });
}

export async function persistResumeUploadsSection(
  request: PublicProfileRepositoryRequest,
  result: ApplyResumeUploadsSectionResult,
) {
  const { profile, resumes } = result.aggregate;
  const activeResumeIds = resumes.map((resume) => resume.id);

  await request("candidate_profiles", {
    method: "PATCH",
    query: qs({ id: `eq.${profile.id}` }),
    body: {
      id: profile.id,
      status: profile.status,
      updated_at: profile.updatedAt,
    },
  });

  if (activeResumeIds.length === 0) {
    await request("resumes", {
      method: "PATCH",
      query: `${qs({ profile_id: `eq.${profile.id}` })}&archived_at=is.null`,
      body: {
        archived_at: profile.updatedAt,
        updated_at: profile.updatedAt,
      },
    });
  } else {
    await request("resumes", {
      method: "PATCH",
      query: `${qs({ profile_id: `eq.${profile.id}` })}&id=not.in.(${activeResumeIds.join(",")})&archived_at=is.null`,
      body: {
        archived_at: profile.updatedAt,
        updated_at: profile.updatedAt,
      },
    });
    await request("resumes", {
      method: "POST",
      query: "?on_conflict=id",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: resumes.map((resume) => ({
        id: resume.id,
        profile_id: resume.profileId,
        name: resume.name,
        file_url: resume.fileUrl,
        parsed_text: resume.parsedText,
        strengths: resume.strengths,
        gaps: resume.gaps,
        use_when: resume.useWhen,
        avoid_when: resume.avoidWhen,
        parsing_quality: resume.parsingQuality,
        parsing_issues: resume.parsingIssues,
        archived_at: null,
        created_at: resume.createdAt,
        updated_at: resume.updatedAt,
      })),
    });
  }

  for (const resume of resumes) {
    await request("resume_role_tracks", {
      method: "DELETE",
      query: qs({ resume_id: `eq.${resume.id}` }),
    });

    if (resume.associatedRoleTrackIds.length > 0) {
      await request("resume_role_tracks", {
        method: "POST",
        query: "?on_conflict=resume_id,role_track_id",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: resume.associatedRoleTrackIds.map((roleTrackId) => ({
          resume_id: resume.id,
          role_track_id: roleTrackId,
        })),
      });
    }
  }

  await request("profile_quality", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      profile_id: result.profileQuality.profileId,
      status: result.profileQuality.status,
      incomplete_reasons: result.profileQuality.incompleteReasons,
      weak_fields: result.profileQuality.weakFields,
      complete_fields: result.profileQuality.completeFields,
      weak_response_count: result.profileQuality.weakResponseCount,
      last_checked_at: result.profileQuality.lastCheckedAt,
    },
  });
}

export async function persistWorkHistorySection(
  request: PublicProfileRepositoryRequest,
  result: ApplyWorkHistorySectionResult,
) {
  const { profile, workHistory } = result.aggregate;
  const activeWorkHistoryIds = workHistory.map((item) => item.id);

  await request("candidate_profiles", {
    method: "PATCH",
    query: qs({ id: `eq.${profile.id}` }),
    body: {
      id: profile.id,
      status: profile.status,
      updated_at: profile.updatedAt,
    },
  });

  if (activeWorkHistoryIds.length === 0) {
    await request("work_history_items", {
      method: "DELETE",
      query: qs({ profile_id: `eq.${profile.id}` }),
    });
  } else {
    await request("work_history_items", {
      method: "DELETE",
      query: `${qs({ profile_id: `eq.${profile.id}` })}&id=not.in.(${activeWorkHistoryIds.join(",")})`,
    });
    await request("work_history_items", {
      method: "POST",
      query: "?on_conflict=id",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: workHistory.map((item) => ({
        id: item.id,
        profile_id: item.profileId,
        company: item.company,
        title: item.title,
        start_date: item.startDate ?? null,
        end_date: item.endDate ?? null,
        current_role: item.currentRole,
        responsibilities: item.responsibilities,
        accomplishments: item.accomplishments,
        skills: item.skills,
        metrics: item.metrics,
        source: item.source,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
      })),
    });
  }

  for (const item of workHistory) {
    await request("work_history_resumes", {
      method: "DELETE",
      query: qs({ work_history_item_id: `eq.${item.id}` }),
    });

    if (item.associatedResumeIds.length > 0) {
      await request("work_history_resumes", {
        method: "POST",
        query: "?on_conflict=work_history_item_id,resume_id",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: item.associatedResumeIds.map((resumeId) => ({
          work_history_item_id: item.id,
          resume_id: resumeId,
        })),
      });
    }
  }

  await request("profile_quality", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      profile_id: result.profileQuality.profileId,
      status: result.profileQuality.status,
      incomplete_reasons: result.profileQuality.incompleteReasons,
      weak_fields: result.profileQuality.weakFields,
      complete_fields: result.profileQuality.completeFields,
      weak_response_count: result.profileQuality.weakResponseCount,
      last_checked_at: result.profileQuality.lastCheckedAt,
    },
  });
}

export async function persistProofLibrarySection(
  request: PublicProfileRepositoryRequest,
  result: ApplyProofLibrarySectionResult,
) {
  const { profile, projects } = result.aggregate;
  const activeProjectIds = projects.map((project) => project.id);

  await request("candidate_profiles", {
    method: "PATCH",
    query: qs({ id: `eq.${profile.id}` }),
    body: {
      id: profile.id,
      status: profile.status,
      updated_at: profile.updatedAt,
    },
  });

  if (activeProjectIds.length === 0) {
    await request("project_proofs", {
      method: "PATCH",
      query: `${qs({ profile_id: `eq.${profile.id}` })}&archived_at=is.null`,
      body: {
        archived_at: profile.updatedAt,
        updated_at: profile.updatedAt,
      },
    });
  } else {
    await request("project_proofs", {
      method: "PATCH",
      query: `${qs({ profile_id: `eq.${profile.id}` })}&id=not.in.(${activeProjectIds.join(",")})&archived_at=is.null`,
      body: {
        archived_at: profile.updatedAt,
        updated_at: profile.updatedAt,
      },
    });
    await request("project_proofs", {
      method: "POST",
      query: "?on_conflict=id",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: projects.map((project) => ({
        id: project.id,
        profile_id: project.profileId,
        name: project.name,
        link: project.link ?? null,
        description: project.description,
        candidate_role: project.candidateRole,
        what_this_proves: project.whatThisProves,
        capabilities_demonstrated: project.capabilitiesDemonstrated,
        key_responsibilities_supported: project.keyResponsibilitiesSupported,
        required_experience_supported: project.requiredExperienceSupported,
        industries_relevant: project.industriesRelevant,
        best_used_for: project.bestUsedFor,
        avoid_using_for: project.avoidUsingFor,
        metrics_results: project.metricsResults,
        caveats: project.caveats,
        confidence: project.confidence,
        archived_at: null,
        created_at: project.createdAt,
        updated_at: project.updatedAt,
      })),
    });
  }

  await request("profile_quality", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      profile_id: result.profileQuality.profileId,
      status: result.profileQuality.status,
      incomplete_reasons: result.profileQuality.incompleteReasons,
      weak_fields: result.profileQuality.weakFields,
      complete_fields: result.profileQuality.completeFields,
      weak_response_count: result.profileQuality.weakResponseCount,
      last_checked_at: result.profileQuality.lastCheckedAt,
    },
  });
}

export async function persistSkillsInventorySection(
  request: PublicProfileRepositoryRequest,
  result: ApplySkillsInventorySectionResult,
) {
  const { profile, skills } = result.aggregate;
  const activeSkillIds = skills.map((skill) => skill.id);

  await request("candidate_profiles", {
    method: "PATCH",
    query: qs({ id: `eq.${profile.id}` }),
    body: {
      id: profile.id,
      status: profile.status,
      updated_at: profile.updatedAt,
    },
  });

  if (activeSkillIds.length === 0) {
    await request("skill_profiles", {
      method: "DELETE",
      query: qs({ profile_id: `eq.${profile.id}` }),
    });
  } else {
    await request("skill_profiles", {
      method: "DELETE",
      query: `${qs({ profile_id: `eq.${profile.id}` })}&id=not.in.(${activeSkillIds.join(",")})`,
    });
    await request("skill_profiles", {
      method: "POST",
      query: "?on_conflict=id",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: skills.map((skill) => ({
        id: skill.id,
        profile_id: skill.profileId,
        skill_name: skill.skillName,
        proficiency: skill.proficiency,
        evidence: skill.evidence,
        best_role_fit: skill.bestRoleFit,
        do_not_overclaim: skill.doNotOverclaim,
        created_at: skill.createdAt,
        updated_at: skill.updatedAt,
      })),
    });
  }

  for (const skill of skills) {
    await request("skill_project_proofs", {
      method: "DELETE",
      query: qs({ skill_id: `eq.${skill.id}` }),
    });

    if (skill.relatedProjectIds.length > 0) {
      await request("skill_project_proofs", {
        method: "POST",
        query: "?on_conflict=skill_id,project_proof_id",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: skill.relatedProjectIds.map((projectId) => ({
          skill_id: skill.id,
          project_proof_id: projectId,
        })),
      });
    }

    await request("skill_work_history_items", {
      method: "DELETE",
      query: qs({ skill_id: `eq.${skill.id}` }),
    });

    if (skill.relatedWorkHistoryIds.length > 0) {
      await request("skill_work_history_items", {
        method: "POST",
        query: "?on_conflict=skill_id,work_history_item_id",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: skill.relatedWorkHistoryIds.map((workHistoryId) => ({
          skill_id: skill.id,
          work_history_item_id: workHistoryId,
        })),
      });
    }
  }

  await request("profile_quality", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      profile_id: result.profileQuality.profileId,
      status: result.profileQuality.status,
      incomplete_reasons: result.profileQuality.incompleteReasons,
      weak_fields: result.profileQuality.weakFields,
      complete_fields: result.profileQuality.completeFields,
      weak_response_count: result.profileQuality.weakResponseCount,
      last_checked_at: result.profileQuality.lastCheckedAt,
    },
  });
}

export async function persistQualityNarrativeSection(
  request: PublicProfileRepositoryRequest,
  result: ApplyQualityNarrativeSectionResult,
) {
  const { profile } = result.aggregate;
  const { section, fields } = result.section;

  await request("candidate_profiles", {
    method: "PATCH",
    query: qs({ id: `eq.${profile.id}` }),
    body: {
      id: profile.id,
      status: profile.status,
      updated_at: profile.updatedAt,
    },
  });

  await request("quality_scored_text_fields", {
    method: "DELETE",
    query: `${qs({ profile_id: `eq.${profile.id}` })}&section=eq.${section}`,
  });

  if (fields.length > 0) {
    await request("quality_scored_text_fields", {
      method: "POST",
      query: "?on_conflict=profile_id,section,field_key",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: fields.map((field) => ({
        id: field.id,
        profile_id: profile.id,
        section,
        field_key: field.fieldKey,
        value: field.value,
        quality: field.quality,
        feedback: field.feedback ?? null,
        created_at: result.aggregate.qualityFields.find((qualityField) => qualityField.id === field.id)?.createdAt ?? profile.updatedAt,
        updated_at: profile.updatedAt,
      })),
    });
  }

  await request("profile_quality", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      profile_id: result.profileQuality.profileId,
      status: result.profileQuality.status,
      incomplete_reasons: result.profileQuality.incompleteReasons,
      weak_fields: result.profileQuality.weakFields,
      complete_fields: result.profileQuality.completeFields,
      weak_response_count: result.profileQuality.weakResponseCount,
      last_checked_at: result.profileQuality.lastCheckedAt,
    },
  });
}

export async function persistCommunicationStyleSection(
  request: PublicProfileRepositoryRequest,
  result: ApplyCommunicationStyleSectionResult,
) {
  const { profile, communicationStyle } = result.aggregate;
  if (!communicationStyle) {
    throw new Error("Communication Style settings are required for persistence.");
  }

  await request("candidate_profiles", {
    method: "PATCH",
    query: qs({ id: `eq.${profile.id}` }),
    body: {
      id: profile.id,
      status: profile.status,
      updated_at: profile.updatedAt,
    },
  });

  await request("communication_style_settings", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      id: communicationStyle.id,
      profile_id: profile.id,
      preferred_tone: communicationStyle.preferredTone,
      formality_level: communicationStyle.formalityLevel,
      humor_level: communicationStyle.humorLevel,
      message_length_preference: communicationStyle.messageLengthPreference,
      greeting_preferences: communicationStyle.greetingPreferences,
      signoff_preferences: communicationStyle.signoffPreferences,
      phrases_to_avoid: communicationStyle.phrasesToAvoid,
      phrases_that_sound_like_me: communicationStyle.phrasesThatSoundLikeMe,
      created_at: communicationStyle.createdAt,
      updated_at: communicationStyle.updatedAt,
    },
  });

  await request("quality_scored_text_fields", {
    method: "DELETE",
    query: `${qs({ profile_id: `eq.${profile.id}` })}&section=eq.communication_style`,
  });

  if (result.section.fields.length > 0) {
    await request("quality_scored_text_fields", {
      method: "POST",
      query: "?on_conflict=profile_id,section,field_key",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: result.section.fields.map((field) => ({
        id: field.id,
        profile_id: profile.id,
        section: "communication_style",
        field_key: field.fieldKey,
        value: field.value,
        quality: field.quality,
        feedback: field.feedback ?? null,
        created_at: result.aggregate.qualityFields.find((qualityField) => qualityField.id === field.id)?.createdAt ?? profile.updatedAt,
        updated_at: profile.updatedAt,
      })),
    });
  }

  await request("profile_quality", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      profile_id: result.profileQuality.profileId,
      status: result.profileQuality.status,
      incomplete_reasons: result.profileQuality.incompleteReasons,
      weak_fields: result.profileQuality.weakFields,
      complete_fields: result.profileQuality.completeFields,
      weak_response_count: result.profileQuality.weakResponseCount,
      last_checked_at: result.profileQuality.lastCheckedAt,
    },
  });
}

export async function persistWritingSamplesSection(
  request: PublicProfileRepositoryRequest,
  result: ApplyWritingSamplesSectionResult,
) {
  const { profile, writingSamples } = result.aggregate;
  const activeSampleIds = writingSamples.map((sample) => sample.id);

  await request("candidate_profiles", {
    method: "PATCH",
    query: qs({ id: `eq.${profile.id}` }),
    body: {
      id: profile.id,
      status: profile.status,
      updated_at: profile.updatedAt,
    },
  });

  if (activeSampleIds.length === 0) {
    await request("writing_samples", {
      method: "DELETE",
      query: qs({ profile_id: `eq.${profile.id}` }),
    });
  } else {
    await request("writing_samples", {
      method: "DELETE",
      query: `${qs({ profile_id: `eq.${profile.id}` })}&id=not.in.(${activeSampleIds.join(",")})`,
    });
    await request("writing_samples", {
      method: "POST",
      query: "?on_conflict=id",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: writingSamples.map((sample) => ({
        id: sample.id,
        profile_id: sample.profileId,
        sample_type: sample.sampleType,
        channel: sample.channel,
        text: sample.text,
        why_it_works_or_fails: sample.whyItWorksOrFails,
        created_at: sample.createdAt,
        updated_at: sample.updatedAt,
      })),
    });
  }

  await request("profile_quality", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      profile_id: result.profileQuality.profileId,
      status: result.profileQuality.status,
      incomplete_reasons: result.profileQuality.incompleteReasons,
      weak_fields: result.profileQuality.weakFields,
      complete_fields: result.profileQuality.completeFields,
      weak_response_count: result.profileQuality.weakResponseCount,
      last_checked_at: result.profileQuality.lastCheckedAt,
    },
  });
}

export async function persistOutreachRulesSection(
  request: PublicProfileRepositoryRequest,
  result: ApplyOutreachRulesSectionResult,
) {
  const { profile, outreachRules, roleTracks, roleTrackOutreachRules } = result.aggregate;
  if (!outreachRules) {
    throw new Error("Outreach Rule settings are required for persistence.");
  }
  const roleTrackIds = roleTracks.map((track) => track.id);
  const activeRuleIds = roleTrackOutreachRules.map((rule) => rule.id);

  await request("candidate_profiles", {
    method: "PATCH",
    query: qs({ id: `eq.${profile.id}` }),
    body: {
      id: profile.id,
      status: profile.status,
      updated_at: profile.updatedAt,
    },
  });

  await request("outreach_rule_sets", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      id: outreachRules.id,
      profile_id: profile.id,
      global_rules: outreachRules.globalRules,
      follow_up_rules: outreachRules.followUpRules,
      link_selection_rules: outreachRules.linkSelectionRules,
      created_at: outreachRules.createdAt,
      updated_at: outreachRules.updatedAt,
    },
  });

  await request("quality_scored_text_fields", {
    method: "DELETE",
    query: `${qs({ profile_id: `eq.${profile.id}` })}&section=eq.outreach_rules`,
  });

  if (result.section.fields.length > 0) {
    await request("quality_scored_text_fields", {
      method: "POST",
      query: "?on_conflict=profile_id,section,field_key",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: result.section.fields.map((field) => ({
        id: field.id,
        profile_id: profile.id,
        section: "outreach_rules",
        field_key: field.fieldKey,
        value: field.value,
        quality: field.quality,
        feedback: field.feedback ?? null,
        created_at: result.aggregate.qualityFields.find((qualityField) => qualityField.id === field.id)?.createdAt ?? profile.updatedAt,
        updated_at: profile.updatedAt,
      })),
    });
  }

  if (roleTrackIds.length > 0) {
    const roleTrackQuery = `role_track_id=in.(${roleTrackIds.join(",")})`;
    await request("role_track_outreach_rules", {
      method: "DELETE",
      query: activeRuleIds.length > 0
        ? `?${roleTrackQuery}&id=not.in.(${activeRuleIds.join(",")})`
        : `?${roleTrackQuery}`,
    });
  }

  if (roleTrackOutreachRules.length > 0) {
    await request("role_track_outreach_rules", {
      method: "POST",
      query: "?on_conflict=id",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: roleTrackOutreachRules.map((rule) => ({
        id: rule.id,
        role_track_id: rule.roleTrackId,
        rules: rule.rules,
        preferred_proof_types: rule.preferredProofTypes,
        avoid_proof_types: rule.avoidProofTypes,
        created_at: rule.createdAt,
        updated_at: rule.updatedAt,
      })),
    });
  }

  await request("profile_quality", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      profile_id: result.profileQuality.profileId,
      status: result.profileQuality.status,
      incomplete_reasons: result.profileQuality.incompleteReasons,
      weak_fields: result.profileQuality.weakFields,
      complete_fields: result.profileQuality.completeFields,
      weak_response_count: result.profileQuality.weakResponseCount,
      last_checked_at: result.profileQuality.lastCheckedAt,
    },
  });
}

export async function persistLeadershipProfileSection(
  request: PublicProfileRepositoryRequest,
  result: ApplyLeadershipProfileSectionResult,
) {
  const { profile, leadershipProfile } = result.aggregate;
  if (!leadershipProfile) {
    throw new Error("Leadership Profile settings are required for persistence.");
  }

  await request("candidate_profiles", {
    method: "PATCH",
    query: qs({ id: `eq.${profile.id}` }),
    body: {
      id: profile.id,
      status: profile.status,
      updated_at: profile.updatedAt,
    },
  });

  await request("leadership_profiles", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      id: leadershipProfile.id,
      profile_id: profile.id,
      visible: leadershipProfile.visible,
      created_at: leadershipProfile.createdAt,
      updated_at: leadershipProfile.updatedAt,
    },
  });

  await request("quality_scored_text_fields", {
    method: "DELETE",
    query: `${qs({ profile_id: `eq.${profile.id}` })}&section=eq.leadership_profile`,
  });

  if (result.section.fields.length > 0) {
    await request("quality_scored_text_fields", {
      method: "POST",
      query: "?on_conflict=profile_id,section,field_key",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: result.section.fields.map((field) => ({
        id: field.id,
        profile_id: profile.id,
        section: "leadership_profile",
        field_key: field.fieldKey,
        value: field.value,
        quality: field.quality,
        feedback: field.feedback ?? null,
        created_at: result.aggregate.qualityFields.find((qualityField) => qualityField.id === field.id)?.createdAt ?? profile.updatedAt,
        updated_at: profile.updatedAt,
      })),
    });
  }

  await request("profile_quality", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      profile_id: result.profileQuality.profileId,
      status: result.profileQuality.status,
      incomplete_reasons: result.profileQuality.incompleteReasons,
      weak_fields: result.profileQuality.weakFields,
      complete_fields: result.profileQuality.completeFields,
      weak_response_count: result.profileQuality.weakResponseCount,
      last_checked_at: result.profileQuality.lastCheckedAt,
    },
  });
}

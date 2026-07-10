import type {
  CandidateProfileAggregate,
  CandidateProfilePreferences,
  CandidateProfileRecord,
  CompanyWatchlistItem,
  FitSignals,
  ProfileQuality,
  Quality,
  QualityScoredTextField,
  QualitySection,
  RoleTrack,
  RoleTrackOutreachRule,
  VoicePersonality,
  WritingSample,
  WorkExample,
  Resume,
  SkillProfile,
} from "./types";
import type { CandidateProfileGenerationResult } from "./profile-generation";
import { evaluateCandidateProfileQuality } from "./profile-quality";
import type {
  ApplyIdentitySearchSectionResult,
  ApplyFitSignalsSectionResult,
  ApplyVoicePersonalitySectionResult,
  ApplyLeadershipProfileSectionResult,
  ApplyOutreachRulesSectionResult,
  ApplyWorkExamplesSectionResult,
  ApplyQualityNarrativeSectionResult,
  ApplyResumeUploadsSectionResult,
  ApplyRoleTracksSectionResult,
  ApplySkillsInventorySectionResult,
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
  email: string | null;
  remote_preference: CandidateProfileRecord["remotePreference"];
  target_compensation_min: number | null;
  target_compensation_preferred: number | null;
  target_compensation_hourly_min: number | string | null;
  target_compensation_hourly_preferred: number | string | null;
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
  created_at: string;
  updated_at: string;
};

type ResumeRow = {
  id: string;
  profile_id: string;
  name: string;
  file_url: string;
  parsed_text: string;
  highlights: string[];
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

type FitSignalsRow = {
  id: string;
  profile_id: string;
  good_signals: string[];
  poor_fit_signals: string[];
  created_at: string;
  updated_at: string;
};

type WorkExampleRow = {
  id: string;
  profile_id: string;
  title: string;
  one_hitter: string;
  link: string | null;
  context: string;
  created_at: string;
  updated_at: string;
};

type SkillRow = {
  id: string;
  profile_id: string;
  skill_name: string;
  proficiency: SkillProfile["proficiency"];
  evidence: string[];
  created_at: string;
  updated_at: string;
};

type SkillWorkExampleRow = {
  skill_id: string;
  work_example_id: string;
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

type VoicePersonalityRow = {
  id: string;
  profile_id: string;
  q1_value: string;
  q4_opinion: string;
  tone_tags: string[];
  avoid_tags: string[];
  avoid_note: string;
  created_at: string;
  updated_at: string;
};

type WritingSampleRow = {
  id: string;
  profile_id: string;
  bucket: WritingSample["bucket"];
  channel: WritingSample["channel"];
  text: string;
  tags: string[];
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

// Postgres numeric columns can serialize as strings through PostgREST.
function definedNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  fitSignals?: FitSignalsRow;
  workExamples: WorkExampleRow[];
  skills: SkillRow[];
  skillWorkExamples: SkillWorkExampleRow[];
  qualityFields: QualityFieldRow[];
  voicePersonality?: VoicePersonalityRow;
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
  const workExampleIdsBySkill = idsByLeft(
    rows.skillWorkExamples.map((row) => ({ left: row.skill_id, right: row.work_example_id })),
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
      email: defined(rows.profile.email),
      remotePreference: rows.profile.remote_preference,
      targetCompensationMin: defined(rows.profile.target_compensation_min),
      targetCompensationPreferred: defined(rows.profile.target_compensation_preferred),
      targetCompensationHourlyMin: definedNumber(rows.profile.target_compensation_hourly_min),
      targetCompensationHourlyPreferred: definedNumber(rows.profile.target_compensation_hourly_preferred),
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
      highlights: row.highlights ?? [],
      strengths: row.strengths,
      gaps: row.gaps,
      useWhen: row.use_when,
      avoidWhen: row.avoid_when,
      parsingQuality: row.parsing_quality,
      parsingIssues: row.parsing_issues,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    fitSignals: rows.fitSignals ? {
      id: rows.fitSignals.id,
      profileId: rows.fitSignals.profile_id,
      goodSignals: rows.fitSignals.good_signals,
      poorFitSignals: rows.fitSignals.poor_fit_signals,
      createdAt: rows.fitSignals.created_at,
      updatedAt: rows.fitSignals.updated_at,
    } : undefined,
    workExamples: rows.workExamples.map((row): WorkExample => ({
      id: row.id,
      profileId: row.profile_id,
      title: row.title,
      oneHitter: row.one_hitter,
      link: defined(row.link),
      context: row.context,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    skills: rows.skills.map((row): SkillProfile => ({
      id: row.id,
      profileId: row.profile_id,
      skillName: row.skill_name,
      proficiency: row.proficiency,
      evidence: row.evidence,
      relatedWorkExampleIds: workExampleIdsBySkill.get(row.id) ?? [],
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
    voicePersonality: rows.voicePersonality ? {
      id: rows.voicePersonality.id,
      profileId: rows.voicePersonality.profile_id,
      q1Value: rows.voicePersonality.q1_value,
      q4Opinion: rows.voicePersonality.q4_opinion,
      toneTags: rows.voicePersonality.tone_tags,
      avoidTags: rows.voicePersonality.avoid_tags,
      avoidNote: rows.voicePersonality.avoid_note,
      createdAt: rows.voicePersonality.created_at,
      updatedAt: rows.voicePersonality.updated_at,
    } : undefined,
    writingSamples: rows.writingSamples.map((row): WritingSample => ({
      id: row.id,
      profileId: row.profile_id,
      bucket: row.bucket,
      channel: row.channel,
      text: row.text,
      tags: row.tags,
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
    fitSignals,
    workExamples,
    skills,
    qualityFields,
    voicePersonality,
    writingSamples,
    outreachRules,
    leadershipProfile,
    profileQuality,
  ] = await Promise.all([
    request<PreferencesRow[]>("candidate_profile_preferences", { query: qs({ profile_id: `eq.${profile.id}`, limit: "1" }) }),
    request<CompanyWatchlistRow[]>("company_watchlist_items", { query: profileQuery }),
    request<RoleTrackRow[]>("role_tracks", { query: `${profileQuery}&archived_at=is.null` }),
    request<ResumeRow[]>("resumes", { query: `${profileQuery}&archived_at=is.null` }),
    request<FitSignalsRow[]>("fit_signals", { query: qs({ profile_id: `eq.${profile.id}`, limit: "1" }) }),
    request<WorkExampleRow[]>("work_examples", { query: profileQuery }),
    request<SkillRow[]>("skill_profiles", { query: profileQuery }),
    request<QualityFieldRow[]>("quality_scored_text_fields", { query: profileQuery }),
    request<VoicePersonalityRow[]>("voice_personality", { query: qs({ profile_id: `eq.${profile.id}`, limit: "1" }) }),
    request<WritingSampleRow[]>("writing_samples", { query: profileQuery }),
    request<OutreachRuleSetRow[]>("outreach_rule_sets", { query: qs({ profile_id: `eq.${profile.id}`, limit: "1" }) }),
    request<LeadershipProfileRow[]>("leadership_profiles", { query: qs({ profile_id: `eq.${profile.id}`, limit: "1" }) }),
    request<ProfileQualityRow[]>("profile_quality", { query: qs({ profile_id: `eq.${profile.id}`, limit: "1" }) }),
  ]);
  const roleTrackIds = roleTracks.map((row) => row.id);
  const skillIds = skills.map((row) => row.id);
  const workExampleIds = workExamples.map((row) => row.id);
  const [
    resumeRoleTracks,
    skillWorkExamples,
    roleTrackOutreachRules,
  ] = await Promise.all([
    roleTrackIds.length === 0 ? [] : request<ResumeRoleTrackRow[]>("resume_role_tracks", { query: qs({ role_track_id: `in.(${roleTrackIds.join(",")})` }) }),
    skillIds.length === 0 || workExampleIds.length === 0 ? [] : request<SkillWorkExampleRow[]>("skill_work_examples", { query: qs({ skill_id: `in.(${skillIds.join(",")})` }) }),
    roleTrackIds.length === 0 ? [] : request<RoleTrackOutreachRuleRow[]>("role_track_outreach_rules", { query: qs({ role_track_id: `in.(${roleTrackIds.join(",")})` }) }),
  ]);

  return mapPublicProfileRows({
    profile,
    preferences: first(preferences),
    companyWatchlist,
    roleTracks,
    resumes,
    resumeRoleTracks,
    fitSignals: first(fitSignals),
    workExamples,
    skills,
    skillWorkExamples,
    qualityFields,
    voicePersonality: first(voicePersonality),
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
      email: profile.email ?? null,
      remote_preference: profile.remotePreference,
      target_compensation_min: profile.targetCompensationMin ?? null,
      target_compensation_preferred: profile.targetCompensationPreferred ?? null,
      target_compensation_hourly_min: profile.targetCompensationHourlyMin ?? null,
      target_compensation_hourly_preferred: profile.targetCompensationHourlyPreferred ?? null,
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
        highlights: resume.highlights,
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

// Write the system-derived résumé highlights cache. Called from the regeneration
// flow after the metered pre-pass; PATCH per résumé so we only ever touch the
// highlights column of rows that already exist (never insert a partial row).
export async function persistDerivedResumeHighlights(
  request: PublicProfileRepositoryRequest,
  entries: { id: string; highlights: string[]; updatedAt: string }[],
) {
  for (const entry of entries) {
    await request("resumes", {
      method: "PATCH",
      query: qs({ id: `eq.${entry.id}` }),
      body: {
        highlights: entry.highlights,
        updated_at: entry.updatedAt,
      },
    });
  }
}

export async function persistFitSignalsSection(
  request: PublicProfileRepositoryRequest,
  result: ApplyFitSignalsSectionResult,
) {
  const { profile, fitSignals } = result.aggregate;
  if (!fitSignals) {
    throw new Error("Fit Signals settings are required for persistence.");
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

  await request("fit_signals", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      profile_id: profile.id,
      good_signals: fitSignals.goodSignals,
      poor_fit_signals: fitSignals.poorFitSignals,
      created_at: fitSignals.createdAt,
      updated_at: fitSignals.updatedAt,
    },
  });

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

export async function persistWorkExamplesSection(
  request: PublicProfileRepositoryRequest,
  result: ApplyWorkExamplesSectionResult,
) {
  const { profile, workExamples } = result.aggregate;
  const activeWorkExampleIds = workExamples.map((example) => example.id);

  await request("candidate_profiles", {
    method: "PATCH",
    query: qs({ id: `eq.${profile.id}` }),
    body: {
      id: profile.id,
      status: profile.status,
      updated_at: profile.updatedAt,
    },
  });

  if (activeWorkExampleIds.length === 0) {
    await request("work_examples", {
      method: "DELETE",
      query: qs({ profile_id: `eq.${profile.id}` }),
    });
  } else {
    await request("work_examples", {
      method: "DELETE",
      query: `${qs({ profile_id: `eq.${profile.id}` })}&id=not.in.(${activeWorkExampleIds.join(",")})`,
    });
    await request("work_examples", {
      method: "POST",
      query: "?on_conflict=id",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: workExamples.map((example) => ({
        id: example.id,
        profile_id: example.profileId,
        title: example.title,
        one_hitter: example.oneHitter,
        link: example.link ?? null,
        context: example.context,
        created_at: example.createdAt,
        updated_at: example.updatedAt,
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
        created_at: skill.createdAt,
        updated_at: skill.updatedAt,
      })),
    });
  }

  for (const skill of skills) {
    await request("skill_work_examples", {
      method: "DELETE",
      query: qs({ skill_id: `eq.${skill.id}` }),
    });

    if (skill.relatedWorkExampleIds.length > 0) {
      await request("skill_work_examples", {
        method: "POST",
        query: "?on_conflict=skill_id,work_example_id",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: skill.relatedWorkExampleIds.map((workExampleId) => ({
          skill_id: skill.id,
          work_example_id: workExampleId,
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

export async function persistVoicePersonalitySection(
  request: PublicProfileRepositoryRequest,
  result: ApplyVoicePersonalitySectionResult,
) {
  const { profile, voicePersonality } = result.aggregate;
  if (!voicePersonality) {
    throw new Error("Voice & Personality settings are required for persistence.");
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

  await request("voice_personality", {
    method: "POST",
    query: "?on_conflict=profile_id",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      profile_id: profile.id,
      q1_value: voicePersonality.q1Value,
      q4_opinion: voicePersonality.q4Opinion,
      tone_tags: voicePersonality.toneTags,
      avoid_tags: voicePersonality.avoidTags,
      avoid_note: voicePersonality.avoidNote,
      created_at: voicePersonality.createdAt,
      updated_at: voicePersonality.updatedAt,
    },
  });

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
        bucket: sample.bucket,
        channel: sample.channel,
        text: sample.text,
        tags: sample.tags,
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

// Dev/test factory reset: wipe every piece of profile data for a user — section
// rows, join rows, pursuits (+ events, contacts, outreach messages), compiled
// markdown/versions/quality, metered usage — and finally the candidate_profiles
// row itself, so the next bootstrap recreates a first-run profile. Access-code /
// plan state is account data, not profile data, and is left untouched.
export async function resetCandidateProfileDataForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
): Promise<{ status: "reset" } | { status: "not_found" }> {
  const profiles = await request<{ id: string }[]>("candidate_profiles", {
    query: qs({ user_id: `eq.${userId}`, select: "id", limit: "1" }),
  });
  const profile = profiles[0];
  if (!profile) return { status: "not_found" };
  const profileQuery = qs({ profile_id: `eq.${profile.id}` });

  const [trackRows, resumeRows, skillRows, pursuitRows] = await Promise.all([
    request<{ id: string }[]>("role_tracks", { query: `${profileQuery}&select=id` }),
    request<{ id: string }[]>("resumes", { query: `${profileQuery}&select=id` }),
    request<{ id: string }[]>("skill_profiles", { query: `${profileQuery}&select=id` }),
    request<{ id: string }[]>("pursuits", { query: qs({ user_id: `eq.${userId}`, select: "id" }) }),
  ]);
  const trackIds = trackRows.map((row) => row.id);
  const resumeIds = resumeRows.map((row) => row.id);
  const skillIds = skillRows.map((row) => row.id);
  const pursuitIds = pursuitRows.map((row) => row.id);

  // Children and join rows first so nothing dangles mid-delete.
  if (trackIds.length > 0) {
    await request("resume_role_tracks", { method: "DELETE", query: qs({ role_track_id: `in.(${trackIds.join(",")})` }) });
    await request("role_track_outreach_rules", { method: "DELETE", query: qs({ role_track_id: `in.(${trackIds.join(",")})` }) });
  }
  if (resumeIds.length > 0) {
    await request("resume_role_tracks", { method: "DELETE", query: qs({ resume_id: `in.(${resumeIds.join(",")})` }) });
  }
  if (skillIds.length > 0) {
    await request("skill_work_examples", { method: "DELETE", query: qs({ skill_id: `in.(${skillIds.join(",")})` }) });
  }
  if (pursuitIds.length > 0) {
    const pursuitQuery = qs({ pursuit_id: `in.(${pursuitIds.join(",")})` });
    await request("pursuit_events", { method: "DELETE", query: pursuitQuery });
    await request("outreach_messages", { method: "DELETE", query: pursuitQuery });
    await request("contact_suggestions", { method: "DELETE", query: pursuitQuery });
  }
  await request("pursuits", { method: "DELETE", query: qs({ user_id: `eq.${userId}` }) });

  const profileTables = [
    "quality_scored_text_fields",
    "writing_samples",
    "voice_personality",
    "fit_signals",
    "leadership_profiles",
    "outreach_rule_sets",
    "work_examples",
    "skill_profiles",
    "resumes",
    "role_tracks",
    "candidate_profile_preferences",
    "profile_versions",
    "profile_quality",
  ];
  for (const table of profileTables) {
    await request(table, { method: "DELETE", query: profileQuery });
  }

  await request("usage_ledger", { method: "DELETE", query: qs({ user_id: `eq.${userId}` }) });
  await request("candidate_profiles", { method: "DELETE", query: qs({ id: `eq.${profile.id}` }) });

  return { status: "reset" };
}

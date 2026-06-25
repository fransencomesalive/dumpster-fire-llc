import {
  allowedProfileQualityFields,
  evaluateCandidateProfileQuality,
  requiredProfileQualityFields,
} from "./profile-quality";
import type {
  CandidateProfileAggregate,
  CandidateProfilePreferences,
  CommunicationStyleSettings,
  EmploymentType,
  FormalityLevel,
  HumorLevel,
  LeadershipProfile,
  MessageLengthPreference,
  OutreachRuleSet,
  ParsingQuality,
  ProfileQuality,
  ProjectProof,
  ProofConfidence,
  Quality,
  QualityScoredTextField,
  QualitySection,
  RemotePreference,
  Resume,
  RoleTrack,
  RoleTrackOutreachRule,
  SkillProfile,
  SkillProficiency,
  WorkHistoryItem,
  WritingChannel,
  WritingSample,
  WritingSampleType,
} from "./types";

export type IdentitySearchSection = {
  fullName: string;
  preferredName?: string;
  location: string;
  workAuthorization: string;
  linkedInUrl?: string;
  portfolioUrl?: string;
  personalWebsiteUrl?: string;
  email?: string;
  remotePreference: RemotePreference;
  targetCompensationMin?: number;
  targetCompensationPreferred?: number;
  availability: string;
  employmentTypes: EmploymentType[];
  targetIndustries: string[];
  avoidIndustries: string[];
  targetCompanyTypes: string[];
  avoidCompanies: string[];
};

export type IdentitySearchSectionPatch = Partial<IdentitySearchSection>;

export type SectionValidationIssue = {
  field: string;
  message: string;
};

export type RoleTrackSectionItem = {
  id: string;
  name: string;
  description: string;
  corePositioning: string;
  outreachAngle: string;
  globalProofRules?: string;
  targetTitles: string[];
  keyResponsibilities: string[];
  requiredExperiencePatterns: string[];
  strongJobSignals: string[];
  weakJobSignals: string[];
  mismatchSignals: string[];
  doNotOverclaim: string[];
  resumeIds: string[];
};

export type RoleTracksSection = {
  roleTracks: RoleTrackSectionItem[];
};

export type RoleTracksSectionPatch = RoleTracksSection;

export type ResumeUploadSectionItem = {
  id: string;
  name: string;
  fileUrl: string;
  parsedText: string;
  associatedRoleTrackIds: string[];
  strengths: string[];
  gaps: string[];
  useWhen: string[];
  avoidWhen: string[];
  parsingQuality: ParsingQuality;
  parsingIssues: string[];
};

export type ResumeUploadsSection = {
  resumes: ResumeUploadSectionItem[];
};

export type ResumeUploadsSectionPatch = ResumeUploadsSection;

export type WorkHistorySectionItem = {
  id: string;
  company: string;
  title: string;
  startDate?: string;
  endDate?: string;
  currentRole: boolean;
  responsibilities: string[];
  accomplishments: string[];
  skills: string[];
  metrics: string[];
  associatedResumeIds: string[];
  source: WorkHistoryItem["source"];
};

export type WorkHistorySection = {
  workHistory: WorkHistorySectionItem[];
};

export type WorkHistorySectionPatch = WorkHistorySection;

export type ProofLibrarySectionItem = {
  id: string;
  name: string;
  link?: string;
  description: string;
  candidateRole: string;
  whatThisProves: string[];
  capabilitiesDemonstrated: string[];
  keyResponsibilitiesSupported: string[];
  requiredExperienceSupported: string[];
  industriesRelevant: string[];
  bestUsedFor: string[];
  avoidUsingFor: string[];
  metricsResults: string[];
  caveats: string[];
  confidence: ProofConfidence;
};

export type ProofLibrarySection = {
  projects: ProofLibrarySectionItem[];
};

export type ProofLibrarySectionPatch = ProofLibrarySection;

export type SkillsInventorySectionItem = {
  id: string;
  skillName: string;
  proficiency: SkillProficiency;
  evidence: string[];
  relatedProjectIds: string[];
  relatedWorkHistoryIds: string[];
  bestRoleFit: string[];
  doNotOverclaim: string[];
};

export type SkillsInventorySection = {
  skills: SkillsInventorySectionItem[];
};

export type SkillsInventorySectionPatch = SkillsInventorySection;

export type QualityNarrativeSectionField = {
  id: string;
  fieldKey: string;
  value: string;
  quality: Quality;
  feedback?: string;
};

export type QualityNarrativeSection = {
  section: QualitySection;
  fields: QualityNarrativeSectionField[];
};

export type QualityNarrativeSectionPatch = QualityNarrativeSection;

export type CommunicationStyleSettingsSection = {
  id?: string;
  preferredTone: string[];
  formalityLevel: FormalityLevel;
  humorLevel: HumorLevel;
  messageLengthPreference: MessageLengthPreference;
  greetingPreferences: string[];
  signoffPreferences: string[];
  phrasesToAvoid: string[];
  phrasesThatSoundLikeMe: string[];
};

export type CommunicationStyleSection = {
  settings?: CommunicationStyleSettingsSection;
  fields: QualityNarrativeSectionField[];
};

export type CommunicationStyleSectionPatch = {
  settings: CommunicationStyleSettingsSection;
  fields: QualityNarrativeSectionField[];
};

export type WritingSamplesSectionItem = {
  id: string;
  sampleType: WritingSampleType;
  channel: WritingChannel;
  text: string;
  whyItWorksOrFails: string;
};

export type WritingSamplesSection = {
  writingSamples: WritingSamplesSectionItem[];
};

export type WritingSamplesSectionPatch = WritingSamplesSection;

export type OutreachRuleSettingsSection = {
  id?: string;
  globalRules: string[];
  followUpRules: string[];
  linkSelectionRules: string[];
};

export type RoleTrackOutreachRuleSectionItem = {
  id: string;
  roleTrackId: string;
  rules: string[];
  preferredProofTypes: string[];
  avoidProofTypes: string[];
};

export type OutreachRulesSection = {
  settings?: OutreachRuleSettingsSection;
  fields: QualityNarrativeSectionField[];
  roleTrackSpecificRules: RoleTrackOutreachRuleSectionItem[];
};

export type OutreachRulesSectionPatch = {
  settings: OutreachRuleSettingsSection;
  fields: QualityNarrativeSectionField[];
  roleTrackSpecificRules: RoleTrackOutreachRuleSectionItem[];
};

export type LeadershipProfileSection = {
  visible: boolean;
  fields: QualityNarrativeSectionField[];
};

export type LeadershipProfileSectionPatch = LeadershipProfileSection;

export type ParseIdentitySearchPatchResult =
  | {
      ok: true;
      patch: IdentitySearchSectionPatch;
    }
  | {
      ok: false;
      issues: SectionValidationIssue[];
    };

export type ApplyIdentitySearchSectionResult = {
  aggregate: CandidateProfileAggregate;
  section: IdentitySearchSection;
  profileQuality: ProfileQuality;
};

export type ParseRoleTracksSectionPatchResult =
  | {
      ok: true;
      patch: RoleTracksSectionPatch;
    }
  | {
      ok: false;
      issues: SectionValidationIssue[];
    };

export type ApplyRoleTracksSectionResult = {
  aggregate: CandidateProfileAggregate;
  section: RoleTracksSection;
  profileQuality: ProfileQuality;
};

export type ParseResumeUploadsSectionPatchResult =
  | {
      ok: true;
      patch: ResumeUploadsSectionPatch;
    }
  | {
      ok: false;
      issues: SectionValidationIssue[];
    };

export type ApplyResumeUploadsSectionResult = {
  aggregate: CandidateProfileAggregate;
  section: ResumeUploadsSection;
  profileQuality: ProfileQuality;
};

export type ParseWorkHistorySectionPatchResult =
  | {
      ok: true;
      patch: WorkHistorySectionPatch;
    }
  | {
      ok: false;
      issues: SectionValidationIssue[];
    };

export type ApplyWorkHistorySectionResult = {
  aggregate: CandidateProfileAggregate;
  section: WorkHistorySection;
  profileQuality: ProfileQuality;
};

export type ParseProofLibrarySectionPatchResult =
  | {
      ok: true;
      patch: ProofLibrarySectionPatch;
    }
  | {
      ok: false;
      issues: SectionValidationIssue[];
    };

export type ApplyProofLibrarySectionResult = {
  aggregate: CandidateProfileAggregate;
  section: ProofLibrarySection;
  profileQuality: ProfileQuality;
};

export type ParseSkillsInventorySectionPatchResult =
  | {
      ok: true;
      patch: SkillsInventorySectionPatch;
    }
  | {
      ok: false;
      issues: SectionValidationIssue[];
    };

export type ApplySkillsInventorySectionResult = {
  aggregate: CandidateProfileAggregate;
  section: SkillsInventorySection;
  profileQuality: ProfileQuality;
};

export type ParseQualityNarrativeSectionPatchResult =
  | {
      ok: true;
      patch: QualityNarrativeSectionPatch;
    }
  | {
      ok: false;
      issues: SectionValidationIssue[];
    };

export type ApplyQualityNarrativeSectionResult = {
  aggregate: CandidateProfileAggregate;
  section: QualityNarrativeSection;
  profileQuality: ProfileQuality;
};

export type ParseCommunicationStyleSectionPatchResult =
  | {
      ok: true;
      patch: CommunicationStyleSectionPatch;
    }
  | {
      ok: false;
      issues: SectionValidationIssue[];
    };

export type ApplyCommunicationStyleSectionResult = {
  aggregate: CandidateProfileAggregate;
  section: CommunicationStyleSection;
  profileQuality: ProfileQuality;
};

export type ParseWritingSamplesSectionPatchResult =
  | {
      ok: true;
      patch: WritingSamplesSectionPatch;
    }
  | {
      ok: false;
      issues: SectionValidationIssue[];
    };

export type ApplyWritingSamplesSectionResult = {
  aggregate: CandidateProfileAggregate;
  section: WritingSamplesSection;
  profileQuality: ProfileQuality;
};

export type ParseOutreachRulesSectionPatchResult =
  | {
      ok: true;
      patch: OutreachRulesSectionPatch;
    }
  | {
      ok: false;
      issues: SectionValidationIssue[];
    };

export type ApplyOutreachRulesSectionResult = {
  aggregate: CandidateProfileAggregate;
  section: OutreachRulesSection;
  profileQuality: ProfileQuality;
};

export type ParseLeadershipProfileSectionPatchResult =
  | {
      ok: true;
      patch: LeadershipProfileSectionPatch;
    }
  | {
      ok: false;
      issues: SectionValidationIssue[];
    };

export type ApplyLeadershipProfileSectionResult = {
  aggregate: CandidateProfileAggregate;
  section: LeadershipProfileSection;
  profileQuality: ProfileQuality;
};

const remotePreferences = new Set<RemotePreference>([
  "remote_only",
  "remote_preferred",
  "hybrid_ok",
  "onsite_ok",
]);

const employmentTypes = new Set<EmploymentType>([
  "full_time",
  "contract",
  "freelance",
  "part_time",
]);

const stringFields = [
  "fullName",
  "preferredName",
  "location",
  "workAuthorization",
  "linkedInUrl",
  "portfolioUrl",
  "personalWebsiteUrl",
  "email",
  "availability",
] as const;

const stringListFields = [
  "targetIndustries",
  "avoidIndustries",
  "targetCompanyTypes",
  "avoidCompanies",
] as const;

const optionalStringFields = new Set<keyof IdentitySearchSection>([
  "preferredName",
  "linkedInUrl",
  "portfolioUrl",
  "personalWebsiteUrl",
  "email",
]);

const roleTrackStringFields = [
  "id",
  "name",
  "description",
  "corePositioning",
  "outreachAngle",
] as const;

const roleTrackOptionalStringFields = [
  "globalProofRules",
] as const;

const roleTrackListFields = [
  "targetTitles",
  "keyResponsibilities",
  "requiredExperiencePatterns",
  "strongJobSignals",
  "weakJobSignals",
  "mismatchSignals",
  "doNotOverclaim",
  "resumeIds",
] as const;

const resumeStringFields = [
  "id",
  "name",
  "fileUrl",
  "parsedText",
] as const;

const resumeListFields = [
  "associatedRoleTrackIds",
  "strengths",
  "gaps",
  "useWhen",
  "avoidWhen",
  "parsingIssues",
] as const;

const parsingQualities = new Set<ParsingQuality>([
  "failed",
  "weak",
  "complete",
]);

const workHistoryStringFields = [
  "id",
  "company",
  "title",
] as const;

const workHistoryOptionalStringFields = [
  "startDate",
  "endDate",
] as const;

const workHistoryListFields = [
  "responsibilities",
  "accomplishments",
  "skills",
  "metrics",
  "associatedResumeIds",
] as const;

const workHistorySources = new Set<WorkHistoryItem["source"]>([
  "resume_parse",
  "user_corrected",
]);

const proofStringFields = [
  "id",
  "name",
  "description",
  "candidateRole",
] as const;

const proofOptionalStringFields = [
  "link",
] as const;

const proofListFields = [
  "whatThisProves",
  "capabilitiesDemonstrated",
  "keyResponsibilitiesSupported",
  "requiredExperienceSupported",
  "industriesRelevant",
  "bestUsedFor",
  "avoidUsingFor",
  "metricsResults",
  "caveats",
] as const;

const proofConfidences = new Set<ProofConfidence>([
  "low",
  "medium",
  "high",
]);

const skillStringFields = [
  "id",
  "skillName",
] as const;

const skillListFields = [
  "evidence",
  "relatedProjectIds",
  "relatedWorkHistoryIds",
  "bestRoleFit",
  "doNotOverclaim",
] as const;

const skillProficiencies = new Set<SkillProficiency>([
  "working",
  "strong",
  "expert",
]);

const qualityRatings = new Set<Quality>([
  "weak",
  "complete",
]);

const communicationStyleListFields = [
  "preferredTone",
  "greetingPreferences",
  "signoffPreferences",
  "phrasesToAvoid",
  "phrasesThatSoundLikeMe",
] as const;

const formalityLevels = new Set<FormalityLevel>([
  "low",
  "medium",
  "high",
]);

const humorLevels = new Set<HumorLevel>([
  "none",
  "light",
  "medium",
]);

const messageLengthPreferences = new Set<MessageLengthPreference>([
  "short",
  "medium",
  "long",
]);

const writingSampleTypes = new Set<WritingSampleType>([
  "like",
  "hate",
]);

const writingChannels = new Set<WritingChannel>([
  "linkedin",
  "email",
  "dm",
  "social_post",
  "other",
]);

const outreachRuleSettingsListFields = [
  "globalRules",
  "followUpRules",
  "linkSelectionRules",
] as const;

const roleTrackOutreachRuleListFields = [
  "rules",
  "preferredProofTypes",
  "avoidProofTypes",
] as const;

function cleanString(value: unknown) {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  return value.trim();
}

function cleanStringList(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}

function cleanOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed);
}

function optionalString(value: string | undefined) {
  return value ? value : undefined;
}

function preferencesForPatch(
  aggregate: CandidateProfileAggregate,
  updatedAt: string,
): CandidateProfilePreferences {
  return aggregate.preferences ?? {
    id: `candidate-profile-preferences-${aggregate.profile.id}`,
    profileId: aggregate.profile.id,
    employmentTypes: [],
    targetIndustries: [],
    avoidIndustries: [],
    targetCompanyTypes: [],
    avoidCompanies: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

export function identitySearchSection(aggregate: CandidateProfileAggregate): IdentitySearchSection {
  return {
    fullName: aggregate.profile.fullName,
    preferredName: aggregate.profile.preferredName,
    location: aggregate.profile.location,
    workAuthorization: aggregate.profile.workAuthorization,
    linkedInUrl: aggregate.profile.linkedInUrl,
    portfolioUrl: aggregate.profile.portfolioUrl,
    personalWebsiteUrl: aggregate.profile.personalWebsiteUrl,
    email: aggregate.profile.email,
    remotePreference: aggregate.profile.remotePreference,
    targetCompensationMin: aggregate.profile.targetCompensationMin,
    targetCompensationPreferred: aggregate.profile.targetCompensationPreferred,
    availability: aggregate.profile.availability,
    employmentTypes: aggregate.preferences?.employmentTypes ?? [],
    targetIndustries: aggregate.preferences?.targetIndustries ?? [],
    avoidIndustries: aggregate.preferences?.avoidIndustries ?? [],
    targetCompanyTypes: aggregate.preferences?.targetCompanyTypes ?? [],
    avoidCompanies: aggregate.preferences?.avoidCompanies ?? [],
  };
}

export function roleTracksSection(aggregate: CandidateProfileAggregate): RoleTracksSection {
  return {
    roleTracks: aggregate.roleTracks.map((track): RoleTrackSectionItem => ({
      id: track.id,
      name: track.name,
      description: track.description,
      corePositioning: track.corePositioning,
      outreachAngle: track.outreachAngle,
      globalProofRules: track.globalProofRules,
      targetTitles: track.targetTitles,
      keyResponsibilities: track.keyResponsibilities,
      requiredExperiencePatterns: track.requiredExperiencePatterns,
      strongJobSignals: track.strongJobSignals,
      weakJobSignals: track.weakJobSignals,
      mismatchSignals: track.mismatchSignals,
      doNotOverclaim: track.doNotOverclaim,
      resumeIds: track.resumeIds,
    })),
  };
}

export function resumeUploadsSection(aggregate: CandidateProfileAggregate): ResumeUploadsSection {
  return {
    resumes: aggregate.resumes.map((resume): ResumeUploadSectionItem => ({
      id: resume.id,
      name: resume.name,
      fileUrl: resume.fileUrl,
      parsedText: resume.parsedText,
      associatedRoleTrackIds: resume.associatedRoleTrackIds,
      strengths: resume.strengths,
      gaps: resume.gaps,
      useWhen: resume.useWhen,
      avoidWhen: resume.avoidWhen,
      parsingQuality: resume.parsingQuality,
      parsingIssues: resume.parsingIssues,
    })),
  };
}

export function workHistorySection(aggregate: CandidateProfileAggregate): WorkHistorySection {
  return {
    workHistory: aggregate.workHistory.map((item): WorkHistorySectionItem => ({
      id: item.id,
      company: item.company,
      title: item.title,
      startDate: item.startDate,
      endDate: item.endDate,
      currentRole: item.currentRole,
      responsibilities: item.responsibilities,
      accomplishments: item.accomplishments,
      skills: item.skills,
      metrics: item.metrics,
      associatedResumeIds: item.associatedResumeIds,
      source: item.source,
    })),
  };
}

export function proofLibrarySection(aggregate: CandidateProfileAggregate): ProofLibrarySection {
  return {
    projects: aggregate.projects.map((project): ProofLibrarySectionItem => ({
      id: project.id,
      name: project.name,
      link: project.link,
      description: project.description,
      candidateRole: project.candidateRole,
      whatThisProves: project.whatThisProves,
      capabilitiesDemonstrated: project.capabilitiesDemonstrated,
      keyResponsibilitiesSupported: project.keyResponsibilitiesSupported,
      requiredExperienceSupported: project.requiredExperienceSupported,
      industriesRelevant: project.industriesRelevant,
      bestUsedFor: project.bestUsedFor,
      avoidUsingFor: project.avoidUsingFor,
      metricsResults: project.metricsResults,
      caveats: project.caveats,
      confidence: project.confidence,
    })),
  };
}

export function skillsInventorySection(aggregate: CandidateProfileAggregate): SkillsInventorySection {
  return {
    skills: aggregate.skills.map((skill): SkillsInventorySectionItem => ({
      id: skill.id,
      skillName: skill.skillName,
      proficiency: skill.proficiency,
      evidence: skill.evidence,
      relatedProjectIds: skill.relatedProjectIds,
      relatedWorkHistoryIds: skill.relatedWorkHistoryIds,
      bestRoleFit: skill.bestRoleFit,
      doNotOverclaim: skill.doNotOverclaim,
    })),
  };
}

export function qualityNarrativeSection(
  aggregate: CandidateProfileAggregate,
  section: QualitySection,
): QualityNarrativeSection {
  const order = requiredProfileQualityFields[section] ?? [];
  const indexedOrder = new Map(order.map((fieldKey, index) => [fieldKey, index]));
  const fields = [...aggregate.qualityFields]
    .filter((field) => field.section === section)
    .sort((left, right) => {
      const leftIndex = indexedOrder.get(left.fieldKey) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = indexedOrder.get(right.fieldKey) ?? Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      return left.fieldKey.localeCompare(right.fieldKey);
    });

  return {
    section,
    fields: fields.map((field): QualityNarrativeSectionField => ({
      id: field.id,
      fieldKey: field.fieldKey,
      value: field.value,
      quality: field.quality,
      feedback: field.feedback,
    })),
  };
}

export function communicationStyleSection(aggregate: CandidateProfileAggregate): CommunicationStyleSection {
  return {
    settings: aggregate.communicationStyle ? {
      id: aggregate.communicationStyle.id,
      preferredTone: aggregate.communicationStyle.preferredTone,
      formalityLevel: aggregate.communicationStyle.formalityLevel,
      humorLevel: aggregate.communicationStyle.humorLevel,
      messageLengthPreference: aggregate.communicationStyle.messageLengthPreference,
      greetingPreferences: aggregate.communicationStyle.greetingPreferences,
      signoffPreferences: aggregate.communicationStyle.signoffPreferences,
      phrasesToAvoid: aggregate.communicationStyle.phrasesToAvoid,
      phrasesThatSoundLikeMe: aggregate.communicationStyle.phrasesThatSoundLikeMe,
    } : undefined,
    fields: qualityNarrativeSection(aggregate, "communication_style").fields,
  };
}

export function writingSamplesSection(aggregate: CandidateProfileAggregate): WritingSamplesSection {
  return {
    writingSamples: aggregate.writingSamples.map((sample): WritingSamplesSectionItem => ({
      id: sample.id,
      sampleType: sample.sampleType,
      channel: sample.channel,
      text: sample.text,
      whyItWorksOrFails: sample.whyItWorksOrFails,
    })),
  };
}

export function outreachRulesSection(aggregate: CandidateProfileAggregate): OutreachRulesSection {
  return {
    settings: aggregate.outreachRules ? {
      id: aggregate.outreachRules.id,
      globalRules: aggregate.outreachRules.globalRules,
      followUpRules: aggregate.outreachRules.followUpRules,
      linkSelectionRules: aggregate.outreachRules.linkSelectionRules,
    } : undefined,
    fields: qualityNarrativeSection(aggregate, "outreach_rules").fields,
    roleTrackSpecificRules: aggregate.roleTrackOutreachRules.map((rule): RoleTrackOutreachRuleSectionItem => ({
      id: rule.id,
      roleTrackId: rule.roleTrackId,
      rules: rule.rules,
      preferredProofTypes: rule.preferredProofTypes,
      avoidProofTypes: rule.avoidProofTypes,
    })),
  };
}

export function leadershipProfileSection(aggregate: CandidateProfileAggregate): LeadershipProfileSection {
  return {
    visible: aggregate.leadershipProfile?.visible ?? false,
    fields: qualityNarrativeSection(aggregate, "leadership_profile").fields,
  };
}

export function parseIdentitySearchSectionPatch(input: unknown): ParseIdentitySearchPatchResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      issues: [{
        field: "body",
        message: "Expected an identity/search JSON object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  const patch: IdentitySearchSectionPatch = {};
  const issues: SectionValidationIssue[] = [];

  for (const field of stringFields) {
    if (!(field in source)) continue;
    if (source[field] !== null && source[field] !== undefined && typeof source[field] !== "string") {
      issues.push({
        field,
        message: `${field} must be a string.`,
      });
      continue;
    }
    patch[field] = optionalStringFields.has(field)
      ? optionalString(cleanString(source[field]))
      : cleanString(source[field]) ?? "";
  }

  if ("remotePreference" in source) {
    if (!remotePreferences.has(source.remotePreference as RemotePreference)) {
      issues.push({
        field: "remotePreference",
        message: "remotePreference must be remote_only, remote_preferred, hybrid_ok, or onsite_ok.",
      });
    } else {
      patch.remotePreference = source.remotePreference as RemotePreference;
    }
  }

  if ("employmentTypes" in source) {
    const values = cleanStringList(source.employmentTypes);
    const invalid = values?.filter((value) => !employmentTypes.has(value as EmploymentType)) ?? [];
    if (!values || invalid.length > 0) {
      issues.push({
        field: "employmentTypes",
        message: "employmentTypes must contain only full_time, contract, freelance, or part_time.",
      });
    } else {
      patch.employmentTypes = values as EmploymentType[];
    }
  }

  for (const field of stringListFields) {
    if (!(field in source)) continue;
    const values = cleanStringList(source[field]);
    if (!values) {
      issues.push({
        field,
        message: `${field} must be an array of strings.`,
      });
    } else {
      patch[field] = values;
    }
  }

  if ("targetCompensationMin" in source) {
    const value = cleanOptionalNumber(source.targetCompensationMin);
    if (source.targetCompensationMin !== null && source.targetCompensationMin !== undefined && source.targetCompensationMin !== "" && value === undefined) {
      issues.push({
        field: "targetCompensationMin",
        message: "targetCompensationMin must be a non-negative number.",
      });
    } else {
      patch.targetCompensationMin = value;
    }
  }

  if ("targetCompensationPreferred" in source) {
    const value = cleanOptionalNumber(source.targetCompensationPreferred);
    if (source.targetCompensationPreferred !== null && source.targetCompensationPreferred !== undefined && source.targetCompensationPreferred !== "" && value === undefined) {
      issues.push({
        field: "targetCompensationPreferred",
        message: "targetCompensationPreferred must be a non-negative number.",
      });
    } else {
      patch.targetCompensationPreferred = value;
    }
  }

  if (Object.keys(patch).length === 0 && issues.length === 0) {
    issues.push({
      field: "body",
      message: "At least one identity/search field is required.",
    });
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
    };
  }

  return {
    ok: true,
    patch,
  };
}

function parseRoleTrackItem(input: unknown, index: number) {
  const issues: SectionValidationIssue[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      issues: [{
        field: `roleTracks.${index}`,
        message: "Role Track must be an object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  const item: Partial<RoleTrackSectionItem> = {};

  for (const field of roleTrackStringFields) {
    const value = cleanString(source[field]);
    if (!value) {
      issues.push({
        field: `roleTracks.${index}.${field}`,
        message: `${field} is required.`,
      });
    } else {
      item[field] = value;
    }
  }

  for (const field of roleTrackOptionalStringFields) {
    if (!(field in source)) continue;
    item[field] = optionalString(cleanString(source[field]));
  }

  for (const field of roleTrackListFields) {
    const values = cleanStringList(source[field]);
    if (!values) {
      issues.push({
        field: `roleTracks.${index}.${field}`,
        message: `${field} must be an array of strings.`,
      });
    } else {
      item[field] = values;
    }
  }

  if (issues.length > 0) return { issues };
  return {
    item: item as RoleTrackSectionItem,
    issues,
  };
}

export function parseRoleTracksSectionPatch(input: unknown): ParseRoleTracksSectionPatchResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      issues: [{
        field: "body",
        message: "Expected a Role Tracks JSON object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  if (!Array.isArray(source.roleTracks)) {
    return {
      ok: false,
      issues: [{
        field: "roleTracks",
        message: "roleTracks must be an array.",
      }],
    };
  }

  const issues: SectionValidationIssue[] = [];
  const roleTracks = source.roleTracks.flatMap((item, index) => {
    const parsed = parseRoleTrackItem(item, index);
    issues.push(...parsed.issues);
    return parsed.item ? [parsed.item] : [];
  });
  const duplicatedIds = roleTracks
    .map((track) => track.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);

  for (const id of Array.from(new Set(duplicatedIds))) {
    issues.push({
      field: "roleTracks",
      message: `Duplicate Role Track id: ${id}.`,
    });
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
    };
  }

  return {
    ok: true,
    patch: {
      roleTracks,
    },
  };
}

function parseResumeItem(input: unknown, index: number) {
  const issues: SectionValidationIssue[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      issues: [{
        field: `resumes.${index}`,
        message: "Resume must be an object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  const item: Partial<ResumeUploadSectionItem> = {};

  for (const field of resumeStringFields) {
    const value = cleanString(source[field]);
    if (!value) {
      issues.push({
        field: `resumes.${index}.${field}`,
        message: `${field} is required.`,
      });
    } else {
      item[field] = value;
    }
  }

  for (const field of resumeListFields) {
    const values = cleanStringList(source[field]);
    if (!values) {
      issues.push({
        field: `resumes.${index}.${field}`,
        message: `${field} must be an array of strings.`,
      });
    } else {
      item[field] = values;
    }
  }

  if (!parsingQualities.has(source.parsingQuality as ParsingQuality)) {
    issues.push({
      field: `resumes.${index}.parsingQuality`,
      message: "parsingQuality must be failed, weak, or complete.",
    });
  } else {
    item.parsingQuality = source.parsingQuality as ParsingQuality;
  }

  if (issues.length > 0) return { issues };
  return {
    item: item as ResumeUploadSectionItem,
    issues,
  };
}

export function parseResumeUploadsSectionPatch(input: unknown): ParseResumeUploadsSectionPatchResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      issues: [{
        field: "body",
        message: "Expected a Resume Uploads JSON object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  if (!Array.isArray(source.resumes)) {
    return {
      ok: false,
      issues: [{
        field: "resumes",
        message: "resumes must be an array.",
      }],
    };
  }

  const issues: SectionValidationIssue[] = [];
  const resumes = source.resumes.flatMap((item, index) => {
    const parsed = parseResumeItem(item, index);
    issues.push(...parsed.issues);
    return parsed.item ? [parsed.item] : [];
  });
  const duplicatedIds = resumes
    .map((resume) => resume.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);

  for (const id of Array.from(new Set(duplicatedIds))) {
    issues.push({
      field: "resumes",
      message: `Duplicate Resume id: ${id}.`,
    });
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
    };
  }

  return {
    ok: true,
    patch: {
      resumes,
    },
  };
}

function parseWorkHistoryItem(input: unknown, index: number) {
  const issues: SectionValidationIssue[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      issues: [{
        field: `workHistory.${index}`,
        message: "Work History item must be an object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  const item: Partial<WorkHistorySectionItem> = {};

  for (const field of workHistoryStringFields) {
    const value = cleanString(source[field]);
    if (!value) {
      issues.push({
        field: `workHistory.${index}.${field}`,
        message: `${field} is required.`,
      });
    } else {
      item[field] = value;
    }
  }

  for (const field of workHistoryOptionalStringFields) {
    if (!(field in source)) continue;
    item[field] = optionalString(cleanString(source[field]));
  }

  if (typeof source.currentRole !== "boolean") {
    issues.push({
      field: `workHistory.${index}.currentRole`,
      message: "currentRole must be a boolean.",
    });
  } else {
    item.currentRole = source.currentRole;
  }

  for (const field of workHistoryListFields) {
    const values = cleanStringList(source[field]);
    if (!values) {
      issues.push({
        field: `workHistory.${index}.${field}`,
        message: `${field} must be an array of strings.`,
      });
    } else {
      item[field] = values;
    }
  }

  if (!workHistorySources.has(source.source as WorkHistoryItem["source"])) {
    issues.push({
      field: `workHistory.${index}.source`,
      message: "source must be resume_parse or user_corrected.",
    });
  } else {
    item.source = source.source as WorkHistoryItem["source"];
  }

  if (issues.length > 0) return { issues };
  return {
    item: item as WorkHistorySectionItem,
    issues,
  };
}

export function parseWorkHistorySectionPatch(input: unknown): ParseWorkHistorySectionPatchResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      issues: [{
        field: "body",
        message: "Expected a Work History JSON object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  if (!Array.isArray(source.workHistory)) {
    return {
      ok: false,
      issues: [{
        field: "workHistory",
        message: "workHistory must be an array.",
      }],
    };
  }

  const issues: SectionValidationIssue[] = [];
  const workHistory = source.workHistory.flatMap((item, index) => {
    const parsed = parseWorkHistoryItem(item, index);
    issues.push(...parsed.issues);
    return parsed.item ? [parsed.item] : [];
  });
  const duplicatedIds = workHistory
    .map((item) => item.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);

  for (const id of Array.from(new Set(duplicatedIds))) {
    issues.push({
      field: "workHistory",
      message: `Duplicate Work History id: ${id}.`,
    });
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
    };
  }

  return {
    ok: true,
    patch: {
      workHistory,
    },
  };
}

function parseProofItem(input: unknown, index: number) {
  const issues: SectionValidationIssue[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      issues: [{
        field: `projects.${index}`,
        message: "Proof object must be an object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  const item: Partial<ProofLibrarySectionItem> = {};

  for (const field of proofStringFields) {
    const value = cleanString(source[field]);
    if (!value) {
      issues.push({
        field: `projects.${index}.${field}`,
        message: `${field} is required.`,
      });
    } else {
      item[field] = value;
    }
  }

  for (const field of proofOptionalStringFields) {
    if (!(field in source)) continue;
    item[field] = optionalString(cleanString(source[field]));
  }

  for (const field of proofListFields) {
    const values = cleanStringList(source[field]);
    if (!values) {
      issues.push({
        field: `projects.${index}.${field}`,
        message: `${field} must be an array of strings.`,
      });
    } else {
      item[field] = values;
    }
  }

  if (!proofConfidences.has(source.confidence as ProofConfidence)) {
    issues.push({
      field: `projects.${index}.confidence`,
      message: "confidence must be low, medium, or high.",
    });
  } else {
    item.confidence = source.confidence as ProofConfidence;
  }

  if (issues.length > 0) return { issues };
  return {
    item: item as ProofLibrarySectionItem,
    issues,
  };
}

export function parseProofLibrarySectionPatch(input: unknown): ParseProofLibrarySectionPatchResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      issues: [{
        field: "body",
        message: "Expected a Proof Library JSON object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  if (!Array.isArray(source.projects)) {
    return {
      ok: false,
      issues: [{
        field: "projects",
        message: "projects must be an array.",
      }],
    };
  }

  const issues: SectionValidationIssue[] = [];
  const projects = source.projects.flatMap((item, index) => {
    const parsed = parseProofItem(item, index);
    issues.push(...parsed.issues);
    return parsed.item ? [parsed.item] : [];
  });
  const duplicatedIds = projects
    .map((project) => project.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);

  for (const id of Array.from(new Set(duplicatedIds))) {
    issues.push({
      field: "projects",
      message: `Duplicate Proof object id: ${id}.`,
    });
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
    };
  }

  return {
    ok: true,
    patch: {
      projects,
    },
  };
}

function parseSkillItem(input: unknown, index: number) {
  const issues: SectionValidationIssue[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      issues: [{
        field: `skills.${index}`,
        message: "Skill must be an object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  const item: Partial<SkillsInventorySectionItem> = {};

  for (const field of skillStringFields) {
    const value = cleanString(source[field]);
    if (!value) {
      issues.push({
        field: `skills.${index}.${field}`,
        message: `${field} is required.`,
      });
    } else {
      item[field] = value;
    }
  }

  for (const field of skillListFields) {
    const values = cleanStringList(source[field]);
    if (!values) {
      issues.push({
        field: `skills.${index}.${field}`,
        message: `${field} must be an array of strings.`,
      });
    } else {
      item[field] = values;
    }
  }

  if (!skillProficiencies.has(source.proficiency as SkillProficiency)) {
    issues.push({
      field: `skills.${index}.proficiency`,
      message: "proficiency must be working, strong, or expert.",
    });
  } else {
    item.proficiency = source.proficiency as SkillProficiency;
  }

  if (issues.length > 0) return { issues };
  return {
    item: item as SkillsInventorySectionItem,
    issues,
  };
}

export function parseSkillsInventorySectionPatch(input: unknown): ParseSkillsInventorySectionPatchResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      issues: [{
        field: "body",
        message: "Expected a Skills Inventory JSON object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  if (!Array.isArray(source.skills)) {
    return {
      ok: false,
      issues: [{
        field: "skills",
        message: "skills must be an array.",
      }],
    };
  }

  const issues: SectionValidationIssue[] = [];
  const skills = source.skills.flatMap((item, index) => {
    const parsed = parseSkillItem(item, index);
    issues.push(...parsed.issues);
    return parsed.item ? [parsed.item] : [];
  });
  const duplicatedIds = skills
    .map((skill) => skill.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);

  for (const id of Array.from(new Set(duplicatedIds))) {
    issues.push({
      field: "skills",
      message: `Duplicate Skill id: ${id}.`,
    });
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
    };
  }

  return {
    ok: true,
    patch: {
      skills,
    },
  };
}

function parseQualityNarrativeField(
  section: QualitySection,
  input: unknown,
  index: number,
) {
  const issues: SectionValidationIssue[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      issues: [{
        field: `fields.${index}`,
        message: "Quality narrative field must be an object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  const item: Partial<QualityNarrativeSectionField> = {};
  const id = cleanString(source.id);
  const fieldKey = cleanString(source.fieldKey);
  const allowedFieldKeys = new Set(allowedProfileQualityFields[section] ?? []);

  if (!id) {
    issues.push({
      field: `fields.${index}.id`,
      message: "id is required.",
    });
  } else {
    item.id = id;
  }

  if (!fieldKey) {
    issues.push({
      field: `fields.${index}.fieldKey`,
      message: "fieldKey is required.",
    });
  } else if (!allowedFieldKeys.has(fieldKey)) {
    issues.push({
      field: `fields.${index}.fieldKey`,
      message: `${fieldKey} is not valid for ${section}.`,
    });
  } else {
    item.fieldKey = fieldKey;
  }

  if (typeof source.value !== "string") {
    issues.push({
      field: `fields.${index}.value`,
      message: "value must be a string.",
    });
  } else {
    item.value = source.value.trim();
  }

  if (!qualityRatings.has(source.quality as Quality)) {
    issues.push({
      field: `fields.${index}.quality`,
      message: "quality must be weak or complete.",
    });
  } else {
    item.quality = source.quality as Quality;
  }

  if ("feedback" in source) {
    if (source.feedback !== null && source.feedback !== undefined && typeof source.feedback !== "string") {
      issues.push({
        field: `fields.${index}.feedback`,
        message: "feedback must be a string.",
      });
    } else {
      item.feedback = optionalString(cleanString(source.feedback));
    }
  }

  if (issues.length > 0) return { issues };
  return {
    item: item as QualityNarrativeSectionField,
    issues,
  };
}

export function parseQualityNarrativeSectionPatch(
  section: QualitySection,
  input: unknown,
): ParseQualityNarrativeSectionPatchResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      issues: [{
        field: "body",
        message: "Expected a quality narrative JSON object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  if (!Array.isArray(source.fields)) {
    return {
      ok: false,
      issues: [{
        field: "fields",
        message: "fields must be an array.",
      }],
    };
  }

  const issues: SectionValidationIssue[] = [];
  const fields = source.fields.flatMap((item, index) => {
    const parsed = parseQualityNarrativeField(section, item, index);
    issues.push(...parsed.issues);
    return parsed.item ? [parsed.item] : [];
  });
  const duplicatedFieldKeys = fields
    .map((field) => field.fieldKey)
    .filter((fieldKey, index, fieldKeys) => fieldKeys.indexOf(fieldKey) !== index);

  for (const fieldKey of Array.from(new Set(duplicatedFieldKeys))) {
    issues.push({
      field: "fields",
      message: `Duplicate narrative field key: ${fieldKey}.`,
    });
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
    };
  }

  return {
    ok: true,
    patch: {
      section,
      fields,
    },
  };
}

function parseCommunicationStyleSettings(input: unknown) {
  const issues: SectionValidationIssue[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      issues: [{
        field: "settings",
        message: "settings must be an object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  const settings: Partial<CommunicationStyleSettingsSection> = {};

  if ("id" in source) {
    const id = cleanString(source.id);
    if (source.id !== null && source.id !== undefined && !id) {
      issues.push({
        field: "settings.id",
        message: "id must be a string.",
      });
    } else {
      settings.id = id;
    }
  }

  for (const field of communicationStyleListFields) {
    const values = cleanStringList(source[field]);
    if (!values) {
      issues.push({
        field: `settings.${field}`,
        message: `${field} must be an array of strings.`,
      });
    } else {
      settings[field] = values;
    }
  }

  if (!formalityLevels.has(source.formalityLevel as FormalityLevel)) {
    issues.push({
      field: "settings.formalityLevel",
      message: "formalityLevel must be low, medium, or high.",
    });
  } else {
    settings.formalityLevel = source.formalityLevel as FormalityLevel;
  }

  if (!humorLevels.has(source.humorLevel as HumorLevel)) {
    issues.push({
      field: "settings.humorLevel",
      message: "humorLevel must be none, light, or medium.",
    });
  } else {
    settings.humorLevel = source.humorLevel as HumorLevel;
  }

  if (!messageLengthPreferences.has(source.messageLengthPreference as MessageLengthPreference)) {
    issues.push({
      field: "settings.messageLengthPreference",
      message: "messageLengthPreference must be short, medium, or long.",
    });
  } else {
    settings.messageLengthPreference = source.messageLengthPreference as MessageLengthPreference;
  }

  if (issues.length > 0) return { issues };
  return {
    settings: settings as CommunicationStyleSettingsSection,
    issues,
  };
}

export function parseCommunicationStyleSectionPatch(input: unknown): ParseCommunicationStyleSectionPatchResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      issues: [{
        field: "body",
        message: "Expected a Communication Style JSON object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  const parsedSettings = parseCommunicationStyleSettings(source.settings);
  const parsedFields = parseQualityNarrativeSectionPatch("communication_style", {
    fields: source.fields,
  });
  const issues = [...parsedSettings.issues];
  if (parsedFields.ok === false) {
    issues.push(...parsedFields.issues);
  }

  if (issues.length > 0 || !parsedSettings.settings || parsedFields.ok === false) {
    return {
      ok: false,
      issues,
    };
  }

  return {
    ok: true,
    patch: {
      settings: parsedSettings.settings,
      fields: parsedFields.patch.fields,
    },
  };
}

function parseWritingSampleItem(input: unknown, index: number) {
  const issues: SectionValidationIssue[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      issues: [{
        field: `writingSamples.${index}`,
        message: "Writing sample must be an object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  const item: Partial<WritingSamplesSectionItem> = {};
  const id = cleanString(source.id);
  const text = cleanString(source.text);
  const whyItWorksOrFails = cleanString(source.whyItWorksOrFails);

  if (!id) {
    issues.push({
      field: `writingSamples.${index}.id`,
      message: "id is required.",
    });
  } else {
    item.id = id;
  }

  if (!writingSampleTypes.has(source.sampleType as WritingSampleType)) {
    issues.push({
      field: `writingSamples.${index}.sampleType`,
      message: "sampleType must be like or hate.",
    });
  } else {
    item.sampleType = source.sampleType as WritingSampleType;
  }

  if (!writingChannels.has(source.channel as WritingChannel)) {
    issues.push({
      field: `writingSamples.${index}.channel`,
      message: "channel must be linkedin, email, dm, social_post, or other.",
    });
  } else {
    item.channel = source.channel as WritingChannel;
  }

  if (!text) {
    issues.push({
      field: `writingSamples.${index}.text`,
      message: "text is required.",
    });
  } else {
    item.text = text;
  }

  if (!whyItWorksOrFails) {
    issues.push({
      field: `writingSamples.${index}.whyItWorksOrFails`,
      message: "whyItWorksOrFails is required.",
    });
  } else {
    item.whyItWorksOrFails = whyItWorksOrFails;
  }

  if (issues.length > 0) return { issues };
  return {
    item: item as WritingSamplesSectionItem,
    issues,
  };
}

export function parseWritingSamplesSectionPatch(input: unknown): ParseWritingSamplesSectionPatchResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      issues: [{
        field: "body",
        message: "Expected a Writing Samples JSON object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  if (!Array.isArray(source.writingSamples)) {
    return {
      ok: false,
      issues: [{
        field: "writingSamples",
        message: "writingSamples must be an array.",
      }],
    };
  }

  const issues: SectionValidationIssue[] = [];
  const writingSamples = source.writingSamples.flatMap((item, index) => {
    const parsed = parseWritingSampleItem(item, index);
    issues.push(...parsed.issues);
    return parsed.item ? [parsed.item] : [];
  });
  const duplicatedIds = writingSamples
    .map((sample) => sample.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);

  for (const id of Array.from(new Set(duplicatedIds))) {
    issues.push({
      field: "writingSamples",
      message: `Duplicate Writing Sample id: ${id}.`,
    });
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
    };
  }

  return {
    ok: true,
    patch: {
      writingSamples,
    },
  };
}

function parseOutreachRuleSettings(input: unknown) {
  const issues: SectionValidationIssue[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      issues: [{
        field: "settings",
        message: "settings must be an object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  const settings: Partial<OutreachRuleSettingsSection> = {};

  if ("id" in source) {
    const id = cleanString(source.id);
    if (source.id !== null && source.id !== undefined && !id) {
      issues.push({
        field: "settings.id",
        message: "id must be a string.",
      });
    } else {
      settings.id = id;
    }
  }

  for (const field of outreachRuleSettingsListFields) {
    const values = cleanStringList(source[field]);
    if (!values) {
      issues.push({
        field: `settings.${field}`,
        message: `${field} must be an array of strings.`,
      });
    } else {
      settings[field] = values;
    }
  }

  if (issues.length > 0) return { issues };
  return {
    settings: settings as OutreachRuleSettingsSection,
    issues,
  };
}

function parseRoleTrackOutreachRuleItem(input: unknown, index: number) {
  const issues: SectionValidationIssue[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      issues: [{
        field: `roleTrackSpecificRules.${index}`,
        message: "Role Track outreach rule must be an object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  const item: Partial<RoleTrackOutreachRuleSectionItem> = {};

  for (const field of ["id", "roleTrackId"] as const) {
    const value = cleanString(source[field]);
    if (!value) {
      issues.push({
        field: `roleTrackSpecificRules.${index}.${field}`,
        message: `${field} is required.`,
      });
    } else {
      item[field] = value;
    }
  }

  for (const field of roleTrackOutreachRuleListFields) {
    const values = cleanStringList(source[field]);
    if (!values) {
      issues.push({
        field: `roleTrackSpecificRules.${index}.${field}`,
        message: `${field} must be an array of strings.`,
      });
    } else {
      item[field] = values;
    }
  }

  if (issues.length > 0) return { issues };
  return {
    item: item as RoleTrackOutreachRuleSectionItem,
    issues,
  };
}

export function parseOutreachRulesSectionPatch(input: unknown): ParseOutreachRulesSectionPatchResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      issues: [{
        field: "body",
        message: "Expected an Outreach Rules JSON object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  const parsedSettings = parseOutreachRuleSettings(source.settings);
  const parsedFields = parseQualityNarrativeSectionPatch("outreach_rules", {
    fields: source.fields,
  });
  const issues = [...parsedSettings.issues];
  if (parsedFields.ok === false) {
    issues.push(...parsedFields.issues);
  }

  if (!Array.isArray(source.roleTrackSpecificRules)) {
    issues.push({
      field: "roleTrackSpecificRules",
      message: "roleTrackSpecificRules must be an array.",
    });
  }

  const roleTrackSpecificRules = Array.isArray(source.roleTrackSpecificRules)
    ? source.roleTrackSpecificRules.flatMap((item, index) => {
        const parsed = parseRoleTrackOutreachRuleItem(item, index);
        issues.push(...parsed.issues);
        return parsed.item ? [parsed.item] : [];
      })
    : [];
  const duplicatedIds = roleTrackSpecificRules
    .map((rule) => rule.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);

  for (const id of Array.from(new Set(duplicatedIds))) {
    issues.push({
      field: "roleTrackSpecificRules",
      message: `Duplicate Role Track outreach rule id: ${id}.`,
    });
  }

  if (issues.length > 0 || !parsedSettings.settings || parsedFields.ok === false) {
    return {
      ok: false,
      issues,
    };
  }

  return {
    ok: true,
    patch: {
      settings: parsedSettings.settings,
      fields: parsedFields.patch.fields,
      roleTrackSpecificRules,
    },
  };
}

export function validateOutreachRulesSectionPatch(
  aggregate: CandidateProfileAggregate,
  patch: OutreachRulesSectionPatch,
): SectionValidationIssue[] {
  const roleTrackIds = new Set(aggregate.roleTracks.map((track) => track.id));
  const issues: SectionValidationIssue[] = [];

  patch.roleTrackSpecificRules.forEach((rule, index) => {
    if (!roleTrackIds.has(rule.roleTrackId)) {
      issues.push({
        field: `roleTrackSpecificRules.${index}.roleTrackId`,
        message: `Unknown Role Track id: ${rule.roleTrackId}.`,
      });
    }
  });

  return issues;
}

export function parseLeadershipProfileSectionPatch(input: unknown): ParseLeadershipProfileSectionPatchResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      issues: [{
        field: "body",
        message: "Expected a Leadership Profile JSON object.",
      }],
    };
  }

  const source = input as Record<string, unknown>;
  const issues: SectionValidationIssue[] = [];
  const visible = source.visible === true;
  if (typeof source.visible !== "boolean") {
    issues.push({
      field: "visible",
      message: "visible must be a boolean.",
    });
  }

  const parsedFields = parseQualityNarrativeSectionPatch("leadership_profile", {
    fields: source.fields,
  });
  if (parsedFields.ok === false) {
    issues.push(...parsedFields.issues);
  }

  if (issues.length > 0 || parsedFields.ok === false) {
    return {
      ok: false,
      issues,
    };
  }

  return {
    ok: true,
    patch: {
      visible,
      fields: parsedFields.patch.fields,
    },
  };
}

export function validateResumeUploadsSectionPatch(
  aggregate: CandidateProfileAggregate,
  patch: ResumeUploadsSectionPatch,
): SectionValidationIssue[] {
  const roleTrackIds = new Set(aggregate.roleTracks.map((track) => track.id));
  const issues: SectionValidationIssue[] = [];

  patch.resumes.forEach((resume, index) => {
    const invalidRoleTrackIds = resume.associatedRoleTrackIds.filter((roleTrackId) => !roleTrackIds.has(roleTrackId));
    for (const roleTrackId of invalidRoleTrackIds) {
      issues.push({
        field: `resumes.${index}.associatedRoleTrackIds`,
        message: `Unknown Role Track id: ${roleTrackId}.`,
      });
    }
  });

  return issues;
}

export function validateWorkHistorySectionPatch(
  aggregate: CandidateProfileAggregate,
  patch: WorkHistorySectionPatch,
): SectionValidationIssue[] {
  const resumeIds = new Set(aggregate.resumes.map((resume) => resume.id));
  const issues: SectionValidationIssue[] = [];

  patch.workHistory.forEach((item, index) => {
    const invalidResumeIds = item.associatedResumeIds.filter((resumeId) => !resumeIds.has(resumeId));
    for (const resumeId of invalidResumeIds) {
      issues.push({
        field: `workHistory.${index}.associatedResumeIds`,
        message: `Unknown Resume id: ${resumeId}.`,
      });
    }
  });

  return issues;
}

export function validateSkillsInventorySectionPatch(
  aggregate: CandidateProfileAggregate,
  patch: SkillsInventorySectionPatch,
): SectionValidationIssue[] {
  const projectIds = new Set(aggregate.projects.map((project) => project.id));
  const workHistoryIds = new Set(aggregate.workHistory.map((item) => item.id));
  const issues: SectionValidationIssue[] = [];

  patch.skills.forEach((skill, index) => {
    for (const projectId of skill.relatedProjectIds.filter((id) => !projectIds.has(id))) {
      issues.push({
        field: `skills.${index}.relatedProjectIds`,
        message: `Unknown Proof object id: ${projectId}.`,
      });
    }

    for (const workHistoryId of skill.relatedWorkHistoryIds.filter((id) => !workHistoryIds.has(id))) {
      issues.push({
        field: `skills.${index}.relatedWorkHistoryIds`,
        message: `Unknown Work History id: ${workHistoryId}.`,
      });
    }
  });

  return issues;
}

export function applyIdentitySearchSectionPatch(
  aggregate: CandidateProfileAggregate,
  patch: IdentitySearchSectionPatch,
  updatedAt = new Date().toISOString(),
): ApplyIdentitySearchSectionResult {
  const preferences = preferencesForPatch(aggregate, updatedAt);
  const nextAggregate: CandidateProfileAggregate = {
    ...aggregate,
    profile: {
      ...aggregate.profile,
      fullName: patch.fullName ?? aggregate.profile.fullName,
      preferredName: "preferredName" in patch ? patch.preferredName : aggregate.profile.preferredName,
      location: patch.location ?? aggregate.profile.location,
      workAuthorization: patch.workAuthorization ?? aggregate.profile.workAuthorization,
      linkedInUrl: "linkedInUrl" in patch ? patch.linkedInUrl : aggregate.profile.linkedInUrl,
      portfolioUrl: "portfolioUrl" in patch ? patch.portfolioUrl : aggregate.profile.portfolioUrl,
      personalWebsiteUrl: "personalWebsiteUrl" in patch ? patch.personalWebsiteUrl : aggregate.profile.personalWebsiteUrl,
      email: "email" in patch ? patch.email : aggregate.profile.email,
      remotePreference: patch.remotePreference ?? aggregate.profile.remotePreference,
      targetCompensationMin: "targetCompensationMin" in patch ? patch.targetCompensationMin : aggregate.profile.targetCompensationMin,
      targetCompensationPreferred: "targetCompensationPreferred" in patch ? patch.targetCompensationPreferred : aggregate.profile.targetCompensationPreferred,
      availability: patch.availability ?? aggregate.profile.availability,
      updatedAt,
    },
    preferences: {
      ...preferences,
      employmentTypes: patch.employmentTypes ?? preferences.employmentTypes,
      targetIndustries: patch.targetIndustries ?? preferences.targetIndustries,
      avoidIndustries: patch.avoidIndustries ?? preferences.avoidIndustries,
      targetCompanyTypes: patch.targetCompanyTypes ?? preferences.targetCompanyTypes,
      avoidCompanies: patch.avoidCompanies ?? preferences.avoidCompanies,
      updatedAt,
    },
  };
  const profileQuality = evaluateCandidateProfileQuality(nextAggregate, updatedAt);

  return {
    aggregate: {
      ...nextAggregate,
      profile: {
        ...nextAggregate.profile,
        status: profileQuality.status,
      },
      profileQuality,
    },
    section: identitySearchSection(nextAggregate),
    profileQuality,
  };
}

export function applyRoleTracksSectionPatch(
  aggregate: CandidateProfileAggregate,
  patch: RoleTracksSectionPatch,
  updatedAt = new Date().toISOString(),
): ApplyRoleTracksSectionResult {
  const nextRoleTracks: RoleTrack[] = patch.roleTracks.map((track) => ({
    ...track,
    profileId: aggregate.profile.id,
    createdAt: aggregate.roleTracks.find((existing) => existing.id === track.id)?.createdAt ?? updatedAt,
    updatedAt,
  }));
  const nextAggregate: CandidateProfileAggregate = {
    ...aggregate,
    roleTracks: nextRoleTracks,
    profile: {
      ...aggregate.profile,
      updatedAt,
    },
  };
  const profileQuality = evaluateCandidateProfileQuality(nextAggregate, updatedAt);

  return {
    aggregate: {
      ...nextAggregate,
      profile: {
        ...nextAggregate.profile,
        status: profileQuality.status,
      },
      profileQuality,
    },
    section: roleTracksSection(nextAggregate),
    profileQuality,
  };
}

export function applyResumeUploadsSectionPatch(
  aggregate: CandidateProfileAggregate,
  patch: ResumeUploadsSectionPatch,
  updatedAt = new Date().toISOString(),
): ApplyResumeUploadsSectionResult {
  const nextResumes: Resume[] = patch.resumes.map((resume) => ({
    ...resume,
    profileId: aggregate.profile.id,
    createdAt: aggregate.resumes.find((existing) => existing.id === resume.id)?.createdAt ?? updatedAt,
    updatedAt,
  }));
  const activeResumeIds = new Set(nextResumes.map((resume) => resume.id));
  const nextAggregate: CandidateProfileAggregate = {
    ...aggregate,
    resumes: nextResumes,
    roleTracks: aggregate.roleTracks.map((track) => ({
      ...track,
      resumeIds: track.resumeIds.filter((resumeId) => activeResumeIds.has(resumeId)),
      updatedAt,
    })),
    workHistory: aggregate.workHistory.map((item) => ({
      ...item,
      associatedResumeIds: item.associatedResumeIds.filter((resumeId) => activeResumeIds.has(resumeId)),
      updatedAt,
    })),
    profile: {
      ...aggregate.profile,
      updatedAt,
    },
  };
  const profileQuality = evaluateCandidateProfileQuality(nextAggregate, updatedAt);

  return {
    aggregate: {
      ...nextAggregate,
      profile: {
        ...nextAggregate.profile,
        status: profileQuality.status,
      },
      profileQuality,
    },
    section: resumeUploadsSection(nextAggregate),
    profileQuality,
  };
}

export function applyWorkHistorySectionPatch(
  aggregate: CandidateProfileAggregate,
  patch: WorkHistorySectionPatch,
  updatedAt = new Date().toISOString(),
): ApplyWorkHistorySectionResult {
  const nextWorkHistory: WorkHistoryItem[] = patch.workHistory.map((item) => ({
    ...item,
    profileId: aggregate.profile.id,
    createdAt: aggregate.workHistory.find((existing) => existing.id === item.id)?.createdAt ?? updatedAt,
    updatedAt,
  }));
  const activeWorkHistoryIds = new Set(nextWorkHistory.map((item) => item.id));
  const nextAggregate: CandidateProfileAggregate = {
    ...aggregate,
    workHistory: nextWorkHistory,
    skills: aggregate.skills.map((skill) => ({
      ...skill,
      relatedWorkHistoryIds: skill.relatedWorkHistoryIds.filter((workHistoryId) => activeWorkHistoryIds.has(workHistoryId)),
      updatedAt,
    })),
    profile: {
      ...aggregate.profile,
      updatedAt,
    },
  };
  const profileQuality = evaluateCandidateProfileQuality(nextAggregate, updatedAt);

  return {
    aggregate: {
      ...nextAggregate,
      profile: {
        ...nextAggregate.profile,
        status: profileQuality.status,
      },
      profileQuality,
    },
    section: workHistorySection(nextAggregate),
    profileQuality,
  };
}

export function applyProofLibrarySectionPatch(
  aggregate: CandidateProfileAggregate,
  patch: ProofLibrarySectionPatch,
  updatedAt = new Date().toISOString(),
): ApplyProofLibrarySectionResult {
  const nextProjects: ProjectProof[] = patch.projects.map((project) => ({
    ...project,
    profileId: aggregate.profile.id,
    createdAt: aggregate.projects.find((existing) => existing.id === project.id)?.createdAt ?? updatedAt,
    updatedAt,
  }));
  const activeProjectIds = new Set(nextProjects.map((project) => project.id));
  const nextAggregate: CandidateProfileAggregate = {
    ...aggregate,
    projects: nextProjects,
    skills: aggregate.skills.map((skill) => ({
      ...skill,
      relatedProjectIds: skill.relatedProjectIds.filter((projectId) => activeProjectIds.has(projectId)),
      updatedAt,
    })),
    profile: {
      ...aggregate.profile,
      updatedAt,
    },
  };
  const profileQuality = evaluateCandidateProfileQuality(nextAggregate, updatedAt);

  return {
    aggregate: {
      ...nextAggregate,
      profile: {
        ...nextAggregate.profile,
        status: profileQuality.status,
      },
      profileQuality,
    },
    section: proofLibrarySection(nextAggregate),
    profileQuality,
  };
}

export function applySkillsInventorySectionPatch(
  aggregate: CandidateProfileAggregate,
  patch: SkillsInventorySectionPatch,
  updatedAt = new Date().toISOString(),
): ApplySkillsInventorySectionResult {
  const nextSkills: SkillProfile[] = patch.skills.map((skill) => ({
    ...skill,
    profileId: aggregate.profile.id,
    createdAt: aggregate.skills.find((existing) => existing.id === skill.id)?.createdAt ?? updatedAt,
    updatedAt,
  }));
  const nextAggregate: CandidateProfileAggregate = {
    ...aggregate,
    skills: nextSkills,
    profile: {
      ...aggregate.profile,
      updatedAt,
    },
  };
  const profileQuality = evaluateCandidateProfileQuality(nextAggregate, updatedAt);

  return {
    aggregate: {
      ...nextAggregate,
      profile: {
        ...nextAggregate.profile,
        status: profileQuality.status,
      },
      profileQuality,
    },
    section: skillsInventorySection(nextAggregate),
    profileQuality,
  };
}

export function applyQualityNarrativeSectionPatch(
  aggregate: CandidateProfileAggregate,
  section: QualitySection,
  patch: QualityNarrativeSectionPatch,
  updatedAt = new Date().toISOString(),
): ApplyQualityNarrativeSectionResult {
  const existingFields = new Map(
    aggregate.qualityFields
      .filter((field) => field.section === section)
      .map((field) => [field.id, field]),
  );
  const nextSectionFields: QualityScoredTextField[] = patch.fields.map((field) => ({
    ...field,
    profileId: aggregate.profile.id,
    section,
    feedback: field.feedback,
    createdAt: existingFields.get(field.id)?.createdAt ?? updatedAt,
    updatedAt,
  }));
  const nextAggregate: CandidateProfileAggregate = {
    ...aggregate,
    qualityFields: [
      ...aggregate.qualityFields.filter((field) => field.section !== section),
      ...nextSectionFields,
    ],
    profile: {
      ...aggregate.profile,
      updatedAt,
    },
  };
  const profileQuality = evaluateCandidateProfileQuality(nextAggregate, updatedAt);

  return {
    aggregate: {
      ...nextAggregate,
      profile: {
        ...nextAggregate.profile,
        status: profileQuality.status,
      },
      profileQuality,
    },
    section: qualityNarrativeSection(nextAggregate, section),
    profileQuality,
  };
}

export function applyCommunicationStyleSectionPatch(
  aggregate: CandidateProfileAggregate,
  patch: CommunicationStyleSectionPatch,
  updatedAt = new Date().toISOString(),
): ApplyCommunicationStyleSectionResult {
  const section = "communication_style";
  const existingFields = new Map(
    aggregate.qualityFields
      .filter((field) => field.section === section)
      .map((field) => [field.id, field]),
  );
  const nextSectionFields: QualityScoredTextField[] = patch.fields.map((field) => ({
    ...field,
    profileId: aggregate.profile.id,
    section,
    feedback: field.feedback,
    createdAt: existingFields.get(field.id)?.createdAt ?? updatedAt,
    updatedAt,
  }));
  const nextCommunicationStyle: CommunicationStyleSettings = {
    ...patch.settings,
    id: patch.settings.id ?? aggregate.communicationStyle?.id ?? `communication-style-${aggregate.profile.id}`,
    profileId: aggregate.profile.id,
    createdAt: aggregate.communicationStyle?.createdAt ?? updatedAt,
    updatedAt,
  };
  const nextAggregate: CandidateProfileAggregate = {
    ...aggregate,
    communicationStyle: nextCommunicationStyle,
    qualityFields: [
      ...aggregate.qualityFields.filter((field) => field.section !== section),
      ...nextSectionFields,
    ],
    profile: {
      ...aggregate.profile,
      updatedAt,
    },
  };
  const profileQuality = evaluateCandidateProfileQuality(nextAggregate, updatedAt);

  return {
    aggregate: {
      ...nextAggregate,
      profile: {
        ...nextAggregate.profile,
        status: profileQuality.status,
      },
      profileQuality,
    },
    section: communicationStyleSection(nextAggregate),
    profileQuality,
  };
}

export function applyWritingSamplesSectionPatch(
  aggregate: CandidateProfileAggregate,
  patch: WritingSamplesSectionPatch,
  updatedAt = new Date().toISOString(),
): ApplyWritingSamplesSectionResult {
  const nextWritingSamples: WritingSample[] = patch.writingSamples.map((sample) => ({
    ...sample,
    profileId: aggregate.profile.id,
    createdAt: aggregate.writingSamples.find((existing) => existing.id === sample.id)?.createdAt ?? updatedAt,
    updatedAt,
  }));
  const nextAggregate: CandidateProfileAggregate = {
    ...aggregate,
    writingSamples: nextWritingSamples,
    profile: {
      ...aggregate.profile,
      updatedAt,
    },
  };
  const profileQuality = evaluateCandidateProfileQuality(nextAggregate, updatedAt);

  return {
    aggregate: {
      ...nextAggregate,
      profile: {
        ...nextAggregate.profile,
        status: profileQuality.status,
      },
      profileQuality,
    },
    section: writingSamplesSection(nextAggregate),
    profileQuality,
  };
}

export function applyOutreachRulesSectionPatch(
  aggregate: CandidateProfileAggregate,
  patch: OutreachRulesSectionPatch,
  updatedAt = new Date().toISOString(),
): ApplyOutreachRulesSectionResult {
  const section = "outreach_rules";
  const existingFields = new Map(
    aggregate.qualityFields
      .filter((field) => field.section === section)
      .map((field) => [field.id, field]),
  );
  const nextSectionFields: QualityScoredTextField[] = patch.fields.map((field) => ({
    ...field,
    profileId: aggregate.profile.id,
    section,
    feedback: field.feedback,
    createdAt: existingFields.get(field.id)?.createdAt ?? updatedAt,
    updatedAt,
  }));
  const nextOutreachRules: OutreachRuleSet = {
    ...patch.settings,
    id: patch.settings.id ?? aggregate.outreachRules?.id ?? `outreach-rules-${aggregate.profile.id}`,
    profileId: aggregate.profile.id,
    createdAt: aggregate.outreachRules?.createdAt ?? updatedAt,
    updatedAt,
  };
  const nextRoleTrackOutreachRules: RoleTrackOutreachRule[] = patch.roleTrackSpecificRules.map((rule) => ({
    ...rule,
    createdAt: aggregate.roleTrackOutreachRules.find((existing) => existing.id === rule.id)?.createdAt ?? updatedAt,
    updatedAt,
  }));
  const nextAggregate: CandidateProfileAggregate = {
    ...aggregate,
    outreachRules: nextOutreachRules,
    roleTrackOutreachRules: nextRoleTrackOutreachRules,
    qualityFields: [
      ...aggregate.qualityFields.filter((field) => field.section !== section),
      ...nextSectionFields,
    ],
    profile: {
      ...aggregate.profile,
      updatedAt,
    },
  };
  const profileQuality = evaluateCandidateProfileQuality(nextAggregate, updatedAt);

  return {
    aggregate: {
      ...nextAggregate,
      profile: {
        ...nextAggregate.profile,
        status: profileQuality.status,
      },
      profileQuality,
    },
    section: outreachRulesSection(nextAggregate),
    profileQuality,
  };
}

export function applyLeadershipProfileSectionPatch(
  aggregate: CandidateProfileAggregate,
  patch: LeadershipProfileSectionPatch,
  updatedAt = new Date().toISOString(),
): ApplyLeadershipProfileSectionResult {
  const section = "leadership_profile";
  const existingFields = new Map(
    aggregate.qualityFields
      .filter((field) => field.section === section)
      .map((field) => [field.id, field]),
  );
  const nextSectionFields: QualityScoredTextField[] = patch.fields.map((field) => ({
    ...field,
    profileId: aggregate.profile.id,
    section,
    feedback: field.feedback,
    createdAt: existingFields.get(field.id)?.createdAt ?? updatedAt,
    updatedAt,
  }));
  const nextLeadershipProfile: LeadershipProfile = {
    id: aggregate.leadershipProfile?.id ?? `leadership-profile-${aggregate.profile.id}`,
    profileId: aggregate.profile.id,
    visible: patch.visible,
    createdAt: aggregate.leadershipProfile?.createdAt ?? updatedAt,
    updatedAt,
  };
  const nextAggregate: CandidateProfileAggregate = {
    ...aggregate,
    leadershipProfile: nextLeadershipProfile,
    qualityFields: [
      ...aggregate.qualityFields.filter((field) => field.section !== section),
      ...nextSectionFields,
    ],
    profile: {
      ...aggregate.profile,
      updatedAt,
    },
  };
  const profileQuality = evaluateCandidateProfileQuality(nextAggregate, updatedAt);

  return {
    aggregate: {
      ...nextAggregate,
      profile: {
        ...nextAggregate.profile,
        status: profileQuality.status,
      },
      profileQuality,
    },
    section: leadershipProfileSection(nextAggregate),
    profileQuality,
  };
}

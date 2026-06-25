"use client";

import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clearPublicProfileAccessToken, readPublicProfileAccessToken, writePublicProfileAccessToken } from "@/lib/public-profile/browser-session";
import { requestPublicProfileApi } from "@/lib/public-profile/client";
import type { PublicProfileOnboardingSection, PublicProfileOnboardingSectionKey } from "@/lib/public-profile/onboarding";
import styles from "./onboarding.module.css";

type IdentitySearchSection = {
  fullName: string;
  preferredName?: string;
  location: string;
  workAuthorization: string;
  linkedInUrl?: string;
  portfolioUrl?: string;
  personalWebsiteUrl?: string;
  email?: string;
  remotePreference: "remote_only" | "remote_preferred" | "hybrid_ok" | "onsite_ok";
  targetCompensationMin?: number;
  targetCompensationPreferred?: number;
  availability: string;
  employmentTypes: string[];
  targetIndustries: string[];
  avoidIndustries: string[];
  targetCompanyTypes: string[];
  avoidCompanies: string[];
};

type RoleTrackSectionItem = {
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

type RoleTracksSection = {
  roleTracks: RoleTrackSectionItem[];
};

type ParsingQuality = "failed" | "weak" | "complete";

type ResumeUploadSectionItem = {
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

type ResumeUploadsSection = {
  resumes: ResumeUploadSectionItem[];
};

type WorkHistorySource = "resume_parse" | "user_corrected";

type WorkHistorySectionItem = {
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
  source: WorkHistorySource;
};

type WorkHistorySection = {
  workHistory: WorkHistorySectionItem[];
};

type ProofConfidence = "low" | "medium" | "high";

type ProofLibrarySectionItem = {
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

type ProofLibrarySection = {
  projects: ProofLibrarySectionItem[];
};

type SkillProficiency = "working" | "strong" | "expert";

type SkillsInventorySectionItem = {
  id: string;
  skillName: string;
  proficiency: SkillProficiency;
  evidence: string[];
  relatedProjectIds: string[];
  relatedWorkHistoryIds: string[];
  bestRoleFit: string[];
  doNotOverclaim: string[];
};

type SkillsInventorySection = {
  skills: SkillsInventorySectionItem[];
};

type Quality = "weak" | "complete";

type QualitySection =
  | "why_people_hire_me"
  | "operating_style"
  | "decision_style"
  | "communication_style"
  | "ai_misreadings"
  | "outreach_rules"
  | "leadership_profile";

type QualityNarrativeSectionField = {
  id: string;
  fieldKey: string;
  value: string;
  quality: Quality;
  feedback?: string;
};

type QualityNarrativeSection = {
  section: QualitySection;
  fields: QualityNarrativeSectionField[];
};

type FormalityLevel = "low" | "medium" | "high";
type HumorLevel = "none" | "light" | "medium";
type MessageLengthPreference = "short" | "medium" | "long";

type CommunicationStyleSettingsSection = {
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

type CommunicationStyleSection = {
  settings?: CommunicationStyleSettingsSection;
  fields: QualityNarrativeSectionField[];
};

type WritingSampleType = "like" | "hate";
type WritingChannel = "linkedin" | "email" | "dm" | "social_post" | "other";

type WritingSamplesSectionItem = {
  id: string;
  sampleType: WritingSampleType;
  channel: WritingChannel;
  text: string;
  whyItWorksOrFails: string;
};

type WritingSamplesSection = {
  writingSamples: WritingSamplesSectionItem[];
};

type OutreachRuleSettingsSection = {
  id?: string;
  globalRules: string[];
  followUpRules: string[];
  linkSelectionRules: string[];
};

type RoleTrackOutreachRuleSectionItem = {
  id: string;
  roleTrackId: string;
  rules: string[];
  preferredProofTypes: string[];
  avoidProofTypes: string[];
};

type OutreachRulesSection = {
  settings?: OutreachRuleSettingsSection;
  fields: QualityNarrativeSectionField[];
  roleTrackSpecificRules: RoleTrackOutreachRuleSectionItem[];
};

type LeadershipProfileSection = {
  visible: boolean;
  fields: QualityNarrativeSectionField[];
};

type ProfileQualitySummary = {
  status: "incomplete" | "complete";
  incompleteReasons: string[];
  weakFields: string[];
  weakResponseCount: number;
  lastCheckedAt: string;
};

type SectionReadinessStatus = "not_loaded" | "optional" | "complete" | "incomplete";

type SectionResponse<T> = {
  status: string;
  profileId: string;
  profileStatus: "incomplete" | "complete";
  section: T;
  profileQuality: ProfileQualitySummary;
};

type TokenResponse = {
  access_token?: string;
  error_description?: string;
  msg?: string;
};

const notLoadedReadinessLabel = "Not loaded";

const qualitySectionByOnboardingKey: Partial<Record<PublicProfileOnboardingSectionKey, QualitySection>> = {
  whyPeopleHireMe: "why_people_hire_me",
  operatingStyle: "operating_style",
  decisionStyle: "decision_style",
  communicationStyle: "communication_style",
  aiMisreadings: "ai_misreadings",
  outreachRules: "outreach_rules",
  leadershipProfile: "leadership_profile",
};

const qualityNarrativeFieldLabels: Record<QualitySection, Record<string, string>> = {
  why_people_hire_me: {
    problemsPeopleBringMe: "Problems people bring me",
    whatBreaksIfImNotThere: "What breaks if I am not there",
    messesICleanUp: "Messes I clean up",
    teamsThatBenefitFromMe: "Teams that benefit from me",
    situationsWhereIAmMostUseful: "Situations where I am most useful",
    situationsWhereIAmNotUseful: "Situations where I am not useful",
  },
  operating_style: {
    howIApproachProblems: "How I approach problems",
    howIHandleAmbiguity: "How I handle ambiguity",
    howIWorkWithTeams: "How I work with teams",
    whatIValue: "What I value",
    whatIReject: "What I reject",
  },
  decision_style: {
    howIEvaluateRoles: "How I evaluate roles",
    whatMakesRoleWorthPursuing: "What makes a role worth pursuing",
    whatMakesRoleBadFit: "What makes a role a bad fit",
    whatILookForInCompanies: "What I look for in companies",
    redFlags: "Red flags",
    greenFlags: "Green flags",
  },
  communication_style: {
    voiceDescription: "Voice description",
    whatIShouldSoundLike: "What I should sound like",
    whatIShouldNeverSoundLike: "What I should never sound like",
  },
  ai_misreadings: {
    wrongAssumptions: "Wrong assumptions",
    badDefaultFramings: "Bad default framings",
    skillsNotToExaggerate: "Skills not to exaggerate",
    rolesNotToForceMeInto: "Roles not to force me into",
    languageThatMisrepresentsMe: "Language that misrepresents me",
  },
  outreach_rules: {
    hiringManagerApproach: "Hiring manager approach",
    recruiterApproach: "Recruiter approach",
    functionalLeaderApproach: "Functional leader approach",
    executiveSponsorApproach: "Executive sponsor approach",
    noContactRoutingApproach: "No-contact routing approach",
  },
  leadership_profile: {
    leadershipStyle: "Leadership style",
    teamManagementStyle: "Team management style",
    stakeholderManagementStyle: "Stakeholder management style",
    conflictStyle: "Conflict style",
    executiveCommunicationStyle: "Executive communication style",
  },
};

const emptyIdentity: IdentitySearchSection = {
  fullName: "",
  location: "",
  workAuthorization: "",
  remotePreference: "remote_preferred",
  availability: "",
  employmentTypes: [],
  targetIndustries: [],
  avoidIndustries: [],
  targetCompanyTypes: [],
  avoidCompanies: [],
};

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  const segment = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${segment()}${segment()}-${segment()}-4${segment().slice(1)}-8${segment().slice(1)}-${segment()}${segment()}${segment()}`;
}

function emptyRoleTrack(): RoleTrackSectionItem {
  return {
    id: createClientId(),
    name: "",
    description: "",
    corePositioning: "",
    outreachAngle: "",
    targetTitles: [],
    keyResponsibilities: [],
    requiredExperiencePatterns: [],
    strongJobSignals: [],
    weakJobSignals: [],
    mismatchSignals: [],
    doNotOverclaim: [],
    resumeIds: [],
  };
}

function emptyResume(): ResumeUploadSectionItem {
  return {
    id: createClientId(),
    name: "",
    fileUrl: "",
    parsedText: "",
    associatedRoleTrackIds: [],
    strengths: [],
    gaps: [],
    useWhen: [],
    avoidWhen: [],
    parsingQuality: "weak",
    parsingIssues: [],
  };
}

function emptyWorkHistoryItem(): WorkHistorySectionItem {
  return {
    id: createClientId(),
    company: "",
    title: "",
    currentRole: false,
    responsibilities: [],
    accomplishments: [],
    skills: [],
    metrics: [],
    associatedResumeIds: [],
    source: "user_corrected",
  };
}

function emptyProofProject(): ProofLibrarySectionItem {
  return {
    id: createClientId(),
    name: "",
    link: "",
    description: "",
    candidateRole: "",
    whatThisProves: [],
    capabilitiesDemonstrated: [],
    keyResponsibilitiesSupported: [],
    requiredExperienceSupported: [],
    industriesRelevant: [],
    bestUsedFor: [],
    avoidUsingFor: [],
    metricsResults: [],
    caveats: [],
    confidence: "medium",
  };
}

function emptySkill(): SkillsInventorySectionItem {
  return {
    id: createClientId(),
    skillName: "",
    proficiency: "strong",
    evidence: [],
    relatedProjectIds: [],
    relatedWorkHistoryIds: [],
    bestRoleFit: [],
    doNotOverclaim: [],
  };
}

function emptyQualityNarrativeField(section: QualitySection, fieldKey: string): QualityNarrativeSectionField {
  return {
    id: createClientId(),
    fieldKey,
    value: "",
    quality: "weak",
    feedback: "",
  };
}

function completeQualityNarrativeSection(section: QualitySection, fields: QualityNarrativeSectionField[] = []): QualityNarrativeSection {
  const fieldsByKey = new Map(fields.map((field) => [field.fieldKey, field]));
  const orderedFields = Object.keys(qualityNarrativeFieldLabels[section]).map((fieldKey) => {
    return fieldsByKey.get(fieldKey) ?? emptyQualityNarrativeField(section, fieldKey);
  });

  return {
    section,
    fields: orderedFields,
  };
}

function emptyCommunicationSettings(): CommunicationStyleSettingsSection {
  return {
    preferredTone: [],
    formalityLevel: "medium",
    humorLevel: "light",
    messageLengthPreference: "medium",
    greetingPreferences: [],
    signoffPreferences: [],
    phrasesToAvoid: [],
    phrasesThatSoundLikeMe: [],
  };
}

function completeCommunicationStyleSection(section?: CommunicationStyleSection): CommunicationStyleSection {
  return {
    settings: section?.settings ?? emptyCommunicationSettings(),
    fields: completeQualityNarrativeSection("communication_style", section?.fields).fields,
  };
}

function emptyWritingSample(): WritingSamplesSectionItem {
  return {
    id: createClientId(),
    sampleType: "like",
    channel: "email",
    text: "",
    whyItWorksOrFails: "",
  };
}

function emptyOutreachSettings(): OutreachRuleSettingsSection {
  return {
    globalRules: [],
    followUpRules: [],
    linkSelectionRules: [],
  };
}

function emptyRoleTrackOutreachRule(roleTrackId = ""): RoleTrackOutreachRuleSectionItem {
  return {
    id: createClientId(),
    roleTrackId,
    rules: [],
    preferredProofTypes: [],
    avoidProofTypes: [],
  };
}

function completeOutreachRulesSection(section?: OutreachRulesSection): OutreachRulesSection {
  return {
    settings: section?.settings ?? emptyOutreachSettings(),
    fields: completeQualityNarrativeSection("outreach_rules", section?.fields).fields,
    roleTrackSpecificRules: section?.roleTrackSpecificRules ?? [],
  };
}

function completeLeadershipProfileSection(section?: LeadershipProfileSection): LeadershipProfileSection {
  return {
    visible: section?.visible ?? false,
    fields: completeQualityNarrativeSection("leadership_profile", section?.fields).fields,
  };
}

function listToText(values: string[] | undefined) {
  return (values ?? []).join(", ");
}

function textToList(value: string) {
  return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));
}

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
}

function reasonBelongsToSection(sectionKey: PublicProfileOnboardingSectionKey, reason: string) {
  const qualitySection = qualitySectionByOnboardingKey[sectionKey];
  if (qualitySection && reason.includes(`${qualitySection}.`)) return true;

  switch (sectionKey) {
    case "identitySearch":
      return [
        "Full name is required.",
        "Location is required.",
        "Work authorization is required.",
        "Remote preference is required.",
        "Availability is required.",
        "At least one employment type is required.",
      ].includes(reason);
    case "roleTracks":
      return reason.startsWith("At least one Role Track") || reason.startsWith("Role Track ");
    case "resumes":
      return reason.startsWith("At least one resume") || reason.startsWith("Resume ");
    case "workHistory":
      return reason.startsWith("Parsed work history") || reason.startsWith("Work history ");
    case "proofLibrary":
      return reason.startsWith("At least one Project") || reason.startsWith("Project ");
    case "skills":
      return reason.startsWith("At least one skill") || reason.startsWith("Skill ");
    case "communicationStyle":
      return [
        "Communication style settings are required.",
        "Preferred tone is required.",
        "Message length preference is required.",
        "Greeting preferences are required.",
        "Signoff preferences are required.",
        "Phrases to avoid are required.",
        "Phrases that sound like me are required.",
      ].includes(reason) || reason.includes("communication_style.");
    case "writingSamples":
      return reason.startsWith("At least one liked writing sample") || reason.startsWith("At least one hated writing sample");
    case "outreachRules":
      return [
        "Outreach rule settings are required.",
        "Global outreach rules are required.",
        "Follow-up rules are required.",
        "Link selection rules are required.",
      ].includes(reason) || reason.includes("outreach_rules.");
    case "leadershipProfile":
      return reason.includes("leadership_profile.");
    default:
      return false;
  }
}

function weakFieldBelongsToSection(sectionKey: PublicProfileOnboardingSectionKey, weakField: string) {
  const qualitySection = qualitySectionByOnboardingKey[sectionKey];
  return Boolean(qualitySection && weakField.startsWith(`${qualitySection}.`));
}

function readinessLabel(status: SectionReadinessStatus) {
  if (status === "not_loaded") return notLoadedReadinessLabel;
  if (status === "optional") return "Optional";
  if (status === "complete") return "Complete";
  return "Needs work";
}

export default function OnboardingClient({
  sections,
}: {
  sections: PublicProfileOnboardingSection[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [identity, setIdentity] = useState<IdentitySearchSection>(emptyIdentity);
  const [roleTracks, setRoleTracks] = useState<RoleTrackSectionItem[]>([]);
  const [resumes, setResumes] = useState<ResumeUploadSectionItem[]>([]);
  const [workHistory, setWorkHistory] = useState<WorkHistorySectionItem[]>([]);
  const [proofProjects, setProofProjects] = useState<ProofLibrarySectionItem[]>([]);
  const [skills, setSkills] = useState<SkillsInventorySectionItem[]>([]);
  const [whyPeopleHireMe, setWhyPeopleHireMe] = useState<QualityNarrativeSection>(() => completeQualityNarrativeSection("why_people_hire_me"));
  const [operatingStyle, setOperatingStyle] = useState<QualityNarrativeSection>(() => completeQualityNarrativeSection("operating_style"));
  const [decisionStyle, setDecisionStyle] = useState<QualityNarrativeSection>(() => completeQualityNarrativeSection("decision_style"));
  const [aiMisreadings, setAiMisreadings] = useState<QualityNarrativeSection>(() => completeQualityNarrativeSection("ai_misreadings"));
  const [communicationStyle, setCommunicationStyle] = useState<CommunicationStyleSection>(() => completeCommunicationStyleSection());
  const [writingSamples, setWritingSamples] = useState<WritingSamplesSectionItem[]>([]);
  const [outreachRules, setOutreachRules] = useState<OutreachRulesSection>(() => completeOutreachRulesSection());
  const [leadershipProfile, setLeadershipProfile] = useState<LeadershipProfileSection>(() => completeLeadershipProfileSection());
  const [profileStatus, setProfileStatus] = useState<"incomplete" | "complete">("incomplete");
  const [profileQuality, setProfileQuality] = useState<ProfileQualitySummary | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [message, setMessage] = useState("Sign in to bootstrap your candidate profile.");
  const [busy, setBusy] = useState(false);
  const requiredSections = useMemo(() => sections.filter((section) => section.required), [sections]);

  const applyProfileQuality = useCallback((summary: ProfileQualitySummary) => {
    setProfileQuality(summary);
    setProfileStatus(summary.status);
    setIssues(summary.incompleteReasons);
  }, []);

  const readinessBySection = useMemo(() => {
    return new Map(sections.map((section) => {
      const blockers = profileQuality?.incompleteReasons.filter((reason) => reasonBelongsToSection(section.key, reason)) ?? [];
      const weakFields = profileQuality?.weakFields.filter((weakField) => weakFieldBelongsToSection(section.key, weakField)) ?? [];
      const status: SectionReadinessStatus = !profileQuality
        ? "not_loaded"
        : !section.required
          ? "optional"
          : blockers.length === 0 && weakFields.length === 0
            ? "complete"
            : "incomplete";

      return [section.key, { status, blockers, weakFields }];
    }));
  }, [profileQuality, sections]);

  const completeRequiredSections = useMemo(() => {
    if (!profileQuality) return 0;
    return requiredSections.filter((section) => readinessBySection.get(section.key)?.status === "complete").length;
  }, [profileQuality, readinessBySection, requiredSections]);

  const loadProfile = useCallback(async (token: string) => {
    const bootstrap = await requestPublicProfileApi<{
      profileStatus: "incomplete" | "complete";
      profileQuality: SectionResponse<IdentitySearchSection>["profileQuality"];
    }>("/api/public-profile/bootstrap", {
      method: "POST",
      accessToken: token,
    });

    const [
      identityResponse,
      roleTracksResponse,
      resumeResponse,
      workHistoryResponse,
      proofLibraryResponse,
      skillsResponse,
      whyPeopleHireMeResponse,
      operatingStyleResponse,
      decisionStyleResponse,
      aiMisreadingsResponse,
      communicationStyleResponse,
      writingSamplesResponse,
      outreachRulesResponse,
      leadershipProfileResponse,
    ] = await Promise.all([
      requestPublicProfileApi<SectionResponse<IdentitySearchSection>>("/api/public-profile/identity-search", {
        method: "GET",
        accessToken: token,
      }),
      requestPublicProfileApi<SectionResponse<RoleTracksSection>>("/api/public-profile/role-tracks", {
        method: "GET",
        accessToken: token,
      }),
      requestPublicProfileApi<SectionResponse<ResumeUploadsSection>>("/api/public-profile/resumes", {
        method: "GET",
        accessToken: token,
      }),
      requestPublicProfileApi<SectionResponse<WorkHistorySection>>("/api/public-profile/work-history", {
        method: "GET",
        accessToken: token,
      }),
      requestPublicProfileApi<SectionResponse<ProofLibrarySection>>("/api/public-profile/proof-library", {
        method: "GET",
        accessToken: token,
      }),
      requestPublicProfileApi<SectionResponse<SkillsInventorySection>>("/api/public-profile/skills", {
        method: "GET",
        accessToken: token,
      }),
      requestPublicProfileApi<SectionResponse<QualityNarrativeSection>>("/api/public-profile/why-people-hire-me", {
        method: "GET",
        accessToken: token,
      }),
      requestPublicProfileApi<SectionResponse<QualityNarrativeSection>>("/api/public-profile/operating-style", {
        method: "GET",
        accessToken: token,
      }),
      requestPublicProfileApi<SectionResponse<QualityNarrativeSection>>("/api/public-profile/decision-style", {
        method: "GET",
        accessToken: token,
      }),
      requestPublicProfileApi<SectionResponse<QualityNarrativeSection>>("/api/public-profile/ai-misreadings", {
        method: "GET",
        accessToken: token,
      }),
      requestPublicProfileApi<SectionResponse<CommunicationStyleSection>>("/api/public-profile/communication-style", {
        method: "GET",
        accessToken: token,
      }),
      requestPublicProfileApi<SectionResponse<WritingSamplesSection>>("/api/public-profile/writing-samples", {
        method: "GET",
        accessToken: token,
      }),
      requestPublicProfileApi<SectionResponse<OutreachRulesSection>>("/api/public-profile/outreach-rules", {
        method: "GET",
        accessToken: token,
      }),
      requestPublicProfileApi<SectionResponse<LeadershipProfileSection>>("/api/public-profile/leadership-profile", {
        method: "GET",
        accessToken: token,
      }),
    ]);

    setIdentity(identityResponse.section);
    setRoleTracks(roleTracksResponse.section.roleTracks);
    setResumes(resumeResponse.section.resumes);
    setWorkHistory(workHistoryResponse.section.workHistory);
    setProofProjects(proofLibraryResponse.section.projects);
    setSkills(skillsResponse.section.skills);
    setWhyPeopleHireMe(completeQualityNarrativeSection("why_people_hire_me", whyPeopleHireMeResponse.section.fields));
    setOperatingStyle(completeQualityNarrativeSection("operating_style", operatingStyleResponse.section.fields));
    setDecisionStyle(completeQualityNarrativeSection("decision_style", decisionStyleResponse.section.fields));
    setAiMisreadings(completeQualityNarrativeSection("ai_misreadings", aiMisreadingsResponse.section.fields));
    setCommunicationStyle(completeCommunicationStyleSection(communicationStyleResponse.section));
    setWritingSamples(writingSamplesResponse.section.writingSamples);
    setOutreachRules(completeOutreachRulesSection(outreachRulesResponse.section));
    setLeadershipProfile(completeLeadershipProfileSection(leadershipProfileResponse.section));
    applyProfileQuality(identityResponse.profileQuality.status ? identityResponse.profileQuality : bootstrap.profileQuality);
    setMessage("Profile sections loaded. Autosave is ready.");
  }, [applyProfileQuality]);

  const updateRoleTrack = useCallback((id: string, patch: Partial<RoleTrackSectionItem>) => {
    setRoleTracks((tracks) => tracks.map((track) => track.id === id ? { ...track, ...patch } : track));
  }, []);

  const updateResume = useCallback((id: string, patch: Partial<ResumeUploadSectionItem>) => {
    setResumes((items) => items.map((resume) => resume.id === id ? { ...resume, ...patch } : resume));
  }, []);

  const updateWorkHistoryItem = useCallback((id: string, patch: Partial<WorkHistorySectionItem>) => {
    setWorkHistory((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }, []);

  const updateProofProject = useCallback((id: string, patch: Partial<ProofLibrarySectionItem>) => {
    setProofProjects((projects) => projects.map((project) => project.id === id ? { ...project, ...patch } : project));
  }, []);

  const updateSkill = useCallback((id: string, patch: Partial<SkillsInventorySectionItem>) => {
    setSkills((items) => items.map((skill) => skill.id === id ? { ...skill, ...patch } : skill));
  }, []);

  const updateQualityNarrativeField = useCallback((
    setSection: Dispatch<SetStateAction<QualityNarrativeSection>>,
    id: string,
    patch: Partial<QualityNarrativeSectionField>,
  ) => {
    setSection((section) => ({
      ...section,
      fields: section.fields.map((field) => field.id === id ? { ...field, ...patch } : field),
    }));
  }, []);

  const updateCommunicationField = useCallback((id: string, patch: Partial<QualityNarrativeSectionField>) => {
    setCommunicationStyle((section) => ({
      ...section,
      fields: section.fields.map((field) => field.id === id ? { ...field, ...patch } : field),
    }));
  }, []);

  const updateWritingSample = useCallback((id: string, patch: Partial<WritingSamplesSectionItem>) => {
    setWritingSamples((samples) => samples.map((sample) => sample.id === id ? { ...sample, ...patch } : sample));
  }, []);

  const updateOutreachField = useCallback((id: string, patch: Partial<QualityNarrativeSectionField>) => {
    setOutreachRules((section) => ({
      ...section,
      fields: section.fields.map((field) => field.id === id ? { ...field, ...patch } : field),
    }));
  }, []);

  const updateOutreachRule = useCallback((id: string, patch: Partial<RoleTrackOutreachRuleSectionItem>) => {
    setOutreachRules((section) => ({
      ...section,
      roleTrackSpecificRules: section.roleTrackSpecificRules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule),
    }));
  }, []);

  const updateLeadershipField = useCallback((id: string, patch: Partial<QualityNarrativeSectionField>) => {
    setLeadershipProfile((section) => ({
      ...section,
      fields: section.fields.map((field) => field.id === id ? { ...field, ...patch } : field),
    }));
  }, []);

  useEffect(() => {
    const stored = readPublicProfileAccessToken();
    if (!stored) return;
    setAccessToken(stored);
    setBusy(true);
    loadProfile(stored)
      .catch((error) => {
        clearPublicProfileAccessToken();
        setAccessToken("");
        setMessage(error instanceof Error ? error.message : "Stored session could not be restored.");
      })
      .finally(() => setBusy(false));
  }, [loadProfile]);

  useEffect(() => {
    if (profileQuality?.status === "complete") {
      router.replace("/dashboard");
    }
  }, [profileQuality?.status, router]);

  async function signIn() {
    setBusy(true);
    setMessage("Signing in…");
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) throw new Error("Supabase public env is missing.");
      const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json().catch(() => null) as TokenResponse | null;
      if (!response.ok || !body?.access_token) {
        throw new Error(body?.error_description || body?.msg || "Sign in failed.");
      }
      writePublicProfileAccessToken(body.access_token);
      setAccessToken(body.access_token);
      await loadProfile(body.access_token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function reloadProfile() {
    if (!accessToken) return;
    setBusy(true);
    setMessage("Reloading profile sections…");
    try {
      await loadProfile(accessToken);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveIdentity() {
    if (!accessToken) return;
    setBusy(true);
    setMessage("Saving Identity/Search…");
    try {
      const response = await requestPublicProfileApi<SectionResponse<IdentitySearchSection>>("/api/public-profile/identity-search", {
        method: "PATCH",
        accessToken,
        body: identity,
      });
      setIdentity(response.section);
      applyProfileQuality(response.profileQuality);
      setMessage("Identity/Search saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveRoleTracks() {
    if (!accessToken) return;
    setBusy(true);
    setMessage("Saving Role Tracks…");
    try {
      const response = await requestPublicProfileApi<SectionResponse<RoleTracksSection>>("/api/public-profile/role-tracks", {
        method: "PATCH",
        accessToken,
        body: { roleTracks },
      });
      setRoleTracks(response.section.roleTracks);
      applyProfileQuality(response.profileQuality);
      setMessage("Role Tracks saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveResumes() {
    if (!accessToken) return;
    setBusy(true);
    setMessage("Saving Resume Uploads…");
    try {
      const response = await requestPublicProfileApi<SectionResponse<ResumeUploadsSection>>("/api/public-profile/resumes", {
        method: "PATCH",
        accessToken,
        body: { resumes },
      });
      setResumes(response.section.resumes);
      applyProfileQuality(response.profileQuality);
      setMessage("Resume Uploads saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveWorkHistory() {
    if (!accessToken) return;
    setBusy(true);
    setMessage("Saving Work History…");
    try {
      const response = await requestPublicProfileApi<SectionResponse<WorkHistorySection>>("/api/public-profile/work-history", {
        method: "PATCH",
        accessToken,
        body: { workHistory },
      });
      setWorkHistory(response.section.workHistory);
      applyProfileQuality(response.profileQuality);
      setMessage("Work History saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProofLibrary() {
    if (!accessToken) return;
    setBusy(true);
    setMessage("Saving Proof Library…");
    try {
      const response = await requestPublicProfileApi<SectionResponse<ProofLibrarySection>>("/api/public-profile/proof-library", {
        method: "PATCH",
        accessToken,
        body: { projects: proofProjects },
      });
      setProofProjects(response.section.projects);
      applyProfileQuality(response.profileQuality);
      setMessage("Proof Library saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSkills() {
    if (!accessToken) return;
    setBusy(true);
    setMessage("Saving Skills Inventory…");
    try {
      const response = await requestPublicProfileApi<SectionResponse<SkillsInventorySection>>("/api/public-profile/skills", {
        method: "PATCH",
        accessToken,
        body: { skills },
      });
      setSkills(response.section.skills);
      applyProfileQuality(response.profileQuality);
      setMessage("Skills Inventory saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveQualityNarrative(
    label: string,
    path: string,
    section: QualityNarrativeSection,
    setSection: Dispatch<SetStateAction<QualityNarrativeSection>>,
  ) {
    if (!accessToken) return;
    setBusy(true);
    setMessage(`Saving ${label}…`);
    try {
      const response = await requestPublicProfileApi<SectionResponse<QualityNarrativeSection>>(path, {
        method: "PATCH",
        accessToken,
        body: section,
      });
      setSection(completeQualityNarrativeSection(section.section, response.section.fields));
      applyProfileQuality(response.profileQuality);
      setMessage(`${label} saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCommunicationStyle() {
    if (!accessToken) return;
    setBusy(true);
    setMessage("Saving Communication Style…");
    try {
      const response = await requestPublicProfileApi<SectionResponse<CommunicationStyleSection>>("/api/public-profile/communication-style", {
        method: "PATCH",
        accessToken,
        body: communicationStyle,
      });
      setCommunicationStyle(completeCommunicationStyleSection(response.section));
      applyProfileQuality(response.profileQuality);
      setMessage("Communication Style saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveWritingSamples() {
    if (!accessToken) return;
    setBusy(true);
    setMessage("Saving Writing Samples…");
    try {
      const response = await requestPublicProfileApi<SectionResponse<WritingSamplesSection>>("/api/public-profile/writing-samples", {
        method: "PATCH",
        accessToken,
        body: { writingSamples },
      });
      setWritingSamples(response.section.writingSamples);
      applyProfileQuality(response.profileQuality);
      setMessage("Writing Samples saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveOutreachRules() {
    if (!accessToken) return;
    setBusy(true);
    setMessage("Saving Outreach Rules…");
    try {
      const response = await requestPublicProfileApi<SectionResponse<OutreachRulesSection>>("/api/public-profile/outreach-rules", {
        method: "PATCH",
        accessToken,
        body: outreachRules,
      });
      setOutreachRules(completeOutreachRulesSection(response.section));
      applyProfileQuality(response.profileQuality);
      setMessage("Outreach Rules saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveLeadershipProfile() {
    if (!accessToken) return;
    setBusy(true);
    setMessage("Saving Leadership Profile…");
    try {
      const response = await requestPublicProfileApi<SectionResponse<LeadershipProfileSection>>("/api/public-profile/leadership-profile", {
        method: "PATCH",
        accessToken,
        body: leadershipProfile,
      });
      setLeadershipProfile(completeLeadershipProfileSection(response.section));
      applyProfileQuality(response.profileQuality);
      setMessage("Leadership Profile saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    clearPublicProfileAccessToken();
    setAccessToken("");
    setIdentity(emptyIdentity);
    setRoleTracks([]);
    setResumes([]);
    setWorkHistory([]);
    setProofProjects([]);
    setSkills([]);
    setWhyPeopleHireMe(completeQualityNarrativeSection("why_people_hire_me"));
    setOperatingStyle(completeQualityNarrativeSection("operating_style"));
    setDecisionStyle(completeQualityNarrativeSection("decision_style"));
    setAiMisreadings(completeQualityNarrativeSection("ai_misreadings"));
    setCommunicationStyle(completeCommunicationStyleSection());
    setWritingSamples([]);
    setOutreachRules(completeOutreachRulesSection());
    setLeadershipProfile(completeLeadershipProfileSection());
    setProfileStatus("incomplete");
    setProfileQuality(null);
    setIssues([]);
    setMessage("Signed out.");
  }

  function removeRoleTrack(id: string) {
    setRoleTracks((tracks) => tracks.filter((track) => track.id !== id));
  }

  function removeResume(id: string) {
    setResumes((items) => items.filter((resume) => resume.id !== id));
  }

  function toggleResumeRoleTrack(resume: ResumeUploadSectionItem, roleTrackId: string) {
    const currentIds = new Set(resume.associatedRoleTrackIds);
    if (currentIds.has(roleTrackId)) {
      currentIds.delete(roleTrackId);
    } else {
      currentIds.add(roleTrackId);
    }
    updateResume(resume.id, { associatedRoleTrackIds: Array.from(currentIds) });
  }

  function removeWorkHistoryItem(id: string) {
    setWorkHistory((items) => items.filter((item) => item.id !== id));
  }

  function removeProofProject(id: string) {
    setProofProjects((projects) => projects.filter((project) => project.id !== id));
  }

  function removeSkill(id: string) {
    setSkills((items) => items.filter((skill) => skill.id !== id));
  }

  function removeWritingSample(id: string) {
    setWritingSamples((samples) => samples.filter((sample) => sample.id !== id));
  }

  function removeOutreachRule(id: string) {
    setOutreachRules((section) => ({
      ...section,
      roleTrackSpecificRules: section.roleTrackSpecificRules.filter((rule) => rule.id !== id),
    }));
  }

  function toggleSkillProject(skill: SkillsInventorySectionItem, projectId: string) {
    const currentIds = new Set(skill.relatedProjectIds);
    if (currentIds.has(projectId)) {
      currentIds.delete(projectId);
    } else {
      currentIds.add(projectId);
    }
    updateSkill(skill.id, { relatedProjectIds: Array.from(currentIds) });
  }

  function toggleSkillWorkHistory(skill: SkillsInventorySectionItem, workHistoryId: string) {
    const currentIds = new Set(skill.relatedWorkHistoryIds);
    if (currentIds.has(workHistoryId)) {
      currentIds.delete(workHistoryId);
    } else {
      currentIds.add(workHistoryId);
    }
    updateSkill(skill.id, { relatedWorkHistoryIds: Array.from(currentIds) });
  }

  function toggleWorkHistoryResume(item: WorkHistorySectionItem, resumeId: string) {
    const currentIds = new Set(item.associatedResumeIds);
    if (currentIds.has(resumeId)) {
      currentIds.delete(resumeId);
    } else {
      currentIds.add(resumeId);
    }
    updateWorkHistoryItem(item.id, { associatedResumeIds: Array.from(currentIds) });
  }

  function renderQualityNarrativeCard(
    label: string,
    path: string,
    section: QualityNarrativeSection,
    setSection: Dispatch<SetStateAction<QualityNarrativeSection>>,
  ) {
    return (
      <article className={styles.formCard}>
        <div className={styles.formHeader}>
          <div>
            <p className={styles.statusLabel}>Editable Section</p>
            <h2>{label}</h2>
          </div>
        </div>
        <div className={styles.roleTrackList}>
          {section.fields.map((field) => (
            <div className={styles.roleTrackEditor} key={field.id}>
              <div className={styles.roleTrackHeader}>
                <h3>{qualityNarrativeFieldLabels[section.section][field.fieldKey] ?? field.fieldKey}</h3>
                <label className={styles.checkboxLabel}>
                  <input
                    checked={field.quality === "complete"}
                    onChange={(event) => updateQualityNarrativeField(setSection, field.id, { quality: event.target.checked ? "complete" : "weak" })}
                    type="checkbox"
                  />
                  Complete
                </label>
              </div>
              <div className={styles.formGrid}>
                <label className={styles.fullWidth}>Response<textarea value={field.value} onChange={(event) => updateQualityNarrativeField(setSection, field.id, { value: event.target.value })} /></label>
                <label className={styles.fullWidth}>Feedback or notes<textarea value={field.feedback ?? ""} onChange={(event) => updateQualityNarrativeField(setSection, field.id, { feedback: event.target.value })} /></label>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.formActions}>
          <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={() => saveQualityNarrative(label, path, section, setSection)} type="button">
            Save {label}
          </button>
          <p>Mark complete only when the response is specific enough to support matching and outreach.</p>
        </div>
      </article>
    );
  }

  function renderQualityFields(
    fields: QualityNarrativeSectionField[],
    sectionKey: QualitySection,
    updateField: (id: string, patch: Partial<QualityNarrativeSectionField>) => void,
  ) {
    return (
      <div className={styles.roleTrackList}>
        {fields.map((field) => (
          <div className={styles.roleTrackEditor} key={field.id}>
            <div className={styles.roleTrackHeader}>
              <h3>{qualityNarrativeFieldLabels[sectionKey][field.fieldKey] ?? field.fieldKey}</h3>
              <label className={styles.checkboxLabel}>
                <input
                  checked={field.quality === "complete"}
                  onChange={(event) => updateField(field.id, { quality: event.target.checked ? "complete" : "weak" })}
                  type="checkbox"
                />
                Complete
              </label>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.fullWidth}>Response<textarea value={field.value} onChange={(event) => updateField(field.id, { value: event.target.value })} /></label>
              <label className={styles.fullWidth}>Feedback or notes<textarea value={field.feedback ?? ""} onChange={(event) => updateField(field.id, { feedback: event.target.value })} /></label>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <section className={styles.authPanel} aria-label="Supabase sign in">
        <div>
          <p className={styles.statusLabel}>Live Auth</p>
          <p className={styles.statusDetail}>
            {accessToken ? "Signed in with a local bearer token." : "Use an existing Supabase email/password user."}
          </p>
        </div>
        {accessToken ? (
          <div className={styles.authActions}>
              <button className={styles.secondaryButton} disabled={busy} onClick={reloadProfile} type="button">
                Reload
              </button>
              {profileQuality?.status === "complete" ? (
                <button className={styles.secondaryButton} disabled={busy} onClick={() => router.push("/dashboard")} type="button">
                  Go to dashboard
                </button>
              ) : null}
              <button className={styles.secondaryButton} onClick={signOut} type="button">
                Sign out
            </button>
          </div>
        ) : (
          <div className={styles.authForm}>
            <input aria-label="Email" autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="email@example.com" type="email" value={email} />
            <input aria-label="Password" autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" value={password} />
            <button className={styles.primaryButton} disabled={busy || !email || !password} onClick={signIn} type="button">
              Sign in and bootstrap
            </button>
          </div>
        )}
      </section>

      <section className={styles.readinessPanel} aria-label="Profile readiness summary">
        <div>
          <p className={styles.statusLabel}>Profile Readiness</p>
          <p className={styles.statusValue}>{profileQuality ? (profileStatus === "complete" ? "Complete" : "Incomplete") : notLoadedReadinessLabel}</p>
          <p className={styles.statusDetail}>
            {profileQuality
              ? `${completeRequiredSections} of ${requiredSections.length} required sections currently clear. ${issues.length} blocker${issues.length === 1 ? "" : "s"} remain.`
              : "Sign in to load section readiness, blocker counts, and weak profile fields."}
          </p>
        </div>
        <div className={styles.readinessStats}>
          <span>{profileQuality?.weakResponseCount ?? 0} weak response{(profileQuality?.weakResponseCount ?? 0) === 1 ? "" : "s"}</span>
          <span>{profileQuality?.lastCheckedAt ? `Checked ${new Date(profileQuality.lastCheckedAt).toLocaleString()}` : "Not checked yet"}</span>
        </div>
      </section>

      <section className={styles.editorGrid} aria-label="Editable onboarding form">
        <div className={styles.formStack}>
          <article className={styles.formCard}>
            <div className={styles.formHeader}>
              <div>
                <p className={styles.statusLabel}>Editable Section</p>
                <h2>Identity and Search Basics</h2>
              </div>
              <span className={styles.profileStatus}>{profileQuality ? profileStatus : notLoadedReadinessLabel}</span>
            </div>
            <div className={styles.formGrid}>
              <label>Full name<input value={identity.fullName} onChange={(event) => setIdentity({ ...identity, fullName: event.target.value })} /></label>
              <label>Preferred name<input value={identity.preferredName ?? ""} onChange={(event) => setIdentity({ ...identity, preferredName: event.target.value })} /></label>
              <label>Location<input value={identity.location} onChange={(event) => setIdentity({ ...identity, location: event.target.value })} /></label>
              <label>Work authorization<input value={identity.workAuthorization} onChange={(event) => setIdentity({ ...identity, workAuthorization: event.target.value })} /></label>
              <label>Email<input value={identity.email ?? ""} onChange={(event) => setIdentity({ ...identity, email: event.target.value })} /></label>
              <label>Availability<input value={identity.availability} onChange={(event) => setIdentity({ ...identity, availability: event.target.value })} /></label>
              <label>Remote preference<select value={identity.remotePreference} onChange={(event) => setIdentity({ ...identity, remotePreference: event.target.value as IdentitySearchSection["remotePreference"] })}>
                <option value="remote_only">Remote only</option>
                <option value="remote_preferred">Remote preferred</option>
                <option value="hybrid_ok">Hybrid OK</option>
                <option value="onsite_ok">Onsite OK</option>
              </select></label>
              <label>Target compensation minimum<input inputMode="numeric" value={identity.targetCompensationMin ?? ""} onChange={(event) => setIdentity({ ...identity, targetCompensationMin: optionalNumber(event.target.value) })} /></label>
              <label>Target compensation preferred<input inputMode="numeric" value={identity.targetCompensationPreferred ?? ""} onChange={(event) => setIdentity({ ...identity, targetCompensationPreferred: optionalNumber(event.target.value) })} /></label>
              <label>LinkedIn URL<input value={identity.linkedInUrl ?? ""} onChange={(event) => setIdentity({ ...identity, linkedInUrl: event.target.value })} /></label>
              <label>Portfolio URL<input value={identity.portfolioUrl ?? ""} onChange={(event) => setIdentity({ ...identity, portfolioUrl: event.target.value })} /></label>
              <label>Personal site URL<input value={identity.personalWebsiteUrl ?? ""} onChange={(event) => setIdentity({ ...identity, personalWebsiteUrl: event.target.value })} /></label>
              <label>Employment types<input value={listToText(identity.employmentTypes)} onChange={(event) => setIdentity({ ...identity, employmentTypes: textToList(event.target.value) })} /></label>
              <label>Target industries<input value={listToText(identity.targetIndustries)} onChange={(event) => setIdentity({ ...identity, targetIndustries: textToList(event.target.value) })} /></label>
              <label>Target company types<input value={listToText(identity.targetCompanyTypes)} onChange={(event) => setIdentity({ ...identity, targetCompanyTypes: textToList(event.target.value) })} /></label>
              <label>Avoid industries<input value={listToText(identity.avoidIndustries)} onChange={(event) => setIdentity({ ...identity, avoidIndustries: textToList(event.target.value) })} /></label>
              <label>Avoid companies<input value={listToText(identity.avoidCompanies)} onChange={(event) => setIdentity({ ...identity, avoidCompanies: textToList(event.target.value) })} /></label>
            </div>
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveIdentity} type="button">
                Save Identity/Search
              </button>
              <p>{message}</p>
            </div>
          </article>

          <article className={styles.formCard}>
            <div className={styles.formHeader}>
              <div>
                <p className={styles.statusLabel}>Editable Section</p>
                <h2>Role Tracks</h2>
              </div>
              <button className={styles.secondaryButton} disabled={!accessToken || busy} onClick={() => setRoleTracks((tracks) => [...tracks, emptyRoleTrack()])} type="button">
                Add Role Track
              </button>
            </div>
            {roleTracks.length === 0 ? (
              <p className={styles.emptyState}>No Role Tracks yet. Add one credible lane to start connecting resumes, proof, and outreach rules.</p>
            ) : (
              <div className={styles.roleTrackList}>
                {roleTracks.map((track, index) => (
                  <div className={styles.roleTrackEditor} key={track.id}>
                    <div className={styles.roleTrackHeader}>
                      <h3>Track {index + 1}</h3>
                      <button className={styles.secondaryButton} disabled={busy} onClick={() => removeRoleTrack(track.id)} type="button">
                        Remove
                      </button>
                    </div>
                    <div className={styles.formGrid}>
                      <label>Name<input value={track.name} onChange={(event) => updateRoleTrack(track.id, { name: event.target.value })} /></label>
                      <label>Target titles<input value={listToText(track.targetTitles)} onChange={(event) => updateRoleTrack(track.id, { targetTitles: textToList(event.target.value) })} /></label>
                      <label>Description<textarea value={track.description} onChange={(event) => updateRoleTrack(track.id, { description: event.target.value })} /></label>
                      <label>Core positioning<textarea value={track.corePositioning} onChange={(event) => updateRoleTrack(track.id, { corePositioning: event.target.value })} /></label>
                      <label>Outreach angle<textarea value={track.outreachAngle} onChange={(event) => updateRoleTrack(track.id, { outreachAngle: event.target.value })} /></label>
                      <label>Global proof rules<textarea value={track.globalProofRules ?? ""} onChange={(event) => updateRoleTrack(track.id, { globalProofRules: event.target.value })} /></label>
                      <label>Key responsibilities<textarea value={listToText(track.keyResponsibilities)} onChange={(event) => updateRoleTrack(track.id, { keyResponsibilities: textToList(event.target.value) })} /></label>
                      <label>Required experience patterns<textarea value={listToText(track.requiredExperiencePatterns)} onChange={(event) => updateRoleTrack(track.id, { requiredExperiencePatterns: textToList(event.target.value) })} /></label>
                      <label>Strong job signals<textarea value={listToText(track.strongJobSignals)} onChange={(event) => updateRoleTrack(track.id, { strongJobSignals: textToList(event.target.value) })} /></label>
                      <label>Weak job signals<textarea value={listToText(track.weakJobSignals)} onChange={(event) => updateRoleTrack(track.id, { weakJobSignals: textToList(event.target.value) })} /></label>
                      <label>Mismatch signals<textarea value={listToText(track.mismatchSignals)} onChange={(event) => updateRoleTrack(track.id, { mismatchSignals: textToList(event.target.value) })} /></label>
                      <label>Do not overclaim<textarea value={listToText(track.doNotOverclaim)} onChange={(event) => updateRoleTrack(track.id, { doNotOverclaim: textToList(event.target.value) })} /></label>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveRoleTracks} type="button">
                Save Role Tracks
              </button>
              <p>Comma-separate list fields. Resume attachments stay connected by stable Role Track IDs.</p>
            </div>
          </article>

          <article className={styles.formCard}>
            <div className={styles.formHeader}>
              <div>
                <p className={styles.statusLabel}>Editable Section</p>
                <h2>Resume Uploads</h2>
              </div>
              <button className={styles.secondaryButton} disabled={!accessToken || busy} onClick={() => setResumes((items) => [...items, emptyResume()])} type="button">
                Add Resume
              </button>
            </div>
            {resumes.length === 0 ? (
              <p className={styles.emptyState}>No resumes yet. Add a parsed resume record and attach it to at least one Role Track.</p>
            ) : (
              <div className={styles.roleTrackList}>
                {resumes.map((resume, index) => (
                  <div className={styles.roleTrackEditor} key={resume.id}>
                    <div className={styles.roleTrackHeader}>
                      <h3>Resume {index + 1}</h3>
                      <button className={styles.secondaryButton} disabled={busy} onClick={() => removeResume(resume.id)} type="button">
                        Remove
                      </button>
                    </div>
                    <div className={styles.formGrid}>
                      <label>Name<input value={resume.name} onChange={(event) => updateResume(resume.id, { name: event.target.value })} /></label>
                      <label>File URL<input value={resume.fileUrl} onChange={(event) => updateResume(resume.id, { fileUrl: event.target.value })} /></label>
                      <label>Parsing quality<select value={resume.parsingQuality} onChange={(event) => updateResume(resume.id, { parsingQuality: event.target.value as ParsingQuality })}>
                        <option value="failed">Failed</option>
                        <option value="weak">Weak</option>
                        <option value="complete">Complete</option>
                      </select></label>
                      <label>Strengths<textarea value={listToText(resume.strengths)} onChange={(event) => updateResume(resume.id, { strengths: textToList(event.target.value) })} /></label>
                      <label>Gaps<textarea value={listToText(resume.gaps)} onChange={(event) => updateResume(resume.id, { gaps: textToList(event.target.value) })} /></label>
                      <label>Use when<textarea value={listToText(resume.useWhen)} onChange={(event) => updateResume(resume.id, { useWhen: textToList(event.target.value) })} /></label>
                      <label>Avoid when<textarea value={listToText(resume.avoidWhen)} onChange={(event) => updateResume(resume.id, { avoidWhen: textToList(event.target.value) })} /></label>
                      <label>Parsing issues<textarea value={listToText(resume.parsingIssues)} onChange={(event) => updateResume(resume.id, { parsingIssues: textToList(event.target.value) })} /></label>
                      <label className={styles.fullWidth}>Parsed text<textarea value={resume.parsedText} onChange={(event) => updateResume(resume.id, { parsedText: event.target.value })} /></label>
                    </div>
                    <div className={styles.attachmentBlock}>
                      <p className={styles.statusLabel}>Attach to Role Tracks</p>
                      {roleTracks.length === 0 ? (
                        <p className={styles.emptyState}>Add and save at least one Role Track before saving resume attachments.</p>
                      ) : (
                        <div className={styles.checkboxGrid}>
                          {roleTracks.map((track) => (
                            <label key={track.id}>
                              <input
                                checked={resume.associatedRoleTrackIds.includes(track.id)}
                                onChange={() => toggleResumeRoleTrack(resume, track.id)}
                                type="checkbox"
                              />
                              {track.name || track.id}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveResumes} type="button">
                Save Resume Uploads
              </button>
              <p>Resume records currently store parsed text and metadata; file upload plumbing comes after storage/provider decisions.</p>
            </div>
          </article>

          <article className={styles.formCard}>
            <div className={styles.formHeader}>
              <div>
                <p className={styles.statusLabel}>Editable Section</p>
                <h2>Work History</h2>
              </div>
              <button className={styles.secondaryButton} disabled={!accessToken || busy} onClick={() => setWorkHistory((items) => [...items, emptyWorkHistoryItem()])} type="button">
                Add Work Item
              </button>
            </div>
            {workHistory.length === 0 ? (
              <p className={styles.emptyState}>No work history yet. Add one role or import parsed resume experience into this structured format.</p>
            ) : (
              <div className={styles.roleTrackList}>
                {workHistory.map((item, index) => (
                  <div className={styles.roleTrackEditor} key={item.id}>
                    <div className={styles.roleTrackHeader}>
                      <h3>Work Item {index + 1}</h3>
                      <button className={styles.secondaryButton} disabled={busy} onClick={() => removeWorkHistoryItem(item.id)} type="button">
                        Remove
                      </button>
                    </div>
                    <div className={styles.formGrid}>
                      <label>Company<input value={item.company} onChange={(event) => updateWorkHistoryItem(item.id, { company: event.target.value })} /></label>
                      <label>Title<input value={item.title} onChange={(event) => updateWorkHistoryItem(item.id, { title: event.target.value })} /></label>
                      <label>Start date<input placeholder="YYYY-MM or YYYY-MM-DD" value={item.startDate ?? ""} onChange={(event) => updateWorkHistoryItem(item.id, { startDate: event.target.value })} /></label>
                      <label>End date<input placeholder="YYYY-MM or YYYY-MM-DD" value={item.endDate ?? ""} onChange={(event) => updateWorkHistoryItem(item.id, { endDate: event.target.value })} /></label>
                      <label>Source<select value={item.source} onChange={(event) => updateWorkHistoryItem(item.id, { source: event.target.value as WorkHistorySource })}>
                        <option value="resume_parse">Resume parse</option>
                        <option value="user_corrected">User corrected</option>
                      </select></label>
                      <label className={styles.checkboxLabel}>
                        <input checked={item.currentRole} onChange={(event) => updateWorkHistoryItem(item.id, { currentRole: event.target.checked })} type="checkbox" />
                        Current role
                      </label>
                      <label>Responsibilities<textarea value={listToText(item.responsibilities)} onChange={(event) => updateWorkHistoryItem(item.id, { responsibilities: textToList(event.target.value) })} /></label>
                      <label>Accomplishments<textarea value={listToText(item.accomplishments)} onChange={(event) => updateWorkHistoryItem(item.id, { accomplishments: textToList(event.target.value) })} /></label>
                      <label>Skills<textarea value={listToText(item.skills)} onChange={(event) => updateWorkHistoryItem(item.id, { skills: textToList(event.target.value) })} /></label>
                      <label>Metrics<textarea value={listToText(item.metrics)} onChange={(event) => updateWorkHistoryItem(item.id, { metrics: textToList(event.target.value) })} /></label>
                    </div>
                    <div className={styles.attachmentBlock}>
                      <p className={styles.statusLabel}>Attach to Resumes</p>
                      {resumes.length === 0 ? (
                        <p className={styles.emptyState}>Add and save at least one resume before saving work-history attachments.</p>
                      ) : (
                        <div className={styles.checkboxGrid}>
                          {resumes.map((resume) => (
                            <label key={resume.id}>
                              <input
                                checked={item.associatedResumeIds.includes(resume.id)}
                                onChange={() => toggleWorkHistoryResume(item, resume.id)}
                                type="checkbox"
                              />
                              {resume.name || resume.id}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveWorkHistory} type="button">
                Save Work History
              </button>
              <p>Comma-separate responsibilities, accomplishments, skills, and metrics.</p>
            </div>
          </article>

          <article className={styles.formCard}>
            <div className={styles.formHeader}>
              <div>
                <p className={styles.statusLabel}>Editable Section</p>
                <h2>Proof Library</h2>
              </div>
              <button className={styles.secondaryButton} disabled={!accessToken || busy} onClick={() => setProofProjects((projects) => [...projects, emptyProofProject()])} type="button">
                Add Proof
              </button>
            </div>
            {proofProjects.length === 0 ? (
              <p className={styles.emptyState}>No proof objects yet. Add projects, launches, case studies, writing, campaigns, tools, or operational work that proves the profile claims.</p>
            ) : (
              <div className={styles.roleTrackList}>
                {proofProjects.map((project, index) => (
                  <div className={styles.roleTrackEditor} key={project.id}>
                    <div className={styles.roleTrackHeader}>
                      <h3>Proof {index + 1}</h3>
                      <button className={styles.secondaryButton} disabled={busy} onClick={() => removeProofProject(project.id)} type="button">
                        Remove
                      </button>
                    </div>
                    <div className={styles.formGrid}>
                      <label>Name<input value={project.name} onChange={(event) => updateProofProject(project.id, { name: event.target.value })} /></label>
                      <label>Link<input value={project.link ?? ""} onChange={(event) => updateProofProject(project.id, { link: event.target.value })} /></label>
                      <label>Confidence<select value={project.confidence} onChange={(event) => updateProofProject(project.id, { confidence: event.target.value as ProofConfidence })}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select></label>
                      <label>Candidate role<input value={project.candidateRole} onChange={(event) => updateProofProject(project.id, { candidateRole: event.target.value })} /></label>
                      <label className={styles.fullWidth}>Description<textarea value={project.description} onChange={(event) => updateProofProject(project.id, { description: event.target.value })} /></label>
                      <label>What this proves<textarea value={listToText(project.whatThisProves)} onChange={(event) => updateProofProject(project.id, { whatThisProves: textToList(event.target.value) })} /></label>
                      <label>Capabilities demonstrated<textarea value={listToText(project.capabilitiesDemonstrated)} onChange={(event) => updateProofProject(project.id, { capabilitiesDemonstrated: textToList(event.target.value) })} /></label>
                      <label>Responsibilities supported<textarea value={listToText(project.keyResponsibilitiesSupported)} onChange={(event) => updateProofProject(project.id, { keyResponsibilitiesSupported: textToList(event.target.value) })} /></label>
                      <label>Experience supported<textarea value={listToText(project.requiredExperienceSupported)} onChange={(event) => updateProofProject(project.id, { requiredExperienceSupported: textToList(event.target.value) })} /></label>
                      <label>Industries relevant<textarea value={listToText(project.industriesRelevant)} onChange={(event) => updateProofProject(project.id, { industriesRelevant: textToList(event.target.value) })} /></label>
                      <label>Best used for<textarea value={listToText(project.bestUsedFor)} onChange={(event) => updateProofProject(project.id, { bestUsedFor: textToList(event.target.value) })} /></label>
                      <label>Avoid using for<textarea value={listToText(project.avoidUsingFor)} onChange={(event) => updateProofProject(project.id, { avoidUsingFor: textToList(event.target.value) })} /></label>
                      <label>Metrics/results<textarea value={listToText(project.metricsResults)} onChange={(event) => updateProofProject(project.id, { metricsResults: textToList(event.target.value) })} /></label>
                      <label>Caveats<textarea value={listToText(project.caveats)} onChange={(event) => updateProofProject(project.id, { caveats: textToList(event.target.value) })} /></label>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveProofLibrary} type="button">
                Save Proof Library
              </button>
              <p>Comma-separate proof signals. Proof objects stay capability-driven, not title-bound.</p>
            </div>
          </article>

          <article className={styles.formCard}>
            <div className={styles.formHeader}>
              <div>
                <p className={styles.statusLabel}>Editable Section</p>
                <h2>Skills Inventory</h2>
              </div>
              <button className={styles.secondaryButton} disabled={!accessToken || busy} onClick={() => setSkills((items) => [...items, emptySkill()])} type="button">
                Add Skill
              </button>
            </div>
            {skills.length === 0 ? (
              <p className={styles.emptyState}>No skills yet. Add capabilities with evidence, proof links, and explicit do-not-overclaim guardrails.</p>
            ) : (
              <div className={styles.roleTrackList}>
                {skills.map((skill, index) => (
                  <div className={styles.roleTrackEditor} key={skill.id}>
                    <div className={styles.roleTrackHeader}>
                      <h3>Skill {index + 1}</h3>
                      <button className={styles.secondaryButton} disabled={busy} onClick={() => removeSkill(skill.id)} type="button">
                        Remove
                      </button>
                    </div>
                    <div className={styles.formGrid}>
                      <label>Skill<input value={skill.skillName} onChange={(event) => updateSkill(skill.id, { skillName: event.target.value })} /></label>
                      <label>Proficiency<select value={skill.proficiency} onChange={(event) => updateSkill(skill.id, { proficiency: event.target.value as SkillProficiency })}>
                        <option value="working">Working</option>
                        <option value="strong">Strong</option>
                        <option value="expert">Expert</option>
                      </select></label>
                      <label>Evidence<textarea value={listToText(skill.evidence)} onChange={(event) => updateSkill(skill.id, { evidence: textToList(event.target.value) })} /></label>
                      <label>Best role fit<textarea value={listToText(skill.bestRoleFit)} onChange={(event) => updateSkill(skill.id, { bestRoleFit: textToList(event.target.value) })} /></label>
                      <label>Do not overclaim<textarea value={listToText(skill.doNotOverclaim)} onChange={(event) => updateSkill(skill.id, { doNotOverclaim: textToList(event.target.value) })} /></label>
                    </div>
                    <div className={styles.attachmentBlock}>
                      <p className={styles.statusLabel}>Related Proof</p>
                      {proofProjects.length === 0 ? (
                        <p className={styles.emptyState}>Add and save at least one Proof Library item before saving proof relationships.</p>
                      ) : (
                        <div className={styles.checkboxGrid}>
                          {proofProjects.map((project) => (
                            <label key={project.id}>
                              <input
                                checked={skill.relatedProjectIds.includes(project.id)}
                                onChange={() => toggleSkillProject(skill, project.id)}
                                type="checkbox"
                              />
                              {project.name || project.id}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={styles.attachmentBlock}>
                      <p className={styles.statusLabel}>Related Work History</p>
                      {workHistory.length === 0 ? (
                        <p className={styles.emptyState}>Add and save at least one Work History item before saving work-history relationships.</p>
                      ) : (
                        <div className={styles.checkboxGrid}>
                          {workHistory.map((item) => (
                            <label key={item.id}>
                              <input
                                checked={skill.relatedWorkHistoryIds.includes(item.id)}
                                onChange={() => toggleSkillWorkHistory(skill, item.id)}
                                type="checkbox"
                              />
                              {item.title || item.company || item.id}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveSkills} type="button">
                Save Skills Inventory
              </button>
              <p>Comma-separate evidence, fit, and overclaim guardrails. Save related Proof Library and Work History items first.</p>
            </div>
          </article>

          {renderQualityNarrativeCard("Why People Hire Me", "/api/public-profile/why-people-hire-me", whyPeopleHireMe, setWhyPeopleHireMe)}
          {renderQualityNarrativeCard("Operating Style", "/api/public-profile/operating-style", operatingStyle, setOperatingStyle)}
          {renderQualityNarrativeCard("Decision Style", "/api/public-profile/decision-style", decisionStyle, setDecisionStyle)}
          {renderQualityNarrativeCard("What AI Gets Wrong", "/api/public-profile/ai-misreadings", aiMisreadings, setAiMisreadings)}

          <article className={styles.formCard}>
            <div className={styles.formHeader}>
              <div>
                <p className={styles.statusLabel}>Editable Section</p>
                <h2>Communication Style</h2>
              </div>
            </div>
            <div className={styles.formGrid}>
              <label>Preferred tone<textarea value={listToText(communicationStyle.settings?.preferredTone)} onChange={(event) => setCommunicationStyle((section) => ({ ...section, settings: { ...(section.settings ?? emptyCommunicationSettings()), preferredTone: textToList(event.target.value) } }))} /></label>
              <label>Formality<select value={communicationStyle.settings?.formalityLevel ?? "medium"} onChange={(event) => setCommunicationStyle((section) => ({ ...section, settings: { ...(section.settings ?? emptyCommunicationSettings()), formalityLevel: event.target.value as FormalityLevel } }))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select></label>
              <label>Humor<select value={communicationStyle.settings?.humorLevel ?? "light"} onChange={(event) => setCommunicationStyle((section) => ({ ...section, settings: { ...(section.settings ?? emptyCommunicationSettings()), humorLevel: event.target.value as HumorLevel } }))}>
                <option value="none">None</option>
                <option value="light">Light</option>
                <option value="medium">Medium</option>
              </select></label>
              <label>Message length<select value={communicationStyle.settings?.messageLengthPreference ?? "medium"} onChange={(event) => setCommunicationStyle((section) => ({ ...section, settings: { ...(section.settings ?? emptyCommunicationSettings()), messageLengthPreference: event.target.value as MessageLengthPreference } }))}>
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
              </select></label>
              <label>Greeting preferences<textarea value={listToText(communicationStyle.settings?.greetingPreferences)} onChange={(event) => setCommunicationStyle((section) => ({ ...section, settings: { ...(section.settings ?? emptyCommunicationSettings()), greetingPreferences: textToList(event.target.value) } }))} /></label>
              <label>Signoff preferences<textarea value={listToText(communicationStyle.settings?.signoffPreferences)} onChange={(event) => setCommunicationStyle((section) => ({ ...section, settings: { ...(section.settings ?? emptyCommunicationSettings()), signoffPreferences: textToList(event.target.value) } }))} /></label>
              <label>Phrases to avoid<textarea value={listToText(communicationStyle.settings?.phrasesToAvoid)} onChange={(event) => setCommunicationStyle((section) => ({ ...section, settings: { ...(section.settings ?? emptyCommunicationSettings()), phrasesToAvoid: textToList(event.target.value) } }))} /></label>
              <label>Phrases that sound like me<textarea value={listToText(communicationStyle.settings?.phrasesThatSoundLikeMe)} onChange={(event) => setCommunicationStyle((section) => ({ ...section, settings: { ...(section.settings ?? emptyCommunicationSettings()), phrasesThatSoundLikeMe: textToList(event.target.value) } }))} /></label>
            </div>
            {renderQualityFields(communicationStyle.fields, "communication_style", updateCommunicationField)}
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveCommunicationStyle} type="button">
                Save Communication Style
              </button>
              <p>Comma-separate tone settings and mark narrative fields complete when they are specific enough for generated outreach.</p>
            </div>
          </article>

          <article className={styles.formCard}>
            <div className={styles.formHeader}>
              <div>
                <p className={styles.statusLabel}>Editable Section</p>
                <h2>Writing Samples</h2>
              </div>
              <button className={styles.secondaryButton} disabled={!accessToken || busy} onClick={() => setWritingSamples((samples) => [...samples, emptyWritingSample()])} type="button">
                Add Sample
              </button>
            </div>
            {writingSamples.length === 0 ? (
              <p className={styles.emptyState}>No writing samples yet. Add examples the system should imitate or avoid.</p>
            ) : (
              <div className={styles.roleTrackList}>
                {writingSamples.map((sample, index) => (
                  <div className={styles.roleTrackEditor} key={sample.id}>
                    <div className={styles.roleTrackHeader}>
                      <h3>Sample {index + 1}</h3>
                      <button className={styles.secondaryButton} disabled={busy} onClick={() => removeWritingSample(sample.id)} type="button">
                        Remove
                      </button>
                    </div>
                    <div className={styles.formGrid}>
                      <label>Type<select value={sample.sampleType} onChange={(event) => updateWritingSample(sample.id, { sampleType: event.target.value as WritingSampleType })}>
                        <option value="like">Like</option>
                        <option value="hate">Avoid</option>
                      </select></label>
                      <label>Channel<select value={sample.channel} onChange={(event) => updateWritingSample(sample.id, { channel: event.target.value as WritingChannel })}>
                        <option value="linkedin">LinkedIn</option>
                        <option value="email">Email</option>
                        <option value="dm">DM</option>
                        <option value="social_post">Social post</option>
                        <option value="other">Other</option>
                      </select></label>
                      <label className={styles.fullWidth}>Text<textarea value={sample.text} onChange={(event) => updateWritingSample(sample.id, { text: event.target.value })} /></label>
                      <label className={styles.fullWidth}>Why it works or fails<textarea value={sample.whyItWorksOrFails} onChange={(event) => updateWritingSample(sample.id, { whyItWorksOrFails: event.target.value })} /></label>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveWritingSamples} type="button">
                Save Writing Samples
              </button>
              <p>Samples calibrate voice; use avoid samples for generic, inflated, or off-brand phrasing.</p>
            </div>
          </article>

          <article className={styles.formCard}>
            <div className={styles.formHeader}>
              <div>
                <p className={styles.statusLabel}>Editable Section</p>
                <h2>Outreach Rules</h2>
              </div>
              <button className={styles.secondaryButton} disabled={!accessToken || busy} onClick={() => setOutreachRules((section) => ({ ...section, roleTrackSpecificRules: [...section.roleTrackSpecificRules, emptyRoleTrackOutreachRule(roleTracks[0]?.id)] }))} type="button">
                Add Role Rule
              </button>
            </div>
            <div className={styles.formGrid}>
              <label>Global rules<textarea value={listToText(outreachRules.settings?.globalRules)} onChange={(event) => setOutreachRules((section) => ({ ...section, settings: { ...(section.settings ?? emptyOutreachSettings()), globalRules: textToList(event.target.value) } }))} /></label>
              <label>Follow-up rules<textarea value={listToText(outreachRules.settings?.followUpRules)} onChange={(event) => setOutreachRules((section) => ({ ...section, settings: { ...(section.settings ?? emptyOutreachSettings()), followUpRules: textToList(event.target.value) } }))} /></label>
              <label>Link selection rules<textarea value={listToText(outreachRules.settings?.linkSelectionRules)} onChange={(event) => setOutreachRules((section) => ({ ...section, settings: { ...(section.settings ?? emptyOutreachSettings()), linkSelectionRules: textToList(event.target.value) } }))} /></label>
            </div>
            {renderQualityFields(outreachRules.fields, "outreach_rules", updateOutreachField)}
            {outreachRules.roleTrackSpecificRules.length === 0 ? (
              <p className={styles.emptyState}>No Role Track-specific outreach rules yet. Add Role Tracks first if outreach varies by lane.</p>
            ) : (
              <div className={styles.roleTrackList}>
                {outreachRules.roleTrackSpecificRules.map((rule, index) => (
                  <div className={styles.roleTrackEditor} key={rule.id}>
                    <div className={styles.roleTrackHeader}>
                      <h3>Role Rule {index + 1}</h3>
                      <button className={styles.secondaryButton} disabled={busy} onClick={() => removeOutreachRule(rule.id)} type="button">
                        Remove
                      </button>
                    </div>
                    <div className={styles.formGrid}>
                      <label>Role Track<select value={rule.roleTrackId} onChange={(event) => updateOutreachRule(rule.id, { roleTrackId: event.target.value })}>
                        <option value="">Choose a Role Track</option>
                        {roleTracks.map((track) => (
                          <option key={track.id} value={track.id}>{track.name || track.id}</option>
                        ))}
                      </select></label>
                      <label>Rules<textarea value={listToText(rule.rules)} onChange={(event) => updateOutreachRule(rule.id, { rules: textToList(event.target.value) })} /></label>
                      <label>Preferred proof types<textarea value={listToText(rule.preferredProofTypes)} onChange={(event) => updateOutreachRule(rule.id, { preferredProofTypes: textToList(event.target.value) })} /></label>
                      <label>Avoid proof types<textarea value={listToText(rule.avoidProofTypes)} onChange={(event) => updateOutreachRule(rule.id, { avoidProofTypes: textToList(event.target.value) })} /></label>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveOutreachRules} type="button">
                Save Outreach Rules
              </button>
              <p>Save Role Tracks before saving role-specific outreach rules so relationship IDs validate.</p>
            </div>
          </article>

          <article className={styles.formCard}>
            <div className={styles.formHeader}>
              <div>
                <p className={styles.statusLabel}>Optional Section</p>
                <h2>Leadership Profile</h2>
              </div>
              <label className={styles.checkboxLabel}>
                <input checked={leadershipProfile.visible} onChange={(event) => setLeadershipProfile((section) => ({ ...section, visible: event.target.checked }))} type="checkbox" />
                Visible
              </label>
            </div>
            {renderQualityFields(leadershipProfile.fields, "leadership_profile", updateLeadershipField)}
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveLeadershipProfile} type="button">
                Save Leadership Profile
              </button>
              <p>Keep hidden unless leadership or executive positioning should appear in generated profile outputs.</p>
            </div>
          </article>
        </div>

        <aside className={styles.issueCard}>
          <p className={styles.statusLabel}>Current blockers</p>
          {issues.length === 0 ? (
            <p>No profile blockers loaded yet.</p>
          ) : (
            <ul>
              {issues.slice(0, 8).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </aside>
      </section>

      <section id="sections" className={styles.sectionList} aria-label="Onboarding sections">
        {sections.map((section, index) => {
          const readiness = readinessBySection.get(section.key);
          const status = readiness?.status ?? "not_loaded";
          const blockerCount = readiness?.blockers.length ?? 0;
          const weakFieldCount = readiness?.weakFields.length ?? 0;

          return (
            <article className={styles.sectionCard} key={section.key}>
              <span className={styles.index}>{index + 1}</span>
              <div>
                <h2>{section.label}</h2>
                <p>{section.description}</p>
                <p className={styles.sectionIssueSummary}>
                  {profileQuality
                    ? section.required
                      ? `${blockerCount} blocker${blockerCount === 1 ? "" : "s"}${weakFieldCount > 0 ? ` · ${weakFieldCount} weak field${weakFieldCount === 1 ? "" : "s"}` : ""}`
                      : "Optional section, not required for completion"
                    : "Sign in to load readiness"}
                </p>
              </div>
              <div className={styles.sectionMeta}>
                <span className={`${styles.readinessBadge} ${styles[`readiness_${status}`]}`}>
                  {readinessLabel(status)}
                </span>
                <span className={`${styles.endpoint} ${section.required ? "" : styles.optional}`}>
                  {section.required ? section.path : "Optional"}
                </span>
              </div>
            </article>
          );
        })}
      </section>
      <p className={styles.requiredCount}>Required sections: {requiredSections.length}</p>
    </>
  );
}

export type ProfileStatus = "incomplete" | "complete";
export type RemotePreference = "remote_only" | "remote_preferred" | "hybrid_ok" | "onsite_ok";
export type EmploymentType = "full_time" | "contract" | "freelance" | "part_time";
export type Priority = "low" | "medium" | "high";
export type ParsingQuality = "failed" | "weak" | "complete";
export type ProofConfidence = "low" | "medium" | "high";
export type SkillProficiency = "working" | "strong" | "expert";
export type Quality = "weak" | "complete";
export type WritingSampleType = "like" | "hate";
export type WritingChannel = "linkedin" | "email" | "dm" | "social_post" | "other";
export type FormalityLevel = "low" | "medium" | "high";
export type HumorLevel = "none" | "light" | "medium";
export type MessageLengthPreference = "short" | "medium" | "long";

export type QualitySection =
  | "why_people_hire_me"
  | "operating_style"
  | "decision_style"
  | "communication_style"
  | "ai_misreadings"
  | "outreach_rules"
  | "leadership_profile";

export type CandidateProfileRecord = {
  id: string;
  userId: string;
  status: ProfileStatus;
  version: number;
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
  generatedMarkdown: string;
  markdownGeneratedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CandidateProfilePreferences = {
  id: string;
  profileId: string;
  employmentTypes: EmploymentType[];
  targetIndustries: string[];
  avoidIndustries: string[];
  targetCompanyTypes: string[];
  avoidCompanies: string[];
  createdAt: string;
  updatedAt: string;
};

export type CompanyWatchlistItem = {
  id: string;
  profileId: string;
  companyName: string;
  reason: string;
  priority: Priority;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type RoleTrack = {
  id: string;
  profileId: string;
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
  createdAt: string;
  updatedAt: string;
};

export type Resume = {
  id: string;
  profileId: string;
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
  createdAt: string;
  updatedAt: string;
};

export type WorkHistoryItem = {
  id: string;
  profileId: string;
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
  source: "resume_parse" | "user_corrected";
  createdAt: string;
  updatedAt: string;
};

export type ProjectProof = {
  id: string;
  profileId: string;
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
  createdAt: string;
  updatedAt: string;
};

export type SkillProfile = {
  id: string;
  profileId: string;
  skillName: string;
  proficiency: SkillProficiency;
  evidence: string[];
  relatedProjectIds: string[];
  relatedWorkHistoryIds: string[];
  bestRoleFit: string[];
  doNotOverclaim: string[];
  createdAt: string;
  updatedAt: string;
};

export type QualityScoredTextField = {
  id: string;
  profileId: string;
  section: QualitySection;
  fieldKey: string;
  value: string;
  quality: Quality;
  feedback?: string;
  createdAt: string;
  updatedAt: string;
};

export type CommunicationStyleSettings = {
  id: string;
  profileId: string;
  preferredTone: string[];
  formalityLevel: FormalityLevel;
  humorLevel: HumorLevel;
  messageLengthPreference: MessageLengthPreference;
  greetingPreferences: string[];
  signoffPreferences: string[];
  phrasesToAvoid: string[];
  phrasesThatSoundLikeMe: string[];
  createdAt: string;
  updatedAt: string;
};

export type WritingSample = {
  id: string;
  profileId: string;
  sampleType: WritingSampleType;
  channel: WritingChannel;
  text: string;
  whyItWorksOrFails: string;
  createdAt: string;
  updatedAt: string;
};

export type OutreachRuleSet = {
  id: string;
  profileId: string;
  globalRules: string[];
  followUpRules: string[];
  linkSelectionRules: string[];
  createdAt: string;
  updatedAt: string;
};

export type RoleTrackOutreachRule = {
  id: string;
  roleTrackId: string;
  rules: string[];
  preferredProofTypes: string[];
  avoidProofTypes: string[];
  createdAt: string;
  updatedAt: string;
};

export type LeadershipProfile = {
  id: string;
  profileId: string;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProfileQuality = {
  id: string;
  profileId: string;
  status: ProfileStatus;
  incompleteReasons: string[];
  weakFields: string[];
  completeFields: string[];
  weakResponseCount: number;
  lastCheckedAt: string;
};

export type GeneratedMarkdown = {
  markdown: string;
  generatedAt: string;
  profileVersion: number;
};

export type ProfileVersionDraft = {
  profileId: string;
  version: number;
  generatedMarkdown: string;
  changeSummary: string;
  createdAt: string;
};

export type CandidateProfileAggregate = {
  profile: CandidateProfileRecord;
  preferences?: CandidateProfilePreferences;
  companyWatchlist: CompanyWatchlistItem[];
  roleTracks: RoleTrack[];
  resumes: Resume[];
  workHistory: WorkHistoryItem[];
  projects: ProjectProof[];
  skills: SkillProfile[];
  qualityFields: QualityScoredTextField[];
  communicationStyle?: CommunicationStyleSettings;
  writingSamples: WritingSample[];
  outreachRules?: OutreachRuleSet;
  roleTrackOutreachRules: RoleTrackOutreachRule[];
  leadershipProfile?: LeadershipProfile;
  profileQuality?: ProfileQuality;
};

export type ProfileStatus = "incomplete" | "complete";
export type RemotePreference = "remote_only" | "remote_preferred" | "hybrid_ok" | "onsite_ok";
export type EmploymentType = "full_time" | "contract" | "freelance" | "part_time";
export type Priority = "low" | "medium" | "high";
export type ParsingQuality = "failed" | "weak" | "complete";
export type SkillProficiency = "working" | "strong" | "expert";
export type Quality = "weak" | "complete";
export type WritingSampleBucket = "sounds_like_me" | "want_to_sound" | "never_sound";
export type WritingChannel = "linkedin" | "email" | "dm" | "social_post" | "other";

export type QualitySection =
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
  email?: string;
  remotePreference: RemotePreference;
  targetCompensationMin?: number;
  targetCompensationPreferred?: number;
  targetCompensationHourlyMin?: number;
  targetCompensationHourlyPreferred?: number;
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
  // Curated stat/company bullets the outreach generator may quote in a message
  // (a resume-level proof point, alongside a Work Example and a Skill).
  highlights: string[];
  strengths: string[];
  gaps: string[];
  useWhen: string[];
  avoidWhen: string[];
  parsingQuality: ParsingQuality;
  parsingIssues: string[];
  createdAt: string;
  updatedAt: string;
};

// Text-only outreach portfolio. The generator inserts one relevant example per
// message (its `oneHitter` + optional `link`); the model decides which example
// to use from context, so no relevance tagging is stored here.
export type WorkExample = {
  id: string;
  profileId: string;
  title: string;
  oneHitter: string;
  link?: string;
  context: string;
  createdAt: string;
  updatedAt: string;
};

export type SkillProfile = {
  id: string;
  profileId: string;
  skillName: string;
  proficiency: SkillProficiency;
  evidence: string[];
  relatedWorkExampleIds: string[];
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

// Soft scoring only — no hard filters. Poor-fit jobs still surface, rated lower,
// with the poor-fit signal shown as context. Feeds job rating, never the message.
export type FitSignals = {
  id: string;
  profileId: string;
  goodSignals: string[];
  poorFitSignals: string[];
  createdAt: string;
  updatedAt: string;
};

// Consolidated Voice & Personality section (replaces the legacy 5-section
// personality cluster + CommunicationStyleSettings). Writing samples live in
// their own table (WritingSample[]).
export type VoicePersonality = {
  id: string;
  profileId: string;
  // Q1 — "What do people come to you for — what are you the person for?"
  q1Value: string;
  // Q4 — "What's a take about your field you'll defend?"
  q4Opinion: string;
  // Positive tone tags (e.g. punchy, warm, no-fluff, blunt, funny, specific, casual, brief).
  toneTags: string[];
  // Anti-pattern tone tags to avoid (e.g. "LinkedIn malarky", "Corporate Jargon", "Biz Formal").
  avoidTags: string[];
  // Free-text "what to avoid" note (<=25 words, enforced in validation).
  avoidNote: string;
  createdAt: string;
  updatedAt: string;
};

export type WritingSample = {
  id: string;
  profileId: string;
  bucket: WritingSampleBucket;
  channel: WritingChannel;
  // <=120 words, enforced in validation.
  text: string;
  tags: string[];
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
  fitSignals?: FitSignals;
  workExamples: WorkExample[];
  skills: SkillProfile[];
  qualityFields: QualityScoredTextField[];
  voicePersonality?: VoicePersonality;
  writingSamples: WritingSample[];
  outreachRules?: OutreachRuleSet;
  roleTrackOutreachRules: RoleTrackOutreachRule[];
  leadershipProfile?: LeadershipProfile;
  profileQuality?: ProfileQuality;
};

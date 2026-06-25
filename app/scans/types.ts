export type CompanyStatus = "active" | "paused" | "deprioritized" | "do_not_apply";

export type JobStatus =
  | "new"
  | "reviewed"
  | "saved"
  | "applied"
  | "messaged"
  | "skipped"
  | "archived";

export type FitBucket = "A" | "B" | "C" | "monitor" | "skip";

export type ContactStatus =
  | "to_research"
  | "identified"
  | "messaged"
  | "replied"
  | "not_relevant"
  | "archived";

export type ContactType =
  | "recruiter"
  | "talent_partner"
  | "hiring_manager"
  | "department_leader"
  | "creative_lead"
  | "production_lead"
  | "unknown";

export type SourceProvider = "greenhouse" | "lever" | "ashby" | "icims" | "workday" | "magnit" | "html";

export type NearMissReviewDecisionValue = "approve" | "reject" | "not_for_me";

export type ScanCadence = "manual" | "daily" | "weekdays" | "weekly";

export type RecommendedAction =
  | "apply_and_message_today"
  | "review"
  | "monitor"
  | "skip"
  | "research_contact";

export type RemoteClassification =
  | "remote_confirmed"
  | "remote_likely"
  | "hybrid_remote_possible"
  | "hybrid_unclear"
  | "onsite_unclear"
  | "onsite_likely"
  | "not_remote";

export type RemotePolicyLabel =
  | "remote_friendly"
  | "remote_selective"
  | "hybrid_with_exceptions"
  | "hybrid_strict"
  | "onsite_strict"
  | "unknown";

export type ApplyMode = "executive_producer" | "program_director" | "ai_workflow_product_ops";

export type Company = {
  id: string;
  companyName: string;
  websiteUrl: string;
  careersUrl: string;
  atsProvider: SourceProvider;
  atsBoardToken: string;
  industryBucket: string;
  remoteLikelihood: number;
  notes: string;
  status: CompanyStatus;
  lastSuccessfulScan: string;
  lastError?: string;
};

export type Job = {
  id: string;
  companyId: string;
  externalJobId: string;
  sourceProvider: SourceProvider;
  sourceUrl: string;
  applyUrl: string;
  title: string;
  companyName: string;
  location: string;
  remoteType: "remote" | "hybrid" | "onsite" | "unclear";
  remoteClassification?: RemoteClassification;
  postingRemoteLanguage?: string;
  remoteSystemRead?: string;
  remoteEvidenceSummary?: string;
  remoteEvidenceUrl?: string;
  remoteConfidenceScore?: number;
  employmentType: "full-time" | "contract" | "freelance";
  department: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryText: string;
  descriptionText: string;
  firstSeenAt: string;
  lastSeenAt: string;
  closedAt?: string;
  status: JobStatus;
  fitScore: number;
  fitBucket: FitBucket;
  fitSummary: string;
  riskFlags: string[];
  recommendedAction: RecommendedAction;
  whyItMatches: string[];
  whyItMightBeWrong: string[];
  outreachAngle: string;
  resumeTailoringNotes: string[];
  notes: string;
  needsContactResearch: boolean;
};

export type ContactSuggestion = {
  id: string;
  jobId: string;
  name: string;
  title: string;
  companyName: string;
  linkedinUrl: string;
  otherProfileUrl?: string;
  contactType: ContactType;
  relevanceReason: string;
  roleConnection: string;
  currentCompanyEvidence: string;
  evidenceUrl: string;
  confidenceScore: number;
  outreachFitRating: 1 | 2 | 3 | 4 | 5;
  riskNotes: string[];
  verified: boolean;
};

export type ApplyWizardGeneratedMessage = {
  contactId: string;
  contactName: string;
  messageText: string;
  messageType: "linkedin_message";
  recipientType?: "hiring_manager" | "functional_leader" | "recruiter" | "executive_sponsor" | "no_contact";
  resumeTrack?: string;
  proofObjectUsed?: string;
  approved?: boolean;
  rejectedReason?: string;
  notes?: string;
};

export type ApplyWizardSubmission = {
  sessionId: string;
  savedAt: string;
  jobId: string;
  applicationMode: ApplyMode;
  selectedContactIds: string[];
  completedActions: string[];
  generatedMessages: ApplyWizardGeneratedMessage[];
  coverLetterText: string;
  resumeNotesText: string;
  notes?: string;
};

export type JobMatchFeedback = {
  id: string;
  jobId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  reason: string;
  matchVersion: string;
  createdAt: string;
};

export type NearMissReviewDecision = {
  id: string;
  reviewKey: string;
  decision: NearMissReviewDecisionValue;
  reason: string;
  titleSignal: string;
  companyName: string;
  provider: SourceProvider;
  title: string;
  sourceUrl: string;
  reviewBucket: string;
  rulesVersion: string;
  createdAt: string;
  updatedAt: string;
};

export type ApplyCopyDraft = {
  applicationMode: ApplyMode;
  generatedMessages: ApplyWizardGeneratedMessage[];
  coverLetterText: string;
  resumeNotesText: string;
  source: "fallback" | "generated";
};

export type Contact = {
  id: string;
  companyId: string;
  jobId: string;
  name: string;
  title: string;
  linkedinUrl: string;
  companyBioUrl?: string;
  email?: string;
  contactType: ContactType;
  confidence: number;
  reason: string;
  status: ContactStatus;
  lastContactedAt?: string;
  notes: string;
};

export type ScanLog = {
  id: string;
  startedAt: string;
  completedAt: string;
  status: "completed" | "completed_with_errors" | "failed";
  companiesScanned: number;
  jobsFound: number;
  newJobsAdded: number;
  jobsUpdated: number;
  jobsClosed: number;
  errors: string[];
};

export type UserSearchProfile = {
  targetTitles: string[];
  positiveKeywords: string[];
  negativeKeywords: string[];
  targetIndustries: string[];
  compensationFloor: number;
  freelanceRateFloor: number;
  remoteOnly: boolean;
  doNotApplyCompanies: string[];
  approvedLoginEmail: string;
};

export type DashboardSettings = {
  scanEnabled: boolean;
  scanCadence: ScanCadence;
  digestEnabled: boolean;
  digestCadence: ScanCadence;
  digestTime: string;
  maxRolesPerScan: number;
};

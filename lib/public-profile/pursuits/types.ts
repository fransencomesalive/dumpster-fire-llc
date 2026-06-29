export type PursuitStatus =
  | "discovered"
  | "saved"
  | "review_complete"
  | "human_path_generated"
  | "outreach_ready"
  | "outreach_sent"
  | "applied"
  | "responded"
  | "interviewing"
  | "offer"
  | "rejected"
  | "expired"
  | "deleted";

export type PursuitUsageType = "pursuit" | "human_path" | "outreach_message";

export type PursuitEventType =
  | "created"
  | "review_completed"
  | "human_path_generated"
  | "contacts_selected"
  | "outreach_generated"
  | "outreach_sent"
  | "applied"
  | "responded"
  | "interviewing"
  | "offer"
  | "rejected"
  | "expired"
  | "deleted"
  | "note_added";

export type Pursuit = {
  id: string;
  userId: string;
  profileId: string;
  jobId: string;
  selectedRoleTrackId?: string;
  selectedResumeId?: string;
  selectedWorkExampleId?: string;
  status: PursuitStatus;
  fitSummary?: string;
  risks: string[];
  recommendedWorkExampleIds: string[];
  outreachAngle?: string;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
};

export type PursuitEvent = {
  id?: string;
  pursuitId: string;
  userId: string;
  eventType: PursuitEventType;
  fromStatus?: PursuitStatus;
  toStatus?: PursuitStatus;
  usageType?: PursuitUsageType;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type PursuitUsageEvent = {
  userId: string;
  profileId?: string;
  usageType: PursuitUsageType;
  quantity: number;
  relatedJobId?: string;
  relatedPursuitId?: string;
  createdAt: string;
};

export type PursuitTransitionResult =
  | { ok: true; pursuit: Pursuit; event: PursuitEvent; usageEvents: PursuitUsageEvent[] }
  | { ok: false; issues: string[] };

export type CreatePursuitInput = {
  id: string;
  userId: string;
  profileId: string;
  jobId: string;
  now: string;
  fitSummary?: string;
  risks?: string[];
  recommendedWorkExampleIds?: string[];
  outreachAngle?: string;
};

export type CompleteReviewInput = {
  selectedRoleTrackId?: string;
  selectedResumeId?: string;
  selectedWorkExampleId?: string;
  fitSummary?: string;
  risks?: string[];
  recommendedWorkExampleIds?: string[];
  outreachAngle?: string;
};

export type HumanPathContact = {
  name: string;
  title: string;
  companyName: string;
  linkedinUrl?: string;
  email?: string;
  contactType: "likely_hiring_manager" | "functional_leader" | "recruiter" | "executive_sponsor" | "referral_candidate" | "unknown";
  confidence: "low" | "medium" | "high";
  relevanceReason: string;
  roleConnection: string;
  verificationNotes: string[];
};

export type HumanPathContactSuggestion = HumanPathContact & {
  id: string;
  selectedForOutreach: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OutreachRecipientType =
  | "likely_hiring_manager"
  | "functional_leader"
  | "recruiter"
  | "executive_sponsor"
  | "no_contact";

export type GeneratedOutreachDraft = {
  contactSuggestionId: string;
  recipientType: OutreachRecipientType;
  message: string;
  selectedRoleTrackId?: string;
  selectedResumeId?: string;
  selectedWorkExampleId?: string;
  createdAt: string;
};

export type HumanPathProviderInput = {
  pursuit: Pursuit;
  job: {
    id: string;
    title: string;
    companyName: string;
    description: string;
  };
};

export type HumanPathProviderResult =
  | { status: "generated"; contacts: HumanPathContact[] }
  | { status: "provider_unavailable"; reason: string };

export type HumanPathProvider = (input: HumanPathProviderInput) => Promise<HumanPathProviderResult>;

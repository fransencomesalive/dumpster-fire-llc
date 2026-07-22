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

export type PursuitTrackingAction =
  | "outreach_sent"
  | "applied_online"
  | "response_received"
  | "interviewing"
  | "not_moving_forward"
  | "never_heard_back";

export type PursuitTrackingSource = "manual" | "message_copy" | "migration";

export type PursuitJobSnapshot = {
  jobId?: string;
  source?: string;
  sourceState?: "shared" | "user_owned";
  title?: string;
  companyName?: string;
  location?: string;
  remoteType?: string;
  employmentType?: string;
  compensation?: string;
  sourceUrl?: string;
  description?: string;
  responsibilities?: string[];
  requiredExperience?: string[];
  postedAt?: string;
  scrapedAt?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  availability?: "active" | "actioned" | "expired" | "dismissed" | "available" | "snapshot_only" | "unavailable";
  capturedAt?: string;
};

export type PursuitSelectionSnapshot = {
  applyingAs?: {
    id?: string;
    label?: string;
    narrative?: string;
  };
  resume?: {
    id?: string;
    label?: string;
  };
  workExample?: {
    id?: string;
    label?: string;
    oneHitter?: string;
    link?: string;
    context?: string;
  };
  contacts?: Array<{
    id?: string;
    name?: string;
    title?: string;
    companyName?: string;
    linkedinUrl?: string;
    professionalContactUrl?: string;
    reachability?: HumanPathReachability;
  }>;
  // Legacy flat identifiers remain readable while existing rows are converted.
  roleTrackId?: string;
  resumeId?: string;
  workExampleId?: string;
  contactSuggestionIds?: string[];
  capturedAt?: string;
};

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
  profileId: string | null;
  jobId: string | null;
  selectedRoleTrackId?: string;
  selectedResumeId?: string;
  selectedWorkExampleId?: string;
  status: PursuitStatus;
  fitSummary?: string;
  risks: string[];
  recommendedWorkExampleIds: string[];
  outreachAngle?: string;
  trackingStartedAt?: string;
  pursuitMeteredAt?: string;
  notes?: string;
  jobSnapshot?: PursuitJobSnapshot;
  selectionSnapshot?: PursuitSelectionSnapshot;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
};

export type PursuitHistoryTrackingEntry = {
  type: "tracking";
  label: string;
  change: "marked" | "unmarked";
  occurredAt: string | null;
  timestampAvailable: boolean;
};

export type PursuitHistoryMessageEntry = {
  type: "message";
  label: "Sent outreach message";
  occurredAt: string | null;
  timestampAvailable: boolean;
  recipient: {
    name: string | null;
    title: string | null;
    linkedinUrl: string | null;
    available: boolean;
  };
  message: {
    text: string | null;
    available: boolean;
  };
};

export type PursuitHistoryEntry = PursuitHistoryTrackingEntry | PursuitHistoryMessageEntry;

export type PursuitTrackingCommit = {
  status: "committed" | "idempotent_replay";
  pursuit: Pursuit;
  state: Record<PursuitTrackingAction, boolean>;
  history: PursuitHistoryEntry[];
};

export type PursuitInitialOutreachCommit = {
  status: "committed" | "idempotent_replay";
  pursuit: Pursuit;
  messages: OutreachMessageRecord[];
  pursuitDebited: boolean;
  outreachDebited: number;
};

export type PursuitTrackingEvent = {
  id?: string;
  pursuitId: string;
  userId: string;
  action: PursuitTrackingAction;
  checked: boolean;
  source: PursuitTrackingSource;
  outreachMessageId?: string;
  contactSuggestionId?: string;
  messageSnapshot?: string;
  recipientNameSnapshot?: string;
  recipientTitleSnapshot?: string;
  recipientLinkedinUrlSnapshot?: string;
  idempotencyKey: string;
  occurredAt: string;
  occurredAtKnown: boolean;
  createdAt: string;
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
  jobSnapshot?: PursuitJobSnapshot;
  selectionSnapshot?: PursuitSelectionSnapshot;
};

export type CompleteReviewInput = {
  selectedRoleTrackId?: string;
  selectedResumeId?: string;
  selectedWorkExampleId?: string;
  fitSummary?: string;
  risks?: string[];
  recommendedWorkExampleIds?: string[];
  outreachAngle?: string;
  selectionSnapshot?: PursuitSelectionSnapshot;
};

export type HumanPathContact = {
  name: string;
  title: string;
  companyName: string;
  linkedinUrl?: string;
  professionalContactUrl?: string;
  reachability: HumanPathReachability;
  // Legacy storage remains readable, but email is not a Human Path contact route.
  email?: string;
  contactType: "likely_hiring_manager" | "functional_leader" | "recruiter" | "executive_sponsor" | "referral_candidate" | "unknown";
  confidence: "low" | "medium" | "high";
  relevanceReason: string;
  roleConnection: string;
  verificationNotes: string[];
};

export type HumanPathLane = Extract<
  HumanPathContact["contactType"],
  "likely_hiring_manager" | "recruiter" | "functional_leader"
>;

export type HumanPathRejectionCode =
  | "identity_unverified"
  | "company_unverified"
  | "current_role_unverified"
  | "linkedin_profile_unverified"
  | "classification_unverified"
  | "title_mismatch"
  | "duplicate_candidate"
  | "verification_unavailable";

export type HumanPathLaneDiagnostic = {
  lane: HumanPathLane;
  discoveryStatus: "completed" | "provider_unavailable";
  verificationStatus: "completed" | "not_needed" | "provider_unavailable";
  discoveredCount: number;
  verifiedCount: number;
  acceptedCount: number;
  rejected: Array<{
    candidateKey: string;
    name?: string;
    reasonCodes: HumanPathRejectionCode[];
  }>;
};

export type HumanPathDiagnostics = {
  schemaVersion: 1;
  lanes: HumanPathLaneDiagnostic[];
  assembledCount: number;
};

export type HumanPathReachability =
  | { method: "linkedin"; url: string }
  | { method: "contact_page"; url: string }
  | { method: "none" };

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
  generationContext: OutreachGenerationContext;
  createdAt: string;
};

export type OutreachMessageStatus = "draft" | "approved" | "sent" | "rejected";

export type OutreachMessageFeedbackReason =
  | "wrong_skills_title_applied"
  | "personal_voice_mismatch"
  | "selected_tone_mismatch"
  | "awkward_to_read"
  | "would_not_send"
  | "other";

export type OutreachMessageFeedback = {
  id: string;
  outreachMessageId: string;
  userId: string;
  feedbackType: "needs_work";
  reasonCodes: OutreachMessageFeedbackReason[];
  notes?: string;
  messageSnapshot: string;
  messageRevision: 0 | 1;
  generationRequestId?: string;
  generationContext: OutreachFeedbackGenerationContext;
  createdAt: string;
  updatedAt: string;
};

export type SaveOutreachMessageFeedbackInput = {
  outreachMessageId: string;
  userId: string;
  reasonCodes: OutreachMessageFeedbackReason[];
  notes?: string;
  messageSnapshot: string;
  messageRevision: 0 | 1;
  generationRequestId?: string;
  generationContext: OutreachFeedbackGenerationContext;
  updatedAt: string;
};

export type OutreachGenerationContext = {
  schemaVersion: 1;
  generatedAt: string;
  profile: {
    id: string;
    version: number;
    updatedAt: string;
    markdownGeneratedAt?: string;
    markdownSha256: string;
    toneTags: string[];
    avoidTags: string[];
    avoidNote: string;
  };
  selection: {
    roleTrack?: { id: string; name: string; targetTitles: string[] };
    resume?: { id: string; name: string; highlights: string[] };
    workExample?: { id: string; title: string; oneHitter: string; context: string; link?: string };
  };
  pursuit: {
    id: string;
    selectionSnapshot?: PursuitSelectionSnapshot;
  };
  job: {
    id?: string;
    title: string;
    companyName: string;
    location?: string;
    remoteType?: string;
    employmentType?: string;
    compensationText?: string;
    sourceUrl?: string;
  };
  recipient: {
    contactSuggestionId: string;
    name: string;
    title: string;
    contactType: HumanPathContact["contactType"];
  };
};

export type OutreachFeedbackGenerationContext =
  | { source: "initial_generation" | "regeneration"; generation: OutreachGenerationContext }
  | {
      source: "legacy_partial";
      selectedRoleTrackId?: string;
      selectedResumeId?: string;
      selectedWorkExampleId?: string;
      pursuitSelectionSnapshot?: PursuitSelectionSnapshot;
    };

export type OutreachMessageRecord = {
  id: string;
  pursuitId: string;
  contactSuggestionId?: string;
  recipientType: OutreachRecipientType;
  channel: string;
  message: string;
  previousMessage?: string;
  regenerationCount?: 0 | 1;
  status: OutreachMessageStatus;
  rejectionReason?: string;
  selectedRoleTrackId?: string;
  selectedResumeId?: string;
  selectedWorkExampleId?: string;
  generationRequestId?: string;
  regenerationContext?: OutreachGenerationContext;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
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
  | { status: "generated"; contacts: HumanPathContact[]; diagnostics: HumanPathDiagnostics }
  | { status: "provider_unavailable"; reason: string };

export type HumanPathProvider = (input: HumanPathProviderInput) => Promise<HumanPathProviderResult>;

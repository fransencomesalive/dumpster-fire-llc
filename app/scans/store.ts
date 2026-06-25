import { companies as initialCompanies, contactSuggestions as initialContactSuggestions, dashboardSettings as initialDashboardSettings, jobs as initialJobs, scanLogs as initialScanLogs, searchProfile as initialSearchProfile } from "./data";
import type { NormalizedConnectorJob } from "./connectors";
import { evaluateJobMatch, isMatchingRuleConfig, randallPrivateMatchingConfig, type MatchDecision, type MatchingRuleConfig } from "./matching";
import { compileSearchProfile, type CompiledSearchProfile, type ProfileCompilerInput } from "./profile-compiler";
import { parseCandidateDossier, type ParsedDossier } from "./dossier-parser";
import { scoreJob } from "./scoring";
import { buildTuningPreviewImpact, type TuningPreviewImpact } from "./tuning-preview";
import { buildTuningReport, type MatchDecisionEvidence, type TuningReport } from "./tuning-report";
import type { ApplyWizardSubmission, Company, CompanyStatus, ContactSuggestion, ContactStatus, ContactType, DashboardSettings, FitBucket, Job, JobMatchFeedback, JobStatus, NearMissReviewDecision, NearMissReviewDecisionValue, RecommendedAction, RemoteClassification, ScanCadence, ScanLog, SourceProvider, UserSearchProfile } from "./types";

export type DashboardState = {
  companies: Company[];
  jobs: Job[];
  contactSuggestions: ContactSuggestion[];
  applicationActions: ApplyWizardSubmission[];
  matchFeedback: JobMatchFeedback[];
  scanLogs: ScanLog[];
  searchProfile: UserSearchProfile;
  settings: DashboardSettings;
  persistence: "supabase" | "memory";
};

export type SearchProfileUpdate = Pick<
  UserSearchProfile,
  "targetTitles" | "compensationFloor" | "freelanceRateFloor" | "remoteOnly" | "doNotApplyCompanies"
>;

export type CompanyUpdate = Pick<
  Company,
  "companyName" | "websiteUrl" | "careersUrl" | "atsProvider" | "atsBoardToken" | "industryBucket" | "remoteLikelihood" | "notes" | "status"
>;

export type SettingsUpdate = DashboardSettings;

export type CompanyCreate = CompanyUpdate;

export type MatchFeedbackCreate = Pick<JobMatchFeedback, "jobId" | "rating" | "reason" | "matchVersion">;

export type NearMissReviewDecisionCreate = {
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
};

export type CompiledProfileSaveResult = {
  compiledProfile: CompiledSearchProfile;
  dashboardState: DashboardState;
  persistence: "supabase" | "memory";
};

export type ActiveMatchingConfigResult = {
  matchingConfig: MatchingRuleConfig;
  source: "compiled_profile" | "fallback_private";
};

export type ConnectorMatchDecisionInput = {
  externalJobId: string;
  title: string;
  included: boolean;
  matchDecision: MatchDecision;
};

export type ConnectorApplyResult = {
  dashboardState: DashboardState;
  inserted: number;
  updated: number;
  closed: number;
};

export type ConnectorApplyOptions = {
  writeScanLog?: boolean;
  completedAt?: string;
  // When true, skip the post-write full-dashboard re-read and return the pre-write snapshot.
  // The batch scan loop never consumes the per-source dashboardState (it re-reads once at the
  // end), so re-reading the entire dashboard after every source is pure wasted work.
  skipReturnState?: boolean;
  // A pre-read dashboard snapshot to use instead of reading inside this apply. The batch scan
  // reads once after persisting source companies and passes it to every source, turning ~90
  // expensive full-dashboard reads into one. Safe because each company is applied once and is the
  // only writer for its own jobs during a scan, so the per-company pre-write rows are stable.
  dashboardState?: DashboardState;
};

export type ScanLogCreate = {
  startedAt: string;
  completedAt: string;
  status: ScanLog["status"];
  companiesScanned: number;
  jobsFound: number;
  newJobsAdded: number;
  jobsUpdated: number;
  jobsClosed: number;
  errors: string[];
};

export type ContactResearchInput = {
  name: string;
  title: string;
  contactType: ContactType;
  linkedinUrl: string;
  evidenceUrl: string;
  confidence: number;
  reason: string;
  notes: string;
  status: ContactStatus;
};

export type CompanyImportResult = {
  dashboardState: DashboardState;
  imported: number;
  created: number;
  updated: number;
};

type MemoryDashboardState = Omit<DashboardState, "persistence">;

type SupabaseConfig = {
  url: string;
  key: string;
  profileId: string;
};

type ProfileRow = {
  approved_login_email: string;
  target_titles: string[];
  positive_keywords: string[];
  negative_keywords: string[];
  target_industries: string[];
  compensation_floor: number;
  freelance_rate_floor: number;
  remote_only: boolean;
  do_not_apply_companies: string[];
};

type SettingsRow = {
  scan_enabled: boolean;
  scan_cadence: ScanCadence;
  digest_enabled: boolean;
  digest_cadence?: ScanCadence;
  digest_time: string;
  max_roles_per_scan: number;
};

type CompanyRow = {
  id: string;
  company_name: string;
  website_url: string;
  careers_url: string;
  ats_provider: SourceProvider;
  ats_board_token: string;
  industry_bucket: string;
  remote_likelihood: number;
  notes: string;
  status: CompanyStatus;
  last_successful_scan: string | null;
  last_error: string | null;
};

type JobRow = {
  id: string;
  company_id: string;
  external_job_id: string;
  source_provider: SourceProvider;
  source_url: string;
  apply_url: string;
  title: string;
  company_name: string;
  location: string;
  remote_type: Job["remoteType"];
  remote_classification: RemoteClassification | null;
  posting_remote_language: string | null;
  remote_system_read: string | null;
  remote_evidence_summary: string | null;
  remote_evidence_url: string | null;
  remote_confidence_score: number | null;
  employment_type: Job["employmentType"];
  department: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_text: string;
  description_text: string;
  first_seen_at: string;
  last_seen_at: string;
  closed_at: string | null;
  status: JobStatus;
  fit_score: number;
  fit_bucket: FitBucket;
  fit_summary: string;
  risk_flags: string[];
  recommended_action: RecommendedAction;
  why_it_matches: string[];
  why_it_might_be_wrong: string[];
  outreach_angle: string;
  resume_tailoring_notes: string[];
  notes: string | null;
  needs_contact_research: boolean;
};

type ContactRow = {
  id: string;
  company_id: string;
  job_id: string | null;
  name: string;
  title: string;
  linkedin_url: string;
  company_bio_url: string | null;
  contact_type: ContactType;
  confidence: number;
  reason: string;
  status: ContactStatus;
  notes: string;
};

type ScanLogRow = {
  id: string;
  started_at: string;
  completed_at: string;
  status: ScanLog["status"];
  companies_scanned: number;
  jobs_found: number;
  new_jobs_added: number;
  jobs_updated: number;
  jobs_closed: number;
  errors_json: string[] | null;
};

type ApplicationActionRow = {
  wizard_session_id: string | null;
  job_id: string;
  contact_id: string | null;
  action_label: string;
  action_type: string;
  action_timestamp: string | null;
  cover_letter_text: string | null;
  notes: string | null;
  created_at: string;
};

type OutreachMessageRow = {
  wizard_session_id: string | null;
  job_id: string;
  contact_id: string | null;
  message_type: ApplyWizardSubmission["generatedMessages"][number]["messageType"];
  message_text: string;
  variation_group_id: string | null;
  generated_at: string;
  notes: string | null;
};

type CoverLetterRow = {
  wizard_session_id: string | null;
  job_id: string;
  text: string;
  generated_at: string;
};

type MatchFeedbackRow = {
  id: string;
  job_id: string;
  rating: JobMatchFeedback["rating"];
  reason: string;
  match_version: string;
  created_at: string;
};

type CompiledProfileRow = {
  matching_config_json: unknown;
};

type MatchDecisionRow = {
  job_id: string | null;
  title: string;
  company_name: string;
  included: boolean;
  score: number;
  fit_bucket: string;
  role_family: string;
  confidence: string;
  positives: string[] | null;
  risks: string[] | null;
  evidence: string[] | null;
  rules_version: string;
};

type NearMissReviewDecisionRow = {
  id: string;
  review_key: string;
  decision: NearMissReviewDecisionValue;
  reason: string;
  title_signal: string;
  company_name: string;
  source_provider: SourceProvider;
  title: string;
  source_url: string;
  review_bucket: string;
  rules_version: string;
  created_at: string;
  updated_at: string;
};

const globalStore = globalThis as typeof globalThis & {
  __jobSearchDashboardState?: MemoryDashboardState;
  __jobSearchMatchingConfig?: MatchingRuleConfig;
  __jobSearchMatchingConfigSource?: ActiveMatchingConfigResult["source"];
  __jobSearchNearMissReviewDecisions?: NearMissReviewDecision[];
  __jobSearchCandidateDossier?: CandidateDossierRecord;
};

function cloneState<T>(state: T): T {
  return structuredClone(state);
}

function slugifyCompanyName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "company";
}

function companyFromCreate(update: CompanyCreate): Company {
  return {
    id: `company-${slugifyCompanyName(update.companyName)}-${Date.now()}`,
    companyName: update.companyName,
    websiteUrl: update.websiteUrl,
    careersUrl: update.careersUrl,
    atsProvider: update.atsProvider,
    atsBoardToken: update.atsBoardToken,
    industryBucket: update.industryBucket,
    remoteLikelihood: update.remoteLikelihood,
    notes: update.notes,
    status: update.status,
    lastSuccessfulScan: "",
  };
}

function jobIdFromConnectorJob(company: Company, normalizedJob: NormalizedConnectorJob) {
  return `job-${slugifyCompanyName(company.id)}-${slugifyCompanyName(normalizedJob.externalJobId)}`;
}

function fitSummaryFromScore(score: ReturnType<typeof scoreJob>) {
  if (score.bucket === "skip") return "Connector found the role, but deterministic scoring recommends skipping it.";
  if (score.positives.length > 0) return `Connector match: ${score.positives.slice(0, 3).join(", ")}.`;
  return "Connector found the role; needs manual review.";
}

function salaryInteger(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined;
}

function isReviewableScanResultStatus(status: JobStatus) {
  return status === "new" || status === "saved" || status === "reviewed";
}

function jobFromNormalizedConnectorJob(
  normalizedJob: NormalizedConnectorJob,
  company: Company,
  profile: UserSearchProfile,
  matchingConfig?: MatchingRuleConfig,
  existingJob?: Job,
  now = new Date().toISOString()
): Job {
  const needsContactResearch = true;
  const baseJob: Omit<Job, "fitScore" | "fitBucket" | "recommendedAction"> = {
    id: existingJob?.id ?? jobIdFromConnectorJob(company, normalizedJob),
    companyId: company.id,
    externalJobId: normalizedJob.externalJobId,
    sourceProvider: normalizedJob.sourceProvider,
    sourceUrl: normalizedJob.sourceUrl,
    applyUrl: normalizedJob.applyUrl,
    title: normalizedJob.title,
    companyName: company.companyName,
    location: normalizedJob.location,
    remoteType: normalizedJob.remoteType,
    employmentType: normalizedJob.employmentType,
    department: normalizedJob.department,
    salaryMin: salaryInteger(normalizedJob.salaryMin),
    salaryMax: salaryInteger(normalizedJob.salaryMax),
    salaryText: normalizedJob.salaryText,
    descriptionText: normalizedJob.descriptionText,
    firstSeenAt: existingJob?.firstSeenAt ?? now,
    lastSeenAt: now,
    closedAt: existingJob?.status === "archived" ? existingJob.closedAt : undefined,
    status: existingJob?.status ?? "new",
    fitSummary: "",
    riskFlags: [],
    whyItMatches: [],
    whyItMightBeWrong: [],
    outreachAngle: existingJob?.outreachAngle ?? "Review source role before drafting outreach.",
    resumeTailoringNotes: existingJob?.resumeTailoringNotes ?? [],
    notes: existingJob?.notes ?? "",
    needsContactResearch,
  };
  const score = scoreJob(baseJob, profile, matchingConfig);

  return {
    ...baseJob,
    fitScore: score.score,
    fitBucket: score.bucket,
    recommendedAction: score.recommendedAction,
    fitSummary: existingJob?.fitSummary || fitSummaryFromScore(score),
    riskFlags: score.risks,
    whyItMatches: score.positives,
    whyItMightBeWrong: score.risks,
  };
}

function jobToSupabaseBody(job: Job, profileId: string, rawPayload?: unknown) {
  return {
    id: job.id,
    profile_id: profileId,
    company_id: job.companyId,
    external_job_id: job.externalJobId,
    source_provider: job.sourceProvider,
    source_url: job.sourceUrl,
    apply_url: job.applyUrl,
    title: job.title,
    company_name: job.companyName,
    location: job.location,
    remote_type: job.remoteType,
    employment_type: job.employmentType,
    department: job.department,
    salary_min: job.salaryMin ?? null,
    salary_max: job.salaryMax ?? null,
    salary_text: job.salaryText,
    description_text: job.descriptionText,
    raw_payload_json: rawPayload ?? {},
    first_seen_at: job.firstSeenAt,
    last_seen_at: job.lastSeenAt,
    closed_at: job.closedAt ?? null,
    status: job.status,
    fit_score: job.fitScore,
    fit_bucket: job.fitBucket,
    fit_summary: job.fitSummary,
    risk_flags: job.riskFlags,
    recommended_action: job.recommendedAction,
    why_it_matches: job.whyItMatches,
    why_it_might_be_wrong: job.whyItMightBeWrong,
    outreach_angle: job.outreachAngle,
    resume_tailoring_notes: job.resumeTailoringNotes,
    notes: job.notes,
    needs_contact_research: job.needsContactResearch,
    updated_at: job.lastSeenAt,
  };
}

function matchDecisionToSupabaseBody(
  decision: ConnectorMatchDecisionInput,
  company: Company,
  profileId: string,
  decidedAt: string,
  jobId?: string
) {
  return {
    profile_id: profileId,
    job_id: jobId ?? null,
    company_id: company.id,
    external_job_id: decision.externalJobId,
    source_provider: company.atsProvider,
    title: decision.title,
    company_name: company.companyName,
    included: decision.included,
    score: decision.matchDecision.score,
    fit_bucket: decision.matchDecision.bucket,
    recommended_action: decision.matchDecision.recommendedAction,
    role_family: decision.matchDecision.roleFamily,
    confidence: decision.matchDecision.confidence,
    rules_version: decision.matchDecision.rulesVersion,
    fit_summary: decision.matchDecision.fitSummary,
    positives: decision.matchDecision.positives,
    risks: decision.matchDecision.risks,
    evidence: decision.matchDecision.evidence,
    decision_context_json: {
      source: "connector_scan",
      matchVersion: decision.matchDecision.rulesVersion,
    },
    decided_at: decidedAt,
    updated_at: decidedAt,
  };
}

function chunked<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) return null;

  return {
    url: url.replace(/\/$/, ""),
    key,
    profileId: process.env.JOB_SEARCH_PROFILE_ID || "default",
  };
}

function getMutableMemoryState(): MemoryDashboardState {
  if (!globalStore.__jobSearchDashboardState) {
    globalStore.__jobSearchDashboardState = cloneState({
      companies: initialCompanies,
      jobs: initialJobs,
      contactSuggestions: initialContactSuggestions,
      applicationActions: [],
      matchFeedback: [],
      scanLogs: initialScanLogs,
      searchProfile: initialSearchProfile,
      settings: initialDashboardSettings,
    });
  }

  if (!globalStore.__jobSearchDashboardState.contactSuggestions) {
    globalStore.__jobSearchDashboardState.contactSuggestions = cloneState(initialContactSuggestions);
  }

  if (!globalStore.__jobSearchDashboardState.applicationActions) {
    globalStore.__jobSearchDashboardState.applicationActions = [];
  }

  if (!globalStore.__jobSearchDashboardState.matchFeedback) {
    globalStore.__jobSearchDashboardState.matchFeedback = [];
  }

  if (!globalStore.__jobSearchDashboardState.settings) {
    globalStore.__jobSearchDashboardState.settings = cloneState(initialDashboardSettings);
  }

  if (!globalStore.__jobSearchMatchingConfig) {
    globalStore.__jobSearchMatchingConfig = randallPrivateMatchingConfig;
    globalStore.__jobSearchMatchingConfigSource = "fallback_private";
  }

  if (!globalStore.__jobSearchNearMissReviewDecisions) {
    globalStore.__jobSearchNearMissReviewDecisions = [];
  }

  globalStore.__jobSearchDashboardState.jobs = globalStore.__jobSearchDashboardState.jobs.map((job) => {
    const initialJob = initialJobs.find((item) => item.id === job.id);
    return initialJob ? { ...initialJob, ...job } : job;
  });

  return globalStore.__jobSearchDashboardState;
}

function getMemoryDashboardState(): DashboardState {
  return {
    ...cloneState(getMutableMemoryState()),
    persistence: "memory",
  };
}

function toQuery(params: Record<string, string>) {
  return new URLSearchParams(params).toString();
}

async function supabaseRequest<T>(
  config: SupabaseConfig,
  table: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    query?: Record<string, string>;
    body?: unknown;
    prefer?: string;
  } = {}
): Promise<T> {
  const query = options.query ? `?${toQuery(options.query)}` : "";
  const response = await fetch(`${config.url}/rest/v1/${table}${query}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase ${table} request failed: ${response.status} ${detail}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) return undefined as T;

  return JSON.parse(text) as T;
}

function isMissingSupabaseTableError(error: unknown, table: string) {
  return error instanceof Error && error.message.includes(`Supabase ${table} request failed: 404`);
}

function mapProfile(row: ProfileRow | undefined): UserSearchProfile {
  if (!row) return initialSearchProfile;

  return {
    targetTitles: row.target_titles ?? [],
    positiveKeywords: row.positive_keywords ?? [],
    negativeKeywords: row.negative_keywords ?? [],
    targetIndustries: row.target_industries ?? [],
    compensationFloor: row.compensation_floor,
    freelanceRateFloor: row.freelance_rate_floor,
    remoteOnly: row.remote_only,
    doNotApplyCompanies: row.do_not_apply_companies ?? [],
    approvedLoginEmail: row.approved_login_email,
  };
}

function mapSettings(row: SettingsRow | undefined): DashboardSettings {
  if (!row) return initialDashboardSettings;

  return {
    scanEnabled: row.scan_enabled,
    scanCadence: row.scan_cadence,
    digestEnabled: row.digest_enabled,
    digestCadence: row.digest_cadence ?? initialDashboardSettings.digestCadence,
    digestTime: row.digest_time,
    maxRolesPerScan: row.max_roles_per_scan,
  };
}

function mapCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    companyName: row.company_name,
    websiteUrl: row.website_url,
    careersUrl: row.careers_url,
    atsProvider: row.ats_provider,
    atsBoardToken: row.ats_board_token,
    industryBucket: row.industry_bucket,
    remoteLikelihood: row.remote_likelihood,
    notes: row.notes,
    status: row.status,
    lastSuccessfulScan: row.last_successful_scan ?? "",
    lastError: row.last_error ?? undefined,
  };
}

function mapJob(row: JobRow): Job {
  return {
    id: row.id,
    companyId: row.company_id,
    externalJobId: row.external_job_id,
    sourceProvider: row.source_provider,
    sourceUrl: row.source_url,
    applyUrl: row.apply_url,
    title: row.title,
    companyName: row.company_name,
    location: row.location,
    remoteType: row.remote_type,
    employmentType: row.employment_type,
    department: row.department,
    salaryMin: row.salary_min ?? undefined,
    salaryMax: row.salary_max ?? undefined,
    salaryText: row.salary_text,
    descriptionText: row.description_text,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    closedAt: row.closed_at ?? undefined,
    status: row.status,
    fitScore: row.fit_score,
    fitBucket: row.fit_bucket,
    fitSummary: row.fit_summary,
    riskFlags: row.risk_flags ?? [],
    recommendedAction: row.recommended_action,
    whyItMatches: row.why_it_matches ?? [],
    whyItMightBeWrong: row.why_it_might_be_wrong ?? [],
    outreachAngle: row.outreach_angle,
    resumeTailoringNotes: row.resume_tailoring_notes ?? [],
    notes: row.notes ?? "",
    needsContactResearch: row.needs_contact_research,
    remoteClassification: row.remote_classification ?? undefined,
    postingRemoteLanguage: row.posting_remote_language ?? undefined,
    remoteSystemRead: row.remote_system_read ?? undefined,
    remoteEvidenceSummary: row.remote_evidence_summary ?? undefined,
    remoteEvidenceUrl: row.remote_evidence_url ?? undefined,
    remoteConfidenceScore: row.remote_confidence_score ?? undefined,
  };
}

function outreachFitRating(confidence: number): ContactSuggestion["outreachFitRating"] {
  if (confidence >= 85) return 5;
  if (confidence >= 70) return 4;
  if (confidence >= 55) return 3;
  if (confidence >= 35) return 2;
  return 1;
}

function mapContactSuggestion(row: ContactRow, companies: Company[]): ContactSuggestion | null {
  if (!row.job_id) return null;

  const company = companies.find((item) => item.id === row.company_id);

  return {
    id: row.id,
    jobId: row.job_id,
    name: row.name,
    title: row.title,
    companyName: company?.companyName ?? "",
    linkedinUrl: row.linkedin_url,
    otherProfileUrl: row.company_bio_url ?? undefined,
    contactType: row.contact_type,
    relevanceReason: row.reason,
    roleConnection: row.notes || row.reason,
    currentCompanyEvidence: row.company_bio_url ? "Company profile evidence recorded." : "Manual contact research record.",
    evidenceUrl: row.company_bio_url ?? row.linkedin_url,
    confidenceScore: row.confidence,
    outreachFitRating: outreachFitRating(row.confidence),
    riskNotes: row.status === "to_research" ? ["Contact requires additional verification."] : [],
    verified: row.status !== "to_research" && row.confidence >= 70,
  };
}

function mapScanLog(row: ScanLogRow): ScanLog {
  return {
    id: row.id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    companiesScanned: row.companies_scanned,
    jobsFound: row.jobs_found,
    newJobsAdded: row.new_jobs_added,
    jobsUpdated: row.jobs_updated,
    jobsClosed: row.jobs_closed,
    errors: row.errors_json ?? [],
  };
}

function mapApplicationActions(
  actionRows: ApplicationActionRow[],
  messageRows: OutreachMessageRow[],
  coverLetterRows: CoverLetterRow[]
): ApplyWizardSubmission[] {
  const groups = new Map<string, ApplyWizardSubmission & { savedAt: string }>();

  function getOrCreateGroup(sessionId: string, jobId: string, savedAt: string) {
    const current = groups.get(sessionId) ?? {
      sessionId,
      savedAt,
      jobId,
      applicationMode: "executive_producer" as const,
      selectedContactIds: [],
      completedActions: [],
      generatedMessages: [],
      coverLetterText: "",
      resumeNotesText: "",
      notes: undefined,
    };
    groups.set(sessionId, current);
    return current;
  }

  actionRows.forEach((row) => {
    const savedAt = row.action_timestamp ?? row.created_at;
    const sessionId = row.wizard_session_id ?? `${row.job_id}-${savedAt}`;
    const current = getOrCreateGroup(sessionId, row.job_id, savedAt);

    if (row.contact_id && !current.selectedContactIds.includes(row.contact_id)) {
      current.selectedContactIds.push(row.contact_id);
    }

    if (row.action_type === "resume_notes_generated") {
      current.resumeNotesText = row.notes ?? current.resumeNotesText;
    } else if (row.action_label && !current.completedActions.includes(row.action_label)) {
      current.completedActions.push(row.action_label);
    }

    current.coverLetterText = current.coverLetterText || row.cover_letter_text || "";
    current.notes = current.notes ?? row.notes ?? undefined;
    if (row.notes?.includes("Program Director")) current.applicationMode = "program_director";
    if (row.notes?.includes("Executive Producer")) current.applicationMode = "executive_producer";
  });

  messageRows.forEach((row) => {
    const savedAt = row.generated_at;
    const sessionId = row.wizard_session_id ?? row.variation_group_id ?? `${row.job_id}-${savedAt}`;
    const group = getOrCreateGroup(sessionId, row.job_id, savedAt);
    const parsedNotes = (() => {
      if (!row.notes?.startsWith("{")) return null;
      try {
        return JSON.parse(row.notes) as Partial<ApplyWizardSubmission["generatedMessages"][number]> & { contactName?: string };
      } catch {
        return null;
      }
    })();

    if (row.contact_id && !group.selectedContactIds.includes(row.contact_id)) {
      group.selectedContactIds.push(row.contact_id);
    }

    group.generatedMessages.push({
      contactId: row.contact_id ?? "",
      contactName: parsedNotes?.contactName ?? row.notes?.replace(/^Generated variation \d+ for /, "") ?? "Contact",
      messageText: row.message_text,
      messageType: row.message_type,
      recipientType: parsedNotes?.recipientType,
      resumeTrack: parsedNotes?.resumeTrack,
      proofObjectUsed: parsedNotes?.proofObjectUsed,
      approved: parsedNotes?.approved,
      rejectedReason: parsedNotes?.rejectedReason,
      notes: parsedNotes?.notes,
    });
  });

  coverLetterRows.forEach((row) => {
    const sessionId = row.wizard_session_id ?? `${row.job_id}-${row.generated_at}`;
    const group = getOrCreateGroup(sessionId, row.job_id, row.generated_at);
    if (!group.coverLetterText) group.coverLetterText = row.text;
  });

  return Array.from(groups.values())
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .map((group) => ({
      sessionId: group.sessionId,
      savedAt: group.savedAt,
      jobId: group.jobId,
      applicationMode: group.applicationMode,
      selectedContactIds: group.selectedContactIds,
      completedActions: group.completedActions,
      generatedMessages: group.generatedMessages,
      coverLetterText: group.coverLetterText,
      resumeNotesText: group.resumeNotesText,
      notes: group.notes,
    }));
}

function mapMatchFeedback(row: MatchFeedbackRow): JobMatchFeedback {
  return {
    id: row.id,
    jobId: row.job_id,
    rating: row.rating,
    reason: row.reason,
    matchVersion: row.match_version,
    createdAt: row.created_at,
  };
}

function mapMatchDecisionEvidence(row: MatchDecisionRow): MatchDecisionEvidence {
  return {
    jobId: row.job_id ?? undefined,
    title: row.title,
    companyName: row.company_name,
    included: row.included,
    score: row.score,
    bucket: row.fit_bucket,
    roleFamily: row.role_family,
    confidence: row.confidence,
    positives: row.positives ?? [],
    risks: row.risks ?? [],
    evidence: row.evidence ?? [],
    rulesVersion: row.rules_version,
  };
}

function mapNearMissReviewDecision(row: NearMissReviewDecisionRow): NearMissReviewDecision {
  return {
    id: row.id,
    reviewKey: row.review_key,
    decision: row.decision,
    reason: row.reason,
    titleSignal: row.title_signal,
    companyName: row.company_name,
    provider: row.source_provider,
    title: row.title,
    sourceUrl: row.source_url,
    reviewBucket: row.review_bucket,
    rulesVersion: row.rules_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getSupabaseDashboardState(config: SupabaseConfig): Promise<DashboardState> {
  const profileFilter = `eq.${config.profileId}`;
  const [profiles, settings, companies, jobs, contacts, scanLogs, applicationActions, outreachMessages, coverLetters, matchFeedback] = await Promise.all([
    supabaseRequest<ProfileRow[]>(config, "job_search_profiles", {
      query: { id: profileFilter, select: "*" },
    }),
    supabaseRequest<SettingsRow[]>(config, "job_search_settings", {
      query: { profile_id: profileFilter, select: "*" },
    }),
    supabaseRequest<CompanyRow[]>(config, "job_search_companies", {
      query: { profile_id: profileFilter, select: "*", order: "company_name.asc" },
    }),
    supabaseRequest<JobRow[]>(config, "job_search_jobs", {
      query: { profile_id: profileFilter, select: "*", order: "fit_score.desc" },
    }),
    supabaseRequest<ContactRow[]>(config, "job_search_contacts", {
      query: { profile_id: profileFilter, select: "*", order: "confidence.desc" },
    }),
    supabaseRequest<ScanLogRow[]>(config, "job_search_scan_logs", {
      query: { profile_id: profileFilter, select: "*", order: "completed_at.desc", limit: "25" },
    }),
    supabaseRequest<ApplicationActionRow[]>(config, "job_search_application_actions", {
      query: { profile_id: profileFilter, select: "*", order: "created_at.desc", limit: "100" },
    }),
    supabaseRequest<OutreachMessageRow[]>(config, "job_search_outreach_messages", {
      query: { profile_id: profileFilter, select: "*", order: "generated_at.desc", limit: "100" },
    }),
    supabaseRequest<CoverLetterRow[]>(config, "job_search_cover_letters", {
      query: { profile_id: profileFilter, select: "*", order: "generated_at.desc", limit: "50" },
    }),
    supabaseRequest<MatchFeedbackRow[]>(config, "job_search_match_feedback", {
      query: { profile_id: profileFilter, select: "*", order: "created_at.desc", limit: "500" },
    }).catch(() => []),
  ]);

  const mappedCompanies = companies.map(mapCompany);
  const mappedContactSuggestions = contacts
    .filter((contact) => contact.status !== "archived" && contact.status !== "not_relevant")
    .map((contact) => mapContactSuggestion(contact, mappedCompanies))
    .filter((contact): contact is ContactSuggestion => Boolean(contact));

  return {
    companies: mappedCompanies,
    jobs: jobs.map(mapJob),
    contactSuggestions: mappedContactSuggestions,
    applicationActions: mapApplicationActions(applicationActions, outreachMessages, coverLetters),
    matchFeedback: matchFeedback.map(mapMatchFeedback),
    scanLogs: scanLogs.map(mapScanLog),
    searchProfile: mapProfile(profiles[0]),
    settings: mapSettings(settings[0]),
    persistence: "supabase",
  };
}

function statusFromWizardSubmission(submission: ApplyWizardSubmission): JobStatus {
  if (submission.completedActions.some((action) => action === "Skipped after review")) return "skipped";
  if (submission.completedActions.some((action) => action === "Applied online" || action === "Applied via LinkedIn")) return "applied";
  if (submission.completedActions.some((action) => action.startsWith("Messaged ") || action === "Sent email")) return "messaged";
  if (submission.completedActions.some((action) => action === "Saved for follow-up")) return "saved";
  return "reviewed";
}

function actionTypeFromLabel(actionLabel: string) {
  if (actionLabel === "Applied online") return "applied_online";
  if (actionLabel === "Applied via LinkedIn") return "applied_linkedin";
  if (actionLabel.startsWith("Messaged ")) return "message_sent";
  if (actionLabel === "Sent email") return "email_sent";
  if (actionLabel === "Saved for follow-up") return "saved_for_follow_up";
  if (actionLabel === "Skipped after review") return "skipped";
  if (actionLabel === "Needs resume adjustment") return "resume_notes_generated";
  if (actionLabel === "Needs cover letter revision") return "cover_letter_generated";
  return "other";
}

async function saveSupabaseApplyWizardSubmission(config: SupabaseConfig, submission: ApplyWizardSubmission): Promise<DashboardState> {
  const now = submission.savedAt;
  const nextStatus = statusFromWizardSubmission(submission);
  const completedActionLabels = submission.completedActions.length > 0 ? submission.completedActions : ["Reviewed in apply wizard"];
  const submittedContactIds = Array.from(new Set([
    ...submission.selectedContactIds,
    ...submission.generatedMessages.map((message) => message.contactId),
  ].filter(Boolean)));
  const existingContacts = submittedContactIds.length > 0
    ? await supabaseRequest<Array<Pick<ContactRow, "id">>>(config, "job_search_contacts", {
        query: {
          profile_id: `eq.${config.profileId}`,
          id: `in.(${submittedContactIds.join(",")})`,
          select: "id",
        },
      })
    : [];
  const existingContactIds = new Set(existingContacts.map((contact) => contact.id));

  await Promise.all([
    supabaseRequest(config, "job_search_application_actions", {
      method: "POST",
      body: completedActionLabels.map((actionLabel) => ({
        profile_id: config.profileId,
        wizard_session_id: submission.sessionId,
        job_id: submission.jobId,
        action_type: actionTypeFromLabel(actionLabel),
        action_label: actionLabel,
        action_status: actionLabel === "No action taken" ? "not_applicable" : "completed",
        action_timestamp: now,
        cover_letter_text: submission.coverLetterText,
        notes: submission.notes ?? null,
      })),
      prefer: "return=minimal",
    }),
    submission.generatedMessages.length > 0
      ? supabaseRequest(config, "job_search_outreach_messages", {
          method: "POST",
          body: submission.generatedMessages.map((message, index) => ({
            profile_id: config.profileId,
            wizard_session_id: submission.sessionId,
            job_id: submission.jobId,
            contact_id: existingContactIds.has(message.contactId) ? message.contactId : null,
            message_type: message.messageType,
            message_text: message.messageText,
            tone_version: "direct_skeptical_specific",
            variation_group_id: submission.sessionId,
            generated_at: now,
            notes: JSON.stringify({
              contactName: message.contactName,
              variation: index + 1,
              recipientType: message.recipientType,
              resumeTrack: message.resumeTrack,
              proofObjectUsed: message.proofObjectUsed,
              approved: message.approved === true,
              rejectedReason: message.rejectedReason,
              notes: message.notes,
            }),
          })),
          prefer: "return=minimal",
        })
      : Promise.resolve(),
    submission.coverLetterText
      ? supabaseRequest(config, "job_search_cover_letters", {
          method: "POST",
          body: {
            profile_id: config.profileId,
            wizard_session_id: submission.sessionId,
            job_id: submission.jobId,
            version: 1,
            text: submission.coverLetterText,
            generated_at: now,
            notes: submission.notes ?? null,
          },
          prefer: "return=minimal",
        })
      : Promise.resolve(),
    submission.resumeNotesText
      ? supabaseRequest(config, "job_search_application_actions", {
          method: "POST",
          body: {
            profile_id: config.profileId,
            wizard_session_id: submission.sessionId,
            job_id: submission.jobId,
            action_type: "resume_notes_generated",
            action_label: "Resume notes saved",
            action_status: "completed",
            action_timestamp: now,
            notes: submission.resumeNotesText,
          },
          prefer: "return=minimal",
        })
      : Promise.resolve(),
  ]);

  await updateSupabaseJobStatus(config, submission.jobId, nextStatus);
  return getSupabaseDashboardState(config);
}

async function saveSupabaseMatchFeedback(config: SupabaseConfig, feedback: MatchFeedbackCreate): Promise<DashboardState> {
  const now = new Date().toISOString();
  const existingRows = await supabaseRequest<Array<Pick<MatchFeedbackRow, "id">>>(config, "job_search_match_feedback", {
    query: {
      profile_id: `eq.${config.profileId}`,
      job_id: `eq.${feedback.jobId}`,
      select: "id",
      limit: "1",
    },
  });
  const body = {
    id: existingRows[0]?.id ?? `feedback-${crypto.randomUUID()}`,
    profile_id: config.profileId,
    job_id: feedback.jobId,
    rating: feedback.rating,
    reason: feedback.reason.slice(0, 200),
    match_version: feedback.matchVersion,
    ...(existingRows[0] ? {} : { created_at: now }),
    updated_at: now,
  };

  if (existingRows[0]) {
    await supabaseRequest(config, "job_search_match_feedback", {
      method: "PATCH",
      query: {
        id: `eq.${existingRows[0].id}`,
        profile_id: `eq.${config.profileId}`,
      },
      body,
      prefer: "return=minimal",
    });
  } else {
    await supabaseRequest(config, "job_search_match_feedback", {
      method: "POST",
      body,
      prefer: "return=minimal",
    });
  }

  return getSupabaseDashboardState(config);
}

async function getSupabaseNearMissReviewDecisions(config: SupabaseConfig): Promise<NearMissReviewDecision[]> {
  const rows = await supabaseRequest<NearMissReviewDecisionRow[]>(config, "job_search_near_miss_reviews", {
    query: {
      profile_id: `eq.${config.profileId}`,
      select: "id,review_key,decision,reason,title_signal,company_name,source_provider,title,source_url,review_bucket,rules_version,created_at,updated_at",
      order: "updated_at.desc",
      limit: "500",
    },
  });

  return rows.map(mapNearMissReviewDecision);
}

async function saveSupabaseNearMissReviewDecision(
  config: SupabaseConfig,
  input: NearMissReviewDecisionCreate
): Promise<NearMissReviewDecision> {
  const now = new Date().toISOString();
  const body = {
    id: `near-miss-review-${input.reviewKey}-${input.rulesVersion}`,
    profile_id: config.profileId,
    review_key: input.reviewKey,
    decision: input.decision,
    reason: input.reason.slice(0, 500),
    title_signal: input.titleSignal.slice(0, 120),
    company_name: input.companyName,
    source_provider: input.provider,
    title: input.title,
    source_url: input.sourceUrl,
    review_bucket: input.reviewBucket,
    rules_version: input.rulesVersion,
    updated_at: now,
  };

  const rows = await supabaseRequest<NearMissReviewDecisionRow[]>(config, "job_search_near_miss_reviews", {
    method: "POST",
    query: {
      on_conflict: "profile_id,review_key,rules_version",
    },
    body,
    prefer: "resolution=merge-duplicates,return=representation",
  });

  return mapNearMissReviewDecision(rows[0]);
}

async function updateSupabaseJobStatus(config: SupabaseConfig, jobId: string, status: JobStatus): Promise<DashboardState> {
  if (status === "skipped") {
    await supabaseRequest(config, "job_search_jobs", {
      method: "DELETE",
      query: {
        id: `eq.${jobId}`,
        profile_id: `eq.${config.profileId}`,
      },
      prefer: "return=minimal",
    });

    return getSupabaseDashboardState(config);
  }

  const now = new Date().toISOString();
  const statusDates = {
    ...(status === "applied" ? { applied_at: now } : {}),
    ...(status === "messaged" ? { messaged_at: now } : {}),
  };

  await supabaseRequest<JobRow[]>(config, "job_search_jobs", {
    method: "PATCH",
    query: {
      id: `eq.${jobId}`,
      profile_id: `eq.${config.profileId}`,
      select: "id",
    },
    body: {
      status,
      last_seen_at: now,
      updated_at: now,
      ...statusDates,
    },
    prefer: "return=representation",
  });

  return getSupabaseDashboardState(config);
}

async function runSupabaseManualScan(config: SupabaseConfig): Promise<DashboardState> {
  const current = await getSupabaseDashboardState(config);
  const now = new Date();
  const startedAt = new Date(now.getTime() - 90_000).toISOString();
  const completedAt = now.toISOString();
  const activeCompanies = current.companies.filter((company) => company.status === "active");
  const activeJobs = current.jobs.filter((job) => job.status === "new" || job.status === "saved");

  await Promise.all([
    supabaseRequest<ScanLogRow[]>(config, "job_search_scan_logs", {
      method: "POST",
      body: {
        id: `scan-${now.getTime()}`,
        profile_id: config.profileId,
        started_at: startedAt,
        completed_at: completedAt,
        status: "completed",
        companies_scanned: activeCompanies.length,
        jobs_found: current.jobs.length,
        new_jobs_added: 0,
        jobs_updated: activeJobs.length,
        jobs_closed: 0,
        errors_json: [],
      },
      prefer: "return=representation",
    }),
    supabaseRequest(config, "job_search_companies", {
      method: "PATCH",
      query: {
        profile_id: `eq.${config.profileId}`,
        status: "eq.active",
      },
      body: {
        last_successful_scan: completedAt,
        last_error: null,
        updated_at: completedAt,
      },
      prefer: "return=minimal",
    }),
  ]);

  return getSupabaseDashboardState(config);
}

function updateMemoryJobStatus(jobId: string, status: JobStatus): DashboardState {
  const state = getMutableMemoryState();

  if (status === "skipped") {
    state.jobs = state.jobs.filter((item) => item.id !== jobId);
    state.applicationActions = state.applicationActions.filter((action) => action.jobId !== jobId);
    state.contactSuggestions = state.contactSuggestions.filter((contact) => contact.jobId !== jobId);
    return getMemoryDashboardState();
  }

  const job = state.jobs.find((item) => item.id === jobId);

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  job.status = status;
  job.lastSeenAt = new Date().toISOString();

  return getMemoryDashboardState();
}

function runMemoryManualScan(): DashboardState {
  const state = getMutableMemoryState();
  const now = new Date();
  const startedAt = new Date(now.getTime() - 90_000).toISOString();
  const completedAt = now.toISOString();

  state.scanLogs.unshift({
    id: `scan-${now.getTime()}`,
    startedAt,
    completedAt,
    status: "completed",
    companiesScanned: state.companies.filter((company) => company.status === "active").length,
    jobsFound: state.jobs.length,
    newJobsAdded: 0,
    jobsUpdated: state.jobs.filter((job) => job.status === "new" || job.status === "saved").length,
    jobsClosed: 0,
    errors: [],
  });

  state.companies = state.companies.map((company) =>
    company.status === "active"
      ? { ...company, lastSuccessfulScan: completedAt, lastError: undefined }
      : company
  );

  return getMemoryDashboardState();
}

function saveMemoryApplyWizardSubmission(submission: ApplyWizardSubmission): DashboardState {
  const state = getMutableMemoryState();
  state.applicationActions.unshift(cloneState(submission));
  return updateMemoryJobStatus(submission.jobId, statusFromWizardSubmission(submission));
}

function saveMemoryMatchFeedback(feedback: MatchFeedbackCreate): DashboardState {
  const state = getMutableMemoryState();
  const now = new Date().toISOString();
  const existingIndex = state.matchFeedback.findIndex((item) => item.jobId === feedback.jobId);
  const nextFeedback: JobMatchFeedback = {
    id: existingIndex >= 0 ? state.matchFeedback[existingIndex].id : `feedback-${crypto.randomUUID()}`,
    jobId: feedback.jobId,
    rating: feedback.rating,
    reason: feedback.reason.slice(0, 200),
    matchVersion: feedback.matchVersion,
    createdAt: now,
  };

  if (existingIndex >= 0) {
    state.matchFeedback[existingIndex] = nextFeedback;
  } else {
    state.matchFeedback.unshift(nextFeedback);
  }

  return getMemoryDashboardState();
}

function getMemoryNearMissReviewDecisions(): NearMissReviewDecision[] {
  getMutableMemoryState();
  return cloneState(globalStore.__jobSearchNearMissReviewDecisions ?? []);
}

function saveMemoryNearMissReviewDecision(input: NearMissReviewDecisionCreate): NearMissReviewDecision {
  getMutableMemoryState();
  const now = new Date().toISOString();
  const decisions = globalStore.__jobSearchNearMissReviewDecisions ?? [];
  const existingIndex = decisions.findIndex((item) => item.reviewKey === input.reviewKey && item.rulesVersion === input.rulesVersion);
  const nextDecision: NearMissReviewDecision = {
    id: existingIndex >= 0 ? decisions[existingIndex].id : `near-miss-review-${crypto.randomUUID()}`,
    reviewKey: input.reviewKey,
    decision: input.decision,
    reason: input.reason.slice(0, 500),
    titleSignal: input.titleSignal.slice(0, 120),
    companyName: input.companyName,
    provider: input.provider,
    title: input.title,
    sourceUrl: input.sourceUrl,
    reviewBucket: input.reviewBucket,
    rulesVersion: input.rulesVersion,
    createdAt: existingIndex >= 0 ? decisions[existingIndex].createdAt : now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    decisions[existingIndex] = nextDecision;
  } else {
    decisions.unshift(nextDecision);
  }

  globalStore.__jobSearchNearMissReviewDecisions = decisions;
  return cloneState(nextDecision);
}

function updateMemorySearchProfile(update: SearchProfileUpdate): DashboardState {
  const state = getMutableMemoryState();
  state.searchProfile = {
    ...state.searchProfile,
    ...cloneState(update),
  };
  return getMemoryDashboardState();
}

function addMemoryDoNotApplyCompany(companyName: string) {
  const state = getMutableMemoryState();
  const normalizedCompanyName = companyName.trim();

  if (!normalizedCompanyName) return;

  const alreadyBlocked = state.searchProfile.doNotApplyCompanies.some(
    (blockedCompany) => blockedCompany.toLowerCase() === normalizedCompanyName.toLowerCase()
  );

  if (!alreadyBlocked) {
    state.searchProfile.doNotApplyCompanies = [...state.searchProfile.doNotApplyCompanies, normalizedCompanyName];
  }
}

function updateMemoryCompany(companyId: string, update: CompanyUpdate): DashboardState {
  const state = getMutableMemoryState();
  const company = state.companies.find((item) => item.id === companyId);

  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  company.companyName = update.companyName;
  company.websiteUrl = update.websiteUrl;
  company.careersUrl = update.careersUrl;
  company.atsProvider = update.atsProvider;
  company.atsBoardToken = update.atsBoardToken;
  company.industryBucket = update.industryBucket;
  company.remoteLikelihood = update.remoteLikelihood;
  company.notes = update.notes;
  company.status = update.status;

  if (update.status === "do_not_apply") {
    addMemoryDoNotApplyCompany(update.companyName);
  }

  return getMemoryDashboardState();
}

function createMemoryCompany(update: CompanyCreate): DashboardState {
  const state = getMutableMemoryState();
  state.companies.unshift(companyFromCreate(update));

  if (update.status === "do_not_apply") {
    addMemoryDoNotApplyCompany(update.companyName);
  }

  return getMemoryDashboardState();
}

function importMemoryCompanies(companies: CompanyCreate[]): CompanyImportResult {
  const state = getMutableMemoryState();
  let created = 0;
  let updated = 0;

  for (const companyUpdate of companies) {
    const existingCompany = state.companies.find((company) => company.companyName.toLowerCase() === companyUpdate.companyName.toLowerCase());

    if (existingCompany) {
      existingCompany.companyName = companyUpdate.companyName;
      existingCompany.websiteUrl = companyUpdate.websiteUrl;
      existingCompany.careersUrl = companyUpdate.careersUrl;
      existingCompany.atsProvider = companyUpdate.atsProvider;
      existingCompany.atsBoardToken = companyUpdate.atsBoardToken;
      existingCompany.industryBucket = companyUpdate.industryBucket;
      existingCompany.remoteLikelihood = companyUpdate.remoteLikelihood;
      existingCompany.notes = companyUpdate.notes;
      existingCompany.status = companyUpdate.status;
      if (companyUpdate.status === "do_not_apply") {
        addMemoryDoNotApplyCompany(companyUpdate.companyName);
      }
      updated += 1;
    } else {
      state.companies.unshift(companyFromCreate(companyUpdate));
      if (companyUpdate.status === "do_not_apply") {
        addMemoryDoNotApplyCompany(companyUpdate.companyName);
      }
      created += 1;
    }
  }

  return {
    dashboardState: getMemoryDashboardState(),
    imported: companies.length,
    created,
    updated,
  };
}

function applyMemoryConnectorJobs(
  companyId: string,
  normalizedJobs: NormalizedConnectorJob[],
  matchingConfig = globalStore.__jobSearchMatchingConfig ?? randallPrivateMatchingConfig,
  options: ConnectorApplyOptions = {}
): ConnectorApplyResult {
  const state = getMutableMemoryState();
  const company = state.companies.find((item) => item.id === companyId);

  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  const now = options.completedAt ?? new Date().toISOString();
  const fetchedIds = new Set(normalizedJobs.map((job) => job.externalJobId));
  let inserted = 0;
  let updated = 0;
  let closed = 0;

  for (const normalizedJob of normalizedJobs) {
    const existingIndex = state.jobs.findIndex((job) => (
      job.companyId === company.id &&
      job.sourceProvider === normalizedJob.sourceProvider &&
      job.externalJobId === normalizedJob.externalJobId
    ));
    const existingJob = existingIndex >= 0 ? state.jobs[existingIndex] : undefined;
    const nextJob = jobFromNormalizedConnectorJob(normalizedJob, company, state.searchProfile, matchingConfig, existingJob, now);

    if (existingIndex >= 0) {
      state.jobs[existingIndex] = nextJob;
      updated += 1;
    } else {
      state.jobs.unshift(nextJob);
      inserted += 1;
    }
  }

  for (const job of state.jobs) {
    if (
      job.companyId === company.id &&
      job.sourceProvider === company.atsProvider &&
      isReviewableScanResultStatus(job.status) &&
      !fetchedIds.has(job.externalJobId)
    ) {
      job.status = "archived";
      job.closedAt = now;
      closed += 1;
    }
  }

  if (options.writeScanLog !== false) {
    state.scanLogs.unshift({
      id: `scan-${now}`,
      startedAt: now,
      completedAt: now,
      status: "completed",
      companiesScanned: 1,
      jobsFound: normalizedJobs.length,
      newJobsAdded: inserted,
      jobsUpdated: updated,
      jobsClosed: closed,
      errors: [],
    });
  }

  company.lastSuccessfulScan = now;
  company.lastError = undefined;

  return {
    dashboardState: getMemoryDashboardState(),
    inserted,
    updated,
    closed,
  };
}

function updateMemorySettings(update: SettingsUpdate): DashboardState {
  const state = getMutableMemoryState();
  state.settings = cloneState(update);
  return getMemoryDashboardState();
}

function recordMemoryScanLog(input: ScanLogCreate): DashboardState {
  const state = getMutableMemoryState();
  state.scanLogs.unshift({
    id: `scan-${input.completedAt}`,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    status: input.status,
    companiesScanned: input.companiesScanned,
    jobsFound: input.jobsFound,
    newJobsAdded: input.newJobsAdded,
    jobsUpdated: input.jobsUpdated,
    jobsClosed: input.jobsClosed,
    errors: input.errors,
  });
  return getMemoryDashboardState();
}

function inputSummaryFromCompilerInput(input: ProfileCompilerInput) {
  const resumeCharacters = input.resumeText.trim().length;
  const profileCharacters = input.profileText?.trim().length ?? 0;
  const desiredTitleCount = input.preferences?.desiredTitles?.length ?? 0;
  const avoidedTitleCount = input.preferences?.avoidedTitles?.length ?? 0;
  const desiredIndustryCount = input.preferences?.desiredIndustries?.length ?? 0;

  return [
    `${resumeCharacters} resume chars`,
    `${profileCharacters} profile chars`,
    `${desiredTitleCount} desired titles`,
    `${avoidedTitleCount} avoided titles`,
    `${desiredIndustryCount} desired industries`,
  ].join(" · ");
}

function mergeCompiledSearchProfile(compiledProfile: CompiledSearchProfile, fallbackProfile: UserSearchProfile): UserSearchProfile {
  return {
    ...compiledProfile.searchProfile,
    compensationFloor: compiledProfile.searchProfile.compensationFloor || fallbackProfile.compensationFloor,
    freelanceRateFloor: compiledProfile.searchProfile.freelanceRateFloor || fallbackProfile.freelanceRateFloor,
    approvedLoginEmail: compiledProfile.searchProfile.approvedLoginEmail || fallbackProfile.approvedLoginEmail,
  };
}

function updateMemoryCompiledProfile(input: ProfileCompilerInput): CompiledProfileSaveResult {
  const state = getMutableMemoryState();
  const compiledProfile = compileSearchProfile(input);
  state.searchProfile = mergeCompiledSearchProfile(compiledProfile, state.searchProfile);
  globalStore.__jobSearchMatchingConfig = compiledProfile.matchingConfig;
  globalStore.__jobSearchMatchingConfigSource = "compiled_profile";

  return {
    compiledProfile: {
      ...compiledProfile,
      searchProfile: state.searchProfile,
    },
    dashboardState: getMemoryDashboardState(),
    persistence: "memory",
  };
}

async function updateSupabaseSearchProfile(config: SupabaseConfig, update: SearchProfileUpdate): Promise<DashboardState> {
  await supabaseRequest(config, "job_search_profiles", {
    method: "PATCH",
    query: { id: `eq.${config.profileId}` },
    body: {
      target_titles: update.targetTitles,
      compensation_floor: update.compensationFloor,
      freelance_rate_floor: update.freelanceRateFloor,
      remote_only: update.remoteOnly,
      do_not_apply_companies: update.doNotApplyCompanies,
    },
    prefer: "return=minimal",
  });

  return getSupabaseDashboardState(config);
}

async function updateSupabaseFullSearchProfile(config: SupabaseConfig, update: UserSearchProfile) {
  await supabaseRequest(config, "job_search_profiles", {
    method: "PATCH",
    query: { id: `eq.${config.profileId}` },
    body: {
      approved_login_email: update.approvedLoginEmail,
      target_titles: update.targetTitles,
      positive_keywords: update.positiveKeywords,
      negative_keywords: update.negativeKeywords,
      target_industries: update.targetIndustries,
      compensation_floor: update.compensationFloor,
      freelance_rate_floor: update.freelanceRateFloor,
      remote_only: update.remoteOnly,
      do_not_apply_companies: update.doNotApplyCompanies,
      updated_at: new Date().toISOString(),
    },
    prefer: "return=minimal",
  });
}

async function saveSupabaseCompiledProfile(config: SupabaseConfig, input: ProfileCompilerInput): Promise<CompiledProfileSaveResult> {
  const current = await getSupabaseDashboardState(config);
  const compiledProfile = compileSearchProfile(input);
  const searchProfile = mergeCompiledSearchProfile(compiledProfile, current.searchProfile);
  const appliedAt = new Date().toISOString();
  const appliedCompiledProfile: CompiledSearchProfile = {
    ...compiledProfile,
    searchProfile,
  };

  await Promise.all([
    updateSupabaseFullSearchProfile(config, searchProfile),
    supabaseRequest(config, "job_search_compiled_profiles", {
      method: "POST",
      body: {
        profile_id: config.profileId,
        source_kind: "resume_profile_preferences",
        input_summary: inputSummaryFromCompilerInput(input),
        confidence: compiledProfile.confidence,
        missing_inputs: compiledProfile.missingInputs,
        search_profile_json: searchProfile,
        matching_config_json: compiledProfile.matchingConfig,
        evidence_json: compiledProfile.evidence,
        applied_at: appliedAt,
        updated_at: appliedAt,
      },
      prefer: "return=minimal",
    }),
  ]);

  return {
    compiledProfile: appliedCompiledProfile,
    dashboardState: await getSupabaseDashboardState(config),
    persistence: "supabase",
  };
}

async function getSupabaseActiveMatchingConfig(config: SupabaseConfig): Promise<ActiveMatchingConfigResult> {
  const rows = await supabaseRequest<CompiledProfileRow[]>(config, "job_search_compiled_profiles", {
    query: {
      profile_id: `eq.${config.profileId}`,
      applied_at: "not.is.null",
      select: "matching_config_json",
      order: "applied_at.desc",
      limit: "1",
    },
  });
  const matchingConfig = rows[0]?.matching_config_json;

  if (isMatchingRuleConfig(matchingConfig)) {
    return {
      matchingConfig,
      source: "compiled_profile",
    };
  }

  return {
    matchingConfig: randallPrivateMatchingConfig,
    source: "fallback_private",
  };
}

async function updateSupabaseSettings(config: SupabaseConfig, update: SettingsUpdate): Promise<DashboardState> {
  await supabaseRequest(config, "job_search_settings", {
    method: "PATCH",
    query: { profile_id: `eq.${config.profileId}` },
    body: {
      scan_enabled: update.scanEnabled,
      scan_cadence: update.scanCadence,
      digest_enabled: update.digestEnabled,
      digest_cadence: update.digestCadence,
      digest_time: update.digestTime,
      max_roles_per_scan: update.maxRolesPerScan,
      updated_at: new Date().toISOString(),
    },
    prefer: "return=minimal",
  });

  return getSupabaseDashboardState(config);
}

async function recordSupabaseScanLog(config: SupabaseConfig, input: ScanLogCreate): Promise<DashboardState> {
  await supabaseRequest(config, "job_search_scan_logs", {
    method: "POST",
    body: {
      id: `scan-${Date.now()}`,
      profile_id: config.profileId,
      started_at: input.startedAt,
      completed_at: input.completedAt,
      status: input.status,
      companies_scanned: input.companiesScanned,
      jobs_found: input.jobsFound,
      new_jobs_added: input.newJobsAdded,
      jobs_updated: input.jobsUpdated,
      jobs_closed: input.jobsClosed,
      errors_json: input.errors,
    },
    prefer: "return=minimal",
  });

  return getSupabaseDashboardState(config);
}

async function applySupabaseConnectorJobs(
  config: SupabaseConfig,
  companyId: string,
  normalizedJobs: NormalizedConnectorJob[],
  matchDecisions: ConnectorMatchDecisionInput[] = [],
  matchingConfig: MatchingRuleConfig = randallPrivateMatchingConfig,
  options: ConnectorApplyOptions = {}
): Promise<ConnectorApplyResult> {
  // Reuse a shared snapshot when the caller supplies one (batch scan) so a 90-source scan does a
  // single full-dashboard read instead of one per source; fall back to reading when absent.
  const current = options.dashboardState ?? await getSupabaseDashboardState(config);
  const company = current.companies.find((item) => item.id === companyId);

  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  const now = options.completedAt ?? new Date().toISOString();
  const fetchedIds = new Set(normalizedJobs.map((job) => job.externalJobId));
  const existingForCompany = current.jobs.filter((job) => job.companyId === company.id && job.sourceProvider === company.atsProvider);
  const jobIdsByExternalId = new Map<string, string>();
  let inserted = 0;
  let updated = 0;
  let closed = 0;

  for (const normalizedJob of normalizedJobs) {
    const existingJob = existingForCompany.find((job) => job.externalJobId === normalizedJob.externalJobId);
    const nextJob = jobFromNormalizedConnectorJob(normalizedJob, company, current.searchProfile, matchingConfig, existingJob, now);
    const body = jobToSupabaseBody(nextJob, config.profileId, normalizedJob.rawPayload);
    jobIdsByExternalId.set(normalizedJob.externalJobId, nextJob.id);

    if (existingJob) {
      await supabaseRequest(config, "job_search_jobs", {
        method: "PATCH",
        query: {
          id: `eq.${existingJob.id}`,
          profile_id: `eq.${config.profileId}`,
        },
        body,
        prefer: "return=minimal",
      });
      updated += 1;
    } else {
      await supabaseRequest(config, "job_search_jobs", {
        method: "POST",
        body,
        prefer: "return=minimal",
      });
      inserted += 1;
    }
  }

  const staleJobs = existingForCompany.filter((job) => (
    isReviewableScanResultStatus(job.status) &&
    !fetchedIds.has(job.externalJobId)
  ));

  for (const chunk of chunked(staleJobs, 100)) {
    if (chunk.length === 0) continue;
    await supabaseRequest(config, "job_search_jobs", {
      method: "PATCH",
      query: {
        profile_id: `eq.${config.profileId}`,
        id: `in.(${chunk.map((job) => job.id).join(",")})`,
      },
      body: {
        status: "archived",
        closed_at: now,
        updated_at: now,
      },
      prefer: "return=minimal",
    });
    closed += chunk.length;
  }

  if (matchDecisions.length > 0) {
    const decisionRows = matchDecisions.map((decision) => matchDecisionToSupabaseBody(
      decision,
      company,
      config.profileId,
      now,
      jobIdsByExternalId.get(decision.externalJobId)
    ));

    for (const chunk of chunked(decisionRows, 200)) {
      await supabaseRequest(config, "job_search_match_decisions", {
        method: "POST",
        query: {
          on_conflict: "profile_id,company_id,source_provider,external_job_id,rules_version",
        },
        body: chunk,
        prefer: "resolution=merge-duplicates,return=minimal",
      });
    }
  }

  await Promise.all([
    ...(options.writeScanLog === false ? [] : [
      supabaseRequest(config, "job_search_scan_logs", {
        method: "POST",
        body: {
          id: `scan-${Date.now()}`,
          profile_id: config.profileId,
          started_at: now,
          completed_at: now,
          status: "completed",
          companies_scanned: 1,
          jobs_found: normalizedJobs.length,
          new_jobs_added: inserted,
          jobs_updated: updated,
          jobs_closed: closed,
          errors_json: [],
        },
        prefer: "return=minimal",
      }),
    ]),
    supabaseRequest(config, "job_search_companies", {
      method: "PATCH",
      query: {
        id: `eq.${company.id}`,
        profile_id: `eq.${config.profileId}`,
      },
      body: {
        last_successful_scan: now,
        last_error: null,
        updated_at: now,
      },
      prefer: "return=minimal",
    }),
  ]);

  return {
    dashboardState: options.skipReturnState ? current : await getSupabaseDashboardState(config),
    inserted,
    updated,
    closed,
  };
}

async function updateSupabaseCompany(config: SupabaseConfig, companyId: string, update: CompanyUpdate): Promise<DashboardState> {
  await supabaseRequest(config, "job_search_companies", {
    method: "PATCH",
    query: {
      id: `eq.${companyId}`,
      profile_id: `eq.${config.profileId}`,
    },
    body: {
      company_name: update.companyName,
      website_url: update.websiteUrl,
      careers_url: update.careersUrl,
      ats_provider: update.atsProvider,
      ats_board_token: update.atsBoardToken,
      industry_bucket: update.industryBucket,
      remote_likelihood: update.remoteLikelihood,
      notes: update.notes,
      status: update.status,
      updated_at: new Date().toISOString(),
    },
    prefer: "return=minimal",
  });

  await addSupabaseDoNotApplyCompany(config, update.companyName, update.status);

  return getSupabaseDashboardState(config);
}

async function createSupabaseCompany(config: SupabaseConfig, update: CompanyCreate): Promise<DashboardState> {
  const company = companyFromCreate(update);
  await supabaseRequest(config, "job_search_companies", {
    method: "POST",
    body: {
      id: company.id,
      profile_id: config.profileId,
      company_name: company.companyName,
      website_url: company.websiteUrl,
      careers_url: company.careersUrl,
      ats_provider: company.atsProvider,
      ats_board_token: company.atsBoardToken,
      industry_bucket: company.industryBucket,
      remote_likelihood: company.remoteLikelihood,
      notes: company.notes,
      status: company.status,
    },
    prefer: "return=minimal",
  });

  await addSupabaseDoNotApplyCompany(config, company.companyName, company.status);

  return getSupabaseDashboardState(config);
}

async function addSupabaseDoNotApplyCompany(config: SupabaseConfig, companyName: string | undefined, status: CompanyStatus) {
  const normalizedCompanyName = (companyName ?? "").trim();

  if (status !== "do_not_apply" || !normalizedCompanyName) return;

  const state = await getSupabaseDashboardState(config);
  const alreadyBlocked = state.searchProfile.doNotApplyCompanies.some(
    (blockedCompany) => blockedCompany.toLowerCase() === normalizedCompanyName.toLowerCase()
  );

  if (alreadyBlocked) return;

  await supabaseRequest(config, "job_search_profiles", {
    method: "PATCH",
    query: {
      id: `eq.${config.profileId}`,
    },
    body: {
      do_not_apply_companies: [...state.searchProfile.doNotApplyCompanies, normalizedCompanyName],
      updated_at: new Date().toISOString(),
    },
    prefer: "return=minimal",
  });
}

async function importSupabaseCompanies(config: SupabaseConfig, companies: CompanyCreate[]): Promise<CompanyImportResult> {
  const current = await getSupabaseDashboardState(config);
  let created = 0;
  let updated = 0;

  for (const companyUpdate of companies) {
    const existingCompany = current.companies.find((company) => company.companyName.toLowerCase() === companyUpdate.companyName.toLowerCase());

    if (existingCompany) {
      await updateSupabaseCompany(config, existingCompany.id, companyUpdate);
      updated += 1;
    } else {
      await createSupabaseCompany(config, companyUpdate);
      created += 1;
    }
  }

  return {
    dashboardState: await getSupabaseDashboardState(config),
    imported: companies.length,
    created,
    updated,
  };
}

export async function getDashboardState(): Promise<DashboardState> {
  const config = getSupabaseConfig();
  // Local dev with no Supabase configured uses the (empty) in-memory store. In production,
  // Supabase IS configured, so a read failure surfaces as a real error instead of being
  // masked by fallback state — we never want a broken DB to look like an empty/working dashboard.
  if (!config) return getMemoryDashboardState();
  return getSupabaseDashboardState(config);
}

export async function updateJobStatus(jobId: string, status: JobStatus): Promise<DashboardState> {
  const config = getSupabaseConfig();
  if (!config) return updateMemoryJobStatus(jobId, status);

  try {
    return await updateSupabaseJobStatus(config, jobId, status);
  } catch (error) {
    console.error("Supabase job update failed.", error);
    throw error;
  }
}

export async function runManualScan(): Promise<DashboardState> {
  const config = getSupabaseConfig();
  if (!config) return runMemoryManualScan();

  try {
    return await runSupabaseManualScan(config);
  } catch (error) {
    console.error("Supabase scan write failed.", error);
    throw error;
  }
}

export async function saveApplyWizardSubmission(submission: ApplyWizardSubmission): Promise<DashboardState> {
  const config = getSupabaseConfig();
  if (!config) return saveMemoryApplyWizardSubmission(submission);

  try {
    return await saveSupabaseApplyWizardSubmission(config, submission);
  } catch (error) {
    console.error("Supabase apply wizard save failed.", error);
    throw error;
  }
}

export async function saveMatchFeedback(feedback: MatchFeedbackCreate): Promise<DashboardState> {
  const normalizedFeedback = {
    ...feedback,
    reason: feedback.rating < 4 ? feedback.reason.slice(0, 200) : "",
  };
  const config = getSupabaseConfig();
  if (!config) return saveMemoryMatchFeedback(normalizedFeedback);

  try {
    return await saveSupabaseMatchFeedback(config, normalizedFeedback);
  } catch (error) {
    console.error("Supabase match feedback save failed.", error);
    throw error;
  }
}

export async function getNearMissReviewDecisions(): Promise<NearMissReviewDecision[]> {
  const config = getSupabaseConfig();
  if (!config) return getMemoryNearMissReviewDecisions();

  try {
    return await getSupabaseNearMissReviewDecisions(config);
  } catch (error) {
    // The near-miss table is optional; a not-yet-migrated table is an expected empty state, not an error.
    if (isMissingSupabaseTableError(error, "job_search_near_miss_reviews")) {
      return getMemoryNearMissReviewDecisions();
    }
    console.error("Supabase near-miss review read failed.", error);
    throw error;
  }
}

export async function saveNearMissReviewDecision(input: NearMissReviewDecisionCreate): Promise<NearMissReviewDecision> {
  const normalizedInput = {
    ...input,
    reason: input.reason.slice(0, 500),
    titleSignal: input.titleSignal.slice(0, 120),
  };
  const config = getSupabaseConfig();
  if (!config) return saveMemoryNearMissReviewDecision(normalizedInput);

  try {
    return await saveSupabaseNearMissReviewDecision(config, normalizedInput);
  } catch (error) {
    // The near-miss table is optional; a not-yet-migrated table is an expected empty state, not an error.
    if (isMissingSupabaseTableError(error, "job_search_near_miss_reviews")) {
      return saveMemoryNearMissReviewDecision(normalizedInput);
    }
    console.error("Supabase near-miss review save failed.", error);
    throw error;
  }
}

export async function backfillCurrentMatchDecisions(): Promise<{ persistence: "supabase" | "memory"; decisions: number }> {
  const config = getSupabaseConfig();
  if (!config) return { persistence: "memory", decisions: 0 };

  const dashboard = await getSupabaseDashboardState(config);
  const decidedAt = new Date().toISOString();
  const rows = dashboard.jobs.flatMap((job) => {
    const company = dashboard.companies.find((item) => item.id === job.companyId);
    if (!company) return [];

    const matchDecision = evaluateJobMatch(job, dashboard.searchProfile);
    const decision: ConnectorMatchDecisionInput = {
      externalJobId: job.externalJobId,
      title: job.title,
      included: matchDecision.included,
      matchDecision,
    };

    return [matchDecisionToSupabaseBody(decision, company, config.profileId, decidedAt, job.id)];
  });

  for (const chunk of chunked(rows, 200)) {
    await supabaseRequest(config, "job_search_match_decisions", {
      method: "POST",
      query: {
        on_conflict: "profile_id,company_id,source_provider,external_job_id,rules_version",
      },
      body: chunk,
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }

  return { persistence: "supabase", decisions: rows.length };
}

export async function updateSearchProfile(update: SearchProfileUpdate): Promise<DashboardState> {
  const config = getSupabaseConfig();
  if (!config) return updateMemorySearchProfile(update);

  try {
    return await updateSupabaseSearchProfile(config, update);
  } catch (error) {
    console.error("Supabase profile update failed.", error);
    throw error;
  }
}

export async function compileAndSaveSearchProfile(input: ProfileCompilerInput): Promise<CompiledProfileSaveResult> {
  const config = getSupabaseConfig();
  if (!config) return updateMemoryCompiledProfile(input);

  try {
    return await saveSupabaseCompiledProfile(config, input);
  } catch (error) {
    console.error("Supabase compiled profile save failed.", error);
    throw error;
  }
}

export async function getActiveMatchingConfig(): Promise<ActiveMatchingConfigResult> {
  const config = getSupabaseConfig();
  if (!config) {
    return {
      matchingConfig: globalStore.__jobSearchMatchingConfig ?? randallPrivateMatchingConfig,
      source: globalStore.__jobSearchMatchingConfigSource ?? "fallback_private",
    };
  }

  try {
    return await getSupabaseActiveMatchingConfig(config);
  } catch (error) {
    console.error("Supabase compiled matching config lookup failed; using private fallback.", error);
    return {
      matchingConfig: randallPrivateMatchingConfig,
      source: "fallback_private",
    };
  }
}

export async function getMatchTuningReport(): Promise<TuningReport> {
  const dashboard = await getDashboardState();
  const activeMatching = await getActiveMatchingConfig();
  const config = getSupabaseConfig();
  let decisions: MatchDecisionEvidence[] = [];

  if (config) {
    try {
      const rows = await supabaseRequest<MatchDecisionRow[]>(config, "job_search_match_decisions", {
        query: {
          profile_id: `eq.${config.profileId}`,
          rules_version: `eq.${activeMatching.matchingConfig.rulesVersion}`,
          select: "job_id,title,company_name,included,score,fit_bucket,role_family,confidence,positives,risks,evidence,rules_version",
          order: "updated_at.desc",
          limit: "500",
        },
      });
      decisions = rows.map(mapMatchDecisionEvidence);
    } catch (error) {
      console.error("Supabase match decision lookup failed; tuning report will use dashboard feedback only.", error);
    }
  }

  return buildTuningReport({
    feedback: dashboard.matchFeedback,
    jobs: dashboard.jobs,
    scanLogs: dashboard.scanLogs,
    decisions,
    matchingRulesVersion: activeMatching.matchingConfig.rulesVersion,
    matchingConfigSource: activeMatching.source,
  });
}

async function getMatchDecisionEvidenceForRules(rulesVersion: string): Promise<MatchDecisionEvidence[]> {
  const config = getSupabaseConfig();
  if (!config) return [];

  try {
    const rows = await supabaseRequest<MatchDecisionRow[]>(config, "job_search_match_decisions", {
      query: {
        profile_id: `eq.${config.profileId}`,
        rules_version: `eq.${rulesVersion}`,
        select: "job_id,title,company_name,included,score,fit_bucket,role_family,confidence,positives,risks,evidence,rules_version",
        order: "updated_at.desc",
        limit: "1000",
      },
    });
    return rows.map(mapMatchDecisionEvidence);
  } catch (error) {
    console.error("Supabase match decision lookup failed; tuning preview will use review decisions only.", error);
    return [];
  }
}

export async function getMatchTuningPreviewImpact(selectedDraftIds?: string[]): Promise<TuningPreviewImpact> {
  const activeMatching = await getActiveMatchingConfig();
  const [decisions, reviewDecisions] = await Promise.all([
    getMatchDecisionEvidenceForRules(activeMatching.matchingConfig.rulesVersion),
    getNearMissReviewDecisions(),
  ]);

  return buildTuningPreviewImpact({
    decisions,
    reviewDecisions,
    rulesVersion: activeMatching.matchingConfig.rulesVersion,
    selectedDraftIds,
  });
}

export async function updateCompany(companyId: string, update: CompanyUpdate): Promise<DashboardState> {
  const config = getSupabaseConfig();
  if (!config) return updateMemoryCompany(companyId, update);

  try {
    return await updateSupabaseCompany(config, companyId, update);
  } catch (error) {
    console.error("Supabase company update failed.", error);
    throw error;
  }
}

export async function createCompany(update: CompanyCreate): Promise<DashboardState> {
  const config = getSupabaseConfig();
  if (!config) return createMemoryCompany(update);

  try {
    return await createSupabaseCompany(config, update);
  } catch (error) {
    console.error("Supabase company create failed.", error);
    throw error;
  }
}

export async function importCompanies(companies: CompanyCreate[]): Promise<CompanyImportResult> {
  const config = getSupabaseConfig();
  if (!config) return importMemoryCompanies(companies);

  try {
    return await importSupabaseCompanies(config, companies);
  } catch (error) {
    console.error("Supabase company import failed.", error);
    throw error;
  }
}

export async function applyConnectorJobs(
  companyId: string,
  normalizedJobs: NormalizedConnectorJob[],
  matchDecisions: ConnectorMatchDecisionInput[] = [],
  matchingConfig: MatchingRuleConfig = randallPrivateMatchingConfig,
  options: ConnectorApplyOptions = {}
): Promise<ConnectorApplyResult> {
  const config = getSupabaseConfig();
  if (!config) return applyMemoryConnectorJobs(companyId, normalizedJobs, matchingConfig, options);

  try {
    return await applySupabaseConnectorJobs(config, companyId, normalizedJobs, matchDecisions, matchingConfig, options);
  } catch (error) {
    console.error("Supabase connector apply failed.", error);
    throw error;
  }
}

// Generated broad-board sources (ids prefixed `generated-broad-`) are synthesized at
// request time and are not real watchlist rows. job_search_jobs.company_id is a NOT NULL
// foreign key into job_search_companies, so any scan that tries to persist broad-board jobs
// throws "Company not found" unless the source exists as a row first. This idempotently
// upserts those generated sources before a scan writes. It only ever touches
// `generated-broad-` ids, so it can never overwrite a user-managed company.
export async function ensureSourceCompaniesPersisted(companies: Company[]): Promise<void> {
  const config = getSupabaseConfig();
  if (!config) return;

  const generatedSources = companies.filter((company) => company.id.startsWith("generated-broad-"));
  if (generatedSources.length === 0) return;

  const rows = generatedSources.map((company) => ({
    id: company.id,
    profile_id: config.profileId,
    company_name: company.companyName,
    website_url: company.websiteUrl,
    careers_url: company.careersUrl,
    ats_provider: company.atsProvider,
    ats_board_token: company.atsBoardToken,
    industry_bucket: company.industryBucket,
    remote_likelihood: company.remoteLikelihood,
    notes: company.notes,
    status: company.status,
  }));

  // This runs before the scan's per-source loop, which has its own error handling. Never let a
  // persistence failure here abort the whole scan: if it fails, the affected broad sources simply
  // error per-source in the loop (the prior behavior) while targeted companies still succeed.
  try {
    for (const chunk of chunked(rows, 100)) {
      await supabaseRequest(config, "job_search_companies", {
        method: "POST",
        query: { on_conflict: "id" },
        body: chunk,
        prefer: "resolution=merge-duplicates,return=minimal",
      });
    }
  } catch (error) {
    console.error("Failed to persist generated broad sources; scan will continue.", error);
  }
}

function contactRowFromResearch(config: SupabaseConfig, jobId: string, companyId: string, input: ContactResearchInput, index: number) {
  return {
    id: `contact-${jobId}-${Date.now()}-${index}`,
    profile_id: config.profileId,
    company_id: companyId,
    job_id: jobId,
    name: input.name,
    title: input.title,
    linkedin_url: input.linkedinUrl,
    company_bio_url: input.evidenceUrl || null,
    contact_type: input.contactType,
    confidence: input.confidence,
    reason: input.reason,
    status: input.status,
    notes: input.notes,
  };
}

async function saveSupabaseJobContacts(config: SupabaseConfig, jobId: string, companyId: string, inputs: ContactResearchInput[]): Promise<DashboardState> {
  // Research replaces the prior suggestion set for this job rather than appending duplicates.
  await supabaseRequest(config, "job_search_contacts", {
    method: "DELETE",
    query: {
      profile_id: `eq.${config.profileId}`,
      job_id: `eq.${jobId}`,
    },
    prefer: "return=minimal",
  });

  if (inputs.length > 0) {
    await supabaseRequest(config, "job_search_contacts", {
      method: "POST",
      body: inputs.map((input, index) => contactRowFromResearch(config, jobId, companyId, input, index)),
      prefer: "return=minimal",
    });
  }

  return getSupabaseDashboardState(config);
}

function saveMemoryJobContacts(jobId: string, companyId: string, inputs: ContactResearchInput[]): DashboardState {
  const state = getMutableMemoryState();
  const stamp = Date.now();
  const mapped = inputs
    .map((input, index) => mapContactSuggestion({
      id: `contact-${jobId}-${stamp}-${index}`,
      company_id: companyId,
      job_id: jobId,
      name: input.name,
      title: input.title,
      linkedin_url: input.linkedinUrl,
      company_bio_url: input.evidenceUrl || null,
      contact_type: input.contactType,
      confidence: input.confidence,
      reason: input.reason,
      status: input.status,
      notes: input.notes,
    }, state.companies))
    .filter((contact): contact is ContactSuggestion => Boolean(contact));

  state.contactSuggestions = [
    ...mapped,
    ...state.contactSuggestions.filter((contact) => contact.jobId !== jobId),
  ];

  return getMemoryDashboardState();
}

export async function saveJobContacts(jobId: string, companyId: string, inputs: ContactResearchInput[]): Promise<DashboardState> {
  const config = getSupabaseConfig();
  if (!config) return saveMemoryJobContacts(jobId, companyId, inputs);

  try {
    return await saveSupabaseJobContacts(config, jobId, companyId, inputs);
  } catch (error) {
    console.error("Supabase contact save failed.", error);
    throw error;
  }
}

export async function recordScanLog(input: ScanLogCreate): Promise<DashboardState> {
  const config = getSupabaseConfig();
  if (!config) return recordMemoryScanLog(input);

  try {
    return await recordSupabaseScanLog(config, input);
  } catch (error) {
    console.error("Supabase scan log write failed.", error);
    throw error;
  }
}

export async function updateSettings(update: SettingsUpdate): Promise<DashboardState> {
  const config = getSupabaseConfig();
  if (!config) return updateMemorySettings(update);

  try {
    return await updateSupabaseSettings(config, update);
  } catch (error) {
    console.error("Supabase settings update failed.", error);
    throw error;
  }
}

export type CandidateDossierRecord = {
  persistence: "supabase" | "memory";
  rawMarkdown: string;
  parsed: ParsedDossier;
  appliedAt: string;
};

type CandidateDossierRow = {
  raw_markdown: string;
  parsed_json: ParsedDossier;
  applied_at: string | null;
};

export async function saveCandidateDossier(rawMarkdown: string): Promise<{
  persistence: "supabase" | "memory";
  validation: ParsedDossier["validation"];
  applied: boolean;
}> {
  const parsed = parseCandidateDossier(rawMarkdown);
  if (!parsed.validation.ok) {
    return { persistence: getSupabaseConfig() ? "supabase" : "memory", validation: parsed.validation, applied: false };
  }

  const config = getSupabaseConfig();
  const appliedAt = new Date().toISOString();

  if (config) {
    try {
      await supabaseRequest(config, "job_search_candidate_dossiers", {
        method: "POST",
        body: {
          profile_id: config.profileId,
          version: parsed.version || "1",
          updated_label: parsed.updated,
          raw_markdown: rawMarkdown,
          parsed_json: parsed,
          validation_json: parsed.validation,
          applied_at: appliedAt,
        },
        prefer: "return=minimal",
      });
      return { persistence: "supabase", validation: parsed.validation, applied: true };
    } catch (error) {
      if (!isMissingSupabaseTableError(error, "job_search_candidate_dossiers")) throw error;
    }
  }

  globalStore.__jobSearchCandidateDossier = { persistence: "memory", rawMarkdown, parsed, appliedAt };
  return { persistence: "memory", validation: parsed.validation, applied: true };
}

export async function getCandidateDossier(): Promise<CandidateDossierRecord | null> {
  const config = getSupabaseConfig();

  if (config) {
    try {
      const rows = await supabaseRequest<CandidateDossierRow[]>(config, "job_search_candidate_dossiers", {
        query: {
          profile_id: `eq.${config.profileId}`,
          order: "applied_at.desc",
          limit: "1",
        },
      });
      const row = rows[0];
      if (row?.parsed_json && Array.isArray(row.parsed_json.tracks)) {
        return {
          persistence: "supabase",
          rawMarkdown: row.raw_markdown,
          parsed: row.parsed_json,
          appliedAt: row.applied_at ?? "",
        };
      }
    } catch (error) {
      if (!isMissingSupabaseTableError(error, "job_search_candidate_dossiers")) throw error;
    }
  }

  return globalStore.__jobSearchCandidateDossier ?? null;
}

import {
  getPublicAuthSession,
  type PublicAuthSession,
} from "../public-auth/session";
import { loadPublicJobById, loadPublicJobsByIds } from "../public-jobs/repository";
import type { PublicJobRecord } from "../public-jobs/types";
import {
  searchIndustries,
  searchLocations,
  searchSkills,
  type IndustrySearchResult,
  type LocationSearchResult,
  type SkillSearchResult,
} from "./catalogues";
import {
  createPublicProfileRepositoryRequest,
  ensureCandidateProfileAggregate,
  getPublicProfileRepositoryConfig,
  loadCandidateProfileAggregate,
  type PublicProfileRepositoryRequest,
} from "./repository";
import {
  createPursuitForJob,
  loadContactSuggestionsForPursuit,
  loadOutreachMessagesForPursuit,
  loadPursuitByIdForUser,
  loadPursuitEventsForPursuit,
  loadPursuitsForUser,
  persistContactSelection,
  persistHumanPathGeneration,
  persistOutreachGeneration,
  persistPursuitTransition,
} from "./pursuits/repository";
import { unavailableHumanPathProvider } from "./pursuits/human-path";
import { completeReview, expireInactivePursuit, transitionPursuit } from "./pursuits/state-machine";
import type {
  CompleteReviewInput,
  CreatePursuitInput,
  GeneratedOutreachDraft,
  HumanPathContact,
  HumanPathContactSuggestion,
  HumanPathProvider,
  OutreachMessageRecord,
  OutreachRecipientType,
  Pursuit,
  PursuitEvent,
  PursuitEventType,
  PursuitStatus,
  PursuitTransitionResult,
} from "./pursuits/types";
import { enforceSubscriptionFeature } from "./subscription/enforcement";
import {
  loadSubscriptionContextForUser,
  loadUsageLedgerForUser,
} from "./subscription/repository";
import type {
  SubscriptionContext,
  SubscriptionEnforcementResult,
  UsageLedgerEntry,
} from "./subscription/types";
import {
  generateOutreachMessage,
  generateOutreachMessageForUser,
  parseOutreachRequest,
  type OutreachContact,
  type OutreachGenerationResult,
  type OutreachJob,
  type OutreachMessage,
} from "./outreach-generator";
import { evaluateMatch } from "./matching/engine";
import type { MatchJob, MatchResult } from "./matching/types";
import { evaluateCandidateProfileQuality } from "./profile-quality";
import {
  regeneratePublicProfileForUser,
  type PublicProfileRegenerationResult,
} from "./service";
import {
  readVoicePersonalitySectionForUser,
  readFitSignalsSectionForUser,
  readIdentitySearchSectionForUser,
  readLeadershipProfileSectionForUser,
  readOutreachRulesSectionForUser,
  readWorkExamplesSectionForUser,
  readQualityNarrativeSectionForUser,
  readResumeUploadsSectionForUser,
  readRoleTracksSectionForUser,
  readSkillsInventorySectionForUser,
  readWritingSamplesSectionForUser,
  updateVoicePersonalitySectionForUser,
  updateFitSignalsSectionForUser,
  updateIdentitySearchSectionForUser,
  updateLeadershipProfileSectionForUser,
  updateOutreachRulesSectionForUser,
  updateWorkExamplesSectionForUser,
  updateQualityNarrativeSectionForUser,
  updateResumeUploadsSectionForUser,
  updateRoleTracksSectionForUser,
  updateSkillsInventorySectionForUser,
  updateWritingSamplesSectionForUser,
  type PublicProfileVoicePersonalityReadResult,
  type PublicProfileVoicePersonalityUpdateResult,
  type PublicProfileFitSignalsReadResult,
  type PublicProfileFitSignalsUpdateResult,
  type PublicProfileIdentitySearchReadResult,
  type PublicProfileIdentitySearchUpdateResult,
  type PublicProfileLeadershipProfileReadResult,
  type PublicProfileLeadershipProfileUpdateResult,
  type PublicProfileOutreachRulesReadResult,
  type PublicProfileOutreachRulesUpdateResult,
  type PublicProfileWorkExamplesReadResult,
  type PublicProfileWorkExamplesUpdateResult,
  type PublicProfileQualityNarrativeReadResult,
  type PublicProfileQualityNarrativeUpdateResult,
  type PublicProfileResumeUploadsReadResult,
  type PublicProfileResumeUploadsUpdateResult,
  type PublicProfileRoleTracksReadResult,
  type PublicProfileRoleTracksUpdateResult,
  type PublicProfileSkillsInventoryReadResult,
  type PublicProfileSkillsInventoryUpdateResult,
  type PublicProfileWritingSamplesReadResult,
  type PublicProfileWritingSamplesUpdateResult,
} from "./section-service";
import type { QualitySection } from "./types";
import type { CandidateProfileAggregate } from "./types";

export type PublicProfileRegenerationHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  regenerateProfile?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    options: {
      generatedAt: string;
      changeSummary: string;
    },
  ) => Promise<PublicProfileRegenerationResult>;
};

export type PublicProfileBootstrapHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  ensureProfile?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    options: {
      email?: string;
      checkedAt: string;
    },
  ) => Promise<Awaited<ReturnType<typeof ensureCandidateProfileAggregate>>>;
};

export type PublicProfileIdentitySearchHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  readIdentitySearch?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    checkedAt: string,
  ) => Promise<PublicProfileIdentitySearchReadResult>;
  updateIdentitySearch?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    input: unknown,
    options: {
      updatedAt: string;
    },
  ) => Promise<PublicProfileIdentitySearchUpdateResult>;
};

export type PublicProfileRoleTracksHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  readRoleTracks?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    checkedAt: string,
  ) => Promise<PublicProfileRoleTracksReadResult>;
  updateRoleTracks?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    input: unknown,
    options: {
      updatedAt: string;
    },
  ) => Promise<PublicProfileRoleTracksUpdateResult>;
};

export type PublicProfileResumeUploadsHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  readResumeUploads?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    checkedAt: string,
  ) => Promise<PublicProfileResumeUploadsReadResult>;
  updateResumeUploads?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    input: unknown,
    options: {
      updatedAt: string;
    },
  ) => Promise<PublicProfileResumeUploadsUpdateResult>;
};

export type PublicProfileFitSignalsHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  readFitSignals?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    checkedAt: string,
  ) => Promise<PublicProfileFitSignalsReadResult>;
  updateFitSignals?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    input: unknown,
    options: {
      updatedAt: string;
    },
  ) => Promise<PublicProfileFitSignalsUpdateResult>;
};

export type PublicProfileWorkExamplesHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  readWorkExamples?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    checkedAt: string,
  ) => Promise<PublicProfileWorkExamplesReadResult>;
  updateWorkExamples?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    input: unknown,
    options: {
      updatedAt: string;
    },
  ) => Promise<PublicProfileWorkExamplesUpdateResult>;
};

export type PublicProfileSkillsInventoryHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  readSkillsInventory?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    checkedAt: string,
  ) => Promise<PublicProfileSkillsInventoryReadResult>;
  updateSkillsInventory?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    input: unknown,
    options: {
      updatedAt: string;
    },
  ) => Promise<PublicProfileSkillsInventoryUpdateResult>;
};

export type PublicProfileQualityNarrativeHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  readQualityNarrative?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    section: QualitySection,
    checkedAt: string,
  ) => Promise<PublicProfileQualityNarrativeReadResult>;
  updateQualityNarrative?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    section: QualitySection,
    input: unknown,
    options: {
      updatedAt: string;
    },
  ) => Promise<PublicProfileQualityNarrativeUpdateResult>;
};

export type PublicProfileVoicePersonalityHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  readVoicePersonality?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    checkedAt: string,
  ) => Promise<PublicProfileVoicePersonalityReadResult>;
  updateVoicePersonality?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    input: unknown,
    options: {
      updatedAt: string;
    },
  ) => Promise<PublicProfileVoicePersonalityUpdateResult>;
};

export type PublicProfileWritingSamplesHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  readWritingSamples?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    checkedAt: string,
  ) => Promise<PublicProfileWritingSamplesReadResult>;
  updateWritingSamples?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    input: unknown,
    options: {
      updatedAt: string;
    },
  ) => Promise<PublicProfileWritingSamplesUpdateResult>;
};

export type PublicProfileOutreachRulesHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  readOutreachRules?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    checkedAt: string,
  ) => Promise<PublicProfileOutreachRulesReadResult>;
  updateOutreachRules?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    input: unknown,
    options: {
      updatedAt: string;
    },
  ) => Promise<PublicProfileOutreachRulesUpdateResult>;
};

export type PublicProfileLeadershipProfileHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  readLeadershipProfile?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    checkedAt: string,
  ) => Promise<PublicProfileLeadershipProfileReadResult>;
  updateLeadershipProfile?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    input: unknown,
    options: {
      updatedAt: string;
    },
  ) => Promise<PublicProfileLeadershipProfileUpdateResult>;
};

export type PublicProfileCatalogueKind = "skills" | "industries" | "locations";

export type PublicProfileCatalogueSearchHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  searchCatalogue?: (
    query: string,
    limit: number,
  ) => SkillSearchResult[] | IndustrySearchResult[] | LocationSearchResult[];
};

export type PublicProfileMatchHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  loadAggregate?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
  ) => Promise<CandidateProfileAggregate | undefined>;
  loadJob?: (
    request: PublicProfileRepositoryRequest,
    jobId: string,
  ) => Promise<PublicJobRecord | undefined>;
  evaluate?: (input: {
    profile: CandidateProfileAggregate;
    job: MatchJob;
    evaluatedAt: string;
  }) => MatchResult;
};

export type PublicProfilePursuitsHandlerOptions = PublicProfileMatchHandlerOptions & {
  createPursuit?: (
    request: PublicProfileRepositoryRequest,
    input: CreatePursuitInput,
  ) => Promise<PursuitTransitionResult>;
  loadPursuit?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    pursuitId: string,
  ) => Promise<Pursuit | undefined>;
  loadPursuits?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    options: { status?: PursuitStatus; includeDeleted?: boolean },
  ) => Promise<Pursuit[]>;
  loadJobs?: (
    request: PublicProfileRepositoryRequest,
    jobIds: string[],
  ) => Promise<Map<string, PublicJobRecord>>;
  loadOutreachMessages?: (
    request: PublicProfileRepositoryRequest,
    pursuitId: string,
  ) => Promise<OutreachMessageRecord[]>;
  loadPursuitEvents?: (
    request: PublicProfileRepositoryRequest,
    pursuitId: string,
  ) => Promise<PursuitEvent[]>;
  persistTransition?: (
    request: PublicProfileRepositoryRequest,
    result: Extract<PursuitTransitionResult, { ok: true }>,
  ) => Promise<void>;
  humanPathProvider?: HumanPathProvider;
  persistHumanPath?: (
    request: PublicProfileRepositoryRequest,
    result: Extract<PursuitTransitionResult, { ok: true }>,
    contacts: HumanPathContact[],
  ) => Promise<void>;
  loadContactSuggestions?: (
    request: PublicProfileRepositoryRequest,
    pursuitId: string,
  ) => Promise<HumanPathContactSuggestion[]>;
  persistContactSelection?: (
    request: PublicProfileRepositoryRequest,
    result: Extract<PursuitTransitionResult, { ok: true }>,
    contactIds: string[],
  ) => Promise<void>;
  generateOutreachForContact?: (input: {
    profileMarkdown: string;
    job: OutreachJob;
    contact: OutreachContact;
    contactSuggestion: HumanPathContactSuggestion;
  }) => Promise<OutreachMessage | undefined>;
  persistOutreach?: (
    request: PublicProfileRepositoryRequest,
    result: Extract<PursuitTransitionResult, { ok: true }>,
    drafts: GeneratedOutreachDraft[],
  ) => Promise<void>;
  loadSubscriptionContext?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
  ) => Promise<SubscriptionContext>;
  loadUsageEntries?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    options: { at: string; periodStart?: string; periodEnd?: string },
  ) => Promise<UsageLedgerEntry[]>;
  enforceSubscription?: (
    context: SubscriptionContext,
    entries: UsageLedgerEntry[],
    at: string,
  ) => SubscriptionEnforcementResult;
  createId?: () => string;
};

function json(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...init.headers,
    },
  });
}

function profileQualityResponse(result: Extract<PublicProfileRegenerationResult, { status: "incomplete" }>) {
  return {
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    incompleteReasons: result.profileQuality.incompleteReasons,
    weakFields: result.profileQuality.weakFields,
    weakResponseCount: result.profileQuality.weakResponseCount,
    lastCheckedAt: result.profileQuality.lastCheckedAt,
  };
}

function profileQualitySummary(profileQuality: {
  status: string;
  incompleteReasons: string[];
  weakFields: string[];
  weakResponseCount: number;
  lastCheckedAt: string;
}) {
  return {
    status: profileQuality.status,
    incompleteReasons: profileQuality.incompleteReasons,
    weakFields: profileQuality.weakFields,
    weakResponseCount: profileQuality.weakResponseCount,
    lastCheckedAt: profileQuality.lastCheckedAt,
  };
}

function regeneratedResponse(result: Extract<PublicProfileRegenerationResult, { status: "regenerated" }>) {
  return {
    status: result.status,
    profileId: result.generation.aggregate.profile.id,
    profileStatus: result.generation.profileQuality.status,
    version: result.generation.profileVersion.version,
    generatedAt: result.generation.generatedMarkdown.generatedAt,
  };
}

function matchJobFromPublicJob(job: PublicJobRecord): MatchJob {
  return {
    id: job.id,
    title: job.title,
    companyName: job.companyName,
    description: job.description,
    location: job.location,
    remoteType: job.remoteType,
    employmentType: job.employmentType,
    compensationText: job.compensationText,
    postedAt: job.postedAt,
    scrapedAt: job.scrapedAt,
    sourceUrl: job.sourceUrl,
  };
}

function workExampleRecommendationIds(match: MatchResult) {
  return [
    match.recommendations.workExample?.workExample.id,
    ...match.recommendations.alternativeWorkExamples.map((recommendation) => recommendation.workExample.id),
  ].filter((id): id is string => Boolean(id));
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function uniqueStringArray(value: unknown) {
  const values = stringArray(value) ?? [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseCompleteReviewInput(input: Record<string, unknown>): CompleteReviewInput {
  return {
    selectedRoleTrackId: optionalString(input.selectedRoleTrackId),
    selectedResumeId: optionalString(input.selectedResumeId),
    selectedWorkExampleId: optionalString(input.selectedWorkExampleId),
    fitSummary: optionalString(input.fitSummary),
    risks: stringArray(input.risks),
    recommendedWorkExampleIds: stringArray(input.recommendedWorkExampleIds),
    outreachAngle: optionalString(input.outreachAngle),
  };
}

const TRACKING_ACTIONS = {
  outreach_sent: "outreach_sent",
  applied: "applied",
  responded: "responded",
  interviewing: "interviewing",
  offer: "offer",
  rejected: "rejected",
} satisfies Record<string, PursuitEventType>;

function parseTrackingAction(value: unknown): PursuitEventType | undefined {
  const action = optionalString(value);
  return action && action in TRACKING_ACTIONS
    ? TRACKING_ACTIONS[action as keyof typeof TRACKING_ACTIONS]
    : undefined;
}

const LIFECYCLE_ACTIONS = {
  note_added: "note_added",
  expired: "expired",
  deleted: "deleted",
} satisfies Record<string, PursuitEventType>;

function parseLifecycleAction(value: unknown): PursuitEventType | undefined {
  const action = optionalString(value);
  return action && action in LIFECYCLE_ACTIONS
    ? LIFECYCLE_ACTIONS[action as keyof typeof LIFECYCLE_ACTIONS]
    : undefined;
}

function validateCompleteReviewInput(
  aggregate: CandidateProfileAggregate,
  input: CompleteReviewInput,
) {
  const issues: { field: string; message: string }[] = [];
  const roleTrack = input.selectedRoleTrackId
    ? aggregate.roleTracks.find((candidate) => candidate.id === input.selectedRoleTrackId)
    : undefined;
  const resume = input.selectedResumeId
    ? aggregate.resumes.find((candidate) => candidate.id === input.selectedResumeId)
    : undefined;
  const workExample = input.selectedWorkExampleId
    ? aggregate.workExamples.find((candidate) => candidate.id === input.selectedWorkExampleId)
    : undefined;

  if (input.selectedRoleTrackId && !roleTrack) {
    issues.push({ field: "selectedRoleTrackId", message: "selectedRoleTrackId must reference an existing Role Track." });
  }
  if (input.selectedResumeId && !resume) {
    issues.push({ field: "selectedResumeId", message: "selectedResumeId must reference an existing resume." });
  }
  if (input.selectedWorkExampleId && !workExample) {
    issues.push({ field: "selectedWorkExampleId", message: "selectedWorkExampleId must reference an existing Work Example." });
  }
  for (const id of input.recommendedWorkExampleIds ?? []) {
    if (!aggregate.workExamples.some((candidate) => candidate.id === id)) {
      issues.push({ field: "recommendedWorkExampleIds", message: `recommendedWorkExampleIds contains unknown Work Example id: ${id}.` });
    }
  }
  if (roleTrack && resume) {
    const linkedByTrack = roleTrack.resumeIds.includes(resume.id);
    const linkedByResume = resume.associatedRoleTrackIds.includes(roleTrack.id);
    if (!linkedByTrack && !linkedByResume) {
      issues.push({ field: "selectedResumeId", message: "selectedResumeId must be associated with selectedRoleTrackId." });
    }
  }

  return issues;
}

function subscriptionBlockedResponse(result: Exclude<SubscriptionEnforcementResult, { status: "allowed" }>) {
  const status = result.status === "limit_reached" ? 429 : 402;
  const featureName = result.feature === "human_path"
    ? "Human Path"
    : result.feature === "outreach_message"
      ? "Outreach"
      : "Subscription feature";
  return json({
    error: result.status === "limit_reached"
      ? `${featureName} limit reached.`
      : "Subscription does not allow this action.",
    status: result.status,
    subscription: result,
  }, { status });
}

function outreachRecipientType(contactType: HumanPathContact["contactType"]): OutreachRecipientType {
  if (contactType === "likely_hiring_manager") return "likely_hiring_manager";
  if (contactType === "functional_leader") return "functional_leader";
  if (contactType === "recruiter") return "recruiter";
  if (contactType === "executive_sponsor") return "executive_sponsor";
  return "no_contact";
}

function outreachContactFromSuggestion(contact: HumanPathContactSuggestion): OutreachContact {
  return {
    name: contact.name,
    role: contact.title || contact.contactType.replace(/_/g, " "),
    seniority: contact.contactType,
  };
}

function outreachJobFromPublicJob(job: PublicJobRecord): OutreachJob {
  return {
    title: job.title,
    company: job.companyName,
    description: job.description,
  };
}

function profileIncompleteResponse(aggregate: CandidateProfileAggregate, profileQuality: ReturnType<typeof evaluateCandidateProfileQuality>, action: string) {
  return json({
    error: `A complete profile is required before ${action}.`,
    status: "profile_incomplete",
    profileId: aggregate.profile.id,
    profileStatus: profileQuality.status,
    incompleteReasons: profileQuality.incompleteReasons,
    weakFields: profileQuality.weakFields,
    weakResponseCount: profileQuality.weakResponseCount,
    lastCheckedAt: profileQuality.lastCheckedAt,
  }, { status: 409 });
}

async function sessionForRequest(
  request: Request,
  options: {
    env?: NodeJS.ProcessEnv;
    getSession?: (request: Request) => Promise<PublicAuthSession>;
  },
) {
  return options.getSession
    ? await options.getSession(request)
    : await getPublicAuthSession(request, { env: options.env });
}

function repositoryRequestForOptions(options: {
  env?: NodeJS.ProcessEnv;
  repositoryRequest?: PublicProfileRepositoryRequest;
}) {
  if (options.repositoryRequest) return options.repositoryRequest;
  const config = getPublicProfileRepositoryConfig(options.env);
  if (!config) return undefined;
  return createPublicProfileRepositoryRequest(config);
}

function authErrorResponse(session: Exclude<PublicAuthSession, { status: "authenticated" }>) {
  if (session.status === "config_error") {
    return json({
      error: "Public auth is not configured.",
      missing: session.missing,
    }, { status: 503 });
  }

  return json({
    error: "Authentication required.",
    detail: session.reason,
  }, { status: 401 });
}

function repositoryConfigErrorResponse() {
  return json({
    error: "Public profile repository is not configured.",
    missing: ["SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY"],
  }, { status: 503 });
}

function parseCatalogueLimit(value: string | null) {
  if (!value) return 10;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(Math.max(parsed, 1), 50);
}

function searchCatalogue(
  kind: PublicProfileCatalogueKind,
  query: string,
  limit: number,
) {
  if (kind === "skills") return searchSkills(query, limit);
  if (kind === "industries") return searchIndustries(query, limit);
  return searchLocations(query, limit);
}

export async function handlePublicProfileCatalogueSearchRequest(
  request: Request,
  kind: PublicProfileCatalogueKind,
  options: PublicProfileCatalogueSearchHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const limit = parseCatalogueLimit(url.searchParams.get("limit"));
  const catalogueSearch = options.searchCatalogue ?? ((q, l) => searchCatalogue(kind, q, l));

  return json({
    status: "ready",
    catalogue: kind,
    query,
    limit,
    results: query ? catalogueSearch(query, limit) : [],
  });
}

export async function handlePublicProfileMatchRequest(
  request: Request,
  options: PublicProfileMatchHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null) as { jobId?: unknown } | null;
  const jobId = typeof input?.jobId === "string" ? input.jobId.trim() : "";
  if (!jobId) {
    return json({
      error: "Expected jobId.",
      status: "validation_error",
      issues: [{ field: "jobId", message: "jobId is required." }],
    }, { status: 400 });
  }

  const loadAggregate = options.loadAggregate ?? loadCandidateProfileAggregate;
  const aggregate = await loadAggregate(repositoryRequest, session.userId);
  if (!aggregate) {
    return json({ error: "Candidate profile not found.", status: "not_found" }, { status: 404 });
  }

  const evaluatedAt = options.now?.() ?? new Date().toISOString();
  const profileQuality = aggregate.profileQuality ?? evaluateCandidateProfileQuality(aggregate, evaluatedAt);
  if (profileQuality.status !== "complete") {
    return profileIncompleteResponse(aggregate, profileQuality, "matching jobs");
  }

  const loadJob = options.loadJob ?? loadPublicJobById;
  const job = await loadJob(repositoryRequest, jobId);
  if (!job) {
    return json({ error: "Job not found.", status: "not_found" }, { status: 404 });
  }

  const evaluate = options.evaluate ?? ((matchInput) => evaluateMatch(matchInput));
  const match = evaluate({
    profile: aggregate,
    job: matchJobFromPublicJob(job),
    evaluatedAt,
  });

  return json({
    status: "matched",
    profileId: aggregate.profile.id,
    job,
    match,
  });
}

const PURSUIT_STATUSES: PursuitStatus[] = [
  "discovered",
  "saved",
  "review_complete",
  "human_path_generated",
  "outreach_ready",
  "outreach_sent",
  "applied",
  "responded",
  "interviewing",
  "offer",
  "rejected",
  "expired",
  "deleted",
];

function parsePursuitStatusFilter(value: string | null): PursuitStatus | undefined {
  if (!value) return undefined;
  return PURSUIT_STATUSES.find((status) => status === value);
}

export async function handlePublicProfilePursuitsListRequest(
  request: Request,
  options: PublicProfilePursuitsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  if (statusParam && !parsePursuitStatusFilter(statusParam)) {
    return json({
      error: "Unknown pursuit status filter.",
      status: "validation_error",
      issues: [{ field: "status", message: `status must be one of: ${PURSUIT_STATUSES.join(", ")}.` }],
    }, { status: 400 });
  }
  const statusFilter = parsePursuitStatusFilter(statusParam);
  const includeDeleted = url.searchParams.get("includeDeleted") === "true";

  const loadPursuits = options.loadPursuits ?? loadPursuitsForUser;
  const pursuits = await loadPursuits(repositoryRequest, session.userId, {
    status: statusFilter,
    includeDeleted,
  });

  const loadJobs = options.loadJobs ?? loadPublicJobsByIds;
  const jobsById = await loadJobs(repositoryRequest, pursuits.map((pursuit) => pursuit.jobId));

  const items = pursuits.map((pursuit) => ({
    pursuit,
    job: jobsById.get(pursuit.jobId) ?? null,
  }));

  const counts = pursuits.reduce<Record<string, number>>((accumulator, pursuit) => {
    accumulator[pursuit.status] = (accumulator[pursuit.status] ?? 0) + 1;
    return accumulator;
  }, {});

  return json({
    status: "ok",
    total: pursuits.length,
    counts,
    pursuits: items,
  });
}

export async function handlePublicProfilePursuitReadRequest(
  request: Request,
  pursuitId: string,
  options: PublicProfilePursuitsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const trimmedId = pursuitId.trim();
  if (!trimmedId) {
    return json({
      error: "Expected pursuit id.",
      status: "validation_error",
      issues: [{ field: "id", message: "id is required." }],
    }, { status: 400 });
  }

  const loadPursuit = options.loadPursuit ?? loadPursuitByIdForUser;
  const pursuit = await loadPursuit(repositoryRequest, session.userId, trimmedId);
  if (!pursuit) {
    return json({ error: "Pursuit not found.", status: "not_found" }, { status: 404 });
  }

  const loadJob = options.loadJob ?? loadPublicJobById;
  const loadContactSuggestions = options.loadContactSuggestions ?? loadContactSuggestionsForPursuit;
  const loadOutreachMessages = options.loadOutreachMessages ?? loadOutreachMessagesForPursuit;
  const loadEvents = options.loadPursuitEvents ?? loadPursuitEventsForPursuit;

  const [job, contacts, outreachMessages, events] = await Promise.all([
    loadJob(repositoryRequest, pursuit.jobId),
    loadContactSuggestions(repositoryRequest, pursuit.id),
    loadOutreachMessages(repositoryRequest, pursuit.id),
    loadEvents(repositoryRequest, pursuit.id),
  ]);

  return json({
    status: "ok",
    pursuit,
    job: job ?? null,
    contacts,
    outreachMessages,
    events,
  });
}

export async function handlePublicProfilePursuitCreateRequest(
  request: Request,
  options: PublicProfilePursuitsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null) as { jobId?: unknown } | null;
  const jobId = typeof input?.jobId === "string" ? input.jobId.trim() : "";
  if (!jobId) {
    return json({
      error: "Expected jobId.",
      status: "validation_error",
      issues: [{ field: "jobId", message: "jobId is required." }],
    }, { status: 400 });
  }

  const loadAggregate = options.loadAggregate ?? loadCandidateProfileAggregate;
  const aggregate = await loadAggregate(repositoryRequest, session.userId);
  if (!aggregate) {
    return json({ error: "Candidate profile not found.", status: "not_found" }, { status: 404 });
  }

  const createdAt = options.now?.() ?? new Date().toISOString();
  const profileQuality = aggregate.profileQuality ?? evaluateCandidateProfileQuality(aggregate, createdAt);
  if (profileQuality.status !== "complete") {
    return profileIncompleteResponse(aggregate, profileQuality, "creating pursuits");
  }

  const loadJob = options.loadJob ?? loadPublicJobById;
  const job = await loadJob(repositoryRequest, jobId);
  if (!job) {
    return json({ error: "Job not found.", status: "not_found" }, { status: 404 });
  }

  const evaluate = options.evaluate ?? ((matchInput) => evaluateMatch(matchInput));
  const match = evaluate({
    profile: aggregate,
    job: matchJobFromPublicJob(job),
    evaluatedAt: createdAt,
  });
  const createPursuit = options.createPursuit ?? createPursuitForJob;
  const result = await createPursuit(repositoryRequest, {
    id: options.createId?.() ?? crypto.randomUUID(),
    userId: session.userId,
    profileId: aggregate.profile.id,
    jobId,
    now: createdAt,
    fitSummary: match.explanation,
    risks: match.risks,
    recommendedWorkExampleIds: workExampleRecommendationIds(match),
    outreachAngle: match.recommendations.roleTrack?.reason,
  });

  if (result.ok === false) {
    return json({
      error: "Could not create pursuit.",
      status: "transition_error",
      issues: result.issues,
    }, { status: 409 });
  }

  return json({
    status: "created",
    profileId: aggregate.profile.id,
    job,
    match,
    pursuit: result.pursuit,
  }, { status: 201 });
}

export async function handlePublicProfilePursuitReviewRequest(
  request: Request,
  options: PublicProfilePursuitsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  const pursuitId = optionalString(input?.pursuitId);
  if (!pursuitId) {
    return json({
      error: "Expected pursuitId.",
      status: "validation_error",
      issues: [{ field: "pursuitId", message: "pursuitId is required." }],
    }, { status: 400 });
  }

  const loadAggregate = options.loadAggregate ?? loadCandidateProfileAggregate;
  const aggregate = await loadAggregate(repositoryRequest, session.userId);
  if (!aggregate) {
    return json({ error: "Candidate profile not found.", status: "not_found" }, { status: 404 });
  }

  const reviewedAt = options.now?.() ?? new Date().toISOString();
  const profileQuality = aggregate.profileQuality ?? evaluateCandidateProfileQuality(aggregate, reviewedAt);
  if (profileQuality.status !== "complete") {
    return profileIncompleteResponse(aggregate, profileQuality, "reviewing pursuits");
  }

  const loadPursuit = options.loadPursuit ?? loadPursuitByIdForUser;
  const pursuit = await loadPursuit(repositoryRequest, session.userId, pursuitId as string);
  if (!pursuit || pursuit.profileId !== aggregate.profile.id) {
    return json({ error: "Pursuit not found.", status: "not_found" }, { status: 404 });
  }

  const reviewInput = parseCompleteReviewInput(input ?? {});
  const issues = validateCompleteReviewInput(aggregate, reviewInput);
  if (issues.length > 0) {
    return json({
      error: "Review selection is invalid.",
      status: "validation_error",
      issues,
    }, { status: 400 });
  }

  const result = completeReview(pursuit, reviewInput, reviewedAt);
  if (result.ok === false) {
    return json({
      error: "Could not complete pursuit review.",
      status: "transition_error",
      issues: result.issues,
    }, { status: 409 });
  }

  const persistTransition = options.persistTransition ?? persistPursuitTransition;
  await persistTransition(repositoryRequest, result);

  return json({
    status: "review_complete",
    profileId: aggregate.profile.id,
    pursuit: result.pursuit,
    event: result.event,
  });
}

export async function handlePublicProfilePursuitHumanPathRequest(
  request: Request,
  options: PublicProfilePursuitsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  const pursuitId = optionalString(input?.pursuitId);
  if (!pursuitId) {
    return json({
      error: "Expected pursuitId.",
      status: "validation_error",
      issues: [{ field: "pursuitId", message: "pursuitId is required." }],
    }, { status: 400 });
  }

  const loadAggregate = options.loadAggregate ?? loadCandidateProfileAggregate;
  const aggregate = await loadAggregate(repositoryRequest, session.userId);
  if (!aggregate) {
    return json({ error: "Candidate profile not found.", status: "not_found" }, { status: 404 });
  }

  const generatedAt = options.now?.() ?? new Date().toISOString();
  const profileQuality = aggregate.profileQuality ?? evaluateCandidateProfileQuality(aggregate, generatedAt);
  if (profileQuality.status !== "complete") {
    return profileIncompleteResponse(aggregate, profileQuality, "generating Human Path contacts");
  }

  const loadPursuit = options.loadPursuit ?? loadPursuitByIdForUser;
  const pursuit = await loadPursuit(repositoryRequest, session.userId, pursuitId as string);
  if (!pursuit || pursuit.profileId !== aggregate.profile.id) {
    return json({ error: "Pursuit not found.", status: "not_found" }, { status: 404 });
  }

  const loadJob = options.loadJob ?? loadPublicJobById;
  const job = await loadJob(repositoryRequest, pursuit.jobId);
  if (!job) {
    return json({ error: "Job not found.", status: "not_found" }, { status: 404 });
  }

  const loadSubscriptionContext = options.loadSubscriptionContext ?? loadSubscriptionContextForUser;
  const loadUsageEntries = options.loadUsageEntries ?? loadUsageLedgerForUser;
  const subscriptionContext = await loadSubscriptionContext(repositoryRequest, session.userId);
  const usageEntries = await loadUsageEntries(repositoryRequest, session.userId, {
    at: generatedAt,
    periodStart: subscriptionContext.currentPeriodStart,
    periodEnd: subscriptionContext.currentPeriodEnd,
  });
  const enforceSubscription = options.enforceSubscription
    ?? ((context, entries, at) => enforceSubscriptionFeature(context, entries, "human_path", { at }));
  const enforcement = enforceSubscription(subscriptionContext, usageEntries, generatedAt);
  if (enforcement.status !== "allowed") {
    return subscriptionBlockedResponse(enforcement);
  }

  const provider = options.humanPathProvider ?? unavailableHumanPathProvider;
  const providerResult = await provider({
    pursuit,
    job: {
      id: job.id,
      title: job.title,
      companyName: job.companyName,
      description: job.description,
    },
  });
  if (providerResult.status === "provider_unavailable") {
    return json({
      error: providerResult.reason,
      status: "provider_unavailable",
    }, { status: 503 });
  }

  const result = transitionPursuit(pursuit, "human_path_generated", generatedAt, {
    contactCount: providerResult.contacts.length,
    contacts: providerResult.contacts,
  });
  if (result.ok === false) {
    return json({
      error: "Could not generate Human Path.",
      status: "transition_error",
      issues: result.issues,
    }, { status: 409 });
  }

  const persistHumanPath = options.persistHumanPath ?? persistHumanPathGeneration;
  await persistHumanPath(repositoryRequest, result, providerResult.contacts);

  return json({
    status: "human_path_generated",
    profileId: aggregate.profile.id,
    job,
    pursuit: result.pursuit,
    contacts: providerResult.contacts,
    event: result.event,
    subscription: enforcement,
  });
}

export async function handlePublicProfilePursuitContactSelectionRequest(
  request: Request,
  options: PublicProfilePursuitsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  const pursuitId = optionalString(input?.pursuitId);
  const contactIds = uniqueStringArray(input?.contactIds);
  const issues: { field: string; message: string }[] = [];
  if (!pursuitId) issues.push({ field: "pursuitId", message: "pursuitId is required." });
  if (contactIds.length === 0) issues.push({ field: "contactIds", message: "At least one contactId is required." });
  if (issues.length > 0) {
    return json({
      error: "Expected pursuitId and contactIds.",
      status: "validation_error",
      issues,
    }, { status: 400 });
  }

  const loadAggregate = options.loadAggregate ?? loadCandidateProfileAggregate;
  const aggregate = await loadAggregate(repositoryRequest, session.userId);
  if (!aggregate) {
    return json({ error: "Candidate profile not found.", status: "not_found" }, { status: 404 });
  }

  const selectedAt = options.now?.() ?? new Date().toISOString();
  const profileQuality = aggregate.profileQuality ?? evaluateCandidateProfileQuality(aggregate, selectedAt);
  if (profileQuality.status !== "complete") {
    return profileIncompleteResponse(aggregate, profileQuality, "selecting Human Path contacts");
  }

  const loadPursuit = options.loadPursuit ?? loadPursuitByIdForUser;
  const pursuit = await loadPursuit(repositoryRequest, session.userId, pursuitId as string);
  if (!pursuit || pursuit.profileId !== aggregate.profile.id) {
    return json({ error: "Pursuit not found.", status: "not_found" }, { status: 404 });
  }

  const loadContactSuggestions = options.loadContactSuggestions ?? loadContactSuggestionsForPursuit;
  const contacts = await loadContactSuggestions(repositoryRequest, pursuit.id);
  const contactIdsForPursuit = new Set(contacts.map((contact) => contact.id));
  const unknownContactIds = contactIds.filter((contactId) => !contactIdsForPursuit.has(contactId));
  if (unknownContactIds.length > 0) {
    return json({
      error: "Contact selection is invalid.",
      status: "validation_error",
      issues: unknownContactIds.map((contactId) => ({
        field: "contactIds",
        message: `contactIds contains unknown contact id: ${contactId}.`,
      })),
    }, { status: 400 });
  }

  const result = transitionPursuit(pursuit, "contacts_selected", selectedAt, {
    contactIds,
    contactCount: contactIds.length,
  });
  if (result.ok === false) {
    return json({
      error: "Could not select contacts.",
      status: "transition_error",
      issues: result.issues,
    }, { status: 409 });
  }

  const persistSelection = options.persistContactSelection ?? persistContactSelection;
  await persistSelection(repositoryRequest, result, contactIds);

  return json({
    status: "outreach_ready",
    profileId: aggregate.profile.id,
    pursuit: result.pursuit,
    selectedContactIds: contactIds,
    contacts: contacts.filter((contact) => contactIdsForPursuit.has(contact.id) && contactIds.includes(contact.id)),
    event: result.event,
  });
}

export async function handlePublicProfilePursuitOutreachRequest(
  request: Request,
  options: PublicProfilePursuitsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  const pursuitId = optionalString(input?.pursuitId);
  if (!pursuitId) {
    return json({
      error: "Expected pursuitId.",
      status: "validation_error",
      issues: [{ field: "pursuitId", message: "pursuitId is required." }],
    }, { status: 400 });
  }

  const loadAggregate = options.loadAggregate ?? loadCandidateProfileAggregate;
  const aggregate = await loadAggregate(repositoryRequest, session.userId);
  if (!aggregate) {
    return json({ error: "Candidate profile not found.", status: "not_found" }, { status: 404 });
  }

  const generatedAt = options.now?.() ?? new Date().toISOString();
  const profileQuality = aggregate.profileQuality ?? evaluateCandidateProfileQuality(aggregate, generatedAt);
  if (profileQuality.status !== "complete") {
    return profileIncompleteResponse(aggregate, profileQuality, "generating outreach");
  }
  const profileMarkdown = aggregate.profile.generatedMarkdown?.trim();
  if (!profileMarkdown) {
    return json({
      error: "Complete and generate your profile before generating outreach.",
      status: "profile_incomplete",
    }, { status: 409 });
  }

  const loadPursuit = options.loadPursuit ?? loadPursuitByIdForUser;
  const pursuit = await loadPursuit(repositoryRequest, session.userId, pursuitId);
  if (!pursuit || pursuit.profileId !== aggregate.profile.id) {
    return json({ error: "Pursuit not found.", status: "not_found" }, { status: 404 });
  }

  const loadJob = options.loadJob ?? loadPublicJobById;
  const job = await loadJob(repositoryRequest, pursuit.jobId);
  if (!job) {
    return json({ error: "Job not found.", status: "not_found" }, { status: 404 });
  }

  const loadContactSuggestions = options.loadContactSuggestions ?? loadContactSuggestionsForPursuit;
  const selectedContacts = (await loadContactSuggestions(repositoryRequest, pursuit.id))
    .filter((contact) => contact.selectedForOutreach);
  if (selectedContacts.length === 0) {
    return json({
      error: "Select at least one Human Path contact before generating outreach.",
      status: "validation_error",
      issues: [{ field: "selectedContacts", message: "At least one selected contact is required." }],
    }, { status: 400 });
  }

  const loadSubscriptionContext = options.loadSubscriptionContext ?? loadSubscriptionContextForUser;
  const loadUsageEntries = options.loadUsageEntries ?? loadUsageLedgerForUser;
  const subscriptionContext = await loadSubscriptionContext(repositoryRequest, session.userId);
  const usageEntries = await loadUsageEntries(repositoryRequest, session.userId, {
    at: generatedAt,
    periodStart: subscriptionContext.currentPeriodStart,
    periodEnd: subscriptionContext.currentPeriodEnd,
  });
  const enforceSubscription = options.enforceSubscription
    ?? ((context, entries, at) => enforceSubscriptionFeature(context, entries, "outreach_message", {
      at,
      quantity: selectedContacts.length,
    }));
  const enforcement = enforceSubscription(subscriptionContext, usageEntries, generatedAt);
  if (enforcement.status !== "allowed") {
    return subscriptionBlockedResponse(enforcement);
  }

  const result = transitionPursuit(pursuit, "outreach_generated", generatedAt, {
    contactIds: selectedContacts.map((contact) => contact.id),
    messageCount: selectedContacts.length,
  });
  if (result.ok === false) {
    return json({
      error: "Could not generate outreach.",
      status: "transition_error",
      issues: result.issues,
    }, { status: 409 });
  }

  const outreachJob = outreachJobFromPublicJob(job);
  const generateOutreachForContact = options.generateOutreachForContact
    ?? ((outreachInput) => generateOutreachMessage({
      profileMarkdown: outreachInput.profileMarkdown,
      job: outreachInput.job,
      contact: outreachInput.contact,
    }));
  const generatedMessages: Array<{
    contact: HumanPathContactSuggestion;
    outreach: OutreachMessage;
  }> = [];
  for (const contactSuggestion of selectedContacts) {
    const outreach = await generateOutreachForContact({
      profileMarkdown,
      job: outreachJob,
      contact: outreachContactFromSuggestion(contactSuggestion),
      contactSuggestion,
    });
    if (!outreach) {
      return json({
        error: "Outreach generation is not configured.",
        status: "model_unavailable",
      }, { status: 503 });
    }
    generatedMessages.push({ contact: contactSuggestion, outreach });
  }

  const drafts: GeneratedOutreachDraft[] = generatedMessages.map(({ contact, outreach }) => ({
    contactSuggestionId: contact.id,
    recipientType: outreachRecipientType(contact.contactType),
    message: outreach.message,
    selectedRoleTrackId: pursuit.selectedRoleTrackId,
    selectedResumeId: pursuit.selectedResumeId,
    selectedWorkExampleId: pursuit.selectedWorkExampleId,
    createdAt: generatedAt,
  }));
  const persistOutreach = options.persistOutreach ?? persistOutreachGeneration;
  await persistOutreach(repositoryRequest, result, drafts);

  return json({
    status: "outreach_generated",
    profileId: aggregate.profile.id,
    job,
    pursuit: result.pursuit,
    messages: generatedMessages.map(({ contact, outreach }) => ({
      contactSuggestionId: contact.id,
      recipientType: outreachRecipientType(contact.contactType),
      message: outreach.message,
      insertedExample: outreach.insertedExample,
    })),
    event: result.event,
    subscription: enforcement,
  });
}

export async function handlePublicProfilePursuitStatusRequest(
  request: Request,
  options: PublicProfilePursuitsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  const pursuitId = optionalString(input?.pursuitId);
  const action = parseTrackingAction(input?.action);
  const issues: { field: string; message: string }[] = [];
  if (!pursuitId) issues.push({ field: "pursuitId", message: "pursuitId is required." });
  if (!action) {
    issues.push({
      field: "action",
      message: "action must be one of outreach_sent, applied, responded, interviewing, offer, rejected.",
    });
  }
  if (issues.length > 0) {
    return json({
      error: "Expected pursuitId and tracking action.",
      status: "validation_error",
      issues,
    }, { status: 400 });
  }

  const loadAggregate = options.loadAggregate ?? loadCandidateProfileAggregate;
  const aggregate = await loadAggregate(repositoryRequest, session.userId);
  if (!aggregate) {
    return json({ error: "Candidate profile not found.", status: "not_found" }, { status: 404 });
  }

  const updatedAt = options.now?.() ?? new Date().toISOString();
  const loadPursuit = options.loadPursuit ?? loadPursuitByIdForUser;
  const pursuit = await loadPursuit(repositoryRequest, session.userId, pursuitId as string);
  if (!pursuit || pursuit.profileId !== aggregate.profile.id) {
    return json({ error: "Pursuit not found.", status: "not_found" }, { status: 404 });
  }

  const result = transitionPursuit(pursuit, action as PursuitEventType, updatedAt, { action });
  if (result.ok === false) {
    return json({
      error: "Could not update pursuit status.",
      status: "transition_error",
      issues: result.issues,
    }, { status: 409 });
  }

  const persistTransition = options.persistTransition ?? persistPursuitTransition;
  await persistTransition(repositoryRequest, result);

  return json({
    status: "updated",
    profileId: aggregate.profile.id,
    pursuit: result.pursuit,
    event: result.event,
  });
}

export async function handlePublicProfilePursuitLifecycleRequest(
  request: Request,
  options: PublicProfilePursuitsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  const pursuitId = optionalString(input?.pursuitId);
  const action = parseLifecycleAction(input?.action);
  const note = optionalString(input?.note);
  const issues: { field: string; message: string }[] = [];
  if (!pursuitId) issues.push({ field: "pursuitId", message: "pursuitId is required." });
  if (!action) issues.push({ field: "action", message: "action must be one of note_added, expired, deleted." });
  if (action === "note_added" && !note) {
    issues.push({ field: "note", message: "note is required when action is note_added." });
  }
  if (issues.length > 0) {
    return json({
      error: "Expected pursuitId and lifecycle action.",
      status: "validation_error",
      issues,
    }, { status: 400 });
  }

  const loadAggregate = options.loadAggregate ?? loadCandidateProfileAggregate;
  const aggregate = await loadAggregate(repositoryRequest, session.userId);
  if (!aggregate) {
    return json({ error: "Candidate profile not found.", status: "not_found" }, { status: 404 });
  }

  const updatedAt = options.now?.() ?? new Date().toISOString();
  const loadPursuit = options.loadPursuit ?? loadPursuitByIdForUser;
  const pursuit = await loadPursuit(repositoryRequest, session.userId, pursuitId as string);
  if (!pursuit || pursuit.profileId !== aggregate.profile.id) {
    return json({ error: "Pursuit not found.", status: "not_found" }, { status: 404 });
  }

  const result = action === "expired"
    ? expireInactivePursuit(pursuit, updatedAt)
    : transitionPursuit(pursuit, action as PursuitEventType, updatedAt, {
      action,
      note,
    });
  if (result.ok === false) {
    return json({
      error: "Could not update pursuit.",
      status: "transition_error",
      issues: result.issues,
    }, { status: 409 });
  }

  const persistTransition = options.persistTransition ?? persistPursuitTransition;
  await persistTransition(repositoryRequest, result);

  return json({
    status: "updated",
    profileId: aggregate.profile.id,
    pursuit: result.pursuit,
    event: result.event,
  });
}

export async function handlePublicProfileRegenerationRequest(
  request: Request,
  options: PublicProfileRegenerationHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const generatedAt = options.now?.() ?? new Date().toISOString();
  const regenerateProfile = options.regenerateProfile ?? regeneratePublicProfileForUser;
  const result = await regenerateProfile(repositoryRequest, session.userId, {
    generatedAt,
    changeSummary: "Profile regenerated through public profile API.",
  });

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  if (result.status === "incomplete") {
    return json(profileQualityResponse(result), { status: 409 });
  }

  return json(regeneratedResponse(result));
}

export async function handlePublicProfileBootstrapRequest(
  request: Request,
  options: PublicProfileBootstrapHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const checkedAt = options.now?.() ?? new Date().toISOString();
  const ensureProfile = options.ensureProfile ?? ensureCandidateProfileAggregate;
  const aggregate = await ensureProfile(repositoryRequest, session.userId, {
    email: session.email,
    checkedAt,
  });
  const profileQuality = aggregate.profileQuality ?? {
    status: aggregate.profile.status,
    incompleteReasons: [],
    weakFields: [],
    weakResponseCount: 0,
    lastCheckedAt: checkedAt,
  };

  return json({
    status: "ready",
    profileId: aggregate.profile.id,
    profileStatus: profileQuality.status,
    profileQuality: profileQualitySummary(profileQuality),
  });
}

export async function handleIdentitySearchSectionGetRequest(
  request: Request,
  options: PublicProfileIdentitySearchHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const checkedAt = options.now?.() ?? new Date().toISOString();
  const readIdentitySearch = options.readIdentitySearch ?? readIdentitySearchSectionForUser;
  const result = await readIdentitySearch(repositoryRequest, session.userId, checkedAt);

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleIdentitySearchSectionPatchRequest(
  request: Request,
  options: PublicProfileIdentitySearchHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null);
  const updatedAt = options.now?.() ?? new Date().toISOString();
  const updateIdentitySearch = options.updateIdentitySearch ?? updateIdentitySearchSectionForUser;
  const result = await updateIdentitySearch(repositoryRequest, session.userId, input, { updatedAt });

  if (result.status === "validation_error") {
    return json({
      error: "Invalid identity/search update.",
      status: result.status,
      issues: result.issues,
    }, { status: 400 });
  }

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleRoleTracksSectionGetRequest(
  request: Request,
  options: PublicProfileRoleTracksHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const checkedAt = options.now?.() ?? new Date().toISOString();
  const readRoleTracks = options.readRoleTracks ?? readRoleTracksSectionForUser;
  const result = await readRoleTracks(repositoryRequest, session.userId, checkedAt);

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleRoleTracksSectionPatchRequest(
  request: Request,
  options: PublicProfileRoleTracksHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null);
  const updatedAt = options.now?.() ?? new Date().toISOString();
  const updateRoleTracks = options.updateRoleTracks ?? updateRoleTracksSectionForUser;
  const result = await updateRoleTracks(repositoryRequest, session.userId, input, { updatedAt });

  if (result.status === "validation_error") {
    return json({
      error: "Invalid Role Tracks update.",
      status: result.status,
      issues: result.issues,
    }, { status: 400 });
  }

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleResumeUploadsSectionGetRequest(
  request: Request,
  options: PublicProfileResumeUploadsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const checkedAt = options.now?.() ?? new Date().toISOString();
  const readResumeUploads = options.readResumeUploads ?? readResumeUploadsSectionForUser;
  const result = await readResumeUploads(repositoryRequest, session.userId, checkedAt);

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleResumeUploadsSectionPatchRequest(
  request: Request,
  options: PublicProfileResumeUploadsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null);
  const updatedAt = options.now?.() ?? new Date().toISOString();
  const updateResumeUploads = options.updateResumeUploads ?? updateResumeUploadsSectionForUser;
  const result = await updateResumeUploads(repositoryRequest, session.userId, input, { updatedAt });

  if (result.status === "validation_error") {
    return json({
      error: "Invalid Resume Uploads update.",
      status: result.status,
      issues: result.issues,
    }, { status: 400 });
  }

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleFitSignalsSectionGetRequest(
  request: Request,
  options: PublicProfileFitSignalsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const checkedAt = options.now?.() ?? new Date().toISOString();
  const readFitSignals = options.readFitSignals ?? readFitSignalsSectionForUser;
  const result = await readFitSignals(repositoryRequest, session.userId, checkedAt);

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleFitSignalsSectionPatchRequest(
  request: Request,
  options: PublicProfileFitSignalsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null);
  const updatedAt = options.now?.() ?? new Date().toISOString();
  const updateFitSignals = options.updateFitSignals ?? updateFitSignalsSectionForUser;
  const result = await updateFitSignals(repositoryRequest, session.userId, input, { updatedAt });

  if (result.status === "validation_error") {
    return json({
      error: "Invalid Fit Signals update.",
      status: result.status,
      issues: result.issues,
    }, { status: 400 });
  }

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleWorkExamplesSectionGetRequest(
  request: Request,
  options: PublicProfileWorkExamplesHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const checkedAt = options.now?.() ?? new Date().toISOString();
  const readWorkExamples = options.readWorkExamples ?? readWorkExamplesSectionForUser;
  const result = await readWorkExamples(repositoryRequest, session.userId, checkedAt);

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleWorkExamplesSectionPatchRequest(
  request: Request,
  options: PublicProfileWorkExamplesHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null);
  const updatedAt = options.now?.() ?? new Date().toISOString();
  const updateWorkExamples = options.updateWorkExamples ?? updateWorkExamplesSectionForUser;
  const result = await updateWorkExamples(repositoryRequest, session.userId, input, { updatedAt });

  if (result.status === "validation_error") {
    return json({
      error: "Invalid Work Examples update.",
      status: result.status,
      issues: result.issues,
    }, { status: 400 });
  }

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleSkillsInventorySectionGetRequest(
  request: Request,
  options: PublicProfileSkillsInventoryHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const checkedAt = options.now?.() ?? new Date().toISOString();
  const readSkillsInventory = options.readSkillsInventory ?? readSkillsInventorySectionForUser;
  const result = await readSkillsInventory(repositoryRequest, session.userId, checkedAt);

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleSkillsInventorySectionPatchRequest(
  request: Request,
  options: PublicProfileSkillsInventoryHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null);
  const updatedAt = options.now?.() ?? new Date().toISOString();
  const updateSkillsInventory = options.updateSkillsInventory ?? updateSkillsInventorySectionForUser;
  const result = await updateSkillsInventory(repositoryRequest, session.userId, input, { updatedAt });

  if (result.status === "validation_error") {
    return json({
      error: "Invalid Skills Inventory update.",
      status: result.status,
      issues: result.issues,
    }, { status: 400 });
  }

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleQualityNarrativeSectionGetRequest(
  request: Request,
  section: QualitySection,
  options: PublicProfileQualityNarrativeHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const checkedAt = options.now?.() ?? new Date().toISOString();
  const readQualityNarrative = options.readQualityNarrative ?? readQualityNarrativeSectionForUser;
  const result = await readQualityNarrative(repositoryRequest, session.userId, section, checkedAt);

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleQualityNarrativeSectionPatchRequest(
  request: Request,
  section: QualitySection,
  options: PublicProfileQualityNarrativeHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null);
  const updatedAt = options.now?.() ?? new Date().toISOString();
  const updateQualityNarrative = options.updateQualityNarrative ?? updateQualityNarrativeSectionForUser;
  const result = await updateQualityNarrative(repositoryRequest, session.userId, section, input, { updatedAt });

  if (result.status === "validation_error") {
    return json({
      error: "Invalid profile narrative update.",
      status: result.status,
      issues: result.issues,
    }, { status: 400 });
  }

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleVoicePersonalitySectionGetRequest(
  request: Request,
  options: PublicProfileVoicePersonalityHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const checkedAt = options.now?.() ?? new Date().toISOString();
  const readVoicePersonality = options.readVoicePersonality ?? readVoicePersonalitySectionForUser;
  const result = await readVoicePersonality(repositoryRequest, session.userId, checkedAt);

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleVoicePersonalitySectionPatchRequest(
  request: Request,
  options: PublicProfileVoicePersonalityHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null);
  const updatedAt = options.now?.() ?? new Date().toISOString();
  const updateVoicePersonality = options.updateVoicePersonality ?? updateVoicePersonalitySectionForUser;
  const result = await updateVoicePersonality(repositoryRequest, session.userId, input, { updatedAt });

  if (result.status === "validation_error") {
    return json({
      error: "Invalid Voice & Personality update.",
      status: result.status,
      issues: result.issues,
    }, { status: 400 });
  }

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleWritingSamplesSectionGetRequest(
  request: Request,
  options: PublicProfileWritingSamplesHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const checkedAt = options.now?.() ?? new Date().toISOString();
  const readWritingSamples = options.readWritingSamples ?? readWritingSamplesSectionForUser;
  const result = await readWritingSamples(repositoryRequest, session.userId, checkedAt);

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleWritingSamplesSectionPatchRequest(
  request: Request,
  options: PublicProfileWritingSamplesHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null);
  const updatedAt = options.now?.() ?? new Date().toISOString();
  const updateWritingSamples = options.updateWritingSamples ?? updateWritingSamplesSectionForUser;
  const result = await updateWritingSamples(repositoryRequest, session.userId, input, { updatedAt });

  if (result.status === "validation_error") {
    return json({
      error: "Invalid Writing Samples update.",
      status: result.status,
      issues: result.issues,
    }, { status: 400 });
  }

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleOutreachRulesSectionGetRequest(
  request: Request,
  options: PublicProfileOutreachRulesHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const checkedAt = options.now?.() ?? new Date().toISOString();
  const readOutreachRules = options.readOutreachRules ?? readOutreachRulesSectionForUser;
  const result = await readOutreachRules(repositoryRequest, session.userId, checkedAt);

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleOutreachRulesSectionPatchRequest(
  request: Request,
  options: PublicProfileOutreachRulesHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null);
  const updatedAt = options.now?.() ?? new Date().toISOString();
  const updateOutreachRules = options.updateOutreachRules ?? updateOutreachRulesSectionForUser;
  const result = await updateOutreachRules(repositoryRequest, session.userId, input, { updatedAt });

  if (result.status === "validation_error") {
    return json({
      error: "Invalid Outreach Rules update.",
      status: result.status,
      issues: result.issues,
    }, { status: 400 });
  }

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export type PublicProfileOutreachHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  generateOutreach?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    body: Extract<ReturnType<typeof parseOutreachRequest>, { ok: true }>["value"],
  ) => Promise<OutreachGenerationResult>;
};

export async function handleOutreachGeneratorRequest(
  request: Request,
  options: PublicProfileOutreachHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null);
  const parsed = parseOutreachRequest(input);
  if (parsed.ok === false) {
    return json({
      error: "Invalid outreach request.",
      status: "validation_error",
      issues: parsed.issues,
    }, { status: 400 });
  }

  const generateOutreach = options.generateOutreach
    ?? ((repoRequest, userId, body) => generateOutreachMessageForUser({
      loadAggregate: (requestedUserId) => loadCandidateProfileAggregate(repoRequest, requestedUserId),
    }, userId, body));
  const result = await generateOutreach(repositoryRequest, session.userId, parsed.value);

  if (result.status === "not_found") {
    return json({ error: "Candidate profile not found.", status: result.status }, { status: 404 });
  }
  if (result.status === "profile_incomplete") {
    return json({
      error: "Complete and generate your profile before generating outreach.",
      status: result.status,
    }, { status: 409 });
  }
  if (result.status === "model_unavailable") {
    return json({
      error: "Outreach generation is not configured.",
      status: result.status,
    }, { status: 503 });
  }

  return json({
    status: result.status,
    message: result.outreach.message,
    insertedExample: result.outreach.insertedExample,
  });
}

export async function handleLeadershipProfileSectionGetRequest(
  request: Request,
  options: PublicProfileLeadershipProfileHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const checkedAt = options.now?.() ?? new Date().toISOString();
  const readLeadershipProfile = options.readLeadershipProfile ?? readLeadershipProfileSectionForUser;
  const result = await readLeadershipProfile(repositoryRequest, session.userId, checkedAt);

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

export async function handleLeadershipProfileSectionPatchRequest(
  request: Request,
  options: PublicProfileLeadershipProfileHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null);
  const updatedAt = options.now?.() ?? new Date().toISOString();
  const updateLeadershipProfile = options.updateLeadershipProfile ?? updateLeadershipProfileSectionForUser;
  const result = await updateLeadershipProfile(repositoryRequest, session.userId, input, { updatedAt });

  if (result.status === "validation_error") {
    return json({
      error: "Invalid Leadership Profile update.",
      status: result.status,
      issues: result.issues,
    }, { status: 400 });
  }

  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
  });
}

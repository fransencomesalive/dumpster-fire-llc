import { createHash } from "node:crypto";
import {
  getPublicAuthSession,
  type PublicAuthSession,
} from "../public-auth/session";
import {
  loadPublicJobByIdForUser,
  loadPublicJobsByIdsForUser,
} from "../public-jobs/repository";
import { snapshotPublicJob, type PublicJobRecord } from "../public-jobs/types";
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
  resetCandidateProfileDataForUser,
  type PublicProfileRepositoryRequest,
} from "./repository";
import { generateResumeParse, type ResumeParseVerdict } from "./resume-parse";
import {
  createPursuitForJob,
  loadContactSuggestionsForPursuit,
  loadContactSuggestionsForPursuits,
  loadInitialOutreachGenerationCommit,
  loadOutreachGenerationContextForMessage,
  loadOutreachMessageById,
  loadOutreachMessagesForPursuit,
  loadOutreachMessagesForPursuits,
  loadPursuitByIdForUser,
  loadPursuitByJobForUser,
  loadPursuitTrackingEventsForUser,
  loadPursuitTrackingEventsForUserAndPursuits,
  loadPursuitsForUser,
  persistContactSelection,
  persistHumanPathGeneration,
  persistOutreachGeneration,
  persistOutreachMessageFeedback,
  persistOutreachMessageCopy,
  persistOutreachRegeneration,
  persistPursuitTrackingMutation,
  persistPursuitTransition,
  recordProfileExportUsage,
  updateOutreachMessage,
} from "./pursuits/repository";
import { openAIHumanPathProvider } from "./pursuits/contact-provider";
import {
  applyOutreachMessageAction,
  completeReview,
  expireInactivePursuit,
  transitionPursuit,
  type OutreachMessageAction,
} from "./pursuits/state-machine";
import {
  derivePursuitTrackingState,
  pursuitBucket,
  pursuitHistory,
  PURSUIT_TRACKING_ACTIONS,
} from "./pursuits/tracking";
import type {
  CompleteReviewInput,
  CreatePursuitInput,
  GeneratedOutreachDraft,
  HumanPathContact,
  HumanPathContactSuggestion,
  HumanPathProvider,
  OutreachMessageRecord,
  OutreachMessageFeedback,
  OutreachMessageFeedbackReason,
  OutreachFeedbackGenerationContext,
  OutreachGenerationContext,
  OutreachRecipientType,
  Pursuit,
  PursuitEvent,
  PursuitEventType,
  PursuitStatus,
  PursuitTransitionResult,
  PursuitTrackingAction,
  PursuitTrackingCommit,
  PursuitTrackingEvent,
  PursuitInitialOutreachCommit,
  PursuitSelectionSnapshot,
  SaveOutreachMessageFeedbackInput,
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
  deriveResumeHighlightCountsForUser,
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
  deriveResumeHighlightCounts?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    at: string,
  ) => Promise<Record<string, number> | undefined>;
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
  loadPursuitByJob?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    jobId: string,
  ) => Promise<Pursuit | undefined>;
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
  loadOutreachMessagesBatch?: (
    request: PublicProfileRepositoryRequest,
    pursuitIds: string[],
  ) => Promise<Map<string, OutreachMessageRecord[]>>;
  loadOutreachMessage?: (
    request: PublicProfileRepositoryRequest,
    messageId: string,
  ) => Promise<OutreachMessageRecord | undefined>;
  updateOutreachMessage?: (
    request: PublicProfileRepositoryRequest,
    message: OutreachMessageRecord,
  ) => Promise<void>;
  persistOutreachMessageFeedback?: (
    request: PublicProfileRepositoryRequest,
    input: SaveOutreachMessageFeedbackInput,
  ) => Promise<OutreachMessageFeedback>;
  loadOutreachGenerationContext?: (
    request: PublicProfileRepositoryRequest,
    message: OutreachMessageRecord,
  ) => Promise<OutreachFeedbackGenerationContext | undefined>;
  loadPursuitEvents?: (
    request: PublicProfileRepositoryRequest,
    pursuitId: string,
  ) => Promise<PursuitEvent[]>;
  loadPursuitTrackingEvents?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    pursuitId: string,
  ) => Promise<PursuitTrackingEvent[]>;
  loadPursuitTrackingEventsBatch?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    pursuitIds: string[],
  ) => Promise<Map<string, PursuitTrackingEvent[]>>;
  persistTrackingMutation?: (
    request: PublicProfileRepositoryRequest,
    input: {
      userId: string;
      pursuitId: string;
      changes: Partial<Record<PursuitTrackingAction, boolean>>;
      idempotencyKey: string;
    },
  ) => Promise<PursuitTrackingCommit>;
  persistMessageCopy?: (
    request: PublicProfileRepositoryRequest,
    input: {
      userId: string;
      outreachMessageId: string;
      idempotencyKey: string;
    },
  ) => Promise<PursuitTrackingCommit>;
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
  loadContactSuggestionsBatch?: (
    request: PublicProfileRepositoryRequest,
    pursuitIds: string[],
  ) => Promise<Map<string, HumanPathContactSuggestion[]>>;
  recordExportUsage?: (
    request: PublicProfileRepositoryRequest,
    input: { userId: string; createdAt: string; quantity?: number },
  ) => Promise<void>;
  regenerateProfile?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    options: { generatedAt: string; changeSummary: string },
  ) => Promise<PublicProfileRegenerationResult>;
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
    previousMessage?: string;
  }) => Promise<OutreachMessage | undefined>;
  persistOutreach?: (
    request: PublicProfileRepositoryRequest,
    result: Extract<PursuitTransitionResult, { ok: true }>,
    drafts: GeneratedOutreachDraft[],
    input: { idempotencyKey: string },
  ) => Promise<PursuitInitialOutreachCommit | void>;
  loadInitialOutreachCommit?: (
    request: PublicProfileRepositoryRequest,
    input: { userId: string; pursuitId: string; idempotencyKey?: string },
  ) => Promise<PursuitInitialOutreachCommit | undefined>;
  persistOutreachRegeneration?: (
    request: PublicProfileRepositoryRequest,
    result: Extract<PursuitTransitionResult, { ok: true }>,
    input: {
      messageId: string;
      previousMessage: string;
      message: string;
      generationContext: OutreachGenerationContext;
      updatedAt: string;
    },
  ) => Promise<OutreachMessageRecord | undefined>;
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
  enforcePursuitSubscription?: (
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

function publicJobVisibleToUser(job: PublicJobRecord | undefined, userId: string) {
  return job && (!job.ownerUserId || job.ownerUserId === userId) ? job : undefined;
}

function selectionSnapshotForReview(
  aggregate: CandidateProfileAggregate,
  input: CompleteReviewInput,
  capturedAt: string,
): PursuitSelectionSnapshot {
  const roleTrack = input.selectedRoleTrackId
    ? aggregate.roleTracks.find((candidate) => candidate.id === input.selectedRoleTrackId)
    : undefined;
  const resume = input.selectedResumeId
    ? aggregate.resumes.find((candidate) => candidate.id === input.selectedResumeId)
    : undefined;
  const workExample = input.selectedWorkExampleId
    ? aggregate.workExamples.find((candidate) => candidate.id === input.selectedWorkExampleId)
    : undefined;
  return {
    roleTrackId: roleTrack?.id,
    resumeId: resume?.id,
    workExampleId: workExample?.id,
    applyingAs: roleTrack ? {
      id: roleTrack.id,
      label: roleTrack.name,
      narrative: roleTrack.corePositioning || roleTrack.description || roleTrack.outreachAngle,
    } : undefined,
    resume: resume ? { id: resume.id, label: resume.name } : undefined,
    workExample: workExample ? {
      id: workExample.id,
      label: workExample.title,
      oneHitter: workExample.oneHitter,
      link: workExample.link,
      context: workExample.context,
    } : undefined,
    capturedAt,
  };
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
  rejected: "rejected",
} satisfies Record<string, PursuitEventType>;

function parseTrackingAction(value: unknown): PursuitEventType | undefined {
  const action = optionalString(value);
  return action && action in TRACKING_ACTIONS
    ? TRACKING_ACTIONS[action as keyof typeof TRACKING_ACTIONS]
    : undefined;
}

function parsePursuitTrackingChanges(value: unknown): {
  changes: Partial<Record<PursuitTrackingAction, boolean>>;
  issues: { field: string; message: string }[];
} {
  const issues: { field: string; message: string }[] = [];
  const changes: Partial<Record<PursuitTrackingAction, boolean>> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      changes,
      issues: [{ field: "changes", message: "changes must be an object with at least one tracking action." }],
    };
  }

  const allowed = new Set<string>(PURSUIT_TRACKING_ACTIONS);
  for (const [action, checked] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(action)) {
      issues.push({ field: `changes.${action}`, message: `${action} is not an accepted tracking action.` });
      continue;
    }
    if (typeof checked !== "boolean") {
      issues.push({ field: `changes.${action}`, message: `${action} must be true or false.` });
      continue;
    }
    changes[action as PursuitTrackingAction] = checked;
  }

  if (Object.keys(changes).length === 0 && issues.length === 0) {
    issues.push({ field: "changes", message: "At least one tracking change is required." });
  }
  return { changes, issues };
}

function parseIdempotencyKey(value: unknown): string | undefined {
  const key = optionalString(value);
  return key && key.length <= 200 ? key : undefined;
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
      : result.feature === "pursued_jobs_export"
        ? "Pursued Jobs Export"
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

// The compiled profile.md (outreach + voice) is regenerated on demand, not on every
// section save. A profile is stale when its structured data was edited after the last
// markdown generation. Every section persist bumps candidate_profiles.updated_at, and
// regeneration sets updated_at and markdown_generated_at to the same instant, so a strict
// `updatedAt > markdownGeneratedAt` is a reliable, migration-free staleness signal. A
// profile that has never been generated is treated as stale.
export function isProfileStale(profile: { updatedAt: string; markdownGeneratedAt?: string }): boolean {
  if (!profile.markdownGeneratedAt) return true;
  const updated = Date.parse(profile.updatedAt);
  const generated = Date.parse(profile.markdownGeneratedAt);
  if (!Number.isFinite(updated) || !Number.isFinite(generated)) return true;
  return updated > generated;
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

  const loadedJob = options.loadJob
    ? await options.loadJob(repositoryRequest, jobId)
    : await loadPublicJobByIdForUser(repositoryRequest, session.userId, jobId);
  const job = publicJobVisibleToUser(loadedJob, session.userId);
  // Another user's pasted job is invisible here — indistinguishable from nonexistent.
  if (!job || (job.ownerUserId && job.ownerUserId !== session.userId)) {
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

  const jobIds = pursuits.flatMap((pursuit) => pursuit.jobId ? [pursuit.jobId] : []);
  const jobsById = options.loadJobs
    ? await options.loadJobs(repositoryRequest, jobIds)
    : await loadPublicJobsByIdsForUser(repositoryRequest, session.userId, jobIds);

  const items = pursuits.map((pursuit) => ({
    pursuit,
    job: pursuit.jobId
      ? publicJobVisibleToUser(jobsById.get(pursuit.jobId), session.userId) ?? null
      : null,
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

export async function handlePublicProfileSavedPursuitsListRequest(
  request: Request,
  options: PublicProfilePursuitsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const loadPursuits = options.loadPursuits ?? loadPursuitsForUser;
  const pursuits = await loadPursuits(repositoryRequest, session.userId, {});
  const pursuitIds = pursuits.map((pursuit) => pursuit.id);
  const jobIds = pursuits.flatMap((pursuit) => pursuit.jobId ? [pursuit.jobId] : []);
  const trackingPromise = options.loadPursuitTrackingEventsBatch
    ? options.loadPursuitTrackingEventsBatch(repositoryRequest, session.userId, pursuitIds)
    : options.loadPursuitTrackingEvents
      ? Promise.all(pursuits.map(async (pursuit) => [
          pursuit.id,
          await options.loadPursuitTrackingEvents!(repositoryRequest, session.userId, pursuit.id),
        ] as const)).then((entries) => new Map(entries))
      : loadPursuitTrackingEventsForUserAndPursuits(repositoryRequest, session.userId, pursuitIds);
  const messagesPromise = options.loadOutreachMessagesBatch
    ? options.loadOutreachMessagesBatch(repositoryRequest, pursuitIds)
    : options.loadOutreachMessages
      ? Promise.all(pursuits.map(async (pursuit) => [
          pursuit.id,
          await options.loadOutreachMessages!(repositoryRequest, pursuit.id),
        ] as const)).then((entries) => new Map(entries))
      : loadOutreachMessagesForPursuits(repositoryRequest, pursuitIds);
  const contactsPromise = options.loadContactSuggestionsBatch
    ? options.loadContactSuggestionsBatch(repositoryRequest, pursuitIds)
    : options.loadContactSuggestions
      ? Promise.all(pursuits.map(async (pursuit) => [
          pursuit.id,
          await options.loadContactSuggestions!(repositoryRequest, pursuit.id),
        ] as const)).then((entries) => new Map(entries))
      : loadContactSuggestionsForPursuits(repositoryRequest, pursuitIds);
  const [jobsById, trackingByPursuit, messagesByPursuit, contactsByPursuit] = await Promise.all([
    options.loadJobs
      ? options.loadJobs(repositoryRequest, jobIds)
      : loadPublicJobsByIdsForUser(repositoryRequest, session.userId, jobIds),
    trackingPromise,
    messagesPromise,
    contactsPromise,
  ]);

  const items = pursuits.map((pursuit) => {
    const trackingEvents = trackingByPursuit.get(pursuit.id) ?? [];
    const messages = messagesByPursuit.get(pursuit.id) ?? [];
    const contacts = contactsByPursuit.get(pursuit.id) ?? [];
    const job = pursuit.jobId
      ? publicJobVisibleToUser(jobsById.get(pursuit.jobId), session.userId)
      : undefined;
    const snapshot = pursuit.jobSnapshot;
    return {
      id: pursuit.id,
      bucket: pursuitBucket(pursuit),
      posting: {
        title: snapshot?.title ?? job?.title ?? null,
        companyName: snapshot?.companyName ?? job?.companyName ?? null,
        location: snapshot?.location ?? job?.location ?? null,
        compensation: snapshot?.compensation ?? job?.compensationText ?? null,
        sourceUrl: snapshot?.sourceUrl ?? job?.sourceUrl ?? null,
        sourceState: snapshot?.sourceState ?? (job ? (job.ownerUserId ? "user_owned" : "shared") : null),
        availability: job ? (snapshot?.availability ?? "available") : snapshot ? "snapshot_only" : "unavailable",
      },
      savedContext: {
        selectedContactCount: contacts.filter((contact) => contact.selectedForOutreach).length,
        messageCount: messages.length,
      },
      tracking: derivePursuitTrackingState(trackingEvents),
      createdAt: pursuit.createdAt,
      lastActivityAt: pursuit.lastActivityAt,
    };
  });

  const byLatestActivity = (left: typeof items[number], right: typeof items[number]) => (
    right.lastActivityAt.localeCompare(left.lastActivityAt)
  );
  const savedForLater = items
    .filter((item) => item.bucket === "saved_for_later")
    .sort(byLatestActivity);
  const applied = items
    .filter((item) => item.bucket === "applied")
    .sort(byLatestActivity);

  return json({
    status: "ok",
    counts: {
      savedForLater: savedForLater.length,
      applied: applied.length,
    },
    savedForLater,
    applied,
  });
}

type PursuedJobOutreachEntry = {
  contactName: string | null;
  contactTitle: string | null;
  contactType: HumanPathContactSuggestion["contactType"] | null;
  recipientType: OutreachMessageRecord["recipientType"];
  channel: string;
  status: OutreachMessageRecord["status"];
  message: string;
  sentAt: string;
};

type PursuedJobExportRow = {
  pursuitId: string;
  status: PursuitStatus;
  job: {
    id: string;
    title: string;
    companyName: string;
    location: string | null;
    sourceUrl: string | null;
  } | null;
  applyingAs: {
    roleTrackId: string | null;
    roleTrackName: string | null;
    narrative: string | null;
  };
  outreach: PursuedJobOutreachEntry[];
  createdAt: string;
  lastActivityAt: string;
};

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function pursuedJobsCsv(rows: PursuedJobExportRow[]): string {
  const headers = [
    "pursuitId",
    "status",
    "jobTitle",
    "companyName",
    "jobUrl",
    "applyingAsRoleTrack",
    "applyingAsNarrative",
    "contactName",
    "contactTitle",
    "contactType",
    "recipientType",
    "channel",
    "messageStatus",
    "message",
    "messageSentAt",
    "pursuitCreatedAt",
    "lastActivityAt",
  ];

  const lines: string[][] = [];
  for (const row of rows) {
    const base = [
      row.pursuitId,
      row.status,
      row.job?.title ?? "",
      row.job?.companyName ?? "",
      row.job?.sourceUrl ?? "",
      row.applyingAs.roleTrackName ?? "",
      row.applyingAs.narrative ?? "",
    ];
    if (row.outreach.length === 0) {
      lines.push([...base, "", "", "", "", "", "", "", "", row.createdAt, row.lastActivityAt]);
      continue;
    }
    for (const entry of row.outreach) {
      lines.push([
        ...base,
        entry.contactName ?? "",
        entry.contactTitle ?? "",
        entry.contactType ?? "",
        entry.recipientType,
        entry.channel,
        entry.status,
        entry.message,
        entry.sentAt,
        row.createdAt,
        row.lastActivityAt,
      ]);
    }
  }

  return [headers, ...lines].map((cells) => cells.map(csvCell).join(",")).join("\r\n");
}

export async function handlePublicProfilePursuedJobsExportRequest(
  request: Request,
  options: PublicProfilePursuitsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";

  const loadAggregate = options.loadAggregate ?? loadCandidateProfileAggregate;
  const aggregate = await loadAggregate(repositoryRequest, session.userId);
  if (!aggregate) {
    return json({ error: "Candidate profile not found.", status: "not_found" }, { status: 404 });
  }

  const exportedAt = options.now?.() ?? new Date().toISOString();

  const loadSubscriptionContext = options.loadSubscriptionContext ?? loadSubscriptionContextForUser;
  const loadUsageEntries = options.loadUsageEntries ?? loadUsageLedgerForUser;
  const subscriptionContext = await loadSubscriptionContext(repositoryRequest, session.userId);
  const usageEntries = await loadUsageEntries(repositoryRequest, session.userId, {
    at: exportedAt,
    periodStart: subscriptionContext.currentPeriodStart,
    periodEnd: subscriptionContext.currentPeriodEnd,
  });
  const enforceSubscription = options.enforceSubscription
    ?? ((context, entries, at) => enforceSubscriptionFeature(context, entries, "pursued_jobs_export", { at }));
  const enforcement = enforceSubscription(subscriptionContext, usageEntries, exportedAt);
  if (enforcement.status !== "allowed") {
    return subscriptionBlockedResponse(enforcement);
  }

  const loadPursuits = options.loadPursuits ?? loadPursuitsForUser;
  const pursuits = await loadPursuits(repositoryRequest, session.userId, {});

  const jobIds = pursuits.flatMap((pursuit) => pursuit.jobId ? [pursuit.jobId] : []);
  const jobsById = options.loadJobs
    ? await options.loadJobs(repositoryRequest, jobIds)
    : await loadPublicJobsByIdsForUser(repositoryRequest, session.userId, jobIds);

  const loadOutreachMessages = options.loadOutreachMessages ?? loadOutreachMessagesForPursuit;
  const loadContactSuggestions = options.loadContactSuggestions ?? loadContactSuggestionsForPursuit;
  const roleTracksById = new Map(aggregate.roleTracks.map((track) => [track.id, track]));

  const rows: PursuedJobExportRow[] = await Promise.all(pursuits.map(async (pursuit) => {
    const [messages, contacts] = await Promise.all([
      loadOutreachMessages(repositoryRequest, pursuit.id),
      loadContactSuggestions(repositoryRequest, pursuit.id),
    ]);
    const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
    const roleTrack = pursuit.selectedRoleTrackId
      ? roleTracksById.get(pursuit.selectedRoleTrackId)
      : undefined;
    const job = pursuit.jobId
      ? publicJobVisibleToUser(jobsById.get(pursuit.jobId), session.userId)
      : undefined;
    const snapshot = pursuit.jobSnapshot;

    const outreach: PursuedJobOutreachEntry[] = messages
      .filter((message) => message.status === "sent")
      .map((message) => {
        const contact = message.contactSuggestionId
          ? contactsById.get(message.contactSuggestionId)
          : undefined;
        return {
          contactName: contact?.name ?? null,
          contactTitle: contact?.title ?? null,
          contactType: contact?.contactType ?? null,
          recipientType: message.recipientType,
          channel: message.channel,
          status: message.status,
          message: message.message,
          sentAt: message.updatedAt,
        };
      });

    return {
      pursuitId: pursuit.id,
      status: pursuit.status,
      job: job || snapshot
        ? {
            id: job?.id ?? snapshot?.jobId ?? pursuit.jobId ?? pursuit.id,
            title: snapshot?.title ?? job?.title ?? "",
            companyName: snapshot?.companyName ?? job?.companyName ?? "",
            location: snapshot?.location ?? job?.location ?? null,
            sourceUrl: snapshot?.sourceUrl ?? job?.sourceUrl ?? null,
          }
        : null,
      applyingAs: {
        roleTrackId: pursuit.selectedRoleTrackId ?? null,
        roleTrackName: roleTrack?.name ?? null,
        narrative: roleTrack?.corePositioning ?? pursuit.outreachAngle ?? null,
      },
      outreach,
      createdAt: pursuit.createdAt,
      lastActivityAt: pursuit.lastActivityAt,
    };
  }));

  const recordExportUsage = options.recordExportUsage ?? recordProfileExportUsage;
  await recordExportUsage(repositoryRequest, { userId: session.userId, createdAt: exportedAt });

  if (format === "csv") {
    return new Response(pursuedJobsCsv(rows), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pursued-jobs-${exportedAt.slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return json({
    status: "ok",
    exportedAt,
    total: rows.length,
    pursuedJobs: rows,
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

  const loadContactSuggestions = options.loadContactSuggestions ?? loadContactSuggestionsForPursuit;
  const loadOutreachMessages = options.loadOutreachMessages ?? loadOutreachMessagesForPursuit;
  const loadTrackingEvents = options.loadPursuitTrackingEvents ?? loadPursuitTrackingEventsForUser;

  const [loadedJob, contacts, outreachMessages, trackingEvents] = await Promise.all([
    pursuit.jobId
      ? (options.loadJob
          ? options.loadJob(repositoryRequest, pursuit.jobId)
          : loadPublicJobByIdForUser(repositoryRequest, session.userId, pursuit.jobId))
      : Promise.resolve(undefined),
    loadContactSuggestions(repositoryRequest, pursuit.id),
    loadOutreachMessages(repositoryRequest, pursuit.id),
    loadTrackingEvents(repositoryRequest, session.userId, pursuit.id),
  ]);
  const job = publicJobVisibleToUser(loadedJob, session.userId);
  const snapshot = pursuit.jobSnapshot;

  return json({
    status: "ok",
    pursuit,
    job: job ?? null,
    posting: {
      id: pursuit.jobId ?? snapshot?.jobId ?? null,
      source: snapshot?.source ?? job?.source ?? null,
      sourceState: snapshot?.sourceState ?? (job ? (job.ownerUserId ? "user_owned" : "shared") : null),
      sourceUrl: snapshot?.sourceUrl ?? job?.sourceUrl ?? null,
      title: snapshot?.title ?? job?.title ?? null,
      companyName: snapshot?.companyName ?? job?.companyName ?? null,
      location: snapshot?.location ?? job?.location ?? null,
      remoteType: snapshot?.remoteType ?? job?.remoteType ?? null,
      employmentType: snapshot?.employmentType ?? job?.employmentType ?? null,
      compensation: snapshot?.compensation ?? job?.compensationText ?? null,
      description: snapshot?.description ?? job?.description ?? null,
      responsibilities: snapshot?.responsibilities ?? job?.responsibilities ?? [],
      requiredExperience: snapshot?.requiredExperience ?? job?.requiredExperience ?? [],
      postedAt: snapshot?.postedAt ?? job?.postedAt ?? null,
      scrapedAt: snapshot?.scrapedAt ?? job?.scrapedAt ?? null,
      firstSeenAt: snapshot?.firstSeenAt ?? job?.firstSeenAt ?? null,
      lastSeenAt: snapshot?.lastSeenAt ?? job?.lastSeenAt ?? null,
      availability: job ? (snapshot?.availability ?? "available") : snapshot ? "snapshot_only" : "unavailable",
      capturedAt: snapshot?.capturedAt ?? null,
    },
    contacts: contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      title: contact.title,
      companyName: contact.companyName,
      linkedinUrl: contact.linkedinUrl,
      professionalContactUrl: contact.professionalContactUrl,
      reachability: contact.reachability,
      contactType: contact.contactType,
      confidence: contact.confidence,
      relevanceReason: contact.relevanceReason,
      roleConnection: contact.roleConnection,
      verificationNotes: [],
      selectedForOutreach: contact.selectedForOutreach,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    })),
    outreachMessages,
    bucket: pursuitBucket(pursuit),
    tracking: derivePursuitTrackingState(trackingEvents),
    history: pursuitHistory(trackingEvents),
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

  const loadedJob = options.loadJob
    ? await options.loadJob(repositoryRequest, jobId)
    : await loadPublicJobByIdForUser(repositoryRequest, session.userId, jobId);
  const job = publicJobVisibleToUser(loadedJob, session.userId);
  // Another user's pasted job is invisible here — indistinguishable from nonexistent.
  if (!job || (job.ownerUserId && job.ownerUserId !== session.userId)) {
    return json({ error: "Job not found.", status: "not_found" }, { status: 404 });
  }

  const evaluate = options.evaluate ?? ((matchInput) => evaluateMatch(matchInput));
  const match = evaluate({
    profile: aggregate,
    job: matchJobFromPublicJob(job),
    evaluatedAt: createdAt,
  });
  const recommendedRoleTrack = match.recommendations.roleTrack
    ? aggregate.roleTracks.find((track) => track.id === match.recommendations.roleTrack?.roleTrack.id)
    : undefined;

  // Pursuits are unique per (user, job); answering with the existing pursuit keeps a
  // duplicate create from colliding with pursuits_user_id_job_id_key.
  const loadPursuitByJob = options.loadPursuitByJob ?? loadPursuitByJobForUser;
  const existingPursuit = await loadPursuitByJob(repositoryRequest, session.userId, jobId);
  if (existingPursuit) {
    return json({
      error: "You are already pursuing this job.",
      status: "already_pursuing",
      pursuit: existingPursuit,
    }, { status: 409 });
  }

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
    jobSnapshot: snapshotPublicJob(job, createdAt),
    selectionSnapshot: {
      applyingAs: recommendedRoleTrack ? {
        id: recommendedRoleTrack.id,
        label: recommendedRoleTrack.name,
        narrative: recommendedRoleTrack.corePositioning
          || recommendedRoleTrack.description
          || recommendedRoleTrack.outreachAngle,
      } : undefined,
      roleTrackId: match.recommendations.roleTrack?.roleTrack.id,
      capturedAt: createdAt,
    },
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
  reviewInput.selectionSnapshot = selectionSnapshotForReview(aggregate, reviewInput, reviewedAt);

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

  const loadedJob = pursuit.jobId
    ? (options.loadJob
        ? await options.loadJob(repositoryRequest, pursuit.jobId)
        : await loadPublicJobByIdForUser(repositoryRequest, session.userId, pursuit.jobId))
    : undefined;
  const job = publicJobVisibleToUser(loadedJob, session.userId);
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

  const provider = options.humanPathProvider ?? openAIHumanPathProvider;
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
    selectionSnapshot: {
      ...pursuit.selectionSnapshot,
      contactSuggestionIds: contactIds,
      contacts: contacts
        .filter((contact) => contactIds.includes(contact.id))
        .map((contact) => ({
          id: contact.id,
          name: contact.name,
          title: contact.title,
          companyName: contact.companyName,
          linkedinUrl: contact.linkedinUrl,
          professionalContactUrl: contact.professionalContactUrl,
          reachability: contact.reachability,
        })),
      capturedAt: selectedAt,
    },
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

function outreachGenerationContext(input: {
  aggregate: CandidateProfileAggregate;
  profileMarkdown: string;
  pursuit: Pursuit;
  job: PublicJobRecord;
  contact: HumanPathContactSuggestion;
  generatedAt: string;
}): OutreachGenerationContext {
  const roleTrack = input.aggregate.roleTracks.find((item) => item.id === input.pursuit.selectedRoleTrackId);
  const resume = input.aggregate.resumes.find((item) => item.id === input.pursuit.selectedResumeId);
  const workExample = input.aggregate.workExamples.find((item) => item.id === input.pursuit.selectedWorkExampleId);
  const voice = input.aggregate.voicePersonality;

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    profile: {
      id: input.aggregate.profile.id,
      version: input.aggregate.profile.version,
      updatedAt: input.aggregate.profile.updatedAt,
      ...(input.aggregate.profile.markdownGeneratedAt
        ? { markdownGeneratedAt: input.aggregate.profile.markdownGeneratedAt }
        : {}),
      markdownSha256: createHash("sha256").update(input.profileMarkdown).digest("hex"),
      toneTags: [...(voice?.toneTags ?? [])],
      avoidTags: [...(voice?.avoidTags ?? [])],
      avoidNote: voice?.avoidNote ?? "",
    },
    selection: {
      ...(roleTrack ? { roleTrack: { id: roleTrack.id, name: roleTrack.name, targetTitles: [...roleTrack.targetTitles] } } : {}),
      ...(resume ? { resume: { id: resume.id, name: resume.name, highlights: [...resume.highlights] } } : {}),
      ...(workExample ? {
        workExample: {
          id: workExample.id,
          title: workExample.title,
          oneHitter: workExample.oneHitter,
          context: workExample.context,
          ...(workExample.link ? { link: workExample.link } : {}),
        },
      } : {}),
    },
    pursuit: {
      id: input.pursuit.id,
      ...(input.pursuit.selectionSnapshot ? { selectionSnapshot: input.pursuit.selectionSnapshot } : {}),
    },
    job: {
      id: input.job.id,
      title: input.job.title,
      companyName: input.job.companyName,
      ...(input.job.location ? { location: input.job.location } : {}),
      ...(input.job.remoteType ? { remoteType: input.job.remoteType } : {}),
      ...(input.job.employmentType ? { employmentType: input.job.employmentType } : {}),
      ...(input.job.compensationText ? { compensationText: input.job.compensationText } : {}),
      ...(input.job.sourceUrl ? { sourceUrl: input.job.sourceUrl } : {}),
    },
    recipient: {
      contactSuggestionId: input.contact.id,
      name: input.contact.name,
      title: input.contact.title,
      contactType: input.contact.contactType,
    },
  };
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
  const regenerate = input?.regenerate === true;
  const previousMessageId = optionalString(input?.previousMessageId);
  const requestedIdempotencyKey = parseIdempotencyKey(input?.idempotencyKey);
  const issues: { field: string; message: string }[] = [];
  if (!pursuitId) {
    issues.push({ field: "pursuitId", message: "pursuitId is required." });
  }
  if (input?.regenerate !== undefined && input.regenerate !== true) {
    issues.push({ field: "regenerate", message: "regenerate must be true when provided." });
  }
  if (regenerate && !previousMessageId) {
    issues.push({ field: "previousMessageId", message: "previousMessageId is required to regenerate outreach." });
  }
  if (!regenerate && previousMessageId) {
    issues.push({ field: "regenerate", message: "regenerate must be true when previousMessageId is provided." });
  }
  if (input?.idempotencyKey !== undefined && !requestedIdempotencyKey) {
    issues.push({ field: "idempotencyKey", message: "idempotencyKey must contain 1 to 200 characters when provided." });
  }
  if (issues.length > 0) {
    return json({
      error: "Invalid outreach request.",
      status: "validation_error",
      issues,
    }, { status: 400 });
  }
  const validatedPursuitId = pursuitId as string;

  const generatedAt = options.now?.() ?? new Date().toISOString();
  const loadPursuit = options.loadPursuit ?? loadPursuitByIdForUser;
  const pursuit = await loadPursuit(repositoryRequest, session.userId, validatedPursuitId);
  if (!pursuit) {
    return json({ error: "Pursuit not found.", status: "not_found" }, { status: 404 });
  }

  // A client retry after a committed response was lost must not depend on the
  // candidate profile, live posting, selected-contact set, or model being unchanged.
  // With an explicit key we replay that request; without one we replay the latest
  // committed initial generation for this owned pursuit.
  if (!regenerate) {
    const loadInitialCommit = options.loadInitialOutreachCommit ?? loadInitialOutreachGenerationCommit;
    const existingCommit = await loadInitialCommit(repositoryRequest, {
      userId: session.userId,
      pursuitId: pursuit.id,
      idempotencyKey: requestedIdempotencyKey,
    });
    if (existingCommit) {
      return json({
        status: "outreach_generated",
        replayed: true,
        profileId: existingCommit.pursuit.profileId,
        job: null,
        pursuit: existingCommit.pursuit,
        messages: existingCommit.messages.map((message) => ({
          ...message,
          insertedExample: null,
        })),
        metering: {
          pursuitDebited: existingCommit.pursuitDebited,
          outreachDebited: existingCommit.outreachDebited,
        },
      });
    }
  }

  const loadAggregate = options.loadAggregate ?? loadCandidateProfileAggregate;
  let aggregate = await loadAggregate(repositoryRequest, session.userId);
  if (!aggregate) {
    return json({ error: "Candidate profile not found.", status: "not_found" }, { status: 404 });
  }

  const profileQuality = aggregate.profileQuality ?? evaluateCandidateProfileQuality(aggregate, generatedAt);
  if (profileQuality.status !== "complete") {
    return profileIncompleteResponse(aggregate, profileQuality, "generating outreach");
  }
  let profileMarkdown = aggregate.profile.generatedMarkdown?.trim();

  // Compile profile.md on demand at the outreach step (Randall, 2026-07-11): compilation is
  // triggered here, when the user reaches Outreach with a selected contact — not on Pursue or
  // profile completion. The profile is already confirmed complete above, so a missing
  // profile.md (never generated) is compiled now, and an existing one is refreshed if the
  // candidate edited their profile after the last generation. isProfileStale treats a
  // never-generated profile as stale, so both cases route through one regeneration. Invisible
  // to the user; the regeneration cost is only paid here, once, when it is actually needed.
  if (!profileMarkdown || isProfileStale(aggregate.profile)) {
    const regenerateProfile = options.regenerateProfile ?? regeneratePublicProfileForUser;
    const regenerated = await regenerateProfile(repositoryRequest, session.userId, {
      generatedAt,
      changeSummary: profileMarkdown
        ? "Refreshed before outreach after profile edits."
        : "Compiled before outreach on first Human Path generation.",
    });
    if (regenerated.status === "regenerated") {
      const refreshed = regenerated.generation.aggregate.profile.generatedMarkdown?.trim();
      if (refreshed) {
        profileMarkdown = refreshed;
        aggregate = regenerated.generation.aggregate;
      }
    }
  }

  if (!profileMarkdown) {
    return json({
      error: "Complete and generate your profile before generating outreach.",
      status: "profile_incomplete",
    }, { status: 409 });
  }

  if (pursuit.profileId !== aggregate.profile.id) {
    return json({ error: "Pursuit not found.", status: "not_found" }, { status: 404 });
  }

  const loadedJob = pursuit.jobId
    ? (options.loadJob
        ? await options.loadJob(repositoryRequest, pursuit.jobId)
        : await loadPublicJobByIdForUser(repositoryRequest, session.userId, pursuit.jobId))
    : undefined;
  const job = publicJobVisibleToUser(loadedJob, session.userId);
  if (!job) {
    return json({ error: "Job not found.", status: "not_found" }, { status: 404 });
  }

  const loadContactSuggestions = options.loadContactSuggestions ?? loadContactSuggestionsForPursuit;
  if (regenerate) {
    const loadOutreachMessage = options.loadOutreachMessage ?? loadOutreachMessageById;
    const previousMessage = await loadOutreachMessage(repositoryRequest, previousMessageId as string);
    if (!previousMessage || previousMessage.pursuitId !== pursuit.id) {
      return json({ error: "Outreach message not found.", status: "not_found" }, { status: 404 });
    }
    if ((previousMessage.regenerationCount ?? 0) >= 1) {
      return json({
        error: "This outreach message has already been regenerated.",
        status: "already_regenerated",
      }, { status: 409 });
    }
    const contactSuggestion = (await loadContactSuggestions(repositoryRequest, pursuit.id))
      .find((contact) => contact.id === previousMessage.contactSuggestionId);
    if (!contactSuggestion) {
      return json({ error: "Human Path contact not found.", status: "not_found" }, { status: 404 });
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
        quantity: 1,
      }));
    const enforcement = enforceSubscription(subscriptionContext, usageEntries, generatedAt);
    if (enforcement.status !== "allowed") {
      return subscriptionBlockedResponse(enforcement);
    }

    const result = transitionPursuit(pursuit, "outreach_generated", generatedAt, {
      contactIds: [contactSuggestion.id],
      messageCount: 1,
      previousMessageId: previousMessage.id,
      regenerate: true,
    });
    if (result.ok === false) {
      return json({
        error: "Could not regenerate outreach.",
        status: "transition_error",
        issues: result.issues,
      }, { status: 409 });
    }

    const generateOutreachForContact = options.generateOutreachForContact
      ?? ((outreachInput) => {
        // TODO(message-gen-track): consume previousMessage in the approved regeneration prompt.
        return generateOutreachMessage({
          profileMarkdown: outreachInput.profileMarkdown,
          job: outreachInput.job,
          contact: outreachInput.contact,
        });
      });
    const outreach = await generateOutreachForContact({
      profileMarkdown,
      job: outreachJobFromPublicJob(job),
      contact: outreachContactFromSuggestion(contactSuggestion),
      contactSuggestion,
      previousMessage: previousMessage.message,
    });
    if (!outreach) {
      return json({
        error: "Outreach generation is not configured.",
        status: "model_unavailable",
      }, { status: 503 });
    }

    const persistRegeneration = options.persistOutreachRegeneration ?? persistOutreachRegeneration;
    const regeneratedMessage = await persistRegeneration(repositoryRequest, result, {
      messageId: previousMessage.id,
      previousMessage: previousMessage.message,
      message: outreach.message,
      generationContext: outreachGenerationContext({
        aggregate,
        profileMarkdown,
        pursuit,
        job,
        contact: contactSuggestion,
        generatedAt,
      }),
      updatedAt: generatedAt,
    });
    if (!regeneratedMessage) {
      return json({
        error: "This outreach message has already been regenerated.",
        status: "already_regenerated",
      }, { status: 409 });
    }

    return json({
      status: "outreach_regenerated",
      profileId: aggregate.profile.id,
      job,
      pursuit: result.pursuit,
      message: regeneratedMessage,
      insertedExample: outreach.insertedExample,
      event: result.event,
      subscription: enforcement,
    });
  }

  const selectedContacts = (await loadContactSuggestions(repositoryRequest, pursuit.id))
    .filter((contact) => contact.selectedForOutreach);
  if (selectedContacts.length === 0) {
    return json({
      error: "Select at least one Human Path contact before generating outreach.",
      status: "validation_error",
      issues: [{ field: "selectedContacts", message: "At least one selected contact is required." }],
    }, { status: 400 });
  }

  // Initial generation creates one row per contact. The one-time backup regeneration
  // is handled above and updates that same row in place.
  const loadOutreachMessages = options.loadOutreachMessages ?? loadOutreachMessagesForPursuit;
  const existingMessages = await loadOutreachMessages(repositoryRequest, pursuit.id);
  const alreadyGenerated = new Set(
    existingMessages
      .map((message) => message.contactSuggestionId)
      .filter((id): id is string => Boolean(id)),
  );
  const contactsToGenerate = selectedContacts.filter((contact) => !alreadyGenerated.has(contact.id));
  const generationIdempotencyKey = requestedIdempotencyKey ?? [
    "initial-outreach",
    pursuit.id,
    ...selectedContacts.map((contact) => contact.id).sort(),
  ].join(":");
  if (contactsToGenerate.length === 0) {
    return json({
      error: "Outreach was already generated for every selected contact. Edit the existing drafts instead.",
      status: "already_generated",
    }, { status: 409 });
  }

  const loadSubscriptionContext = options.loadSubscriptionContext ?? loadSubscriptionContextForUser;
  const loadUsageEntries = options.loadUsageEntries ?? loadUsageLedgerForUser;
  const subscriptionContext = await loadSubscriptionContext(repositoryRequest, session.userId);
  const usageEntries = await loadUsageEntries(repositoryRequest, session.userId, {
    at: generatedAt,
    periodStart: subscriptionContext.currentPeriodStart,
    periodEnd: subscriptionContext.currentPeriodEnd,
  });
  const shouldChargePursuit = !pursuit.pursuitMeteredAt;
  if (shouldChargePursuit) {
    const enforcePursuitSubscription = options.enforcePursuitSubscription
      ?? ((context, entries, at) => enforceSubscriptionFeature(context, entries, "pursuit", {
        at,
        quantity: 1,
      }));
    const pursuitEnforcement = enforcePursuitSubscription(
      subscriptionContext,
      usageEntries,
      generatedAt,
    );
    if (pursuitEnforcement.status !== "allowed") {
      return subscriptionBlockedResponse(pursuitEnforcement);
    }
  }
  const enforceSubscription = options.enforceSubscription
    ?? ((context, entries, at) => enforceSubscriptionFeature(context, entries, "outreach_message", {
      at,
      quantity: contactsToGenerate.length,
    }));
  const enforcement = enforceSubscription(subscriptionContext, usageEntries, generatedAt);
  if (enforcement.status !== "allowed") {
    return subscriptionBlockedResponse(enforcement);
  }

  const result = transitionPursuit(pursuit, "outreach_generated", generatedAt, {
    contactIds: contactsToGenerate.map((contact) => contact.id),
    messageCount: contactsToGenerate.length,
    chargePursuit: shouldChargePursuit,
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
  for (const contactSuggestion of contactsToGenerate) {
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
    generationContext: outreachGenerationContext({
      aggregate,
      profileMarkdown,
      pursuit,
      job,
      contact,
      generatedAt,
    }),
    createdAt: generatedAt,
  }));
  const persistOutreach = options.persistOutreach ?? persistOutreachGeneration;
  let persisted: PursuitInitialOutreachCommit | void;
  try {
    persisted = await persistOutreach(repositoryRequest, result, drafts, {
      idempotencyKey: generationIdempotencyKey,
    });
  } catch (error) {
    const blocked = transactionalSubscriptionError(error);
    if (blocked) return blocked;
    return json({
      error: "The messages were generated but could not be saved. Try again.",
      status: "persistence_failed",
      retryable: true,
      saved: false,
    }, { status: 503 });
  }
  const persistedCommit = persisted as PursuitInitialOutreachCommit | undefined;

  return json({
    status: "outreach_generated",
    profileId: aggregate.profile.id,
    job,
    pursuit: persistedCommit?.pursuit ?? result.pursuit,
    messages: persistedCommit?.messages.map((message) => ({
      ...message,
      insertedExample: generatedMessages.find(
        ({ contact }) => contact.id === message.contactSuggestionId,
      )?.outreach.insertedExample ?? null,
    })) ?? generatedMessages.map(({ contact, outreach }) => ({
      contactSuggestionId: contact.id,
      recipientType: outreachRecipientType(contact.contactType),
      message: outreach.message,
      insertedExample: outreach.insertedExample,
    })),
    event: result.event,
    subscription: enforcement,
    metering: {
      pursuitDebited: persistedCommit?.pursuitDebited ?? shouldChargePursuit,
      outreachDebited: persistedCommit?.outreachDebited ?? drafts.length,
    },
  });
}

function parseOutreachMessageAction(
  input: Record<string, unknown> | null,
): { ok: true; value: OutreachMessageAction } | { ok: false; issues: { field: string; message: string }[] } {
  const actionType = optionalString(input?.action);
  if (!actionType) {
    return { ok: false, issues: [{ field: "action", message: "action is required." }] };
  }
  switch (actionType) {
    case "approve":
      return { ok: true, value: { type: "approve" } };
    case "send":
      return { ok: true, value: { type: "send" } };
    case "edit": {
      const message = optionalString(input?.message);
      if (!message) {
        return { ok: false, issues: [{ field: "message", message: "message is required to edit a draft." }] };
      }
      return { ok: true, value: { type: "edit", message } };
    }
    case "reject": {
      const rejectionReason = optionalString(input?.rejectionReason);
      if (!rejectionReason) {
        return { ok: false, issues: [{ field: "rejectionReason", message: "rejectionReason is required to reject a draft." }] };
      }
      return { ok: true, value: { type: "reject", rejectionReason } };
    }
    default:
      return { ok: false, issues: [{ field: "action", message: "action must be approve, edit, reject, or send." }] };
  }
}

// Per-message approve / edit / reject / send. The pursuit-level Track step transitions the
// whole pursuit; this transitions a single outreach_messages row so the user can shape each
// draft independently. The message's pursuit must belong to the authenticated user.
export async function handlePublicProfilePursuitOutreachMessageUpdateRequest(
  request: Request,
  messageId: string,
  options: PublicProfilePursuitsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const trimmedMessageId = messageId?.trim();
  if (!trimmedMessageId) {
    return json({
      error: "Expected messageId.",
      status: "validation_error",
      issues: [{ field: "messageId", message: "messageId is required." }],
    }, { status: 400 });
  }

  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = parseOutreachMessageAction(input);
  if (action.ok === false) {
    return json({
      error: "Could not update the outreach message.",
      status: "validation_error",
      issues: action.issues,
    }, { status: 400 });
  }

  const loadMessage = options.loadOutreachMessage ?? loadOutreachMessageById;
  const message = await loadMessage(repositoryRequest, trimmedMessageId);
  if (!message) {
    return json({ error: "Outreach message not found.", status: "not_found" }, { status: 404 });
  }

  const loadPursuit = options.loadPursuit ?? loadPursuitByIdForUser;
  const pursuit = await loadPursuit(repositoryRequest, session.userId, message.pursuitId);
  if (!pursuit) {
    return json({ error: "Outreach message not found.", status: "not_found" }, { status: 404 });
  }

  const updatedAt = options.now?.() ?? new Date().toISOString();
  const transition = applyOutreachMessageAction(message, action.value, updatedAt);
  if (transition.ok === false) {
    return json({
      error: "Could not update the outreach message.",
      status: "transition_error",
      issues: transition.issues,
    }, { status: 409 });
  }

  const persist = options.updateOutreachMessage ?? updateOutreachMessage;
  await persist(repositoryRequest, transition.message);

  return json({
    status: "outreach_message_updated",
    pursuitId: pursuit.id,
    message: transition.message,
  });
}

const OUTREACH_MESSAGE_FEEDBACK_REASONS = new Set<OutreachMessageFeedbackReason>([
  "wrong_skills_title_applied",
  "personal_voice_mismatch",
  "selected_tone_mismatch",
  "awkward_to_read",
  "would_not_send",
  "other",
]);

function parseOutreachMessageFeedback(input: Record<string, unknown> | null) {
  const issues: { field: string; message: string }[] = [];
  const rawReasons = input?.reasonCodes;
  let reasonCodes: OutreachMessageFeedbackReason[] = [];

  if (!Array.isArray(rawReasons) || rawReasons.length === 0) {
    issues.push({ field: "reasonCodes", message: "Select at least one feedback reason." });
  } else {
    const normalizedReasons = rawReasons.map((value) => (
      typeof value === "string" ? value.trim() : value
    ));
    if (normalizedReasons.some((value) => (
      typeof value !== "string" || !OUTREACH_MESSAGE_FEEDBACK_REASONS.has(value as OutreachMessageFeedbackReason)
    ))) {
      issues.push({ field: "reasonCodes", message: "reasonCodes contains an unsupported feedback reason." });
    } else {
      reasonCodes = [...new Set(normalizedReasons)] as OutreachMessageFeedbackReason[];
    }
  }

  const rawNotes = input?.notes;
  let notes: string | undefined;
  if (rawNotes !== undefined && rawNotes !== null && typeof rawNotes !== "string") {
    issues.push({ field: "notes", message: "notes must be a string." });
  } else if (typeof rawNotes === "string") {
    notes = rawNotes.trim() || undefined;
    if (notes && notes.length > 500) {
      issues.push({ field: "notes", message: "notes must be 500 characters or fewer." });
    }
  }

  const rawRevision = input?.expectedMessageRevision;
  const expectedMessageRevision = rawRevision === 0 || rawRevision === 1 ? rawRevision : undefined;
  if (expectedMessageRevision === undefined) {
    issues.push({ field: "expectedMessageRevision", message: "expectedMessageRevision must be 0 or 1." });
  }

  const rawUpdatedAt = input?.expectedMessageUpdatedAt;
  const expectedMessageUpdatedAt = typeof rawUpdatedAt === "string" ? rawUpdatedAt.trim() : "";
  if (!expectedMessageUpdatedAt || Number.isNaN(Date.parse(expectedMessageUpdatedAt))) {
    issues.push({ field: "expectedMessageUpdatedAt", message: "expectedMessageUpdatedAt must be an ISO timestamp." });
  }

  return { issues, reasonCodes, notes, expectedMessageRevision, expectedMessageUpdatedAt };
}

// Feedback is intentionally observational. Saving it snapshots the exact current draft and
// revision without changing the outreach message, pursuit, regeneration allowance, or usage.
export async function handlePublicProfilePursuitOutreachMessageFeedbackRequest(
  request: Request,
  messageId: string,
  options: PublicProfilePursuitsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const trimmedMessageId = messageId?.trim();
  if (!trimmedMessageId) {
    return json({
      error: "Could not save message feedback.",
      status: "validation_error",
      issues: [{ field: "messageId", message: "messageId is required." }],
    }, { status: 400 });
  }

  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = parseOutreachMessageFeedback(input);
  if (parsed.issues.length > 0) {
    return json({
      error: "Could not save message feedback.",
      status: "validation_error",
      issues: parsed.issues,
    }, { status: 400 });
  }

  const loadMessage = options.loadOutreachMessage ?? loadOutreachMessageById;
  const message = await loadMessage(repositoryRequest, trimmedMessageId);
  if (!message) {
    return json({ error: "Outreach message not found.", status: "not_found" }, { status: 404 });
  }

  const loadPursuit = options.loadPursuit ?? loadPursuitByIdForUser;
  const pursuit = await loadPursuit(repositoryRequest, session.userId, message.pursuitId);
  if (!pursuit) {
    return json({ error: "Outreach message not found.", status: "not_found" }, { status: 404 });
  }

  if (
    (message.regenerationCount ?? 0) !== parsed.expectedMessageRevision
    || message.updatedAt !== parsed.expectedMessageUpdatedAt
  ) {
    return json({
      error: "This draft changed after feedback was opened. Return to the message and try again.",
      status: "message_changed",
      saved: false,
    }, { status: 409 });
  }

  const loadGenerationContext = options.loadOutreachGenerationContext
    ?? loadOutreachGenerationContextForMessage;
  let generationContext: OutreachFeedbackGenerationContext | undefined;
  try {
    generationContext = await loadGenerationContext(repositoryRequest, message);
  } catch {
    return json({
      error: "Message feedback could not be saved. Try again.",
      status: "context_unavailable",
      retryable: true,
      saved: false,
    }, { status: 503 });
  }
  generationContext ??= {
    source: "legacy_partial",
    selectedRoleTrackId: message.selectedRoleTrackId,
    selectedResumeId: message.selectedResumeId,
    selectedWorkExampleId: message.selectedWorkExampleId,
    pursuitSelectionSnapshot: pursuit.selectionSnapshot,
  };

  const persist = options.persistOutreachMessageFeedback ?? persistOutreachMessageFeedback;
  let feedback: OutreachMessageFeedback;
  try {
    feedback = await persist(repositoryRequest, {
      outreachMessageId: message.id,
      userId: session.userId,
      reasonCodes: parsed.reasonCodes,
      notes: parsed.notes,
      messageSnapshot: message.message,
      messageRevision: message.regenerationCount ?? 0,
      generationRequestId: message.generationRequestId,
      generationContext,
      updatedAt: options.now?.() ?? new Date().toISOString(),
    });
  } catch {
    return json({
      error: "Message feedback could not be saved. Try again.",
      status: "persistence_failed",
      retryable: true,
      saved: false,
    }, { status: 503 });
  }

  return json({
    status: "message_feedback_saved",
    saved: true,
    feedback,
    context: {
      pursuitId: pursuit.id,
      profileId: pursuit.profileId,
      generationRequestId: message.generationRequestId ?? null,
    },
  });
}

function atomicPersistenceError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("idempotency_conflict") || message.includes("already used for a different")) {
    return json({
      error: "That request key was already used for different changes.",
      status: "idempotency_conflict",
      trackingSaved: false,
      retryable: false,
    }, { status: 409 });
  }
  return json({
    error: fallback,
    status: "persistence_failed",
    trackingSaved: false,
    retryable: true,
  }, { status: 503 });
}

function transactionalSubscriptionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const inactive = message.match(/subscription_inactive:(past_due|canceled)/);
  if (inactive) {
    return subscriptionBlockedResponse({
      status: "subscription_inactive",
      feature: "outreach_message",
      subscriptionStatus: inactive[1] as "past_due" | "canceled",
    });
  }
  const limit = message.match(/(pursuit|outreach_message)_limit_reached:(\d+):(\d+)/);
  if (!limit) return undefined;
  return subscriptionBlockedResponse({
    status: "limit_reached",
    feature: limit[1] as "pursuit" | "outreach_message",
    used: Number.parseInt(limit[2], 10),
    limit: Number.parseInt(limit[3], 10),
    remaining: 0,
  });
}

export async function handlePublicProfilePursuitTrackingRequest(
  request: Request,
  pursuitId: string,
  options: PublicProfilePursuitsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const trimmedPursuitId = pursuitId.trim();
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  const parsedChanges = parsePursuitTrackingChanges(input?.changes);
  const idempotencyKey = parseIdempotencyKey(input?.idempotencyKey);
  const issues = [...parsedChanges.issues];
  if (!trimmedPursuitId) {
    issues.push({ field: "id", message: "id is required." });
  }
  if (!idempotencyKey) {
    issues.push({ field: "idempotencyKey", message: "A non-empty idempotencyKey of at most 200 characters is required." });
  }
  if (issues.length > 0) {
    return json({
      error: "Invalid tracking request.",
      status: "validation_error",
      issues,
    }, { status: 400 });
  }

  const loadPursuit = options.loadPursuit ?? loadPursuitByIdForUser;
  const pursuit = await loadPursuit(repositoryRequest, session.userId, trimmedPursuitId);
  if (!pursuit) {
    return json({ error: "Pursuit not found.", status: "not_found" }, { status: 404 });
  }

  const persist = options.persistTrackingMutation ?? persistPursuitTrackingMutation;
  let committed: PursuitTrackingCommit;
  try {
    committed = await persist(repositoryRequest, {
      userId: session.userId,
      pursuitId: pursuit.id,
      changes: parsedChanges.changes,
      idempotencyKey: idempotencyKey as string,
    });
  } catch (error) {
    return atomicPersistenceError(error, "Tracking could not be saved. Try again.");
  }

  return json({
    status: "tracking_saved",
    replayed: committed.status === "idempotent_replay",
    pursuitId: committed.pursuit.id,
    bucket: pursuitBucket(committed.pursuit),
    trackingStartedAt: committed.pursuit.trackingStartedAt ?? null,
    lastActivityAt: committed.pursuit.lastActivityAt,
    tracking: committed.state,
    history: committed.history,
  });
}

export async function handlePublicProfilePursuitMessageCopyRequest(
  request: Request,
  messageId: string,
  options: PublicProfilePursuitsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const trimmedMessageId = messageId.trim();
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  const idempotencyKey = parseIdempotencyKey(input?.idempotencyKey);
  const issues: { field: string; message: string }[] = [];
  if (!trimmedMessageId) issues.push({ field: "messageId", message: "messageId is required." });
  if (!idempotencyKey) {
    issues.push({ field: "idempotencyKey", message: "A non-empty idempotencyKey of at most 200 characters is required." });
  }
  if (issues.length > 0) {
    return json({
      error: "Invalid message Copy request.",
      status: "validation_error",
      issues,
    }, { status: 400 });
  }

  const loadMessage = options.loadOutreachMessage ?? loadOutreachMessageById;
  const message = await loadMessage(repositoryRequest, trimmedMessageId);
  if (!message) {
    return json({ error: "Outreach message not found.", status: "not_found" }, { status: 404 });
  }
  const loadPursuit = options.loadPursuit ?? loadPursuitByIdForUser;
  const pursuit = await loadPursuit(repositoryRequest, session.userId, message.pursuitId);
  if (!pursuit) {
    return json({ error: "Outreach message not found.", status: "not_found" }, { status: 404 });
  }

  const persist = options.persistMessageCopy ?? persistOutreachMessageCopy;
  let committed: PursuitTrackingCommit;
  try {
    committed = await persist(repositoryRequest, {
      userId: session.userId,
      outreachMessageId: message.id,
      idempotencyKey: idempotencyKey as string,
    });
  } catch (error) {
    return atomicPersistenceError(
      error,
      "The message was copied, but tracking was not saved. Try saving tracking again.",
    );
  }

  return json({
    status: "copy_tracking_saved",
    recorded: committed.status === "committed",
    pursuitId: committed.pursuit.id,
    messageId: message.id,
    bucket: pursuitBucket(committed.pursuit),
    trackingStartedAt: committed.pursuit.trackingStartedAt ?? null,
    lastActivityAt: committed.pursuit.lastActivityAt,
    tracking: committed.state,
    history: committed.history,
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
      message: "action must be one of outreach_sent, applied, responded, interviewing, rejected.",
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

// Testing control (Randall, 2026-07-08): full profile factory reset so onboarding →
// ingest → outreach can be exercised repeatedly on a real account. Allowed for the
// listed accounts ONLY — everyone else gets a 403 regardless of auth state.
const PROFILE_RESET_ALLOWED_EMAILS = new Set(["fransencomesalive@gmail.com"]);

export type PublicProfileResetHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  resetProfile?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
  ) => Promise<{ status: "reset" } | { status: "not_found" }>;
};

export async function handleProfileResetRequest(
  request: Request,
  options: PublicProfileResetHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  if (!session.email || !PROFILE_RESET_ALLOWED_EMAILS.has(session.email.toLowerCase())) {
    return json({ error: "Profile reset is not available for this account.", status: "forbidden" }, { status: 403 });
  }

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const resetProfile = options.resetProfile ?? resetCandidateProfileDataForUser;
  const result = await resetProfile(repositoryRequest, session.userId);
  return json({ status: result.status });
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

export type PublicProfileResumeScanHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  parseResume?: (pdfBase64: string) => Promise<ResumeParseVerdict | undefined>;
};

const RESUME_SCAN_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Scan-and-discard: accept a single PDF, read it into text + a parse verdict via
// Claude, return it, and never store the file. Auth-gated; degrades to the
// paste-the-text fallback (status "model_unavailable") when no model is wired.
export async function handleResumeScanRequest(
  request: Request,
  options: PublicProfileResumeScanHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected a multipart form with a PDF file." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return json({ error: "No résumé file provided." }, { status: 400 });
  }
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return json({
      error: "unsupported_file_type",
      detail: "We can only read PDF résumés. Export or “Save as” a PDF, or paste your résumé text instead.",
    }, { status: 415 });
  }
  if (file.size > RESUME_SCAN_MAX_BYTES) {
    return json({
      error: "file_too_large",
      detail: "That PDF is over 10 MB. Try a smaller export, or paste your résumé text instead.",
    }, { status: 413 });
  }

  const pdfBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const parseResume = options.parseResume ?? ((data: string) => generateResumeParse(data));
  const verdict = await parseResume(pdfBase64);

  if (!verdict) {
    return json({ status: "model_unavailable" });
  }

  return json({
    status: "scanned",
    parsingQuality: verdict.parsingQuality,
    extractedText: verdict.extractedText,
    issue: verdict.issue,
    suggestion: verdict.suggestion,
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

  // Saving a résumé runs the metered highlights pass so Card 1's saved-state note
  // can report the real count. Failure never blocks the save response.
  const deriveHighlightCounts = options.deriveResumeHighlightCounts ?? deriveResumeHighlightCountsForUser;
  const resumeHighlightCounts = await deriveHighlightCounts(repositoryRequest, session.userId, updatedAt)
    .catch(() => undefined);

  return json({
    status: result.status,
    profileId: result.aggregate.profile.id,
    profileStatus: result.profileQuality.status,
    section: result.section,
    profileQuality: profileQualitySummary(result.profileQuality),
    resumeHighlightCounts,
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

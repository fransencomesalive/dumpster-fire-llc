import {
  getPublicAuthSession,
  type PublicAuthSession,
} from "../public-auth/session";
import {
  createPublicProfileRepositoryRequest,
  ensureCandidateProfileAggregate,
  getPublicProfileRepositoryConfig,
  loadCandidateProfileAggregate,
  type PublicProfileRepositoryRequest,
} from "./repository";
import {
  generateOutreachMessageForUser,
  parseOutreachRequest,
  type OutreachGenerationResult,
} from "./outreach-generator";
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

import {
  getPublicAuthSession,
  type PublicAuthSession,
} from "../public-auth/session";
import {
  createPublicProfileRepositoryRequest,
  ensureCandidateProfileAggregate,
  getPublicProfileRepositoryConfig,
  type PublicProfileRepositoryRequest,
} from "./repository";
import {
  regeneratePublicProfileForUser,
  type PublicProfileRegenerationResult,
} from "./service";
import {
  readCommunicationStyleSectionForUser,
  readIdentitySearchSectionForUser,
  readLeadershipProfileSectionForUser,
  readOutreachRulesSectionForUser,
  readProofLibrarySectionForUser,
  readQualityNarrativeSectionForUser,
  readResumeUploadsSectionForUser,
  readRoleTracksSectionForUser,
  readSkillsInventorySectionForUser,
  readWorkHistorySectionForUser,
  readWritingSamplesSectionForUser,
  updateCommunicationStyleSectionForUser,
  updateIdentitySearchSectionForUser,
  updateLeadershipProfileSectionForUser,
  updateOutreachRulesSectionForUser,
  updateProofLibrarySectionForUser,
  updateQualityNarrativeSectionForUser,
  updateResumeUploadsSectionForUser,
  updateRoleTracksSectionForUser,
  updateSkillsInventorySectionForUser,
  updateWorkHistorySectionForUser,
  updateWritingSamplesSectionForUser,
  type PublicProfileCommunicationStyleReadResult,
  type PublicProfileCommunicationStyleUpdateResult,
  type PublicProfileIdentitySearchReadResult,
  type PublicProfileIdentitySearchUpdateResult,
  type PublicProfileLeadershipProfileReadResult,
  type PublicProfileLeadershipProfileUpdateResult,
  type PublicProfileOutreachRulesReadResult,
  type PublicProfileOutreachRulesUpdateResult,
  type PublicProfileProofLibraryReadResult,
  type PublicProfileProofLibraryUpdateResult,
  type PublicProfileQualityNarrativeReadResult,
  type PublicProfileQualityNarrativeUpdateResult,
  type PublicProfileResumeUploadsReadResult,
  type PublicProfileResumeUploadsUpdateResult,
  type PublicProfileRoleTracksReadResult,
  type PublicProfileRoleTracksUpdateResult,
  type PublicProfileSkillsInventoryReadResult,
  type PublicProfileSkillsInventoryUpdateResult,
  type PublicProfileWorkHistoryReadResult,
  type PublicProfileWorkHistoryUpdateResult,
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

export type PublicProfileWorkHistoryHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  readWorkHistory?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    checkedAt: string,
  ) => Promise<PublicProfileWorkHistoryReadResult>;
  updateWorkHistory?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    input: unknown,
    options: {
      updatedAt: string;
    },
  ) => Promise<PublicProfileWorkHistoryUpdateResult>;
};

export type PublicProfileProofLibraryHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  readProofLibrary?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    checkedAt: string,
  ) => Promise<PublicProfileProofLibraryReadResult>;
  updateProofLibrary?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    input: unknown,
    options: {
      updatedAt: string;
    },
  ) => Promise<PublicProfileProofLibraryUpdateResult>;
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

export type PublicProfileCommunicationStyleHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  readCommunicationStyle?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    checkedAt: string,
  ) => Promise<PublicProfileCommunicationStyleReadResult>;
  updateCommunicationStyle?: (
    request: PublicProfileRepositoryRequest,
    userId: string,
    input: unknown,
    options: {
      updatedAt: string;
    },
  ) => Promise<PublicProfileCommunicationStyleUpdateResult>;
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

export async function handleWorkHistorySectionGetRequest(
  request: Request,
  options: PublicProfileWorkHistoryHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const checkedAt = options.now?.() ?? new Date().toISOString();
  const readWorkHistory = options.readWorkHistory ?? readWorkHistorySectionForUser;
  const result = await readWorkHistory(repositoryRequest, session.userId, checkedAt);

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

export async function handleWorkHistorySectionPatchRequest(
  request: Request,
  options: PublicProfileWorkHistoryHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null);
  const updatedAt = options.now?.() ?? new Date().toISOString();
  const updateWorkHistory = options.updateWorkHistory ?? updateWorkHistorySectionForUser;
  const result = await updateWorkHistory(repositoryRequest, session.userId, input, { updatedAt });

  if (result.status === "validation_error") {
    return json({
      error: "Invalid Work History update.",
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

export async function handleProofLibrarySectionGetRequest(
  request: Request,
  options: PublicProfileProofLibraryHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const checkedAt = options.now?.() ?? new Date().toISOString();
  const readProofLibrary = options.readProofLibrary ?? readProofLibrarySectionForUser;
  const result = await readProofLibrary(repositoryRequest, session.userId, checkedAt);

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

export async function handleProofLibrarySectionPatchRequest(
  request: Request,
  options: PublicProfileProofLibraryHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null);
  const updatedAt = options.now?.() ?? new Date().toISOString();
  const updateProofLibrary = options.updateProofLibrary ?? updateProofLibrarySectionForUser;
  const result = await updateProofLibrary(repositoryRequest, session.userId, input, { updatedAt });

  if (result.status === "validation_error") {
    return json({
      error: "Invalid Proof Library update.",
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

export async function handleCommunicationStyleSectionGetRequest(
  request: Request,
  options: PublicProfileCommunicationStyleHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const checkedAt = options.now?.() ?? new Date().toISOString();
  const readCommunicationStyle = options.readCommunicationStyle ?? readCommunicationStyleSectionForUser;
  const result = await readCommunicationStyle(repositoryRequest, session.userId, checkedAt);

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

export async function handleCommunicationStyleSectionPatchRequest(
  request: Request,
  options: PublicProfileCommunicationStyleHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const input = await request.json().catch(() => null);
  const updatedAt = options.now?.() ?? new Date().toISOString();
  const updateCommunicationStyle = options.updateCommunicationStyle ?? updateCommunicationStyleSectionForUser;
  const result = await updateCommunicationStyle(repositoryRequest, session.userId, input, { updatedAt });

  if (result.status === "validation_error") {
    return json({
      error: "Invalid Communication Style update.",
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

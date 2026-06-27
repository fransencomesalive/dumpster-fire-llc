import {
  regenerateCandidateProfileArtifacts,
  type CandidateProfileGenerationOptions,
  type CandidateProfileGenerationResult,
} from "./profile-generation";
import { evaluateCandidateProfileQuality } from "./profile-quality";
import {
  loadCandidateProfileAggregate,
  persistCandidateProfileGeneration,
  type PublicProfileRepositoryRequest,
} from "./repository";
import { generateVoiceProfileBlock } from "./voice-fingerprint";
import type { CandidateProfileAggregate, ProfileQuality } from "./types";

export type PublicProfileServiceDependencies = {
  loadAggregate: (userId: string) => Promise<CandidateProfileAggregate | undefined>;
  persistGeneration: (generation: CandidateProfileGenerationResult) => Promise<void>;
  // Optional voice-fingerprint pre-pass. Returns the distilled Voice Profile
  // block (or undefined to fall back to raw inputs / when no model is wired).
  generateVoiceProfileBlock?: (aggregate: CandidateProfileAggregate) => Promise<string | undefined>;
};

export type PublicProfileRegenerationResult =
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "incomplete";
      userId: string;
      aggregate: CandidateProfileAggregate;
      profileQuality: ProfileQuality;
    }
  | {
      status: "regenerated";
      userId: string;
      generation: CandidateProfileGenerationResult;
    };

export async function regenerateLoadedPublicProfileForUser(
  dependencies: PublicProfileServiceDependencies,
  userId: string,
  options: CandidateProfileGenerationOptions = {},
): Promise<PublicProfileRegenerationResult> {
  const aggregate = await dependencies.loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const profileQuality = evaluateCandidateProfileQuality(aggregate, generatedAt);
  if (profileQuality.status === "incomplete") {
    return {
      status: "incomplete",
      userId,
      aggregate,
      profileQuality,
    };
  }

  const voiceProfileBlock = options.voiceProfileBlock
    ?? (dependencies.generateVoiceProfileBlock ? await dependencies.generateVoiceProfileBlock(aggregate) : undefined);
  const generation = regenerateCandidateProfileArtifacts(aggregate, {
    ...options,
    generatedAt,
    voiceProfileBlock,
  });
  await dependencies.persistGeneration(generation);

  return {
    status: "regenerated",
    userId,
    generation,
  };
}

export async function regeneratePublicProfileForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  options: CandidateProfileGenerationOptions = {},
): Promise<PublicProfileRegenerationResult> {
  return regenerateLoadedPublicProfileForUser({
    loadAggregate: (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    persistGeneration: (generation) => persistCandidateProfileGeneration(request, generation),
    generateVoiceProfileBlock: (aggregate) => generateVoiceProfileBlock(aggregate),
  }, userId, options);
}

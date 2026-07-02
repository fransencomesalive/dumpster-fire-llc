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
import { loadUsageLedgerForUser } from "./subscription/repository";
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

// Voice-fingerprint model calls are capped per month (disclosed in the profile
// setup flow + T&C). At the cap, profile.md still rebuilds and reuses the most
// recent fingerprint block; the save itself is never blocked.
const VOICE_FINGERPRINT_MONTHLY_CAP = 3;

function previousVoiceProfileBlock(markdown: string | undefined) {
  if (!markdown) return undefined;
  const marker = "**Voice fingerprint (write like this):**";
  const start = markdown.indexOf(marker);
  if (start === -1) return undefined;
  const rest = markdown.slice(start);
  const end = rest.indexOf("\n## ");
  const block = (end === -1 ? rest : rest.slice(0, end)).trim();
  return block || undefined;
}

async function generateCappedVoiceProfileBlock(
  request: PublicProfileRepositoryRequest,
  userId: string,
  aggregate: CandidateProfileAggregate,
  generatedAt: string,
): Promise<string | undefined> {
  let used = 0;
  try {
    const entries = await loadUsageLedgerForUser(request, userId, { at: generatedAt });
    used = entries
      .filter((entry) => entry.usageType === "voice_fingerprint")
      .reduce((sum, entry) => sum + entry.quantity, 0);
  } catch {
    used = 0;
  }
  if (used >= VOICE_FINGERPRINT_MONTHLY_CAP) {
    return previousVoiceProfileBlock(aggregate.profile.generatedMarkdown);
  }

  const block = await generateVoiceProfileBlock(aggregate);
  if (block) {
    await request("usage_ledger", {
      method: "POST",
      body: { user_id: userId, usage_type: "voice_fingerprint", quantity: 1 },
    }).catch(() => undefined);
    return block;
  }
  return previousVoiceProfileBlock(aggregate.profile.generatedMarkdown);
}

export async function regeneratePublicProfileForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  options: CandidateProfileGenerationOptions = {},
): Promise<PublicProfileRegenerationResult> {
  return regenerateLoadedPublicProfileForUser({
    loadAggregate: (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    persistGeneration: (generation) => persistCandidateProfileGeneration(request, generation),
    generateVoiceProfileBlock: (aggregate) =>
      generateCappedVoiceProfileBlock(request, userId, aggregate, options.generatedAt ?? new Date().toISOString()),
  }, userId, options);
}

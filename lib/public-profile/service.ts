import {
  regenerateCandidateProfileArtifacts,
  type CandidateProfileGenerationOptions,
  type CandidateProfileGenerationResult,
} from "./profile-generation";
import { evaluateCandidateProfileQuality } from "./profile-quality";
import {
  loadCandidateProfileAggregate,
  persistCandidateProfileGeneration,
  persistDerivedResumeHighlights,
  type PublicProfileRepositoryRequest,
} from "./repository";
import { generateVoiceProfileBlock } from "./voice-fingerprint";
import { deriveResumeHighlightsForAggregate } from "./resume-highlights";
import { loadUsageLedgerForUser } from "./subscription/repository";
import type { CandidateProfileAggregate, ProfileQuality } from "./types";

export type PublicProfileServiceDependencies = {
  loadAggregate: (userId: string) => Promise<CandidateProfileAggregate | undefined>;
  persistGeneration: (generation: CandidateProfileGenerationResult) => Promise<void>;
  // Optional voice-fingerprint pre-pass. Returns the distilled Voice Profile
  // block (or undefined to fall back to raw inputs / when no model is wired).
  generateVoiceProfileBlock?: (aggregate: CandidateProfileAggregate) => Promise<string | undefined>;
  // Optional résumé-highlights pre-pass. Returns derived highlights keyed by
  // résumé id (or undefined to reuse the cached highlights already on the résumés).
  deriveResumeHighlights?: (aggregate: CandidateProfileAggregate) => Promise<Map<string, string[]> | undefined>;
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
  const resumeHighlights = options.resumeHighlights
    ?? (dependencies.deriveResumeHighlights ? await dependencies.deriveResumeHighlights(aggregate) : undefined);
  const generation = regenerateCandidateProfileArtifacts(aggregate, {
    ...options,
    generatedAt,
    voiceProfileBlock,
    resumeHighlights,
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

// Résumé-highlights derivation is capped per month, same as the voice fingerprint.
// At the cap, profile.md rebuilds and reuses the highlights already cached on each
// résumé; the save is never blocked. Under the cap, the pass runs, records one
// usage entry, and persists the fresh highlights back to the résumé cache.
const RESUME_HIGHLIGHTS_MONTHLY_CAP = 3;

async function generateCappedResumeHighlights(
  request: PublicProfileRepositoryRequest,
  userId: string,
  aggregate: CandidateProfileAggregate,
  generatedAt: string,
): Promise<Map<string, string[]> | undefined> {
  let used = 0;
  try {
    const entries = await loadUsageLedgerForUser(request, userId, { at: generatedAt });
    used = entries
      .filter((entry) => entry.usageType === "resume_highlights")
      .reduce((sum, entry) => sum + entry.quantity, 0);
  } catch {
    used = 0;
  }
  if (used >= RESUME_HIGHLIGHTS_MONTHLY_CAP) return undefined;

  const derived = await deriveResumeHighlightsForAggregate(aggregate);
  if (!derived) return undefined;

  await request("usage_ledger", {
    method: "POST",
    body: { user_id: userId, usage_type: "resume_highlights", quantity: 1 },
  }).catch(() => undefined);
  await persistDerivedResumeHighlights(
    request,
    Array.from(derived.entries()).map(([id, highlights]) => ({ id, highlights, updatedAt: generatedAt })),
  ).catch(() => undefined);
  return derived;
}

// Card 1's saved-state note reports how many highlights the résumé read pulled
// ("Read — pulled 5 highlights"). Runs the same capped pass profile.md uses (one
// usage entry, fresh highlights persisted to the résumé cache); at the cap or with
// no model wired it falls back to each résumé's cached highlights, so the count is
// real or absent — never invented.
export async function deriveResumeHighlightCountsForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  at = new Date().toISOString(),
): Promise<Record<string, number> | undefined> {
  const aggregate = await loadCandidateProfileAggregate(request, userId);
  if (!aggregate) return undefined;
  const derived = await generateCappedResumeHighlights(request, userId, aggregate, at);
  const counts: Record<string, number> = {};
  for (const resume of aggregate.resumes) {
    counts[resume.id] = derived?.get(resume.id)?.length ?? resume.highlights.length;
  }
  return counts;
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
    deriveResumeHighlights: (aggregate) =>
      generateCappedResumeHighlights(request, userId, aggregate, options.generatedAt ?? new Date().toISOString()),
  }, userId, options);
}

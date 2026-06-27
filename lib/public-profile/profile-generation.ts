import { generateCandidateProfileMarkdown } from "./profile-markdown";
import { evaluateCandidateProfileQuality } from "./profile-quality";
import type {
  CandidateProfileAggregate,
  CandidateProfileRecord,
  GeneratedMarkdown,
  ProfileQuality,
  ProfileVersionDraft,
} from "./types";

export type CandidateProfileGenerationOptions = {
  generatedAt?: string;
  nextVersion?: number;
  changeSummary?: string;
  // Distilled voice fingerprint block (Phase C); rendered at the top of the
  // Voice Profile section of profile.md when present.
  voiceProfileBlock?: string;
};

export type CandidateProfilePersistenceRows = {
  candidateProfile: {
    id: string;
    status: CandidateProfileRecord["status"];
    version: number;
    generated_markdown: string;
    markdown_generated_at: string;
    updated_at: string;
  };
  profileQuality: {
    profile_id: string;
    status: ProfileQuality["status"];
    incomplete_reasons: string[];
    weak_fields: string[];
    complete_fields: string[];
    weak_response_count: number;
    last_checked_at: string;
  };
  profileVersion: {
    profile_id: string;
    version: number;
    generated_markdown: string;
    change_summary: string;
    created_at: string;
  };
};

export type CandidateProfileGenerationResult = {
  aggregate: CandidateProfileAggregate;
  generatedMarkdown: GeneratedMarkdown;
  profileQuality: ProfileQuality;
  profileVersion: ProfileVersionDraft;
  persistenceRows: CandidateProfilePersistenceRows;
};

export function regenerateCandidateProfileArtifacts(
  aggregate: CandidateProfileAggregate,
  options: CandidateProfileGenerationOptions = {},
): CandidateProfileGenerationResult {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const nextVersion = options.nextVersion ?? aggregate.profile.version + 1;
  const changeSummary = options.changeSummary ?? "Profile regenerated from structured data.";
  const profileForEvaluation: CandidateProfileRecord = {
    ...aggregate.profile,
    version: nextVersion,
  };
  const evaluationAggregate: CandidateProfileAggregate = {
    ...aggregate,
    profile: profileForEvaluation,
  };
  const profileQuality = evaluateCandidateProfileQuality(evaluationAggregate, generatedAt);
  const profileForMarkdown: CandidateProfileRecord = {
    ...profileForEvaluation,
    status: profileQuality.status,
  };
  const markdownAggregate: CandidateProfileAggregate = {
    ...evaluationAggregate,
    profile: profileForMarkdown,
    profileQuality,
  };
  const generatedMarkdown = generateCandidateProfileMarkdown(markdownAggregate, generatedAt, options.voiceProfileBlock);
  const profile: CandidateProfileRecord = {
    ...profileForMarkdown,
    generatedMarkdown: generatedMarkdown.markdown,
    markdownGeneratedAt: generatedMarkdown.generatedAt,
    updatedAt: generatedAt,
  };
  const profileVersion: ProfileVersionDraft = {
    profileId: profile.id,
    version: profile.version,
    generatedMarkdown: generatedMarkdown.markdown,
    changeSummary,
    createdAt: generatedAt,
  };
  const nextAggregate: CandidateProfileAggregate = {
    ...markdownAggregate,
    profile,
    profileQuality,
  };

  return {
    aggregate: nextAggregate,
    generatedMarkdown,
    profileQuality,
    profileVersion,
    persistenceRows: {
      candidateProfile: {
        id: profile.id,
        status: profile.status,
        version: profile.version,
        generated_markdown: profile.generatedMarkdown,
        markdown_generated_at: profile.markdownGeneratedAt ?? generatedAt,
        updated_at: profile.updatedAt,
      },
      profileQuality: {
        profile_id: profileQuality.profileId,
        status: profileQuality.status,
        incomplete_reasons: profileQuality.incompleteReasons,
        weak_fields: profileQuality.weakFields,
        complete_fields: profileQuality.completeFields,
        weak_response_count: profileQuality.weakResponseCount,
        last_checked_at: profileQuality.lastCheckedAt,
      },
      profileVersion: {
        profile_id: profileVersion.profileId,
        version: profileVersion.version,
        generated_markdown: profileVersion.generatedMarkdown,
        change_summary: profileVersion.changeSummary,
        created_at: profileVersion.createdAt,
      },
    },
  };
}

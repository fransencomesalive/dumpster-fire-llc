import { randomUUID } from "node:crypto";
import type { PublicProfileRepositoryRequest } from "../public-profile/repository";
import { createBestEffortProviderUsageSink } from "../costs/provider-usage";
import type { ParsedPosting } from "./sources/parse-posting";
import {
  extractPostingSectionsDetailedLLM,
  type PostingExtractInput,
  type PostingModelCall,
  type PostingSectionExtractionResult,
} from "./sources/llm-extract-posting";

export type PostingRefinementClaim = {
  id: string;
  title: string;
  companyName: string;
  description: string;
  responsibilities: string[];
  requiredExperience: string[];
  attemptToken: string;
  attemptContentHash: string;
  attemptCount: number;
};

export type PostingRefinementFinish = {
  applied: boolean;
  state: "pending" | "processing" | "retryable" | "partial" | "complete" | "exhausted" | "missing";
  outcome?: string;
};

export type PostingRefinementResult = {
  ranAt: string;
  processed: number;
  updated: number;
  completed: number;
  retryable: number;
  exhausted: number;
  stale: number;
};

export type PostingRefinementOptions = {
  claimJob?: (
    request: PublicProfileRepositoryRequest,
    now: string,
  ) => Promise<PostingRefinementClaim | undefined>;
  finishJob?: (
    request: PublicProfileRepositoryRequest,
    claim: PostingRefinementClaim,
    extraction: PostingSectionExtractionResult | { sections: ParsedPosting; outcome: "error" },
    now: string,
  ) => Promise<PostingRefinementFinish>;
  extract?: (input: PostingExtractInput) => Promise<ParsedPosting>;
  extractDetailed?: (
    input: PostingExtractInput,
  ) => Promise<PostingSectionExtractionResult>;
  callModel?: PostingModelCall;
  now?: () => string;
  limit?: number;
};

type ClaimRow = {
  id: string;
  title: string;
  company_name: string;
  description: string;
  responsibilities: string[] | null;
  required_experience: string[] | null;
  attempt_token: string;
  attempt_content_hash: string;
  attempt_count: number;
};

type FinishRow = {
  applied: boolean;
  refinement_state: PostingRefinementFinish["state"];
  refinement_outcome: string | null;
};

const DEFAULT_LIMIT = 25;

async function defaultClaimJob(
  request: PublicProfileRepositoryRequest,
  now: string,
): Promise<PostingRefinementClaim | undefined> {
  const rows = await request<ClaimRow[]>("rpc/claim_posting_refinement", {
    method: "POST",
    body: { p_now: now },
  });
  const row = rows[0];
  if (!row) return undefined;
  return {
    id: row.id,
    title: row.title,
    companyName: row.company_name,
    description: row.description,
    responsibilities: row.responsibilities ?? [],
    requiredExperience: row.required_experience ?? [],
    attemptToken: row.attempt_token,
    attemptContentHash: row.attempt_content_hash,
    attemptCount: row.attempt_count,
  };
}

async function defaultFinishJob(
  request: PublicProfileRepositoryRequest,
  claim: PostingRefinementClaim,
  extraction: PostingSectionExtractionResult | { sections: ParsedPosting; outcome: "error" },
  now: string,
): Promise<PostingRefinementFinish> {
  const rows = await request<FinishRow[]>("rpc/finish_posting_refinement", {
    method: "POST",
    body: {
      p_job_id: claim.id,
      p_attempt_token: claim.attemptToken,
      p_attempt_content_hash: claim.attemptContentHash,
      p_outcome: extraction.outcome,
      p_responsibilities: extraction.sections.responsibilities,
      p_required_experience: extraction.sections.requiredExperience,
      p_now: now,
    },
  });
  const row = rows[0];
  return row
    ? {
        applied: row.applied,
        state: row.refinement_state,
        outcome: row.refinement_outcome ?? undefined,
      }
    : { applied: false, state: "missing" };
}

function outcomeForSections(sections: ParsedPosting): PostingSectionExtractionResult {
  const outcome = sections.responsibilities.length > 0
    && sections.requiredExperience.length > 0
    ? "complete"
    : sections.responsibilities.length > 0
      || sections.requiredExperience.length > 0
      ? "partial"
      : "no_fill";
  return { sections, outcome };
}

export async function runPostingRefinement(
  request: PublicProfileRepositoryRequest,
  options: PostingRefinementOptions = {},
): Promise<PostingRefinementResult> {
  const ranAt = options.now?.() ?? new Date().toISOString();
  const limit = options.limit ?? DEFAULT_LIMIT;
  const claimJob = options.claimJob ?? defaultClaimJob;
  const finishJob = options.finishJob ?? defaultFinishJob;
  const requestCorrelationId = randomUUID();
  const providerUsageSink = createBestEffortProviderUsageSink(request);
  const result: PostingRefinementResult = {
    ranAt,
    processed: 0,
    updated: 0,
    completed: 0,
    retryable: 0,
    exhausted: 0,
    stale: 0,
  };

  for (let index = 0; index < limit; index += 1) {
    const claim = await claimJob(request, ranAt);
    if (!claim) break;
    result.processed += 1;

    const input = {
      title: claim.title,
      companyName: claim.companyName,
      description: claim.description,
    };
    let extraction:
      | PostingSectionExtractionResult
      | { sections: ParsedPosting; outcome: "error" };
    try {
      extraction = options.extractDetailed
        ? await options.extractDetailed(input)
        : options.extract
          ? outcomeForSections(await options.extract(input))
          : await extractPostingSectionsDetailedLLM(input, {
              callModel: options.callModel,
              providerUsage: {
                sink: providerUsageSink,
                jobId: claim.id,
                requestCorrelationId,
              },
            });
    } catch {
      extraction = {
        sections: { responsibilities: [], requiredExperience: [] },
        outcome: "error",
      };
    }

    const finish = await finishJob(request, claim, extraction, ranAt);
    if (!finish.applied) {
      result.stale += 1;
      continue;
    }
    const suppliedNewSections =
      (claim.responsibilities.length === 0
        && extraction.sections.responsibilities.length > 0)
      || (claim.requiredExperience.length === 0
        && extraction.sections.requiredExperience.length > 0);
    if (suppliedNewSections) result.updated += 1;
    if (finish.state === "complete") result.completed += 1;
    if (finish.state === "retryable") result.retryable += 1;
    if (finish.state === "exhausted") result.exhausted += 1;
  }

  return result;
}

import assert from "node:assert/strict";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";
import {
  runPostingRefinement,
  type PostingRefinementClaim,
  type PostingRefinementFinish,
} from "../lib/scan/refine-postings";

const now = "2026-07-24T12:00:00.000Z";

function claim(id: string, overrides: Partial<PostingRefinementClaim> = {}): PostingRefinementClaim {
  return {
    id,
    title: "Producer",
    companyName: "Studio X",
    description: "Lead useful delivery.",
    responsibilities: [],
    requiredExperience: [],
    attemptToken: `token-${id}`,
    attemptContentHash: "a".repeat(64),
    attemptCount: 1,
    ...overrides,
  };
}

const unusedRequest: PublicProfileRepositoryRequest = async <T>() => [] as T;

async function main() {
  // A complete result is finished once and counted as an update.
  {
    const claims = [claim("job-1")];
    const finishes: Array<{ claim: PostingRefinementClaim; outcome: string }> = [];
    const result = await runPostingRefinement(unusedRequest, {
      now: () => now,
      claimJob: async () => claims.shift(),
      extract: async () => ({
        responsibilities: ["Lead delivery"],
        requiredExperience: ["Five years"],
      }),
      finishJob: async (_request, claimed, extraction) => {
        finishes.push({ claim: claimed, outcome: extraction.outcome });
        return { applied: true, state: "complete", outcome: extraction.outcome };
      },
    });
    assert.deepEqual(result, {
      ranAt: now,
      processed: 1,
      updated: 1,
      completed: 1,
      retryable: 0,
      exhausted: 0,
      stale: 0,
    });
    assert.equal(finishes[0]?.claim.attemptToken, "token-job-1");
    assert.equal(finishes[0]?.outcome, "complete");
  }

  // Provider failure is recorded as an error and does not abort the next claim.
  {
    const claims = [claim("job-error"), claim("job-after-error")];
    const outcomes: string[] = [];
    const result = await runPostingRefinement(unusedRequest, {
      now: () => now,
      claimJob: async () => claims.shift(),
      extractDetailed: async (input) => {
        if (input.title === "Producer" && outcomes.length === 0) {
          throw new Error("provider unavailable");
        }
        return {
          sections: { responsibilities: [], requiredExperience: [] },
          outcome: "unavailable",
        };
      },
      finishJob: async (_request, _claim, extraction) => {
        outcomes.push(extraction.outcome);
        return { applied: true, state: "retryable", outcome: extraction.outcome };
      },
    });
    assert.deepEqual(outcomes, ["error", "unavailable"]);
    assert.equal(result.processed, 2);
    assert.equal(result.retryable, 2);
    assert.equal(result.updated, 0);
  }

  // A stale compare-and-swap finish never counts as an update.
  {
    const claims = [claim("job-stale")];
    const result = await runPostingRefinement(unusedRequest, {
      now: () => now,
      claimJob: async () => claims.shift(),
      extract: async () => ({
        responsibilities: ["Useful"],
        requiredExperience: ["Useful"],
      }),
      finishJob: async (): Promise<PostingRefinementFinish> => ({
        applied: false,
        state: "pending",
      }),
    });
    assert.equal(result.stale, 1);
    assert.equal(result.updated, 0);
  }

  // The production path calls one claim RPC at a time and forwards its token/hash
  // to the finish RPC without broad jobs reads or patches.
  {
    const calls: Array<{ resource: string; body: unknown }> = [];
    let claimCount = 0;
    const request: PublicProfileRepositoryRequest = async <T>(
      resource: string,
      options: Parameters<PublicProfileRepositoryRequest>[1],
    ) => {
      calls.push({ resource, body: options.body });
      if (resource === "rpc/claim_posting_refinement") {
        claimCount += 1;
        return (claimCount === 1
          ? [{
              id: "job-rpc",
              title: "PM",
              company_name: "Co",
              description: "Description",
              responsibilities: [],
              required_experience: [],
              attempt_token: "rpc-token",
              attempt_content_hash: "b".repeat(64),
              attempt_count: 2,
            }]
          : []) as T;
      }
      if (resource === "rpc/finish_posting_refinement") {
        return [{
          applied: true,
          refinement_state: "partial",
          refinement_outcome: "partial",
        }] as T;
      }
      throw new Error(`Unexpected resource: ${resource}`);
    };
    const result = await runPostingRefinement(request, {
      now: () => now,
      extractDetailed: async () => ({
        sections: { responsibilities: ["Own roadmap"], requiredExperience: [] },
        outcome: "partial",
      }),
    });
    assert.equal(result.processed, 1);
    assert.equal(result.updated, 1);
    assert.deepEqual(calls.map((entry) => entry.resource), [
      "rpc/claim_posting_refinement",
      "rpc/finish_posting_refinement",
      "rpc/claim_posting_refinement",
    ]);
    const finishBody = calls[1]?.body as Record<string, unknown>;
    assert.equal(finishBody.p_attempt_token, "rpc-token");
    assert.equal(finishBody.p_attempt_content_hash, "b".repeat(64));
    assert.equal(finishBody.p_outcome, "partial");
  }

  console.log("refine postings: all assertions passed");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

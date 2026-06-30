import assert from "node:assert/strict";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";
import { runPostingRefinement, type JobNeedingSections } from "../lib/scan/refine-postings";

const now = "2026-06-30T12:00:00.000Z";

type Call = { table: string; method: string; query?: string; body: unknown };

function recordingRequest(): { request: PublicProfileRepositoryRequest; calls: Call[] } {
  const calls: Call[] = [];
  const request: PublicProfileRepositoryRequest = async <T>(
    table: string,
    options: Parameters<PublicProfileRepositoryRequest>[1],
  ) => {
    calls.push({ table, method: options.method ?? "GET", query: options.query, body: options.body });
    return [] as T;
  };
  return { request, calls };
}

async function main() {
  // Both buckets empty -> LLM fills both; PATCH written.
  {
    const { request, calls } = recordingRequest();
    const jobs: JobNeedingSections[] = [{
      id: "job-1", title: "Producer", company_name: "Studio X",
      description: "blurb", responsibilities: [], required_experience: [],
    }];
    const result = await runPostingRefinement(request, {
      now: () => now,
      loadJobs: async () => jobs,
      extract: async () => ({ responsibilities: ["Lead delivery"], requiredExperience: ["5 years"] }),
    });
    assert.equal(result.processed, 1);
    assert.equal(result.updated, 1);
    const patch = calls.find((call) => call.table === "jobs" && call.method === "PATCH");
    assert.ok(patch);
    assert.equal(patch?.query, "?id=eq.job-1");
    assert.deepEqual(patch?.body, { responsibilities: ["Lead delivery"], required_experience: ["5 years"], updated_at: now });
  }

  // Only required_experience empty -> keep existing responsibilities, fill only required.
  {
    const { request, calls } = recordingRequest();
    const jobs: JobNeedingSections[] = [{
      id: "job-2", title: "PM", company_name: "Co",
      description: "blurb", responsibilities: ["Own the roadmap"], required_experience: [],
    }];
    await runPostingRefinement(request, {
      now: () => now,
      loadJobs: async () => jobs,
      extract: async () => ({ responsibilities: ["SHOULD NOT REPLACE"], requiredExperience: ["7 years PM"] }),
    });
    const patch = calls.find((call) => call.table === "jobs" && call.method === "PATCH");
    assert.deepEqual((patch?.body as Record<string, unknown>).responsibilities, ["Own the roadmap"]);
    assert.deepEqual((patch?.body as Record<string, unknown>).required_experience, ["7 years PM"]);
  }

  // LLM returns nothing -> no PATCH, not counted as updated.
  {
    const { request, calls } = recordingRequest();
    const jobs: JobNeedingSections[] = [{
      id: "job-3", title: "x", company_name: "y", description: "z", responsibilities: [], required_experience: [],
    }];
    const result = await runPostingRefinement(request, {
      now: () => now,
      loadJobs: async () => jobs,
      extract: async () => ({ responsibilities: [], requiredExperience: [] }),
    });
    assert.equal(result.processed, 1);
    assert.equal(result.updated, 0);
    assert.equal(calls.some((call) => call.method === "PATCH"), false);
  }

  // Empty load -> no-op.
  {
    const { request, calls } = recordingRequest();
    const result = await runPostingRefinement(request, { now: () => now, loadJobs: async () => [], extract: async () => ({ responsibilities: [], requiredExperience: [] }) });
    assert.equal(result.processed, 0);
    assert.equal(result.updated, 0);
    assert.equal(calls.length, 0);
  }

  console.log("refine postings: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

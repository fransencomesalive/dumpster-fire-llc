import assert from "node:assert/strict";
import {
  handlePublicProfilePursuitOutreachRequest,
  isProfileStale,
} from "../lib/public-profile/api";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";
import type { CandidateProfileAggregate } from "../lib/public-profile/types";
import type { PublicProfileRegenerationResult } from "../lib/public-profile/service";
import type {
  HumanPathContactSuggestion,
  Pursuit,
} from "../lib/public-profile/pursuits/types";
import type { PublicJobRecord } from "../lib/public-jobs/types";
import type { SubscriptionContext } from "../lib/public-profile/subscription/types";
import { completeCandidateProfileAggregate } from "./fixtures/public-profile";

const now = "2026-07-06T16:00:00.000Z";
const later = "2026-07-06T18:00:00.000Z";
const staleMarkdown = "generated markdown"; // what the fixture ships as the last-generated md
const freshMarkdown = "FRESH regenerated markdown";

const repositoryRequest: PublicProfileRepositoryRequest = async () => {
  throw new Error("repository should not be called by mocked handlers");
};

function authed() {
  return { status: "authenticated" as const, userId: "user-1" };
}

// ---- Unit: isProfileStale -------------------------------------------------
assert.equal(
  isProfileStale({ updatedAt: now }),
  true,
  "a profile that was never generated is stale",
);
assert.equal(
  isProfileStale({ updatedAt: later, markdownGeneratedAt: now }),
  true,
  "edited after last generation is stale",
);
assert.equal(
  isProfileStale({ updatedAt: now, markdownGeneratedAt: now }),
  false,
  "generated at the same instant as the last edit is fresh",
);
assert.equal(
  isProfileStale({ updatedAt: now, markdownGeneratedAt: later }),
  false,
  "generated after the last edit is fresh",
);
assert.equal(
  isProfileStale({ updatedAt: "not-a-date", markdownGeneratedAt: now }),
  true,
  "unparseable timestamps are treated as stale (defensive)",
);

// ---- Integration: outreach lazily regenerates a stale profile -------------
function pursuit(): Pursuit {
  return {
    id: "pursuit-1",
    userId: "user-1",
    profileId: "profile-1",
    jobId: "job-1",
    selectedRoleTrackId: "track-1",
    selectedResumeId: "resume-1",
    selectedWorkExampleId: "example-1",
    status: "outreach_ready",
    risks: [],
    recommendedWorkExampleIds: [],
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function publicJob(): PublicJobRecord {
  return {
    id: "job-1",
    source: "fixture",
    sourceUrl: "https://jobs.example/1",
    companyName: "Useful Studio",
    title: "Program Director",
    description: "Lead stakeholder alignment.",
    scrapedAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    saved: false,
    responsibilities: [],
    requiredExperience: [],
  };
}

function contact(): HumanPathContactSuggestion {
  return {
    id: "contact-1",
    name: "Dana Lee",
    title: "VP Product",
    companyName: "Useful Studio",
    contactType: "likely_hiring_manager",
    confidence: "high",
    relevanceReason: "Owns the program area.",
    roleConnection: "Likely sponsor.",
    verificationNotes: [],
    selectedForOutreach: true,
    createdAt: now,
    updatedAt: now,
  };
}

function subscription(): SubscriptionContext {
  return {
    planName: "premium",
    status: "active",
    currentPeriodStart: "2026-07-01T00:00:00.000Z",
    currentPeriodEnd: "2026-08-01T00:00:00.000Z",
  };
}

function outreachRequest() {
  return new Request("https://app.example/api/public-profile/pursuits/outreach", {
    method: "POST",
    body: JSON.stringify({ pursuitId: "pursuit-1" }),
  });
}

type OutreachDeps = {
  aggregate: CandidateProfileAggregate;
  regenerateSpy: { calls: number };
  capturedMarkdown: { value?: string };
};

function outreachOptions({ aggregate, regenerateSpy, capturedMarkdown }: OutreachDeps) {
  return {
    now: () => later,
    getSession: async () => authed(),
    repositoryRequest,
    loadAggregate: async () => aggregate,
    loadInitialOutreachCommit: async () => undefined,
    regenerateProfile: async () => {
      regenerateSpy.calls += 1;
      const fresh = completeCandidateProfileAggregate(now);
      fresh.profile.generatedMarkdown = freshMarkdown;
      fresh.profile.markdownGeneratedAt = later;
      fresh.profile.updatedAt = later;
      return {
        status: "regenerated",
        userId: "user-1",
        generation: { aggregate: fresh },
      } as unknown as PublicProfileRegenerationResult;
    },
    loadPursuit: async () => pursuit(),
    loadJob: async () => publicJob(),
    loadOutreachMessages: async () => [],
    loadContactSuggestions: async () => [contact()],
    loadSubscriptionContext: async () => subscription(),
    loadUsageEntries: async () => [],
    generateOutreachForContact: async (input: { profileMarkdown: string }) => {
      capturedMarkdown.value = input.profileMarkdown;
      return { message: "Hi Dana, quick note.", insertedExample: null };
    },
    persistOutreach: async () => {},
  };
}

async function main() {
  // Stale profile: edited (updatedAt=later) after last generation (markdownGeneratedAt=now).
  {
    const aggregate = completeCandidateProfileAggregate(now);
    aggregate.profile.updatedAt = later;
    aggregate.profile.markdownGeneratedAt = now;
    const regenerateSpy = { calls: 0 };
    const capturedMarkdown: { value?: string } = {};
    const response = await handlePublicProfilePursuitOutreachRequest(
      outreachRequest(),
      outreachOptions({ aggregate, regenerateSpy, capturedMarkdown }),
    );
    assert.equal(response.status, 200);
    assert.equal(regenerateSpy.calls, 1, "a stale profile regenerates exactly once before outreach");
    assert.equal(capturedMarkdown.value, freshMarkdown, "outreach must use the freshly regenerated markdown");
  }

  // Fresh profile: last generation (markdownGeneratedAt=now) is not older than the last edit.
  {
    const aggregate = completeCandidateProfileAggregate(now);
    aggregate.profile.updatedAt = now;
    aggregate.profile.markdownGeneratedAt = now;
    const regenerateSpy = { calls: 0 };
    const capturedMarkdown: { value?: string } = {};
    const response = await handlePublicProfilePursuitOutreachRequest(
      outreachRequest(),
      outreachOptions({ aggregate, regenerateSpy, capturedMarkdown }),
    );
    assert.equal(response.status, 200);
    assert.equal(regenerateSpy.calls, 0, "a fresh profile is not regenerated");
    assert.equal(capturedMarkdown.value, staleMarkdown, "outreach uses the existing markdown when fresh");
  }

  console.log("public-profile regeneration tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

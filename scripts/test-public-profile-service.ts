import assert from "node:assert/strict";
import {
  regenerateLoadedPublicProfileForUser,
  type PublicProfileServiceDependencies,
} from "../lib/public-profile/service";
import { completeCandidateProfileAggregate } from "./fixtures/public-profile";

const now = "2026-06-23T15:00:00.000Z";
const nextVersion = completeCandidateProfileAggregate(now).profile.version + 1;

async function main() {
  const persisted: unknown[] = [];
  const dependencies: PublicProfileServiceDependencies = {
    loadAggregate: async () => completeCandidateProfileAggregate(now),
    persistGeneration: async (generation) => {
      persisted.push(generation);
    },
  };

  const regenerated = await regenerateLoadedPublicProfileForUser(dependencies, "user-1", {
    generatedAt: now,
    changeSummary: "Service test regeneration.",
  });
  assert.equal(regenerated.status, "regenerated");
  if (regenerated.status === "regenerated") {
    assert.equal(regenerated.generation.profileQuality.status, "complete");
    assert.equal(regenerated.generation.profileVersion.version, nextVersion);
    assert.equal(regenerated.generation.profileVersion.changeSummary, "Service test regeneration.");
  }
  assert.equal(persisted.length, 1);

  const incompletePersisted: unknown[] = [];
  const incomplete = await regenerateLoadedPublicProfileForUser({
    loadAggregate: async () => ({
      ...completeCandidateProfileAggregate(now),
      roleTracks: [],
    }),
    persistGeneration: async (generation) => {
      incompletePersisted.push(generation);
    },
  }, "user-1", { generatedAt: now });
  assert.equal(incomplete.status, "incomplete");
  if (incomplete.status === "incomplete") {
    assert.ok(incomplete.profileQuality.incompleteReasons.includes("At least one Role Track is required."));
  }
  assert.equal(incompletePersisted.length, 0);

  const missing = await regenerateLoadedPublicProfileForUser({
    loadAggregate: async () => undefined,
    persistGeneration: async () => {
      throw new Error("missing profiles should not persist");
    },
  }, "user-404", { generatedAt: now });
  assert.deepEqual(missing, {
    status: "not_found",
    userId: "user-404",
  });

  console.log("public profile service: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

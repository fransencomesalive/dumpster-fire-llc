import assert from "node:assert/strict";
import { compileAndSaveSearchProfile, getActiveMatchingConfig } from "../app/scans/store";

async function main() {
  const result = await compileAndSaveSearchProfile({
    resumeText: "Creative Operations Director leading cross-functional studio operations, campaign delivery, budget planning, vendor workflow, and production systems.",
    profileText: "Seeking remote creative program leadership in technology or internal creative studio environments.",
    preferences: {
      desiredTitles: ["Creative Operations Director", "Creative Program Director"],
      avoidedTitles: ["Software Engineer", "Counsel"],
      desiredIndustries: ["technology", "internal creative studio"],
      compensationFloor: 160000,
      freelanceRateFloor: 125,
      remoteOnly: true,
      approvedLoginEmail: "candidate@example.com",
      roleTracks: [{
        id: "creative_program",
        label: "Creative Program",
        titlePatterns: ["Creative Program Director"],
        responsibilityPatterns: ["studio operations", "campaign delivery", "vendor workflow"],
        contextPatterns: ["technology", "internal creative studio"],
        proofPatterns: ["brand studio"],
        weakPatterns: ["scrum master"],
      }],
    },
  });

  assert.equal(result.persistence, "memory");
  assert.ok(result.compiledProfile.searchProfile.targetTitles.includes("creative operations director"));
  assert.equal(result.dashboardState.searchProfile.compensationFloor, 160000);
  assert.equal(result.dashboardState.searchProfile.remoteOnly, true);
  assert.ok(result.compiledProfile.matchingConfig.hardExcludedTitlePatterns.includes("software engineer"));
  assert.equal(result.compiledProfile.matchingConfig.resumeRoleSignals?.roleTracks?.[0]?.label, "Creative Program");

  const activeMatching = await getActiveMatchingConfig();
  assert.equal(activeMatching.source, "compiled_profile");
  assert.equal(activeMatching.matchingConfig.rulesVersion, result.compiledProfile.matchingConfig.rulesVersion);
  assert.ok(activeMatching.matchingConfig.hardExcludedTitlePatterns.includes("software engineer"));
}

main().then(() => {
  console.log("Dumpster Fire onboarding profile tests passed.");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

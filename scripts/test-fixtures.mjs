import { spawnSync } from "node:child_process";

const savedPursuitsSuites = [
  "scripts/test-public-profile-pursuits.mjs",
  "scripts/test-public-profile-api.mjs",
];

const fixtureSuites = [
  "scripts/test-job-link.mjs",
  "scripts/test-llm-extract-posting.mjs",
  "scripts/test-parse-posting.mjs",
  "scripts/test-public-auth-session.mjs",
  "scripts/test-public-jobs-repository.mjs",
  "scripts/test-public-profile-api.mjs",
  "scripts/test-public-profile-catalogues.mjs",
  "scripts/test-public-profile-contact-discovery.mjs",
  "scripts/test-public-profile-export.mjs",
  "scripts/test-public-profile-generation.mjs",
  "scripts/test-public-profile-markdown.mjs",
  "scripts/test-public-profile-matching.mjs",
  "scripts/test-public-profile-outreach.mjs",
  "scripts/test-public-profile-pursuits.mjs",
  "scripts/test-public-profile-quality.mjs",
  "scripts/test-public-profile-regeneration.mjs",
  "scripts/test-public-profile-repository.mjs",
  "scripts/test-public-profile-resume-highlights.mjs",
  "scripts/test-public-profile-resume-parse.mjs",
  "scripts/test-public-profile-sections.mjs",
  "scripts/test-public-profile-service.mjs",
  "scripts/test-public-profile-subscription.mjs",
  "scripts/test-public-profile-voice-fingerprint.mjs",
  "scripts/test-qa-user-reply-webhook.mjs",
  "scripts/test-refine-postings.mjs",
  "scripts/test-scan-api.mjs",
  "scripts/test-scan-sources.mjs",
  "scripts/test-source-scan.mjs",
];

const selectedSuites = process.argv.includes("--saved-pursuits")
  ? savedPursuitsSuites
  : fixtureSuites;

for (const suite of selectedSuites) {
  process.stdout.write(`\n[fixtures] ${suite}\n`);
  const result = spawnSync(process.execPath, [suite], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

process.stdout.write(`\n[fixtures] ${selectedSuites.length} suites passed\n`);

#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";

const root = process.cwd();

const requiredFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/current-state.md",
  "docs/scans-codex-handoff.md",
  "docs/scans-failure-audit-2026-06-09.md",
  "docs/scans-hardening-plan-2026-06-10.md",
  "docs/scans-matching-audit-2026-06-10.md",
  "docs/scans-execution-path-2026-06-10.md",
  "docs/scans-application-outreach-plan-2026-06-12.md",
  "app/scans/review-learning.ts",
  "scripts/run-dumpster-fire-verdict-benchmark.mjs",
  "app/scans/CLAUDE-START-HERE.md",
  "app/scans/ARCHITECTURE.md",
  "app/scans/SOURCE_INVENTORY.md",
  "app/scans/TUNING_PLAN.md",
  "app/scans/connectors.ts",
  "app/scans/search-sources.ts",
  "scripts/test-dumpster-fire-review-details.mjs",
];

const checks = [];
const warnings = [];

function pass(label, detail = "") {
  checks.push({ ok: true, label, detail });
}

function fail(label, detail = "") {
  checks.push({ ok: false, label, detail });
}

function warn(label, detail = "") {
  warnings.push({ label, detail });
}

function read(path) {
  return readFileSync(`${root}/${path}`, "utf8");
}

function requireText(path, pattern, label) {
  const content = read(path);
  if (pattern.test(content)) {
    pass(label, path);
  } else {
    fail(label, `${path} did not match ${pattern}`);
  }
}

for (const file of requiredFiles) {
  if (existsSync(`${root}/${file}`)) {
    pass("Required file exists", file);
  } else {
    fail("Required file missing", file);
  }
}

requireText(
  "docs/current-state.md",
  /Dumpster Fire cleanup\/Greenhouse source clarification 2026-06-10/,
  "Current state has latest cleanup/Greenhouse note",
);
requireText(
  "docs/scans-codex-handoff.md",
  /Cleanup And Greenhouse Clarification — 2026-06-10/,
  "Codex handoff has latest cleanup/Greenhouse section",
);
requireText(
  "app/scans/SOURCE_INVENTORY.md",
  /Greenhouse job boards \| targeted_company_source \| Public JSON board API/,
  "Source inventory classifies Greenhouse as targeted ATS coverage",
);
requireText(
  "app/scans/connectors.ts",
  /boards-api\.greenhouse\.io\/v1\/boards\/\$\{company\.atsBoardToken\}\/jobs\?content=true/,
  "Connector uses Greenhouse public board API",
);
requireText(
  "scripts/test-dumpster-fire-review-details.mjs",
  /boards-api\.greenhouse\.io\/v1\/boards\/anthropic\/jobs\?content=true/,
  "Regression fixture locks Greenhouse endpoint",
);
requireText(
  "scripts/test-dumpster-fire-review-details.mjs",
  /targeted_company_careers/,
  "Regression fixture locks Greenhouse source kind",
);

const reviewBatchPath = "/private/tmp/scans-review-batches.json";
if (existsSync(reviewBatchPath)) {
  try {
    const parsed = JSON.parse(readFileSync(reviewBatchPath, "utf8"));
    const summary = parsed.summary ?? {};
    const selected = summary.selected ?? parsed.selected?.length ?? parsed.cards?.length;
    const updatedAt = statSync(reviewBatchPath).mtime.toISOString();

    if (summary.matchingConfigSource === "compiled_profile") {
      pass("Review batch uses compiled profile", summary.matchingRulesVersion ?? "");
    } else {
      fail("Review batch does not use compiled profile", JSON.stringify(summary));
    }

    if (summary.reviewReady === true && Number(selected) > 0) {
      pass("Review batch is review-ready", `${selected} selected; updated ${updatedAt}`);
    } else {
      warn("Review batch is not review-ready", `${selected ?? "unknown"} selected; updated ${updatedAt}`);
    }

    if (summary.totalSources && summary.broadSources !== undefined && summary.targetedSources !== undefined) {
      pass("Review batch reports source coverage", `${summary.totalSources} total, ${summary.broadSources} broad, ${summary.targetedSources} targeted`);
    } else {
      warn("Review batch source coverage summary missing", reviewBatchPath);
    }
  } catch (error) {
    fail("Review batch JSON parse failed", error instanceof Error ? error.message : String(error));
  }
} else {
  warn("Review batch artifact missing", reviewBatchPath);
}

try {
  const status = execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" }).trim();
  if (status) {
    const lines = status.split("\n");
    warn("Worktree has uncommitted changes", `${lines.length} changed/untracked paths`);
  } else {
    pass("Worktree is clean");
  }
} catch (error) {
  warn("Unable to read git status", error instanceof Error ? error.message : String(error));
}

const failed = checks.filter((check) => !check.ok);

console.log("Dumpster Fire crossover check");
console.log("");
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.label}${check.detail ? `: ${check.detail}` : ""}`);
}
for (const item of warnings) {
  console.log(`WARN ${item.label}${item.detail ? `: ${item.detail}` : ""}`);
}
console.log("");
console.log(`Summary: ${checks.length - failed.length}/${checks.length} checks passed, ${warnings.length} warnings.`);

if (failed.length > 0) {
  process.exitCode = 1;
}

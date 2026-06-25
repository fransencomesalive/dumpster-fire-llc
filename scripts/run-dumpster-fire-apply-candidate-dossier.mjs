import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

// Ingest a Candidate Dossier markdown file. Dry-run prints the validation report;
// --apply stores raw markdown + parsed JSON (consent recorded 2026-06-12).
// Usage: node scripts/run-dumpster-fire-apply-candidate-dossier.mjs [path] [--apply]

const rootDir = process.cwd();
const outDir = "/private/tmp/scans-dossier-build";
const compile = spawnSync("npx", [
  "tsc", "--target", "ES2022", "--module", "commonjs", "--moduleResolution", "node",
  "--esModuleInterop", "--skipLibCheck", "--outDir", outDir,
  "app/scans/store.ts", "app/scans/connector-runner.ts",
], { cwd: rootDir, stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(rootDir);
const { parseCandidateDossier } = require(path.join(outDir, "dossier-parser.js"));
const store = require(path.join(outDir, "store.js"));

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const filePath = args.find((arg) => !arg.startsWith("--")) ?? "local-artifacts/scans/candidate-dossier-randall-v1.md";
const rawMarkdown = readFileSync(filePath, "utf8");
const parsed = parseCandidateDossier(rawMarkdown);

console.log(JSON.stringify({
  file: filePath,
  name: parsed.name,
  version: parsed.version,
  tracks: parsed.tracks.map((t) => t.label),
  examples: parsed.examples.length,
  samples: parsed.samples.length,
  resumes: parsed.resumes.map((r) => `${r.trackLabel} (${r.bullets.length})`),
  validation: parsed.validation,
}, null, 1));

if (!parsed.validation.ok) {
  console.log("Validation failed; not applying.");
  process.exit(1);
}

if (!apply) {
  console.log("Dry run. Re-run with --apply to store.");
} else {
  const result = await store.saveCandidateDossier(rawMarkdown);
  console.log(JSON.stringify(result, null, 1));
}

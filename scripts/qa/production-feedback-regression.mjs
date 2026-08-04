import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const outDir = mkdtempSync(path.join(tmpdir(), "production-feedback-regression-"));
const tsc = path.join(rootDir, "node_modules", "typescript", "bin", "tsc");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: rootDir, env: process.env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [
  tsc,
  "--target", "ES2022",
  "--module", "commonjs",
  "--moduleResolution", "node",
  "--esModuleInterop",
  "--skipLibCheck",
  "--lib", "ES2022,DOM",
  "--outDir", outDir,
  "scripts/qa/production-feedback-regression.ts",
]);
run(process.execPath, [path.join(outDir, "scripts", "qa", "production-feedback-regression.js")]);

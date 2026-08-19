import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const outDir = path.join(tmpdir(), "production-scan-shadow-build");
const compile = spawnSync("npx", [
  "tsc",
  "--target", "ES2022",
  "--module", "commonjs",
  "--moduleResolution", "node",
  "--esModuleInterop",
  "--resolveJsonModule",
  "--skipLibCheck",
  "--lib", "ES2022,DOM",
  "--outDir", outDir,
  "scripts/qa/production-scan-shadow.ts",
], { cwd: rootDir, stdio: "inherit" });

if (compile.status !== 0) process.exit(compile.status ?? 1);

const run = spawnSync(process.execPath, [path.join(outDir, "scripts/qa/production-scan-shadow.js")], {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env,
});
process.exit(run.status ?? 1);

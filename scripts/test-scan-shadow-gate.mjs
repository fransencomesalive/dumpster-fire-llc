import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const outDir = path.join(tmpdir(), "scan-shadow-gate-test-build");
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
  "scripts/test-scan-shadow-gate.ts",
], { cwd: rootDir, stdio: "inherit" });

if (compile.status !== 0) process.exit(compile.status ?? 1);

const run = spawnSync(process.execPath, [path.join(outDir, "scripts/test-scan-shadow-gate.js")], {
  cwd: rootDir,
  stdio: "inherit",
});
process.exit(run.status ?? 1);

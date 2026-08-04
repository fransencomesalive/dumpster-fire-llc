import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const outDir = path.join(tmpdir(), "outreach-evidence-selection-test-build");
const compileArgs = [
  "tsc",
  "--target",
  "ES2022",
  "--module",
  "commonjs",
  "--moduleResolution",
  "node",
  "--esModuleInterop",
  "--skipLibCheck",
  "--outDir",
  outDir,
  "scripts/test-outreach-evidence-selection.ts",
];

const compile = spawnSync("npx", compileArgs, { cwd: rootDir, stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);

const run = spawnSync("node", [path.join(outDir, "scripts/test-outreach-evidence-selection.js")], {
  cwd: rootDir,
  stdio: "inherit",
});
if (run.status !== 0) process.exit(run.status ?? 1);

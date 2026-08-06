import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const outDir = path.join(tmpdir(), "account-usage-sheet-test-build");
const compile = spawnSync("npx", [
  "tsc",
  "--target", "ES2022",
  "--module", "commonjs",
  "--moduleResolution", "node",
  "--esModuleInterop",
  "--skipLibCheck",
  "--lib", "ES2022,DOM",
  "--outDir", outDir,
  "scripts/test-account-usage-sheet.ts",
], { cwd: rootDir, stdio: "inherit" });

if (compile.status !== 0) process.exit(compile.status ?? 1);
const run = spawnSync("node", [path.join(outDir, "scripts/test-account-usage-sheet.js")], {
  cwd: rootDir,
  stdio: "inherit",
  env: { ...process.env, NODE_PATH: path.join(rootDir, "node_modules") },
});
process.exit(run.status ?? 1);

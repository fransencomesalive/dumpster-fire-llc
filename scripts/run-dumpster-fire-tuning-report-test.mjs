import { spawnSync } from "node:child_process";
import path from "node:path";

const rootDir = process.cwd();
const outDir = "/private/tmp/scans-tuning-report-test-build";
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
  "scripts/test-dumpster-fire-tuning-report.ts",
  "app/scans/tuning-preview.ts",
  "app/scans/tuning-report.ts",
  "app/scans/near-miss-review.ts",
  "app/scans/relevance.ts",
  "app/scans/dedupe.ts",
  "app/scans/match-learning.ts",
  "app/scans/matching.ts",
  "app/scans/connectors.ts",
  "app/scans/types.ts",
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("npx", compileArgs);
run("node", [path.join(outDir, "scripts/test-dumpster-fire-tuning-report.js")], {
  env: {
    ...process.env,
    NODE_PATH: path.join(rootDir, "node_modules"),
  },
});

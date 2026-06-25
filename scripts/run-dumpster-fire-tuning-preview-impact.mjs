import { spawnSync } from "node:child_process";
import path from "node:path";

const rootDir = process.cwd();
const outDir = "/private/tmp/scans-tuning-preview-impact-build";
const passThroughArgs = process.argv.slice(2);
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
  "scripts/preview-dumpster-fire-tuning-impact.ts",
  "app/scans/store.ts",
  "app/scans/tuning-preview.ts",
  "app/scans/tuning-report.ts",
  "app/scans/near-miss-review.ts",
  "app/scans/match-learning.ts",
  "app/scans/matching.ts",
  "app/scans/profile-compiler.ts",
  "app/scans/scoring.ts",
  "app/scans/connectors.ts",
  "app/scans/connector-runner.ts",
  "app/scans/relevance.ts",
  "app/scans/dedupe.ts",
  "app/scans/data.ts",
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
run("node", [path.join(outDir, "scripts/preview-dumpster-fire-tuning-impact.js"), ...passThroughArgs], {
  env: {
    ...process.env,
    NODE_PATH: path.join(rootDir, "node_modules"),
  },
});

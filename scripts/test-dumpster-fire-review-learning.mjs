import { spawnSync } from "node:child_process";
import path from "node:path";

const rootDir = process.cwd();
const outDir = "/private/tmp/scans-review-learning-test-build";
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
  "scripts/test-dumpster-fire-review-learning.ts",
  "app/scans/review-learning.ts",
  "app/scans/review-feedback.ts",
  "app/scans/tuning-preview.ts",
  "app/scans/tuning-report.ts",
  "app/scans/near-miss-review.ts",
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
run("node", [path.join(outDir, "scripts/test-dumpster-fire-review-learning.js")], {
  env: {
    ...process.env,
    NODE_PATH: path.join(rootDir, "node_modules"),
  },
});

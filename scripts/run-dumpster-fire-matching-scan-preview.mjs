import { spawnSync } from "node:child_process";
import path from "node:path";

const rootDir = process.cwd();
const outDir = "/private/tmp/scans-scan-preview-build";
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
  "scripts/preview-dumpster-fire-matching-scan.ts",
  "app/scans/connector-runner.ts",
  "app/scans/search-sources.ts",
  "app/scans/relevance.ts",
  "app/scans/matching.ts",
  "app/scans/connectors.ts",
  "app/scans/store.ts",
  "app/scans/data.ts",
  "app/scans/types.ts",
  "app/scans/scoring.ts",
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
run("node", [path.join(outDir, "scripts/preview-dumpster-fire-matching-scan.js")], {
  env: {
    ...process.env,
    NODE_PATH: path.join(rootDir, "node_modules"),
  },
});

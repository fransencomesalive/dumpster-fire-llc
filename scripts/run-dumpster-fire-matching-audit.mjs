import { spawnSync } from "node:child_process";
import path from "node:path";

const rootDir = process.cwd();
const outDir = "/private/tmp/scans-audit-build";
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
  "scripts/audit-dumpster-fire-matching.ts",
  "app/scans/match-audit.ts",
  "app/scans/search-sources.ts",
  "app/scans/matching.ts",
  "app/scans/store.ts",
  "app/scans/connectors.ts",
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
run("node", [path.join(outDir, "scripts/audit-dumpster-fire-matching.js")], {
  env: {
    ...process.env,
    NODE_PATH: path.join(rootDir, "node_modules"),
  },
});

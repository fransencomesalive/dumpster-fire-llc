import { spawnSync } from "node:child_process";
import path from "node:path";

const rootDir = process.cwd();
const outDir = "/private/tmp/public-profile-matching-test-build";
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
  "--lib",
  "ES2022,DOM",
  "--outDir",
  outDir,
  "scripts/test-public-profile-matching.ts",
];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("npx", compileArgs);
run("node", [path.join(outDir, "scripts/test-public-profile-matching.js")]);

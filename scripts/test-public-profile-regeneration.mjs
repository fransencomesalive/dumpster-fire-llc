import { cpSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const outDir = path.join(tmpdir(), "public-profile-regeneration-test-build");
const compileArgs = [
  "tsc",
  "--target",
  "ES2022",
  "--module",
  "commonjs",
  "--moduleResolution",
  "node",
  "--esModuleInterop",
  "--resolveJsonModule",
  "--skipLibCheck",
  "--outDir",
  outDir,
  "scripts/test-public-profile-regeneration.ts",
  "scripts/fixtures/public-profile.ts",
  "lib/public-profile/api.ts",
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
cpSync(
  path.join(rootDir, "lib/public-profile/catalogues"),
  path.join(outDir, "lib/public-profile/catalogues"),
  { recursive: true },
);
run("node", [path.join(outDir, "scripts/test-public-profile-regeneration.js")]);

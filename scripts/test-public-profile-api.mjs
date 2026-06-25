import { spawnSync } from "node:child_process";
import path from "node:path";

const rootDir = process.cwd();
const outDir = "/private/tmp/public-profile-api-test-build";
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
  "scripts/test-public-profile-api.ts",
  "scripts/fixtures/public-profile.ts",
  "lib/public-profile/api.ts",
  "lib/public-profile/section-service.ts",
  "lib/public-profile/sections.ts",
  "lib/public-profile/service.ts",
  "lib/public-profile/repository.ts",
  "lib/public-profile/profile-generation.ts",
  "lib/public-profile/profile-markdown.ts",
  "lib/public-profile/profile-quality.ts",
  "lib/public-profile/types.ts",
  "lib/public-auth/session.ts",
  "lib/public-auth/config.ts",
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
run("node", [path.join(outDir, "scripts/test-public-profile-api.js")]);

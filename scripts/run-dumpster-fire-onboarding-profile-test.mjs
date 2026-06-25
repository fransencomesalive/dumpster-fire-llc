import { spawnSync } from "node:child_process";
import path from "node:path";

const rootDir = process.cwd();
const outDir = "/private/tmp/scans-onboarding-profile-test-build";
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
  "scripts/test-dumpster-fire-onboarding-profile.ts",
  "app/scans/store.ts",
  "app/scans/profile-compiler.ts",
  "app/scans/matching.ts",
  "app/scans/scoring.ts",
  "app/scans/connectors.ts",
  "app/scans/data.ts",
  "app/scans/types.ts",
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_SERVICE_KEY: "",
    },
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("npx", compileArgs);
run("node", [path.join(outDir, "scripts/test-dumpster-fire-onboarding-profile.js")], {
  env: {
    ...process.env,
    NODE_PATH: path.join(rootDir, "node_modules"),
    SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    SUPABASE_SERVICE_KEY: "",
  },
});

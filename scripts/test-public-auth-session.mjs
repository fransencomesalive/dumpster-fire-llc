import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const outDir = path.join(tmpdir(), "public-auth-session-test-build");
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
  "scripts/test-public-auth-session.ts",
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
run("node", [path.join(outDir, "scripts/test-public-auth-session.js")]);

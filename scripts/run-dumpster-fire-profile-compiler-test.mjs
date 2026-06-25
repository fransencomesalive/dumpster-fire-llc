import { spawnSync } from "node:child_process";
import path from "node:path";

const rootDir = process.cwd();
const outDir = "/private/tmp/scans-profile-compiler-test-build";
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
  "scripts/test-dumpster-fire-profile-compiler.ts",
  "app/scans/profile-compiler.ts",
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
run("node", [path.join(outDir, "scripts/test-dumpster-fire-profile-compiler.js")], {
  env: {
    ...process.env,
    NODE_PATH: path.join(rootDir, "node_modules"),
  },
});

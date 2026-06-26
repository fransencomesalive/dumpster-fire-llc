import { spawnSync } from "node:child_process";
import path from "node:path";

const rootDir = process.cwd();
const outDir = "/private/tmp/public-jobs-repository-test-build";
const compileArgs = [
  "tsc",
  "--project",
  "scripts/tsconfig.public-jobs-test.json",
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
run("node", [path.join(outDir, "scripts/test-public-jobs-repository.js")]);

import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npx",
  ["tsx", "scripts/preview-dumpster-fire-near-misses.ts", ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    stdio: "inherit",
  }
);

process.exitCode = result.status ?? 1;

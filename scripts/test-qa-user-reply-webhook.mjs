import { spawnSync } from "node:child_process";
import path from "node:path";

const outDir = "/private/tmp/qa-user-reply-webhook-test-build";
const result = spawnSync("npx", [
  "tsc",
  "--target", "ES2022",
  "--module", "commonjs",
  "--moduleResolution", "node",
  "--esModuleInterop",
  "--skipLibCheck",
  "--lib", "ES2022,DOM",
  "--outDir", outDir,
  "scripts/test-qa-user-reply-webhook.ts",
  "lib/qa/user-reply-webhook.ts",
  "lib/qa/user-reply-email.ts",
], { cwd: process.cwd(), stdio: "inherit" });

if (result.status !== 0) process.exit(result.status ?? 1);
const run = spawnSync("node", [path.join(outDir, "scripts/test-qa-user-reply-webhook.js")], {
  stdio: "inherit",
  env: { ...process.env, NODE_PATH: path.join(process.cwd(), "node_modules") },
});
if (run.status !== 0) process.exit(run.status ?? 1);

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

// Resolve job-posting URLs to ATS boards and add them to the watchlist.
// Usage:
//   node scripts/run-dumpster-fire-add-boards.mjs "https://job-boards.greenhouse.io/acme/jobs/123" ...
//   node scripts/run-dumpster-fire-add-boards.mjs --apply "https://jobs.ashbyhq.com/acme/uuid"
// Dry-run by default; --apply writes the resolved boards to the watchlist.

const rootDir = process.cwd();
const outDir = "/private/tmp/scans-add-boards-build";
const compile = spawnSync("npx", [
  "tsc", "--target", "ES2022", "--module", "commonjs", "--moduleResolution", "node",
  "--esModuleInterop", "--skipLibCheck", "--outDir", outDir,
  "app/scans/board-registry.ts", "app/scans/store.ts",
], { cwd: rootDir, stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(rootDir);
const { resolveBoardFromUrl } = require(path.join(outDir, "board-registry.js"));
const store = require(path.join(outDir, "store.js"));

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const urls = args.filter((arg) => !arg.startsWith("--"));

if (urls.length === 0) {
  console.log("Provide one or more job-posting or board URLs.");
  process.exit(1);
}

const state = await store.getDashboardState();
const existingTokens = new Set(state.companies.map((company) => `${company.atsProvider}:${(company.atsBoardToken || company.careersUrl).toLowerCase()}`));
const toImport = [];

for (const url of urls) {
  const resolution = resolveBoardFromUrl(url);

  if (resolution.status === "blocked") {
    console.log(`BLOCKED      | ${url} | ${resolution.reason}`);
    continue;
  }
  if (resolution.status === "unrecognized") {
    console.log(`UNRECOGNIZED | ${url} | no known ATS pattern; add manually or wait for a new provider`);
    continue;
  }

  const board = resolution.board;
  const key = `${board.provider}:${(board.atsBoardToken || board.careersUrl).toLowerCase()}`;
  if (existingTokens.has(key)) {
    console.log(`EXISTS       | ${board.companySlug} | ${board.provider}/${board.atsBoardToken}`);
    continue;
  }

  existingTokens.add(key);
  toImport.push({
    companyName: board.companySlug,
    websiteUrl: "",
    careersUrl: board.careersUrl,
    atsProvider: board.provider,
    atsBoardToken: board.atsBoardToken,
    industryBucket: "",
    remoteLikelihood: 50,
    notes: `added via board-registry resolver (${board.confidence}); source URL: ${url}`,
    status: "active",
  });
  console.log(`RESOLVED     | ${board.companySlug} | ${board.provider}/${board.atsBoardToken} | ${board.careersUrl}${board.confidence === "guess" ? " | token GUESSED from hostname, verify" : ""}`);
}

if (toImport.length === 0) {
  console.log("Nothing new to add.");
} else if (!apply) {
  console.log(`Dry run: ${toImport.length} board(s) would be added. Re-run with --apply to write.`);
} else {
  const result = await store.importCompanies(toImport);
  console.log(`Imported ${result.imported ?? toImport.length} board(s) to the watchlist.`);
}

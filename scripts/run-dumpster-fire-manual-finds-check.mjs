import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const rootDir = process.cwd();
const outDir = "/private/tmp/scans-manual-finds-check-build";
const compile = spawnSync("npx", [
  "tsc", "--target", "ES2022", "--module", "commonjs", "--moduleResolution", "node",
  "--esModuleInterop", "--skipLibCheck", "--outDir", outDir,
  "app/scans/connector-runner.ts", "app/scans/store.ts",
], { cwd: rootDir, stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(rootDir);
const { fetchNormalizedConnectorJobs } = require(path.join(outDir, "connector-runner.js"));
const { evaluateJobMatch } = require(path.join(outDir, "matching.js"));
const store = require(path.join(outDir, "store.js"));

// Randall's manually-found expected-visible roles (2026-06-11). Postings close over time;
// treat "target id not found" as posting-closed, not source failure.
const finds = [
  { company: "Liquid Death", provider: "greenhouse", token: "liquiddeath", jobId: "4279680009" },
  { company: "Acquia", provider: "greenhouse", token: "acquia", jobId: "7909188" },
  { company: "Mob Entertainment", provider: "greenhouse", token: "mobentertainment", jobId: "5158633007" },
  { company: "Jerry", provider: "ashby", token: "Jerry.ai", jobId: "08ebec97-d6e2-4dfd-8e7a-bea4c11c5929" },
  { company: "DEPT", provider: "greenhouse", token: "dept", jobId: "7979849" },
  { company: "Instacart", provider: "greenhouse", token: "instacart", jobId: "7980420" },
  { company: "Grow Therapy", provider: "ashby", token: "grow-therapy", jobId: "de960516-8189-4483-be53-db2234158a2a" },
  { company: "Perplexity", provider: "ashby", token: "perplexity", jobId: "678d1162-e650-4d6d-9532-b287255c00fb" },
  { company: "BGB Group", provider: "greenhouse", token: "bgbx", jobId: "7885190" },
];

function companyRow(find) {
  return {
    id: `manual-${find.token}`,
    companyName: find.company,
    websiteUrl: "",
    careersUrl: find.provider === "greenhouse"
      ? `https://job-boards.greenhouse.io/${find.token}`
      : `https://jobs.ashbyhq.com/${find.token}`,
    atsProvider: find.provider,
    atsBoardToken: find.token,
    industryBucket: "",
    remoteLikelihood: 50,
    notes: "",
    status: "active",
    lastSuccessfulScan: "",
  };
}

const [state, active] = await Promise.all([store.getDashboardState(), store.getActiveMatchingConfig()]);
console.log("matcher:", active.matchingConfig.rulesVersion, "| source:", active.source);
let passes = 0;

for (const find of finds) {
  try {
    const jobs = await fetchNormalizedConnectorJobs(companyRow(find));
    const job = jobs.find((j) => String(j.externalJobId).includes(find.jobId) || (j.sourceUrl ?? "").includes(find.jobId));
    if (!job) { console.log(`CLOSED?  | ${find.company}: board has ${jobs.length} jobs, target id not found`); continue; }

    const d = evaluateJobMatch({
      title: job.title, companyName: job.companyName || find.company, department: job.department,
      location: job.location, remoteType: job.remoteType, employmentType: job.employmentType,
      salaryMin: job.salaryMin, salaryMax: job.salaryMax, salaryText: job.salaryText,
      descriptionText: job.descriptionText, firstSeenAt: new Date().toISOString(), needsContactResearch: true,
    }, state.searchProfile, active.matchingConfig);

    if (d.included) passes += 1;
    console.log(`${d.included ? "PASS " + d.matchQuality.toUpperCase() : "FILTERED"} | ${find.company} | "${job.title}" | ${d.included ? "score " + d.score : "risks: " + d.risks.slice(0, 3).join("; ")}`);
  } catch (error) {
    console.log(`ERROR | ${find.company}: ${error.message}`);
  }
}

console.log(`Recall on manual finds: ${passes}/${finds.length}`);

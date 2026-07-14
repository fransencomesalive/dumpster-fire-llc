// Pull evidence for the outreach-quality session:
// 1. Randall's candidate profile.md (with Voice Profile block)
// 2. Recent outreach_messages (esp. Coinbase) with their pursuit -> job context
// 3. A listing of current scanned jobs to pick the baseline-corpus sample from
// Secrets are read from .env.local and never printed.
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertWorkExampleParity } from "./work-example-audit.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = "/Users/randallfransen/Sites/dumpster-fire-llc";

const env = Object.fromEntries(
  readFileSync(resolve(repo, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const base = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

async function q(table, query) {
  const res = await fetch(`${base}/rest/v1/${table}?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

// 1. Profiles
const profiles = await q(
  "candidate_profiles",
  "select=id,user_id,full_name,generated_markdown,markdown_generated_at,updated_at&order=updated_at.desc&limit=5",
);
const matchingProfiles = profiles.filter((profile) => /^randall fransen$/i.test((profile.full_name || "").trim()));
if (matchingProfiles.length !== 1) {
  throw new Error(`Expected exactly one Randall Fransen profile; found ${matchingProfiles.length}.`);
}
const randall = matchingProfiles[0];
if (!randall?.generated_markdown) {
  throw new Error("The selected candidate profile has no compiled profile markdown.");
}

const profileUpdatedAt = Date.parse(randall.updated_at);
const markdownGeneratedAt = Date.parse(randall.markdown_generated_at);
if (!Number.isFinite(profileUpdatedAt) || !Number.isFinite(markdownGeneratedAt) || profileUpdatedAt > markdownGeneratedAt) {
  throw new Error("The selected candidate profile markdown is stale. Regenerate it before pulling outreach evidence.");
}

const structuredWorkExamples = await q(
  "work_examples",
  `select=id,title,one_hitter,link,context,created_at&profile_id=eq.${randall.id}&order=created_at.asc,id.asc`,
);
const workExampleAudit = assertWorkExampleParity(structuredWorkExamples, randall.generated_markdown);
const auditArtifact = {
  checkedAt: new Date().toISOString(),
  profileUpdatedAt: randall.updated_at,
  markdownGeneratedAt: randall.markdown_generated_at,
  ...workExampleAudit,
};

// 2. Outreach messages with pursuit/job context
const messages = await q(
  "outreach_messages",
  "select=id,pursuit_id,recipient_type,channel,message,status,created_at&order=created_at.desc&limit=25",
);
console.log(`\noutreach_messages: ${messages.length}`);
const pursuitIds = [...new Set(messages.map((m) => m.pursuit_id))];
const pursuits = pursuitIds.length
  ? await q("pursuits", `select=id,job_id,status,fit_summary,outreach_angle&id=in.(${pursuitIds.join(",")})`)
  : [];
const jobIds = [...new Set(pursuits.map((p) => p.job_id))];
const pursuitJobs = jobIds.length
  ? await q("jobs", `select=id,title,company_name&id=in.(${jobIds.join(",")})`)
  : [];
const jobById = Object.fromEntries(pursuitJobs.map((j) => [j.id, j]));
const pursuitById = Object.fromEntries(pursuits.map((p) => [p.id, p]));

const annotated = messages.map((m) => {
  const pursuit = pursuitById[m.pursuit_id];
  const job = pursuit ? jobById[pursuit.job_id] : undefined;
  return { ...m, job_title: job?.title, company: job?.company_name, outreach_angle: pursuit?.outreach_angle };
});

// 3. Current scanned jobs (for corpus sample selection) — balanced per company so the big
// boards (Airbnb/Anthropic/Databricks) can't crowd smaller sources out of the pool. Randall
// 2026-07-14: review batches need real company variety; a flat recency-200 pull was 85%
// four companies while Notion/Linear/GitLab/Runway never surfaced.
// 250 ≈ the full current board per company (rescans update scraped_at in place, so recency
// ordering inside one company is same-timestamp ties in board order — a small limit would
// alphabetically bias the slice and hide Program/Producer/TPM titles).
const JOBS_PER_COMPANY = 250;
const sourceRows = await q("job_sources", "select=company_name&status=eq.active&order=company_name.asc");
const companies = [...new Set(sourceRows.map((row) => row.company_name))];
const jobs = [];
for (const company of companies) {
  const rows = await q(
    "jobs",
    `select=id,source_url,title,company_name,location,remote_type,description,posted_at,scraped_at&company_name=eq.${encodeURIComponent(company)}&order=scraped_at.desc&limit=${JOBS_PER_COMPANY}`,
  );
  jobs.push(...rows);
}
const scanJobs = jobs.map((job) => ({ ...job, description_chars: job.description?.length ?? 0 }));

// Write the scratch set only after every remote read and parity check succeeds. Each file is
// staged beside its destination first so a partial write cannot masquerade as fresh evidence.
const scratchFiles = [
  ["profile.md", randall.generated_markdown],
  ["work-examples.json", JSON.stringify(structuredWorkExamples, null, 2)],
  ["work-example-audit.json", JSON.stringify(auditArtifact, null, 2)],
  ["outreach-messages.json", JSON.stringify(annotated, null, 2)],
  ["scan-jobs.json", JSON.stringify(scanJobs, null, 2)],
];
for (const [name, contents] of scratchFiles) writeFileSync(resolve(here, `${name}.next`), contents);
for (const [name] of scratchFiles) renameSync(resolve(here, `${name}.next`), resolve(here, name));
const evidenceManifest = {
  createdAt: new Date().toISOString(),
  files: Object.fromEntries(scratchFiles.map(([name, contents]) => [
    name,
    createHash("sha256").update(contents).digest("hex"),
  ])),
};
writeFileSync(resolve(here, "evidence-manifest.json.next"), JSON.stringify(evidenceManifest, null, 2));
renameSync(resolve(here, "evidence-manifest.json.next"), resolve(here, "evidence-manifest.json"));

console.log(`Work Example parity: ${workExampleAudit.count}/${workExampleAudit.compiledCount} structured examples present in profile.md`);
console.log(`Evidence pull complete: ${annotated.length} outreach message(s), ${scanJobs.length} scanned jobs.`);

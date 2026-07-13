// Pull evidence for the outreach-quality session:
// 1. Randall's candidate profile.md (with Voice Profile block)
// 2. Recent outreach_messages (esp. Coinbase) with their pursuit -> job context
// 3. A listing of current scanned jobs to pick the baseline-corpus sample from
// Secrets are read from .env.local and never printed.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
  "select=id,user_id,full_name,generated_markdown,updated_at&order=updated_at.desc&limit=5",
);
console.log(`profiles: ${profiles.length}`);
for (const p of profiles) {
  console.log(`- ${p.id} | ${p.full_name} | md ${p.generated_markdown?.length ?? 0} chars | updated ${p.updated_at}`);
}
const randall = profiles.find((p) => /randall|fransen/i.test(p.full_name || "")) ?? profiles[0];
if (randall?.generated_markdown) {
  writeFileSync(resolve(here, "profile.md"), randall.generated_markdown);
  console.log(`wrote profile.md for ${randall.full_name} (${randall.generated_markdown.length} chars)`);
}

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
writeFileSync(resolve(here, "outreach-messages.json"), JSON.stringify(annotated, null, 2));
for (const m of annotated) {
  console.log(`- ${m.created_at} | ${m.company ?? "?"} | ${m.job_title ?? "?"} | ${m.status} | ${m.message.length} chars`);
}

// 3. Current scanned jobs (for baseline sample selection)
const jobs = await q(
  "jobs",
  "select=id,source_url,title,company_name,location,remote_type,description,posted_at,scraped_at&order=scraped_at.desc&limit=200",
);
writeFileSync(
  resolve(here, "scan-jobs.json"),
  JSON.stringify(jobs.map((j) => ({ ...j, description_chars: j.description?.length ?? 0 })), null, 2),
);
console.log(`\nscanned jobs: ${jobs.length} (saved to scan-jobs.json)`);

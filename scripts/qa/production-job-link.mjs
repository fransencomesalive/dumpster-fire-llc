#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

if (process.env.PRODUCTION_JOB_LINK_QA_CONFIRM !== "yes") {
  throw new Error("Set PRODUCTION_JOB_LINK_QA_CONFIRM=yes to create a disposable production QA account.");
}

const APP_URL = (process.env.PRODUCTION_APP_URL
  ?? "https://www.thejobmarketisadumpsterfire.com").replace(/\/$/, "");
const POSTING_URL = process.env.PRODUCTION_JOB_LINK_URL?.trim();
if (!POSTING_URL) throw new Error("Set PRODUCTION_JOB_LINK_URL to the exact production test URL.");
const expectedDeployment = process.env.PRODUCTION_DEPLOYMENT_ID?.trim() || null;
const commit = process.env.PRODUCTION_COMMIT_SHA
  ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

function required(name, fallback) {
  const value = process.env[name]?.trim() || (fallback ? process.env[fallback]?.trim() : "");
  if (!value) throw new Error(`Missing ${name}${fallback ? ` or ${fallback}` : ""}`);
  return value;
}

const supabaseUrl = required("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");

async function responseJson(response, label) {
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}: ${text.slice(0, 1000)}`);
  return body;
}

async function rest(path, { method = "GET", body } = {}, label = path) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return responseJson(response, label);
}

async function createQaUser(email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { qa_scope: "production_job_link_indexed_retrieval" },
    }),
  });
  const body = await responseJson(response, "Production QA user creation");
  if (typeof body?.id !== "string") throw new Error("Production QA user creation returned no id.");
  return body.id;
}

async function accessTokenFor(email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await responseJson(response, "Production QA sign-in");
  if (typeof body?.access_token !== "string") throw new Error("Production QA sign-in returned no access token.");
  return body.access_token;
}

async function deleteQaUser(userId) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  await responseJson(response, "Production QA user deletion");
}

const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const email = `job-link-production-${suffix}@example.invalid`;
const password = randomBytes(30).toString("base64url");
let userId;
let failure;
const evidence = {
  account: email,
  commit,
  deployment: null,
  appUrl: APP_URL,
  postingUrl: POSTING_URL,
  response: null,
  persisted: null,
  cleanup: null,
};

try {
  const root = await fetch(APP_URL, { cache: "no-store" });
  if (!root.ok) throw new Error(`Production root returned HTTP ${root.status}.`);
  evidence.deployment = root.headers.get("link")?.match(/[?&]dpl=(dpl_[^>;]+)/)?.[1] ?? null;
  if (expectedDeployment && evidence.deployment !== expectedDeployment) {
    throw new Error(`Expected deployment ${expectedDeployment}, received ${evidence.deployment ?? "unknown"}.`);
  }

  userId = await createQaUser(email, password);
  const accessToken = await accessTokenFor(email, password);
  const response = await fetch(`${APP_URL}/api/jobs/from-link`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: POSTING_URL }),
  });
  const body = await responseJson(response, "Production POST /api/jobs/from-link");
  if (body?.status !== "ingested" && body?.status !== "already_known") {
    throw new Error(`Unexpected ingestion status: ${String(body?.status)}`);
  }
  evidence.response = { http: response.status, ...body };

  const rows = await rest(
    `jobs?id=eq.${encodeURIComponent(body.jobId)}&select=id,owner_user_id,source_url,title,company_name,description,responsibilities,required_experience`,
    {},
    "Production job persistence readback",
  );
  if (rows.length !== 1) throw new Error("Production ingestion did not persist exactly one readable job row.");
  const row = rows[0];
  if (row.source_url !== POSTING_URL) throw new Error("Persisted source URL does not match the supplied URL.");
  if (!row.title || !row.company_name || !row.description) throw new Error("Persisted job is missing required posting data.");
  evidence.persisted = {
    id: row.id,
    ownerUserId: row.owner_user_id,
    sourceUrl: row.source_url,
    title: row.title,
    companyName: row.company_name,
    descriptionLength: row.description.length,
    responsibilityCount: row.responsibilities?.length ?? 0,
    requiredExperienceCount: row.required_experience?.length ?? 0,
  };
} catch (error) {
  failure = error;
} finally {
  if (userId) {
    try {
      await deleteQaUser(userId);
      const [jobs, authUser] = await Promise.all([
        rest(`jobs?owner_user_id=eq.${userId}&select=id`, {}, "Production job cleanup audit"),
        fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
        }),
      ]);
      evidence.cleanup = { jobs: jobs.length, authUserHttp: authUser.status };
      if (jobs.length !== 0 || authUser.status !== 404) {
        throw new Error("Production QA cleanup left disposable data.");
      }
    } catch (cleanupError) {
      failure ??= cleanupError;
    }
  }
}

console.log(JSON.stringify(evidence, null, 2));
if (failure) {
  console.error(failure);
  process.exit(1);
}

#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import { createProfileSeeder } from "./lib/seed-complete-profile.mjs";

if (process.env.PRODUCTION_SCAN_QA_CONFIRM !== "yes") {
  throw new Error(
    "Refusing to create a disposable production account. Set PRODUCTION_SCAN_QA_CONFIRM=yes.",
  );
}

const APP_URL = (
  process.env.PRODUCTION_APP_URL
  ?? "https://www.thejobmarketisadumpsterfire.com"
).replace(/\/$/, "");
const CHROME_EXECUTABLE = process.env.CHROME_EXECUTABLE
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VIEWPORT_WIDTH = Number(process.env.PRODUCTION_SCAN_QA_WIDTH ?? 1280);
const VIEWPORT_HEIGHT = Number(process.env.PRODUCTION_SCAN_QA_HEIGHT ?? 900);

function required(name, fallback) {
  const value = process.env[name]?.trim()
    || (fallback ? process.env[fallback]?.trim() : "");
  if (!value) {
    throw new Error(`Missing ${name}${fallback ? ` or ${fallback}` : ""}`);
  }
  return value;
}

const supabaseUrl = required("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
  .replace(/\/$/, "");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const managementToken = required("SUPABASE_ACCESS_TOKEN");
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const managementUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function responseJson(response, label) {
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return body;
}

async function managementQuery(query, label) {
  const response = await fetch(managementUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${managementToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
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
      user_metadata: { qa_scope: "production_scan_browser" },
    }),
  });
  const body = await responseJson(response, "Disposable scan QA user creation");
  expect(typeof body?.id === "string", "Disposable scan QA user creation returned no id");
  return body.id;
}

async function deleteQaUser(userId) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  await responseJson(response, "Disposable scan QA user deletion");
}

const seedCompleteProfile = createProfileSeeder({ managementQuery, sqlLiteral });

const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const email = `scan-browser-qa-${suffix}@example.invalid`;
const password = randomBytes(30).toString("base64url");
const ids = {
  profileId: randomUUID(),
  roleTrackId: randomUUID(),
  resumeId: randomUUID(),
  workExampleId: randomUUID(),
  skillId: randomUUID(),
};
const commit = process.env.PRODUCTION_COMMIT_SHA
  ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

let userId;
let browser;
let failure;
let cleanup = null;
const evidence = {
  requests: [],
  responses: [],
  consoleErrors: [],
  pageErrors: [],
};

try {
  userId = await createQaUser(email, password);
  await seedCompleteProfile({ userId, email, ...ids });

  const before = await managementQuery(`
    select count(*)::integer as count
    from public.job_scan_results
    where user_id = ${sqlLiteral(userId)}::uuid;
  `, "Pre-scan result count");
  expect(before?.[0]?.count === 0, "QA account did not start with zero scan results");

  browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_EXECUTABLE,
  });
  const context = await browser.newContext({
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
  });
  const page = await context.newPage();

  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/jobs/scan") {
      evidence.requests.push({ method: request.method(), url: request.url() });
    }
  });
  page.on("response", async (response) => {
    if (new URL(response.url()).pathname !== "/api/jobs/scan") return;
    let body = null;
    try {
      body = await response.json();
    } catch {}
    evidence.responses.push({
      status: response.status(),
      jobs: Array.isArray(body?.jobs) ? body.jobs.length : null,
      totalJobs: body?.summary?.totalJobs ?? null,
      reference: body?.scan?.reference ?? body?.reference ?? null,
      vercelRequestId: response.headers()["x-vercel-id"] ?? null,
    });
  });
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));

  await page.goto(`${APP_URL}/onboarding`, { waitUntil: "networkidle" });
  await page.locator("#login-email").fill(email);
  await page.locator("#login-pass").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(
    () => window.localStorage.getItem("dumpster-fire-public-access-token"),
    null,
    { timeout: 20000 },
  );
  await page.goto(`${APP_URL}/dashboard`, { waitUntil: "networkidle" });

  // Regression condition for the Larissa failure: keep the authoritative
  // Supabase session, remove only the compatibility mirror, then use the real
  // production control. A resilient action must restore the token and proceed.
  await page.evaluate(() => {
    window.localStorage.removeItem("dumpster-fire-public-access-token");
  });

  const runButton = page.getByRole("button", { name: "Run scan", exact: true });
  await runButton.waitFor({ state: "visible", timeout: 20000 });
  await runButton.click();
  await Promise.race([
    page.getByRole("heading", { name: "Scan complete", exact: true })
      .waitFor({ timeout: 90000 }),
    page.waitForURL(`${APP_URL}/onboarding`, { timeout: 90000 }).then(() => {
      throw new Error(
        "Run scan returned to onboarding before dispatching the production scan request",
      );
    }),
  ]);

  const after = await managementQuery(`
    select count(*)::integer as count
    from public.job_scan_results
    where user_id = ${sqlLiteral(userId)}::uuid
      and status = 'active';
  `, "Persisted scan result count");
  const persistedCount = after?.[0]?.count ?? -1;

  expect(evidence.requests.length === 1, "Run scan did not dispatch exactly one request");
  expect(evidence.requests[0]?.method === "POST", "Run scan did not dispatch POST");
  expect(evidence.responses[0]?.status === 200, "Production scan did not return HTTP 200");
  expect(persistedCount > 0, "Production scan persisted no active results");
  expect(
    evidence.responses[0]?.totalJobs === persistedCount,
    "Response total did not match persisted active results",
  );
  expect(evidence.consoleErrors.length === 0, "Browser console recorded an error");
  expect(evidence.pageErrors.length === 0, "Browser recorded an uncaught page error");

  await page.getByRole("button", { name: "View matches", exact: true }).click();
  await page.reload({ waitUntil: "networkidle" });
  const bodyText = await page.locator("body").innerText();
  const reloadShowsJobs = new RegExp(`\\b${persistedCount}\\s+active jobs\\b`, "i")
    .test(bodyText);
  expect(reloadShowsJobs, "Reload did not render the persisted active-result count");

  console.log(JSON.stringify({
    status: "passed",
    account: email,
    commit,
    deployment: APP_URL,
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    startedWithResults: 0,
    persistedCount,
    reloadShowsJobs,
    evidence,
  }, null, 2));
} catch (error) {
  failure = error;
  console.error(JSON.stringify({
    status: "failed",
    account: email,
    commit,
    deployment: APP_URL,
    message: error instanceof Error ? error.message : String(error),
    evidence,
  }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (userId) {
    try {
      await deleteQaUser(userId);
      const rows = await managementQuery(`
        select
          (select count(*)::integer from auth.users
            where id = ${sqlLiteral(userId)}::uuid) as auth_users,
          (select count(*)::integer from public.candidate_profiles
            where user_id = ${sqlLiteral(userId)}::uuid) as profiles,
          (select count(*)::integer from public.job_scan_results
            where user_id = ${sqlLiteral(userId)}::uuid) as scan_results;
      `, "Disposable scan QA cleanup audit");
      cleanup = rows?.[0] ?? null;
      expect(
        cleanup
          && cleanup.auth_users === 0
          && cleanup.profiles === 0
          && cleanup.scan_results === 0,
        "Disposable scan QA cleanup left production rows",
      );
    } catch (error) {
      failure ??= error;
      console.error(
        `Disposable scan QA cleanup failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  console.log(JSON.stringify({ cleanup }, null, 2));
}

if (failure) process.exit(1);

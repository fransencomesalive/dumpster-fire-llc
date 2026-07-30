#!/usr/bin/env node

// This check intentionally mutates production with a disposable account. It uses
// the service-role Auth and REST APIs only, so it does not depend on a rotating
// Supabase Management API token. The confirmation variable below is fail-closed.

import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { chromium } from "playwright-core";

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
const expectedDeployment = process.env.PRODUCTION_DEPLOYMENT_ID?.trim() || null;

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

async function seedCompleteProfile({
  userId,
  email,
  profileId,
  roleTrackId,
  resumeId,
  workExampleId,
  skillId,
}) {
  const now = new Date().toISOString();
  await rest("candidate_profiles", { method: "POST", body: {
    id: profileId,
    user_id: userId,
    status: "complete",
    full_name: "Production Scan QA",
    preferred_name: "QA",
    location: "Denver, CO",
    email,
    remote_preference: "remote_preferred",
    target_compensation_min: 90000,
    target_compensation_preferred: 150000,
    generated_markdown: "# Production Scan QA",
    markdown_generated_at: now,
  } }, "Candidate profile seed");
  await rest("candidate_profile_preferences", { method: "POST", body: {
    profile_id: profileId,
    employment_types: ["full_time", "contract"],
    target_industries: ["technology", "consumer"],
    avoid_industries: [],
    avoid_companies: [],
  } }, "Preferences seed");
  await rest("role_tracks", { method: "POST", body: {
    id: roleTrackId,
    profile_id: profileId,
    name: "Marketing Leadership",
    description: "Senior marketing and creative leadership.",
    core_positioning: "Builds practical marketing systems and teams.",
    outreach_angle: "Lead with cross-functional marketing delivery.",
    target_titles: [
      "Director of Marketing",
      "Creative Director",
      "Director of Content",
      "Marketing Program Manager",
    ],
    key_responsibilities: ["Lead marketing strategy", "Manage creative delivery"],
    required_experience_patterns: ["Cross-functional leadership"],
    strong_job_signals: ["Brand", "Content", "Creative"],
    weak_job_signals: [],
    mismatch_signals: ["Entry level"],
  } }, "Role track seed");
  await rest("resumes", { method: "POST", body: {
    id: resumeId,
    profile_id: profileId,
    name: "Production QA resume",
    file_url: "",
    parsed_text: "Marketing leader with extensive brand, content, creative operations, campaign, and cross-functional program experience.",
    highlights: ["Led integrated marketing programs"],
    strengths: ["Marketing leadership", "Creative operations"],
    gaps: [],
    use_when: ["Marketing leadership roles"],
    avoid_when: [],
    parsing_quality: "complete",
    parsing_issues: [],
  } }, "Resume seed");
  await rest("resume_role_tracks", { method: "POST", body: {
    resume_id: resumeId,
    role_track_id: roleTrackId,
  } }, "Resume track seed");
  await rest("work_examples", { method: "POST", body: {
    id: workExampleId,
    profile_id: profileId,
    title: "Integrated campaign",
    one_hitter: "Led a cross-functional campaign from strategy through launch.",
    context: "Aligned brand, content, creative, and delivery teams around a measurable launch plan.",
  } }, "Work example seed");
  await rest("skill_profiles", { method: "POST", body: {
    id: skillId,
    profile_id: profileId,
    skill_name: "Marketing leadership",
    proficiency: "expert",
    evidence: ["Led integrated marketing and creative teams"],
  } }, "Skill seed");
  await rest("skill_work_examples", { method: "POST", body: {
    skill_id: skillId,
    work_example_id: workExampleId,
  } }, "Skill example seed");
  await rest("voice_personality", { method: "POST", body: {
    profile_id: profileId,
    q1_value: "Turning fuzzy marketing plans into work teams can ship.",
    q4_opinion: "Clear strategy matters only when a team can execute it.",
    tone_tags: ["direct", "warm", "specific"],
    avoid_tags: ["corporate jargon"],
    avoid_note: "Avoid generic claims.",
  } }, "Voice seed");
  await rest("writing_samples", { method: "POST", body: [{
    profile_id: profileId,
    bucket: "sounds_like_me",
    channel: "email",
    text: "I like clear plans, honest tradeoffs, and work that gets shipped.",
    tags: ["direct"],
  }, {
    profile_id: profileId,
    bucket: "never_sound",
    channel: "email",
    text: "I am thrilled to leverage synergies and unlock exceptional value.",
    tags: ["corporate"],
  }] }, "Writing samples seed");
  await rest("profile_quality", { method: "POST", body: {
    profile_id: profileId,
    status: "complete",
    incomplete_reasons: [],
    weak_fields: [],
    complete_fields: ["production_browser_qa"],
    weak_response_count: 0,
    last_checked_at: now,
  } }, "Profile quality seed");
  const plans = await rest(
    "subscription_plans?name=eq.premium&select=id&limit=1",
    {},
    "Premium plan lookup",
  );
  expect(typeof plans?.[0]?.id === "string", "Premium plan was not found");
  await rest("user_subscriptions", { method: "POST", body: {
    user_id: userId,
    plan_id: plans[0].id,
    status: "active",
    source: "access_code",
  } }, "Subscription seed");
}

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
let runResult = null;
const evidence = {
  deployment: null,
  requests: [],
  responses: [],
  consoleErrors: [],
  pageErrors: [],
};

try {
  userId = await createQaUser(email, password);
  await seedCompleteProfile({ userId, email, ...ids });

  const before = await rest(
    `job_scan_results?user_id=eq.${userId}&select=id`,
    {},
    "Pre-scan result count",
  );
  expect(before.length === 0, "QA account did not start with zero scan results");

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

  const onboardingResponse = await page.goto(`${APP_URL}/onboarding`, {
    waitUntil: "networkidle",
  });
  const deploymentLink = onboardingResponse?.headers()["link"] ?? "";
  evidence.deployment = deploymentLink.match(/[?&]dpl=(dpl_[^>;]+)/)?.[1] ?? null;
  expect(evidence.deployment, "Production response did not identify its deployment");
  if (expectedDeployment) {
    expect(
      evidence.deployment === expectedDeployment,
      `Expected deployment ${expectedDeployment}, received ${evidence.deployment}`,
    );
  }
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

  const after = await rest(
    `job_scan_results?user_id=eq.${userId}&status=eq.active&select=id`,
    {},
    "Persisted scan result count",
  );
  const persistedCount = after.length;

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

  runResult = {
    account: email,
    commit,
    appUrl: APP_URL,
    deployment: evidence.deployment,
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    startedWithResults: 0,
    persistedCount,
    reloadShowsJobs,
  };
} catch (error) {
  failure = error;
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (userId) {
    try {
      await deleteQaUser(userId);
      const [profiles, scanResults, authUserResponse] = await Promise.all([
        rest(
          `candidate_profiles?user_id=eq.${userId}&select=id`,
          {},
          "Disposable scan QA profile cleanup audit",
        ),
        rest(
          `job_scan_results?user_id=eq.${userId}&select=id`,
          {},
          "Disposable scan QA result cleanup audit",
        ),
        fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        }),
      ]);
      cleanup = {
        authUsers: authUserResponse.status === 404 ? 0 : 1,
        authUserHttp: authUserResponse.status,
        profiles: profiles.length,
        scanResults: scanResults.length,
      };
      expect(
        cleanup.authUsers === 0
          && cleanup.profiles === 0
          && cleanup.scanResults === 0,
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
}

const report = {
  status: failure ? "failed" : "passed",
  ...(runResult ?? {
    account: email,
    commit,
    appUrl: APP_URL,
    deployment: evidence.deployment,
  }),
  ...(failure
    ? { message: failure instanceof Error ? failure.message : String(failure) }
    : {}),
  evidence,
  cleanup,
};

console[failure ? "error" : "log"](JSON.stringify(report, null, 2));
if (failure) process.exit(1);

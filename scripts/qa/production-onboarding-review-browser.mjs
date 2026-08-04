#!/usr/bin/env node

// Production regression for JOB-021 and JOB-022.
// Creates one disposable account, exercises the real No preference persistence
// path, then uses controlled section-save responses to verify the deployed
// onboarding client without invoking the paid resume-highlights provider.

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { chromium } from "playwright-core";

if (process.env.PRODUCTION_ONBOARDING_QA_CONFIRM !== "yes") {
  throw new Error("Refusing to create a disposable production account. Set PRODUCTION_ONBOARDING_QA_CONFIRM=yes.");
}

const APP_URL = (process.env.PRODUCTION_APP_URL ?? "https://www.thejobmarketisadumpsterfire.com").replace(/\/$/, "");
const CHROME_EXECUTABLE = process.env.CHROME_EXECUTABLE
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const EXPECTED_DEPLOYMENT = process.env.PRODUCTION_DEPLOYMENT_ID?.trim() || null;

function required(name, fallback) {
  const value = process.env[name]?.trim() || (fallback ? process.env[fallback]?.trim() : "");
  if (!value) throw new Error(`Missing ${name}${fallback ? ` or ${fallback}` : ""}`);
  return value;
}

const supabaseUrl = required("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");

async function responseJson(response, label) {
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
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

async function createUser(email, password) {
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
      user_metadata: { qa_scope: "production_onboarding_review" },
    }),
  });
  const body = await responseJson(response, "Disposable onboarding QA user creation");
  assert.equal(typeof body?.id, "string", "Disposable user creation returned no id");
  return body.id;
}

async function deleteUser(userId) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  await responseJson(response, "Disposable onboarding QA user deletion");
}

async function grantPlan(userId) {
  const plans = await rest("subscription_plans?name=eq.premium&select=id&limit=1", {}, "Plan lookup");
  assert.equal(typeof plans?.[0]?.id, "string", "Premium plan was not found");
  await rest("user_subscriptions", {
    method: "POST",
    body: {
      user_id: userId,
      plan_id: plans[0].id,
      status: "active",
      source: "access_code",
    },
  }, "Disposable onboarding QA plan grant");
}

const incompleteQuality = {
  status: "incomplete",
  incompleteReasons: [
    "Full name is required.",
    "At least one work example is required.",
    "At least one skill is required.",
    "Voice Q1 is required.",
    "At least one writing sample is required.",
  ],
  weakFields: [],
  weakResponseCount: 0,
  lastCheckedAt: "2026-08-04T12:00:00.000Z",
};

function sectionResponse(section, extras = {}) {
  return {
    status: "ok",
    profileId: "controlled-production-qa",
    profileStatus: "incomplete",
    section,
    profileQuality: incompleteQuality,
    ...extras,
  };
}

async function installControlledCompletionRoutes(page) {
  let tracks = [];
  let resumes = [];
  await page.route("**/api/public-profile/role-tracks", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    tracks = route.request().postDataJSON().roleTracks.map((track, index) => ({
      ...track,
      id: track.id?.startsWith("client-") ? `controlled-track-${index + 1}` : track.id,
    }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sectionResponse({ roleTracks: tracks })) });
  });
  await page.route("**/api/public-profile/resumes", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    resumes = route.request().postDataJSON().resumes.map((resume, index) => ({
      ...resume,
      id: resume.id?.startsWith("client-") ? `controlled-resume-${index + 1}` : resume.id,
    }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sectionResponse(
        { resumes },
        { resumeHighlightCounts: Object.fromEntries(resumes.map((resume) => [resume.id, 3])) },
      )),
    });
  });
  await page.route("**/api/public-profile/voice-personality", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sectionResponse(route.request().postDataJSON())) });
  });
  await page.route("**/api/public-profile/writing-samples", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sectionResponse({ writingSamples: route.request().postDataJSON().writingSamples })),
    });
  });
}

const email = `qa-onboarding-${randomUUID()}@dumpsterfire.test`;
const password = `Qa!${randomBytes(18).toString("base64url")}`;
const evidence = {
  account: email,
  deployment: null,
  remotePreference: null,
  resumeSave: null,
  completionAttempt: null,
  geometry: [],
  consoleErrors: [],
  pageErrors: [],
  cleanup: null,
};

let userId = null;
let browser = null;

try {
  userId = await createUser(email, password);
  await grantPlan(userId);
  browser = await chromium.launch({ headless: true, executablePath: CHROME_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") evidence.consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));

  const response = await page.goto(`${APP_URL}/onboarding`, { waitUntil: "networkidle" });
  const link = response?.headers()["link"] ?? "";
  evidence.deployment = link.match(/[?&]dpl=(dpl_[^>;]+)/)?.[1] ?? null;
  assert(evidence.deployment, "Production response did not identify its deployment");
  if (EXPECTED_DEPLOYMENT) assert.equal(evidence.deployment, EXPECTED_DEPLOYMENT);

  await page.locator("#login-email").fill(email);
  await page.locator("#login-pass").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Save Identity & Search" }).waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some(
    (button) => button.textContent?.trim() === "Save Identity & Search" && !button.disabled,
  ));

  const remoteSelect = page.locator("label", { hasText: "Remote preference" }).locator("select");
  assert.equal(await remoteSelect.count(), 1, "Expected exactly one Remote preference control");
  assert.equal(await remoteSelect.isEnabled(), true, "Remote preference control was still disabled");
  await remoteSelect.selectOption("no_preference");
  assert.equal(await remoteSelect.inputValue(), "no_preference", "Remote preference control did not select No preference");
  await page.waitForTimeout(100);
  const identityRequest = page.waitForRequest((item) => item.url().endsWith("/api/public-profile/identity-search") && item.method() === "PATCH");
  const identitySave = page.waitForResponse((item) => item.url().endsWith("/api/public-profile/identity-search") && item.request().method() === "PATCH");
  await page.getByRole("button", { name: "Save Identity & Search" }).click();
  const [savedRequest, savedResponse] = await Promise.all([identityRequest, identitySave]);
  const savedRequestBody = savedRequest.postDataJSON();
  const savedResponseBody = await savedResponse.json();
  assert.equal(savedRequestBody.remotePreference, "no_preference", `No preference PATCH sent ${savedRequestBody.remotePreference}`);
  assert.equal(savedResponse.status(), 200, "No preference save did not return HTTP 200");
  assert.equal(savedResponseBody?.section?.remotePreference, "no_preference", `No preference PATCH returned ${savedResponseBody?.section?.remotePreference}`);
  await page.getByText("Identity & Search saved.", { exact: true }).waitFor();
  assert.equal(await page.locator("#profile-review").count(), 0, "Intermediate identity save opened the review panel");

  const savedProfile = await rest(
    `candidate_profiles?user_id=eq.${userId}&select=remote_preference`,
    {},
    "No preference production readback",
  );
  assert.equal(savedProfile?.[0]?.remote_preference, "no_preference");
  evidence.remotePreference = {
    patchStatus: 200,
    request: savedRequestBody.remotePreference,
    response: savedResponseBody.section.remotePreference,
    readback: savedProfile[0].remote_preference,
  };

  await installControlledCompletionRoutes(page);
  await page.locator("#card1-track-name").fill("Program Management");
  await page.locator("#card1-title-input").fill("Program Manager");
  await page.locator("#card1-title-input").press("Enter");
  await page.locator("textarea[placeholder='Or paste your resume text here…']").fill(
    "Program manager leading cross-functional planning, delivery, risk, and executive reporting.",
  );
  await page.getByRole("button", { name: "Save Role Track & Resume" }).click();
  await page.getByText("Role Track & Resume saved.", { exact: true }).waitFor();
  assert.equal(await page.locator("#profile-review").count(), 0, "Resume save opened the review panel");
  const afterResumeBadges = await page.locator("aside[aria-label='Profile sections'] [class*='readinessBadge']").allTextContents();
  assert(afterResumeBadges.every((label) => ["Complete", "In progress"].includes(label.trim())), `Resume save exposed error badges: ${afterResumeBadges}`);
  evidence.resumeSave = { reviewVisible: false, badges: afterResumeBadges };

  await page.getByRole("button", { name: "Save Voice & Personality" }).click();
  await page.locator("#profile-review").waitFor();
  const finalBadges = await page.locator("aside[aria-label='Profile sections'] [class*='readinessBadge']").allTextContents();
  assert(finalBadges.some((label) => label.trim() === "Needs work"), `Completion attempt did not reveal missing sections: ${finalBadges}`);
  evidence.completionAttempt = { reviewVisible: true, badges: finalBadges };

  for (const width of [320, 375, 390, 1280, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 900 : 1000 });
    const geometry = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    assert(geometry.documentWidth <= width && geometry.bodyWidth <= width, `Horizontal overflow at ${width}px`);
    evidence.geometry.push(geometry);
  }
  assert.deepEqual(evidence.consoleErrors, []);
  assert.deepEqual(evidence.pageErrors, []);
} finally {
  if (browser) await browser.close();
  if (userId) {
    await deleteUser(userId);
    const [profiles, subscriptions] = await Promise.all([
      rest(`candidate_profiles?user_id=eq.${userId}&select=id`, {}, "Profile cleanup audit"),
      rest(`user_subscriptions?user_id=eq.${userId}&select=id`, {}, "Subscription cleanup audit"),
    ]);
    assert.equal(profiles.length, 0, "Disposable candidate profile was not removed");
    assert.equal(subscriptions.length, 0, "Disposable subscription was not removed");
    evidence.cleanup = { authUserDeleted: true, profiles: 0, subscriptions: 0 };
  }
}

console.log(JSON.stringify({ status: "passed", ...evidence }, null, 2));

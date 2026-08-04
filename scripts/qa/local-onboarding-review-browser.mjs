#!/usr/bin/env node

// Local browser regression for JOB-021 and JOB-022.
//
// The browser receives a fake local session and mocked API responses, so this
// test exercises the real onboarding component without touching production
// accounts or data. Run it while the local app is available at APP_URL.

import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const APP_URL = (process.env.APP_URL ?? "http://127.0.0.1:3020").replace(/\/$/, "");
const CHROME_EXECUTABLE = process.env.CHROME_EXECUTABLE
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACT_DIR = process.env.QA_ARTIFACT_DIR ?? "/tmp/dumpster-fire-onboarding-qa";

const incompleteQuality = {
  status: "incomplete",
  incompleteReasons: [
    "At least one role track is required.",
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

const afterResumeQuality = {
  ...incompleteQuality,
  incompleteReasons: incompleteQuality.incompleteReasons.filter(
    (reason) => !reason.toLowerCase().includes("role track"),
  ),
};

const identity = {
  fullName: "",
  preferredName: "",
  location: "",
  email: "qa@example.test",
  remotePreference: "remote_preferred",
  employmentTypes: [],
  targetIndustries: [],
  avoidIndustries: [],
  avoidCompanies: [],
};

const emptyVoice = {
  q1Value: "",
  q4Opinion: "",
  toneTags: [],
  avoidTags: [],
  avoidNote: "",
};

function sectionResponse(section, profileQuality = incompleteQuality, extras = {}) {
  return {
    status: "ok",
    profileId: "qa-profile",
    profileStatus: profileQuality.status,
    section,
    profileQuality,
    ...extras,
  };
}

async function installApiMocks(page) {
  let savedTracks = [];
  let savedResumes = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = request.postDataJSON?.() ?? null;

    let payload;
    if (path === "/api/account/plan") {
      payload = { email: "qa@example.test", planName: "Smoldering" };
    } else if (path === "/api/public-profile/bootstrap") {
      payload = { profileStatus: "incomplete", profileQuality: incompleteQuality };
    } else if (path === "/api/public-profile/identity-search") {
      payload = sectionResponse(method === "PATCH" ? body : identity);
    } else if (path === "/api/public-profile/role-tracks") {
      if (method === "PATCH") savedTracks = body.roleTracks;
      const quality = savedTracks.some((track) => track.resumeIds?.length > 0)
        ? afterResumeQuality
        : incompleteQuality;
      payload = sectionResponse({ roleTracks: savedTracks }, quality);
    } else if (path === "/api/public-profile/resumes") {
      if (method === "PATCH") {
        savedResumes = body.resumes.map((resume, index) => ({
          ...resume,
          id: resume.id?.startsWith("client-") ? `resume-${index + 1}` : resume.id,
        }));
      }
      payload = sectionResponse(
        { resumes: savedResumes },
        afterResumeQuality,
        { resumeHighlightCounts: Object.fromEntries(savedResumes.map((resume) => [resume.id, 3])) },
      );
    } else if (path === "/api/public-profile/work-examples") {
      payload = sectionResponse({ workExamples: method === "PATCH" ? body.workExamples : [] });
    } else if (path === "/api/public-profile/skills") {
      payload = sectionResponse({ skills: method === "PATCH" ? body.skills : [] });
    } else if (path === "/api/public-profile/voice-personality") {
      payload = sectionResponse(method === "PATCH" ? body : emptyVoice, afterResumeQuality);
    } else if (path === "/api/public-profile/writing-samples") {
      payload = sectionResponse(
        { writingSamples: method === "PATCH" ? body.writingSamples : [] },
        afterResumeQuality,
      );
    } else if (path.startsWith("/api/catalogues/")) {
      payload = { items: [] };
    } else {
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
}

async function pageGeometry(page) {
  return page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    reviewVisible: Boolean(document.querySelector("#profile-review")),
  }));
}

await mkdir(ARTIFACT_DIR, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: CHROME_EXECUTABLE });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => {
  window.localStorage.setItem("dumpster-fire-public-access-token", "local-qa-token");
});
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(error.message));
await installApiMocks(page);

try {
  await page.goto(`${APP_URL}/onboarding`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Save Identity & Search" }).waitFor();

  const remoteOptions = await page.locator("label", { hasText: "Remote preference" }).locator("option").allTextContents();
  assert(remoteOptions.includes("No preference"), "Remote preference is missing No preference");

  const initialBadges = await page.locator("aside[aria-label='Profile sections'] [class*='readinessBadge']").allTextContents();
  assert(initialBadges.every((label) => label.trim() === "In progress"), `Expected quiet initial badges, received ${initialBadges}`);
  assert.equal(await page.locator("#profile-review").count(), 0, "Review panel appeared before any completion attempt");

  await page.locator("#card1-track-name").fill("Program Management");
  await page.locator("textarea[placeholder='Or paste your resume text here…']").fill(
    "Program manager with ten years of experience leading cross-functional planning and delivery.",
  );
  await page.getByRole("button", { name: "Save Role Track & Resume" }).click();
  await page.getByText("Role Track & Resume saved.", { exact: true }).waitFor();

  assert.equal(await page.locator("#profile-review").count(), 0, "Resume save opened the whole-profile review panel");
  const afterResumeBadges = await page.locator("aside[aria-label='Profile sections'] [class*='readinessBadge']").allTextContents();
  assert.equal(afterResumeBadges[0]?.trim(), "Complete", `Role Track badge did not complete: ${afterResumeBadges}`);
  assert(afterResumeBadges.slice(1).every((label) => label.trim() === "In progress"), `Later sections were flagged too early: ${afterResumeBadges}`);

  await page.getByRole("button", { name: "Save Voice & Personality" }).click();
  await page.locator("#profile-review").waitFor();
  const finalBadges = await page.locator("aside[aria-label='Profile sections'] [class*='readinessBadge']").allTextContents();
  assert(finalBadges.slice(1).every((label) => label.trim() === "Needs work"), `Final completion attempt did not reveal missing fields: ${finalBadges}`);

  const viewports = [320, 375, 390, 1280, 1440];
  const geometry = [];
  for (const width of viewports) {
    await page.setViewportSize({ width, height: width < 600 ? 900 : 1000 });
    await page.waitForTimeout(100);
    const measured = await pageGeometry(page);
    assert(
      measured.documentWidth <= width && measured.bodyWidth <= width,
      `Horizontal overflow at ${width}px: ${JSON.stringify(measured)}`,
    );
    await page.screenshot({
      path: `${ARTIFACT_DIR}/onboarding-${width}.png`,
      fullPage: true,
    });
    geometry.push(measured);
  }

  assert.deepEqual(consoleErrors, [], `Browser console errors: ${consoleErrors.join("\n")}`);
  assert.deepEqual(pageErrors, [], `Browser page errors: ${pageErrors.join("\n")}`);
  console.log(JSON.stringify({
    status: "passed",
    appUrl: APP_URL,
    artifactDir: ARTIFACT_DIR,
    remoteOptions,
    initialBadges,
    afterResumeBadges,
    finalBadges,
    geometry,
  }, null, 2));
} finally {
  await browser.close();
}

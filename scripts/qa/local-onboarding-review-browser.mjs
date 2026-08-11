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

const savedWorkExample = {
  id: "example-1",
  title: "Launch operating system",
  oneHitter: "Built the operating system behind a complex launch.",
  context: "Coordinated teams, timelines, and production risk.",
  link: "https://example.com/launch",
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

const savedSkill = {
  id: "skill-1",
  skillName: "Program Management",
  proficiency: "strong",
  evidence: ["Led 14 workstreams without a missed launch"],
  relatedWorkExampleIds: [savedWorkExample.id],
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
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
  let savedWorkExamples = [savedWorkExample];
  let savedSkills = [savedSkill];
  const skillPatchBodies = [];

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
      if (method === "PATCH") savedWorkExamples = body.workExamples;
      payload = sectionResponse({ workExamples: savedWorkExamples });
    } else if (path === "/api/public-profile/skills") {
      if (method === "PATCH") {
        skillPatchBodies.push(body);
        savedSkills = body.skills;
      }
      payload = sectionResponse({ skills: savedSkills });
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

  return {
    skillPatchBodies,
    get savedSkills() { return savedSkills; },
  };
}

async function pageGeometry(page) {
  return page.evaluate(() => {
    function paintedHorizontalEdges(element) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      let paintedLeft = rect.left;
      let paintedRight = rect.right;

      for (const shadow of style.boxShadow.matchAll(/(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px(?:\s+(\d+(?:\.\d+)?)px)?(?:\s+(-?\d+(?:\.\d+)?)px)?/g)) {
        const offsetX = Number(shadow[1]);
        const blur = Number(shadow[3] || 0);
        const spread = Number(shadow[4] || 0);
        paintedLeft = Math.min(paintedLeft, rect.left + offsetX - blur - spread);
        paintedRight = Math.max(paintedRight, rect.right + offsetX + blur + spread);
      }

      const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
      const outlineOffset = Number.parseFloat(style.outlineOffset) || 0;
      const outlineExtent = Math.max(0, outlineWidth + outlineOffset);

      return {
        paintedLeft: paintedLeft - outlineExtent,
        paintedRight: paintedRight + outlineExtent,
      };
    }

    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      reviewVisible: Boolean(document.querySelector("#profile-review")),
      skillControlPaintedEdges: [...document.querySelectorAll("#career-profile-skills select, #career-profile-skills button")]
        .filter((element) => element instanceof HTMLElement && element.offsetParent !== null)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            label: element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName,
            left: rect.left,
            right: rect.right,
            ...paintedHorizontalEdges(element),
            boxShadow: style.boxShadow,
            outlineWidth: style.outlineWidth,
            outlineOffset: style.outlineOffset,
            borderLeftWidth: style.borderLeftWidth,
            borderRightWidth: style.borderRightWidth,
          };
        }),
    };
  });
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
const apiState = await installApiMocks(page);

try {
  await page.goto(`${APP_URL}/onboarding`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Save Identity & Search" }).waitFor();

  const remoteOptions = await page.locator("label", { hasText: "Remote preference" }).locator("option").allTextContents();
  assert(remoteOptions.includes("No preference"), "Remote preference is missing No preference");

  const initialBadges = await page.locator("aside[aria-label='Profile sections'] [class*='readinessBadge']").allTextContents();
  assert(initialBadges.every((label) => label.trim() === "In progress"), `Expected quiet initial badges, received ${initialBadges}`);
  assert.equal(await page.locator("#profile-review").count(), 0, "Review panel appeared before any completion attempt");

  const skillsCard = page.locator("#career-profile-skills");
  await skillsCard.getByRole("button").filter({ hasText: "Program Management" }).click();
  await skillsCard.getByRole("button", { name: "Edit proficiency" }).click();
  let proficiencyField = skillsCard.locator("[class*='entryField']").filter({ hasText: "Proficiency" }).first();
  await proficiencyField.getByRole("combobox", { name: "Proficiency" }).selectOption("expert");
  await proficiencyField.getByRole("button", { name: "Discard", exact: true }).click();
  assert.equal(apiState.skillPatchBodies.length, 0, "Discard persisted a proficiency change");
  assert.match(await proficiencyField.innerText(), /Strong/i, "Discard changed the saved proficiency");

  await skillsCard.getByRole("button", { name: "Edit proficiency" }).click();
  proficiencyField = skillsCard.locator("[class*='entryField']").filter({ hasText: "Proficiency" }).first();
  await proficiencyField.getByRole("combobox", { name: "Proficiency" }).selectOption("expert");
  const skillSaveRequest = page.waitForRequest((request) => (
    request.url().endsWith("/api/public-profile/skills") && request.method() === "PATCH"
  ));
  await proficiencyField.getByRole("button", { name: "Save", exact: true }).click();
  await skillSaveRequest;
  await page.getByText("Skills saved.", { exact: true }).waitFor();
  assert.equal(apiState.skillPatchBodies.length, 1);
  const persistedSkill = apiState.skillPatchBodies[0].skills.find((skill) => skill.id === savedSkill.id);
  assert.equal(persistedSkill.proficiency, "expert");
  assert.deepEqual(persistedSkill.evidence, savedSkill.evidence);
  assert.deepEqual(persistedSkill.relatedWorkExampleIds, savedSkill.relatedWorkExampleIds);
  assert.equal(persistedSkill.createdAt, savedSkill.createdAt);
  assert.equal(apiState.savedSkills.find((skill) => skill.id === savedSkill.id).proficiency, "expert");

  await page.waitForTimeout(600);
  await page.reload({ waitUntil: "networkidle" });
  const reloadedSkillRow = page.locator("#career-profile-skills").getByRole("button").filter({ hasText: "Program Management" });
  assert.match(await reloadedSkillRow.innerText(), /Expert/i, "Reload did not preserve the edited proficiency");

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
  await reloadedSkillRow.click();
  await page.locator("#career-profile-skills").getByRole("button", { name: "Edit proficiency" }).click();
  for (const width of viewports) {
    await page.setViewportSize({ width, height: width < 600 ? 900 : 1000 });
    await page.waitForTimeout(100);
    const measured = await pageGeometry(page);
    assert(
      measured.documentWidth <= width && measured.bodyWidth <= width,
      `Horizontal overflow at ${width}px: ${JSON.stringify(measured)}`,
    );
    assert(
      measured.skillControlPaintedEdges.every((control) => control.paintedLeft >= 0 && control.paintedRight <= width),
      `A painted skill control crossed the viewport at ${width}px: ${JSON.stringify(measured.skillControlPaintedEdges)}`,
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

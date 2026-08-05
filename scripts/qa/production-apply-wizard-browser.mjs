#!/usr/bin/env node

// Authenticated production regression for the complete Apply Wizard journey.
//
// This intentionally creates a disposable account and uses live posting,
// contact-discovery, and outreach providers. It is not part of release:check.
// Run only after a production deployment:
//
//   PRODUCTION_APPLY_WIZARD_QA_CONFIRM=yes \
//   PRODUCTION_DEPLOYMENT_ID=dpl_... \
//   npm run qa:production-apply-wizard
//
// Optional overrides:
//   PRODUCTION_APP_URL, PRODUCTION_COMMIT_SHA,
//   PRODUCTION_APPLY_WIZARD_POSTING_URL, CHROME_EXECUTABLE

import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { chromium } from "playwright-core";

if (process.env.PRODUCTION_APPLY_WIZARD_QA_CONFIRM !== "yes") {
  throw new Error("Set PRODUCTION_APPLY_WIZARD_QA_CONFIRM=yes to create a disposable production QA account.");
}

const APP_URL = (
  process.env.PRODUCTION_APP_URL
  ?? "https://www.thejobmarketisadumpsterfire.com"
).replace(/\/$/, "");
const POSTING_URL = process.env.PRODUCTION_APPLY_WIZARD_POSTING_URL
  ?? "https://www.ontra.ai/job/director-product-operations/?utm_source=linkedin&utm_medium=organic-social&ashby_jid=2bc6602d-5d42-4a8b-8b56-6d496f0a5ece";
const CHROME_EXECUTABLE = process.env.CHROME_EXECUTABLE
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const commit = process.env.PRODUCTION_COMMIT_SHA
  ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const expectedDeployment = process.env.PRODUCTION_DEPLOYMENT_ID?.trim() || null;

function required(name, fallback) {
  const value = process.env[name]?.trim() || (fallback ? process.env[fallback]?.trim() : "");
  if (!value) throw new Error(`Missing ${name}${fallback ? ` or ${fallback}` : ""}`);
  return value;
}

const supabaseUrl = required("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function responseJson(response, label) {
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}: ${text.slice(0, 800)}`);
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
      user_metadata: { qa_scope: "production_apply_wizard_hardening" },
    }),
  });
  const body = await responseJson(response, "Production QA user creation");
  expect(typeof body?.id === "string", "Production QA user creation returned no id");
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
  await responseJson(response, "Production QA user deletion");
}

async function seedCompleteProfile({ userId, email, profileId, roleTrackId, resumeId, workExampleId, skillId }) {
  const now = new Date().toISOString();
  await rest("candidate_profiles", { method: "POST", body: {
    id: profileId,
    user_id: userId,
    status: "complete",
    full_name: "Production Apply Wizard QA",
    preferred_name: "QA",
    location: "Denver, CO",
    email,
    remote_preference: "remote_preferred",
    target_compensation_min: 90000,
    target_compensation_preferred: 150000,
    generated_markdown: [
      "# Production Apply Wizard QA",
      "",
      "## Voice Profile",
      "Direct, warm, and specific. Likes clear plans, honest tradeoffs, and work that gets shipped.",
      "",
      "## Role Track",
      "Program Manager focused on product operations and cross-functional delivery.",
      "",
      "## Resume",
      "Led cross-functional operating programs and built practical delivery systems.",
      "",
      "## Work Examples",
      `### Museum typography study (${workExampleId})`,
      "Catalogued letterform details across a regional museum archive.",
      "Documented historical print typography for a personal reference collection.",
    ].join("\n"),
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
    name: "Program Manager",
    description: "Senior program and product operations leadership.",
    core_positioning: "Builds practical operating systems and cross-functional programs.",
    outreach_angle: "Lead with cross-functional delivery.",
    target_titles: ["Program Manager", "Director of Product Operations", "Product Operations Director"],
    key_responsibilities: ["Lead operating cadence", "Manage cross-functional delivery"],
    required_experience_patterns: ["Cross-functional leadership"],
    strong_job_signals: ["Product operations", "Program leadership"],
    weak_job_signals: [],
    mismatch_signals: ["Entry level"],
  } }, "Role track seed");
  await rest("resumes", { method: "POST", body: {
    id: resumeId,
    profile_id: profileId,
    name: "Production QA resume",
    file_url: "",
    parsed_text: "Program leader with product operations and cross-functional delivery experience.",
    highlights: ["Led cross-functional operating programs"],
    strengths: ["Program leadership", "Product operations"],
    gaps: [],
    use_when: ["Program and product operations roles"],
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
    title: "Museum typography study",
    one_hitter: "Catalogued letterform details across a regional museum archive.",
    context: "Documented historical print typography for a personal reference collection.",
  } }, "Work example seed");
  await rest("skill_profiles", { method: "POST", body: {
    id: skillId,
    profile_id: profileId,
    skill_name: "Print typography research",
    proficiency: "expert",
    evidence: ["Catalogued historical letterforms"],
  } }, "Skill seed");
  await rest("skill_work_examples", { method: "POST", body: {
    skill_id: skillId,
    work_example_id: workExampleId,
  } }, "Skill example seed");
  await rest("voice_personality", { method: "POST", body: {
    profile_id: profileId,
    q1_value: "Turning fuzzy plans into work teams can ship.",
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
    complete_fields: ["production_apply_wizard_qa"],
    weak_response_count: 0,
    last_checked_at: now,
  } }, "Profile quality seed");
  const plans = await rest("subscription_plans?name=eq.premium&select=id&limit=1", {}, "Premium plan lookup");
  expect(typeof plans?.[0]?.id === "string", "Premium plan was not found");
  await rest("user_subscriptions", { method: "POST", body: {
    user_id: userId,
    plan_id: plans[0].id,
    status: "active",
    source: "access_code",
  } }, "Subscription seed");
}

async function assertApiResponse(response, label) {
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  expect(response.ok(), `${label} returned HTTP ${response.status()}: ${text.slice(0, 1000)}`);
  return {
    label,
    status: response.status(),
    vercelId: response.headers()["x-vercel-id"] ?? null,
    bodyStatus: body?.status ?? null,
    pursuitId: body?.pursuit?.id ?? null,
    contactCount: Array.isArray(body?.contacts) ? body.contacts.length : null,
    messageCount: Array.isArray(body?.messages) ? body.messages.length : body?.message ? 1 : null,
  };
}

async function replayBrowserRequest(page, path, body) {
  return page.evaluate(async ({ path, body }) => {
    const accessToken = window.localStorage.getItem("dumpster-fire-public-access-token");
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { path, body });
}

const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const email = `apply-wizard-production-${suffix}@example.invalid`;
const password = randomBytes(30).toString("base64url");
const ids = {
  profileId: randomUUID(),
  roleTrackId: randomUUID(),
  resumeId: randomUUID(),
  workExampleId: randomUUID(),
  skillId: randomUUID(),
};

let userId;
let pursuitId;
let browser;
let failure;
const evidence = {
  account: email,
  status: "running",
  commit,
  deployment: null,
  appUrl: APP_URL,
  requests: [],
  persisted: null,
  reload: null,
  partialRetry: null,
  responsive: [],
  cleanup: null,
  consoleErrors: [],
  pageErrors: [],
};

try {
  userId = await createQaUser(email, password);
  await seedCompleteProfile({ userId, email, ...ids });

  browser = await chromium.launch({ headless: true, executablePath: CHROME_EXECUTABLE });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));

  const onboardingResponse = await page.goto(`${APP_URL}/onboarding`, { waitUntil: "networkidle" });
  const deploymentLink = onboardingResponse?.headers()["link"] ?? "";
  evidence.deployment = deploymentLink.match(/[?&]dpl=(dpl_[^>;]+)/)?.[1] ?? null;
  if (expectedDeployment) {
    expect(
      evidence.deployment === expectedDeployment,
      `Expected deployment ${expectedDeployment}, received ${evidence.deployment ?? "unknown"}`,
    );
  }
  await page.locator("#login-email").fill(email);
  await page.locator("#login-pass").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(
    () => window.localStorage.getItem("dumpster-fire-public-access-token"),
    null,
    { timeout: 30000 },
  );
  await page.goto(`${APP_URL}/dashboard`, { waitUntil: "networkidle" });

  const postingInput = page.getByPlaceholder("Paste a job posting link");
  await postingInput.waitFor({ state: "visible", timeout: 30000 });
  await postingInput.fill(POSTING_URL);
  const fromLinkPromise = page.waitForResponse(
    (response) => response.url().includes("/api/jobs/from-link") && response.request().method() === "POST",
    { timeout: 120000 },
  );
  await postingInput.press("Enter");
  evidence.requests.push(await assertApiResponse(await fromLinkPromise, "POST /api/jobs/from-link"));

  const dialog = page.getByRole("dialog", { name: /Human Path:/ });
  await dialog.waitFor({ state: "visible", timeout: 90000 });
  await dialog.getByText("Job review", { exact: true }).waitFor({ timeout: 30000 });
  const reviewText = await dialog.innerText();
  expect(
    !/Probably Not Worth Your Time\.\s*Probably not worth your time/i.test(reviewText),
    "Fit verdict is still duplicated",
  );

  const humanPathPromise = page.waitForResponse(
    (response) => response.url().includes("/api/public-profile/pursuits/human-path")
      && response.request().method() === "POST",
    { timeout: 240000 },
  );
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  const humanPathResponse = await humanPathPromise;
  const humanPathRequestBody = humanPathResponse.request().postDataJSON();
  pursuitId = humanPathRequestBody?.pursuitId;
  expect(typeof pursuitId === "string", "Human Path request did not include a pursuit id");
  evidence.requests.push(await assertApiResponse(humanPathResponse, "POST /api/public-profile/pursuits/human-path"));

  await dialog.getByText(/Found \d+ potential contacts?\./).waitFor({ timeout: 30000 });
  const contactInputs = dialog.locator('label input[type="checkbox"]');
  const availableContactCount = await contactInputs.count();
  expect(availableContactCount >= 2, "Human Path returned fewer than two selectable contacts");
  for (let index = 0; index < availableContactCount; index += 1) {
    if (await contactInputs.nth(index).isChecked()) await contactInputs.nth(index).uncheck();
  }
  await contactInputs.nth(0).check();
  await contactInputs.nth(1).check();

  const contactsPromise = page.waitForResponse(
    (response) => response.url().includes("/api/public-profile/pursuits/contacts")
      && response.request().method() === "POST",
    { timeout: 60000 },
  );
  const outreachPromise = page.waitForResponse(
    (response) => response.url().includes("/api/public-profile/pursuits/outreach")
      && response.request().method() === "POST"
      && response.request().postData()?.includes('"regenerate":true') !== true,
    { timeout: 240000 },
  );
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  evidence.requests.push(await assertApiResponse(await contactsPromise, "POST /api/public-profile/pursuits/contacts"));
  const outreachResponse = await outreachPromise;
  evidence.requests.push(await assertApiResponse(outreachResponse, "POST /api/public-profile/pursuits/outreach"));

  const messageTextareas = dialog.locator("textarea");
  await messageTextareas.first().waitFor({ state: "visible", timeout: 30000 });
  const initialMessages = await messageTextareas.evaluateAll((nodes) => nodes.map((node) => node.value));
  expect(initialMessages.length > 0, "Outreach rendered no draft messages");
  expect(!initialMessages.some((message) => message.includes("—")), "A generated message contains an em dash");
  expect(!/Outreach generation not configured|No drafts yet/i.test(await dialog.innerText()), "Outreach showed the old false-empty state");

  const regenerateButton = dialog.getByRole("button", { name: "Regenerate", exact: true }).first();
  const regenerationPromise = page.waitForResponse(
    (response) => response.url().includes("/api/public-profile/pursuits/outreach")
      && response.request().method() === "POST"
      && response.request().postData()?.includes('"regenerate":true') === true,
    { timeout: 240000 },
  );
  await regenerateButton.click();
  const regenerationResponse = await regenerationPromise;
  const regenerationBody = regenerationResponse.request().postDataJSON();
  evidence.requests.push(await assertApiResponse(regenerationResponse, "POST /api/public-profile/pursuits/outreach regeneration"));
  await page.waitForFunction(
    (previous) => {
      const textarea = document.querySelector('[role="dialog"] textarea');
      return textarea instanceof HTMLTextAreaElement && textarea.value !== previous;
    },
    initialMessages[0],
    { timeout: 30000 },
  );
  const regeneratedMessage = await messageTextareas.first().inputValue();
  expect(!regeneratedMessage.includes("—"), "The regenerated message contains an em dash");

  const regenerationReplay = await replayBrowserRequest(
    page,
    "/api/public-profile/pursuits/outreach",
    regenerationBody,
  );
  expect(regenerationReplay.status === 200, `Regeneration exact retry returned HTTP ${regenerationReplay.status}`);
  evidence.requests.push({ label: "POST /api/public-profile/pursuits/outreach regeneration exact replay", status: regenerationReplay.status });

  const [pursuits, contacts, messages, generationRequests, regenerationRequests, events, usage] = await Promise.all([
    rest(`pursuits?id=eq.${pursuitId}&user_id=eq.${userId}&select=id,status,selected_role_track_id,tracking_started_at`, {}, "Pursuit persistence audit"),
    rest(`contact_suggestions?pursuit_id=eq.${pursuitId}&select=id,contact_type,selected_for_outreach`, {}, "Contact persistence audit"),
    rest(`outreach_messages?pursuit_id=eq.${pursuitId}&select=id,contact_suggestion_id,generation_request_id,message,previous_message,regeneration_count,status`, {}, "Message persistence audit"),
    rest(`pursuit_outreach_generation_requests?pursuit_id=eq.${pursuitId}&select=id,idempotency_key`, {}, "Initial generation request audit"),
    rest(`pursuit_outreach_regeneration_requests?pursuit_id=eq.${pursuitId}&select=id,idempotency_key,message_id`, {}, "Regeneration request audit"),
    rest(`pursuit_events?pursuit_id=eq.${pursuitId}&select=id,event_type`, {}, "Pursuit event audit"),
    rest(`usage_ledger?related_pursuit_id=eq.${pursuitId}&select=id,usage_type,outreach_generation_request_id,outreach_regeneration_request_id`, {}, "Usage audit"),
  ]);
  expect(pursuits.length === 1 && pursuits[0].status === "outreach_ready", "Pursuit did not persist as outreach_ready");
  expect(contacts.length > 0 && contacts.some((contact) => contact.selected_for_outreach), "Selected contacts were not persisted");
  expect(messages.length === initialMessages.length, "Persisted message count does not match rendered drafts");
  expect(messages.some((message) => message.regeneration_count === 1), "Regenerated message was not persisted in place");
  const persistedRegeneratedMessage = messages.find((message) => message.regeneration_count === 1)?.message;
  expect(typeof persistedRegeneratedMessage === "string", "The persisted regenerated message has no text");
  expect(generationRequests.length === initialMessages.length, "Initial generation did not persist one request per contact");
  expect(new Set(generationRequests.map((request) => request.idempotency_key)).size === generationRequests.length, "Per-contact generation keys are not unique");
  expect(regenerationRequests.length === 1, "Regeneration exact retry duplicated or lost its request");
  expect(events.filter((event) => event.event_type === "outreach_generated").length === initialMessages.length + 1, "Outreach events are not one per initial contact plus regeneration");
  evidence.persisted = {
    pursuitCount: pursuits.length,
    contactCount: contacts.length,
    selectedContactCount: contacts.filter((contact) => contact.selected_for_outreach).length,
    messageCount: messages.length,
    generationRequestCount: generationRequests.length,
    regenerationRequestCount: regenerationRequests.length,
    outreachEventCount: events.filter((event) => event.event_type === "outreach_generated").length,
    usageRows: usage.length,
  };

  const removedMessage = messages.find((message) => message.regeneration_count === 0 && message.generation_request_id);
  expect(removedMessage, "No second contact draft was available for the partial-retry setup");
  await rest(`outreach_messages?id=eq.${removedMessage.id}`, { method: "DELETE" }, "Partial-retry message removal");
  await rest(`pursuit_outreach_generation_requests?id=eq.${removedMessage.generation_request_id}`, { method: "DELETE" }, "Partial-retry request removal");

  await page.goto(`${APP_URL}/saved-pursuits`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Director, Product Operations/ }).waitFor({ state: "visible", timeout: 30000 });
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  const resumedDialog = page.getByRole("dialog", { name: /Human Path:/ });
  await resumedDialog.waitFor({ state: "visible", timeout: 30000 });
  await resumedDialog.locator('button[aria-current="step"]').filter({ hasText: "OUTREACH" }).waitFor({ timeout: 10000 });
  await resumedDialog.locator("textarea").first().waitFor({ state: "visible", timeout: 30000 });
  await resumedDialog.getByRole("button", { name: "Try again", exact: true }).waitFor({ state: "visible", timeout: 10000 });
  const partialMessages = await resumedDialog.locator("textarea").evaluateAll((nodes) => nodes.map((node) => node.value));
  expect(partialMessages.length === messages.length - 1, "Partial resume did not preserve only the successful contact drafts");
  expect(partialMessages.includes(persistedRegeneratedMessage), "Partial resume lost the persisted regenerated successful draft");

  for (const width of [320, 375, 390, 1280, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 900 : 1000 });
    await page.waitForTimeout(150);
    const geometry = await page.evaluate(() => {
      const overlay = document.querySelector('[role="dialog"]');
      const modal = overlay?.firstElementChild?.firstElementChild;
      const box = modal?.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        paintedLeft: box?.left ?? null,
        paintedRight: box ? box.right + 6 : null,
      };
    });
    expect(geometry.documentScrollWidth <= geometry.viewportWidth, `Horizontal overflow at ${width}px`);
    expect(geometry.paintedLeft !== null && geometry.paintedLeft >= 0, `Dialog paints left of the viewport at ${width}px`);
    expect(geometry.paintedRight !== null && geometry.paintedRight <= geometry.viewportWidth, `Dialog paints right of the viewport at ${width}px`);
    const screenshot = `/tmp/job-023-partial-${width}.png`;
    await page.screenshot({ path: screenshot });
    evidence.responsive.push({ width, screenshot, ...geometry });
  }

  const retryPromise = page.waitForResponse(
    (response) => response.url().includes("/api/public-profile/pursuits/outreach")
      && response.request().method() === "POST"
      && response.request().postData()?.includes('"regenerate":true') !== true,
    { timeout: 240000 },
  );
  await resumedDialog.getByRole("button", { name: "Try again", exact: true }).click();
  evidence.requests.push(await assertApiResponse(await retryPromise, "POST /api/public-profile/pursuits/outreach missing contact retry"));
  await page.waitForFunction(
    (expectedCount) => document.querySelectorAll('[role="dialog"] textarea').length === expectedCount,
    messages.length,
    { timeout: 30000 },
  );
  await resumedDialog.getByRole("button", { name: "Continue", exact: true }).waitFor({ state: "visible", timeout: 30000 });
  const resumedMessages = await resumedDialog.locator("textarea").evaluateAll((nodes) => nodes.map((node) => node.value));
  expect(resumedMessages.length === messages.length, "Missing-contact retry did not restore every selected contact draft");
  const messagesAfterRetry = await rest(
    `outreach_messages?pursuit_id=eq.${pursuitId}&select=id,contact_suggestion_id,message,regeneration_count,status`,
    {},
    "Missing-contact retry persistence audit",
  );
  expect(messagesAfterRetry.length === messages.length, "Missing-contact retry persisted the wrong message count");
  expect(new Set(messagesAfterRetry.map((message) => message.contact_suggestion_id)).size === messagesAfterRetry.length, "Missing-contact retry duplicated a completed contact");
  evidence.reload = { messageCount: resumedMessages.length, regeneratedMessagePresent: resumedMessages.includes(persistedRegeneratedMessage) };
  evidence.partialRetry = {
    preservedMessageCount: partialMessages.length,
    finalMessageCount: messagesAfterRetry.length,
    uniqueContactCount: new Set(messagesAfterRetry.map((message) => message.contact_suggestion_id)).size,
  };

  await resumedDialog.getByRole("button", { name: "Continue", exact: true }).click();
  await resumedDialog.getByText("Pursuit tracking", { exact: true }).waitFor({ timeout: 10000 });
  await resumedDialog.getByLabel("Applied online", { exact: true }).check();
  const trackingPromise = page.waitForResponse(
    (response) => response.url().includes(`/api/public-profile/pursuits/${pursuitId}/tracking`)
      && response.request().method() === "PATCH",
    { timeout: 60000 },
  );
  await resumedDialog.getByRole("button", { name: "Save to Applied", exact: true }).click();
  evidence.requests.push(await assertApiResponse(await trackingPromise, "PATCH /api/public-profile/pursuits/:id/tracking"));

  const [trackedPursuit, trackingRows] = await Promise.all([
    rest(`pursuits?id=eq.${pursuitId}&select=id,tracking_started_at`, {}, "Tracked pursuit audit"),
    rest(`pursuit_tracking_events?pursuit_id=eq.${pursuitId}&action=eq.applied_online&select=id,checked`, {}, "Tracking event audit"),
  ]);
  expect(Boolean(trackedPursuit[0]?.tracking_started_at), "Tracking did not move the pursuit to Applied");
  expect(trackingRows.length === 1 && trackingRows[0].checked === true, "Applied-online tracking event was not persisted");
  expect(evidence.consoleErrors.length === 0, `Browser console errors: ${evidence.consoleErrors.join(" | ")}`);
  expect(evidence.pageErrors.length === 0, `Browser page errors: ${evidence.pageErrors.join(" | ")}`);
  evidence.status = "passed";
} catch (error) {
  failure = error;
  evidence.status = "failed";
  evidence.failure = error instanceof Error ? error.message : String(error);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (userId) {
    try {
      await deleteQaUser(userId);
      const [profiles, pursuits, authUsers] = await Promise.all([
        rest(`candidate_profiles?user_id=eq.${userId}&select=id`, {}, "Profile cleanup audit"),
        rest(`pursuits?user_id=eq.${userId}&select=id`, {}, "Pursuit cleanup audit"),
        fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
        }),
      ]);
      evidence.cleanup = {
        profiles: profiles.length,
        pursuits: pursuits.length,
        authUserHttp: authUsers.status,
      };
      expect(profiles.length === 0 && pursuits.length === 0 && authUsers.status === 404, "Production QA cleanup left data");
    } catch (error) {
      failure ??= error;
      evidence.status = "failed";
      evidence.cleanupFailure = error instanceof Error ? error.message : String(error);
    }
  }
}

console.log(JSON.stringify(evidence, null, 2));
if (failure) process.exit(1);

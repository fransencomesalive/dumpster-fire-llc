#!/usr/bin/env node

// Production auth + header journey (Randall, 2026-07-28).
//
// The session moved from localStorage into cookies so the server could render
// the real header. None of that could be exercised locally: syncPublicProfileSession
// discards any token Supabase does not recognise, and local dev writes to the
// production database. This harness is the permanent answer — it signs a
// disposable user into production and asserts the parts that were previously
// listed as NOT VERIFIED.
//
// What it proves:
//   1. Email + password sign-in still works after the cookie migration.
//   2. The session is in COOKIES, not just the localStorage mirror.
//   3. The SERVER renders the signed-in header (present in the HTML before any
//      JS runs) — the whole point of the change.
//   4. The header does not flip: its content is identical at first paint and
//      after the page settles.
//   5. Job scan appears for a complete profile and is absent for an incomplete
//      one. This is the regression that shipped broken: a GET on a POST-only
//      bootstrap route silently hid it for everyone.
//   6. The header offset is uniform across pages (12px), the bar is one line.
//   7. The legacy localStorage session is adopted into cookies rather than
//      silently signing existing users out.
//   8. Sign out clears the session and lands on /.
//
// Google OAuth and the email confirmation link still need a human: both leave
// the app for an external consent screen or mailbox. What this harness DOES
// cover for them is the piece that broke in production — that /auth/callback is
// reachable and on the Supabase redirect allowlist.
//
// Usage:
//   PRODUCTION_AUTH_QA_CONFIRM=yes node scripts/qa/production-auth-browser.mjs

import { randomBytes, randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import { createProfileSeeder } from "./lib/seed-complete-profile.mjs";

if (process.env.PRODUCTION_AUTH_QA_CONFIRM !== "yes") {
  throw new Error(
    "Refusing to create a disposable production account. Set PRODUCTION_AUTH_QA_CONFIRM=yes.",
  );
}

const APP_URL = (
  process.env.PRODUCTION_APP_URL
  ?? "https://www.thejobmarketisadumpsterfire.com"
).replace(/\/$/, "");
const CHROME_EXECUTABLE = process.env.CHROME_EXECUTABLE
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function required(name, fallback) {
  const value = process.env[name]?.trim() || (fallback ? process.env[fallback]?.trim() : "");
  if (!value) throw new Error(`Missing ${name}${fallback ? ` or ${fallback}` : ""}`);
  return value;
}

const supabaseUrl = required("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
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
  try { body = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return body;
}

async function managementQuery(query, label) {
  const response = await fetch(managementUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${managementToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return responseJson(response, label);
}

// Without an active plan the onboarding gate redirects to /plan, where the
// signed-out bar is intentional. A harness that skips this reads that redirect
// as a header flip.
async function grantPlan(userId) {
  await managementQuery(`
    insert into public.user_subscriptions (user_id, plan_id, status, source)
    select ${sqlLiteral(userId)}::uuid, id, 'active', 'access_code'
    from public.subscription_plans where name = 'premium' limit 1;
  `, "Disposable auth QA plan grant");
}

// The SAME seed the scan harness uses, so "complete" here means what it means
// to the quality checker. A shallow status='complete' insert is recomputed as
// incomplete and would fail the Job scan assertion for the wrong reason.
const seedCompleteProfile = createProfileSeeder({ managementQuery, sqlLiteral });

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
      user_metadata: { qa_scope: "production_auth_browser" },
    }),
  });
  const body = await responseJson(response, "Disposable auth QA user creation");
  expect(typeof body?.id === "string", "Disposable auth QA user creation returned no id");
  return body.id;
}

async function deleteQaUser(userId) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  await responseJson(response, "Disposable auth QA user deletion");
}

// Tokens for the legacy-migration check, obtained outside the browser so the
// browser starts with localStorage only and no cookies at all.
async function passwordGrant(email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return responseJson(response, "Password grant for legacy-session seeding");
}

function headerState(page) {
  return page.evaluate(() => {
    const nav = document.querySelector("header[aria-label='Dumpster Fire navigation']");
    if (!nav) return { present: false };
    const rect = nav.getBoundingClientRect();
    const labels = [...nav.querySelectorAll("nav a, nav button")].map((el) => el.textContent.trim());
    return {
      present: true,
      signedIn: [...nav.classList].some((c) => c.includes("SignedIn")),
      top: Math.round(rect.top),
      height: Math.round(rect.height),
      labels,
      email: nav.querySelector("[class*='NavEmail']")?.textContent?.trim() ?? "",
      text: nav.innerText.replace(/\s+/g, " ").trim(),
    };
  });
}

const email = `qa-auth-${randomUUID()}@dumpsterfire.test`;
const password = `Qa!${randomBytes(18).toString("base64url")}`;
const evidence = {
  app: APP_URL,
  account: email,
  checks: {},
  consoleErrors: [],
  pageErrors: [],
};

let userId = null;
let browser = null;
let failure = null;

try {
  userId = await createQaUser(email, password);
  await grantPlan(userId);

  browser = await chromium.launch({ headless: true, executablePath: CHROME_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error") evidence.consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => evidence.pageErrors.push(e.message));

  // ---- 1. Sign in ---------------------------------------------------------
  await page.goto(`${APP_URL}/onboarding`, { waitUntil: "networkidle" });
  await page.locator("#login-email").fill(email);
  await page.locator("#login-pass").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(
    () => window.localStorage.getItem("dumpster-fire-public-access-token"),
    null,
    { timeout: 20000 },
  );
  evidence.checks.signIn = "ok";

  // ---- 2. Session is in cookies, not only the localStorage mirror ---------
  const cookies = await context.cookies();
  const authCookies = cookies.filter((c) => /^sb-.*-auth-token/.test(c.name));
  expect(authCookies.length > 0, "No sb-*-auth-token cookie after sign-in: session is not in cookies");
  evidence.checks.cookieSession = { count: authCookies.length, names: authCookies.map((c) => c.name) };

  // ---- 3. SERVER renders the signed-in header -----------------------------
  // Fetched with the session cookies but WITHOUT executing JS. If the bar were
  // still resolved in the browser this would come back signed-out.
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const ssr = await fetch(`${APP_URL}/onboarding`, { headers: { cookie: cookieHeader } });
  const ssrHtml = await ssr.text();
  expect(ssr.ok, `SSR fetch failed with HTTP ${ssr.status}`);
  expect(ssrHtml.includes("Saved Pursuits"), "Server HTML has no signed-in header");
  expect(!ssrHtml.includes("Human Path"), "Server HTML still contains the signed-out marketing nav");
  evidence.checks.serverRenderedHeader = {
    savedPursuits: true,
    marketingNavAbsent: true,
    emailPresent: ssrHtml.includes(email),
  };

  // ---- 4. No flip: identical at first paint and settled -------------------
  await page.goto(`${APP_URL}/onboarding`, { waitUntil: "domcontentloaded" });
  const first = await headerState(page);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  const settled = await headerState(page);
  expect(first.present && settled.present, "Header missing on the flip check");
  expect(
    first.text === settled.text && first.height === settled.height,
    `Header flipped after load.\n  first:   ${first.text}\n  settled: ${settled.text}`,
  );
  evidence.checks.noFlip = { text: settled.text, height: settled.height };

  // ---- 5. Job scan gating (the regression that shipped broken) ------------
  // The QA user has no profile rows, so the profile is incomplete and Job scan
  // must be absent while Saved Pursuits stays available.
  expect(settled.signedIn, "Header did not render its signed-in state");
  expect(
    !settled.labels.includes("Job scan"),
    "Job scan is shown for an INCOMPLETE profile; the gate is not applied",
  );
  expect(
    settled.labels.includes("Saved Pursuits"),
    "Saved Pursuits is missing; it must stay available regardless of profile status",
  );
  evidence.checks.jobScanGate = { profile: "incomplete", labels: settled.labels };

  // The gate must be driven by a real answer, not a swallowed error. A 405 here
  // is exactly how Job scan silently vanished for every complete profile.
  const bootstrap = await fetch(`${APP_URL}/api/public-profile/bootstrap`, {
    method: "POST",
    headers: {
      cookie: cookieHeader,
      Authorization: `Bearer ${await page.evaluate(() => window.localStorage.getItem("dumpster-fire-public-access-token"))}`,
    },
  });
  expect(
    bootstrap.status === 200,
    `Bootstrap returned HTTP ${bootstrap.status}; the Job scan gate cannot resolve (405 means the method is wrong again)`,
  );
  evidence.checks.bootstrapMethod = { status: bootstrap.status };

  // Now the other direction: flip the profile to complete and require Job scan
  // to APPEAR. Asserting only the absent case would have passed while the
  // feature was broken for every real user.
  // Visiting /onboarding already auto-created an incomplete profile via
  // ensureCandidateProfileAggregate, and the early plan grant already inserted a
  // subscription. The shared seed writes both, so clear them first.
  await managementQuery(
    `delete from public.candidate_profiles where user_id = ${sqlLiteral(userId)}::uuid;
     delete from public.user_subscriptions where user_id = ${sqlLiteral(userId)}::uuid;`,
    "Disposable auth QA profile reset",
  );
  await seedCompleteProfile({
    userId,
    email,
    profileId: randomUUID(),
    roleTrackId: randomUUID(),
    resumeId: randomUUID(),
    workExampleId: randomUUID(),
    skillId: randomUUID(),
  });
  await page.goto(`${APP_URL}/onboarding`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const complete = await headerState(page);
  expect(
    complete.labels.includes("Job scan"),
    `Job scan is MISSING for a complete profile. Labels: ${complete.labels.join(", ")}`,
  );
  evidence.checks.jobScanVisibleWhenComplete = { labels: complete.labels };

  // ---- 6. Uniform header offset, one line --------------------------------
  const offsets = {};
  for (const path of ["/onboarding", "/saved-pursuits", "/"]) {
    await page.goto(`${APP_URL}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const state = await headerState(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    offsets[path] = { top: state.top, height: state.height, overflow };
    expect(state.top === 12, `${path} header offset is ${state.top}px, expected 12px`);
    expect(!overflow, `${path} overflows horizontally`);
  }
  evidence.checks.uniformOffset = offsets;

  // ---- 7. /auth/callback reachable and on the Supabase allowlist ----------
  // Not the full OAuth dance (that needs a human at Google), but the exact piece
  // that broke production: the callback existing and being an allowed redirect.
  const callback = await fetch(`${APP_URL}/auth/callback`, { redirect: "manual" });
  expect(
    callback.status === 307 || callback.status === 302,
    `/auth/callback returned HTTP ${callback.status}, expected a redirect`,
  );
  const allowlist = await fetch(`${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${
    encodeURIComponent(`${APP_URL}/auth/callback?next=/onboarding`)
  }`, { redirect: "manual" });
  const allowLocation = allowlist.headers.get("location") ?? "";
  expect(
    !/error|otp_expired|redirect_to.*not.*allowed/i.test(allowLocation),
    `Supabase rejected the /auth/callback redirect. OAuth and email confirmation will fail. location=${allowLocation.slice(0, 200)}`,
  );
  evidence.checks.authCallback = {
    routeStatus: callback.status,
    supabaseAcceptsRedirect: allowLocation.includes("accounts.google.com"),
  };

  // ---- 8. Sign out --------------------------------------------------------
  await page.goto(`${APP_URL}/onboarding`, { waitUntil: "networkidle" });
  await page.locator("[class*='NavProfileWrap']").hover();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(`${APP_URL}/`, { timeout: 20000 });
  const afterSignOut = await context.cookies();
  const leftover = afterSignOut.filter(
    (c) => /^sb-.*-auth-token/.test(c.name) && c.value && c.value !== "",
  );
  expect(leftover.length === 0, `Sign out left ${leftover.length} auth cookie(s) behind`);
  const signedOutHeader = await headerState(page);
  expect(!signedOutHeader.signedIn, "Header still renders signed-in after sign out");
  evidence.checks.signOut = { landedOn: page.url(), authCookiesLeft: 0 };

  // ---- 9. Legacy localStorage session is adopted into cookies ------------
  // Reproduces an existing user's first load after the migration: tokens in the
  // old storage key, no cookies. They must stay signed in.
  const grant = await passwordGrant(email, password);
  const legacyContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const legacyPage = await legacyContext.newPage();
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  await legacyPage.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    {
      key: `sb-${projectRef}-auth-token`,
      value: JSON.stringify({
        access_token: grant.access_token,
        refresh_token: grant.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
      }),
    },
  );
  await legacyPage.goto(`${APP_URL}/onboarding`, { waitUntil: "networkidle" });
  await legacyPage.waitForTimeout(2500);
  const migrated = await legacyContext.cookies();
  const migratedAuth = migrated.filter((c) => /^sb-.*-auth-token/.test(c.name) && c.value);
  const legacyKeyGone = await legacyPage.evaluate(
    (key) => window.localStorage.getItem(key) === null,
    `sb-${projectRef}-auth-token`,
  );
  expect(
    migratedAuth.length > 0,
    "A pre-migration localStorage session was NOT adopted into cookies: existing users would be signed out",
  );
  evidence.checks.legacyMigration = {
    cookiesWritten: migratedAuth.length,
    legacyKeyRemoved: legacyKeyGone,
  };
  await legacyContext.close();

  expect(
    evidence.pageErrors.length === 0,
    `Page errors during the journey: ${evidence.pageErrors.join(" | ")}`,
  );

  console.log(JSON.stringify({ status: "passed", evidence }, null, 2));
} catch (error) {
  failure = error;
  console.error(JSON.stringify({ status: "failed", error: error.message, evidence }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  const cleanup = { userDeleted: false };
  if (userId) {
    try {
      await deleteQaUser(userId);
      cleanup.userDeleted = true;
    } catch (error) {
      cleanup.error = error.message;
    }
  }
  console.log(JSON.stringify({ cleanup }, null, 2));
}

if (failure) process.exit(1);

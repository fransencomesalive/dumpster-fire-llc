#!/usr/bin/env node

// This journey intentionally creates disposable production data and calls the
// real Human Path and outreach providers. It uses service-role Auth and REST
// only, so it does not depend on a rotating Supabase Management API token.

import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

if (process.env.PRODUCTION_SUBSCRIPTION_QA_CONFIRM !== "yes") {
  throw new Error(
    "Refusing to create disposable production data. Set PRODUCTION_SUBSCRIPTION_QA_CONFIRM=yes.",
  );
}

const APP_URL = (
  process.env.PRODUCTION_APP_URL
  ?? "https://www.thejobmarketisadumpsterfire.com"
).replace(/\/$/, "");

function required(name, ...fallbackNames) {
  for (const candidate of [name, ...fallbackNames]) {
    const value = process.env[candidate]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: ${[name, ...fallbackNames].join(" or ")}`);
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL").replace(/\/$/, "");
const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const expectedDeployment = process.env.PRODUCTION_DEPLOYMENT_ID?.trim() || null;
const commit = process.env.PRODUCTION_COMMIT_SHA
  ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

async function jsonResponse(response, label) {
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    const status = typeof body?.status === "string" ? ` (${body.status})` : "";
    const detail = [body?.message, body?.error, body?.details]
      .find((value) => typeof value === "string" && value.trim())
      ?.trim()
      .slice(0, 300);
    throw new Error(
      `${label} failed with HTTP ${response.status}${status}${detail ? `: ${detail}` : ""}`,
    );
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
  return jsonResponse(response, label);
}

function queryPath(table, params) {
  return `${table}?${new URLSearchParams(params).toString()}`;
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
      user_metadata: { qa_scope: "subscription_flag_on" },
    }),
  });
  const body = await jsonResponse(response, "Disposable Auth user creation");
  if (typeof body?.id !== "string") {
    throw new Error("Disposable Auth user creation returned no user id");
  }
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
  await jsonResponse(response, "Disposable Auth user deletion");
}

async function signIn(email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await jsonResponse(response, "Disposable user sign-in");
  if (typeof body?.access_token !== "string") {
    throw new Error("Disposable user sign-in returned no access token");
  }
  return body.access_token;
}

async function appRequest(path, token, init = {}) {
  const response = await fetch(`${APP_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  return { status: response.status, body };
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function qaSnapshot(userId, pursuitId, planId) {
  const [
    subscriptions,
    pursuits,
    contacts,
    events,
    usageRows,
    generationRequests,
    outreachMessages,
    providerEvents,
  ] = await Promise.all([
    rest(queryPath("user_subscriptions", {
      user_id: `eq.${userId}`,
      plan_id: `eq.${planId}`,
      status: "eq.active",
      source: "eq.access_code",
      select: "id",
    }), {}, "QA subscription snapshot"),
    rest(queryPath("pursuits", {
      id: `eq.${pursuitId}`,
      user_id: `eq.${userId}`,
      select: "status,apply_wizard_metered_at",
    }), {}, "QA pursuit snapshot"),
    rest(queryPath("contact_suggestions", {
      pursuit_id: `eq.${pursuitId}`,
      select: "id",
    }), {}, "QA contact snapshot"),
    rest(queryPath("pursuit_events", {
      pursuit_id: `eq.${pursuitId}`,
      select: "event_type,usage_type",
    }), {}, "QA pursuit-event snapshot"),
    rest(queryPath("usage_ledger", {
      user_id: `eq.${userId}`,
      related_pursuit_id: `eq.${pursuitId}`,
      select: "usage_type,quantity",
    }), {}, "QA usage snapshot"),
    rest(queryPath("pursuit_outreach_generation_requests", {
      user_id: `eq.${userId}`,
      pursuit_id: `eq.${pursuitId}`,
      select: "pursuit_debit_added,outreach_debit_quantity",
    }), {}, "QA outreach-request snapshot"),
    rest(queryPath("outreach_messages", {
      pursuit_id: `eq.${pursuitId}`,
      select: "regeneration_count",
    }), {}, "QA outreach-message snapshot"),
    rest(queryPath("provider_usage_events", {
      user_id: `eq.${userId}`,
      pursuit_id: `eq.${pursuitId}`,
      select: "id",
    }), {}, "QA provider-event snapshot"),
  ]);

  const countUsage = (usageType) => usageRows
    .filter((row) => row.usage_type === usageType);
  const applyWizardRows = countUsage("apply_wizard");
  const outreachEvents = events.filter((row) => row.event_type === "outreach_generated");

  return {
    subscriptionCount: subscriptions.length,
    pursuitStatus: pursuits[0]?.status ?? null,
    pursuitLatched: pursuits[0]?.apply_wizard_metered_at != null,
    contactCount: contacts.length,
    eventCount: events.filter((row) => row.event_type === "human_path_generated").length,
    applyWizardRows: applyWizardRows.length,
    applyWizardQuantity: applyWizardRows
      .reduce((total, row) => total + Number(row.quantity ?? 0), 0),
    legacyHumanPathRows: countUsage("human_path").length,
    legacyPursuitRows: countUsage("pursuit").length,
    legacyOutreachRows: countUsage("outreach_message").length,
    outreachGenerationRequests: generationRequests.length,
    zeroDebitOutreachRequests: generationRequests.filter(
      (row) => row.pursuit_debit_added === false
        && Number(row.outreach_debit_quantity) === 0,
    ).length,
    outreachMessages: outreachMessages.length,
    outreachRegenerationTotal: outreachMessages
      .reduce((total, row) => total + Number(row.regeneration_count ?? 0), 0),
    outreachEvents: outreachEvents.length,
    meteredOutreachEvents: outreachEvents
      .filter((row) => row.usage_type != null).length,
    providerEventCount: providerEvents.length,
  };
}

async function cleanup(userId) {
  const providerRowsBefore = await rest(queryPath("provider_usage_events", {
    user_id: `eq.${userId}`,
    select: "id",
  }), {}, "QA provider telemetry pre-cleanup audit");
  const providerEventsDeleted = await rest(
    "rpc/delete_subscription_qa_provider_usage_events",
    { method: "POST", body: { p_user_id: userId } },
    "QA provider telemetry cleanup",
  );
  expect(
    Number(providerEventsDeleted) === providerRowsBefore.length,
    "QA provider telemetry cleanup count did not match the rows found",
  );
  await deleteQaUser(userId);

  const [
    profiles,
    subscriptions,
    pursuits,
    usageRows,
    providerEvents,
    authUserResponse,
  ] = await Promise.all([
    rest(queryPath("candidate_profiles", {
      user_id: `eq.${userId}`,
      select: "id",
    }), {}, "QA profile cleanup audit"),
    rest(queryPath("user_subscriptions", {
      user_id: `eq.${userId}`,
      select: "id",
    }), {}, "QA subscription cleanup audit"),
    rest(queryPath("pursuits", {
      user_id: `eq.${userId}`,
      select: "id",
    }), {}, "QA pursuit cleanup audit"),
    rest(queryPath("usage_ledger", {
      user_id: `eq.${userId}`,
      select: "id",
    }), {}, "QA usage cleanup audit"),
    rest(queryPath("provider_usage_events", {
      user_id: `eq.${userId}`,
      select: "id",
    }), {}, "QA provider cleanup audit"),
    fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    }),
  ]);

  const result = {
    authUsers: authUserResponse.status === 404 ? 0 : 1,
    authUserHttp: authUserResponse.status,
    profiles: profiles.length,
    subscriptions: subscriptions.length,
    pursuits: pursuits.length,
    usageRows: usageRows.length,
    providerEvents: providerEvents.length,
    providerEventsDeleted: Number(providerEventsDeleted),
  };
  expect(
    result.authUsers === 0
      && result.profiles === 0
      && result.subscriptions === 0
      && result.pursuits === 0
      && result.usageRows === 0
      && result.providerEvents === 0,
    "Disposable production QA cleanup left related rows",
  );
  return result;
}

const email = `billing-qa-${Date.now()}-${randomBytes(5).toString("hex")}@example.invalid`;
const password = randomBytes(36).toString("base64url");
const profileId = randomUUID();
const pursuitId = randomUUID();
let userId;
let planId;
let cleanupResult;

try {
  const deploymentResponse = await fetch(APP_URL, { method: "HEAD" });
  expect(
    deploymentResponse.status === 200,
    `Production preflight returned HTTP ${deploymentResponse.status}`,
  );
  const deploymentLink = deploymentResponse.headers.get("link") ?? "";
  const deployment = deploymentLink.match(/[?&]dpl=(dpl_[^>;]+)/)?.[1] ?? null;
  expect(deployment, "Production response did not identify its deployment");
  if (expectedDeployment) {
    expect(
      deployment === expectedDeployment,
      `Expected deployment ${expectedDeployment}, received ${deployment}`,
    );
  }

  const jobs = await rest(queryPath("jobs", {
    owner_user_id: "is.null",
    company_name: "ilike.Autodesk",
    title: "ilike.*Principal Program Manager*",
    description: "neq.",
    select: "id,title,company_name,location,source_url",
    order: "updated_at.desc.nullslast",
    limit: "1",
  }), {}, "Approved QA posting lookup");
  const jobId = jobs?.[0]?.id;
  expect(typeof jobId === "string", "Approved Autodesk production QA posting was not found");

  userId = await createQaUser(email, password);

  const now = new Date().toISOString();
  await rest("candidate_profiles", { method: "POST", body: {
    id: profileId,
    user_id: userId,
    status: "complete",
    full_name: "Subscription QA",
    preferred_name: "QA",
    location: "Denver, CO",
    email,
    generated_markdown: "# Subscription QA\n\nHuman program leader who turns ambiguous cross-functional work into clear operating plans and measurable delivery.",
    markdown_generated_at: now,
  } }, "Disposable candidate profile seed");
  await rest("profile_quality", { method: "POST", body: {
    profile_id: profileId,
    status: "complete",
    complete_fields: ["production_qa"],
    last_checked_at: now,
  } }, "Disposable profile quality seed");

  const plans = await rest(queryPath("subscription_plans", {
    name: "eq.premium",
    select: "id",
    limit: "1",
  }), {}, "Premium plan lookup");
  planId = plans?.[0]?.id;
  expect(typeof planId === "string", "Premium plan was not found");
  await rest("user_subscriptions", { method: "POST", body: {
    user_id: userId,
    plan_id: planId,
    status: "active",
    source: "access_code",
  } }, "Disposable subscription seed");

  await rest("pursuits", { method: "POST", body: {
    id: pursuitId,
    user_id: userId,
    profile_id: profileId,
    job_id: jobId,
    status: "review_complete",
    fit_summary: "Disposable subscription flag-on verification.",
    outreach_angle: "Validate atomic Apply Wizard persistence.",
    job_snapshot: {
      jobId,
      title: jobs[0].title,
      companyName: jobs[0].company_name,
      location: jobs[0].location,
      sourceUrl: jobs[0].source_url,
      capturedAt: now,
    },
    last_activity_at: now,
    created_at: now,
    updated_at: now,
  } }, "Disposable pursuit seed");

  if (process.env.PRODUCTION_QA_PREPARE_ONLY === "true") {
    cleanupResult = await cleanup(userId);
    userId = undefined;
    console.log(JSON.stringify({
      status: "prepare_only_passed",
      commit,
      deployment,
      cleanup: cleanupResult,
    }, null, 2));
    process.exit(0);
  }

  const token = await signIn(email, password);

  const plan = await appRequest("/api/account/plan", token);
  expect(plan.status === 200, `Account plan read returned HTTP ${plan.status}`);
  expect(plan.body?.planName === "premium", "Account plan read did not return premium");

  const codeUsesBeforeRows = await rest(queryPath("access_codes", {
    code: "eq.DUMPSTERFRIENDS",
    select: "use_count",
    limit: "1",
  }), {}, "Access-code use-count precheck");
  const codeUsesBefore = codeUsesBeforeRows?.[0]?.use_count;
  expect(Number.isInteger(codeUsesBefore), "Shared premium access code was not found");

  const redemption = await appRequest("/api/account/redeem-code", token, {
    method: "POST",
    body: JSON.stringify({ code: "DUMPSTERFRIENDS" }),
  });
  expect(redemption.status === 409, `Already-entitled redemption returned HTTP ${redemption.status}`);
  expect(
    redemption.body?.status === "already_entitled",
    "Already-entitled redemption did not use the atomic conflict result",
  );

  const codeUsesAfterRows = await rest(queryPath("access_codes", {
    code: "eq.DUMPSTERFRIENDS",
    select: "use_count",
    limit: "1",
  }), {}, "Access-code use-count postcheck");
  expect(
    codeUsesAfterRows?.[0]?.use_count === codeUsesBefore,
    "Already-entitled redemption changed the shared code use count",
  );

  const exportResult = await appRequest(
    "/api/public-profile/pursuits/export?format=json",
    token,
  );
  expect(exportResult.status === 200, `Roaring export entitlement returned HTTP ${exportResult.status}`);
  expect(exportResult.body?.status === "ok", "Roaring export entitlement did not return ok");

  const firstHumanPath = await appRequest(
    "/api/public-profile/pursuits/human-path",
    token,
    {
      method: "POST",
      body: JSON.stringify({ pursuitId }),
    },
  );
  expect(
    firstHumanPath.status === 200,
    `Flag-on Human Path returned HTTP ${firstHumanPath.status}`,
  );
  expect(
    firstHumanPath.body?.status === "human_path_generated",
    "Flag-on Human Path did not return human_path_generated",
  );
  expect(firstHumanPath.body?.cached === false, "First flag-on Human Path response was cached");
  expect(
    Array.isArray(firstHumanPath.body?.contacts)
      && firstHumanPath.body.contacts.length > 0,
    "Flag-on Human Path returned no useful contacts",
  );
  expect(
    firstHumanPath.body?.applyWizardUsage?.used === 1
      && firstHumanPath.body?.applyWizardUsage?.limit === 45
      && firstHumanPath.body?.applyWizardUsage?.remaining === 44,
    "Flag-on Human Path returned unexpected Apply Wizard usage",
  );

  const firstSnapshot = await qaSnapshot(userId, pursuitId, planId);
  expect(firstSnapshot?.providerEventCount > 0, "First Human Path run recorded no provider telemetry");

  const replay = await appRequest(
    "/api/public-profile/pursuits/human-path",
    token,
    {
      method: "POST",
      body: JSON.stringify({ pursuitId }),
    },
  );
  expect(replay.status === 200, `Human Path replay returned HTTP ${replay.status}`);
  expect(replay.body?.status === "human_path_generated", "Human Path replay status was unexpected");
  expect(replay.body?.cached === true, "Human Path replay was not cached");
  expect(
    Array.isArray(replay.body?.contacts)
      && replay.body.contacts.length === firstHumanPath.body.contacts.length,
    "Human Path replay returned a different contact count",
  );

  const finalSnapshot = await qaSnapshot(userId, pursuitId, planId);
  expect(finalSnapshot?.subscriptionCount === 1, "QA subscription source or plan was incorrect");
  expect(finalSnapshot?.pursuitStatus === "human_path_generated", "QA pursuit did not reach human_path_generated");
  expect(finalSnapshot?.pursuitLatched === true, "QA pursuit was not metering-latched");
  expect(finalSnapshot?.contactCount > 0, "QA pursuit persisted no contacts");
  expect(finalSnapshot?.eventCount === 1, "QA pursuit did not persist exactly one Human Path event");
  expect(finalSnapshot?.applyWizardRows === 1, "QA pursuit did not persist exactly one Apply Wizard row");
  expect(finalSnapshot?.applyWizardQuantity === 1, "QA Apply Wizard quantity was not one");
  expect(finalSnapshot?.legacyHumanPathRows === 0, "Flag-on run wrote a legacy Human Path debit");
  expect(
    finalSnapshot?.providerEventCount === firstSnapshot.providerEventCount,
    "Cached replay caused another provider call",
  );

  const selectedContactId = firstHumanPath.body.contacts[0]?.id;
  expect(typeof selectedContactId === "string", "Flag-on Human Path returned no persisted contact id");

  const selection = await appRequest(
    "/api/public-profile/pursuits/contacts",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        pursuitId,
        contactIds: [selectedContactId],
      }),
    },
  );
  expect(selection.status === 200, `Contact selection returned HTTP ${selection.status}`);
  expect(selection.body?.status === "outreach_ready", "Contact selection did not return outreach_ready");

  const initialOutreachKey = `phase-2c-production-${randomUUID()}`;
  const initialOutreach = await appRequest(
    "/api/public-profile/pursuits/outreach",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        pursuitId,
        idempotencyKey: initialOutreachKey,
      }),
    },
  );
  expect(
    initialOutreach.status === 200,
    `Initial outreach returned HTTP ${initialOutreach.status} (${initialOutreach.body?.status ?? "unknown"})`,
  );
  expect(initialOutreach.body?.status === "outreach_generated", "Initial outreach status was unexpected");
  expect(
    Array.isArray(initialOutreach.body?.messages)
      && initialOutreach.body.messages.length === 1,
    "Initial outreach did not persist exactly one message",
  );
  expect(
    initialOutreach.body?.metering?.pursuitDebited === false
      && initialOutreach.body?.metering?.outreachDebited === 0,
    "Initial outreach returned nonzero retired metering",
  );

  const outreachMessageId = initialOutreach.body.messages[0]?.id;
  expect(typeof outreachMessageId === "string", "Initial outreach returned no persisted message id");

  const initialOutreachSnapshot = await qaSnapshot(userId, pursuitId, planId);
  expect(initialOutreachSnapshot?.pursuitStatus === "outreach_ready", "Initial outreach changed pursuit status unexpectedly");
  expect(initialOutreachSnapshot?.applyWizardRows === 1, "Initial outreach changed Apply Wizard rows");
  expect(initialOutreachSnapshot?.applyWizardQuantity === 1, "Initial outreach changed Apply Wizard quantity");
  expect(initialOutreachSnapshot?.legacyPursuitRows === 0, "Initial outreach wrote a retired pursuit debit");
  expect(initialOutreachSnapshot?.legacyOutreachRows === 0, "Initial outreach wrote a retired outreach debit");
  expect(initialOutreachSnapshot?.outreachGenerationRequests === 1, "Initial outreach request count was not one");
  expect(initialOutreachSnapshot?.zeroDebitOutreachRequests === 1, "Initial outreach request did not persist zero debit metadata");
  expect(initialOutreachSnapshot?.outreachMessages === 1, "Initial outreach message count was not one");
  expect(initialOutreachSnapshot?.outreachRegenerationTotal === 0, "Initial outreach was already regenerated");
  expect(initialOutreachSnapshot?.outreachEvents === 1, "Initial outreach event count was not one");
  expect(initialOutreachSnapshot?.meteredOutreachEvents === 0, "Initial outreach event retained a retail usage type");
  expect(
    initialOutreachSnapshot?.providerEventCount > finalSnapshot.providerEventCount,
    "Initial outreach recorded no provider telemetry",
  );

  const initialOutreachReplay = await appRequest(
    "/api/public-profile/pursuits/outreach",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        pursuitId,
        idempotencyKey: initialOutreachKey,
      }),
    },
  );
  expect(initialOutreachReplay.status === 200, `Initial outreach replay returned HTTP ${initialOutreachReplay.status}`);
  expect(initialOutreachReplay.body?.replayed === true, "Initial outreach replay was not identified as replayed");
  expect(
    Array.isArray(initialOutreachReplay.body?.messages)
      && initialOutreachReplay.body.messages.length === 1
      && initialOutreachReplay.body.messages[0]?.id === outreachMessageId,
    "Initial outreach replay returned different persisted messages",
  );

  const replayOutreachSnapshot = await qaSnapshot(userId, pursuitId, planId);
  expect(
    replayOutreachSnapshot?.providerEventCount === initialOutreachSnapshot.providerEventCount,
    "Initial outreach replay caused another provider call",
  );
  expect(replayOutreachSnapshot?.outreachGenerationRequests === 1, "Initial outreach replay added a request");
  expect(replayOutreachSnapshot?.outreachMessages === 1, "Initial outreach replay added a message");
  expect(replayOutreachSnapshot?.outreachEvents === 1, "Initial outreach replay added an event");

  const regeneration = await appRequest(
    "/api/public-profile/pursuits/outreach",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        pursuitId,
        regenerate: true,
        previousMessageId: outreachMessageId,
      }),
    },
  );
  expect(
    regeneration.status === 200,
    `Outreach regeneration returned HTTP ${regeneration.status} (${regeneration.body?.status ?? "unknown"})`,
  );
  expect(regeneration.body?.status === "outreach_regenerated", "Outreach regeneration status was unexpected");
  expect(regeneration.body?.message?.id === outreachMessageId, "Outreach regeneration created a new message row");
  expect(regeneration.body?.message?.regenerationCount === 1, "Outreach regeneration count was not one");

  const regenerationSnapshot = await qaSnapshot(userId, pursuitId, planId);
  expect(regenerationSnapshot?.applyWizardRows === 1, "Regeneration changed Apply Wizard rows");
  expect(regenerationSnapshot?.applyWizardQuantity === 1, "Regeneration changed Apply Wizard quantity");
  expect(regenerationSnapshot?.legacyPursuitRows === 0, "Regeneration wrote a retired pursuit debit");
  expect(regenerationSnapshot?.legacyOutreachRows === 0, "Regeneration wrote a retired outreach debit");
  expect(regenerationSnapshot?.outreachGenerationRequests === 1, "Regeneration added an initial-outreach request");
  expect(regenerationSnapshot?.zeroDebitOutreachRequests === 1, "Regeneration changed zero-debit request metadata");
  expect(regenerationSnapshot?.outreachMessages === 1, "Regeneration created another message row");
  expect(regenerationSnapshot?.outreachRegenerationTotal === 1, "Regeneration did not update the message in place");
  expect(regenerationSnapshot?.outreachEvents === 2, "Regeneration event count was not two");
  expect(regenerationSnapshot?.meteredOutreachEvents === 0, "Regeneration event retained a retail usage type");
  expect(
    regenerationSnapshot?.providerEventCount > replayOutreachSnapshot.providerEventCount,
    "Regeneration recorded no provider telemetry",
  );

  const secondRegeneration = await appRequest(
    "/api/public-profile/pursuits/outreach",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        pursuitId,
        regenerate: true,
        previousMessageId: outreachMessageId,
      }),
    },
  );
  expect(secondRegeneration.status === 409, `Second regeneration returned HTTP ${secondRegeneration.status}`);
  expect(secondRegeneration.body?.status === "already_regenerated", "Second regeneration was not rejected");

  const phase2cSnapshot = await qaSnapshot(userId, pursuitId, planId);
  expect(
    phase2cSnapshot?.providerEventCount === regenerationSnapshot.providerEventCount,
    "Rejected second regeneration caused another provider call",
  );
  expect(phase2cSnapshot?.outreachMessages === 1, "Rejected second regeneration changed message count");
  expect(phase2cSnapshot?.outreachRegenerationTotal === 1, "Rejected second regeneration changed the message");
  expect(phase2cSnapshot?.outreachEvents === 2, "Rejected second regeneration added an event");

  cleanupResult = await cleanup(userId);
  userId = undefined;

  console.log(JSON.stringify({
    status: "passed",
    account: email,
    commit,
    deployment,
    pursuitId,
    planName: plan.body.planName,
    accessCodeConflict: redemption.body.status,
    exportEntitlement: exportResult.body.status,
    humanPathStatus: firstHumanPath.body.status,
    contactCount: firstHumanPath.body.contacts.length,
    applyWizardUsage: firstHumanPath.body.applyWizardUsage,
    replayCached: replay.body.cached,
    providerEventCount: phase2cSnapshot.providerEventCount,
    atomicPersistence: {
      eventCount: finalSnapshot.eventCount,
      applyWizardRows: finalSnapshot.applyWizardRows,
      applyWizardQuantity: finalSnapshot.applyWizardQuantity,
      pursuitLatched: finalSnapshot.pursuitLatched,
      legacyHumanPathRows: finalSnapshot.legacyHumanPathRows,
    },
    outreachPersistence: {
      selectedContacts: 1,
      generationRequests: phase2cSnapshot.outreachGenerationRequests,
      zeroDebitRequests: phase2cSnapshot.zeroDebitOutreachRequests,
      messages: phase2cSnapshot.outreachMessages,
      regenerations: phase2cSnapshot.outreachRegenerationTotal,
      events: phase2cSnapshot.outreachEvents,
      meteredEvents: phase2cSnapshot.meteredOutreachEvents,
      legacyPursuitRows: phase2cSnapshot.legacyPursuitRows,
      legacyOutreachRows: phase2cSnapshot.legacyOutreachRows,
      secondRegenerationRejected: secondRegeneration.body.status,
      initialMessageLength: initialOutreach.body.messages[0].message.length,
      regeneratedMessageLength: regeneration.body.message.message.length,
    },
    cleanup: cleanupResult,
  }, null, 2));
} catch (error) {
  if (userId) {
    try {
      cleanupResult = await cleanup(userId);
      userId = undefined;
    } catch (cleanupError) {
      console.error(
        `Cleanup failure: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
      );
    }
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

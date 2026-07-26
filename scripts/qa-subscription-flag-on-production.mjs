#!/usr/bin/env node

import { randomBytes, randomUUID } from "node:crypto";

const APP_URL = process.env.PRODUCTION_APP_URL
  ?? "https://www.thejobmarketisadumpsterfire.com";
const PROJECT_REF = "ngftlvlslhjsyjcbuuwv";
const MANAGEMENT_URL =
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

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
const managementToken = required("SUPABASE_ACCESS_TOKEN");

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

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
    throw new Error(`${label} failed with HTTP ${response.status}${status}`);
  }
  return body;
}

async function managementQuery(query, label = "Production database query") {
  const response = await fetch(MANAGEMENT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${managementToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
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
  if (!response.ok) {
    const detail = [body?.message, body?.error]
      .find((value) => typeof value === "string" && value.trim())
      ?.trim()
      .slice(0, 300);
    throw new Error(
      `${label} failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }
  return body;
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

async function qaSnapshot(userId, pursuitId) {
  const rows = await managementQuery(`
    select jsonb_build_object(
      'subscriptionCount', (
        select count(*)::integer
        from public.user_subscriptions as subscriptions
        join public.subscription_plans as plans
          on plans.id = subscriptions.plan_id
        where subscriptions.user_id = ${sqlLiteral(userId)}::uuid
          and subscriptions.status = 'active'
          and subscriptions.source = 'access_code'
          and plans.name = 'premium'
      ),
      'pursuitStatus', (
        select status
        from public.pursuits
        where id = ${sqlLiteral(pursuitId)}::uuid
          and user_id = ${sqlLiteral(userId)}::uuid
      ),
      'pursuitLatched', exists (
        select 1
        from public.pursuits
        where id = ${sqlLiteral(pursuitId)}::uuid
          and apply_wizard_metered_at is not null
      ),
      'contactCount', (
        select count(*)::integer
        from public.contact_suggestions
        where pursuit_id = ${sqlLiteral(pursuitId)}::uuid
      ),
      'eventCount', (
        select count(*)::integer
        from public.pursuit_events
        where pursuit_id = ${sqlLiteral(pursuitId)}::uuid
          and event_type = 'human_path_generated'
      ),
      'applyWizardRows', (
        select count(*)::integer
        from public.usage_ledger
        where user_id = ${sqlLiteral(userId)}::uuid
          and related_pursuit_id = ${sqlLiteral(pursuitId)}::uuid
          and usage_type = 'apply_wizard'
      ),
      'applyWizardQuantity', (
        select coalesce(sum(quantity), 0)::integer
        from public.usage_ledger
        where user_id = ${sqlLiteral(userId)}::uuid
          and related_pursuit_id = ${sqlLiteral(pursuitId)}::uuid
          and usage_type = 'apply_wizard'
      ),
      'legacyHumanPathRows', (
        select count(*)::integer
        from public.usage_ledger
        where user_id = ${sqlLiteral(userId)}::uuid
          and related_pursuit_id = ${sqlLiteral(pursuitId)}::uuid
          and usage_type = 'human_path'
      ),
      'legacyPursuitRows', (
        select count(*)::integer
        from public.usage_ledger
        where user_id = ${sqlLiteral(userId)}::uuid
          and related_pursuit_id = ${sqlLiteral(pursuitId)}::uuid
          and usage_type = 'pursuit'
      ),
      'legacyOutreachRows', (
        select count(*)::integer
        from public.usage_ledger
        where user_id = ${sqlLiteral(userId)}::uuid
          and related_pursuit_id = ${sqlLiteral(pursuitId)}::uuid
          and usage_type = 'outreach_message'
      ),
      'outreachGenerationRequests', (
        select count(*)::integer
        from public.pursuit_outreach_generation_requests
        where user_id = ${sqlLiteral(userId)}::uuid
          and pursuit_id = ${sqlLiteral(pursuitId)}::uuid
      ),
      'zeroDebitOutreachRequests', (
        select count(*)::integer
        from public.pursuit_outreach_generation_requests
        where user_id = ${sqlLiteral(userId)}::uuid
          and pursuit_id = ${sqlLiteral(pursuitId)}::uuid
          and not pursuit_debit_added
          and outreach_debit_quantity = 0
      ),
      'outreachMessages', (
        select count(*)::integer
        from public.outreach_messages
        where pursuit_id = ${sqlLiteral(pursuitId)}::uuid
      ),
      'outreachRegenerationTotal', (
        select coalesce(sum(regeneration_count), 0)::integer
        from public.outreach_messages
        where pursuit_id = ${sqlLiteral(pursuitId)}::uuid
      ),
      'outreachEvents', (
        select count(*)::integer
        from public.pursuit_events
        where pursuit_id = ${sqlLiteral(pursuitId)}::uuid
          and event_type = 'outreach_generated'
      ),
      'meteredOutreachEvents', (
        select count(*)::integer
        from public.pursuit_events
        where pursuit_id = ${sqlLiteral(pursuitId)}::uuid
          and event_type = 'outreach_generated'
          and usage_type is not null
      ),
      'providerEventCount', (
        select count(*)::integer
        from public.provider_usage_events
        where user_id = ${sqlLiteral(userId)}::uuid
          and pursuit_id = ${sqlLiteral(pursuitId)}::uuid
      )
    ) as snapshot;
  `, "QA state snapshot");
  return rows?.[0]?.snapshot;
}

async function cleanup(userId) {
  await managementQuery(`
    delete from public.provider_usage_events
    where user_id = ${sqlLiteral(userId)}::uuid;
  `, "QA provider telemetry cleanup");
  await deleteQaUser(userId);
  const rows = await managementQuery(`
    select jsonb_build_object(
      'authUsers', (
        select count(*)::integer from auth.users where id = ${sqlLiteral(userId)}::uuid
      ),
      'profiles', (
        select count(*)::integer
        from public.candidate_profiles
        where user_id = ${sqlLiteral(userId)}::uuid
      ),
      'subscriptions', (
        select count(*)::integer
        from public.user_subscriptions
        where user_id = ${sqlLiteral(userId)}::uuid
      ),
      'pursuits', (
        select count(*)::integer
        from public.pursuits
        where user_id = ${sqlLiteral(userId)}::uuid
      ),
      'usageRows', (
        select count(*)::integer
        from public.usage_ledger
        where user_id = ${sqlLiteral(userId)}::uuid
      ),
      'providerEvents', (
        select count(*)::integer
        from public.provider_usage_events
        where user_id = ${sqlLiteral(userId)}::uuid
      )
    ) as cleanup;
  `, "QA cleanup audit");
  const result = rows?.[0]?.cleanup;
  expect(
    result
      && Object.values(result).every((value) => value === 0),
    "Disposable production QA cleanup left related rows",
  );
  return result;
}

const email = `billing-qa-${Date.now()}-${randomBytes(5).toString("hex")}@example.invalid`;
const password = randomBytes(36).toString("base64url");
const profileId = randomUUID();
const pursuitId = randomUUID();
let userId;
let cleanupResult;

try {
  const jobs = await managementQuery(`
    select id
    from public.jobs
    where owner_user_id is null
      and lower(company_name) = 'autodesk'
      and title ilike '%Principal Program Manager%'
      and description <> ''
    order by updated_at desc nulls last
    limit 1;
  `, "Approved QA posting lookup");
  const jobId = jobs?.[0]?.id;
  expect(typeof jobId === "string", "Approved Autodesk production QA posting was not found");

  userId = await createQaUser(email, password);

  await managementQuery(`
    insert into public.candidate_profiles (
      id,
      user_id,
      status,
      full_name,
      preferred_name,
      location,
      email,
      generated_markdown,
      markdown_generated_at
    ) values (
      ${sqlLiteral(profileId)}::uuid,
      ${sqlLiteral(userId)}::uuid,
      'complete',
      'Subscription QA',
      'QA',
      'Denver, CO',
      ${sqlLiteral(email)},
      '# Subscription QA\n\nHuman program leader who turns ambiguous cross-functional work into clear operating plans and measurable delivery.',
      clock_timestamp()
    );

    insert into public.profile_quality (
      profile_id,
      status,
      complete_fields,
      last_checked_at
    ) values (
      ${sqlLiteral(profileId)}::uuid,
      'complete',
      array['production_qa'],
      clock_timestamp()
    );

    insert into public.user_subscriptions (
      user_id,
      plan_id,
      status,
      source
    )
    select
      ${sqlLiteral(userId)}::uuid,
      plans.id,
      'active',
      'access_code'
    from public.subscription_plans as plans
    where plans.name = 'premium';

    insert into public.pursuits (
      id,
      user_id,
      profile_id,
      job_id,
      status,
      fit_summary,
      outreach_angle,
      job_snapshot,
      last_activity_at,
      created_at,
      updated_at
    )
    select
      ${sqlLiteral(pursuitId)}::uuid,
      ${sqlLiteral(userId)}::uuid,
      ${sqlLiteral(profileId)}::uuid,
      jobs.id,
      'review_complete',
      'Disposable subscription flag-on verification.',
      'Validate atomic Apply Wizard persistence.',
      jsonb_build_object(
        'jobId', jobs.id,
        'title', jobs.title,
        'companyName', jobs.company_name,
        'location', jobs.location,
        'sourceUrl', jobs.source_url,
        'capturedAt', clock_timestamp()
      ),
      clock_timestamp(),
      clock_timestamp(),
      clock_timestamp()
    from public.jobs as jobs
    where jobs.id = ${sqlLiteral(jobId)}::uuid;
  `, "Disposable QA fixture seed");

  if (process.env.PRODUCTION_QA_PREPARE_ONLY === "true") {
    cleanupResult = await cleanup(userId);
    userId = undefined;
    console.log(JSON.stringify({
      status: "prepare_only_passed",
      cleanup: cleanupResult,
    }, null, 2));
    process.exit(0);
  }

  const token = await signIn(email, password);

  const plan = await appRequest("/api/account/plan", token);
  expect(plan.status === 200, `Account plan read returned HTTP ${plan.status}`);
  expect(plan.body?.planName === "premium", "Account plan read did not return premium");

  const codeUsesBeforeRows = await managementQuery(`
    select use_count
    from public.access_codes
    where code = 'DUMPSTERFRIENDS'
    limit 1;
  `, "Access-code use-count precheck");
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

  const codeUsesAfterRows = await managementQuery(`
    select use_count
    from public.access_codes
    where code = 'DUMPSTERFRIENDS'
    limit 1;
  `, "Access-code use-count postcheck");
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

  const firstSnapshot = await qaSnapshot(userId, pursuitId);
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

  const finalSnapshot = await qaSnapshot(userId, pursuitId);
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

  const initialOutreachSnapshot = await qaSnapshot(userId, pursuitId);
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

  const replayOutreachSnapshot = await qaSnapshot(userId, pursuitId);
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

  const regenerationSnapshot = await qaSnapshot(userId, pursuitId);
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

  const phase2cSnapshot = await qaSnapshot(userId, pursuitId);
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

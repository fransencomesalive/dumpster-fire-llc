import assert from "node:assert/strict";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";
import { unavailableHumanPathProvider } from "../lib/public-profile/pursuits/human-path";
import {
  applyOutreachMessageAction,
  completeReview,
  createPursuit,
  expireInactivePursuit,
  transitionPursuit,
} from "../lib/public-profile/pursuits/state-machine";
import {
  PURSUIT_TRACKING_ACTIONS,
  derivePursuitTrackingState,
  planPursuitTrackingChanges,
  pursuitBucket,
  pursuitHistory,
} from "../lib/public-profile/pursuits/tracking";
import {
  createPursuitForJob,
  loadContactSuggestionsForPursuit,
  loadOutreachGenerationContextForMessage,
  loadOutreachMessageById,
  loadOutreachMessagesForPursuit,
  loadPursuitEventsForPursuit,
  loadPursuitTrackingEventsForUser,
  loadPursuitsForUser,
  persistContactSelection,
  persistHumanPathGeneration,
  persistOutreachGeneration,
  persistOutreachMessageFeedback,
  persistOutreachMessageCopy,
  persistOutreachRegeneration,
  persistPursuitTransition,
  persistPursuitTrackingMutation,
  updateOutreachMessage,
} from "../lib/public-profile/pursuits/repository";
import type { OutreachGenerationContext, OutreachMessageRecord } from "../lib/public-profile/pursuits/types";

const now = "2026-06-29T12:00:00.000Z";
const later = "2026-06-29T13:00:00.000Z";
const generationContext: OutreachGenerationContext = {
  schemaVersion: 1,
  generatedAt: now,
  profile: {
    id: "profile-1",
    version: 1,
    updatedAt: now,
    markdownSha256: "a".repeat(64),
    toneTags: ["direct"],
    avoidTags: ["formal"],
    avoidNote: "",
  },
  selection: {},
  pursuit: { id: "pursuit-1" },
  job: { id: "job-1", title: "Program Director", companyName: "Acme" },
  recipient: {
    contactSuggestionId: "contact-1",
    name: "Dana Lee",
    title: "VP Product",
    contactType: "likely_hiring_manager",
  },
};

const created = createPursuit({
  id: "pursuit-1",
  userId: "user-1",
  profileId: "profile-1",
  jobId: "job-1",
  now,
  fitSummary: "Strong match.",
  risks: ["Easy Apply volume"],
  recommendedWorkExampleIds: ["example-1"],
  outreachAngle: "Workflow alignment.",
});
assert.equal(created.ok, true);
if (created.ok) {
  assert.equal(created.pursuit.status, "saved");
  assert.equal(created.event.eventType, "created");
  assert.equal(created.event.usageType, undefined);
  assert.deepEqual(created.usageEvents, []);
}

if (!created.ok) throw new Error("createPursuit should succeed");
const createdPursuit = created.pursuit;
assert.deepEqual(PURSUIT_TRACKING_ACTIONS, [
  "outreach_sent",
  "applied_online",
  "response_received",
  "interviewing",
  "not_moving_forward",
  "never_heard_back",
]);
assert.equal(pursuitBucket(createdPursuit), "saved_for_later");
assert.equal(PURSUIT_TRACKING_ACTIONS.includes("offer" as never), false);

for (let mask = 0; mask < 64; mask += 1) {
  const requested = Object.fromEntries(PURSUIT_TRACKING_ACTIONS.map((action, index) => [
    action,
    Boolean(mask & (1 << index)),
  ]));
  const combination = planPursuitTrackingChanges({
    pursuit: createdPursuit,
    currentEvents: [],
    requested,
    source: "manual",
    idempotencyKey: `combination-${mask}`,
    occurredAt: later,
  });
  assert.equal(combination.ok, true);
  if (!combination.ok) throw new Error(`tracking combination ${mask} should succeed`);
  for (const [index, action] of PURSUIT_TRACKING_ACTIONS.entries()) {
    assert.equal(combination.state[action], Boolean(mask & (1 << index)));
  }
  assert.equal(pursuitBucket(combination.pursuit), mask === 0 ? "saved_for_later" : "applied");
}

const initialTracking = planPursuitTrackingChanges({
  pursuit: createdPursuit,
  currentEvents: [],
  requested: { outreach_sent: true, applied_online: true },
  source: "manual",
  idempotencyKey: "tracking-request-1",
  occurredAt: later,
});
assert.equal(initialTracking.ok, true);
if (!initialTracking.ok) throw new Error("initial tracking plan should succeed");
assert.equal(initialTracking.events.length, 2);
assert.equal(initialTracking.state.outreach_sent, true);
assert.equal(initialTracking.state.applied_online, true);
assert.equal(initialTracking.pursuit.trackingStartedAt, later);
assert.equal(pursuitBucket(initialTracking.pursuit), "applied");

const idempotentRetry = planPursuitTrackingChanges({
  pursuit: initialTracking.pursuit,
  currentEvents: initialTracking.events,
  requested: { outreach_sent: false },
  source: "manual",
  idempotencyKey: "tracking-request-1",
  occurredAt: "2026-06-29T13:30:00.000Z",
});
assert.equal(idempotentRetry.ok, true);
if (!idempotentRetry.ok) throw new Error("idempotent tracking retry should succeed");
assert.equal(idempotentRetry.events.length, 0);
assert.equal(idempotentRetry.state.outreach_sent, true);

const reversedTracking = planPursuitTrackingChanges({
  pursuit: initialTracking.pursuit,
  currentEvents: initialTracking.events,
  requested: { outreach_sent: false },
  source: "manual",
  idempotencyKey: "tracking-request-2",
  occurredAt: "2026-06-29T14:00:00.000Z",
});
assert.equal(reversedTracking.ok, true);
if (!reversedTracking.ok) throw new Error("tracking reversal should succeed");
assert.equal(reversedTracking.events.length, 1);
assert.equal(reversedTracking.events[0].checked, false);
assert.equal(reversedTracking.state.outreach_sent, false);
assert.equal(pursuitBucket(reversedTracking.pursuit), "applied");
assert.equal(
  derivePursuitTrackingState([
    reversedTracking.events[0],
    ...initialTracking.events,
  ]).outreach_sent,
  false,
);

const copyTracking = planPursuitTrackingChanges({
  pursuit: createdPursuit,
  currentEvents: [],
  requested: { outreach_sent: true },
  source: "message_copy",
  idempotencyKey: "copy-message-1",
  outreachMessageId: "message-1",
  contactSuggestionId: "contact-1",
  messageSnapshot: "  Hi Dana.\n\nThanks.  ",
  recipientNameSnapshot: "Dana Lee",
  recipientTitleSnapshot: "VP Product",
  recipientLinkedinUrlSnapshot: "https://linkedin.example/dana",
  occurredAt: later,
});
assert.equal(copyTracking.ok, true);
if (!copyTracking.ok) throw new Error("copy tracking should succeed");
assert.equal(copyTracking.events[0].source, "message_copy");
assert.equal(copyTracking.events[0].messageSnapshot, "  Hi Dana.\n\nThanks.  ");
assert.equal(copyTracking.events[0].recipientTitleSnapshot, "VP Product");
assert.equal(copyTracking.events[0].recipientLinkedinUrlSnapshot, "https://linkedin.example/dana");

const secondMessageCopy = planPursuitTrackingChanges({
  pursuit: copyTracking.pursuit,
  currentEvents: copyTracking.events,
  requested: { outreach_sent: true },
  source: "message_copy",
  idempotencyKey: "copy-message-2",
  outreachMessageId: "message-2",
  messageSnapshot: "Hi Sam.",
  recipientNameSnapshot: "Sam Rivera",
  recipientTitleSnapshot: "Product Director",
  occurredAt: "2026-06-29T13:30:00.000Z",
});
assert.equal(secondMessageCopy.ok, true);
if (!secondMessageCopy.ok) throw new Error("second message copy should succeed");
assert.equal(secondMessageCopy.events.length, 1);
assert.equal(secondMessageCopy.events[0].outreachMessageId, "message-2");
assert.equal(secondMessageCopy.state.outreach_sent, true);

const duplicateMessageCopy = planPursuitTrackingChanges({
  pursuit: secondMessageCopy.pursuit,
  currentEvents: [...copyTracking.events, ...secondMessageCopy.events],
  requested: { outreach_sent: true },
  source: "message_copy",
  idempotencyKey: "copy-message-2-retry",
  outreachMessageId: "message-2",
  messageSnapshot: "Hi Sam.",
  occurredAt: "2026-06-29T13:45:00.000Z",
});
assert.equal(duplicateMessageCopy.ok, true);
if (!duplicateMessageCopy.ok) throw new Error("duplicate message copy should be idempotent");
assert.equal(duplicateMessageCopy.events.length, 0);

const invalidCopyTracking = planPursuitTrackingChanges({
  pursuit: createdPursuit,
  currentEvents: [],
  requested: { outreach_sent: true },
  source: "message_copy",
  idempotencyKey: "copy-without-message",
  occurredAt: later,
});
assert.equal(invalidCopyTracking.ok, false);

const allMarked = planPursuitTrackingChanges({
  pursuit: createdPursuit,
  currentEvents: [],
  requested: Object.fromEntries(PURSUIT_TRACKING_ACTIONS.map((action) => [action, true])),
  source: "manual",
  idempotencyKey: "mark-all",
  occurredAt: later,
});
assert.equal(allMarked.ok, true);
if (!allMarked.ok) throw new Error("marking every tracking action should succeed");
const allReversed = planPursuitTrackingChanges({
  pursuit: allMarked.pursuit,
  currentEvents: allMarked.events,
  requested: Object.fromEntries(PURSUIT_TRACKING_ACTIONS.map((action) => [action, false])),
  source: "manual",
  idempotencyKey: "reverse-all",
  occurredAt: "2026-06-29T14:00:00.000Z",
});
assert.equal(allReversed.ok, true);
if (!allReversed.ok) throw new Error("reversing every tracking action should succeed");
assert.equal(allMarked.events.length + allReversed.events.length, 12);
assert.deepEqual(allReversed.state, {
  outreach_sent: false,
  applied_online: false,
  response_received: false,
  interviewing: false,
  not_moving_forward: false,
  never_heard_back: false,
});
assert.equal(allReversed.pursuit.trackingStartedAt, later);
assert.equal(pursuitBucket(allReversed.pursuit), "applied");

const safeHistory = pursuitHistory([
  ...copyTracking.events,
  ...reversedTracking.events,
]);
assert.equal(safeHistory[0].type, "tracking");
assert.equal(safeHistory[0].label, "Sent outreach message");
assert.equal(safeHistory[0].change, "unmarked");
const messageHistory = safeHistory.find((entry) => entry.type === "message");
assert.equal(messageHistory?.message.text, "  Hi Dana.\n\nThanks.  ");
assert.equal(messageHistory?.recipient.name, "Dana Lee");
const serializedHistory = JSON.stringify(safeHistory);
for (const forbidden of ["idempotencyKey", "pursuitId", "userId", "message_copy", "outreach_sent"]) {
  assert.equal(serializedHistory.includes(forbidden), false);
}

const reviewed = completeReview(created.pursuit, {
  selectedRoleTrackId: "track-1",
  selectedResumeId: "resume-1",
  selectedWorkExampleId: "example-1",
  fitSummary: "Lead with workflow systems.",
  risks: ["Compensation not posted"],
  recommendedWorkExampleIds: ["example-1", "example-2"],
  outreachAngle: "Stakeholder alignment.",
}, later);
assert.equal(reviewed.ok, true);
if (reviewed.ok) {
  assert.equal(reviewed.pursuit.status, "review_complete");
  assert.equal(reviewed.pursuit.selectedRoleTrackId, "track-1");
  assert.deepEqual(reviewed.pursuit.recommendedWorkExampleIds, ["example-1", "example-2"]);
  assert.equal(reviewed.usageEvents.length, 0);
}

if (!reviewed.ok) throw new Error("completeReview should succeed");
const humanPath = transitionPursuit(reviewed.pursuit, "human_path_generated", "2026-06-29T14:00:00.000Z", { contactCount: 3 });
assert.equal(humanPath.ok, true);
if (humanPath.ok) {
  assert.equal(humanPath.pursuit.status, "human_path_generated");
  assert.equal(humanPath.usageEvents[0].usageType, "human_path");
}

if (!humanPath.ok) throw new Error("human path transition should succeed");
// A resumed Human Path re-enters at step 1, so re-completing review on an already-advanced
// pursuit must succeed, update the selection, and never regress the status.
const rereviewed = completeReview(humanPath.pursuit, { selectedRoleTrackId: "track-2" }, "2026-06-29T14:30:00.000Z");
assert.equal(rereviewed.ok, true);
if (rereviewed.ok) {
  assert.equal(rereviewed.pursuit.status, "human_path_generated");
  assert.equal(rereviewed.pursuit.selectedRoleTrackId, "track-2");
}

const contacts = transitionPursuit(humanPath.pursuit, "contacts_selected", "2026-06-29T15:00:00.000Z", { contactIds: ["contact-1"] });
assert.equal(contacts.ok, true);
if (contacts.ok) {
  assert.equal(contacts.pursuit.status, "outreach_ready");
  assert.equal(contacts.usageEvents.length, 0);
}

if (!contacts.ok) throw new Error("contact selection should succeed");
const outreach = transitionPursuit(contacts.pursuit, "outreach_generated", "2026-06-29T16:00:00.000Z", {
  messageCount: 2,
  chargePursuit: true,
});
assert.equal(outreach.ok, true);
if (outreach.ok) {
  assert.equal(outreach.pursuit.status, "outreach_ready");
  assert.deepEqual(outreach.usageEvents.map((event) => event.usageType), ["pursuit", "outreach_message"]);
  assert.equal(outreach.usageEvents[1].quantity, 2);
}

if (!outreach.ok) throw new Error("outreach transition should succeed");
const sent = transitionPursuit(outreach.pursuit, "outreach_sent", "2026-06-29T17:00:00.000Z");
assert.equal(sent.ok, true);
if (sent.ok) assert.equal(sent.pursuit.status, "outreach_sent");

if (!sent.ok) throw new Error("sent pursuit should be available for tracking tests");
const applied = transitionPursuit(sent.pursuit, "applied", "2026-06-29T18:00:00.000Z");
assert.equal(applied.ok, true);
if (applied.ok) assert.equal(applied.pursuit.status, "applied");

if (!applied.ok) throw new Error("applied pursuit should be available for tracking tests");
const responded = transitionPursuit(applied.pursuit, "responded", "2026-06-29T19:00:00.000Z");
assert.equal(responded.ok, true);
if (responded.ok) assert.equal(responded.pursuit.status, "responded");

if (!responded.ok) throw new Error("responded pursuit should be available for tracking tests");
const interviewing = transitionPursuit(responded.pursuit, "interviewing", "2026-06-29T20:00:00.000Z");
assert.equal(interviewing.ok, true);
if (interviewing.ok) assert.equal(interviewing.pursuit.status, "interviewing");

if (!interviewing.ok) throw new Error("interviewing pursuit should be available for tracking tests");
const rejected = transitionPursuit(interviewing.pursuit, "rejected", "2026-06-29T22:00:00.000Z");
assert.equal(rejected.ok, true);
if (rejected.ok) assert.equal(rejected.pursuit.status, "rejected");

const badTransition = transitionPursuit(created.pursuit, "outreach_generated", later);
assert.equal(badTransition.ok, false);
if (badTransition.ok === false) assert.ok(badTransition.issues[0].includes("Cannot apply outreach_generated"));

const freshExpiration = expireInactivePursuit(created.pursuit, "2026-07-01T12:00:00.000Z");
assert.equal(freshExpiration.ok, false);

const stalePursuit = { ...created.pursuit, lastActivityAt: "2026-01-01T00:00:00.000Z" };
const expired = expireInactivePursuit(stalePursuit, "2026-06-29T12:00:00.000Z");
assert.equal(expired.ok, true);
if (expired.ok) assert.equal(expired.pursuit.status, "expired");

async function main() {
  const providerResult = await unavailableHumanPathProvider({
    pursuit: createdPursuit,
    job: { id: "job-1", title: "Program Director", companyName: "Useful Studio", description: "Lead delivery." },
  });
  assert.equal(providerResult.status, "provider_unavailable");

  const calls: Array<{ table: string; method: string; query?: string; body: unknown }> = [];
  const request: PublicProfileRepositoryRequest = async <T>(
    table: string,
    options: Parameters<PublicProfileRepositoryRequest>[1],
  ) => {
    calls.push({ table, method: options.method ?? "GET", query: options.query, body: options.body });
    return [] as T;
  };

  await createPursuitForJob(request, {
    id: "pursuit-2",
    userId: "user-1",
    profileId: "profile-1",
    jobId: "job-2",
    now,
  });
  assert.equal(calls[0].table, "pursuits");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[1].table, "pursuit_events");
  assert.equal(calls.some((call) => call.table === "usage_ledger"), false);

  if (!reviewed.ok) throw new Error("reviewed pursuit should be available for repository test");
  calls.length = 0;
  await persistPursuitTransition(request, reviewed);
  assert.equal(calls[0].table, "pursuits");
  assert.equal(calls[0].method, "PATCH");
  assert.equal(calls[1].table, "pursuit_events");
  assert.equal(calls.some((call) => call.table === "usage_ledger"), false);

  if (!humanPath.ok) throw new Error("human path pursuit should be available for repository test");
  calls.length = 0;
  await persistHumanPathGeneration(request, humanPath, [{
    name: "Dana Lee",
    title: "VP Product",
    companyName: "Useful Studio",
    professionalContactUrl: "https://dana.example/contact",
    reachability: { method: "contact_page", url: "https://dana.example/contact" },
    contactType: "likely_hiring_manager",
    confidence: "high",
    relevanceReason: "Owns the program area.",
    roleConnection: "Likely sponsor for cross-functional delivery.",
    verificationNotes: ["Title matches the function."],
  }]);
  assert.equal(calls[0].table, "pursuits");
  assert.equal(calls[0].method, "PATCH");
  assert.equal(calls[1].table, "pursuit_events");
  assert.equal(calls[2].table, "usage_ledger");
  assert.equal(calls[3].table, "contact_suggestions");
  assert.equal(calls[3].method, "DELETE");
  assert.equal(calls[4].table, "contact_suggestions");
  assert.equal(calls[4].method, "POST");
  const persistedContacts = calls[4].body as Array<{ professional_contact_url: string | null }>;
  assert.equal(persistedContacts[0].professional_contact_url, "https://dana.example/contact");

  const contactRowsRequest: PublicProfileRepositoryRequest = async <T>() => [{
    id: "contact-1",
    name: "Dana Lee",
    title: "VP Product",
    company_name: "Useful Studio",
    linkedin_url: null,
    professional_contact_url: "https://dana.example/contact",
    email: null,
    contact_type: "likely_hiring_manager",
    confidence: "high",
    relevance_reason: "Owns the program area.",
    role_connection: "Likely sponsor for cross-functional delivery.",
    verification_notes: ["Title matches the function."],
    selected_for_outreach: true,
    created_at: now,
    updated_at: now,
  }] as T;
  const loadedContacts = await loadContactSuggestionsForPursuit(contactRowsRequest, "pursuit-1");
  assert.equal(loadedContacts[0].id, "contact-1");
  assert.equal(loadedContacts[0].companyName, "Useful Studio");
  assert.deepEqual(loadedContacts[0].reachability, { method: "contact_page", url: "https://dana.example/contact" });
  assert.equal(loadedContacts[0].selectedForOutreach, true);

  if (!contacts.ok) throw new Error("contact selection pursuit should be available for repository test");
  calls.length = 0;
  await persistContactSelection(request, contacts, ["contact-1"]);
  assert.equal(calls[0].table, "pursuits");
  assert.equal(calls[1].table, "pursuit_events");
  assert.equal(calls[2].table, "contact_suggestions");
  assert.equal(calls[2].method, "PATCH");
  assert.deepEqual(calls[2].body, {
    selected_for_outreach: false,
    updated_at: contacts.pursuit.updatedAt,
  });
  assert.equal(calls[3].table, "contact_suggestions");
  assert.equal(calls[3].method, "PATCH");
  assert.deepEqual(calls[3].body, {
    selected_for_outreach: true,
    updated_at: contacts.pursuit.updatedAt,
  });

  if (!outreach.ok) throw new Error("outreach pursuit should be available for repository test");
  const atomicCalls: Array<{ table: string; method?: string; body?: unknown }> = [];
  const atomicPursuitRow = {
    id: outreach.pursuit.id,
    user_id: "user-1",
    profile_id: "profile-1",
    job_id: "job-1",
    selected_role_track_id: "track-1",
    selected_resume_id: "resume-1",
    selected_work_example_id: "example-1",
    status: "outreach_ready",
    fit_summary: null,
    risks: [],
    recommended_work_example_ids: [],
    outreach_angle: null,
    tracking_started_at: later,
    pursuit_metered_at: later,
    notes: null,
    job_snapshot: {},
    selection_snapshot: {},
    last_activity_at: later,
    created_at: now,
    updated_at: later,
  };
  const atomicMessageRow = {
    id: "message-atomic-1",
    pursuit_id: outreach.pursuit.id,
    contact_suggestion_id: "contact-1",
    recipient_type: "likely_hiring_manager",
    channel: "other",
    message: "Hi Dana - interested in the Program Director role.",
    previous_message: null,
    regeneration_count: 0,
    status: "draft",
    rejection_reason: null,
    selected_role_track_id: "track-1",
    selected_resume_id: "resume-1",
    selected_work_example_id: "example-1",
    sent_at: null,
    created_at: later,
    updated_at: later,
  };
  const atomicTrackingRow = {
    id: "tracking-event-atomic-1",
    pursuit_id: outreach.pursuit.id,
    user_id: "user-1",
    action: "outreach_sent",
    checked: true,
    source: "message_copy",
    outreach_message_id: "message-atomic-1",
    contact_suggestion_id: "contact-1",
    message_snapshot: "Hi Dana.",
    recipient_name_snapshot: "Dana Lee",
    recipient_title_snapshot: "VP Product",
    recipient_linkedin_url_snapshot: "https://linkedin.example/dana",
    idempotency_key: "copy-message-atomic:outreach_sent",
    occurred_at: later,
    created_at: later,
  };
  const atomicRequest: PublicProfileRepositoryRequest = async <T>(
    table: string,
    options: Parameters<PublicProfileRepositoryRequest>[1],
  ) => {
    atomicCalls.push({ table, method: options.method, body: options.body });
    if (table === "rpc/persist_initial_outreach_generation") {
      return {
        status: "outreach_generated",
        pursuit: atomicPursuitRow,
        messages: [atomicMessageRow],
        pursuitDebited: true,
        outreachDebited: 1,
        replayed: false,
      } as T;
    }
    return {
      status: table === "rpc/mutate_pursuit_tracking" ? "tracking_updated" : "message_copy_recorded",
      pursuit: atomicPursuitRow,
      events: [atomicTrackingRow],
      replayed: false,
    } as T;
  };

  const persistedInitial = await persistOutreachGeneration(atomicRequest, outreach, [{
    contactSuggestionId: "contact-1",
    recipientType: "likely_hiring_manager",
    message: "Hi Dana - interested in the Program Director role.",
    selectedRoleTrackId: "track-1",
    selectedResumeId: "resume-1",
    selectedWorkExampleId: "example-1",
    generationContext,
    createdAt: outreach.pursuit.updatedAt,
  }], { idempotencyKey: "initial-outreach-1" });
  assert.equal(atomicCalls.length, 1);
  assert.equal(atomicCalls[0].table, "rpc/persist_initial_outreach_generation");
  const initialRpcBody = atomicCalls[0].body as { p_messages: Array<{ generation_context: OutreachGenerationContext }> };
  assert.deepEqual(initialRpcBody.p_messages[0].generation_context, generationContext);
  assert.equal(persistedInitial.messages[0].id, "message-atomic-1");
  assert.equal(persistedInitial.pursuitDebited, true);
  assert.equal(persistedInitial.outreachDebited, 1);

  atomicCalls.length = 0;
  const trackingCommit = await persistPursuitTrackingMutation(atomicRequest, {
    userId: "user-1",
    pursuitId: outreach.pursuit.id,
    changes: { applied_online: true, response_received: true },
    idempotencyKey: "tracking-atomic-1",
  });
  assert.equal(atomicCalls.length, 1);
  assert.equal(atomicCalls[0].table, "rpc/mutate_pursuit_tracking");
  assert.equal(trackingCommit.state.outreach_sent, true);
  assert.equal(trackingCommit.history[0].type, "message");

  atomicCalls.length = 0;
  const copyCommit = await persistOutreachMessageCopy(atomicRequest, {
    userId: "user-1",
    outreachMessageId: "message-atomic-1",
    idempotencyKey: "copy-message-atomic",
  });
  assert.equal(atomicCalls.length, 1);
  assert.equal(atomicCalls[0].table, "rpc/record_outreach_message_copy");
  assert.equal(copyCommit.history[0].type, "message");

  const listCalls: Array<{ table: string; query?: string }> = [];
  const listRequest: PublicProfileRepositoryRequest = async <T>(
    table: string,
    requestOptions: Parameters<PublicProfileRepositoryRequest>[1],
  ) => {
    listCalls.push({ table, query: requestOptions.query });
    return [{
      id: "pursuit-1",
      user_id: "user-1",
      profile_id: "profile-1",
      job_id: "job-1",
      selected_role_track_id: null,
      selected_resume_id: null,
      selected_work_example_id: null,
      status: "saved",
      fit_summary: null,
      risks: [],
      recommended_work_example_ids: [],
      outreach_angle: null,
      tracking_started_at: later,
      notes: "Follow up after the conference.",
      job_snapshot: {
        title: "Program Director",
        companyName: "Useful Studio",
        sourceUrl: "https://jobs.example/program-director",
        capturedAt: now,
      },
      selection_snapshot: {
        roleTrackId: "track-1",
        contactSuggestionIds: ["contact-1"],
        capturedAt: now,
      },
      last_activity_at: now,
      created_at: now,
      updated_at: now,
    }] as T;
  };

  const defaultList = await loadPursuitsForUser(listRequest, "user-1");
  assert.equal(listCalls[0].table, "pursuits");
  assert.ok(listCalls[0].query?.includes("user_id=eq.user-1"));
  assert.ok(listCalls[0].query?.includes("status=neq.deleted"));
  assert.ok(listCalls[0].query?.includes("order=last_activity_at.desc"));
  assert.equal(defaultList[0].id, "pursuit-1");
  assert.equal(defaultList[0].status, "saved");
  assert.equal(defaultList[0].trackingStartedAt, later);
  assert.equal(defaultList[0].notes, "Follow up after the conference.");
  assert.equal(defaultList[0].jobSnapshot?.title, "Program Director");
  assert.deepEqual(defaultList[0].selectionSnapshot?.contactSuggestionIds, ["contact-1"]);

  listCalls.length = 0;
  await loadPursuitsForUser(listRequest, "user-1", { status: "outreach_sent" });
  assert.ok(listCalls[0].query?.includes("status=eq.outreach_sent"));
  assert.equal(listCalls[0].query?.includes("status=neq.deleted"), false);

  listCalls.length = 0;
  await loadPursuitsForUser(listRequest, "user-1", { includeDeleted: true });
  assert.equal(listCalls[0].query?.includes("status="), false);

  const outreachRequest: PublicProfileRepositoryRequest = async <T>() => [{
    id: "message-1",
    pursuit_id: "pursuit-1",
    contact_suggestion_id: "contact-1",
    recipient_type: "likely_hiring_manager",
    channel: "email",
    message: "Hi Dana.",
    status: "draft",
    rejection_reason: null,
    selected_role_track_id: "track-1",
    selected_resume_id: "resume-1",
    selected_work_example_id: "example-1",
    sent_at: later,
    created_at: now,
    updated_at: now,
  }] as T;
  const outreachMessages = await loadOutreachMessagesForPursuit(outreachRequest, "pursuit-1");
  assert.equal(outreachMessages[0].id, "message-1");
  assert.equal(outreachMessages[0].recipientType, "likely_hiring_manager");
  assert.equal(outreachMessages[0].contactSuggestionId, "contact-1");
  assert.equal(outreachMessages[0].rejectionReason, undefined);
  assert.equal(outreachMessages[0].selectedWorkExampleId, "example-1");
  assert.equal(outreachMessages[0].sentAt, later);

  const eventsRequest: PublicProfileRepositoryRequest = async <T>() => [{
    id: "event-1",
    pursuit_id: "pursuit-1",
    user_id: "user-1",
    event_type: "created",
    from_status: null,
    to_status: "saved",
    usage_type: "pursuit",
    payload: {},
    created_at: now,
  }] as T;
  const pursuitEvents = await loadPursuitEventsForPursuit(eventsRequest, "pursuit-1");
  assert.equal(pursuitEvents[0].id, "event-1");
  assert.equal(pursuitEvents[0].eventType, "created");
  assert.equal(pursuitEvents[0].toStatus, "saved");
  assert.equal(pursuitEvents[0].fromStatus, undefined);

  const trackingEventCalls: Array<{ table: string; query?: string }> = [];
  const trackingEventsRequest: PublicProfileRepositoryRequest = async <T>(
    table: string,
    requestOptions: Parameters<PublicProfileRepositoryRequest>[1],
  ) => {
    trackingEventCalls.push({ table, query: requestOptions.query });
    return [{
      id: "tracking-event-1",
      pursuit_id: "pursuit-1",
      user_id: "user-1",
      action: "outreach_sent",
      checked: true,
      source: "message_copy",
      outreach_message_id: "message-1",
      contact_suggestion_id: "contact-1",
      message_snapshot: "Hi Dana.",
      recipient_name_snapshot: "Dana Lee",
      recipient_title_snapshot: "VP Product",
      recipient_linkedin_url_snapshot: "https://linkedin.example/dana",
      idempotency_key: "copy-message-1:outreach_sent",
      occurred_at: later,
      created_at: later,
    }] as T;
  };
  const trackingEvents = await loadPursuitTrackingEventsForUser(
    trackingEventsRequest,
    "user-1",
    "pursuit-1",
  );
  assert.equal(trackingEventCalls[0].table, "pursuit_tracking_events");
  const trackingQuery = decodeURIComponent(trackingEventCalls[0].query ?? "");
  assert.ok(trackingQuery.includes("pursuit_id=eq.pursuit-1"));
  assert.ok(trackingQuery.includes("user_id=eq.user-1"));
  assert.ok(trackingQuery.includes("order=occurred_at.asc,created_at.asc"));
  assert.equal(trackingEvents[0].id, "tracking-event-1");
  assert.equal(trackingEvents[0].source, "message_copy");
  assert.equal(trackingEvents[0].messageSnapshot, "Hi Dana.");
  assert.equal(trackingEvents[0].recipientNameSnapshot, "Dana Lee");
  assert.equal(trackingEvents[0].recipientTitleSnapshot, "VP Product");
  assert.equal(
    trackingEvents[0].recipientLinkedinUrlSnapshot,
    "https://linkedin.example/dana",
  );

  // ---- Per-message outreach actions ----
  const baseMessage: OutreachMessageRecord = {
    id: "message-1",
    pursuitId: "pursuit-1",
    contactSuggestionId: "contact-1",
    recipientType: "likely_hiring_manager",
    channel: "linkedin",
    message: "Original draft.",
    regenerationCount: 0,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };

  const approved = applyOutreachMessageAction(baseMessage, { type: "approve" }, later);
  assert.equal(approved.ok, true);
  if (approved.ok) {
    assert.equal(approved.message.status, "approved");
    assert.equal(approved.message.rejectionReason, undefined);
    assert.equal(approved.message.updatedAt, later);
  }

  const rejected = applyOutreachMessageAction(baseMessage, { type: "reject", rejectionReason: "Too formal" }, later);
  assert.equal(rejected.ok, true);
  if (rejected.ok) {
    assert.equal(rejected.message.status, "rejected");
    assert.equal(rejected.message.rejectionReason, "Too formal");
  }

  const rejectNoReason = applyOutreachMessageAction(baseMessage, { type: "reject", rejectionReason: "  " }, later);
  assert.equal(rejectNoReason.ok, false);

  const edited = applyOutreachMessageAction(
    { ...baseMessage, status: "approved" },
    { type: "edit", message: "  Revised copy.  " },
    later,
  );
  assert.equal(edited.ok, true);
  if (edited.ok) {
    assert.equal(edited.message.message, "Revised copy.");
    // Editing an approved draft returns it to draft so it must be re-approved before sending.
    assert.equal(edited.message.status, "draft");
  }

  const editEmpty = applyOutreachMessageAction(baseMessage, { type: "edit", message: "   " }, later);
  assert.equal(editEmpty.ok, false);

  const sent = applyOutreachMessageAction({ ...baseMessage, status: "approved" }, { type: "send" }, later);
  assert.equal(sent.ok, true);
  if (sent.ok) assert.equal(sent.message.status, "sent");

  // Cannot send a draft that was never approved ("never auto-sent").
  const sendUnapproved = applyOutreachMessageAction(baseMessage, { type: "send" }, later);
  assert.equal(sendUnapproved.ok, false);

  // A sent message is terminal.
  const modifySent = applyOutreachMessageAction({ ...baseMessage, status: "sent" }, { type: "edit", message: "x" }, later);
  assert.equal(modifySent.ok, false);

  // Re-approving a rejected draft is allowed.
  const reapproved = applyOutreachMessageAction({ ...baseMessage, status: "rejected", rejectionReason: "old" }, { type: "approve" }, later);
  assert.equal(reapproved.ok, true);
  if (reapproved.ok) assert.equal(reapproved.message.rejectionReason, undefined);

  // Repository: load one message by id.
  const messageRequest: PublicProfileRepositoryRequest = async <T>() => [{
    id: "message-1",
    pursuit_id: "pursuit-1",
    contact_suggestion_id: "contact-1",
    recipient_type: "likely_hiring_manager",
    channel: "linkedin",
    message: "Original draft.",
    previous_message: null,
    regeneration_count: 0,
    status: "draft",
    rejection_reason: null,
    selected_role_track_id: "track-1",
    selected_resume_id: null,
    selected_work_example_id: "example-1",
    generation_request_id: "generation-1",
    created_at: now,
    updated_at: now,
  }] as T;
  const loadedMessage = await loadOutreachMessageById(messageRequest, "message-1");
  assert.equal(loadedMessage?.id, "message-1");
  assert.equal(loadedMessage?.status, "draft");
  assert.equal(loadedMessage?.regenerationCount, 0);
  assert.equal(loadedMessage?.selectedWorkExampleId, "example-1");
  assert.equal(loadedMessage?.generationRequestId, "generation-1");
  assert.equal(loadedMessage?.rejectionReason, undefined);

  // Repository: persist a message update via PATCH.
  const updateCalls: Array<{ table: string; method?: string; query?: string; body?: unknown }> = [];
  const updateRequest: PublicProfileRepositoryRequest = async <T>(table: string, init?: { method?: string; query?: string; body?: unknown }) => {
    updateCalls.push({ table, method: init?.method, query: init?.query, body: init?.body });
    return [] as T;
  };
  await updateOutreachMessage(updateRequest, {
    ...baseMessage,
    status: "rejected",
    rejectionReason: "Too formal",
    updatedAt: later,
  });
  assert.equal(updateCalls[0].table, "outreach_messages");
  assert.equal(updateCalls[0].method, "PATCH");
  assert.ok(updateCalls[0].query?.includes("id=eq.message-1"));
  assert.deepEqual(updateCalls[0].body, {
    message: "Original draft.",
    status: "rejected",
    rejection_reason: "Too formal",
    updated_at: later,
  });

  // Repository: feedback upserts one record per user/message/revision and snapshots
  // the exact message without mutating the outreach row.
  const feedbackCalls: Array<{ table: string; method?: string; query?: string; headers?: Record<string, string>; body?: unknown }> = [];
  const feedbackRequest: PublicProfileRepositoryRequest = async <T>(table: string, init?: { method?: string; query?: string; headers?: Record<string, string>; body?: unknown }) => {
    feedbackCalls.push({ table, method: init?.method, query: init?.query, headers: init?.headers, body: init?.body });
    return [{
      id: "feedback-1",
      outreach_message_id: "message-1",
      user_id: "user-1",
      feedback_type: "needs_work",
      reason_codes: ["personal_voice_mismatch", "awkward_to_read"],
      notes: "Opening feels stiff.",
      message_snapshot: "Original draft.",
      message_revision: 0,
      generation_request_id: "generation-1",
      generation_context: { source: "initial_generation", generation: generationContext },
      created_at: now,
      updated_at: later,
    }] as T;
  };
  const feedback = await persistOutreachMessageFeedback(feedbackRequest, {
    outreachMessageId: "message-1",
    userId: "user-1",
    reasonCodes: ["personal_voice_mismatch", "awkward_to_read"],
    notes: "Opening feels stiff.",
    messageSnapshot: "Original draft.",
    messageRevision: 0,
    generationRequestId: "generation-1",
    generationContext: { source: "initial_generation", generation: generationContext },
    updatedAt: later,
  });
  assert.equal(feedback.id, "feedback-1");
  assert.equal(feedback.feedbackType, "needs_work");
  assert.deepEqual(feedback.reasonCodes, ["personal_voice_mismatch", "awkward_to_read"]);
  assert.equal(feedback.messageSnapshot, "Original draft.");
  assert.equal(feedback.messageRevision, 0);
  assert.equal(feedbackCalls[0].table, "saved_message_feedback");
  assert.equal(feedbackCalls[0].method, "POST");
  assert.equal(feedbackCalls[0].query, "?on_conflict=user_id,outreach_message_id,message_revision,feedback_type");
  assert.deepEqual(feedbackCalls[0].headers, { Prefer: "resolution=merge-duplicates,return=representation" });
  assert.deepEqual(feedbackCalls[0].body, {
    outreach_message_id: "message-1",
    user_id: "user-1",
    feedback_type: "needs_work",
    reason_codes: ["personal_voice_mismatch", "awkward_to_read"],
    notes: "Opening feels stiff.",
    message_snapshot: "Original draft.",
    message_revision: 0,
    generation_request_id: "generation-1",
    generation_context: { source: "initial_generation", generation: generationContext },
    updated_at: later,
  });

  const loadedInitialContext = await loadOutreachGenerationContextForMessage(
    async <T>() => [{
      id: "generation-1",
      request_payload: [{ contact_suggestion_id: "contact-1", generation_context: generationContext }],
    }] as T,
    {
      id: "message-1",
      pursuitId: "pursuit-1",
      contactSuggestionId: "contact-1",
      recipientType: "likely_hiring_manager",
      channel: "email",
      message: "Original draft.",
      regenerationCount: 0,
      status: "draft",
      generationRequestId: "generation-1",
      createdAt: now,
      updatedAt: now,
    },
  );
  assert.deepEqual(loadedInitialContext, { source: "initial_generation", generation: generationContext });

  // Repository: regeneration updates the existing row only when its count is still zero,
  // then records the pursuit event and one outreach-message credit.
  const regenerationCalls: Array<{ table: string; method?: string; query?: string; headers?: Record<string, string>; body?: unknown }> = [];
  const regenerationRequest: PublicProfileRepositoryRequest = async <T>(table: string, init?: { method?: string; query?: string; headers?: Record<string, string>; body?: unknown }) => {
    regenerationCalls.push({ table, method: init?.method, query: init?.query, headers: init?.headers, body: init?.body });
    if (table === "outreach_messages") {
      return [{
        id: "message-1",
        pursuit_id: "pursuit-1",
        contact_suggestion_id: "contact-1",
        recipient_type: "likely_hiring_manager",
        channel: "email",
        message: "Replacement draft.",
        previous_message: "Original draft.",
        regeneration_count: 1,
        status: "draft",
        rejection_reason: null,
        selected_role_track_id: "track-1",
        selected_resume_id: null,
        selected_work_example_id: "example-1",
        created_at: now,
        updated_at: later,
      }] as T;
    }
    return [] as T;
  };
  const regenerationTransition = transitionPursuit(contacts.pursuit, "outreach_generated", later, {
    messageCount: 1,
    regenerate: true,
    previousMessageId: "message-1",
  });
  assert.equal(regenerationTransition.ok, true);
  if (!regenerationTransition.ok) throw new Error("regeneration transition should succeed");
  const regeneratedMessage = await persistOutreachRegeneration(regenerationRequest, regenerationTransition, {
    messageId: "message-1",
    previousMessage: "Original draft.",
    message: "Replacement draft.",
    generationContext,
    updatedAt: later,
  });
  assert.equal(regeneratedMessage?.message, "Replacement draft.");
  assert.equal(regeneratedMessage?.previousMessage, "Original draft.");
  assert.equal(regeneratedMessage?.regenerationCount, 1);
  assert.equal(regenerationCalls[0].table, "outreach_messages");
  assert.equal(regenerationCalls[0].method, "PATCH");
  assert.ok(regenerationCalls[0].query?.includes("id=eq.message-1"));
  assert.ok(regenerationCalls[0].query?.includes("pursuit_id=eq.pursuit-1"));
  assert.ok(regenerationCalls[0].query?.includes("regeneration_count=eq.0"));
  assert.deepEqual(regenerationCalls[0].headers, { Prefer: "return=representation" });
  assert.deepEqual(regenerationCalls[0].body, {
    message: "Replacement draft.",
    previous_message: "Original draft.",
    regeneration_count: 1,
    regeneration_context: generationContext,
    status: "draft",
    rejection_reason: null,
    updated_at: later,
  });
  assert.deepEqual(regenerationCalls.slice(1).map((call) => call.table), ["pursuits", "pursuit_events", "usage_ledger"]);

  const lostRaceCalls: string[] = [];
  const lostRaceRequest: PublicProfileRepositoryRequest = async <T>(table: string) => {
    lostRaceCalls.push(table);
    return [] as T;
  };
  const lostRace = await persistOutreachRegeneration(lostRaceRequest, regenerationTransition, {
    messageId: "message-1",
    previousMessage: "Original draft.",
    message: "Another replacement.",
    generationContext,
    updatedAt: later,
  });
  assert.equal(lostRace, undefined);
  assert.deepEqual(lostRaceCalls, ["outreach_messages"]);

  console.log("public profile pursuits: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

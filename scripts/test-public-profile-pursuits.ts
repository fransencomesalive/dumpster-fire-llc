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
  createPursuitForJob,
  loadContactSuggestionsForPursuit,
  loadOutreachMessageById,
  loadOutreachMessagesForPursuit,
  loadPursuitEventsForPursuit,
  loadPursuitsForUser,
  persistContactSelection,
  persistHumanPathGeneration,
  persistOutreachGeneration,
  persistPursuitTransition,
  updateOutreachMessage,
} from "../lib/public-profile/pursuits/repository";
import type { OutreachMessageRecord } from "../lib/public-profile/pursuits/types";

const now = "2026-06-29T12:00:00.000Z";
const later = "2026-06-29T13:00:00.000Z";

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
  assert.equal(created.event.usageType, "pursuit");
  assert.equal(created.usageEvents[0].usageType, "pursuit");
}

if (!created.ok) throw new Error("createPursuit should succeed");
const createdPursuit = created.pursuit;
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
const contacts = transitionPursuit(humanPath.pursuit, "contacts_selected", "2026-06-29T15:00:00.000Z", { contactIds: ["contact-1"] });
assert.equal(contacts.ok, true);
if (contacts.ok) {
  assert.equal(contacts.pursuit.status, "outreach_ready");
  assert.equal(contacts.usageEvents.length, 0);
}

if (!contacts.ok) throw new Error("contact selection should succeed");
const outreach = transitionPursuit(contacts.pursuit, "outreach_generated", "2026-06-29T16:00:00.000Z", { messageCount: 2 });
assert.equal(outreach.ok, true);
if (outreach.ok) {
  assert.equal(outreach.pursuit.status, "outreach_ready");
  assert.equal(outreach.usageEvents[0].usageType, "outreach_message");
  assert.equal(outreach.usageEvents[0].quantity, 2);
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
const offer = transitionPursuit(interviewing.pursuit, "offer", "2026-06-29T21:00:00.000Z");
assert.equal(offer.ok, true);
if (offer.ok) assert.equal(offer.pursuit.status, "offer");

if (!offer.ok) throw new Error("offer pursuit should be available for tracking tests");
const rejected = transitionPursuit(offer.pursuit, "rejected", "2026-06-29T22:00:00.000Z");
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
  assert.equal(calls[2].table, "usage_ledger");

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

  const contactRowsRequest: PublicProfileRepositoryRequest = async <T>() => [{
    id: "contact-1",
    name: "Dana Lee",
    title: "VP Product",
    company_name: "Useful Studio",
    linkedin_url: "https://linkedin.example/dana",
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
  calls.length = 0;
  await persistOutreachGeneration(request, outreach, [{
    contactSuggestionId: "contact-1",
    recipientType: "likely_hiring_manager",
    message: "Hi Dana - interested in the Program Director role.",
    selectedRoleTrackId: "track-1",
    selectedResumeId: "resume-1",
    selectedWorkExampleId: "example-1",
    createdAt: outreach.pursuit.updatedAt,
  }]);
  assert.equal(calls[0].table, "pursuits");
  assert.equal(calls[1].table, "pursuit_events");
  assert.equal(calls[2].table, "usage_ledger");
  assert.equal(calls[3].table, "outreach_messages");
  assert.equal(calls[3].method, "POST");
  assert.deepEqual(calls[3].body, [{
    pursuit_id: outreach.pursuit.id,
    contact_suggestion_id: "contact-1",
    recipient_type: "likely_hiring_manager",
    message: "Hi Dana - interested in the Program Director role.",
    selected_resume_id: "resume-1",
    selected_role_track_id: "track-1",
    selected_work_example_id: "example-1",
    status: "draft",
    created_at: outreach.pursuit.updatedAt,
    updated_at: outreach.pursuit.updatedAt,
  }]);

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
    created_at: now,
    updated_at: now,
  }] as T;
  const outreachMessages = await loadOutreachMessagesForPursuit(outreachRequest, "pursuit-1");
  assert.equal(outreachMessages[0].id, "message-1");
  assert.equal(outreachMessages[0].recipientType, "likely_hiring_manager");
  assert.equal(outreachMessages[0].contactSuggestionId, "contact-1");
  assert.equal(outreachMessages[0].rejectionReason, undefined);
  assert.equal(outreachMessages[0].selectedWorkExampleId, "example-1");

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

  // ---- Per-message outreach actions ----
  const baseMessage: OutreachMessageRecord = {
    id: "message-1",
    pursuitId: "pursuit-1",
    contactSuggestionId: "contact-1",
    recipientType: "likely_hiring_manager",
    channel: "linkedin",
    message: "Original draft.",
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
    status: "draft",
    rejection_reason: null,
    selected_role_track_id: "track-1",
    selected_resume_id: null,
    selected_work_example_id: "example-1",
    created_at: now,
    updated_at: now,
  }] as T;
  const loadedMessage = await loadOutreachMessageById(messageRequest, "message-1");
  assert.equal(loadedMessage?.id, "message-1");
  assert.equal(loadedMessage?.status, "draft");
  assert.equal(loadedMessage?.selectedWorkExampleId, "example-1");
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

  console.log("public profile pursuits: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

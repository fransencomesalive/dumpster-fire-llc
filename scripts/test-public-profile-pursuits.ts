import assert from "node:assert/strict";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";
import { unavailableHumanPathProvider } from "../lib/public-profile/pursuits/human-path";
import {
  completeReview,
  createPursuit,
  expireInactivePursuit,
  transitionPursuit,
} from "../lib/public-profile/pursuits/state-machine";
import { createPursuitForJob, persistPursuitTransition } from "../lib/public-profile/pursuits/repository";

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

  const calls: Array<{ table: string; method: string; body: unknown }> = [];
  const request: PublicProfileRepositoryRequest = async <T>(
    table: string,
    options: Parameters<PublicProfileRepositoryRequest>[1],
  ) => {
    calls.push({ table, method: options.method ?? "GET", body: options.body });
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

  console.log("public profile pursuits: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

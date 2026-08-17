import assert from "node:assert/strict";
import type { CandidateProfileAggregate, RoleTrack } from "../lib/public-profile/types";
import type { MatchJob } from "../lib/public-profile/matching/types";
import {
  auditScanSelection,
  calculateScanChurn,
  replayScanSelection,
  scanChurnFailure,
} from "./scan-shadow-audit";

const NOW = "2026-08-17T18:00:00.000Z";

function roleTrack(id: string, title: string): RoleTrack {
  return {
    id,
    profileId: "profile-fixture",
    name: title,
    description: "Fixture role track",
    corePositioning: "Fixture positioning",
    outreachAngle: "Fixture angle",
    targetTitles: [title],
    keyResponsibilities: [],
    requiredExperiencePatterns: [],
    strongJobSignals: [],
    weakJobSignals: [],
    mismatchSignals: [],
    resumeIds: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function profile(
  id: string,
  targetTitles: string[],
  targetIndustries: string[] = [],
): CandidateProfileAggregate {
  return {
    profile: {
      id,
      userId: `user-${id}`,
      status: "complete",
      version: 1,
      fullName: "Fixture Account",
      location: "Denver, Colorado, United States",
      remotePreference: "no_preference",
      generatedMarkdown: "",
      createdAt: NOW,
      updatedAt: NOW,
    },
    preferences: {
      id: `preferences-${id}`,
      profileId: id,
      employmentTypes: [],
      targetIndustries,
      avoidIndustries: [],
      avoidCompanies: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
    companyWatchlist: [],
    roleTracks: targetTitles.map((title, index) => roleTrack(`${id}-track-${index}`, title)),
    resumes: [],
    workExamples: [],
    skills: [],
    qualityFields: [],
    writingSamples: [],
    roleTrackOutreachRules: [],
  };
}

function jobs(prefix: string, title: string, count: number): Array<MatchJob & { id: string }> {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${String(index).padStart(3, "0")}`,
    title: `${title} ${index + 1}`,
    companyName: `${prefix} Company ${index + 1}`,
    description: "Own strategy, lead cross-functional delivery, oversee production workflows, manage stakeholders, and improve operations across the organization.",
    responsibilities: ["Own strategy", "Lead delivery", "Oversee workflows"],
    requiredExperience: ["Cross-functional stakeholder leadership"],
    location: "United States",
    remoteType: "Remote",
    postedAt: "2026-08-16T18:00:00.000Z",
    scrapedAt: "2026-08-17T17:00:00.000Z",
  }));
}

function replay(
  aggregate: CandidateProfileAggregate,
  candidates: Array<MatchJob & { id: string }>,
) {
  const selection = replayScanSelection(aggregate, candidates, NOW, 75);
  const audit = auditScanSelection(aggregate, selection.candidates, selection.selected);
  assert.deepEqual(audit.failures, [], audit.failures.join("\n"));
  return { selection, audit };
}

// Cross-account isolation: a role family configured for one account must not leak
// into another account merely because both accounts replay the same global pool.
const crossAccountPool = [
  ...jobs("producer", "Executive Producer", 12),
  ...jobs("marketing", "Director of Marketing", 12),
];
const producerReplay = replay(profile("producer", ["Executive Producer"]), crossAccountPool);
assert.ok(producerReplay.selection.selected.length > 0);
assert.ok(producerReplay.selection.selected.every((item) => item.job.title.includes("Executive Producer")));
const marketingReplay = replay(profile("marketing", ["Director of Marketing"]), crossAccountPool);
assert.ok(marketingReplay.selection.selected.length > 0);
assert.ok(marketingReplay.selection.selected.every((item) => item.job.title.includes("Director of Marketing")));

// Regression for the reported incident: Advertising Services may not turn an AI
// Enablement target into a broad marketing-management discovery lane.
const aiReplay = replay(
  profile("ai-enablement", ["AI Enablement Specialist"], ["Advertising Services"]),
  [
    ...jobs("ai", "AI Enablement Specialist", 8),
    ...jobs("marketing-leadership", "Director of Marketing", 40),
  ],
);
assert.equal(aiReplay.audit.selectedLaneCounts["marketing-management"] ?? 0, 0);
assert.equal(aiReplay.audit.selectedTargetCounts["AI Enablement Specialist"], 8);

// The selected cap cannot be monopolized by one abundant configured family when
// another configured family has a healthy eligible pool.
const mixedReplay = replay(
  profile("mixed", ["Program Manager", "Executive Producer"]),
  [
    ...jobs("aaa-program", "Program Manager", 100),
    ...jobs("zzz-producer", "Executive Producer", 30),
  ],
);
assert.equal(mixedReplay.selection.selected.length, 75);
assert.ok((mixedReplay.audit.selectedTargetCounts["Program Manager"] ?? 0) > 0);
assert.ok((mixedReplay.audit.selectedTargetCounts["Executive Producer"] ?? 0) > 0);
assert.equal(mixedReplay.audit.takeover, undefined);

// The gate itself must fail closed when a selector drops an eligible target.
const deliberatelyBroken = auditScanSelection(
  profile("broken", ["Program Manager", "Executive Producer"]),
  mixedReplay.selection.candidates,
  mixedReplay.selection.selected.filter((item) => item.job.title.includes("Program Manager")),
);
assert.ok(deliberatelyBroken.lostEligibleTargets.includes("Executive Producer"));
assert.ok(deliberatelyBroken.failures.length > 0);

const excessiveChurn = calculateScanChurn(["a", "b", "c"], ["b", "c", "d"]);
assert.deepEqual(excessiveChurn, {
  baselineCount: 3,
  selectedCount: 3,
  retainedCount: 2,
  addedCount: 1,
  removedCount: 1,
  churnShare: 1 / 3,
});
assert.match(scanChurnFailure(excessiveChurn, 0.30) ?? "", /exceeds 30\.0%/);
assert.equal(scanChurnFailure(excessiveChurn, 0.35), undefined);
assert.match(scanChurnFailure(excessiveChurn, Number.NaN) ?? "", /invalid maximum churn share/);

console.log("scan shadow gate: all assertions passed");

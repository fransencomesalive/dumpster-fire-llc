import assert from "node:assert/strict";
import type { NormalizedConnectorJob } from "../app/scans/connectors";
import { randallPrivateMatchingConfig } from "../app/scans/matching";
import { buildSourceCalibrationReviewItem, filterUnreviewedNearMissReviewItems, selectBalancedNearMissReviewItems, type NearMissReviewItem } from "../app/scans/near-miss-review";
import { filterConnectorJobsByRelevance } from "../app/scans/relevance";
import { buildTuningPreviewImpact } from "../app/scans/tuning-preview";
import { buildTuningReport, type MatchDecisionEvidence } from "../app/scans/tuning-report";
import type { Company, Job, JobMatchFeedback, NearMissReviewDecision, ScanLog } from "../app/scans/types";

const baseJob: Job = {
  id: "job-1",
  companyId: "company-1",
  externalJobId: "external-1",
  sourceProvider: "greenhouse",
  sourceUrl: "https://example.com/job",
  applyUrl: "https://example.com/apply",
  title: "Software Engineer",
  companyName: "Example",
  location: "Remote",
  remoteType: "remote",
  employmentType: "full-time",
  department: "Engineering",
  salaryText: "",
  descriptionText: "Build software systems.",
  firstSeenAt: "2026-06-01T00:00:00.000Z",
  lastSeenAt: "2026-06-01T00:00:00.000Z",
  status: "new",
  fitScore: 35,
  fitBucket: "skip",
  fitSummary: "",
  riskFlags: ["negative title signal: software engineer"],
  recommendedAction: "skip",
  whyItMatches: [],
  whyItMightBeWrong: ["negative title signal: software engineer"],
  outreachAngle: "",
  resumeTailoringNotes: [],
  notes: "",
  needsContactResearch: true,
};

const feedback: JobMatchFeedback[] = [{
  id: "feedback-1",
  jobId: "job-1",
  rating: 1,
  reason: "Engineering role, wrong lane.",
  matchVersion: "test-rules",
  createdAt: "2026-06-01T00:00:00.000Z",
}];

const decision: MatchDecisionEvidence = {
  jobId: "job-1",
  title: "Software Engineer",
  companyName: "Example",
  included: true,
  score: 35,
  bucket: "skip",
  roleFamily: "engineering",
  confidence: "low",
  positives: [],
  risks: ["negative title signal: software engineer"],
  evidence: ["title evidence: software engineer"],
  rulesVersion: "test-rules",
};

function scanLogs(count: number): ScanLog[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `scan-${index}`,
    startedAt: `2026-06-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    completedAt: `2026-06-${String(index + 1).padStart(2, "0")}T00:10:00.000Z`,
    status: "completed" as const,
    companiesScanned: 1,
    jobsFound: 1,
    newJobsAdded: 0,
    jobsUpdated: 0,
    jobsClosed: 0,
    errors: [],
  }));
}

const notReady = buildTuningReport({
  feedback,
  jobs: [baseJob],
  scanLogs: scanLogs(2),
  decisions: [decision],
  matchingRulesVersion: "test-rules",
  matchingConfigSource: "compiled_profile",
});

assert.equal(notReady.ready, false);
assert.equal(notReady.suggestions.length, 0);

const ready = buildTuningReport({
  feedback,
  jobs: [baseJob],
  scanLogs: scanLogs(10),
  decisions: [decision],
  matchingRulesVersion: "test-rules",
  matchingConfigSource: "compiled_profile",
});

assert.equal(ready.ready, true);
assert.ok(ready.suggestions.some((suggestion) => suggestion.group === "profile_scoped_exclusions"));
assert.ok(ready.suggestions.every((suggestion) => !suggestion.rationale.includes("bad role")));

const filteredProgramDecision: MatchDecisionEvidence = {
  jobId: undefined,
  title: "Program Manager, Creative Operations",
  companyName: "OpenAI",
  included: false,
  score: 37,
  bucket: "skip",
  roleFamily: "unclassified",
  confidence: "low",
  positives: ["profile evidence: creative operations", "authority evidence: stakeholder, roadmap"],
  risks: ["title family not confirmed"],
  evidence: ["title evidence: program manager"],
  rulesVersion: "test-rules",
};
const reviewDecisions: NearMissReviewDecision[] = Array.from({ length: 3 }, (_, index) => ({
  id: `review-${index}`,
  reviewKey: `review-key-${index}`,
  decision: "approve",
  reason: index === 0 ? "Creative operations program ownership looks relevant." : "",
  titleSignal: "program manager",
  companyName: "OpenAI",
  provider: "ashby",
  title: `Program Manager, Creative Operations ${index + 1}`,
  sourceUrl: `https://example.com/review-${index}`,
  reviewBucket: "authority_or_profile_evidence_without_title_family",
  rulesVersion: "test-rules",
  createdAt: "2026-06-07T00:00:00.000Z",
  updatedAt: "2026-06-07T00:00:00.000Z",
}));
const preview = buildTuningPreviewImpact({
  decisions: [decision, filteredProgramDecision],
  reviewDecisions,
  rulesVersion: "test-rules",
  generatedAt: "2026-06-07T00:00:00.000Z",
});

assert.equal(preview.impactCounts.added, 1);
assert.ok(preview.drafts.some((draft) => draft.requiresBroaderConfirmation));
assert.ok(preview.warnings.some((warning) => warning.includes("OpenAI")));
assert.ok(preview.applyBlockedReasons.some((reason) => reason.includes("company-skewed")));
assert.equal(preview.examples.added[0]?.title, "Program Manager, Creative Operations");

const noSelectionPreview = buildTuningPreviewImpact({
  decisions: [decision, filteredProgramDecision],
  reviewDecisions,
  rulesVersion: "test-rules",
  selectedDraftIds: [],
  generatedAt: "2026-06-07T00:00:00.000Z",
});

assert.equal(noSelectionPreview.drafts.length, preview.drafts.length);
assert.equal(noSelectionPreview.selectedDraftIds.length, 0);
assert.equal(noSelectionPreview.impactCounts.added, 0);

const selectedPreview = buildTuningPreviewImpact({
  decisions: [decision, filteredProgramDecision],
  reviewDecisions,
  rulesVersion: "test-rules",
  selectedDraftIds: [preview.drafts[0].id],
  generatedAt: "2026-06-07T00:00:00.000Z",
});

assert.equal(selectedPreview.selectedDraftIds.length, 1);
assert.equal(selectedPreview.impactCounts.added, 1);

function nearMiss(overrides: Partial<NearMissReviewItem>): NearMissReviewItem {
  return {
    reviewKey: overrides.reviewKey ?? `review-${overrides.companyName}-${overrides.title}`,
    externalJobId: "external",
    companyName: "OpenAI",
    provider: "ashby",
    title: "Program Manager",
    location: "Remote",
    remoteType: "remote",
    department: "Operations",
    employmentType: "full-time",
    salaryText: "",
    sourceUrl: "https://example.com",
    reviewBucket: "authority_or_profile_evidence_without_title_family",
    reviewPriority: 90,
    decision: {
      included: false,
      score: 37,
      bucket: "skip",
      matchQuality: "bad",
      recommendedAction: "skip",
      fitSummary: "Bad match: title family not confirmed.",
      positives: [],
      risks: ["title family not confirmed"],
      evidence: [],
      roleFamily: "unclassified",
      confidence: "low",
      rulesVersion: "test-rules",
    },
    reasonsToInspect: [],
    responsibilitySnippets: [],
    experienceSnippets: [],
    descriptionSnippet: "",
    risks: [],
    ...overrides,
  };
}

const repetitiveOpenAiBatch = Array.from({ length: 10 }, (_, index) => nearMiss({
  reviewKey: `openai-${index}`,
  companyName: "OpenAI",
  title: `Program Manager ${index}`,
  reviewPriority: 100 - index,
}));
const balancedBatch = selectBalancedNearMissReviewItems([
  ...repetitiveOpenAiBatch,
  nearMiss({ reviewKey: "anthropic-1", companyName: "Anthropic", title: "Producer", reviewPriority: 60 }),
  nearMiss({ reviewKey: "block-1", companyName: "Block", title: "Operations Lead", reviewPriority: 59 }),
  nearMiss({ reviewKey: "autodesk-1", companyName: "Autodesk", title: "Creative Program Manager", reviewPriority: 58 }),
], 6, {
  maxPerCompany: 2,
  maxPerSignalGroup: 4,
});

assert.ok(balancedBatch.summary.companiesRepresented >= 3);
assert.ok(balancedBatch.items.filter((item) => item.companyName === "OpenAI").length <= 2);

const unreviewedBatch = filterUnreviewedNearMissReviewItems([
  nearMiss({ reviewKey: "already-reviewed", companyName: "OpenAI", title: "Producer" }),
  nearMiss({ reviewKey: "new-review", companyName: "Block", title: "Operations Lead" }),
], [
  {
    ...reviewDecisions[0],
    reviewKey: "already-reviewed",
  },
]);
assert.deepEqual(unreviewedBatch.map((item) => item.reviewKey), ["new-review"]);

const cappedCompany: Company = {
  id: "openai",
  companyName: "OpenAI",
  websiteUrl: "https://example.com",
  status: "active",
  atsProvider: "greenhouse",
  atsBoardToken: "openai",
  careersUrl: "https://example.com",
  industryBucket: "ai",
  remoteLikelihood: 0.8,
  lastSuccessfulScan: "",
  notes: "",
};

function connectorJob(overrides: Partial<NormalizedConnectorJob>): NormalizedConnectorJob {
  return {
    companyId: "openai",
    externalJobId: "job-1",
    sourceProvider: "greenhouse",
    sourceUrl: "https://example.com/job-1",
    applyUrl: "https://example.com/job-1/apply",
    title: "Product Operations Manager",
    companyName: "OpenAI",
    location: "Remote",
    remoteType: "remote",
    employmentType: "full-time",
    department: "Operations",
    salaryText: "",
    descriptionText: "Own cross-functional operations, stakeholder workflows, roadmap delivery, and process improvements.",
    rawPayload: {},
    ...overrides,
  };
}

const cappedRelevance = filterConnectorJobsByRelevance([
  connectorJob({ externalJobId: "stretch-1", title: "Product Operations Manager" }),
  connectorJob({ externalJobId: "stretch-2", title: "Strategy & Operations Lead" }),
  connectorJob({ externalJobId: "stretch-3", title: "Producer, Global Events" }),
  connectorJob({ externalJobId: "stretch-4", title: "Customer Education Program Manager" }),
], cappedCompany, {
  targetTitles: ["director of production", "creative program manager", "design program manager"],
  positiveKeywords: ["cross-functional", "creative operations", "studio operations"],
  negativeKeywords: [],
  targetIndustries: ["tech", "ai"],
  compensationFloor: 150000,
  freelanceRateFloor: 125,
  remoteOnly: true,
  doNotApplyCompanies: [],
  approvedLoginEmail: "single approved email",
}, {
  maxStretchJobsPerCompany: 2,
  matchingConfig: {
    ...randallPrivateMatchingConfig,
    rulesVersion: "test",
    stretchTitlePatterns: [
      "product operations manager",
      "strategy & operations lead",
      "producer",
      "customer education program manager",
    ],
  },
});

assert.equal(cappedRelevance.relevantJobs.length, 2);
assert.equal(cappedRelevance.stretchCapped, 2);
assert.equal(cappedRelevance.decisions.filter((item) => item.included).length, 2);
assert.equal(cappedRelevance.decisions.filter((item) => item.risks.some((risk) => risk.includes("stretch cap"))).length, 2);

const crmCalibrationItem = buildSourceCalibrationReviewItem({
  companyName: "Block",
  provider: "greenhouse",
  job: connectorJob({
    title: "CRM Product Owner, GTM",
    descriptionText: [
      "Since we opened our doors in 2009, the world of commerce has evolved immensely, and so has Square.",
      "You Will",
      "Deeply understand our internal users and focus on increasing the efficiency of day to day operations.",
      "Build scalable third party and first party platforms and create AI-forward business automations.",
      "Partner with Sales, Account Management, Services, and Partnerships stakeholders to summarize complex processes into automation opportunities.",
      "Experience Required",
      "BS in Information Systems, Computer Science or other relevant degree.",
      "8+ years of product management or owner experience, with at least 2 years building internal tools.",
      "5+ years of enterprise experience using Salesforce or similar tools to develop business automations and solutions.",
      "Experience using agentic tools (Claude, Codex, others) to facilitate the end to end product management process.",
    ].join("\n"),
  }),
  decision: {
    included: false,
    score: 45,
    bucket: "monitor",
    matchQuality: "bad",
    recommendedAction: "monitor",
    fitSummary: "Bad match.",
    positives: ["some authority evidence: operations"],
    risks: ["title family not confirmed"],
    evidence: [],
    roleFamily: "unclassified",
    confidence: "low",
    rulesVersion: "test",
  },
});
assert.ok(crmCalibrationItem);
assert.ok(crmCalibrationItem.responsibilitySnippets.some((snippet) => snippet.includes("internal users")));
assert.ok(crmCalibrationItem.experienceSnippets.some((snippet) => snippet.includes("8+ years")));
assert.equal(crmCalibrationItem.responsibilitySnippets.some((snippet) => snippet.includes("Since we opened")), false);

console.log("Dumpster Fire tuning report tests passed.");

import type { CandidateProfileAggregate } from "../lib/public-profile/types";
import {
  classifyOccupation,
  profileLanesForAggregate,
  type OccupationLane,
} from "../lib/public-profile/matching/occupation";
import type { MatchJob } from "../lib/public-profile/matching/types";
import {
  evaluatePublicJobDecision,
  industryContextForJob,
  matchingSignalsForAggregate,
  type PublicMatchDecision,
} from "../lib/public-profile/matching/decision";
import { selectTargetAwareScanJobs } from "../lib/public-jobs/repository";

export type ShadowMatch = {
  job: MatchJob & { id: string };
  decision: PublicMatchDecision;
};

export type ScanShadowThresholds = {
  laneTakeoverShare: number;
  minimumSelectedForTakeoverCheck: number;
  minimumEligiblePerLane: number;
};

export const DEFAULT_SCAN_SHADOW_THRESHOLDS: ScanShadowThresholds = {
  laneTakeoverShare: 0.75,
  minimumSelectedForTakeoverCheck: 20,
  minimumEligiblePerLane: 5,
};

export const DEFAULT_MAX_SCAN_CHURN_SHARE = 0.35;

export type ScanShadowAudit = {
  candidateCount: number;
  eligibleCount: number;
  selectedCount: number;
  eligibleLaneCounts: Record<string, number>;
  selectedLaneCounts: Record<string, number>;
  eligibleTargetCounts: Record<string, number>;
  selectedTargetCounts: Record<string, number>;
  eligibleIndustryContextCounts: Record<string, number>;
  selectedIndustryContextCounts: Record<string, number>;
  selectedIndustryContextConflicts: string[];
  lostEligibleCoreLanes: string[];
  lostEligibleTargets: string[];
  unexplainedSelectedLanes: string[];
  takeover?: {
    lane: string;
    count: number;
    share: number;
    threshold: number;
  };
  failures: string[];
};

export type ScanShadowChurn = {
  baselineCount: number;
  selectedCount: number;
  retainedCount: number;
  addedCount: number;
  removedCount: number;
  churnShare: number;
};

export function replayScanSelection(
  profile: CandidateProfileAggregate,
  jobs: Array<MatchJob & { id: string }>,
  evaluatedAt: string,
  limit = 75,
) {
  const signals = matchingSignalsForAggregate(profile);
  const candidates: ShadowMatch[] = jobs.map((job) => ({
    job,
    decision: evaluatePublicJobDecision(job, signals, evaluatedAt),
  }));
  const eligible = candidates.filter((item) => item.decision.included);
  const selectedJobs = selectTargetAwareScanJobs(
    eligible.map(({ job, decision }) => ({
      job,
      id: job.id,
      title: job.title,
      companyName: job.companyName,
      score: decision.score,
      roleFamily: decision.roleFamily,
    })),
    signals.explicitTitleIntents,
    limit,
  );
  const matchesById = new Map(eligible.map((item) => [item.job.id, item]));
  const selected = selectedJobs.map((job) => {
    const item = matchesById.get(job.id);
    if (!item) throw new Error(`Selected scan job ${job.id} is missing its decision.`);
    return item;
  });
  return { candidates, selected };
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

function includesPhrase(value: string, phrase: string) {
  const content = normalize(value);
  const term = normalize(phrase);
  return Boolean(term) && ` ${content} `.includes(` ${term} `);
}

function increment(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function sortedRecord(counts: Map<string, number>) {
  return Object.fromEntries([...counts.entries()].sort(([first], [second]) => first.localeCompare(second)));
}

function declaredTargets(profile: CandidateProfileAggregate) {
  const seen = new Set<string>();
  return matchingSignalsForAggregate(profile).explicitTitleIntents
    .map((intent) => intent.term)
    .map((title) => title.trim())
    .filter((title) => {
      const key = normalize(title);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function occupationLane(job: MatchJob): OccupationLane {
  return classifyOccupation({
    title: job.title,
    department: job.department,
    description: [
      job.industry ?? "",
      job.description,
      ...(job.responsibilities ?? []),
      ...(job.requiredExperience ?? []),
    ].join(" "),
    companyName: job.companyName,
  }).lane;
}

function auditLane(item: ShadowMatch, targets: string[]) {
  const directTarget = targets.find((target) => includesPhrase(item.job.title, target));
  if (directTarget) {
    const targetLane = classifyOccupation({
      title: directTarget,
      description: "",
      companyName: "",
    }).lane;
    return targetLane === "unknown" ? `target:${normalize(directTarget)}` : targetLane;
  }
  if (item.decision.roleFamily !== "unclassified" && item.decision.roleFamily !== "profile-target") {
    return item.decision.roleFamily;
  }
  return occupationLane(item.job);
}

export function auditScanSelection(
  profile: CandidateProfileAggregate,
  candidates: ShadowMatch[],
  selected: ShadowMatch[],
  thresholds: ScanShadowThresholds = DEFAULT_SCAN_SHADOW_THRESHOLDS,
): ScanShadowAudit {
  const matchingSignals = matchingSignalsForAggregate(profile);
  const targets = declaredTargets(profile);
  const eligible = candidates.filter((item) => item.decision.included);
  const eligibleLaneCounts = new Map<string, number>();
  const selectedLaneCounts = new Map<string, number>();
  const eligibleTargetCounts = new Map<string, number>();
  const selectedTargetCounts = new Map<string, number>();
  const eligibleIndustryContextCounts = new Map<string, number>();
  const selectedIndustryContextCounts = new Map<string, number>();

  for (const item of eligible) {
    increment(eligibleLaneCounts, auditLane(item, targets));
    increment(eligibleIndustryContextCounts, industryContextForJob(item.job, matchingSignals).status);
    for (const target of targets) {
      if (includesPhrase(item.job.title, target)) increment(eligibleTargetCounts, target);
    }
  }
  for (const item of selected) {
    increment(selectedLaneCounts, auditLane(item, targets));
    increment(selectedIndustryContextCounts, industryContextForJob(item.job, matchingSignals).status);
    for (const target of targets) {
      if (includesPhrase(item.job.title, target)) increment(selectedTargetCounts, target);
    }
  }

  const profileLanes = profileLanesForAggregate(profile);
  const lostEligibleCoreLanes = [...profileLanes.coreLanes]
    .filter((lane) => (eligibleLaneCounts.get(lane) ?? 0) > 0 && (selectedLaneCounts.get(lane) ?? 0) === 0)
    .sort();
  const lostEligibleTargets = targets
    .filter((target) => (eligibleTargetCounts.get(target) ?? 0) > 0 && (selectedTargetCounts.get(target) ?? 0) === 0)
    .sort((first, second) => first.localeCompare(second));

  const allowedLanes = new Set<string>([
    ...profileLanes.coreLanes,
    ...profileLanes.stretchLanes,
  ]);
  const unexplainedSelectedLanes = [...new Set(selected
    .filter((item) => !targets.some((target) => includesPhrase(item.job.title, target)))
    .map((item) => auditLane(item, targets))
    .filter((lane) => lane !== "unknown" && !allowedLanes.has(lane)))]
    .sort();

  const declaredAuditLanes = new Set(matchingSignals.explicitTitleIntents.flatMap((intent) => {
    if (intent.titleLane !== "unknown") return [intent.titleLane];
    return intent.contextLanes.length > 0
      ? intent.contextLanes
      : [`target:${normalize(intent.term)}`];
  }));
  const takeoverEligibleLanes = [...eligibleLaneCounts.entries()]
    .filter(([lane]) => declaredAuditLanes.has(lane))
    .filter(([, count]) => count >= thresholds.minimumEligiblePerLane)
    .map(([lane]) => lane);
  const leadingLane = [...selectedLaneCounts.entries()]
    .sort(([firstLane, firstCount], [secondLane, secondCount]) =>
      secondCount - firstCount || firstLane.localeCompare(secondLane))[0];
  const leadingShare = leadingLane && selected.length > 0 ? leadingLane[1] / selected.length : 0;
  const takeover = selected.length >= thresholds.minimumSelectedForTakeoverCheck
    && takeoverEligibleLanes.length >= 2
    && leadingLane
    && leadingShare > thresholds.laneTakeoverShare
    ? {
        lane: leadingLane[0],
        count: leadingLane[1],
        share: leadingShare,
        threshold: thresholds.laneTakeoverShare,
      }
    : undefined;
  const selectedIndustryContextConflicts = selected
    .filter((item) => industryContextForJob(item.job, matchingSignals).status === "conflict")
    .map((item) => item.job.id)
    .sort();

  const failures = [
    ...lostEligibleCoreLanes.map((lane) => `lost eligible core lane: ${lane}`),
    ...lostEligibleTargets.map((target) => `lost eligible target: ${target}`),
    ...unexplainedSelectedLanes.map((lane) => `unexplained selected lane: ${lane}`),
    ...selectedIndustryContextConflicts.map((jobId) => `selected generic-role industry conflict: ${jobId}`),
    ...(takeover ? [
      `lane takeover: ${takeover.lane} is ${(takeover.share * 100).toFixed(1)}% of selected results (maximum ${(takeover.threshold * 100).toFixed(1)}%)`,
    ] : []),
  ];

  return {
    candidateCount: candidates.length,
    eligibleCount: eligible.length,
    selectedCount: selected.length,
    eligibleLaneCounts: sortedRecord(eligibleLaneCounts),
    selectedLaneCounts: sortedRecord(selectedLaneCounts),
    eligibleTargetCounts: sortedRecord(eligibleTargetCounts),
    selectedTargetCounts: sortedRecord(selectedTargetCounts),
    eligibleIndustryContextCounts: sortedRecord(eligibleIndustryContextCounts),
    selectedIndustryContextCounts: sortedRecord(selectedIndustryContextCounts),
    selectedIndustryContextConflicts,
    lostEligibleCoreLanes,
    lostEligibleTargets,
    unexplainedSelectedLanes,
    takeover,
    failures,
  };
}

export function calculateScanChurn(baselineJobIds: Iterable<string>, selectedJobIds: Iterable<string>): ScanShadowChurn {
  const baseline = new Set(baselineJobIds);
  const selected = new Set(selectedJobIds);
  const retainedCount = [...baseline].filter((jobId) => selected.has(jobId)).length;
  const removedCount = baseline.size - retainedCount;
  const addedCount = selected.size - retainedCount;
  return {
    baselineCount: baseline.size,
    selectedCount: selected.size,
    retainedCount,
    addedCount,
    removedCount,
    churnShare: baseline.size === 0 ? 0 : removedCount / baseline.size,
  };
}

export function scanChurnFailure(
  churn: ScanShadowChurn,
  maximumChurnShare = DEFAULT_MAX_SCAN_CHURN_SHARE,
) {
  if (!Number.isFinite(maximumChurnShare) || maximumChurnShare < 0 || maximumChurnShare > 1) {
    return `invalid maximum churn share: ${maximumChurnShare}`;
  }
  return churn.baselineCount > 0 && churn.churnShare > maximumChurnShare
    ? `baseline churn ${(churn.churnShare * 100).toFixed(1)}% exceeds ${(maximumChurnShare * 100).toFixed(1)}%`
    : undefined;
}

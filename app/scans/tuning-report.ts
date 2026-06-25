import { summarizeMatchLearning } from "./match-learning";
import type { Job, JobMatchFeedback, ScanLog } from "./types";

export type TuningDecisionGroup =
  | "profile_scoped_exclusions"
  | "title_families"
  | "positive_signals"
  | "negative_signals"
  | "thresholds";

export type TuningSuggestion = {
  id: string;
  group: TuningDecisionGroup;
  title: string;
  recommendation: string;
  rationale: string;
  evidenceCount: number;
  riskLevel: "low" | "medium" | "high";
  controls: string[];
  examples: string[];
};

export type TuningReportInput = {
  feedback: JobMatchFeedback[];
  jobs: Job[];
  scanLogs: ScanLog[];
  decisions: MatchDecisionEvidence[];
  matchingRulesVersion: string;
  matchingConfigSource: "compiled_profile" | "fallback_private";
  scansRequired?: number;
};

export type MatchDecisionEvidence = {
  jobId?: string;
  title: string;
  companyName: string;
  included: boolean;
  score: number;
  bucket: string;
  roleFamily: string;
  confidence: string;
  positives: string[];
  risks: string[];
  evidence: string[];
  rulesVersion: string;
};

export type TuningReport = {
  ready: boolean;
  scansRequired: number;
  completedScansSinceFirstFeedback: number;
  scansRemaining: number;
  feedbackCount: number;
  poorRatings: number;
  strongRatings: number;
  matchingRulesVersion: string;
  matchingConfigSource: "compiled_profile" | "fallback_private";
  decisionCount: number;
  suggestions: TuningSuggestion[];
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

function titleCaseSignal(value: string) {
  return value
    .split(/[-_\s/]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function exampleFromDecision(decision: MatchDecisionEvidence) {
  return `${decision.title} at ${decision.companyName}`;
}

function topTerms(items: string[], limit: number) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = normalize(item);
    if (!key || key.length < 3) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function examplesForDecisions(decisions: MatchDecisionEvidence[], limit = 3) {
  return decisions.slice(0, limit).map(exampleFromDecision);
}

export function buildTuningReport({
  feedback,
  jobs,
  scanLogs,
  decisions,
  matchingRulesVersion,
  matchingConfigSource,
  scansRequired = 10,
}: TuningReportInput): TuningReport {
  const learning = summarizeMatchLearning({
    feedback,
    jobs,
    scanLogs,
    scansRequired,
  });
  const feedbackByJobId = new Map(feedback.map((item) => [item.jobId, item]));
  const poorFeedbackJobIds = new Set(feedback.filter((item) => item.rating < 4).map((item) => item.jobId));
  const strongFeedbackJobIds = new Set(feedback.filter((item) => item.rating >= 4).map((item) => item.jobId));
  const poorRatedDecisions = decisions.filter((decision) => decision.jobId && poorFeedbackJobIds.has(decision.jobId));
  const strongRatedDecisions = decisions.filter((decision) => decision.jobId && strongFeedbackJobIds.has(decision.jobId));
  const suggestions: TuningSuggestion[] = [];

  if (!learning.ready) {
    return {
      ready: learning.ready,
      scansRequired,
      completedScansSinceFirstFeedback: learning.completedScansSinceFirstFeedback,
      scansRemaining: learning.scansRemaining,
      feedbackCount: feedback.length,
      poorRatings: learning.poorRatings,
      strongRatings: learning.strongRatings,
      matchingRulesVersion,
      matchingConfigSource,
      decisionCount: decisions.length,
      suggestions,
    };
  }

  for (const signal of learning.signals) {
    if (signal.recommendation !== "tighten_exclusion") continue;

    suggestions.push({
      id: `profile-exclusion-${normalize(signal.label)}`,
      group: "profile_scoped_exclusions",
      title: `Review ${titleCaseSignal(signal.label)} as profile-scoped exclusion`,
      recommendation: "Approve, reject, or edit the exclusion phrase before it can affect this profile.",
      rationale: `${signal.count} rated match${signal.count === 1 ? "" : "es"} averaged ${signal.averageRating} stars. This only means wrong for this search context.`,
      evidenceCount: signal.count,
      riskLevel: signal.count >= 3 ? "medium" : "high",
      controls: ["Approve", "Reject", "Edit phrase", "Choose scope"],
      examples: signal.examples,
    });
  }

  const poorRiskTerms = topTerms(poorRatedDecisions.flatMap((decision) => decision.risks), 4);
  for (const term of poorRiskTerms) {
    suggestions.push({
      id: `negative-signal-${term.label}`,
      group: "negative_signals",
      title: `Reduce matches carrying “${term.label}”`,
      recommendation: "Use low, medium, or high penalty strength; do not hard-exclude unless promoted later.",
      rationale: `This risk appeared in ${term.count} poorly rated decision${term.count === 1 ? "" : "s"}.`,
      evidenceCount: term.count,
      riskLevel: "medium",
      controls: ["Approve", "Reject", "Edit signal", "Low / Medium / High"],
      examples: examplesForDecisions(poorRatedDecisions.filter((decision) => decision.risks.some((risk) => normalize(risk) === term.label))),
    });
  }

  const strongPositiveTerms = topTerms(strongRatedDecisions.flatMap((decision) => decision.positives), 4);
  for (const term of strongPositiveTerms) {
    suggestions.push({
      id: `positive-signal-${term.label}`,
      group: "positive_signals",
      title: `Boost matches with “${term.label}”`,
      recommendation: "Use low, medium, or high boost strength; boosts cannot bypass the title-family gate.",
      rationale: `This positive signal appeared in ${term.count} highly rated decision${term.count === 1 ? "" : "s"}.`,
      evidenceCount: term.count,
      riskLevel: "low",
      controls: ["Approve", "Reject", "Edit signal", "Low / Medium / High"],
      examples: examplesForDecisions(strongRatedDecisions.filter((decision) => decision.positives.some((positive) => normalize(positive) === term.label))),
    });
  }

  const excludedNearMisses = decisions
    .filter((decision) => !decision.included && decision.score >= 30 && decision.roleFamily !== "unclassified")
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (excludedNearMisses.length > 0) {
    suggestions.push({
      id: "title-family-near-misses",
      group: "title_families",
      title: "Inspect excluded near-miss title families",
      recommendation: "Approve, reject, or edit any title phrase before adding it to a family.",
      rationale: `${excludedNearMisses.length} excluded role${excludedNearMisses.length === 1 ? "" : "s"} had enough score to inspect for false negatives.`,
      evidenceCount: excludedNearMisses.length,
      riskLevel: "high",
      controls: ["Approve", "Reject", "Edit title phrase", "Choose family"],
      examples: examplesForDecisions(excludedNearMisses, 5),
    });
  }

  if (learning.ready && feedback.length > 0) {
    const poorRatio = learning.poorRatings / feedback.length;
    const thresholdRecommendation = poorRatio > 0.5
      ? "Make stricter"
      : learning.strongRatings > learning.poorRatings * 2
        ? "Make more permissive"
        : "Keep current";

    suggestions.push({
      id: "threshold-preset",
      group: "thresholds",
      title: "Review bucket strictness preset",
      recommendation: thresholdRecommendation,
      rationale: `${learning.poorRatings} poor rating${learning.poorRatings === 1 ? "" : "s"} and ${learning.strongRatings} strong rating${learning.strongRatings === 1 ? "" : "s"} after the scan threshold.`,
      evidenceCount: feedback.length,
      riskLevel: "medium",
      controls: ["Make stricter", "Keep current", "Make more permissive"],
      examples: poorRatedDecisions.slice(0, 2).map((decision) => {
        const feedbackItem = decision.jobId ? feedbackByJobId.get(decision.jobId) : undefined;
        return `${exampleFromDecision(decision)}${feedbackItem?.reason ? ` — ${feedbackItem.reason}` : ""}`;
      }),
    });
  }

  return {
    ready: learning.ready,
    scansRequired,
    completedScansSinceFirstFeedback: learning.completedScansSinceFirstFeedback,
    scansRemaining: learning.scansRemaining,
    feedbackCount: feedback.length,
    poorRatings: learning.poorRatings,
    strongRatings: learning.strongRatings,
    matchingRulesVersion,
    matchingConfigSource,
    decisionCount: decisions.length,
    suggestions,
  };
}

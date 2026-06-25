import { titleSignalGroup } from "./near-miss-review";
import { analyzeNearMissReviewDecisions } from "./review-learning";
import { structureReviewDecisions } from "./review-feedback";
import type { ReviewFitVerdict, StructuredReviewDecision } from "./review-feedback";
import type { MatchDecisionEvidence } from "./tuning-report";
import type { NearMissReviewDecision } from "./types";

export type TuningPreviewDraftGroup = "title_family" | "negative_signal" | "stretch_boundary";

export type TuningPreviewDraft = {
  id: string;
  group: TuningPreviewDraftGroup;
  signal: string;
  label: string;
  verdict: ReviewFitVerdict;
  decision: "approve" | "reject" | "not_for_me";
  evidenceCount: number;
  companyCount: number;
  examples: string[];
  inheritedReason: string;
  riskLevel: "low" | "medium" | "high";
  requiresBroaderConfirmation: boolean;
};

export type TuningPreviewImpactExample = {
  title: string;
  companyName: string;
  currentBucket: string;
  previewBucket: string;
  currentIncluded: boolean;
  previewIncluded: boolean;
  reason: string;
};

export type TuningPreviewImpact = {
  rulesVersion: string;
  generatedAt: string;
  currentCounts: {
    included: number;
    filtered: number;
    buckets: Record<string, number>;
  };
  previewCounts: {
    included: number;
    filtered: number;
    buckets: Record<string, number>;
  };
  impactCounts: {
    added: number;
    removed: number;
    upgraded: number;
    downgraded: number;
    unchanged: number;
    requiresLiveReplay: number;
  };
  drafts: TuningPreviewDraft[];
  selectedDraftIds: string[];
  examples: {
    added: TuningPreviewImpactExample[];
    removed: TuningPreviewImpactExample[];
    upgraded: TuningPreviewImpactExample[];
    downgraded: TuningPreviewImpactExample[];
    requiresLiveReplay: TuningPreviewImpactExample[];
  };
  warnings: string[];
  applyBlockedReasons: string[];
};

type PreviewOutcome = {
  included: boolean;
  score: number;
  bucket: string;
  reason: string;
};

type TuningPreviewInput = {
  decisions: MatchDecisionEvidence[];
  reviewDecisions: NearMissReviewDecision[];
  rulesVersion: string;
  generatedAt?: string;
  selectedDraftIds?: string[];
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

function stableId(value: string) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "draft";
}

function bucketFromScore(score: number, included: boolean) {
  if (!included) return score >= 38 ? "monitor" : "skip";
  if (score >= 82) return "A";
  if (score >= 68) return "B";
  if (score >= 50) return "C";
  if (score >= 38) return "monitor";
  return "skip";
}

function visible(bucket: string) {
  return bucket === "A" || bucket === "B" || bucket === "C";
}

function bucketRank(bucket: string) {
  if (bucket === "A") return 5;
  if (bucket === "B") return 4;
  if (bucket === "C") return 3;
  if (bucket === "monitor") return 2;
  return 1;
}

function blocksTitleFamilyAdmission(decision: MatchDecisionEvidence) {
  const risks = decision.risks.join(" ").toLowerCase();
  return (
    risks.includes("hard exclude") ||
    risks.includes("do-not-apply") ||
    risks.includes("onsite location") ||
    risks.includes("junior/seniority")
  );
}

function matchesSignal(decision: MatchDecisionEvidence, signal: string) {
  const normalizedSignal = normalize(signal);
  if (!normalizedSignal) return false;

  return normalize([
    decision.title,
    decision.roleFamily,
    ...decision.positives,
    ...decision.risks,
    ...decision.evidence,
  ].join(" ")).includes(normalizedSignal);
}

function countsFor(decisions: Array<{ included: boolean; bucket: string }>) {
  const buckets: Record<string, number> = {};

  for (const decision of decisions) {
    buckets[decision.bucket] = (buckets[decision.bucket] ?? 0) + 1;
  }

  return {
    included: decisions.filter((decision) => decision.included).length,
    filtered: decisions.filter((decision) => !decision.included).length,
    buckets,
  };
}

function uniqueExamples(values: string[], limit: number) {
  const seen = new Set<string>();
  const examples: string[] = [];

  for (const value of values) {
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    examples.push(value);
    if (examples.length >= limit) break;
  }

  return examples;
}

function topSignal(items: Array<Pick<NearMissReviewDecision, "titleSignal" | "title">>) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const signal = normalize(item.titleSignal || item.title);
    if (!signal) continue;
    counts.set(signal, (counts.get(signal) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
}

function draftGroupForVerdict(verdict: ReviewFitVerdict): TuningPreviewDraftGroup {
  if (verdict === "match" || verdict === "good") return "title_family";
  if (verdict === "stretch") return "stretch_boundary";
  return "negative_signal";
}

function isEligibilityOnlyGroup(routes: string[]) {
  return routes.length > 0 && routes.every((route) => route === "eligibility");
}

function reviewDrafts(reviewDecisions: NearMissReviewDecision[]): TuningPreviewDraft[] {
  const analysis = analyzeNearMissReviewDecisions(reviewDecisions);
  const structured = structureReviewDecisions(reviewDecisions).filter((decision) => !decision.sourceQaOnly);
  const decisionsByGroup = new Map<string, StructuredReviewDecision[]>();

  for (const decision of structured) {
    const label = titleSignalGroup(decision.titleSignal || decision.title);
    const key = `${decision.verdict}:${normalize(label)}`;
    decisionsByGroup.set(key, [...(decisionsByGroup.get(key) ?? []), decision]);
  }

  return analysis.groups
    .filter((group) => !(group.verdict === "not_a_match" && isEligibilityOnlyGroup(group.routes)))
    .map((group) => {
      const sourceDecisions = decisionsByGroup.get(group.id) ?? [];
      const draftGroup = draftGroupForVerdict(group.verdict);
      const companyCount = group.companies.length;
      const requiresBroaderConfirmation = draftGroup === "title_family" && (
        Boolean(analysis.companySkew) ||
        companyCount < 2
      );
      const signal = topSignal(sourceDecisions) || group.label;

      return {
        id: `${group.verdict}-${stableId(signal)}`,
        group: draftGroup,
        signal,
        label: group.label,
        verdict: group.verdict,
        decision: group.decision,
        evidenceCount: group.count,
        companyCount,
        examples: group.examples,
        inheritedReason: group.inheritedReason,
        riskLevel: draftGroup === "stretch_boundary"
          ? "medium" as const
          : requiresBroaderConfirmation ? "high" as const : group.count >= 3 ? "medium" as const : "low" as const,
        requiresBroaderConfirmation,
      };
    });
}

function previewDecision(decision: MatchDecisionEvidence, drafts: TuningPreviewDraft[]): PreviewOutcome {
  let score = decision.score;
  let included = decision.included;
  const reasons: string[] = [];

  for (const draft of drafts) {
    if (draft.group === "stretch_boundary") continue;
    if (!matchesSignal(decision, draft.signal)) continue;

    if (draft.group === "title_family") {
      score += 18;
      if (!included && !blocksTitleFamilyAdmission(decision)) {
        included = true;
      }
      reasons.push(`approved title-family signal: ${draft.signal}`);
    } else {
      score -= 18;
      if (included && score < 50) {
        included = false;
      }
      reasons.push(`not-a-match signal: ${draft.signal}`);
    }
  }

  const clampedScore = Math.max(0, Math.min(100, score));
  return {
    included,
    score: clampedScore,
    bucket: bucketFromScore(clampedScore, included),
    reason: reasons.join("; ") || "No draft signal matched this decision.",
  };
}

function exampleFor(decision: MatchDecisionEvidence, outcome: PreviewOutcome): TuningPreviewImpactExample {
  return {
    title: decision.title,
    companyName: decision.companyName,
    currentBucket: decision.bucket,
    previewBucket: outcome.bucket,
    currentIncluded: decision.included,
    previewIncluded: outcome.included,
    reason: outcome.reason,
  };
}

export function buildTuningPreviewImpact({
  decisions,
  reviewDecisions,
  rulesVersion,
  generatedAt = new Date().toISOString(),
  selectedDraftIds,
}: TuningPreviewInput): TuningPreviewImpact {
  const drafts = reviewDrafts(reviewDecisions);
  const selectedDraftIdSet = selectedDraftIds ? new Set(selectedDraftIds) : new Set(drafts.map((draft) => draft.id));
  const selectedDrafts = drafts.filter((draft) => selectedDraftIdSet.has(draft.id));
  const outcomes = decisions.map((decision) => ({
    decision,
    outcome: previewDecision(decision, selectedDrafts),
  }));
  const impactCounts = {
    added: 0,
    removed: 0,
    upgraded: 0,
    downgraded: 0,
    unchanged: 0,
    requiresLiveReplay: 0,
  };
  const examples: TuningPreviewImpact["examples"] = {
    added: [],
    removed: [],
    upgraded: [],
    downgraded: [],
    requiresLiveReplay: [],
  };
  const evidenceKeys = new Set(decisions.map((decision) => `${normalize(decision.title)}|${normalize(decision.companyName)}`));

  for (const { decision, outcome } of outcomes) {
    const currentVisible = decision.included && visible(decision.bucket);
    const previewVisible = outcome.included && visible(outcome.bucket);

    if (!currentVisible && previewVisible) {
      impactCounts.added += 1;
      if (examples.added.length < 5) examples.added.push(exampleFor(decision, outcome));
    } else if (currentVisible && !previewVisible) {
      impactCounts.removed += 1;
      if (examples.removed.length < 5) examples.removed.push(exampleFor(decision, outcome));
    } else if (previewVisible && bucketRank(outcome.bucket) > bucketRank(decision.bucket)) {
      impactCounts.upgraded += 1;
      if (examples.upgraded.length < 5) examples.upgraded.push(exampleFor(decision, outcome));
    } else if (currentVisible && bucketRank(outcome.bucket) < bucketRank(decision.bucket)) {
      impactCounts.downgraded += 1;
      if (examples.downgraded.length < 5) examples.downgraded.push(exampleFor(decision, outcome));
    } else {
      impactCounts.unchanged += 1;
    }
  }

  for (const draft of selectedDrafts.filter((item) => item.group === "title_family")) {
    for (const example of draft.examples) {
      const [title, companyName = ""] = example.split(" at ");
      const key = `${normalize(title)}|${normalize(companyName)}`;
      if (evidenceKeys.has(key)) continue;

      impactCounts.requiresLiveReplay += 1;
      if (examples.requiresLiveReplay.length < 5) {
        examples.requiresLiveReplay.push({
          title,
          companyName,
          currentBucket: "filtered",
          previewBucket: "unknown",
          currentIncluded: false,
          previewIncluded: false,
          reason: `Saved manual review approved “${draft.signal}”, but this role needs a live source replay before bucket impact is known.`,
        });
      }
    }
  }

  const analysis = analyzeNearMissReviewDecisions(reviewDecisions);
  const warnings = [
    analysis.companySkew?.warning
      ? `${analysis.companySkew.companyName} accounts for ${analysis.companySkew.share}% of saved manual reviews. ${analysis.companySkew.warning}`
      : "",
    selectedDrafts.some((draft) => draft.requiresBroaderConfirmation)
      ? "At least one approved title-family draft needs broader company confirmation before it should become a broad matcher rule."
      : "",
    analysis.sourceQaOnlyCount > 0
      ? `${analysis.sourceQaOnlyCount} saved decision${analysis.sourceQaOnlyCount === 1 ? "" : "s"} cite only scrape/source issues; they feed source QA and were excluded from matcher drafts.`
      : "",
    selectedDrafts.some((draft) => draft.group === "stretch_boundary")
      ? "Stretch verdicts are boundary evidence only. They do not generate recall or penalty changes; use them to calibrate the good/stretch line."
      : "",
    "This is preview-only. It does not write a matcher config, mutate historical decisions, or change live scan behavior.",
  ].filter(Boolean);
  const applyBlockedReasons = [
    "Matcher apply/rollback storage is not enabled in V1.",
    selectedDrafts.some((draft) => draft.requiresBroaderConfirmation)
      ? "Approved recall drafts include company-skewed or single-company evidence."
      : "",
  ].filter(Boolean);

  return {
    rulesVersion,
    generatedAt,
    currentCounts: countsFor(decisions),
    previewCounts: countsFor(outcomes.map(({ outcome }) => outcome)),
    impactCounts,
    drafts,
    selectedDraftIds: selectedDrafts.map((draft) => draft.id),
    examples,
    warnings,
    applyBlockedReasons,
  };
}

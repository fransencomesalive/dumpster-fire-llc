import { titleSignalGroup } from "./near-miss-review";
import {
  labelForReviewRationale,
  legacyDecisionForReviewVerdict,
  structureReviewDecisions,
} from "./review-feedback";
import type {
  ReviewFitVerdict,
  ReviewRationaleChipValue,
  ReviewSignalRoute,
  StructuredReviewDecision,
} from "./review-feedback";
import type { NearMissReviewDecision, NearMissReviewDecisionValue } from "./types";

export type NearMissReviewDecisionGroup = {
  id: string;
  label: string;
  verdict: ReviewFitVerdict;
  decision: NearMissReviewDecisionValue;
  count: number;
  blankReasonCount: number;
  companies: Array<{ companyName: string; count: number }>;
  rationaleChips: Array<{ chip: ReviewRationaleChipValue; label: string; count: number }>;
  routes: ReviewSignalRoute[];
  explicitReasons: string[];
  inheritedReason: string;
  examples: string[];
};

export type NearMissReviewAnalysis = {
  totalDecisions: number;
  decisionCounts: Record<NearMissReviewDecisionValue, number>;
  verdictCounts: Record<ReviewFitVerdict, number>;
  chipCounts: Array<{ chip: ReviewRationaleChipValue; label: string; count: number }>;
  sourceQaOnlyCount: number;
  blankReasonCount: number;
  companySkew?: {
    companyName: string;
    count: number;
    share: number;
    warning: string;
  };
  groups: NearMissReviewDecisionGroup[];
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function uniqueValues(items: string[], limit: number) {
  const values: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const cleaned = item.replace(/\s+/g, " ").trim();
    const key = normalize(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    values.push(cleaned);
    if (values.length >= limit) break;
  }

  return values;
}

function chipCountsFor(items: StructuredReviewDecision[]) {
  const counts = new Map<ReviewRationaleChipValue, number>();

  for (const item of items) {
    for (const chip of item.rationale) {
      counts.set(chip, (counts.get(chip) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([chip, count]) => ({ chip, label: labelForReviewRationale(chip), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

const inheritedReasonByVerdict: Record<ReviewFitVerdict, string> = {
  match: "Inherited from repeated similar match-verdict decisions without a new written reason.",
  good: "Inherited from repeated similar good-verdict decisions without a new written reason.",
  stretch: "Inherited from repeated similar stretch-verdict decisions without a new written reason.",
  not_a_match: "Inherited from repeated similar not-a-match decisions without a new written reason.",
};

export function analyzeNearMissReviewDecisions(decisions: NearMissReviewDecision[]): NearMissReviewAnalysis {
  const structured = structureReviewDecisions(decisions);
  const decisionCounts = {
    approve: decisions.filter((decision) => decision.decision === "approve").length,
    reject: decisions.filter((decision) => decision.decision === "reject").length,
    not_for_me: decisions.filter((decision) => decision.decision === "not_for_me").length,
  };
  const verdictCounts = {
    match: structured.filter((decision) => decision.verdict === "match").length,
    good: structured.filter((decision) => decision.verdict === "good").length,
    stretch: structured.filter((decision) => decision.verdict === "stretch").length,
    not_a_match: structured.filter((decision) => decision.verdict === "not_a_match").length,
  };
  const sourceQaOnly = structured.filter((decision) => decision.sourceQaOnly);
  const fitDecisions = structured.filter((decision) => !decision.sourceQaOnly);
  const blankReasonCount = decisions.filter((decision) => !decision.reason.trim()).length;
  const companyCounts = countBy(decisions, (decision) => decision.companyName);
  const dominantCompany = companyCounts[0];
  const companySkew = dominantCompany && decisions.length > 0 && dominantCompany[1] / decisions.length >= 0.65
    ? {
        companyName: dominantCompany[0],
        count: dominantCompany[1],
        share: Math.round((dominantCompany[1] / decisions.length) * 100),
        warning: "This review slice is company-heavy. Treat repeated title decisions as directional until more companies confirm them.",
      }
    : undefined;
  const grouped = new Map<string, StructuredReviewDecision[]>();

  for (const decision of fitDecisions) {
    const label = titleSignalGroup(decision.titleSignal || decision.title);
    const key = `${decision.verdict}:${normalize(label)}`;
    grouped.set(key, [...(grouped.get(key) ?? []), decision]);
  }

  const groups = [...grouped.entries()]
    .map(([id, items]) => {
      const first = items[0];
      const explicitReasons = uniqueValues(items.map((item) => item.note).filter(Boolean), 3);
      const examples = uniqueValues(items.map((item) => `${item.title} at ${item.companyName}`), 4);
      const inheritedReason = explicitReasons[0] ?? inheritedReasonByVerdict[first.verdict];

      return {
        id,
        label: titleSignalGroup(first.titleSignal || first.title),
        verdict: first.verdict,
        decision: legacyDecisionForReviewVerdict(first.verdict),
        count: items.length,
        blankReasonCount: items.filter((item) => !item.note.trim()).length,
        companies: countBy(items, (item) => item.companyName).map(([companyName, count]) => ({ companyName, count })),
        rationaleChips: chipCountsFor(items),
        routes: Array.from(new Set(items.flatMap((item) => item.routes))),
        explicitReasons,
        inheritedReason,
        examples,
      };
    })
    .sort((a, b) => b.count - a.count || b.blankReasonCount - a.blankReasonCount || a.label.localeCompare(b.label));

  return {
    totalDecisions: decisions.length,
    decisionCounts,
    verdictCounts,
    chipCounts: chipCountsFor(structured),
    sourceQaOnlyCount: sourceQaOnly.length,
    blankReasonCount,
    companySkew,
    groups,
  };
}

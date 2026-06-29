import { recommendMatchAssets } from "./recommend";
import { CATEGORY_WEIGHTS, scoreAllCategories } from "./scorers";
import type {
  CategoryFit,
  MatchInput,
  MatchLabel,
  MatchResult,
} from "./types";

function labelForScore(score: number): MatchLabel {
  if (score >= 80) return "Strong Match";
  if (score >= 60) return "Potential Match";
  if (score >= 40) return "Weak Match";
  return "Probably Not Worth Your Time";
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(trimmed);
  }
  return output;
}

function weightedScore(categoryFits: CategoryFit[]) {
  const totalWeight = categoryFits.reduce((sum, fit) => sum + CATEGORY_WEIGHTS[fit.category], 0);
  const weighted = categoryFits.reduce((sum, fit) => sum + (fit.score * CATEGORY_WEIGHTS[fit.category]), 0);
  return Math.round((weighted / totalWeight) * 100);
}

function strongestReasons(categoryFits: CategoryFit[]) {
  return unique(
    categoryFits
      .filter((fit) => fit.score >= 0.7)
      .flatMap((fit) => fit.reasons)
      .slice(0, 6),
  );
}

function weakestReasons(categoryFits: CategoryFit[]) {
  return unique(
    categoryFits
      .filter((fit) => fit.score < 0.55)
      .flatMap((fit) => [...fit.risks, ...fit.softExclusions])
      .slice(0, 6),
  );
}

function risksForMatch(categoryFits: CategoryFit[], label: MatchLabel) {
  const categoryRisks = unique(categoryFits.flatMap((fit) => fit.risks)).slice(0, 6);
  if (categoryRisks.length > 0) return categoryRisks;

  if (label === "Strong Match") {
    return ["Strong on paper. Still worth checking the day-to-day before spending serious time."];
  }
  if (label === "Potential Match") {
    return ["There is enough overlap to inspect, but the fit is not automatic."];
  }
  return ["The visible signals are thin. This may not be where the time pays back."];
}

function buildExplanation(label: MatchLabel, whyMatched: string[], whyNotMatched: string[]) {
  if (label === "Strong Match") {
    return whyNotMatched.length > 0
      ? `Strong match with a few things to check: ${whyNotMatched.slice(0, 2).join(" ")}`
      : "Strong match. The role lines up with the profile and has enough support to pursue.";
  }

  if (label === "Potential Match") {
    const matched = whyMatched[0] ?? "There is visible overlap.";
    const risk = whyNotMatched[0] ?? "A few details still need review.";
    return `Potential match. ${matched} ${risk}`;
  }

  if (label === "Weak Match") {
    const risk = whyNotMatched[0] ?? "The profile overlap is limited.";
    return `Weak match. ${risk}`;
  }

  const risk = whyNotMatched[0] ?? "The match signals are not strong enough.";
  return `Probably not worth your time. ${risk}`;
}

export function evaluateMatch(input: MatchInput): MatchResult {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const categoryFits = scoreAllCategories({
    profile: input.profile,
    job: input.job,
    evaluatedAt,
    remoteExceptions: input.remoteExceptions,
  });
  const internalScore = weightedScore(categoryFits);
  const label = labelForScore(internalScore);
  const recommendations = recommendMatchAssets(input.profile, input.job);
  const whyMatched = strongestReasons(categoryFits);
  const whyNotMatched = weakestReasons(categoryFits);
  const softExclusions = unique(categoryFits.flatMap((fit) => fit.softExclusions));
  const risks = risksForMatch(categoryFits, label);

  return {
    internalScore,
    label,
    categoryFits,
    recommendations,
    risks,
    whyMatched,
    whyNotMatched,
    softExclusions,
    explanation: buildExplanation(label, whyMatched, whyNotMatched),
  };
}

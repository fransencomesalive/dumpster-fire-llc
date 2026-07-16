import {
  evaluatePublicJobDecision,
  matchingSignalsForAggregate,
  type PublicMatchDecision,
} from "./decision";
import { recommendMatchAssets } from "./recommend";
import { scoreAllCategories } from "./scorers";
import type {
  CategoryFit,
  MatchInput,
  MatchLabel,
  MatchResult,
} from "./types";

// Internal hard-risk markers become user-readable sentences on the way out.
function readableRisk(risk: string) {
  if (risk.startsWith("hard exclude: ")) return capitalize(risk.slice("hard exclude: ".length));
  if (risk.startsWith("hard remote constraint: ")) return capitalize(risk.slice("hard remote constraint: ".length));
  if (risk.startsWith("hard compensation constraint: ")) return capitalize(risk.slice("hard compensation constraint: ".length));
  return risk;
}

function capitalize(value: string) {
  const trimmed = value.trim();
  const sentence = trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
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

function risksForMatch(decision: PublicMatchDecision, label: MatchLabel) {
  const decisionRisks = unique(decision.risks.map(readableRisk)).slice(0, 6);
  if (decisionRisks.length > 0) return decisionRisks;

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

// Score and label come from the evidence-gated decision engine (ported from the
// refined private matcher); the per-category fits remain as supporting narrative
// and signal chips for existing consumers.
export function evaluateMatch(input: MatchInput): MatchResult {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const signals = matchingSignalsForAggregate(input.profile);
  const decision = evaluatePublicJobDecision(input.job, signals, evaluatedAt);
  const categoryFits: CategoryFit[] = scoreAllCategories({
    profile: input.profile,
    job: input.job,
    evaluatedAt,
    remoteExceptions: input.remoteExceptions,
  });
  const recommendations = recommendMatchAssets(input.profile, input.job);
  const whyMatched = unique(decision.positives).slice(0, 6);
  const whyNotMatched = unique(decision.risks.map(readableRisk)).slice(0, 6);
  const softExclusions = unique(
    decision.risks
      .filter((risk) => risk.startsWith("hard "))
      .map(readableRisk),
  );

  return {
    internalScore: decision.score,
    label: decision.label,
    categoryFits,
    recommendations,
    risks: risksForMatch(decision, decision.label),
    whyMatched,
    whyNotMatched,
    softExclusions,
    explanation: buildExplanation(decision.label, whyMatched, whyNotMatched),
  };
}

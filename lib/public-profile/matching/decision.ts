// Evidence-gated match decision, ported from the refined private engine
// (app/scans/matching.ts `evaluateJobMatch`, rules lineage
// "randall-private-2026-06-12-offshore-hubs"). The legacy engine's hand-tuned
// config is derived here from the user's Candidate Profile instead:
//   - title families   <- Role Track names + target titles (+ occupation lanes)
//   - positive/negative keywords <- track signals, skills, Fit Signals
//   - wrong-lane block  <- occupation classifier vs the user's derived lanes
// Fit Signals stay soft score contributors (matching is a spectrum); the only
// hard risks are the ported ones: avoid-list companies, confidently wrong-lane
// occupations, remote/compensation hard constraints.
import type { CandidateProfileAggregate } from "../types";
import {
  classifyOccupation,
  isWrongLaneForProfile,
  lanePolarityForProfile,
  profileLanesForAggregate,
  type ProfileLanes,
} from "./occupation";
import { parseSalaryAmounts } from "./scorers";
import type { MatchJob, MatchLabel } from "./types";

export type PublicMatchDecision = {
  included: boolean;
  score: number;
  label: MatchLabel;
  confidence: "high" | "medium" | "low";
  roleFamily: string;
  positives: string[];
  risks: string[];
  evidence: string[];
};

// Ported verbatim from the legacy config; these are generic seniority/ownership
// signals, not user-specific tuning.
const AUTHORITY_SIGNALS = [
  "own",
  "lead",
  "oversee",
  "strategy",
  "roadmap",
  "cross-functional",
  "stakeholder",
  "delivery",
  "workflow",
  "operations",
  "production",
  "studio",
  "program",
  "budget",
  "vendor",
  "process",
];

const JUNIOR_SIGNALS = ["intern", "junior", "entry level"];

const HOURS_PER_YEAR = 2080;

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

// Whole-token phrase matching. The legacy engine used raw substring includes,
// which let short terms ("ai") match inside words ("maintain") — the root of the
// 2026-07-16 garbage-results bug. Every term match goes through here now.
function includesTerm(content: string, term: string) {
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return false;
  return ` ${content} `.includes(` ${normalizedTerm} `);
}

function matchingTerms(content: string, terms: string[]) {
  const matched = new Set<string>();
  for (const term of terms) {
    if (includesTerm(content, term)) matched.add(term.trim());
  }
  return [...matched];
}

export type ProfileMatchingSignals = {
  lanes: ProfileLanes;
  titleTerms: string[];
  positiveKeywords: string[];
  negativeKeywords: string[];
  targetIndustries: string[];
  avoidIndustries: string[];
  avoidCompanies: string[];
  watchlistCompanies: string[];
  employmentTypes: string[];
  remotePreference: string;
  compensationFloor?: number;
};

function unique(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalize(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(trimmed);
  }
  return output;
}

export function matchingSignalsForAggregate(aggregate: CandidateProfileAggregate): ProfileMatchingSignals {
  const hourlyFloor = aggregate.profile.targetCompensationHourlyMin;
  return {
    lanes: profileLanesForAggregate(aggregate),
    titleTerms: unique(aggregate.roleTracks.flatMap((track) => [track.name, ...track.targetTitles])),
    positiveKeywords: unique([
      ...aggregate.roleTracks.flatMap((track) => [
        ...track.keyResponsibilities,
        ...track.requiredExperiencePatterns,
        ...track.strongJobSignals,
      ]),
      ...aggregate.skills.map((skill) => skill.skillName),
      ...(aggregate.fitSignals?.goodSignals ?? []),
    ]),
    negativeKeywords: unique([
      ...aggregate.roleTracks.flatMap((track) => [...track.weakJobSignals, ...track.mismatchSignals]),
      ...(aggregate.fitSignals?.poorFitSignals ?? []),
    ]),
    targetIndustries: aggregate.preferences?.targetIndustries ?? [],
    avoidIndustries: aggregate.preferences?.avoidIndustries ?? [],
    avoidCompanies: aggregate.preferences?.avoidCompanies ?? [],
    watchlistCompanies: aggregate.companyWatchlist.map((item) => item.companyName),
    employmentTypes: aggregate.preferences?.employmentTypes ?? [],
    remotePreference: aggregate.profile.remotePreference ?? "",
    compensationFloor: aggregate.profile.targetCompensationMin
      ?? (hourlyFloor ? Math.round(hourlyFloor * HOURS_PER_YEAR) : undefined),
  };
}

export function labelForDecisionScore(score: number): MatchLabel {
  if (score >= 80) return "Strong Match";
  if (score >= 60) return "Potential Match";
  if (score >= 40) return "Weak Match";
  return "Probably Not Worth Your Time";
}

export function evaluatePublicJobDecision(
  job: MatchJob,
  signals: ProfileMatchingSignals,
  evaluatedAt: string,
): PublicMatchDecision {
  const title = normalize(job.title);
  const content = normalize([
    job.title,
    job.department ?? "",
    job.description,
    job.companyName,
    job.location ?? "",
  ].join(" "));
  const company = normalize(job.companyName);
  const positives: string[] = [];
  const risks: string[] = [];
  const evidence: string[] = [];
  let score = 20;

  if (signals.avoidCompanies.some((name) => includesTerm(company, name))) {
    risks.push("hard exclude: company is on your avoid list");
  }

  // Title family: direct target-title match is strong and immune to the lane
  // block; a core/stretch-lane title classification covers adjacent phrasing.
  const titleTermMatches = matchingTerms(title, signals.titleTerms);
  const classification = classifyOccupation({
    title: job.title,
    department: job.department,
    description: job.description,
    companyName: job.companyName,
  });
  const lanePolarity = lanePolarityForProfile(classification.lane, signals.lanes);
  const laneTitleEvidence = classification.source === "title" || classification.source === "title_and_tasks";

  let roleFamily = "unclassified";
  let titleStrength: "strong" | "stretch" | "none" = "none";
  if (titleTermMatches.length > 0) {
    titleStrength = "strong";
    roleFamily = "profile-target";
    score += 34;
    positives.push(`Title matches your target: ${titleTermMatches.slice(0, 2).join(", ")}.`);
    evidence.push(`title evidence: ${titleTermMatches.slice(0, 2).join(", ")}`);
  } else if (lanePolarity === "core" && laneTitleEvidence) {
    titleStrength = "strong";
    roleFamily = classification.lane;
    score += 34;
    positives.push(`Role family lines up with your track (${classification.lane}).`);
    evidence.push(...classification.evidence.slice(0, 2));
  } else if (lanePolarity === "stretch" && laneTitleEvidence) {
    titleStrength = "stretch";
    roleFamily = classification.lane;
    score += 24;
    positives.push(`Adjacent role family: ${classification.lane}.`);
    evidence.push(...classification.evidence.slice(0, 2));
    risks.push("Stretch title: adjacent to your tracks, not a direct target.");
  } else {
    risks.push("The title does not match your Role Tracks.");
  }

  // Occupation safety block, ported from the legacy relevance filter: jobs that
  // confidently classify into a lane the profile does not touch are excluded.
  // A direct target-title match only overrides a task-based classification; when
  // the wrong lane is confirmed by the TITLE itself, the more specific lane
  // pattern wins (legacy semantics: "technical program manager" outranks a
  // generic "program manager" target).
  if (
    isWrongLaneForProfile(classification, signals.lanes) &&
    (titleTermMatches.length === 0 || laneTitleEvidence)
  ) {
    risks.push(`hard exclude: role is in a different lane (${classification.lane.replace(/-/g, " ")})`);
  }

  const positiveMatches = matchingTerms(content, signals.positiveKeywords);
  if (positiveMatches.length > 0) {
    score += Math.min(16, positiveMatches.length * 4);
    positives.push(`Profile evidence: ${positiveMatches.slice(0, 3).join(", ")}.`);
  }

  const authorityMatches = matchingTerms(content, AUTHORITY_SIGNALS);
  if (authorityMatches.length >= 3) {
    score += 12;
    positives.push(`Ownership signals in the posting: ${authorityMatches.slice(0, 4).join(", ")}.`);
  } else if (authorityMatches.length > 0) {
    score += 5;
  } else {
    risks.push("No responsibility or ownership evidence in the posting.");
  }

  const industryMatches = matchingTerms(content, signals.targetIndustries);
  if (industryMatches.length > 0) {
    score += Math.min(6, industryMatches.length * 2);
    positives.push(`Target industry overlap: ${industryMatches.slice(0, 2).join(", ")}.`);
  }

  const avoidIndustryMatches = matchingTerms(content, signals.avoidIndustries);
  if (avoidIndustryMatches.length > 0) {
    score -= 18;
    risks.push(`Avoid-industry signal: ${avoidIndustryMatches.slice(0, 2).join(", ")}.`);
  }

  const negativeMatches = matchingTerms(content, signals.negativeKeywords);
  if (negativeMatches.length > 0) {
    score -= 18;
    risks.push(`Poor-fit signal: ${negativeMatches.slice(0, 2).join(", ")}.`);
  }

  if (matchingTerms(title, JUNIOR_SIGNALS).length > 0) {
    score -= 22;
    risks.push("Seniority mismatch: the title reads junior.");
  }

  if (signals.watchlistCompanies.some((name) => normalize(name) === company)) {
    score += 6;
    positives.push("Company is on your watchlist.");
  }

  // Remote/location, keyed to the profile preference (legacy engine assumed
  // remote-only; the public profile carries the preference explicitly).
  const remoteType = normalize(job.remoteType ?? "");
  const remoteOnly = signals.remotePreference === "remote_only";
  if (remoteType.includes("remote")) {
    score += 10;
    positives.push("Remote role.");
  } else if (remoteType.includes("onsite")) {
    if (remoteOnly) {
      score -= 28;
      risks.push("hard remote constraint: onsite posting");
    } else if (signals.remotePreference === "remote_preferred") {
      score -= 12;
      risks.push("Onsite is a poor fit for your remote preference.");
    }
  } else if (remoteType.includes("hybrid")) {
    if (remoteOnly) {
      score -= 16;
      risks.push("Hybrid posting conflicts with remote-only preference.");
    } else if (signals.remotePreference === "remote_preferred") {
      score -= 4;
    }
  } else if (remoteOnly) {
    risks.push("Remote status unclear.");
    evidence.push("remote status not listed");
  }

  // Compensation vs the profile floor (amounts arrive yearly-normalized).
  const parsed = parseSalaryAmounts(job.compensationText ?? "");
  const jobMin = job.compensationMin ?? parsed.min;
  const jobMax = job.compensationMax ?? parsed.max;
  const floor = signals.compensationFloor;
  if (floor && (jobMax ?? jobMin)) {
    if ((jobMax ?? jobMin ?? 0) < floor) {
      score -= 24;
      risks.push("hard compensation constraint: posted maximum below your floor");
    } else {
      score += 8;
      positives.push("Posted compensation clears your floor.");
    }
  } else if (floor && job.compensationText) {
    score -= 5;
    risks.push("Compensation may be low; the posting does not state a usable range.");
  } else if (floor) {
    evidence.push("compensation not listed");
  }

  if (signals.employmentTypes.length > 0) {
    const jobType = normalize(job.employmentType ?? "");
    if (jobType && !signals.employmentTypes.some((type) => jobType.includes(normalize(type)))) {
      score -= 8;
      risks.push(`Employment type (${job.employmentType}) differs from your selected types.`);
    }
  }

  const postedAt = Date.parse(job.postedAt ?? job.scrapedAt ?? "");
  const evaluated = Date.parse(evaluatedAt);
  if (Number.isFinite(postedAt) && Number.isFinite(evaluated)) {
    const ageDays = Math.floor((evaluated - postedAt) / 86_400_000);
    if (ageDays > 14 && score < 82) {
      score -= 6;
      risks.push("Posting is older than two weeks.");
    }
  }

  const contentTooThinToJudge = normalize(job.description).length < 80;
  if (contentTooThinToJudge && titleStrength === "strong") {
    risks.push("Posting content is thin; judged mostly on the title.");
  }

  // Evidence gate (ported): inclusion needs a confirmed role family, some
  // supporting evidence, and no hard risks. Excluded jobs are score-capped so
  // they can never outrank included ones.
  const hasConfirmedRoleFamily = titleStrength !== "none";
  const hasSupportingEvidence =
    authorityMatches.length >= 2 ||
    positiveMatches.length >= 2 ||
    (contentTooThinToJudge && titleStrength === "strong");
  const hasHardRisk = risks.some((risk) => risk.startsWith("hard "));
  const included = hasConfirmedRoleFamily && hasSupportingEvidence && !hasHardRisk;

  const clampedScore = included
    ? Math.max(0, Math.min(100, score))
    : Math.min(37, Math.max(0, score));
  const confidence = included && titleStrength === "strong" && authorityMatches.length >= 3
    ? "high"
    : included ? "medium" : "low";

  return {
    included,
    score: clampedScore,
    label: labelForDecisionScore(clampedScore),
    confidence,
    roleFamily,
    positives,
    risks,
    evidence,
  };
}

// Evidence-gated match decision, ported from the refined private engine
// (app/scans/matching.ts `evaluateJobMatch`, rules lineage
// "randall-private-2026-06-12-offshore-hubs"). The legacy engine's hand-tuned
// config is derived here from the user's Candidate Profile instead:
//   - title families <- explicit target titles, with Role Track names as fallback
//   - positive/negative keywords <- track evidence only when explicit titles are absent
//   - wrong-lane block  <- occupation classifier vs the user's derived lanes
// Fit Signals stay soft score contributors (matching is a spectrum); the only
// hard risks include avoid-list companies, confidently wrong-lane occupations,
// declared-context conflicts for ambiguous titles, and location constraints.
import type { CandidateProfileAggregate } from "../types";
import {
  classifyOccupation,
  isWrongLaneForProfile,
  lanePolarityForProfile,
  profileLanesForAggregate,
  supportsDeclaredIndustryDisambiguation,
  type OccupationClassification,
  type OccupationLane,
  type ProfileLanes,
} from "./occupation";
import { parseSalaryAmounts } from "./scorers";
import { assessLocationEligibility } from "./location-eligibility";
import {
  assessIndustryContext,
  genericCrossIndustryRoleFamily,
  genericCrossIndustryRoleLevel,
  hasGenericCrossIndustryRoleHead,
  isGenericCrossIndustryTitle,
  type IndustryContextAssessment,
} from "./industry-context";
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
  industryContext: IndustryContextAssessment;
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
const SUBORDINATE_TITLE_MODIFIERS = new Set(["assistant", "associate", "deputy", "junior", "jr"]);

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

function addsSubordinateTitleModifier(title: string, targetTitle: string) {
  const titleTokens = new Set(normalize(title).split(" ").filter(Boolean));
  const targetTokens = new Set(normalize(targetTitle).split(" ").filter(Boolean));
  return [...SUBORDINATE_TITLE_MODIFIERS].some((modifier) => titleTokens.has(modifier) && !targetTokens.has(modifier));
}

export type ProfileMatchingSignals = {
  lanes: ProfileLanes;
  hasExplicitTargetTitles: boolean;
  explicitTitleIntents: Array<{
    term: string;
    titleLane: OccupationLane;
    contextLanes: OccupationLane[];
    requiresIndustryContext: boolean;
  }>;
  titleTerms: string[];
  positiveKeywords: string[];
  negativeKeywords: string[];
  targetIndustries: string[];
  avoidIndustries: string[];
  avoidCompanies: string[];
  watchlistCompanies: string[];
  employmentTypes: string[];
  remotePreference: string;
  candidateLocation: string;
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

function declaredContextLanes(targetIndustries: string[]) {
  const lanes = new Set<OccupationLane>();
  for (const industry of targetIndustries) {
    const classification = classifyOccupation({
      title: "",
      description: industry,
      companyName: "",
    });
    if (classification.lane === "unknown") continue;
    lanes.add(classification.lane);
    for (const adjacent of classification.adjacentLanes) lanes.add(adjacent);
  }
  return [...lanes];
}

export function matchingSignalsForAggregate(aggregate: CandidateProfileAggregate): ProfileMatchingSignals {
  const hourlyFloor = aggregate.profile.targetCompensationHourlyMin;
  const explicitTitles = unique(aggregate.roleTracks.flatMap((track) => track.targetTitles));
  const hasExplicitTargetTitles = explicitTitles.length > 0;
  const declaredTitles = unique(aggregate.roleTracks.flatMap((track) => (
    track.targetTitles.some((title) => title.trim())
      ? track.targetTitles
      : [track.name]
  )));
  const targetIndustries = aggregate.preferences?.targetIndustries ?? [];
  const contextLanes = declaredContextLanes(targetIndustries);
  return {
    lanes: profileLanesForAggregate(aggregate),
    hasExplicitTargetTitles,
    explicitTitleIntents: declaredTitles.map((term) => ({
      term,
      titleLane: classifyOccupation({ title: term, description: "", companyName: "" }).lane,
      contextLanes: supportsDeclaredIndustryDisambiguation(term) ? contextLanes : [],
      requiresIndustryContext: isGenericCrossIndustryTitle(term),
    })),
    titleTerms: declaredTitles,
    positiveKeywords: hasExplicitTargetTitles ? [] : unique([
      ...aggregate.roleTracks.flatMap((track) => [
        ...track.keyResponsibilities,
        ...track.requiredExperiencePatterns,
        ...track.strongJobSignals,
      ]),
      ...aggregate.skills.map((skill) => skill.skillName),
      ...(aggregate.fitSignals?.goodSignals ?? []),
    ]),
    negativeKeywords: hasExplicitTargetTitles ? [] : unique([
      ...aggregate.roleTracks.flatMap((track) => [...track.weakJobSignals, ...track.mismatchSignals]),
      ...(aggregate.fitSignals?.poorFitSignals ?? []),
    ]),
    targetIndustries,
    avoidIndustries: aggregate.preferences?.avoidIndustries ?? [],
    avoidCompanies: aggregate.preferences?.avoidCompanies ?? [],
    watchlistCompanies: aggregate.companyWatchlist.map((item) => item.companyName),
    employmentTypes: aggregate.preferences?.employmentTypes ?? [],
    remotePreference: aggregate.profile.remotePreference ?? "",
    candidateLocation: aggregate.profile.location,
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

export function industryContextForJob(
  job: MatchJob,
  signals: ProfileMatchingSignals,
  occupationClassification?: OccupationClassification,
): IndustryContextAssessment {
  const title = normalize(job.title);
  const classification = occupationClassification ?? classifyOccupation({
    title: job.title,
    department: job.department,
    description: [
      job.industry ?? "",
      job.description,
      ...(job.responsibilities ?? []),
      ...(job.requiredExperience ?? []),
    ].join(" "),
    companyName: job.companyName,
  });
  const exactIntents = signals.explicitTitleIntents.filter((intent) => includesTerm(title, intent.term));
  const specializedIntentSupportsPosting = exactIntents.some((intent) => !intent.requiresIndustryContext)
    || signals.explicitTitleIntents.some((intent) => (
      !intent.requiresIndustryContext && intent.titleLane === classification.lane
    ));
  const relevantIntents = exactIntents.length > 0
    ? exactIntents
    : signals.explicitTitleIntents.filter((intent) => intent.titleLane === classification.lane);
  const requiresIndustryContext = exactIntents.length > 0
    ? exactIntents.every((intent) => intent.requiresIndustryContext)
    : relevantIntents.some((intent) => intent.requiresIndustryContext)
      || (
        !specializedIntentSupportsPosting
        &&
        signals.explicitTitleIntents.some((intent) => intent.requiresIndustryContext)
        && hasGenericCrossIndustryRoleHead(job.title)
      );
  return assessIndustryContext(job, signals.targetIndustries, requiresIndustryContext);
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
    job.industry ?? "",
    job.description,
    ...(job.responsibilities ?? []),
    ...(job.requiredExperience ?? []),
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
  const titleTermMatches = signals.titleTerms.filter((term) => (
    includesTerm(title, term) && !addsSubordinateTitleModifier(job.title, term)
  ));
  const classification = classifyOccupation({
    title: job.title,
    department: job.department,
    description: [
      job.industry ?? "",
      job.description,
      ...(job.responsibilities ?? []),
      ...(job.requiredExperience ?? []),
    ].join(" "),
    companyName: job.companyName,
  });
  const lanePolarity = lanePolarityForProfile(classification.lane, signals.lanes);
  const laneTitleEvidence = classification.source === "title" || classification.source === "title_and_tasks";
  const exactMatchedTitleIntents = signals.explicitTitleIntents.filter((intent) => (
    includesTerm(title, intent.term) && !addsSubordinateTitleModifier(job.title, intent.term)
  ));
  const subordinateTitleConflict = signals.explicitTitleIntents.some((intent) => (
    includesTerm(title, intent.term) && addsSubordinateTitleModifier(job.title, intent.term)
  )) && exactMatchedTitleIntents.length === 0;
  const candidateGenericFamily = genericCrossIndustryRoleFamily(job.title);
  const candidateGenericLevel = genericCrossIndustryRoleLevel(job.title);
  const genericFamilyTitleIntents = exactMatchedTitleIntents.length > 0 || !candidateGenericFamily
    ? []
    : signals.explicitTitleIntents.filter((intent) => (
      intent.requiresIndustryContext
      && genericCrossIndustryRoleFamily(intent.term) === candidateGenericFamily
      && genericCrossIndustryRoleLevel(intent.term) === candidateGenericLevel
      && !addsSubordinateTitleModifier(job.title, intent.term)
    ));
  const genericTitleIntents = signals.explicitTitleIntents.filter((intent) => intent.requiresIndustryContext);
  const specializedIntentSupportsPosting = exactMatchedTitleIntents.some((intent) => !intent.requiresIndustryContext)
    || signals.explicitTitleIntents.some((intent) => (
      !intent.requiresIndustryContext && intent.titleLane === classification.lane
    ));
  const genericCandidateRoleFamilyConflict = titleTermMatches.length === 0
    && !specializedIntentSupportsPosting
    && Boolean(candidateGenericFamily)
    && genericTitleIntents.length > 0
    && genericFamilyTitleIntents.length === 0;
  const genericOnlyProfileRoleFamilyConflict = titleTermMatches.length === 0
    && signals.explicitTitleIntents.length > 0
    && signals.explicitTitleIntents.every((intent) => intent.requiresIndustryContext)
    && genericFamilyTitleIntents.length === 0;
  const matchedTitleIntents = [...exactMatchedTitleIntents, ...genericFamilyTitleIntents];
  const industryContext = industryContextForJob(job, signals, classification);
  const exactGenericIndustryMatch = matchedTitleIntents.some((intent) => intent.requiresIndustryContext)
    && industryContext.status === "aligned";

  let roleFamily = "unclassified";
  let titleStrength: "strong" | "stretch" | "none" = "none";
  if (titleTermMatches.length > 0) {
    titleStrength = "strong";
    roleFamily = "profile-target";
    // Exact saved-title intent must outrank a broad same-lane match under
    // otherwise equivalent conditions. Equal weighting allowed abundant broad
    // lanes to crowd explicit Producer targets out of the global result cap.
    score += 42;
    positives.push(`Title matches your target: ${titleTermMatches.slice(0, 2).join(", ")}.`);
    evidence.push(`title evidence: ${titleTermMatches.slice(0, 2).join(", ")}`);
  } else if (genericFamilyTitleIntents.length > 0) {
    titleStrength = "strong";
    roleFamily = genericFamilyTitleIntents.find((intent) => intent.titleLane !== "unknown")?.titleLane
      ?? `${candidateGenericFamily}-leadership`;
    score += 34;
    positives.push(`Role family lines up with your target (${genericFamilyTitleIntents[0].term}).`);
    evidence.push(`generic role family: ${candidateGenericFamily}`);
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
    (titleTermMatches.length === 0 || laneTitleEvidence) &&
    !exactGenericIndustryMatch
  ) {
    risks.push(`hard exclude: role is in a different lane (${classification.lane.replace(/-/g, " ")})`);
  }
  if (subordinateTitleConflict) {
    risks.push("hard exclude: title is subordinate to the saved target level");
  }
  if (genericCandidateRoleFamilyConflict || genericOnlyProfileRoleFamilyConflict) {
    risks.push("hard exclude: role family differs from the saved generic target");
  }

  // Account Director has a separate function ambiguity inside the role itself.
  // Preserve that role-layer check; the cross-industry validator applies only
  // after a role family has been established.
  const ambiguousTitleIntents = matchedTitleIntents.filter((intent) => intent.titleLane === "unknown");
  const knownIntentSupportsPosting = matchedTitleIntents.some((intent) => intent.titleLane === classification.lane);
  const ambiguousContextSupportsPosting = ambiguousTitleIntents.some((intent) => intent.contextLanes.includes(classification.lane));
  const hasDeclaredAmbiguousContext = ambiguousTitleIntents.some((intent) => intent.contextLanes.length > 0);
  if (
    classification.lane !== "unknown" &&
    classification.confidence !== "low" &&
    hasDeclaredAmbiguousContext &&
    !knownIntentSupportsPosting &&
    !ambiguousContextSupportsPosting
  ) {
    risks.push(`hard exclude: ambiguous title conflicts with declared search context (${classification.lane.replace(/-/g, " ")})`);
  }

  if (industryContext.status === "aligned") {
    score += 10;
    positives.push("Posting context matches a target industry.");
    evidence.push(...industryContext.evidence.slice(0, 3));
  } else if (industryContext.status === "conflict") {
    risks.push(`hard exclude: generic role conflicts with declared industry context (${industryContext.postingDomains.join(", ")})`);
  } else if (industryContext.status === "unknown") {
    score -= 5;
    risks.push("Industry context is unclear for this generic target.");
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
  if (industryContext.status === "not_applicable" && industryMatches.length > 0) {
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

  // Geographic hiring eligibility is independent of remote-work preference. A remote
  // posting restricted to another country is not workable merely because it says remote.
  const locationEligibility = assessLocationEligibility(signals.candidateLocation, job.location);
  if (locationEligibility.status === "conflict") {
    score -= 40;
    risks.push(`hard location constraint: ${locationEligibility.reason}`);
  }

  // Remote/location, keyed to the profile preference (legacy engine assumed
  // remote-only; the public profile carries the preference explicitly).
  const remoteType = normalize(job.remoteType ?? "");
  const remoteOnly = signals.remotePreference === "remote_only";
  if (signals.remotePreference === "no_preference") {
    evidence.push("No remote-work preference set.");
  } else if (remoteType.includes("remote")) {
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
    industryContext,
  };
}

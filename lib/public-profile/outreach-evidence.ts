import type { CandidateProfileAggregate, WorkExample } from "./types";
import { scoreSignalsAgainstText } from "./matching/scorers";

const MIN_RELEVANCE_SCORE = 0.1;
const COMPARABLE_RELEVANCE_RATIO = 0.7;
const COMPARABLE_RELEVANCE_GAP = 0.15;
const RECENT_USAGE_WEIGHTS = [0.08, 0.05, 0.03, 0.02, 0.01];

export type OutreachEvidenceHistoryEntry = {
  message: string;
  selectedWorkExampleId?: string;
};

export type OutreachEvidenceCandidate = {
  workExample: WorkExample;
  relevanceScore: number;
  matchedSignals: string[];
  responsibilityMatchedSignals: string[];
  requiredExperienceMatchedSignals: string[];
  recentUsageCount: number;
  diversityPenalty: number;
  adjustedScore: number;
  comparableToBest: boolean;
};

export type OutreachEvidenceDecision = {
  selected?: WorkExample;
  relevanceScore?: number;
  matchedSignals: string[];
  responsibilityMatchedSignals: string[];
  requiredExperienceMatchedSignals: string[];
  recentUsageCount: number;
  consideredCount: number;
  comparableCandidateCount: number;
  diversityAffectedSelection: boolean;
  candidates: OutreachEvidenceCandidate[];
};

type OutreachEvidenceJob = {
  title: string;
  company: string;
  description: string;
  responsibilities?: string[];
  requiredExperience?: string[];
};

function normalized(value: string | undefined) {
  return (value ?? "").trim().toLocaleLowerCase();
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalized(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Preserve compact domain acronyms as independent signals. Long profile fields are
// intentionally scored as evidence blocks, but requirements often name a short exact
// capability such as AI, API, QA, or LLM that would otherwise disappear inside prose.
function acronymSignals(values: string[]) {
  return unique(values.flatMap((value) => value.match(/\b[A-Z][A-Z0-9]{1,9}\b/g) ?? []));
}

function exampleSignals(aggregate: CandidateProfileAggregate, example: WorkExample) {
  const relatedSkills = aggregate.skills.filter((skill) => skill.relatedWorkExampleIds.includes(example.id));
  const evidence = [
    example.title,
    example.oneHitter,
    example.context,
    ...relatedSkills.flatMap((skill) => [skill.skillName, ...skill.evidence]),
  ];
  return unique([...evidence, ...acronymSignals(evidence)]);
}

function roleTrackSignals(aggregate: CandidateProfileAggregate, selectedRoleTrackId?: string) {
  const track = aggregate.roleTracks.find((candidate) => candidate.id === selectedRoleTrackId);
  return track
    ? unique([
        track.name,
        track.description,
        track.corePositioning,
        track.outreachAngle,
        ...track.targetTitles,
        ...track.keyResponsibilities,
        ...track.requiredExperiencePatterns,
        ...track.strongJobSignals,
      ])
    : [];
}

function messageUsesExample(message: string, example: WorkExample) {
  if (example.link && message.includes(example.link)) return true;
  return message.includes(example.oneHitter);
}

function recentUsage(
  history: OutreachEvidenceHistoryEntry[],
  example: WorkExample,
) {
  let count = 0;
  let penalty = 0;
  for (const [index, entry] of history.slice(0, RECENT_USAGE_WEIGHTS.length).entries()) {
    const used = entry.selectedWorkExampleId === example.id
      || (!entry.selectedWorkExampleId && messageUsesExample(entry.message, example));
    if (!used) continue;
    count += 1;
    penalty += RECENT_USAGE_WEIGHTS[index];
  }
  return { count, penalty: Math.min(0.15, penalty) };
}

function roundScore(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

export function rankOutreachWorkExamples(input: {
  aggregate: CandidateProfileAggregate;
  job: OutreachEvidenceJob;
  selectedRoleTrackId?: string;
  history?: OutreachEvidenceHistoryEntry[];
}): OutreachEvidenceDecision {
  const history = input.history ?? [];
  const trackSignals = roleTrackSignals(input.aggregate, input.selectedRoleTrackId);
  const ranked = input.aggregate.workExamples.map((workExample) => {
    const signals = exampleSignals(input.aggregate, workExample);
    const titleFit = scoreSignalsAgainstText(signals, input.job.title);
    const descriptionFit = scoreSignalsAgainstText(signals, input.job.description);
    const responsibilitiesText = (input.job.responsibilities ?? []).join(" ");
    const requiredExperienceText = (input.job.requiredExperience ?? []).join(" ");
    const responsibilityFit = scoreSignalsAgainstText(signals, responsibilitiesText);
    const requiredExperienceFit = scoreSignalsAgainstText(signals, requiredExperienceText);
    const trackFit = trackSignals.length > 0
      ? scoreSignalsAgainstText(signals, trackSignals.join(" "))
      : { score: 0, matches: [] as string[] };
    const weightedFits = [
      { present: Boolean(input.job.title.trim()), weight: 0.2, score: titleFit.score },
      { present: Boolean(input.job.description.trim()), weight: 0.35, score: descriptionFit.score },
      { present: Boolean(responsibilitiesText.trim()), weight: 0.15, score: responsibilityFit.score },
      // Explicit requirements are the strongest evidence boundary. If the posting says a
      // capability is required and the profile supports it, general description language
      // must not drown that signal out.
      { present: Boolean(requiredExperienceText.trim()), weight: 0.55, score: requiredExperienceFit.score },
      { present: trackSignals.length > 0, weight: 0.1, score: trackFit.score },
    ].filter((fit) => fit.present);
    const totalWeight = weightedFits.reduce((sum, fit) => sum + fit.weight, 0);
    const relevanceScore = roundScore(totalWeight > 0
      ? weightedFits.reduce((sum, fit) => sum + fit.score * fit.weight, 0) / totalWeight
      : 0);
    const usage = recentUsage(history, workExample);
    return {
      workExample,
      relevanceScore,
      matchedSignals: unique([
        ...titleFit.matches,
        ...descriptionFit.matches,
        ...responsibilityFit.matches,
        ...requiredExperienceFit.matches,
        ...trackFit.matches,
      ]),
      responsibilityMatchedSignals: responsibilityFit.matches,
      requiredExperienceMatchedSignals: requiredExperienceFit.matches,
      recentUsageCount: usage.count,
      diversityPenalty: roundScore(usage.penalty),
      adjustedScore: roundScore(relevanceScore - usage.penalty),
      comparableToBest: false,
    } satisfies OutreachEvidenceCandidate;
  }).sort((a, b) =>
    b.relevanceScore - a.relevanceScore
    || a.workExample.title.localeCompare(b.workExample.title)
    || a.workExample.id.localeCompare(b.workExample.id));

  const best = ranked[0];
  if (!best || best.relevanceScore < MIN_RELEVANCE_SCORE || best.matchedSignals.length === 0) {
    return {
      matchedSignals: [],
      responsibilityMatchedSignals: [],
      requiredExperienceMatchedSignals: [],
      recentUsageCount: 0,
      consideredCount: ranked.length,
      comparableCandidateCount: 0,
      diversityAffectedSelection: false,
      candidates: ranked,
    };
  }

  const comparable = ranked.filter((candidate) =>
    candidate.relevanceScore >= MIN_RELEVANCE_SCORE
    && candidate.matchedSignals.length > 0
    && candidate.relevanceScore >= best.relevanceScore * COMPARABLE_RELEVANCE_RATIO
    && best.relevanceScore - candidate.relevanceScore <= COMPARABLE_RELEVANCE_GAP);
  const comparableIds = new Set(comparable.map((candidate) => candidate.workExample.id));
  const candidates = ranked.map((candidate) => ({
    ...candidate,
    comparableToBest: comparableIds.has(candidate.workExample.id),
  }));
  const selected = [...comparable].sort((a, b) =>
    b.adjustedScore - a.adjustedScore
    || b.relevanceScore - a.relevanceScore
    || a.workExample.title.localeCompare(b.workExample.title)
    || a.workExample.id.localeCompare(b.workExample.id))[0] ?? best;

  return {
    selected: selected.workExample,
    relevanceScore: selected.relevanceScore,
    matchedSignals: selected.matchedSignals,
    responsibilityMatchedSignals: selected.responsibilityMatchedSignals,
    requiredExperienceMatchedSignals: selected.requiredExperienceMatchedSignals,
    recentUsageCount: selected.recentUsageCount,
    consideredCount: ranked.length,
    comparableCandidateCount: comparable.length,
    diversityAffectedSelection: selected.workExample.id !== best.workExample.id,
    candidates,
  };
}

export function resolveInsertedWorkExample(
  workExamples: WorkExample[],
  insertedExample: { id?: string; oneHitter: string; link?: string } | null,
) {
  if (!insertedExample) return undefined;
  const oneHitter = insertedExample.oneHitter.trim();
  const link = insertedExample.link?.trim();
  const matches = workExamples.filter((example) =>
    (!insertedExample.id || example.id === insertedExample.id)
    && example.oneHitter.trim() === oneHitter
    && (example.link?.trim() || undefined) === link);
  return matches.length === 1 ? matches[0] : undefined;
}

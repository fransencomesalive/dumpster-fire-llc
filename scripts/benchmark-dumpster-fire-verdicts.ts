import { loadEnvConfig } from "@next/env";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { evaluateJobMatch, isMatchingRuleConfig, randallPrivateMatchingConfig } from "../app/scans/matching";
import type { MatchingRuleConfig } from "../app/scans/matching";
import { labelForReviewRationale, routeForReviewRationale, structureReviewDecisions } from "../app/scans/review-feedback";
import type { ReviewFitVerdict, StructuredReviewDecision } from "../app/scans/review-feedback";
import { getActiveMatchingConfig, getDashboardState, getNearMissReviewDecisions } from "../app/scans/store";
import type { UserSearchProfile } from "../app/scans/types";

const DEFAULT_EXPORT_PATH = "/private/tmp/scans-review-batches.json";
const DEFAULT_OUTPUT_PATH = "/private/tmp/scans-verdict-benchmark.json";

type ReviewBatchCard = {
  reviewKey: string;
  sourceKind?: string;
  sourceName?: string;
  provider?: string;
  title?: string;
  companyName?: string;
  location?: string;
  remoteType?: "remote" | "hybrid" | "onsite" | "unclear";
  department?: string;
  employmentType?: "full-time" | "contract" | "freelance";
  salaryText?: string;
  responsibilitySnippets?: string[];
  experienceSnippets?: string[];
  descriptionSnippet?: string;
};

type MatcherOutcome = "included_good" | "included_stretch" | "filtered";

type ReplayRow = {
  reviewKey: string;
  title: string;
  companyName: string;
  sourceKind: string;
  sourceName: string;
  verdict: ReviewFitVerdict;
  verdictSource: StructuredReviewDecision["verdictSource"];
  rationale: string[];
  routes: string[];
  sourceQaOnly: boolean;
  outcome: MatcherOutcome;
  score: number;
  topRisks: string[];
  contentSource: "export_snippets";
};

type ConfusionMatrix = Record<ReviewFitVerdict, Record<MatcherOutcome, number>>;

type ConfigReport = {
  rulesVersion: string;
  matrix: ConfusionMatrix;
  recalledPositives: number;
  totalPositives: number;
  wrongInclusions: number;
  totalNegatives: number;
  missedPositiveExamples: Array<{ title: string; companyName: string; topRisks: string[] }>;
  wrongInclusionExamples: Array<{ title: string; companyName: string; rationale: string[]; routes: string[] }>;
  wrongInclusionsByRoute: Record<string, number>;
  bySource: Array<{ source: string; reviewed: number; recalledPositives: number; positives: number; wrongInclusions: number; negatives: number }>;
};

function argValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function emptyMatrix(): ConfusionMatrix {
  const outcomes = { included_good: 0, included_stretch: 0, filtered: 0 };
  return {
    match: { ...outcomes },
    good: { ...outcomes },
    stretch: { ...outcomes },
    not_a_match: { ...outcomes },
  };
}

function loadExportCards(exportPath: string): Map<string, ReviewBatchCard> {
  const cards = new Map<string, ReviewBatchCard>();
  if (!existsSync(exportPath)) return cards;

  const parsed = JSON.parse(readFileSync(exportPath, "utf8")) as { batches?: ReviewBatchCard[][] };
  for (const card of (parsed.batches ?? []).flat()) {
    if (card.reviewKey) cards.set(card.reviewKey, card);
  }

  return cards;
}

function descriptionFromCard(card: ReviewBatchCard) {
  return [
    card.descriptionSnippet ?? "",
    ...(card.responsibilitySnippets ?? []),
    ...(card.experienceSnippets ?? []),
  ].filter(Boolean).join(" ");
}

function replayReview(
  review: StructuredReviewDecision,
  card: ReviewBatchCard,
  profile: UserSearchProfile,
  config: MatchingRuleConfig
): ReplayRow {
  const decision = evaluateJobMatch({
    title: card.title ?? review.title,
    companyName: card.companyName ?? review.companyName,
    department: card.department ?? "",
    location: card.location ?? "",
    remoteType: card.remoteType ?? "unclear",
    employmentType: card.employmentType ?? "full-time",
    salaryMin: undefined,
    salaryMax: undefined,
    salaryText: card.salaryText ?? "",
    descriptionText: descriptionFromCard(card),
    firstSeenAt: new Date().toISOString(),
    needsContactResearch: true,
  }, profile, config);

  return {
    reviewKey: review.reviewKey,
    title: card.title ?? review.title,
    companyName: card.companyName ?? review.companyName,
    sourceKind: card.sourceKind ?? "unknown",
    sourceName: card.sourceName ?? review.provider,
    verdict: review.verdict,
    verdictSource: review.verdictSource,
    rationale: review.rationale.map(labelForReviewRationale),
    routes: review.routes,
    sourceQaOnly: review.sourceQaOnly,
    outcome: !decision.included ? "filtered" : decision.matchQuality === "good" ? "included_good" : "included_stretch",
    score: decision.score,
    topRisks: decision.risks.slice(0, 3),
    contentSource: "export_snippets",
  };
}

function reportFor(rows: ReplayRow[], rulesVersion: string): ConfigReport {
  const matrix = emptyMatrix();
  const fitRows = rows.filter((row) => !row.sourceQaOnly);
  const positives = fitRows.filter((row) => row.verdict === "match" || row.verdict === "good");
  const negatives = fitRows.filter((row) => row.verdict === "not_a_match");
  const wrongInclusionsByRoute: Record<string, number> = {};
  const sourceMap = new Map<string, { reviewed: number; recalledPositives: number; positives: number; wrongInclusions: number; negatives: number }>();

  for (const row of fitRows) {
    matrix[row.verdict][row.outcome] += 1;
    const sourceKey = `${row.sourceKind}: ${row.sourceName}`;
    const sourceEntry = sourceMap.get(sourceKey) ?? { reviewed: 0, recalledPositives: 0, positives: 0, wrongInclusions: 0, negatives: 0 };
    sourceEntry.reviewed += 1;
    if (row.verdict === "match" || row.verdict === "good") {
      sourceEntry.positives += 1;
      if (row.outcome !== "filtered") sourceEntry.recalledPositives += 1;
    }
    if (row.verdict === "not_a_match") {
      sourceEntry.negatives += 1;
      if (row.outcome !== "filtered") sourceEntry.wrongInclusions += 1;
    }
    sourceMap.set(sourceKey, sourceEntry);
  }

  const missedPositives = positives.filter((row) => row.outcome === "filtered");
  const wrongInclusions = negatives.filter((row) => row.outcome !== "filtered");

  for (const row of wrongInclusions) {
    const routes = row.routes.length > 0 ? row.routes : ["unspecified"];
    for (const route of routes) {
      wrongInclusionsByRoute[route] = (wrongInclusionsByRoute[route] ?? 0) + 1;
    }
  }

  return {
    rulesVersion,
    matrix,
    recalledPositives: positives.length - missedPositives.length,
    totalPositives: positives.length,
    wrongInclusions: wrongInclusions.length,
    totalNegatives: negatives.length,
    missedPositiveExamples: missedPositives.slice(0, 10).map((row) => ({
      title: row.title,
      companyName: row.companyName,
      topRisks: row.topRisks,
    })),
    wrongInclusionExamples: wrongInclusions.slice(0, 10).map((row) => ({
      title: row.title,
      companyName: row.companyName,
      rationale: row.rationale,
      routes: row.routes,
    })),
    wrongInclusionsByRoute,
    bySource: [...sourceMap.entries()]
      .map(([source, entry]) => ({ source, ...entry }))
      .sort((a, b) => b.reviewed - a.reviewed),
  };
}

async function main() {
  loadEnvConfig(process.cwd());

  const exportPath = argValue("export") ?? DEFAULT_EXPORT_PATH;
  const outputPath = argValue("out") ?? DEFAULT_OUTPUT_PATH;
  const candidateConfigPath = argValue("config");

  const [reviews, dashboardState, activeConfig] = await Promise.all([
    getNearMissReviewDecisions(),
    getDashboardState(),
    getActiveMatchingConfig(),
  ]);
  const structured = structureReviewDecisions(reviews);
  const cards = loadExportCards(exportPath);
  const joined = structured
    .map((review) => ({ review, card: cards.get(review.reviewKey) }))
    .filter((entry): entry is { review: StructuredReviewDecision; card: ReviewBatchCard } => Boolean(entry.card));
  const unmatchedToCard = structured.length - joined.length;
  const profile = dashboardState.searchProfile;
  const currentConfig = activeConfig.matchingConfig ?? randallPrivateMatchingConfig;

  let candidateConfig: MatchingRuleConfig | undefined;
  if (candidateConfigPath) {
    const parsed = JSON.parse(readFileSync(candidateConfigPath, "utf8"));
    if (!isMatchingRuleConfig(parsed)) {
      throw new Error(`Candidate config at ${candidateConfigPath} is not a valid MatchingRuleConfig.`);
    }
    candidateConfig = parsed;
  }

  const currentRows = joined.map(({ review, card }) => replayReview(review, card, profile, currentConfig));
  const currentReport = reportFor(currentRows, currentConfig.rulesVersion);
  const candidateRows = candidateConfig
    ? joined.map(({ review, card }) => replayReview(review, card, profile, candidateConfig))
    : undefined;
  const candidateReport = candidateRows && candidateConfig
    ? reportFor(candidateRows, candidateConfig.rulesVersion)
    : undefined;

  const gate = candidateReport
    ? {
        evaluated: true,
        positiveRecallRegression: candidateReport.recalledPositives < currentReport.recalledPositives,
        wrongInclusionRegression: candidateReport.wrongInclusions > currentReport.wrongInclusions,
        passed:
          candidateReport.recalledPositives >= currentReport.recalledPositives &&
          candidateReport.wrongInclusions <= currentReport.wrongInclusions,
      }
    : { evaluated: false, positiveRecallRegression: false, wrongInclusionRegression: false, passed: true };

  const output = {
    generatedAt: new Date().toISOString(),
    persistence: dashboardState.persistence,
    matchingConfigSource: activeConfig.source,
    exportPath,
    savedReviews: structured.length,
    replayedReviews: joined.length,
    unmatchedToCard,
    sourceQaOnlyReviews: structured.filter((review) => review.sourceQaOnly).length,
    verdictSources: {
      review: structured.filter((review) => review.verdictSource === "review").length,
      legacy_tags: structured.filter((review) => review.verdictSource === "legacy_tags").length,
      legacy_decision: structured.filter((review) => review.verdictSource === "legacy_decision").length,
    },
    note: "Replay uses export-card snippets as approximate posting content. Treat outcomes as directional for content-dependent gates and exact for title/eligibility gates.",
    current: currentReport,
    candidate: candidateReport ?? null,
    gate,
    rows: currentRows,
  };

  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  console.log(JSON.stringify({
    persistence: output.persistence,
    matchingConfigSource: output.matchingConfigSource,
    savedReviews: output.savedReviews,
    replayedReviews: output.replayedReviews,
    unmatchedToCard: output.unmatchedToCard,
    sourceQaOnlyReviews: output.sourceQaOnlyReviews,
    verdictSources: output.verdictSources,
    current: {
      rulesVersion: currentReport.rulesVersion,
      positiveRecall: `${currentReport.recalledPositives}/${currentReport.totalPositives}`,
      wrongInclusions: `${currentReport.wrongInclusions}/${currentReport.totalNegatives}`,
      matrix: currentReport.matrix,
    },
    candidate: candidateReport
      ? {
          rulesVersion: candidateReport.rulesVersion,
          positiveRecall: `${candidateReport.recalledPositives}/${candidateReport.totalPositives}`,
          wrongInclusions: `${candidateReport.wrongInclusions}/${candidateReport.totalNegatives}`,
        }
      : null,
    gate,
    output: outputPath,
  }, null, 2));

  if (gate.evaluated && !gate.passed) {
    console.error("GATE FAILED: candidate config regresses against saved human verdicts. Do not apply.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

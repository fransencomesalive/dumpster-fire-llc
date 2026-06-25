import { loadEnvConfig } from "@next/env";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { classifyOccupation, type OccupationLane } from "../app/scans/occupation-classifier";
import { getNearMissReviewDecisions } from "../app/scans/store";
import type { NearMissReviewDecision, NearMissReviewDecisionValue } from "../app/scans/types";

const DEFAULT_EXPORT_PATH = "/private/tmp/scans-review-batches.json";
const DEFAULT_OUTPUT_PATH = "/private/tmp/scans-occupation-classifier-benchmark.json";

type ReviewBatchItem = {
  reviewKey: string;
  title: string;
  companyName: string;
  sourceKind?: string;
  sourceName?: string;
  department?: string;
  location?: string;
  remoteType?: "remote" | "hybrid" | "onsite" | "unclear";
  salaryText?: string;
  descriptionSnippet?: string;
  responsibilitySnippets?: string[];
  experienceSnippets?: string[];
  fitSummary?: string;
  roleFamily?: string;
  risks?: string[];
  reasonsToInspect?: string[];
};

type ExportedReviewBatches = {
  summary?: Record<string, unknown>;
  batches?: ReviewBatchItem[][];
};

function argValue(name: string, fallback: string) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.replace(`--${name}=`, "") ?? fallback;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topCounts(map: Map<string, number>, limit = 24) {
  return [...map.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function parseTags(reason: string) {
  const match = reason.match(/^\[tags:\s*([^\]]*)\]/i);
  return match?.[1].split(",").map((tag) => tag.trim()).filter(Boolean) ?? [];
}

function decisionLabel(value: NearMissReviewDecisionValue) {
  if (value === "approve") return "should_show";
  if (value === "reject") return "correctly_filtered";
  return "not_for_me";
}

function sourceKindLabel(value: string | undefined) {
  if (value === "broad_job_board") return "broad";
  if (value === "targeted_company_careers" || value === "targeted_company_source") return "targeted";
  return value || "unknown";
}

function loadExport(pathname: string): ExportedReviewBatches {
  if (!existsSync(pathname)) {
    throw new Error(`Review export not found at ${pathname}. Run scripts/run-dumpster-fire-review-batches.mjs first.`);
  }

  return JSON.parse(readFileSync(pathname, "utf8")) as ExportedReviewBatches;
}

function decisionMap(decisions: NearMissReviewDecision[]) {
  return new Map(decisions.map((decision) => [`${decision.reviewKey}:${decision.rulesVersion}`, decision]));
}

function decisionCanonicalKey(decision: Pick<NearMissReviewDecision, "title" | "companyName">) {
  return `${normalize(decision.companyName)}::${normalize(decision.title)}`;
}

function hasWrongLaneTags(tags: string[]) {
  return tags.includes("wrong_function")
    || tags.includes("wrong_domain")
    || tags.includes("too_technical")
    || tags.includes("data_it_infra")
    || tags.includes("people_recruiting")
    || tags.includes("security_legal_compliance");
}

function expectedPolarity(decision: NearMissReviewDecision | undefined) {
  if (!decision) return "unreviewed";
  const tags = parseTags(decision.reason);
  if (decision.decision === "approve" && hasWrongLaneTags(tags)) return "conflicting_positive";
  if (decision.decision === "approve") return "positive";
  if (!hasWrongLaneTags(tags) && tags.includes("location_remote_issue")) return "non_occupation_filter";
  if (!hasWrongLaneTags(tags) && tags.includes("stretch_adjacent")) return "non_occupation_filter";
  if (hasWrongLaneTags(tags)) {
    return "wrong_lane";
  }
  if (decision.decision === "not_for_me") return "wrong_lane";
  return "negative_or_filtered";
}

function conflictingDecisionKeys(decisions: NearMissReviewDecision[]) {
  const polaritiesByKey = new Map<string, Set<string>>();

  for (const decision of decisions) {
    const expected = expectedPolarity(decision);
    if (expected === "conflicting_positive") continue;
    const key = decisionCanonicalKey(decision);
    const polarities = polaritiesByKey.get(key) ?? new Set<string>();
    polarities.add(expected);
    polaritiesByKey.set(key, polarities);
  }

  return new Set([...polaritiesByKey.entries()]
    .filter(([, polarities]) => polarities.has("positive") && (polarities.has("wrong_lane") || polarities.has("negative_or_filtered")))
    .map(([key]) => key));
}

function lanePolarity(lane: OccupationLane) {
  if ([
    "creative-writing",
    "art-direction",
    "visual-design",
    "product-ux-design",
    "ux-research",
    "creative-strategy",
    "creative-leadership",
    "content-video-production",
    "digital-production",
    "technical-production",
    "social-creative",
    "creative-operations",
    "program-project-management",
    "product-operations",
    "research-fellowship",
    "content-rights-licensing",
    "strategy-operations",
    "partnership-programs",
    "safety-program-operations",
    "finance-procurement-operations",
  ].includes(lane)) {
    return "potentially_relevant";
  }

  if (lane === "unknown") return "unknown";
  return "wrong_lane";
}

function textForClassification(item: ReviewBatchItem) {
  return [
    item.descriptionSnippet ?? "",
    ...(item.responsibilitySnippets ?? []),
    ...(item.experienceSnippets ?? []),
  ].join(" ");
}

async function main() {
  loadEnvConfig(process.cwd());
  const exportPath = argValue("export", DEFAULT_EXPORT_PATH);
  const outputPath = argValue("out", DEFAULT_OUTPUT_PATH);
  const exported = loadExport(exportPath);
  const rulesVersion = String(exported.summary?.matchingRulesVersion ?? "randall-private-2026-06-07-resume-signals");
  const decisions = await getNearMissReviewDecisions();
  const decisionsByKey = decisionMap(decisions);
  const conflictingKeys = conflictingDecisionKeys(decisions);
  const rows = (exported.batches ?? []).flatMap((batch, batchIndex) => batch.map((item) => {
    const decision = decisionsByKey.get(`${item.reviewKey}:${rulesVersion}`);
    const classification = classifyOccupation({
      title: item.title,
      department: item.department ?? "",
      descriptionText: textForClassification(item),
      companyName: item.companyName,
      location: item.location ?? "",
      remoteType: item.remoteType ?? "unclear",
      salaryText: item.salaryText ?? "",
      sourceKind: item.sourceKind,
      sourceName: item.sourceName,
    });
    const expected = expectedPolarity(decision);
    const actual = lanePolarity(classification.lane);

    return {
      batchNumber: batchIndex + 1,
      reviewKey: item.reviewKey,
      title: item.title,
      companyName: item.companyName,
      sourceKind: sourceKindLabel(item.sourceKind),
      reviewedDecision: decision ? decisionLabel(decision.decision) : "unreviewed",
      reviewedTags: decision ? parseTags(decision.reason) : [],
      expected,
      lane: classification.lane,
      lanePolarity: actual,
      confidence: classification.confidence,
      evidence: classification.evidence,
      disqualifiers: classification.disqualifiers,
      taskSignals: classification.taskSignals,
      currentRoleFamily: item.roleFamily ?? "unknown",
      currentRisks: item.risks ?? [],
    };
  }));
  const laneCounts = new Map<string, number>();
  const laneDecisionCounts = new Map<string, number>();
  const sourceLaneCounts = new Map<string, number>();
  const confidenceCounts = new Map<string, number>();
  const currentRoleFamilyCounts = new Map<string, number>();
  const alignmentCounts = new Map<string, number>();

  for (const row of rows) {
    increment(laneCounts, row.lane);
    increment(laneDecisionCounts, `${row.reviewedDecision}:${row.lane}`);
    increment(sourceLaneCounts, `${row.sourceKind}:${row.lane}`);
    increment(confidenceCounts, row.confidence);
    increment(currentRoleFamilyCounts, row.currentRoleFamily);
    const alignment = row.expected === "conflicting_positive"
      ? "conflicting_saved_signal"
      : row.expected === "non_occupation_filter"
        ? "review_non_occupation_filter"
      : row.expected === "unreviewed"
      ? "unreviewed"
      : row.expected === "positive" && row.lanePolarity === "potentially_relevant"
        ? "review_positive_supported"
        : row.expected === "wrong_lane" && row.lanePolarity === "wrong_lane"
          ? "review_wrong_lane_supported"
          : row.expected === "negative_or_filtered" && row.lanePolarity !== "potentially_relevant"
            ? "review_filtered_supported"
            : "needs_human_check";
    increment(alignmentCounts, alignment);
  }

  const savedDecisionRows = decisions.map((decision) => {
    const classification = classifyOccupation({
      title: decision.title,
      department: "",
      descriptionText: decision.reason,
      companyName: decision.companyName,
      location: "",
      remoteType: "unclear",
      salaryText: "",
      sourceName: decision.companyName,
    });
    const expected = expectedPolarity(decision);
    const actual = lanePolarity(classification.lane);
    const isConflictingDecision = conflictingKeys.has(decisionCanonicalKey(decision));
    const alignment = isConflictingDecision
      ? "conflicting_saved_decision"
      : expected === "conflicting_positive"
        ? "conflicting_saved_signal"
        : expected === "non_occupation_filter"
          ? "review_non_occupation_filter"
        : expected === "positive" && actual === "potentially_relevant"
      ? "review_positive_supported"
      : expected === "wrong_lane" && actual === "wrong_lane"
        ? "review_wrong_lane_supported"
        : expected === "negative_or_filtered" && actual !== "potentially_relevant"
          ? "review_filtered_supported"
          : "needs_human_check";

    return {
      reviewKey: decision.reviewKey,
      title: decision.title,
      companyName: decision.companyName,
      reviewedDecision: decisionLabel(decision.decision),
      reviewedTags: parseTags(decision.reason),
      expected,
      conflictingDecision: isConflictingDecision,
      lane: classification.lane,
      lanePolarity: actual,
      confidence: classification.confidence,
      evidence: classification.evidence,
      alignment,
    };
  });
  const savedLaneCounts = new Map<string, number>();
  const savedAlignmentCounts = new Map<string, number>();
  const savedDecisionLaneCounts = new Map<string, number>();

  for (const row of savedDecisionRows) {
    increment(savedLaneCounts, row.lane);
    increment(savedAlignmentCounts, row.alignment);
    increment(savedDecisionLaneCounts, `${row.reviewedDecision}:${row.lane}`);
  }

  const unknownRows = rows.filter((row) => row.lane === "unknown");
  const reviewedRows = rows.filter((row) => row.reviewedDecision !== "unreviewed");
  const output = {
    exportPath,
    outputPath,
    rulesVersion,
    exportedSummary: exported.summary ?? {},
    totalRows: rows.length,
    reviewedRows: reviewedRows.length,
    currentUnclassifiedRows: rows.filter((row) => normalize(row.currentRoleFamily) === "unclassified").length,
    classifierUnknownRows: unknownRows.length,
    unknownReductionCandidate: rows.filter((row) => normalize(row.currentRoleFamily) === "unclassified").length - unknownRows.length,
    laneCounts: topCounts(laneCounts),
    laneDecisionCounts: topCounts(laneDecisionCounts, 40),
    sourceLaneCounts: topCounts(sourceLaneCounts, 40),
    confidenceCounts: Object.fromEntries(confidenceCounts),
    currentRoleFamilyCounts: topCounts(currentRoleFamilyCounts),
    alignmentCounts: Object.fromEntries(alignmentCounts),
    savedDecisionBenchmark: {
      totalRows: savedDecisionRows.length,
      actionableRows: savedDecisionRows.filter((row) => !row.conflictingDecision && row.expected !== "conflicting_positive").length,
      laneCounts: topCounts(savedLaneCounts),
      decisionLaneCounts: topCounts(savedDecisionLaneCounts, 40),
      alignmentCounts: Object.fromEntries(savedAlignmentCounts),
      needsHumanCheck: savedDecisionRows.filter((row) => row.alignment === "needs_human_check").slice(0, 60),
    },
    needsHumanCheck: rows.filter((row) => {
      if (row.expected === "positive") return row.lanePolarity !== "potentially_relevant";
      if (row.expected === "wrong_lane") return row.lanePolarity !== "wrong_lane";
      return false;
    }).slice(0, 40),
    sampleRows: rows.slice(0, 40),
  };

  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath,
    totalRows: output.totalRows,
    reviewedRows: output.reviewedRows,
    currentUnclassifiedRows: output.currentUnclassifiedRows,
    classifierUnknownRows: output.classifierUnknownRows,
    unknownReductionCandidate: output.unknownReductionCandidate,
    laneCounts: output.laneCounts,
    alignmentCounts: output.alignmentCounts,
    savedDecisionBenchmark: output.savedDecisionBenchmark,
    needsHumanCheck: output.needsHumanCheck.slice(0, 12),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { loadEnvConfig } from "@next/env";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getNearMissReviewDecisions } from "../app/scans/store";
import type { NearMissReviewDecision, NearMissReviewDecisionValue } from "../app/scans/types";

const DEFAULT_EXPORT_PATH = "/private/tmp/scans-review-batches.json";
const DEFAULT_OUTPUT_PATH = "/private/tmp/scans-review-feedback-summary.json";

type ReviewBatchItem = {
  reviewKey: string;
  reviewType?: string;
  sourceKind?: string;
  sourceName?: string;
  provider?: string;
  title?: string;
  companyName?: string;
  matchQuality?: string;
  roleFamily?: string;
  fitSummary?: string;
  positives?: string[];
  evidence?: string[];
  risks?: string[];
  reasonsToInspect?: string[];
  responsibilitySnippets?: string[];
  experienceSnippets?: string[];
  descriptionSnippet?: string;
  sourceUrl?: string;
};

type ExportedReviewBatches = {
  summary?: Record<string, unknown>;
  batches?: ReviewBatchItem[][];
};

type JoinedDecision = {
  batchNumber: number;
  item: ReviewBatchItem;
  decision: NearMissReviewDecision;
  tags: string[];
  note: string;
};

const matcherFitTags = new Set([
  "strong_role_fit",
  "responsibilities_match",
  "stretch_adjacent",
  "wrong_function",
  "wrong_domain",
  "too_technical",
  "data_it_infra",
  "people_recruiting",
  "security_legal_compliance",
  "seniority_mismatch",
  "location_remote_issue",
  "comp_issue",
  "thin_or_malformed_posting",
]);

const scrapeTags = new Set([
  "bad_responsibility_scrape",
  "bad_experience_scrape",
  "missing_detail_scrape",
]);

function argValue(name: string, fallback: string) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.replace(`--${name}=`, "") ?? fallback;
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topCounts(map: Map<string, number>, limit = 20) {
  return [...map.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function parseReason(reason: string) {
  const tagMatch = reason.match(/^\[tags:\s*([^\]]*)\]\s*/i);
  const tags = tagMatch?.[1]
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean) ?? [];
  const note = tagMatch ? reason.slice(tagMatch[0].length).trim() : reason.trim();

  return { tags, note };
}

function decisionLabel(decision: NearMissReviewDecisionValue) {
  if (decision === "approve") return "should_show";
  if (decision === "reject") return "correctly_filtered";
  return "not_for_me";
}

function normalizeSourceKind(value: string | undefined) {
  if (value === "broad_job_board") return "broad";
  if (value === "targeted_company_source" || value === "targeted_company_careers") return "targeted";
  return value || "unknown";
}

function loadExport(pathname: string): ExportedReviewBatches {
  if (!existsSync(pathname)) {
    throw new Error(`Review export not found at ${pathname}. Run scripts/run-dumpster-fire-review-batches.mjs first.`);
  }

  return JSON.parse(readFileSync(pathname, "utf8")) as ExportedReviewBatches;
}

function decisionMap(decisions: NearMissReviewDecision[]) {
  const map = new Map<string, NearMissReviewDecision>();

  for (const decision of decisions) {
    map.set(`${decision.reviewKey}:${decision.rulesVersion}`, decision);
  }

  return map;
}

function itemMap(exported: ExportedReviewBatches, rulesVersion: string) {
  const map = new Map<string, { batchNumber: number; item: ReviewBatchItem }>();

  for (const [batchIndex, batch] of (exported.batches ?? []).entries()) {
    for (const item of batch) {
      map.set(`${item.reviewKey}:${rulesVersion}`, {
        batchNumber: batchIndex + 1,
        item,
      });
    }
  }

  return map;
}

function missingDetailFlags(item: ReviewBatchItem) {
  return {
    missingResponsibilities: (item.responsibilitySnippets ?? []).length === 0,
    missingExperience: (item.experienceSnippets ?? []).length === 0,
    thinDescription: (item.descriptionSnippet ?? "").trim().length < 120,
  };
}

function buildInterpretation(joined: JoinedDecision[]) {
  const approved = joined.filter((entry) => entry.decision.decision === "approve");
  const broadApproved = approved.filter((entry) => normalizeSourceKind(entry.item.sourceKind) === "broad");
  const targetedApproved = approved.filter((entry) => normalizeSourceKind(entry.item.sourceKind) === "targeted");
  const scrapeTagged = joined.filter((entry) => entry.tags.some((tag) => scrapeTags.has(tag)));
  const wrongLaneTagged = joined.filter((entry) => entry.tags.some((tag) => ["wrong_function", "wrong_domain", "too_technical", "data_it_infra", "people_recruiting", "security_legal_compliance"].includes(tag)));

  return {
    primaryRead: [
      "Treat Batch 1 as matcher calibration plus scraper/source QA, not one blended verdict.",
      "Targeted company approvals are the safest source of recall patterns in this batch.",
      "Broad-board failures should be inspected for query/source noise and malformed posting extraction before broad-board suppression.",
      "Missing salary and unclear remote should remain soft metadata gaps, not strong rejection reasons.",
    ],
    confidence: {
      approvalsFromBroadBoards: broadApproved.length,
      approvalsFromTargetedSources: targetedApproved.length,
      scrapeTaggedReviews: scrapeTagged.length,
      wrongLaneTaggedReviews: wrongLaneTagged.length,
    },
    nextSafeMoves: [
      "Preview title-family/role-family expansions only from approved examples and repeated positive tags.",
      "Preview hard exclusions/down-ranks only from repeated wrong-lane tags.",
      "Create a parser/source QA backlog from scrape tags and missing snippet flags.",
      "Regenerate the next review batch after preview, keeping broad/targeted balance and reason chips visible.",
    ],
  };
}

async function main() {
  loadEnvConfig(process.cwd());

  const exportPath = argValue("export", DEFAULT_EXPORT_PATH);
  const outputPath = argValue("out", DEFAULT_OUTPUT_PATH);
  const exported = loadExport(exportPath);
  const rulesVersion = String(exported.summary?.matchingRulesVersion ?? "randall-private-2026-06-07-resume-signals");
  const decisions = await getNearMissReviewDecisions();
  const exportedItems = itemMap(exported, rulesVersion);
  const savedDecisions = decisionMap(decisions);
  const joined: JoinedDecision[] = [];

  for (const [key, exportedItem] of exportedItems.entries()) {
    const decision = savedDecisions.get(key);
    if (!decision) continue;

    const parsedReason = parseReason(decision.reason);
    joined.push({
      batchNumber: exportedItem.batchNumber,
      item: exportedItem.item,
      decision,
      tags: parsedReason.tags,
      note: parsedReason.note,
    });
  }

  const decisionsByValue = new Map<string, number>();
  const decisionsBySourceKind = new Map<string, number>();
  const tagsByCount = new Map<string, number>();
  const tagsByDecision = new Map<string, number>();
  const tagsBySourceKind = new Map<string, number>();
  const filterReasonCounts = new Map<string, number>();
  const roleFamilyCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const missingDataCounts = new Map<string, number>();

  for (const entry of joined) {
    const sourceKind = normalizeSourceKind(entry.item.sourceKind);
    const decision = decisionLabel(entry.decision.decision);
    increment(decisionsByValue, decision);
    increment(decisionsBySourceKind, `${sourceKind}:${decision}`);
    increment(sourceCounts, `${sourceKind}:${entry.item.sourceName || entry.item.companyName || "unknown"}`);
    increment(roleFamilyCounts, entry.item.roleFamily || "unclassified");

    for (const tag of entry.tags) {
      increment(tagsByCount, tag);
      increment(tagsByDecision, `${decision}:${tag}`);
      increment(tagsBySourceKind, `${sourceKind}:${tag}`);
    }

    for (const reason of [...(entry.item.risks ?? []), ...(entry.item.reasonsToInspect ?? [])]) {
      increment(filterReasonCounts, reason);
    }

    const missingFlags = missingDetailFlags(entry.item);
    if (missingFlags.missingResponsibilities) increment(missingDataCounts, "missing_responsibilities");
    if (missingFlags.missingExperience) increment(missingDataCounts, "missing_experience");
    if (missingFlags.thinDescription) increment(missingDataCounts, "thin_description_snippet");
  }

  const matcherCandidateExamples = joined
    .filter((entry) => entry.decision.decision === "approve" || entry.tags.some((tag) => matcherFitTags.has(tag)))
    .slice(0, 30)
    .map((entry) => ({
      decision: decisionLabel(entry.decision.decision),
      sourceKind: normalizeSourceKind(entry.item.sourceKind),
      title: entry.item.title,
      companyName: entry.item.companyName,
      tags: entry.tags.filter((tag) => matcherFitTags.has(tag)),
      roleFamily: entry.item.roleFamily,
      matchQuality: entry.item.matchQuality,
      risks: entry.item.risks ?? [],
      reasonsToInspect: entry.item.reasonsToInspect ?? [],
      note: entry.note,
    }));

  const scrapeQaExamples = joined
    .filter((entry) => entry.tags.some((tag) => scrapeTags.has(tag)) || Object.values(missingDetailFlags(entry.item)).some(Boolean))
    .slice(0, 30)
    .map((entry) => ({
      decision: decisionLabel(entry.decision.decision),
      sourceKind: normalizeSourceKind(entry.item.sourceKind),
      sourceName: entry.item.sourceName,
      provider: entry.item.provider,
      title: entry.item.title,
      companyName: entry.item.companyName,
      tags: entry.tags.filter((tag) => scrapeTags.has(tag)),
      missingDetailFlags: missingDetailFlags(entry.item),
      sourceUrl: entry.item.sourceUrl,
      note: entry.note,
    }));

  const summary = {
    exportPath,
    outputPath,
    rulesVersion,
    reviewedExportItems: joined.length,
    totalSavedDecisions: decisions.length,
    exportedSummary: exported.summary ?? {},
    decisionsByValue: Object.fromEntries(decisionsByValue),
    topDecisionSourcePairs: topCounts(decisionsBySourceKind),
    topTags: topCounts(tagsByCount),
    topTagsByDecision: topCounts(tagsByDecision),
    topTagsBySourceKind: topCounts(tagsBySourceKind),
    topFilterReasons: topCounts(filterReasonCounts),
    topRoleFamilies: topCounts(roleFamilyCounts),
    topSources: topCounts(sourceCounts),
    missingDataCounts: Object.fromEntries(missingDataCounts),
    matcherCandidateExamples,
    scrapeQaExamples,
    interpretation: buildInterpretation(joined),
  };

  writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

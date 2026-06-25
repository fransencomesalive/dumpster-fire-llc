import { loadEnvConfig } from "@next/env";
import { writeFileSync } from "node:fs";
import { buildConnectorPlan } from "../app/scans/connectors";
import type { NormalizedConnectorJob } from "../app/scans/connectors";
import { fetchNormalizedConnectorJobs } from "../app/scans/connector-runner";
import { filterConnectorJobsByRelevance } from "../app/scans/relevance";
import type { RelevanceFilterResult } from "../app/scans/relevance";
import { connectedSearchSources, type SearchSourceKind } from "../app/scans/search-sources";
import { getActiveMatchingConfig, getDashboardState } from "../app/scans/store";

const MAX_STRETCH_JOBS_PER_COMPANY = 15;
const TOP_LIMIT = 12;

type CountMap = Record<string, number>;

type MissingDataCounts = {
  missingTitle: number;
  missingCompany: number;
  missingDescription: number;
  shortDescription: number;
  missingLocation: number;
  missingRemoteType: number;
  missingCompensation: number;
  missingSourceUrl: number;
  missingApplyUrl: number;
};

type DiagnosticDecision = RelevanceFilterResult["decisions"][number] & {
  job?: NormalizedConnectorJob;
};

type SourceDiagnostic = {
  companyName: string;
  sourceKind: SearchSourceKind;
  provider: string;
  status: "ready" | "blocked" | "error";
  warnings: string[];
  fetched: number;
  included: number;
  filtered: number;
  duplicatesFiltered: number;
  stretchCapped: number;
  topRejectionReasons: Array<{ reason: string; count: number }>;
  titleFamilyDistribution: Array<{ family: string; count: number }>;
  authorityEvidenceDistribution: Array<{ bucket: string; count: number }>;
  scoreDistribution: Array<{ bucket: string; count: number }>;
  missingData: MissingDataCounts;
  topNearMisses: Array<{
    title: string;
    companyName: string;
    score: number;
    bucket: string;
    roleFamily: string;
    risks: string[];
    positives: string[];
    sourceUrl: string;
  }>;
  includedExamples: Array<{
    title: string;
    companyName: string;
    location: string;
    remoteType: string;
    score: number;
    bucket: string;
    matchQuality: string;
    roleFamily: string;
    risks: string[];
    positives: string[];
    sourceUrl: string;
  }>;
};

function increment(counts: CountMap, key: string, amount = 1) {
  counts[key] = (counts[key] ?? 0) + amount;
}

function countEntries(counts: CountMap, keyName: "reason" | "family" | "bucket", limit = TOP_LIMIT) {
  return Object.entries(counts)
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ [keyName]: key, count })) as Array<Record<typeof keyName, string> & { count: number }>;
}

function emptyMissingDataCounts(): MissingDataCounts {
  return {
    missingTitle: 0,
    missingCompany: 0,
    missingDescription: 0,
    shortDescription: 0,
    missingLocation: 0,
    missingRemoteType: 0,
    missingCompensation: 0,
    missingSourceUrl: 0,
    missingApplyUrl: 0,
  };
}

function missingDataCounts(jobs: NormalizedConnectorJob[]) {
  const counts = emptyMissingDataCounts();

  for (const job of jobs) {
    if (!job.title?.trim()) counts.missingTitle += 1;
    if (!job.companyName?.trim()) counts.missingCompany += 1;
    if (!job.descriptionText?.trim()) counts.missingDescription += 1;
    if (job.descriptionText.trim().length > 0 && job.descriptionText.trim().length < 280) counts.shortDescription += 1;
    if (!job.location?.trim()) counts.missingLocation += 1;
    if (!job.remoteType || job.remoteType === "unclear") counts.missingRemoteType += 1;
    if (!job.salaryText && job.salaryMin == null && job.salaryMax == null) counts.missingCompensation += 1;
    if (!job.sourceUrl?.trim()) counts.missingSourceUrl += 1;
    if (!job.applyUrl?.trim()) counts.missingApplyUrl += 1;
  }

  return counts;
}

function rejectionReasons(decision: DiagnosticDecision) {
  const risks = decision.matchDecision.risks;
  const positives = decision.matchDecision.positives;
  const reasons: string[] = [];

  if (risks.some((risk) => risk.startsWith("hard exclude"))) reasons.push("hard excluded title family");
  if (risks.includes("title family not confirmed")) reasons.push("title family not confirmed");
  if (decision.matchDecision.roleFamily === "unclassified") reasons.push("unclassified role family");
  if (!positives.some((positive) => positive.includes("authority evidence"))) reasons.push("authority evidence not confirmed");
  if (!positives.some((positive) => positive.includes("profile evidence"))) reasons.push("profile evidence not confirmed");
  if (risks.includes("no responsibility/authority evidence")) reasons.push("no responsibility/authority evidence");
  if (risks.some((risk) => risk.includes("negative title signal"))) reasons.push("negative title signal");
  if (risks.some((risk) => risk.includes("negative content signal"))) reasons.push("negative content signal");
  if (risks.some((risk) => risk.includes("qualification mismatch"))) reasons.push("qualification mismatch");
  if (risks.some((risk) => risk.includes("remote status unclear"))) reasons.push("remote status unclear");
  if (risks.some((risk) => risk.includes("onsite location"))) reasons.push("onsite location");
  if (risks.some((risk) => risk.includes("hybrid location"))) reasons.push("hybrid location");
  if (risks.some((risk) => risk.includes("no compensation signal"))) reasons.push("no compensation signal");
  if (risks.some((risk) => risk.includes("compensation may be low"))) reasons.push("compensation may be low");
  if (risks.some((risk) => risk.includes("duplicate of"))) reasons.push("duplicate filtered");
  if (risks.some((risk) => risk.includes("stretch cap"))) reasons.push("stretch cap");
  if (decision.matchDecision.score <= 37 && decision.matchDecision.bucket === "skip") reasons.push("score capped below visible threshold");

  return reasons.length > 0 ? Array.from(new Set(reasons)) : ["low matcher score"];
}

function authorityBucket(decision: DiagnosticDecision) {
  const positives = decision.matchDecision.positives;
  if (positives.some((positive) => positive.includes("authority evidence"))) return "confirmed";
  if (positives.some((positive) => positive.includes("some authority evidence"))) return "partial";
  if (decision.matchDecision.risks.includes("no responsibility/authority evidence")) return "absent";
  return "not surfaced";
}

function scoreBucket(score: number) {
  if (score >= 82) return "82-100";
  if (score >= 68) return "68-81";
  if (score >= 50) return "50-67";
  if (score >= 38) return "38-49";
  if (score >= 30) return "30-37";
  return "0-29";
}

function nearMisses(decisions: DiagnosticDecision[]) {
  return decisions
    .filter((decision) => !decision.included)
    .sort((first, second) => second.matchDecision.score - first.matchDecision.score || first.title.localeCompare(second.title))
    .slice(0, TOP_LIMIT)
    .map((decision) => ({
      title: decision.title,
      companyName: decision.job?.companyName || "",
      score: decision.matchDecision.score,
      bucket: decision.matchDecision.bucket,
      roleFamily: decision.matchDecision.roleFamily,
      risks: decision.matchDecision.risks.slice(0, 6),
      positives: decision.matchDecision.positives.slice(0, 5),
      sourceUrl: decision.job?.sourceUrl || "",
    }));
}

function includedExamples(decisions: DiagnosticDecision[]) {
  return decisions
    .filter((decision) => decision.included)
    .sort((first, second) => second.matchDecision.score - first.matchDecision.score || first.title.localeCompare(second.title))
    .slice(0, TOP_LIMIT)
    .map((decision) => ({
      title: decision.title,
      companyName: decision.job?.companyName || "",
      location: decision.job?.location || "",
      remoteType: decision.job?.remoteType || "unclear",
      score: decision.matchDecision.score,
      bucket: decision.matchDecision.bucket,
      matchQuality: decision.matchDecision.matchQuality,
      roleFamily: decision.matchDecision.roleFamily,
      risks: decision.matchDecision.risks.slice(0, 6),
      positives: decision.matchDecision.positives.slice(0, 5),
      sourceUrl: decision.job?.sourceUrl || "",
    }));
}

function sourceDiagnostic(input: {
  companyName: string;
  sourceKind: SearchSourceKind;
  provider: string;
  status: "ready" | "blocked" | "error";
  warnings: string[];
  jobs: NormalizedConnectorJob[];
  relevance?: RelevanceFilterResult;
}): SourceDiagnostic {
  const decisions: DiagnosticDecision[] = input.relevance
    ? input.relevance.decisions.map((decision) => ({
      ...decision,
      job: input.jobs.find((job) => job.externalJobId === decision.externalJobId),
    }))
    : [];
  const rejectionCounts: CountMap = {};
  const titleFamilyCounts: CountMap = {};
  const authorityCounts: CountMap = {};
  const scoreCounts: CountMap = {};

  for (const decision of decisions) {
    increment(titleFamilyCounts, decision.matchDecision.roleFamily);
    increment(authorityCounts, authorityBucket(decision));
    increment(scoreCounts, scoreBucket(decision.matchDecision.score));
    if (!decision.included) {
      for (const reason of rejectionReasons(decision)) increment(rejectionCounts, reason);
    }
  }

  return {
    companyName: input.companyName,
    sourceKind: input.sourceKind,
    provider: input.provider,
    status: input.status,
    warnings: input.warnings,
    fetched: input.jobs.length,
    included: input.relevance?.relevantJobs.length ?? 0,
    filtered: input.relevance?.filteredOut ?? 0,
    duplicatesFiltered: input.relevance?.duplicatesFiltered ?? 0,
    stretchCapped: input.relevance?.stretchCapped ?? 0,
    topRejectionReasons: countEntries(rejectionCounts, "reason"),
    titleFamilyDistribution: countEntries(titleFamilyCounts, "family"),
    authorityEvidenceDistribution: countEntries(authorityCounts, "bucket"),
    scoreDistribution: countEntries(scoreCounts, "bucket"),
    missingData: missingDataCounts(input.jobs),
    topNearMisses: nearMisses(decisions),
    includedExamples: includedExamples(decisions),
  };
}

function addMissingData(total: MissingDataCounts, next: MissingDataCounts) {
  for (const key of Object.keys(total) as Array<keyof MissingDataCounts>) {
    total[key] += next[key];
  }
}

function aggregateDiagnostics(sources: SourceDiagnostic[]) {
  const rejectionCounts: CountMap = {};
  const titleFamilyCounts: CountMap = {};
  const authorityCounts: CountMap = {};
  const scoreCounts: CountMap = {};
  const missingData = emptyMissingDataCounts();

  for (const source of sources) {
    for (const item of source.topRejectionReasons) increment(rejectionCounts, item.reason, item.count);
    for (const item of source.titleFamilyDistribution) increment(titleFamilyCounts, item.family, item.count);
    for (const item of source.authorityEvidenceDistribution) increment(authorityCounts, item.bucket, item.count);
    for (const item of source.scoreDistribution) increment(scoreCounts, item.bucket, item.count);
    addMissingData(missingData, source.missingData);
  }

  const allNearMisses = sources
    .flatMap((source) => source.topNearMisses.map((nearMiss) => ({
      ...nearMiss,
      source: source.companyName,
      sourceKind: source.sourceKind,
    })))
    .sort((first, second) => second.score - first.score || first.title.localeCompare(second.title))
    .slice(0, TOP_LIMIT);

  return {
    topRejectionReasons: countEntries(rejectionCounts, "reason", 20),
    titleFamilyDistribution: countEntries(titleFamilyCounts, "family", 20),
    authorityEvidenceDistribution: countEntries(authorityCounts, "bucket", 20),
    scoreDistribution: countEntries(scoreCounts, "bucket", 20),
    missingData,
    topNearMisses: allNearMisses,
  };
}

async function main() {
  loadEnvConfig(process.cwd());

  const dashboard = await getDashboardState();
  const activeMatching = await getActiveMatchingConfig();
  const searchSources = connectedSearchSources(dashboard.companies, dashboard.searchProfile);
  const diagnostics: SourceDiagnostic[] = [];

  for (const { company, sourceKind } of searchSources.sources) {
    const plan = buildConnectorPlan(company);

    if (!plan.canPreview || !plan.endpointUrl) {
      diagnostics.push(sourceDiagnostic({
        companyName: company.companyName,
        sourceKind,
        provider: company.atsProvider,
        status: "blocked",
        warnings: plan.warnings,
        jobs: [],
      }));
      continue;
    }

    try {
      const jobs = await fetchNormalizedConnectorJobs(company);
      const relevance = filterConnectorJobsByRelevance(jobs, company, dashboard.searchProfile, {
        matchingConfig: activeMatching.matchingConfig,
        maxStretchJobsPerCompany: MAX_STRETCH_JOBS_PER_COMPANY,
      });

      diagnostics.push(sourceDiagnostic({
        companyName: company.companyName,
        sourceKind,
        provider: company.atsProvider,
        status: "ready",
        warnings: [],
        jobs,
        relevance,
      }));
    } catch (error) {
      diagnostics.push(sourceDiagnostic({
        companyName: company.companyName,
        sourceKind,
        provider: company.atsProvider,
        status: "error",
        warnings: [error instanceof Error ? error.message : "Unable to fetch source."],
        jobs: [],
      }));
    }
  }

  const report = {
    persistence: dashboard.persistence,
    matchingConfigSource: activeMatching.source,
    matchingRulesVersion: activeMatching.matchingConfig.rulesVersion,
    sourceCoverage: searchSources.summary,
    fetched: diagnostics.reduce((sum, source) => sum + source.fetched, 0),
    included: diagnostics.reduce((sum, source) => sum + source.included, 0),
    filtered: diagnostics.reduce((sum, source) => sum + source.filtered, 0),
    duplicatesFiltered: diagnostics.reduce((sum, source) => sum + source.duplicatesFiltered, 0),
    stretchCapped: diagnostics.reduce((sum, source) => sum + source.stretchCapped, 0),
    ready: diagnostics.filter((source) => source.status === "ready").length,
    blocked: diagnostics.filter((source) => source.status === "blocked").length,
    errors: diagnostics.filter((source) => source.status === "error").length,
    aggregate: aggregateDiagnostics(diagnostics),
    sources: diagnostics,
  };
  const reportPath = process.env.DUMPSTER_FIRE_MATCHING_DIAGNOSTIC_PATH || "/private/tmp/scans-matching-diagnostic.json";

  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (process.env.DUMPSTER_FIRE_MATCHING_DIAGNOSTIC_STDOUT === "full") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(JSON.stringify({
      reportPath,
      persistence: report.persistence,
      matchingConfigSource: report.matchingConfigSource,
      matchingRulesVersion: report.matchingRulesVersion,
      sourceCoverage: report.sourceCoverage,
      fetched: report.fetched,
      included: report.included,
      filtered: report.filtered,
      duplicatesFiltered: report.duplicatesFiltered,
      stretchCapped: report.stretchCapped,
      ready: report.ready,
      blocked: report.blocked,
      errors: report.errors,
      aggregate: {
        topRejectionReasons: report.aggregate.topRejectionReasons.slice(0, 10),
        titleFamilyDistribution: report.aggregate.titleFamilyDistribution.slice(0, 10),
        authorityEvidenceDistribution: report.aggregate.authorityEvidenceDistribution,
        scoreDistribution: report.aggregate.scoreDistribution,
        missingData: report.aggregate.missingData,
        topNearMisses: report.aggregate.topNearMisses.slice(0, 8),
      },
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

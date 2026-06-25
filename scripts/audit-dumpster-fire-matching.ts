import { loadEnvConfig } from "@next/env";
import { auditMatches } from "../app/scans/match-audit";
import { connectedSearchSources } from "../app/scans/search-sources";
import { getActiveMatchingConfig, getDashboardState } from "../app/scans/store";
import type { JobStatus } from "../app/scans/types";

loadEnvConfig(process.cwd());

function countJobStatuses(statuses: JobStatus[]) {
  return statuses.reduce((counts, status) => {
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {} as Partial<Record<JobStatus, number>>);
}

async function main() {
  const dashboard = await getDashboardState();
  const activeMatching = await getActiveMatchingConfig();
  const searchSources = connectedSearchSources(dashboard.companies, dashboard.searchProfile);
  const audit = auditMatches(dashboard.jobs, dashboard.searchProfile);
  const todayRows = audit.rows
    .filter((row) => row.status === "new" || row.status === "saved")
    .sort((a, b) => b.persistedScore - a.persistedScore);
  const rowsToReview = audit.rows
    .filter((row) => row.auditStatus !== "included" && row.auditStatus !== "inactive")
    .sort((a, b) => {
      if (a.auditStatus === b.auditStatus) return b.persistedScore - a.persistedScore;
      return a.auditStatus.localeCompare(b.auditStatus);
    });
  const includedRows = audit.rows
    .filter((row) => row.auditStatus === "included")
    .sort((a, b) => b.decision.score - a.decision.score);

  const compactRow = (row: typeof audit.rows[number]) => ({
    status: row.auditStatus,
    title: row.title,
    companyName: row.companyName,
    persistedScore: row.persistedScore,
    newScore: row.decision.score,
    roleFamily: row.decision.roleFamily,
    confidence: row.decision.confidence,
    rulesVersion: row.decision.rulesVersion,
    risks: row.decision.risks.slice(0, 4),
    positives: row.decision.positives.slice(0, 4),
    duplicateCount: row.duplicateCount,
  });

  console.log(JSON.stringify({
    persistence: dashboard.persistence,
    matchingConfigSource: activeMatching.source,
    matchingRulesVersion: activeMatching.matchingConfig.rulesVersion,
    sourceCoverage: searchSources.summary,
    totalJobs: audit.totalJobs,
    jobStatusCounts: countJobStatuses(dashboard.jobs.map((job) => job.status)),
    activeJobs: audit.activeJobs,
    includedActive: audit.includedActive,
    excludedActive: audit.excludedActive,
    lowConfidenceActive: audit.lowConfidenceActive,
    duplicateCandidates: audit.duplicateCandidates,
    todayBestMatches: {
      total: todayRows.length,
      included: todayRows.filter((row) => row.auditStatus === "included").length,
      excluded: todayRows.filter((row) => row.auditStatus === "excluded_active").length,
      lowConfidence: todayRows.filter((row) => row.auditStatus === "low_confidence_active").length,
      duplicateCandidates: todayRows.filter((row) => row.auditStatus === "duplicate_candidate").length,
      sample: todayRows.slice(0, 12).map(compactRow),
    },
    exclusionFamilies: audit.exclusionFamilies.slice(0, 20),
    duplicateGroups: audit.duplicateGroups.slice(0, 20),
    includedSample: includedRows.slice(0, 10).map(compactRow),
    reviewSample: rowsToReview.slice(0, 25).map(compactRow),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

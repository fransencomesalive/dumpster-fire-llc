import { duplicateKeyForJob } from "./dedupe";
import { evaluateJobMatch, type MatchDecision } from "./matching";
import type { Job, UserSearchProfile } from "./types";

export type MatchAuditStatus =
  | "included"
  | "excluded_active"
  | "low_confidence_active"
  | "duplicate_candidate"
  | "inactive";

export type MatchAuditRow = {
  jobId: string;
  title: string;
  companyName: string;
  status: Job["status"];
  persistedScore: number;
  decision: MatchDecision;
  auditStatus: MatchAuditStatus;
  duplicateKey: string;
  duplicateCount: number;
};

export type MatchAuditDuplicateGroup = {
  duplicateKey: string;
  count: number;
  jobs: Array<Pick<MatchAuditRow, "jobId" | "title" | "companyName" | "status" | "persistedScore" | "auditStatus">>;
};

export type MatchAuditSummary = {
  totalJobs: number;
  activeJobs: number;
  includedActive: number;
  excludedActive: number;
  lowConfidenceActive: number;
  duplicateCandidates: number;
  exclusionFamilies: Array<{ family: string; count: number }>;
  duplicateGroups: MatchAuditDuplicateGroup[];
  rows: MatchAuditRow[];
};

const activeStatuses = new Set<Job["status"]>(["new", "reviewed", "saved"]);

function exclusionFamilyForRow(row: MatchAuditRow) {
  const hardExclude = row.decision.risks.find((risk) => risk.startsWith("hard exclude title family: "));
  if (hardExclude) return hardExclude.replace("hard exclude title family: ", "");
  if (row.decision.risks.includes("do-not-apply company")) return "do-not-apply company";
  if (row.decision.risks.includes("title family not confirmed")) return "unconfirmed title family";
  if (row.auditStatus === "duplicate_candidate") return "duplicate candidate";
  return row.decision.roleFamily || "unknown";
}

export function auditMatches(jobs: Job[], profile: UserSearchProfile): MatchAuditSummary {
  const duplicateCounts = jobs.reduce((counts, job) => {
    const key = duplicateKeyForJob(job);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  const rows = jobs.map((job): MatchAuditRow => {
    const decision = evaluateJobMatch(job, profile);
    const isActive = activeStatuses.has(job.status);
    const duplicateKey = duplicateKeyForJob(job);
    const duplicateCount = duplicateCounts.get(duplicateKey) ?? 1;
    const auditStatus: MatchAuditStatus = !isActive
      ? "inactive"
      : duplicateCount > 1
        ? "duplicate_candidate"
        : !decision.included
          ? "excluded_active"
          : decision.confidence === "low"
            ? "low_confidence_active"
            : "included";

    return {
      jobId: job.id,
      title: job.title,
      companyName: job.companyName,
      status: job.status,
      persistedScore: job.fitScore,
      decision,
      auditStatus,
      duplicateKey,
      duplicateCount,
    };
  });

  const activeRows = rows.filter((row) => activeStatuses.has(row.status));
  const excludedActiveRows = activeRows.filter((row) => row.auditStatus === "excluded_active");
  const duplicateGroups = Array.from(
    rows.reduce((groups, row) => {
      if (row.duplicateCount <= 1) return groups;
      const group = groups.get(row.duplicateKey) ?? [];
      group.push(row);
      groups.set(row.duplicateKey, group);
      return groups;
    }, new Map<string, MatchAuditRow[]>())
  ).map(([duplicateKey, groupRows]) => ({
    duplicateKey,
    count: groupRows.length,
    jobs: groupRows.map((row) => ({
      jobId: row.jobId,
      title: row.title,
      companyName: row.companyName,
      status: row.status,
      persistedScore: row.persistedScore,
      auditStatus: row.auditStatus,
    })),
  })).sort((a, b) => b.count - a.count);
  const exclusionFamilies = Array.from(
    excludedActiveRows.reduce((families, row) => {
      const family = exclusionFamilyForRow(row);
      families.set(family, (families.get(family) ?? 0) + 1);
      return families;
    }, new Map<string, number>())
  ).map(([family, count]) => ({ family, count })).sort((a, b) => b.count - a.count);

  return {
    totalJobs: jobs.length,
    activeJobs: activeRows.length,
    includedActive: activeRows.filter((row) => row.auditStatus === "included").length,
    excludedActive: excludedActiveRows.length,
    lowConfidenceActive: activeRows.filter((row) => row.auditStatus === "low_confidence_active").length,
    duplicateCandidates: activeRows.filter((row) => row.auditStatus === "duplicate_candidate").length,
    exclusionFamilies,
    duplicateGroups,
    rows,
  };
}

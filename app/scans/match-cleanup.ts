import type { MatchAuditRow } from "./match-audit";
import type { Job } from "./types";

export type MatchCleanupReason =
  | "excluded_by_matcher"
  | "duplicate_extra";

export type MatchCleanupPlanRow = {
  jobId: string;
  title: string;
  companyName: string;
  currentStatus: Job["status"];
  persistedScore: number;
  newScore: number;
  roleFamily: string;
  confidence: MatchAuditRow["decision"]["confidence"];
  reason: MatchCleanupReason;
  risks: string[];
};

export type MatchCleanupPlan = {
  archiveCount: number;
  rows: MatchCleanupPlanRow[];
};

const activeStatuses = new Set<Job["status"]>(["new", "reviewed", "saved"]);

export function buildMatchCleanupPlan(rows: MatchAuditRow[]): MatchCleanupPlan {
  const includedDuplicateKeepers = new Map<string, MatchAuditRow>();

  for (const row of rows) {
    if (!activeStatuses.has(row.status) || !row.decision.included || row.duplicateCount <= 1) {
      continue;
    }

    const current = includedDuplicateKeepers.get(row.duplicateKey);
    if (!current || row.decision.score > current.decision.score || row.persistedScore > current.persistedScore) {
      includedDuplicateKeepers.set(row.duplicateKey, row);
    }
  }

  const planRows = rows.flatMap((row): MatchCleanupPlanRow[] => {
    if (!activeStatuses.has(row.status)) return [];

    const shouldArchiveExcluded = !row.decision.included;
    const duplicateKeeper = includedDuplicateKeepers.get(row.duplicateKey);
    const shouldArchiveDuplicate = Boolean(
      row.decision.included &&
      row.duplicateCount > 1 &&
      duplicateKeeper &&
      duplicateKeeper.jobId !== row.jobId
    );

    if (!shouldArchiveExcluded && !shouldArchiveDuplicate) return [];

    return [{
      jobId: row.jobId,
      title: row.title,
      companyName: row.companyName,
      currentStatus: row.status,
      persistedScore: row.persistedScore,
      newScore: row.decision.score,
      roleFamily: row.decision.roleFamily,
      confidence: row.decision.confidence,
      reason: shouldArchiveExcluded ? "excluded_by_matcher" : "duplicate_extra",
      risks: row.decision.risks,
    }];
  }).sort((a, b) => {
    if (a.reason === b.reason) return b.persistedScore - a.persistedScore;
    return a.reason.localeCompare(b.reason);
  });

  return {
    archiveCount: planRows.length,
    rows: planRows,
  };
}

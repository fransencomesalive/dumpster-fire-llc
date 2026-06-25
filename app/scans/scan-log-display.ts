import type { ScanLog } from "./types";

export type DisplayScanLog = ScanLog & { sourceLogCount?: number };

function isLegacySourceLog(log: ScanLog) {
  return log.companiesScanned === 1;
}

export function groupedScanLogsForDisplay(scanLogs: ScanLog[]) {
  const grouped: DisplayScanLog[] = [];

  for (const log of scanLogs) {
    const current = grouped[grouped.length - 1];
    const logTime = new Date(log.completedAt).getTime();
    const currentTime = current ? new Date(current.completedAt).getTime() : 0;
    const canGroupLegacySourceRows = (
      current &&
      isLegacySourceLog(log) &&
      isLegacySourceLog(current) &&
      Number.isFinite(logTime) &&
      Number.isFinite(currentTime) &&
      Math.abs(currentTime - logTime) <= 90_000
    );

    if (canGroupLegacySourceRows) {
      current.id = `${current.id}+${log.id}`;
      current.startedAt = log.startedAt < current.startedAt ? log.startedAt : current.startedAt;
      current.status = current.status === "completed" && log.status === "completed" ? "completed" : "completed_with_errors";
      current.companiesScanned += log.companiesScanned;
      current.jobsFound += log.jobsFound;
      current.newJobsAdded += log.newJobsAdded;
      current.jobsUpdated += log.jobsUpdated;
      current.jobsClosed += log.jobsClosed;
      current.errors = [...current.errors, ...log.errors];
      current.sourceLogCount = (current.sourceLogCount ?? 1) + 1;
    } else {
      grouped.push({ ...log, sourceLogCount: 1 });
    }
  }

  return grouped;
}

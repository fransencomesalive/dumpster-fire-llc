import assert from "node:assert/strict";
import { groupedScanLogsForDisplay } from "../app/scans/scan-log-display.ts";

const baseLog = {
  startedAt: "2026-06-22T21:00:00.000Z",
  completedAt: "2026-06-22T21:00:00.000Z",
  status: "completed",
  jobsFound: 0,
  newJobsAdded: 0,
  jobsUpdated: 0,
  jobsClosed: 0,
  errors: [],
};

const logs = [
  { ...baseLog, id: "modern", companiesScanned: 90, completedAt: "2026-06-22T21:02:00.000Z" },
  { ...baseLog, id: "legacy-a", companiesScanned: 1, completedAt: "2026-06-22T21:01:20.000Z", jobsFound: 3 },
  { ...baseLog, id: "legacy-b", companiesScanned: 1, completedAt: "2026-06-22T21:01:00.000Z", jobsFound: 2 },
  { ...baseLog, id: "older", companiesScanned: 1, completedAt: "2026-06-22T20:55:00.000Z", jobsFound: 1 },
];

const grouped = groupedScanLogsForDisplay(logs);

assert.equal(grouped.length, 3);
assert.equal(grouped[0].id, "modern");
assert.equal(grouped[0].companiesScanned, 90);
assert.equal(grouped[1].id, "legacy-a+legacy-b");
assert.equal(grouped[1].companiesScanned, 2);
assert.equal(grouped[1].jobsFound, 5);
assert.equal(grouped[2].id, "older");

console.log("dumpster-fire scan-log display grouping: all assertions passed");

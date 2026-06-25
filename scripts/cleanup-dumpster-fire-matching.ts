import { loadEnvConfig } from "@next/env";
import { buildMatchCleanupPlan } from "../app/scans/match-cleanup";
import { auditMatches } from "../app/scans/match-audit";
import { getDashboardState, updateJobStatus } from "../app/scans/store";

const confirmationPhrase = "ARCHIVE MATCHING AUDIT EXCLUSIONS";

loadEnvConfig(process.cwd());

async function main() {
  const apply = process.argv.includes("--apply");
  const todayOnly = process.argv.includes("--today-only");
  const confirmIndex = process.argv.indexOf("--confirm");
  const confirmation = confirmIndex >= 0 ? process.argv[confirmIndex + 1] : "";
  const dashboard = await getDashboardState();
  const audit = auditMatches(dashboard.jobs, dashboard.searchProfile);
  const plan = buildMatchCleanupPlan(audit.rows);
  const rows = todayOnly
    ? plan.rows.filter((row) => row.currentStatus === "new" || row.currentStatus === "saved")
    : plan.rows;

  if (!apply) {
    console.log(JSON.stringify({
      mode: "dry_run",
      scope: todayOnly ? "today_best_matches" : "all_active_review_states",
      persistence: dashboard.persistence,
      archiveCount: rows.length,
      sample: rows.slice(0, 50),
      applyCommand: `node scripts/run-dumpster-fire-matching-cleanup.mjs${todayOnly ? " --today-only" : ""} --apply --confirm "${confirmationPhrase}"`,
    }, null, 2));
    return;
  }

  if (confirmation !== confirmationPhrase) {
    console.log(JSON.stringify({
      mode: "blocked",
      error: "Exact confirmation phrase required.",
      requiredConfirmation: confirmationPhrase,
      archiveCount: rows.length,
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  const archived: string[] = [];
  for (const row of rows) {
    await updateJobStatus(row.jobId, "archived");
    archived.push(row.jobId);
  }

  console.log(JSON.stringify({
    mode: "applied",
    scope: todayOnly ? "today_best_matches" : "all_active_review_states",
    persistence: dashboard.persistence,
    archivedCount: archived.length,
    archived,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { loadEnvConfig } from "@next/env";
import { summarizeMatchLearning } from "../app/scans/match-learning";
import { getDashboardState } from "../app/scans/store";

loadEnvConfig(process.cwd());

async function main() {
  const dashboard = await getDashboardState();
  const summary = summarizeMatchLearning({
    feedback: dashboard.matchFeedback,
    jobs: dashboard.jobs,
    scanLogs: dashboard.scanLogs,
  });

  console.log(JSON.stringify({
    persistence: dashboard.persistence,
    ready: summary.ready,
    completedScansSinceFirstFeedback: summary.completedScansSinceFirstFeedback,
    scansRemaining: summary.scansRemaining,
    poorRatings: summary.poorRatings,
    strongRatings: summary.strongRatings,
    signals: summary.signals,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getJobSearchAuthState } from "../../auth";
import { summarizeConnectorFetch } from "../../connector-runner";
import { getActiveMatchingConfig, getDashboardState } from "../../store";

async function requireScheduledScanAuth(request: Request) {
  const scanSecret = process.env.JOB_SEARCH_SCAN_SECRET;
  const providedSecret = request.headers.get("x-dumpster-fire-scan-secret");

  if (scanSecret && providedSecret === scanSecret) {
    return null;
  }

  const authState = getJobSearchAuthState(await cookies());
  if (!authState.authenticated) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  return null;
}

export async function POST(request: Request) {
  const authError = await requireScheduledScanAuth(request);
  if (authError) return authError;

  const dashboard = await getDashboardState();

  if (!dashboard.settings.scanEnabled) {
    return NextResponse.json({
      skipped: true,
      reason: "Scheduled scans are disabled.",
      writesEnabled: false,
    });
  }

  const activeCompanies = dashboard.companies
    .filter((company) => company.status === "active")
    .slice(0, dashboard.settings.maxRolesPerScan);
  const activeMatching = await getActiveMatchingConfig();
  const results = await Promise.all(
    activeCompanies.map((company) => summarizeConnectorFetch(company, dashboard.jobs, dashboard.searchProfile, activeMatching.matchingConfig))
  );

  return NextResponse.json({
    skipped: false,
    mode: "preview_only",
    cadence: dashboard.settings.scanCadence,
    checkedCompanies: activeCompanies.length,
    matchingConfigSource: activeMatching.source,
    matchingRulesVersion: activeMatching.matchingConfig.rulesVersion,
    results,
    ready: results.filter((result) => result.status === "ready").length,
    blocked: results.filter((result) => result.status === "blocked").length,
    errors: results.filter((result) => result.status === "error").length,
    totalFetched: results.reduce((total, result) => total + result.totalFetched, 0),
    totalRelevant: results.reduce((total, result) => total + result.totalRelevant, 0),
    filteredOut: results.reduce((total, result) => total + result.filteredOut, 0),
    newJobs: results.reduce((total, result) => total + result.newJobs, 0),
    existingJobs: results.reduce((total, result) => total + result.existingJobs, 0),
    writesEnabled: false,
  });
}

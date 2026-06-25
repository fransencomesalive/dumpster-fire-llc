import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getJobSearchAuthState } from "../../auth";
import { summarizeConnectorFetch } from "../../connector-runner";
import { getActiveMatchingConfig, getDashboardState } from "../../store";

async function requireDigestPreviewAuth() {
  const authState = getJobSearchAuthState(await cookies());
  if (!authState.authenticated) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return null;
}

export async function POST() {
  const authError = await requireDigestPreviewAuth();
  if (authError) return authError;

  const dashboard = await getDashboardState();
  const activeMatching = await getActiveMatchingConfig();
  const activeCompanies = dashboard.companies.filter((company) => company.status === "active");
  const scanPreview = dashboard.settings.scanEnabled
    ? await Promise.all(activeCompanies.map((company) => summarizeConnectorFetch(company, dashboard.jobs, dashboard.searchProfile, activeMatching.matchingConfig)))
    : [];
  const activeJobs = dashboard.jobs
    .filter((job) => job.status === "new" || job.status === "saved" || job.status === "reviewed")
    .sort((a, b) => b.fitScore - a.fitScore);
  const topJobs = activeJobs.slice(0, 5).map((job) => ({
    id: job.id,
    title: job.title,
    companyName: job.companyName,
    fitScore: job.fitScore,
    status: job.status,
    recommendedAction: job.recommendedAction,
  }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    digestEnabled: dashboard.settings.digestEnabled,
    digestCadence: dashboard.settings.digestCadence,
    digestTime: dashboard.settings.digestTime,
    scanPreviewMode: "preview_only",
    matchingConfigSource: activeMatching.source,
    matchingRulesVersion: activeMatching.matchingConfig.rulesVersion,
    scanPreview,
    counts: {
      activeCompanies: activeCompanies.length,
      activeJobs: activeJobs.length,
      strong: activeJobs.filter((job) => job.fitBucket === "A").length,
      medium: activeJobs.filter((job) => job.fitBucket === "B").length,
      possible: activeJobs.filter((job) => job.fitBucket === "C").length,
      blockedSources: scanPreview.filter((result) => result.status === "blocked").length,
      sourceErrors: scanPreview.filter((result) => result.status === "error").length,
    },
    topJobs,
    writesEnabled: false,
    emailEnabled: false,
  });
}

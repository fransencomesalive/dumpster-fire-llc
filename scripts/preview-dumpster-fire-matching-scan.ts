import { loadEnvConfig } from "@next/env";
import { buildConnectorPlan } from "../app/scans/connectors";
import { fetchNormalizedConnectorJobs } from "../app/scans/connector-runner";
import { filterConnectorJobsByRelevance } from "../app/scans/relevance";
import { connectedSearchSources } from "../app/scans/search-sources";
import { getActiveMatchingConfig, getDashboardState } from "../app/scans/store";

const MAX_STRETCH_JOBS_PER_COMPANY = 15;

loadEnvConfig(process.cwd());

async function main() {
  const dashboard = await getDashboardState();
  const activeMatching = await getActiveMatchingConfig();
  const searchSources = connectedSearchSources(dashboard.companies, dashboard.searchProfile);
  const results = [];

  for (const { company, sourceKind } of searchSources.sources) {
    const plan = buildConnectorPlan(company);

    if (!plan.canPreview || !plan.endpointUrl) {
      results.push({
        companyName: company.companyName,
        sourceKind,
        provider: company.atsProvider,
        status: "blocked",
        warnings: plan.warnings,
        fetched: 0,
        included: 0,
        filteredOut: 0,
        duplicatesFiltered: 0,
        stretchCapped: 0,
        includedJobs: [],
      });
      continue;
    }

    try {
      const normalizedJobs = await fetchNormalizedConnectorJobs(company);
      const relevance = filterConnectorJobsByRelevance(normalizedJobs, company, dashboard.searchProfile, {
        matchingConfig: activeMatching.matchingConfig,
        maxStretchJobsPerCompany: MAX_STRETCH_JOBS_PER_COMPANY,
      });
      results.push({
        companyName: company.companyName,
        sourceKind,
        provider: company.atsProvider,
        status: "ready",
        warnings: [],
        fetched: normalizedJobs.length,
        included: relevance.relevantJobs.length,
        filteredOut: relevance.filteredOut,
        duplicatesFiltered: relevance.duplicatesFiltered,
        stretchCapped: relevance.stretchCapped,
        includedJobs: relevance.relevantJobs.slice(0, 12).map((job) => ({
          title: job.title,
          location: job.location,
          remoteType: job.remoteType,
          sourceUrl: job.sourceUrl,
          matchQuality: relevance.decisions.find((decision) => decision.externalJobId === job.externalJobId)?.matchDecision.matchQuality,
          bucket: relevance.decisions.find((decision) => decision.externalJobId === job.externalJobId)?.matchDecision.bucket,
          fitSummary: relevance.decisions.find((decision) => decision.externalJobId === job.externalJobId)?.matchDecision.fitSummary,
        })),
      });
    } catch (error) {
      results.push({
        companyName: company.companyName,
        sourceKind,
        provider: company.atsProvider,
        status: "error",
        warnings: [error instanceof Error ? error.message : "Unable to fetch source."],
        fetched: 0,
        included: 0,
        filteredOut: 0,
        duplicatesFiltered: 0,
        stretchCapped: 0,
        includedJobs: [],
      });
    }
  }

  console.log(JSON.stringify({
    persistence: dashboard.persistence,
    matchingConfigSource: activeMatching.source,
    matchingRulesVersion: activeMatching.matchingConfig.rulesVersion,
    sourceCoverage: searchSources.summary,
    companiesChecked: searchSources.sources.length,
    fetched: results.reduce((sum, result) => sum + result.fetched, 0),
    included: results.reduce((sum, result) => sum + result.included, 0),
    filteredOut: results.reduce((sum, result) => sum + result.filteredOut, 0),
    duplicatesFiltered: results.reduce((sum, result) => sum + result.duplicatesFiltered, 0),
    stretchCapped: results.reduce((sum, result) => sum + result.stretchCapped, 0),
    ready: results.filter((result) => result.status === "ready").length,
    blocked: results.filter((result) => result.status === "blocked").length,
    errors: results.filter((result) => result.status === "error").length,
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

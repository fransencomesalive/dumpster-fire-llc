import { loadEnvConfig } from "@next/env";
import { fetchNormalizedConnectorJobs } from "../app/scans/connector-runner";
import { evaluateConnectorJobRelevance } from "../app/scans/relevance";
import { connectedSearchSources } from "../app/scans/search-sources";
import { getActiveMatchingConfig, getDashboardState } from "../app/scans/store";

loadEnvConfig(process.cwd());

async function main() {
  const dashboard = await getDashboardState();
  const activeMatching = await getActiveMatchingConfig();
  const searchSources = connectedSearchSources(dashboard.companies, dashboard.searchProfile);
  const samples = [];

  for (const { company, sourceKind } of searchSources.broadSources) {
    try {
      const jobs = await fetchNormalizedConnectorJobs(company);
      const evaluated = jobs
        .map((job) => ({
          job,
          decision: evaluateConnectorJobRelevance(job, company, dashboard.searchProfile, activeMatching.matchingConfig).matchDecision,
        }))
        .sort((a, b) => b.decision.score - a.decision.score)
        .slice(0, 12);

      samples.push({
        companyName: company.companyName,
        sourceKind,
        status: "ready",
        fetched: jobs.length,
        topCandidates: evaluated.map(({ job, decision }) => ({
          title: job.title,
          companyName: job.companyName,
          location: job.location,
          sourceUrl: job.sourceUrl,
          included: decision.included,
          score: decision.score,
          bucket: decision.bucket,
          matchQuality: decision.matchQuality,
          roleFamily: decision.roleFamily,
          positives: decision.positives,
          risks: decision.risks,
        })),
      });
    } catch (error) {
      samples.push({
        companyName: company.companyName,
        sourceKind,
        status: "error",
        fetched: 0,
        warnings: [error instanceof Error ? error.message : "Unable to fetch source."],
        topCandidates: [],
      });
    }
  }

  console.log(JSON.stringify({
    sourceCoverage: searchSources.summary,
    samples,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

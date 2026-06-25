import { loadEnvConfig } from "@next/env";
import { buildConnectorPlan } from "../app/scans/connectors";
import { fetchNormalizedConnectorJobs } from "../app/scans/connector-runner";
import {
  buildNearMissReviewItem,
  buildSourceCalibrationReviewItem,
  filterUnreviewedNearMissReviewItems,
  selectBalancedNearMissReviewItems,
} from "../app/scans/near-miss-review";
import { evaluateConnectorJobRelevance } from "../app/scans/relevance";
import { connectedSearchSources } from "../app/scans/search-sources";
import { getActiveMatchingConfig, getDashboardState, getNearMissReviewDecisions } from "../app/scans/store";

loadEnvConfig(process.cwd());

const limit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.replace("--limit=", "") ?? 40);
const MIN_REVIEW_CANDIDATES_PER_READY_SOURCE = 7;

async function main() {
  const dashboard = await getDashboardState();
  const activeMatching = await getActiveMatchingConfig();
  const decisions = await getNearMissReviewDecisions();
  const searchSources = connectedSearchSources(dashboard.companies, dashboard.searchProfile);
  const reviewItems = [];
  const sourceSummaries = [];

  for (const { company, sourceKind } of searchSources.sources) {
    const plan = buildConnectorPlan(company);

    if (!plan.canPreview || !plan.endpointUrl) {
      sourceSummaries.push({
        companyName: company.companyName,
        sourceKind,
        provider: company.atsProvider,
        status: "blocked",
        warnings: plan.warnings,
        fetched: 0,
        nearMisses: 0,
      });
      continue;
    }

    try {
      const normalizedJobs = await fetchNormalizedConnectorJobs(company);
      let nearMissesForSource = 0;
      const sourceReviewItems = [];
      const calibrationCandidates = [];

      for (const job of normalizedJobs) {
        const relevance = evaluateConnectorJobRelevance(job, company, dashboard.searchProfile, activeMatching.matchingConfig);
        const reviewItem = buildNearMissReviewItem({
          companyName: company.companyName,
          provider: company.atsProvider,
          job,
          decision: relevance.matchDecision,
        });

        if (reviewItem) {
          nearMissesForSource += 1;
          sourceReviewItems.push(reviewItem);
          reviewItems.push(reviewItem);
        } else {
          const calibrationItem = buildSourceCalibrationReviewItem({
            companyName: company.companyName,
            provider: company.atsProvider,
            job,
            decision: relevance.matchDecision,
          });

          if (calibrationItem) {
            calibrationCandidates.push(calibrationItem);
          }
        }
      }

      if (sourceReviewItems.length < MIN_REVIEW_CANDIDATES_PER_READY_SOURCE && calibrationCandidates.length > 0) {
        const existingKeys = new Set(sourceReviewItems.map((item) => item.reviewKey));
        const calibrationItems = calibrationCandidates
          .filter((item) => !existingKeys.has(item.reviewKey))
          .sort((a, b) => b.reviewPriority - a.reviewPriority || a.title.localeCompare(b.title))
          .slice(0, MIN_REVIEW_CANDIDATES_PER_READY_SOURCE - sourceReviewItems.length);

        nearMissesForSource += calibrationItems.length;
        reviewItems.push(...calibrationItems);
      }

      sourceSummaries.push({
        companyName: company.companyName,
        sourceKind,
        provider: company.atsProvider,
        status: "ready",
        warnings: [],
        fetched: normalizedJobs.length,
        nearMisses: nearMissesForSource,
      });
    } catch (error) {
      sourceSummaries.push({
        companyName: company.companyName,
        sourceKind,
        provider: company.atsProvider,
        status: "error",
        warnings: [error instanceof Error ? error.message : "Unable to fetch source."],
        fetched: 0,
        nearMisses: 0,
      });
    }
  }

  const unreviewedItems = filterUnreviewedNearMissReviewItems(reviewItems, decisions);
  const balanced = selectBalancedNearMissReviewItems(unreviewedItems, limit);
  const ranked = balanced.items
    .map((item) => ({
      reviewKey: item.reviewKey,
      externalJobId: item.externalJobId,
      companyName: item.companyName,
      provider: item.provider,
      title: item.title,
      location: item.location,
      remoteType: item.remoteType,
      department: item.department,
      employmentType: item.employmentType,
      salaryText: item.salaryText,
      reviewBucket: item.reviewBucket,
      roleFamily: item.decision.roleFamily,
      fitSummary: item.decision.fitSummary,
      positives: item.decision.positives,
      evidence: item.decision.evidence,
      risks: item.risks,
      reasonsToInspect: item.reasonsToInspect,
      responsibilitySnippets: item.responsibilitySnippets,
      experienceSnippets: item.experienceSnippets,
      descriptionSnippet: item.descriptionSnippet,
      sourceUrl: item.sourceUrl,
    }));

  console.log(JSON.stringify({
    persistence: dashboard.persistence,
    matchingConfigSource: activeMatching.source,
    matchingRulesVersion: activeMatching.matchingConfig.rulesVersion,
    sourceCoverage: searchSources.summary,
    previouslyReviewed: reviewItems.length - unreviewedItems.length,
    companiesChecked: searchSources.sources.length,
    fetched: sourceSummaries.reduce((sum, source) => sum + source.fetched, 0),
    nearMisses: reviewItems.length,
    returned: ranked.length,
    selectionSummary: balanced.summary,
    sourceSummaries,
    reviewBatch: ranked,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { loadEnvConfig } from "@next/env";
import { writeFileSync } from "node:fs";
import { buildConnectorPlan } from "../app/scans/connectors";
import { fetchNormalizedConnectorJobs } from "../app/scans/connector-runner";
import { classifyOccupation, type OccupationLane } from "../app/scans/occupation-classifier";
import { filterConnectorJobsByRelevance } from "../app/scans/relevance";
import { connectedSearchSources } from "../app/scans/search-sources";
import { getActiveMatchingConfig, getDashboardState } from "../app/scans/store";

const DEFAULT_OUTPUT_PATH = "/private/tmp/scans-occupation-classifier-impact.json";
const MAX_STRETCH_JOBS_PER_COMPANY = 15;

function argValue(name: string, fallback: string) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.replace(`--${name}=`, "") ?? fallback;
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topCounts(map: Map<string, number>, limit = 32) {
  return [...map.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function lanePolarity(lane: OccupationLane) {
  if ([
    "creative-writing",
    "art-direction",
    "visual-design",
    "product-ux-design",
    "ux-research",
    "creative-strategy",
    "creative-leadership",
    "content-video-production",
    "digital-production",
    "technical-production",
    "social-creative",
    "creative-operations",
    "program-project-management",
    "product-operations",
    "research-fellowship",
    "content-rights-licensing",
    "strategy-operations",
    "partnership-programs",
    "safety-program-operations",
    "finance-procurement-operations",
  ].includes(lane)) {
    return "potentially_relevant";
  }

  if (lane === "unknown") return "unknown";
  return "wrong_lane";
}

function compactJob(job: {
  title: string;
  companyName: string;
  location: string;
  remoteType: string;
  sourceUrl?: string;
}, decision: {
  score: number;
  bucket: string;
  matchQuality: string;
  fitSummary: string;
  risks: string[];
  positives: string[];
}, lane: ReturnType<typeof classifyOccupation>) {
  return {
    title: job.title,
    companyName: job.companyName,
    location: job.location,
    remoteType: job.remoteType,
    sourceUrl: job.sourceUrl,
    score: decision.score,
    bucket: decision.bucket,
    matchQuality: decision.matchQuality,
    fitSummary: decision.fitSummary,
    lane: lane.lane,
    laneConfidence: lane.confidence,
    lanePolarity: lanePolarity(lane.lane),
    laneEvidence: lane.evidence.slice(0, 4),
    positives: decision.positives.slice(0, 4),
    risks: decision.risks.slice(0, 6),
  };
}

async function main() {
  loadEnvConfig(process.cwd());
  const outputPath = argValue("out", DEFAULT_OUTPUT_PATH);
  const dashboard = await getDashboardState();
  const activeMatching = await getActiveMatchingConfig();
  const searchSources = connectedSearchSources(dashboard.companies, dashboard.searchProfile);
  const sourceResults = [];
  const laneCounts = new Map<string, number>();
  const includedLaneCounts = new Map<string, number>();
  const filteredPotentialLaneCounts = new Map<string, number>();
  const visibleWrongLane = [];
  const visibleUnknownLane = [];
  const filteredPotentialRecall = [];

  for (const { company, sourceKind } of searchSources.sources) {
    const plan = buildConnectorPlan(company);

    if (!plan.canPreview || !plan.endpointUrl) {
      sourceResults.push({
        companyName: company.companyName,
        sourceKind,
        provider: company.atsProvider,
        status: "blocked",
        fetched: 0,
        included: 0,
        classifierVisibleWrongLane: 0,
        classifierFilteredPotential: 0,
        warnings: plan.warnings,
      });
      continue;
    }

    try {
      const normalizedJobs = await fetchNormalizedConnectorJobs(company);
      const relevance = filterConnectorJobsByRelevance(normalizedJobs, company, dashboard.searchProfile, {
        matchingConfig: activeMatching.matchingConfig,
        maxStretchJobsPerCompany: MAX_STRETCH_JOBS_PER_COMPANY,
      });
      let sourceVisibleWrongLane = 0;
      let sourceFilteredPotential = 0;

      for (const decisionRow of relevance.decisions) {
        const job = normalizedJobs.find((candidate) => candidate.externalJobId === decisionRow.externalJobId);

        if (!job) continue;

        const classification = classifyOccupation({
          title: job.title,
          department: job.department,
          descriptionText: job.descriptionText,
          companyName: job.companyName,
          location: job.location,
          remoteType: job.remoteType,
          salaryText: job.salaryText,
          sourceKind,
          sourceName: company.companyName,
        });
        const polarity = lanePolarity(classification.lane);

        increment(laneCounts, classification.lane);

        if (decisionRow.included) {
          increment(includedLaneCounts, classification.lane);

          if (polarity === "wrong_lane") {
            sourceVisibleWrongLane += 1;
            visibleWrongLane.push(compactJob(job, decisionRow.matchDecision, classification));
          } else if (polarity === "unknown") {
            visibleUnknownLane.push(compactJob(job, decisionRow.matchDecision, classification));
          }
        } else if (polarity === "potentially_relevant") {
          sourceFilteredPotential += 1;
          increment(filteredPotentialLaneCounts, classification.lane);
          filteredPotentialRecall.push(compactJob(job, decisionRow.matchDecision, classification));
        }
      }

      sourceResults.push({
        companyName: company.companyName,
        sourceKind,
        provider: company.atsProvider,
        status: "ready",
        fetched: normalizedJobs.length,
        included: relevance.relevantJobs.length,
        filteredOut: relevance.filteredOut,
        duplicatesFiltered: relevance.duplicatesFiltered,
        stretchCapped: relevance.stretchCapped,
        classifierVisibleWrongLane: sourceVisibleWrongLane,
        classifierFilteredPotential: sourceFilteredPotential,
        warnings: [],
      });
    } catch (error) {
      sourceResults.push({
        companyName: company.companyName,
        sourceKind,
        provider: company.atsProvider,
        status: "error",
        fetched: 0,
        included: 0,
        classifierVisibleWrongLane: 0,
        classifierFilteredPotential: 0,
        warnings: [error instanceof Error ? error.message : "Unable to fetch source."],
      });
    }
  }

  const output = {
    outputPath,
    persistence: dashboard.persistence,
    matchingConfigSource: activeMatching.source,
    matchingRulesVersion: activeMatching.matchingConfig.rulesVersion,
    sourceCoverage: searchSources.summary,
    sourcesChecked: searchSources.sources.length,
    fetched: sourceResults.reduce((sum, result) => sum + result.fetched, 0),
    included: sourceResults.reduce((sum, result) => sum + result.included, 0),
    classifierVisibleWrongLane: visibleWrongLane.length,
    classifierVisibleUnknownLane: visibleUnknownLane.length,
    classifierFilteredPotentialRecall: filteredPotentialRecall.length,
    laneCounts: topCounts(laneCounts),
    includedLaneCounts: topCounts(includedLaneCounts),
    filteredPotentialLaneCounts: topCounts(filteredPotentialLaneCounts),
    visibleWrongLane: visibleWrongLane.sort((first, second) => second.score - first.score).slice(0, 40),
    visibleUnknownLane: visibleUnknownLane.sort((first, second) => second.score - first.score).slice(0, 40),
    filteredPotentialRecall: filteredPotentialRecall.sort((first, second) => second.score - first.score).slice(0, 60),
    sourceResults,
  };

  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath,
    fetched: output.fetched,
    included: output.included,
    classifierVisibleWrongLane: output.classifierVisibleWrongLane,
    classifierVisibleUnknownLane: output.classifierVisibleUnknownLane,
    classifierFilteredPotentialRecall: output.classifierFilteredPotentialRecall,
    includedLaneCounts: output.includedLaneCounts,
    filteredPotentialLaneCounts: output.filteredPotentialLaneCounts,
    visibleWrongLane: output.visibleWrongLane.slice(0, 12),
    visibleUnknownLane: output.visibleUnknownLane.slice(0, 12),
    filteredPotentialRecall: output.filteredPotentialRecall.slice(0, 12),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

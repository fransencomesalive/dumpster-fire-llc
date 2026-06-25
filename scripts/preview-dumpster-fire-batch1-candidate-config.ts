import { loadEnvConfig } from "@next/env";
import { writeFileSync } from "node:fs";
import { buildConnectorPlan } from "../app/scans/connectors";
import { fetchNormalizedConnectorJobs } from "../app/scans/connector-runner";
import { filterConnectorJobsByRelevance } from "../app/scans/relevance";
import { connectedSearchSources } from "../app/scans/search-sources";
import { getDashboardState } from "../app/scans/store";
import { randallPrivateMatchingConfig, type MatchingRuleConfig } from "../app/scans/matching";

const MAX_STRETCH_JOBS_PER_COMPANY = 15;
const DEFAULT_OUTPUT_PATH = "/private/tmp/scans-batch1-candidate-preview.json";

const batchOneStretchSignals = [
  "fellows program",
  "clearance licensing manager",
  "event project manager",
  "gtm operations",
  "supervisor strategy",
];

const batchOneWrongLaneExclusions = [
  "media buyer",
  "paid social",
  "administrative support",
  "architectural drafter",
  "builder chief",
  "consumer marketing",
  "product marketing",
  "business development",
  "public policy",
  "global affairs",
  "strategic account",
  "account management",
  "finance strategy",
  "fp&a analyst",
  "it systems analyst",
];

function candidateConfig(): MatchingRuleConfig {
  const mode = argValue("mode", "combined");
  const includeStretchSignals = mode !== "negative-only";

  return {
    ...randallPrivateMatchingConfig,
    rulesVersion: `${randallPrivateMatchingConfig.rulesVersion}-batch1-${mode}-preview`,
    stretchTitlePatterns: Array.from(new Set([
      ...(randallPrivateMatchingConfig.stretchTitlePatterns ?? []),
      ...(includeStretchSignals ? batchOneStretchSignals : []),
    ])),
    hardExcludedTitlePatterns: Array.from(new Set([
      ...randallPrivateMatchingConfig.hardExcludedTitlePatterns,
      ...batchOneWrongLaneExclusions,
    ])),
  };
}

function decisionByExternalId<T extends { externalJobId: string }>(items: T[]) {
  return new Map(items.map((item) => [item.externalJobId, item]));
}

function sourceKindLabel(sourceKind: string) {
  if (sourceKind === "broad_job_board") return "broad";
  if (sourceKind === "targeted_company_careers" || sourceKind === "targeted_company_source") return "targeted";
  return sourceKind;
}

loadEnvConfig(process.cwd());

function argValue(name: string, fallback: string) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.replace(`--${name}=`, "") ?? fallback;
}

async function main() {
  const outputPath = argValue("out", DEFAULT_OUTPUT_PATH);
  const mode = argValue("mode", "combined");
  const dashboard = await getDashboardState();
  const searchSources = connectedSearchSources(dashboard.companies, dashboard.searchProfile);
  const previewConfig = candidateConfig();
  const results = [];

  for (const { company, sourceKind } of searchSources.sources) {
    const plan = buildConnectorPlan(company);
    const sourceLabel = sourceKindLabel(sourceKind);

    if (!plan.canPreview || !plan.endpointUrl) {
      results.push({
        companyName: company.companyName,
        sourceKind: sourceLabel,
        provider: company.atsProvider,
        status: "blocked",
        warnings: plan.warnings,
        fetched: 0,
        currentIncluded: 0,
        previewIncluded: 0,
        added: [],
        removed: [],
      });
      continue;
    }

    try {
      const normalizedJobs = await fetchNormalizedConnectorJobs(company);
      const current = filterConnectorJobsByRelevance(normalizedJobs, company, dashboard.searchProfile, {
        matchingConfig: randallPrivateMatchingConfig,
        maxStretchJobsPerCompany: MAX_STRETCH_JOBS_PER_COMPANY,
      });
      const preview = filterConnectorJobsByRelevance(normalizedJobs, company, dashboard.searchProfile, {
        matchingConfig: previewConfig,
        maxStretchJobsPerCompany: MAX_STRETCH_JOBS_PER_COMPANY,
      });
      const currentDecisions = decisionByExternalId(current.decisions);
      const previewDecisions = decisionByExternalId(preview.decisions);
      const currentVisibleKeys = new Set(current.relevantJobs.map((job) => job.externalJobId));
      const previewVisibleKeys = new Set(preview.relevantJobs.map((job) => job.externalJobId));
      const added = preview.relevantJobs
        .filter((job) => !currentVisibleKeys.has(job.externalJobId))
        .slice(0, 12)
        .map((job) => {
          const decision = previewDecisions.get(job.externalJobId)?.matchDecision;
          return {
            title: job.title,
            location: job.location,
            matchQuality: decision?.matchQuality,
            bucket: decision?.bucket,
            roleFamily: decision?.roleFamily,
            positives: decision?.positives ?? [],
            risks: decision?.risks ?? [],
            sourceUrl: job.sourceUrl,
          };
        });
      const removed = current.relevantJobs
        .filter((job) => !previewVisibleKeys.has(job.externalJobId))
        .slice(0, 12)
        .map((job) => {
          const decision = currentDecisions.get(job.externalJobId)?.matchDecision;
          return {
            title: job.title,
            location: job.location,
            matchQuality: decision?.matchQuality,
            bucket: decision?.bucket,
            roleFamily: decision?.roleFamily,
            positives: decision?.positives ?? [],
            risks: decision?.risks ?? [],
            sourceUrl: job.sourceUrl,
          };
        });

      results.push({
        companyName: company.companyName,
        sourceKind: sourceLabel,
        provider: company.atsProvider,
        status: "ready",
        warnings: [],
        fetched: normalizedJobs.length,
        currentIncluded: current.relevantJobs.length,
        previewIncluded: preview.relevantJobs.length,
        currentFiltered: current.filteredOut,
        previewFiltered: preview.filteredOut,
        currentStretchCapped: current.stretchCapped,
        previewStretchCapped: preview.stretchCapped,
        added,
        removed,
      });
    } catch (error) {
      results.push({
        companyName: company.companyName,
        sourceKind: sourceLabel,
        provider: company.atsProvider,
        status: "error",
        warnings: [error instanceof Error ? error.message : "Unable to fetch source."],
        fetched: 0,
        currentIncluded: 0,
        previewIncluded: 0,
        added: [],
        removed: [],
      });
    }
  }

  const added = results.flatMap((result) => result.added.map((job) => ({
    sourceKind: result.sourceKind,
    companyName: result.companyName,
    ...job,
  })));
  const removed = results.flatMap((result) => result.removed.map((job) => ({
    sourceKind: result.sourceKind,
    companyName: result.companyName,
    ...job,
  })));

  const output = {
    mode: "preview_only_no_writes",
    candidateMode: mode,
    outputPath,
    currentRulesVersion: randallPrivateMatchingConfig.rulesVersion,
    previewRulesVersion: previewConfig.rulesVersion,
    candidateSignals: {
      addedStretchTitlePatterns: mode === "negative-only" ? [] : batchOneStretchSignals,
      addedHardExcludedTitlePatterns: batchOneWrongLaneExclusions,
    },
    sourceCoverage: searchSources.summary,
    fetched: results.reduce((sum, result) => sum + result.fetched, 0),
    ready: results.filter((result) => result.status === "ready").length,
    blocked: results.filter((result) => result.status === "blocked").length,
    errors: results.filter((result) => result.status === "error").length,
    currentIncluded: results.reduce((sum, result) => sum + result.currentIncluded, 0),
    previewIncluded: results.reduce((sum, result) => sum + result.previewIncluded, 0),
    addedCount: added.length,
    removedCount: removed.length,
    added,
    removed,
    results,
  };

  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({
    mode: output.mode,
    outputPath,
    currentRulesVersion: output.currentRulesVersion,
    previewRulesVersion: output.previewRulesVersion,
    sourceCoverage: output.sourceCoverage,
    fetched: output.fetched,
    ready: output.ready,
    blocked: output.blocked,
    errors: output.errors,
    currentIncluded: output.currentIncluded,
    previewIncluded: output.previewIncluded,
    addedCount: output.addedCount,
    removedCount: output.removedCount,
    added: output.added.slice(0, 12),
    removed: output.removed.slice(0, 12),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

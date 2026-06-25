import { loadEnvConfig } from "@next/env";
import { buildConnectorPlan } from "../app/scans/connectors";
import { fetchNormalizedConnectorJobs } from "../app/scans/connector-runner";
import { evaluateJobMatch } from "../app/scans/matching";
import { connectedSearchSources } from "../app/scans/search-sources";
import { getActiveMatchingConfig, getDashboardState } from "../app/scans/store";
import type { NormalizedConnectorJob } from "../app/scans/connectors";
import type { Company } from "../app/scans/types";

loadEnvConfig(process.cwd());

const SOURCE_TIMEOUT_MS = 15000;

const knownGoodRoles: Array<{
  id: string;
  title: string;
  companyName: string;
  sourceUrl: string;
  whyRelevant: string;
  descriptionText: string;
}> = [
  {
    id: "accenture-ai-strategy-delivery-lead-retail",
    title: "AI Strategy Delivery Lead – Retail",
    companyName: "Accenture",
    sourceUrl: "https://www.accenture.com/ca-en/careers/jobdetails?id=R00306205_en",
    whyRelevant: "Strong PM/program-director signal: AI transformation programs, roadmaps, operating models, cross-functional delivery, stakeholder leadership, budgeting, resource planning.",
    descriptionText: [
      "As an AI Strategy/Delivery Lead, you will play a pivotal role in shaping and leading enterprise-wide AI transformation programmes within Strategy & Consulting for Retail Companies.",
      "You will translate high-level business and industry roadmaps into actionable AI strategies, delivery frameworks and operational models.",
      "Architect and lead end-to-end AI transformation programmes within retail: from visioning and strategy through roadmap, business case, use-case prioritisation, value capture model, and scaling to full business operations.",
      "Lead cross-functional teams spanning strategy, design, architecture, engineering, data science, and delivery, including mentoring, resource planning, performance management and ensuring high-quality client outcomes.",
      "Manage financial oversight of AI programmes: forecasting, budgeting, commercial tracking, risk mitigation, and value realisation metrics.",
    ].join(" "),
  },
  {
    id: "block-crm-product-owner-gtm",
    title: "CRM Product Owner, GTM",
    companyName: "Block",
    sourceUrl: "http://block.xyz/careers/jobs/5235961008",
    whyRelevant: "Possible PM/program-ops stretch: internal tools, GTM systems, automation opportunities, agentic tools, Salesforce/business process ownership.",
    descriptionText: [
      "Deeply understand internal users and focus on increasing the efficiency of day to day operations, building scalable third party and first party platforms, and creating AI-forward business automations.",
      "Partner with Sales, Account Management, Services, and Partnerships stakeholders to summarize complex processes into automation opportunities.",
      "8+ years of product management or owner experience, with at least 2 years building internal tools.",
      "5+ years of enterprise experience using Salesforce or similar tools to develop business automations and solutions.",
      "Experience using agentic tools to facilitate the end to end product management process.",
    ].join(" "),
  },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function titleMatches(jobTitle: string, benchmarkTitle: string) {
  const normalizedJobTitle = normalize(jobTitle);
  const normalizedBenchmarkTitle = normalize(benchmarkTitle);
  return normalizedJobTitle.includes(normalizedBenchmarkTitle) || normalizedBenchmarkTitle.includes(normalizedJobTitle);
}

function companyMatches(jobCompany: string, benchmarkCompany: string) {
  const normalizedJobCompany = normalize(jobCompany);
  const normalizedBenchmarkCompany = normalize(benchmarkCompany);
  return normalizedJobCompany.includes(normalizedBenchmarkCompany) || normalizedBenchmarkCompany.includes(normalizedJobCompany);
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${SOURCE_TIMEOUT_MS}ms`)), SOURCE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function fetchSource(company: Company) {
  const plan = buildConnectorPlan(company);

  if (!plan.canPreview || !plan.endpointUrl) {
    return {
      company,
      plan,
      status: "blocked" as const,
      warnings: plan.warnings,
      jobs: [] as NormalizedConnectorJob[],
    };
  }

  try {
    const jobs = await withTimeout(fetchNormalizedConnectorJobs(company), company.companyName);
    return {
      company,
      plan,
      status: "ready" as const,
      warnings: [] as string[],
      jobs,
    };
  } catch (error) {
    return {
      company,
      plan,
      status: "error" as const,
      warnings: [error instanceof Error ? error.message : "Unable to fetch source."],
      jobs: [] as NormalizedConnectorJob[],
    };
  }
}

async function main() {
  const dashboard = await getDashboardState();
  const activeMatching = await getActiveMatchingConfig();
  const searchSources = connectedSearchSources(dashboard.companies, dashboard.searchProfile);
  const sourceResults = await Promise.all(searchSources.sources.map(async ({ company, sourceKind }) => ({
    sourceKind,
    ...await fetchSource(company),
  })));
  const fetchedJobs = sourceResults.flatMap((result) => result.jobs.map((job) => ({ job, sourceCompany: result.company.companyName })));

  const benchmarks = knownGoodRoles.map((benchmark) => {
    const benchmarkDecision = evaluateJobMatch({
      title: benchmark.title,
      companyName: benchmark.companyName,
      department: "",
      location: "",
      remoteType: "unclear",
      employmentType: "full-time",
      salaryMin: undefined,
      salaryMax: undefined,
      salaryText: "",
      descriptionText: benchmark.descriptionText,
      firstSeenAt: new Date().toISOString(),
      needsContactResearch: true,
    }, dashboard.searchProfile, activeMatching.matchingConfig);
    const sourceHost = hostFromUrl(benchmark.sourceUrl);
    const fetchedMatch = fetchedJobs.find(({ job }) => (
      titleMatches(job.title, benchmark.title) &&
      (companyMatches(job.companyName, benchmark.companyName) || hostFromUrl(job.sourceUrl) === sourceHost)
    ));
    const fetchedDecision = fetchedMatch
      ? evaluateJobMatch({
          title: fetchedMatch.job.title,
          companyName: fetchedMatch.job.companyName || fetchedMatch.sourceCompany,
          department: fetchedMatch.job.department,
          location: fetchedMatch.job.location,
          remoteType: fetchedMatch.job.remoteType,
          employmentType: fetchedMatch.job.employmentType,
          salaryMin: fetchedMatch.job.salaryMin,
          salaryMax: fetchedMatch.job.salaryMax,
          salaryText: fetchedMatch.job.salaryText,
          descriptionText: fetchedMatch.job.descriptionText,
          firstSeenAt: new Date().toISOString(),
          needsContactResearch: true,
        }, dashboard.searchProfile, activeMatching.matchingConfig)
      : null;

    return {
      ...benchmark,
      currentScanStatus: fetchedMatch
        ? fetchedDecision?.included ? "source_seen_and_included" : "source_seen_but_filtered"
        : "source_missing",
      benchmarkMatcherDecision: {
        included: benchmarkDecision.included,
        score: benchmarkDecision.score,
        bucket: benchmarkDecision.bucket,
        matchQuality: benchmarkDecision.matchQuality,
        roleFamily: benchmarkDecision.roleFamily,
        positives: benchmarkDecision.positives,
        risks: benchmarkDecision.risks,
      },
      fetchedMatch: fetchedMatch ? {
        sourceCompany: fetchedMatch.sourceCompany,
        title: fetchedMatch.job.title,
        companyName: fetchedMatch.job.companyName,
        sourceUrl: fetchedMatch.job.sourceUrl,
        fetchedDecision: fetchedDecision ? {
          included: fetchedDecision.included,
          score: fetchedDecision.score,
          bucket: fetchedDecision.bucket,
          matchQuality: fetchedDecision.matchQuality,
          roleFamily: fetchedDecision.roleFamily,
          positives: fetchedDecision.positives,
          risks: fetchedDecision.risks,
        } : null,
      } : null,
    };
  });

  console.log(JSON.stringify({
    persistence: dashboard.persistence,
    matchingConfigSource: activeMatching.source,
    matchingRulesVersion: activeMatching.matchingConfig.rulesVersion,
    sourceCoverage: {
      ...searchSources.summary,
      ready: sourceResults.filter((result) => result.status === "ready").length,
      blocked: sourceResults.filter((result) => result.status === "blocked").length,
      errors: sourceResults.filter((result) => result.status === "error").length,
      fetched: fetchedJobs.length,
      connectedBroadSourceCount: searchSources.broadSources.length,
      connectedBroadSourceCoverage: searchSources.broadSources.length >= 3 ? "partial" : "insufficient",
    },
    sourceResults: sourceResults.map((result) => ({
      companyName: result.company.companyName,
      sourceKind: result.sourceKind,
      provider: result.company.atsProvider,
      status: result.status,
      fetched: result.jobs.length,
      warnings: result.warnings,
    })),
    benchmarks,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

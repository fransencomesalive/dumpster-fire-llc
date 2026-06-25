import { loadEnvConfig } from "@next/env";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { buildConnectorPlan, textFromHtml } from "../app/scans/connectors";
import type { NormalizedConnectorJob } from "../app/scans/connectors";
import { fetchNormalizedConnectorJobs } from "../app/scans/connector-runner";
import { duplicateKeyForConnectorJob } from "../app/scans/dedupe";
import type { MatchDecision } from "../app/scans/matching";
import {
  buildNearMissReviewItem,
  buildSourceCalibrationReviewItem,
  filterUnreviewedNearMissReviewItems,
  reviewDetailsFromJob,
} from "../app/scans/near-miss-review";
import { filterConnectorJobsByRelevance } from "../app/scans/relevance";
import { connectedSearchSources, type SearchSourceKind } from "../app/scans/search-sources";
import { getActiveMatchingConfig, getDashboardState, getNearMissReviewDecisions } from "../app/scans/store";

const BATCH_SIZE = Number(process.argv.find((arg) => arg.startsWith("--batch-size="))?.replace("--batch-size=", "") ?? 50);
const BATCH_COUNT = Number(process.argv.find((arg) => arg.startsWith("--batches="))?.replace("--batches=", "") ?? 2);
const TOTAL_LIMIT = BATCH_SIZE * BATCH_COUNT;
const OUTPUT_BASE = process.argv.find((arg) => arg.startsWith("--out="))?.replace("--out=", "") ?? "/private/tmp/scans-review-batches";
const INCLUDE_NEAR_MISS_SUPPLEMENTS = process.argv.includes("--include-near-misses");
const BROAD_SOURCE_TARGET_RATIO = 0.5;
const MAX_ITEMS_PER_COMPANY = 12;

type ReviewBatchItem = {
  reviewType: "matcher_pass" | "near_miss_supplement";
  reviewBucket: string;
  learningQuality: "matcher_pass" | "profile_fit_candidate" | "source_calibration";
  reviewKey: string;
  sourceKind: SearchSourceKind;
  sourceName: string;
  provider: string;
  externalJobId: string;
  title: string;
  companyName: string;
  location: string;
  remoteType: NormalizedConnectorJob["remoteType"];
  department: string;
  employmentType: NormalizedConnectorJob["employmentType"];
  salaryText: string;
  score: number;
  bucket: string;
  matchQuality: MatchDecision["matchQuality"];
  roleFamily: string;
  fitSummary: string;
  positives: string[];
  evidence: string[];
  risks: string[];
  reasonsToInspect: string[];
  responsibilitySnippets: string[];
  experienceSnippets: string[];
  descriptionSnippet: string;
  sourceUrl: string;
};

function reviewKeyForItem(input: {
  sourceName: string;
  provider: string;
  externalJobId: string;
  title: string;
  sourceUrl: string;
}) {
  const rawKey = [
    input.sourceName,
    input.provider,
    input.externalJobId || input.sourceUrl || input.title,
  ].join("::").toLowerCase();
  return `review-batch-${createHash("sha1").update(rawKey).digest("hex").slice(0, 24)}`;
}

function scoreQualityRank(item: ReviewBatchItem) {
  if (item.matchQuality === "good") return 2;
  if (item.matchQuality === "stretch") return 1;
  return 0;
}

function sortReviewItems(items: ReviewBatchItem[]) {
  return [...items].sort((first, second) => {
    return (
      scoreQualityRank(second) - scoreQualityRank(first) ||
      second.score - first.score ||
      first.title.localeCompare(second.title)
    );
  });
}

function balancedSelect(items: ReviewBatchItem[], limit: number) {
  const groups = new Map<string, ReviewBatchItem[]>();
  const selected: ReviewBatchItem[] = [];
  const selectedCompanySignalKeys = new Set<string>();

  for (const item of items) {
    const key = `${item.sourceKind}:${item.sourceName}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const sortedGroups = Array.from(groups.entries())
    .map(([key, groupItems]) => ({ key, items: sortReviewItems(groupItems) }))
    .sort((first, second) => (second.items[0]?.score ?? 0) - (first.items[0]?.score ?? 0) || first.key.localeCompare(second.key));

  while (selected.length < limit && sortedGroups.some((group) => group.items.length > 0)) {
    for (const group of sortedGroups) {
      let next: ReviewBatchItem | undefined;

      while (group.items.length > 0) {
        const candidate = group.items.shift();
        if (!candidate) break;

        const signalKey = `${candidate.sourceKind}:${normalizedKey(candidate.companyName || candidate.sourceName)}:${normalizedKey(titleSignalGroup(candidate.title))}`;
        if (selectedCompanySignalKeys.has(signalKey)) continue;

        next = candidate;
        selectedCompanySignalKeys.add(signalKey);
        break;
      }

      if (!next) continue;

      selected.push(next);
      if (selected.length >= limit) break;
    }
  }

  return selected;
}

function normalizedKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

function titleSignalGroup(value: string) {
  const normalized = normalizedKey(value);
  if (/(marketing|marketer|market development|go to market|gtm)/.test(normalized) && !/(production|producer|program|programs)/.test(normalized)) return "marketing roles";
  if (normalized.includes("producer")) return "producer and production roles";
  if (normalized.includes("program")) return "program management";
  if (normalized.includes("operations")) return "operations roles";
  if (normalized.includes("delivery")) return "delivery leadership";
  if (normalized.includes("strategy")) return "strategy roles";
  if (normalized.includes("product")) return "product roles";
  return normalized.split(" ").slice(0, 4).join(" ") || "unknown";
}

function filterUnreviewedReviewBatchItems(
  items: ReviewBatchItem[],
  decisions: Array<{ reviewKey: string; companyName: string; title: string; titleSignal: string }>
) {
  const reviewedKeys = new Set(decisions.map((decision) => decision.reviewKey));
  const reviewedCompanyTitleKeys = new Set(decisions.map((decision) => `${normalizedKey(decision.companyName)}:${normalizedKey(decision.title)}`));
  const reviewedCompanySignalKeys = new Set(decisions.map((decision) => (
    `${normalizedKey(decision.companyName)}:${normalizedKey(titleSignalGroup(decision.titleSignal || decision.title))}`
  )));

  return items.filter((item) => (
    !reviewedKeys.has(item.reviewKey) &&
    !reviewedCompanyTitleKeys.has(`${normalizedKey(item.companyName)}:${normalizedKey(item.title)}`) &&
    !reviewedCompanySignalKeys.has(`${normalizedKey(item.companyName)}:${normalizedKey(titleSignalGroup(item.title))}`)
  ));
}

function reviewItemDuplicateKey(item: ReviewBatchItem) {
  try {
    const sourceUrl = new URL(item.sourceUrl);
    const pathParts = sourceUrl.pathname.split("/").filter(Boolean);
    const companySlugIndex = pathParts.findIndex((part) => part === "companies");
    const companySlug = companySlugIndex >= 0 ? pathParts[companySlugIndex + 1] : "";

    if (sourceUrl.hostname.includes("himalayas.app") && companySlug) {
      return [
        "himalayas-company-title",
        normalizedKey(companySlug),
        normalizedKey(item.title),
      ].join(":");
    }
  } catch {
  }

  const sourceUrlKey = normalizedKey(item.sourceUrl);
  if (sourceUrlKey) return `url:${sourceUrlKey}`;

  return [
    "title-company",
    normalizedKey(item.companyName),
    normalizedKey(item.title),
    normalizedKey(item.location),
  ].join(":");
}

function dedupeReviewBatchItems(items: ReviewBatchItem[]) {
  const selected: ReviewBatchItem[] = [];
  const seen = new Set<string>();

  for (const item of sortReviewItems(items)) {
    const key = reviewItemDuplicateKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(item);
  }

  return selected;
}

function sourceKindCounts(items: ReviewBatchItem[]) {
  return items.reduce((counts, item) => {
    counts[item.sourceKind] = (counts[item.sourceKind] ?? 0) + 1;
    return counts;
  }, {} as Record<SearchSourceKind, number>);
}

function selectBalancedSourceMix(items: ReviewBatchItem[], limit: number) {
  const broadTarget = Math.round(limit * BROAD_SOURCE_TARGET_RATIO);
  const targetedTarget = limit - broadTarget;
  const broadItems = balancedSelect(items.filter((item) => item.sourceKind === "broad_job_board"), broadTarget);
  const targetedItems = balancedSelect(items.filter((item) => item.sourceKind === "targeted_company_careers"), targetedTarget);
  const selected = [...broadItems, ...targetedItems];
  const selectedKeys = new Set(selected.map((item) => item.reviewKey));

  if (selected.length < limit) {
    for (const item of balancedSelect(items.filter((candidate) => !selectedKeys.has(candidate.reviewKey)), limit - selected.length)) {
      selected.push(item);
      selectedKeys.add(item.reviewKey);
    }
  }

  const companyCounts = new Map<string, number>();
  const capped: ReviewBatchItem[] = [];
  const overflow: ReviewBatchItem[] = [];

  for (const item of sortReviewItems(selected)) {
    const companyKey = `${item.sourceKind}:${normalizedKey(item.companyName || item.sourceName)}`;
    const count = companyCounts.get(companyKey) ?? 0;

    if (count < MAX_ITEMS_PER_COMPANY) {
      capped.push(item);
      companyCounts.set(companyKey, count + 1);
    } else {
      overflow.push(item);
    }
  }

  if (capped.length < limit) {
    const cappedKeys = new Set(capped.map((item) => item.reviewKey));
    const fill = balancedSelect(items.filter((item) => !cappedKeys.has(item.reviewKey)), limit - capped.length);
    capped.push(...fill);
  }

  return capped.slice(0, limit);
}

function buildBalancedBatches(items: ReviewBatchItem[], batchCount: number, batchSize: number) {
  const remaining = [...items];
  const batches: ReviewBatchItem[][] = [];

  for (let index = 0; index < batchCount; index += 1) {
    const batch = selectBalancedSourceMix(remaining, batchSize);
    const selectedKeys = new Set(batch.map((item) => item.reviewKey));
    batches.push(batch);

    for (let remainingIndex = remaining.length - 1; remainingIndex >= 0; remainingIndex -= 1) {
      if (selectedKeys.has(remaining[remainingIndex].reviewKey)) {
        remaining.splice(remainingIndex, 1);
      }
    }
  }

  return batches;
}

function matcherPassItem(input: {
  sourceKind: SearchSourceKind;
  sourceName: string;
  provider: string;
  job: NormalizedConnectorJob;
  decision: MatchDecision;
}): ReviewBatchItem {
  const reviewDetails = reviewDetailsFromJob(input.job);

  return {
    reviewType: "matcher_pass",
    reviewBucket: "matcher_pass",
    learningQuality: "matcher_pass",
    reviewKey: reviewKeyForItem({
      sourceName: input.sourceName,
      provider: input.provider,
      externalJobId: input.job.externalJobId,
      title: input.job.title,
      sourceUrl: input.job.sourceUrl,
    }),
    sourceKind: input.sourceKind,
    sourceName: input.sourceName,
    provider: input.provider,
    externalJobId: input.job.externalJobId,
    title: input.job.title,
    companyName: input.job.companyName || input.sourceName,
    location: input.job.location,
    remoteType: input.job.remoteType,
    department: input.job.department,
    employmentType: input.job.employmentType,
    salaryText: input.job.salaryText,
    score: input.decision.score,
    bucket: input.decision.bucket,
    matchQuality: input.decision.matchQuality,
    roleFamily: input.decision.roleFamily,
    fitSummary: input.decision.fitSummary,
    positives: input.decision.positives,
    evidence: input.decision.evidence,
    risks: input.decision.risks,
    reasonsToInspect: ["passed matcher before review cap"],
    responsibilitySnippets: reviewDetails.responsibilitySnippets,
    experienceSnippets: reviewDetails.experienceSnippets,
    descriptionSnippet: reviewDetails.descriptionSnippet,
    sourceUrl: input.job.sourceUrl,
  };
}

function nearMissItem(input: {
  sourceKind: SearchSourceKind;
  sourceName: string;
  provider: string;
  item: NonNullable<ReturnType<typeof buildNearMissReviewItem>>;
}): ReviewBatchItem {
  return {
    reviewType: "near_miss_supplement",
    reviewBucket: input.item.reviewBucket,
    learningQuality: input.item.reviewBucket === "source_calibration_candidate" ? "source_calibration" : "profile_fit_candidate",
    reviewKey: input.item.reviewKey,
    sourceKind: input.sourceKind,
    sourceName: input.sourceName,
    provider: input.provider,
    externalJobId: input.item.externalJobId,
    title: input.item.title,
    companyName: input.item.companyName,
    location: input.item.location,
    remoteType: input.item.remoteType,
    department: input.item.department,
    employmentType: input.item.employmentType,
    salaryText: input.item.salaryText,
    score: input.item.decision.score,
    bucket: input.item.decision.bucket,
    matchQuality: input.item.decision.matchQuality,
    roleFamily: input.item.decision.roleFamily,
    fitSummary: input.item.decision.fitSummary,
    positives: input.item.decision.positives,
    evidence: input.item.decision.evidence,
    risks: input.item.risks,
    reasonsToInspect: input.item.reasonsToInspect,
    responsibilitySnippets: input.item.responsibilitySnippets,
    experienceSnippets: input.item.experienceSnippets,
    descriptionSnippet: input.item.descriptionSnippet,
    sourceUrl: input.item.sourceUrl,
  };
}

function needsDetailHydration(item: ReviewBatchItem) {
  return (
    item.responsibilitySnippets.length < 3 ||
    item.experienceSnippets.length < 3 ||
    item.descriptionSnippet.length < 300 ||
    !item.salaryText.trim()
  );
}

function formatSalaryAmount(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function salaryTextFromJsonLd(rawHtml: string): string {
  const scriptBlocks = rawHtml.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];

  for (const block of scriptBlocks) {
    const body = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();

    try {
      const parsed = JSON.parse(body);
      const nodes = Array.isArray(parsed) ? parsed : [parsed, ...(Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [])];

      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const type = (node as Record<string, unknown>)["@type"];
        if (type !== "JobPosting" && !(Array.isArray(type) && type.includes("JobPosting"))) continue;

        const baseSalary = (node as Record<string, unknown>).baseSalary as Record<string, unknown> | undefined;
        if (!baseSalary) continue;

        const valueNode = (baseSalary.value ?? baseSalary) as Record<string, unknown>;
        const minValue = Number(valueNode.minValue ?? valueNode.value ?? 0);
        const maxValue = Number(valueNode.maxValue ?? valueNode.value ?? 0);
        const unit = String(valueNode.unitText ?? "").toLowerCase();
        const unitLabel = unit && unit !== "year" ? ` / ${unit}` : unit === "year" ? " / year" : "";

        if (minValue > 0 && maxValue > 0 && maxValue !== minValue) {
          return `${formatSalaryAmount(minValue)} - ${formatSalaryAmount(maxValue)}${unitLabel}`;
        }
        if (maxValue > 0 || minValue > 0) {
          return `${formatSalaryAmount(Math.max(minValue, maxValue))}${unitLabel}`;
        }
      }
    } catch {
      continue;
    }
  }

  return "";
}

function salaryTextFromBody(text: string): string {
  const rangeMatch = text.match(/\$\s?\d{2,3}(?:,\d{3})+(?:\s?(?:-|–|—|to)\s?\$?\s?\d{2,3}(?:,\d{3})+)?/);
  if (rangeMatch) return rangeMatch[0].replace(/\s+/g, " ").trim();

  const kMatch = text.match(/\$\s?\d{2,3}k(?:\s?(?:-|–|—|to)\s?\$?\s?\d{2,3}k)?/i);
  return kMatch ? kMatch[0].replace(/\s+/g, " ").trim() : "";
}

type PostingDetail = {
  detailText: string;
  salaryText: string;
};

async function fetchPostingDetail(sourceUrl: string): Promise<PostingDetail> {
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return { detailText: "", salaryText: "" };

  try {
    const workdayText = await fetchWorkdayPostingDetailText(sourceUrl);
    if (workdayText) return { detailText: workdayText, salaryText: salaryTextFromBody(workdayText) };

    const response = await fetch(sourceUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain",
        "User-Agent": "Mozilla/5.0 (compatible; JobMarketDumpsterFireReviewBot/1.0)",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return { detailText: "", salaryText: "" };

    const contentType = response.headers.get("content-type") ?? "";
    if (!/html|text\/plain/i.test(contentType)) return { detailText: "", salaryText: "" };

    const rawBody = await response.text();
    const detailText = textFromHtml(rawBody);

    return {
      detailText,
      salaryText: salaryTextFromJsonLd(rawBody) || salaryTextFromBody(detailText),
    };
  } catch {
    return { detailText: "", salaryText: "" };
  }
}

function workdayDetailApiUrl(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    if (!/myworkdayjobs\.com|workdayjobs\.com/i.test(url.hostname)) return "";

    const [site, ...externalPathParts] = url.pathname.split("/").filter(Boolean);
    if (!site || externalPathParts[0] !== "job") return "";

    const tenant = url.hostname.split(".")[0];
    return `${url.origin}/wday/cxs/${tenant}/${site}/${externalPathParts.join("/")}`;
  } catch {
    return "";
  }
}

function stringsFromUnknown(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsFromUnknown);
  if (!value || typeof value !== "object") return [];

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nestedValue]) => {
    const normalizedKey = key.toLowerCase();
    if (/description|qualification|responsibilit|requirement|skill|summary|experience|jobpostinginfo|hiringrequirement/i.test(normalizedKey)) {
      return stringsFromUnknown(nestedValue);
    }

    return [];
  });
}

async function fetchWorkdayPostingDetailText(sourceUrl: string) {
  const apiUrl = workdayDetailApiUrl(sourceUrl);
  if (!apiUrl) return "";

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; JobMarketDumpsterFireReviewBot/1.0)",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return "";

    const payload = await response.json();
    return stringsFromUnknown(payload)
      .map(textFromHtml)
      .map((line) => line.trim())
      .filter((line) => line.length >= 40)
      .join("\n");
  } catch {
    return "";
  }
}

async function hydrateReviewBatchItem(item: ReviewBatchItem): Promise<ReviewBatchItem> {
  if (!needsDetailHydration(item)) return item;

  const detail = await fetchPostingDetail(item.sourceUrl);
  if (detail.detailText.length < 200 && !detail.salaryText) return item;

  if (detail.detailText.length < 200) {
    return { ...item, salaryText: item.salaryText || detail.salaryText };
  }

  const reviewDetails = reviewDetailsFromJob({
    companyId: "",
    externalJobId: item.externalJobId,
    sourceProvider: item.provider as NormalizedConnectorJob["sourceProvider"],
    sourceUrl: item.sourceUrl,
    applyUrl: item.sourceUrl,
    title: item.title,
    companyName: item.companyName,
    location: item.location,
    remoteType: item.remoteType,
    employmentType: item.employmentType,
    department: item.department,
    salaryText: item.salaryText,
    descriptionText: detail.detailText,
    rawPayload: {},
  });

  return {
    ...item,
    salaryText: item.salaryText || detail.salaryText,
    responsibilitySnippets: reviewDetails.responsibilitySnippets.length > item.responsibilitySnippets.length
      ? reviewDetails.responsibilitySnippets
      : item.responsibilitySnippets,
    experienceSnippets: reviewDetails.experienceSnippets.length > item.experienceSnippets.length
      ? reviewDetails.experienceSnippets
      : item.experienceSnippets,
    descriptionSnippet: reviewDetails.descriptionSnippet.length > item.descriptionSnippet.length
      ? reviewDetails.descriptionSnippet
      : item.descriptionSnippet,
  };
}

function markdownEscape(value: string) {
  return value.replace(/\|/g, "\\|");
}

function formatItem(item: ReviewBatchItem, index: number) {
  const meta = [
    `${item.reviewType}`,
    `${item.matchQuality}`,
    `score ${item.score}`,
    item.bucket,
    item.roleFamily,
    item.remoteType,
    item.salaryText || "salary not listed",
  ].filter(Boolean).join(" | ");
  const positives = item.positives.slice(0, 4).join("; ") || "No positives surfaced.";
  const risks = item.risks.slice(0, 5).join("; ") || "No major risks surfaced.";
  const reasons = item.reasonsToInspect.slice(0, 3).join("; ");

  return [
    `### ${index}. ${item.title} - ${item.companyName}`,
    `- [ ] Decision: Match / Good / Stretch / Not a Match`,
    `- Source: ${item.sourceKind} | ${item.sourceName} | ${item.provider}`,
    `- Review tier: ${item.reviewType} | ${item.reviewBucket} | ${item.learningQuality}`,
    `- Meta: ${meta}`,
    `- Fit: ${item.fitSummary}`,
    `- Positives: ${positives}`,
    `- Risks: ${risks}`,
    reasons ? `- Inspect: ${reasons}` : "",
    item.descriptionSnippet ? `- Snippet: ${item.descriptionSnippet}` : "",
    `- URL: ${item.sourceUrl}`,
  ].filter(Boolean).join("\n");
}

function buildMarkdown(report: {
  generatedAt: string;
  batches: ReviewBatchItem[][];
  summary: Record<string, unknown>;
}) {
  const reviewReady = report.summary.reviewReady === true;
  const lines = [
    "# Dumpster Fire Review Batches",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    reviewReady
      ? "Use these as matcher-pass review batches. `matcher_pass` means the role passed the matcher before review sampling."
      : "This export is not review-ready. There were not enough unreviewed matcher-pass roles to build the requested batch size.",
    "",
    "## Summary",
    "",
    "| Key | Value |",
    "| --- | --- |",
    ...Object.entries(report.summary).map(([key, value]) => `| ${markdownEscape(key)} | ${markdownEscape(String(value))} |`),
    "",
  ];

  report.batches.forEach((batch, batchIndex) => {
    lines.push(`## Batch ${batchIndex + 1}`, "");
    batch.forEach((item, index) => {
      lines.push(formatItem(item, index + 1), "");
    });
  });

  return lines.join("\n");
}

async function main() {
  loadEnvConfig(process.cwd());

  const dashboard = await getDashboardState();
  const activeMatching = await getActiveMatchingConfig();
  const reviewedDecisions = await getNearMissReviewDecisions();
  const searchSources = connectedSearchSources(dashboard.companies, dashboard.searchProfile);
  const reservedDuplicateKeys = new Set<string>();
  const matcherPasses: ReviewBatchItem[] = [];
  const nearMisses = [];
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
        matcherPasses: 0,
        nearMisses: 0,
      });
      continue;
    }

    try {
      const jobs = await fetchNormalizedConnectorJobs(company);
      const relevance = filterConnectorJobsByRelevance(jobs, company, dashboard.searchProfile, {
        reservedDuplicateKeys,
        matchingConfig: activeMatching.matchingConfig,
      });
      const jobByExternalId = new Map(jobs.map((job) => [job.externalJobId, job]));
      let sourceMatcherPasses = 0;
      let sourceNearMisses = 0;

      for (const job of relevance.relevantJobs) {
        reservedDuplicateKeys.add(duplicateKeyForConnectorJob(job));
      }

      for (const decision of relevance.decisions) {
        const job = jobByExternalId.get(decision.externalJobId);
        if (!job) continue;

        if (decision.included) {
          sourceMatcherPasses += 1;
          matcherPasses.push(matcherPassItem({
            sourceKind,
            sourceName: company.companyName,
            provider: company.atsProvider,
            job,
            decision: decision.matchDecision,
          }));
        } else {
          const nearMiss = buildNearMissReviewItem({
            companyName: job.companyName || company.companyName,
            provider: company.atsProvider,
            job,
            decision: decision.matchDecision,
          });

          if (nearMiss) {
            sourceNearMisses += 1;
            nearMisses.push({
              sourceKind,
              sourceName: company.companyName,
              provider: company.atsProvider,
              item: nearMiss,
            });
          } else {
            const calibrationItem = buildSourceCalibrationReviewItem({
              companyName: job.companyName || company.companyName,
              provider: company.atsProvider,
              job,
              decision: decision.matchDecision,
            });

            if (calibrationItem) {
              sourceNearMisses += 1;
              nearMisses.push({
                sourceKind,
                sourceName: company.companyName,
                provider: company.atsProvider,
                item: calibrationItem,
              });
            }
          }
        }
      }

      sourceSummaries.push({
        companyName: company.companyName,
        sourceKind,
        provider: company.atsProvider,
        status: "ready",
        warnings: [],
        fetched: jobs.length,
        matcherPasses: sourceMatcherPasses,
        nearMisses: sourceNearMisses,
      });
    } catch (error) {
      sourceSummaries.push({
        companyName: company.companyName,
        sourceKind,
        provider: company.atsProvider,
        status: "error",
        warnings: [error instanceof Error ? error.message : "Unable to fetch source."],
        fetched: 0,
        matcherPasses: 0,
        nearMisses: 0,
      });
    }
  }

  const unreviewedMatcherPasses = filterUnreviewedReviewBatchItems(matcherPasses, reviewedDecisions);
  const matcherPassKeys = new Set(unreviewedMatcherPasses.map((item) => item.reviewKey));
  const supplementalNearMisses = filterUnreviewedNearMissReviewItems(nearMisses.map((nearMiss) => nearMiss.item), reviewedDecisions)
    .filter((item) => !matcherPassKeys.has(item.reviewKey));
  const nearMissSourceByReviewKey = new Map(nearMisses.map((nearMiss) => [nearMiss.item.reviewKey, nearMiss]));
  const nearMissReviewItems = supplementalNearMisses.map((item) => {
      const source = nearMissSourceByReviewKey.get(item.reviewKey);
      return nearMissItem({
        sourceKind: source?.sourceKind ?? "targeted_company_careers",
        sourceName: source?.sourceName ?? item.companyName,
        provider: source?.provider ?? item.provider,
        item,
      });
    });
  const scopedNearMissReviewItems = nearMissReviewItems.filter((item) => item.learningQuality === "profile_fit_candidate");
  const shouldIncludeNearMissSupplements = INCLUDE_NEAR_MISS_SUPPLEMENTS;
  const candidateReviewItems = shouldIncludeNearMissSupplements ? [
    ...unreviewedMatcherPasses,
    ...scopedNearMissReviewItems,
  ] : unreviewedMatcherPasses;
  const dedupedCandidateReviewItems = dedupeReviewBatchItems(candidateReviewItems);
  const selectedItemsBeforeHydration = selectBalancedSourceMix(dedupedCandidateReviewItems, TOTAL_LIMIT);
  const selectedItems: ReviewBatchItem[] = [];

  for (const item of selectedItemsBeforeHydration) {
    selectedItems.push(await hydrateReviewBatchItem(item));
  }

  const detailHydrated = selectedItems.filter((item, index) => {
    const original = selectedItemsBeforeHydration[index];
    return (
      item.responsibilitySnippets.join("\n") !== original.responsibilitySnippets.join("\n") ||
      item.experienceSnippets.join("\n") !== original.experienceSnippets.join("\n") ||
      item.descriptionSnippet !== original.descriptionSnippet
    );
  }).length;
  const batches = buildBalancedBatches(selectedItems, BATCH_COUNT, BATCH_SIZE);
  const generatedAt = new Date().toISOString();
  const selectedMatcherPasses = selectedItems.filter((item) => item.reviewType === "matcher_pass").length;
  const selectedNearMissSupplements = selectedItems.filter((item) => item.reviewType === "near_miss_supplement").length;
  const selectedLearningCandidates = selectedItems.filter((item) => item.learningQuality === "profile_fit_candidate").length;
  const selectedOnlyBadNearMisses = selectedItems.length > 0 && selectedItems.every((item) => (
    item.reviewType === "near_miss_supplement" && item.matchQuality === "bad" && item.learningQuality !== "profile_fit_candidate"
  ));
  const reviewBlockers = [
    !shouldIncludeNearMissSupplements && unreviewedMatcherPasses.length < TOTAL_LIMIT
      ? `Only ${unreviewedMatcherPasses.length} unreviewed matcher-pass roles are available for ${TOTAL_LIMIT} requested review slots.`
      : "",
    !INCLUDE_NEAR_MISS_SUPPLEMENTS && supplementalNearMisses.length > 0
      ? "Near-miss supplements are disabled by default; rerun with --include-near-misses only after selection quality is intentionally scoped."
      : "",
    shouldIncludeNearMissSupplements && selectedItems.length < TOTAL_LIMIT
      ? `Only ${selectedItems.length} scoped review candidates are available for ${TOTAL_LIMIT} requested review slots.`
      : "",
    shouldIncludeNearMissSupplements && selectedNearMissSupplements > 0 && selectedLearningCandidates === 0
      ? "Selected near-miss supplements are not scoped profile-fit learning candidates."
      : "",
    selectedOnlyBadNearMisses
      ? "Selected near-miss supplements are all bad matches, so this is not useful review work."
      : "",
  ].filter(Boolean);
  const reviewReady = selectedItems.length >= TOTAL_LIMIT && reviewBlockers.length === 0;
  const summary = {
    persistence: dashboard.persistence,
    matchingConfigSource: activeMatching.source,
    matchingRulesVersion: activeMatching.matchingConfig.rulesVersion,
    totalSources: searchSources.summary.totalSources,
    broadSources: searchSources.summary.broadSources,
    targetedSources: searchSources.summary.targetedSources,
    fetched: sourceSummaries.reduce((sum, source) => sum + source.fetched, 0),
    matcherPassPool: matcherPasses.length,
    unreviewedMatcherPassPool: unreviewedMatcherPasses.length,
    nearMissPool: supplementalNearMisses.length,
    scopedNearMissPool: scopedNearMissReviewItems.length,
    duplicateCandidatePool: candidateReviewItems.length - dedupedCandidateReviewItems.length,
    selected: selectedItems.length,
    selectedMatcherPasses,
    selectedNearMissSupplements,
    selectedLearningCandidates,
    selectedBroadSources: selectedItems.filter((item) => item.sourceKind === "broad_job_board").length,
    selectedTargetedSources: selectedItems.filter((item) => item.sourceKind === "targeted_company_careers").length,
    reviewReady,
    reviewBlockers,
    reviewBlockedReason: reviewBlockers[0] ?? "",
    includeNearMissSupplements: shouldIncludeNearMissSupplements,
    broadSourceTargetRatio: BROAD_SOURCE_TARGET_RATIO,
    maxItemsPerCompany: MAX_ITEMS_PER_COMPANY,
    detailHydrated,
    batchSize: BATCH_SIZE,
    batches: BATCH_COUNT,
  };
  const report = {
    generatedAt,
    summary,
    sourceSummaries,
    batches,
  };

  writeFileSync(`${OUTPUT_BASE}.json`, JSON.stringify(report, null, 2));
  writeFileSync(`${OUTPUT_BASE}.md`, buildMarkdown(report));

  console.log(JSON.stringify({
    jsonPath: `${OUTPUT_BASE}.json`,
    markdownPath: `${OUTPUT_BASE}.md`,
    summary,
    sourceSummaries,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

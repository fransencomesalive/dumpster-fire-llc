import { cookies } from "next/headers";
import { existsSync, readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { getJobSearchAuthState } from "../../auth";
import { buildConnectorPlan } from "../../connectors";
import { fetchNormalizedConnectorJobs } from "../../connector-runner";
import {
  buildNearMissReviewItem,
  buildSourceCalibrationReviewItem,
  filterUnreviewedNearMissReviewItems,
  selectBalancedNearMissReviewItems,
} from "../../near-miss-review";
import { evaluateConnectorJobRelevance } from "../../relevance";
import {
  isReviewFitVerdict,
  isReviewRationaleChipValue,
  legacyDecisionForReviewVerdict,
  serializeReviewReason,
} from "../../review-feedback";
import {
  getActiveMatchingConfig,
  getDashboardState,
  getNearMissReviewDecisions,
  saveNearMissReviewDecision,
} from "../../store";
import { connectedSearchSources } from "../../search-sources";
import type { NearMissReviewDecisionValue, SourceProvider } from "../../types";

const reviewDecisions = new Set<NearMissReviewDecisionValue>(["approve", "reject", "not_for_me"]);
const sourceProviders = new Set<SourceProvider>(["greenhouse", "lever", "ashby", "icims", "workday", "magnit", "html"]);
const MIN_REVIEW_CANDIDATES_PER_READY_SOURCE = 7;
const REVIEW_BATCH_EXPORT_PATH = "/private/tmp/scans-review-batches.json";

async function requireTuningReviewAuth() {
  const authState = getJobSearchAuthState(await cookies());
  if (!authState.authenticated) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return null;
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 40;
  return Math.max(5, Math.min(80, Math.round(parsed)));
}

function cleanBatchNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(2, Math.round(parsed)));
}

function exportedReviewBatches() {
  if (!existsSync(REVIEW_BATCH_EXPORT_PATH)) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(REVIEW_BATCH_EXPORT_PATH, "utf8")) as {
    summary?: Record<string, unknown>;
    sourceSummaries?: unknown[];
    batches?: Array<Array<Record<string, unknown>>>;
  };

  return parsed;
}

export async function GET() {
  const authError = await requireTuningReviewAuth();
  if (authError) return authError;

  const decisions = await getNearMissReviewDecisions();

  return NextResponse.json({
    decisions,
    decisionCount: decisions.length,
  });
}

export async function POST(request: Request) {
  const authError = await requireTuningReviewAuth();
  if (authError) return authError;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;

  if (body?.action === "buildExportedBatch") {
    const exported = exportedReviewBatches();
    if (!exported?.batches) {
      return NextResponse.json({
        error: "Review batch export not found.",
        detail: "Run scripts/run-dumpster-fire-review-batches.mjs before loading exported dashboard batches.",
      }, { status: 404 });
    }

    const batchNumber = cleanBatchNumber(body.batchNumber);
    const batchItems = exported.batches[batchNumber - 1] ?? [];
    const decisions = await getNearMissReviewDecisions();
    const matchingRulesVersion = String(exported.summary?.matchingRulesVersion ?? "randall-private-2026-06-07-resume-signals");
    const exportedSummary = exported.summary ?? {};
    const selectedOnlyBadNearMisses = batchItems.length > 0 && batchItems.every((item) => (
      cleanText(item.reviewType, 80) === "near_miss_supplement" &&
      cleanText(item.matchQuality, 40) === "bad" &&
      cleanText(item.learningQuality, 80) !== "profile_fit_candidate"
    ));
    const exportedReviewReady = exportedSummary.reviewReady === true && !selectedOnlyBadNearMisses;

    if (!exportedReviewReady) {
      const reviewBlockedReason = cleanText(exportedSummary.reviewBlockedReason, 500) || (
        selectedOnlyBadNearMisses
          ? "This exported batch contains only bad near-miss supplements, so it is blocked until selection quality is repaired."
          : "This exported batch is not review-ready. Regenerate it after matcher-pass or intentionally scoped learning candidates exist."
      );

      return NextResponse.json({
        persistence: exportedSummary.persistence ?? "supabase",
        matchingConfigSource: exportedSummary.matchingConfigSource ?? "fallback_private",
        matchingRulesVersion,
        sourceCoverage: {
          totalSources: exportedSummary.totalSources ?? 0,
          broadSources: exportedSummary.broadSources ?? 0,
          targetedSources: exportedSummary.targetedSources ?? 0,
        },
        batchMode: "exported_review_batch",
        batchNumber,
        companiesChecked: exportedSummary.totalSources ?? 0,
        fetched: exportedSummary.fetched ?? 0,
        nearMisses: exportedSummary.nearMissPool ?? 0,
        previouslyReviewed: 0,
        returned: 0,
        exportedSummary,
        sourceSummaries: exported.sourceSummaries ?? [],
        reviewBlockedReason,
        reviewBatch: [],
        decisions,
        writesEnabled: false,
      });
    }

    const decisionByKey = new Map(decisions.map((decision) => [
      `${decision.reviewKey}:${decision.rulesVersion}`,
      decision,
    ]));
    const ranked = batchItems.map((item) => ({
      reviewKey: cleanText(item.reviewKey, 80),
      externalJobId: cleanText(item.externalJobId, 200),
      companyName: cleanText(item.companyName, 160),
      provider: sourceProviders.has(item.provider as SourceProvider) ? item.provider as SourceProvider : "html" as SourceProvider,
      title: cleanText(item.title, 180),
      location: cleanText(item.location, 160),
      remoteType: cleanText(item.remoteType, 40),
      department: cleanText(item.department, 160),
      employmentType: cleanText(item.employmentType, 60),
      salaryText: cleanText(item.salaryText, 160),
      reviewBucket: cleanText(item.reviewBucket, 120) || cleanText(item.reviewType, 80) || "exported_review_batch",
      reviewType: cleanText(item.reviewType, 80),
      learningQuality: cleanText(item.learningQuality, 80),
      reviewBucketDetail: cleanText(item.reviewBucket, 120),
      sourceKind: cleanText(item.sourceKind, 80),
      sourceName: cleanText(item.sourceName, 160),
      matchQuality: cleanText(item.matchQuality, 40),
      roleFamily: cleanText(item.roleFamily, 120),
      fitSummary: cleanText(item.fitSummary, 500),
      positives: Array.isArray(item.positives) ? item.positives.map((value) => cleanText(value, 220)).filter(Boolean) : [],
      evidence: Array.isArray(item.evidence) ? item.evidence.map((value) => cleanText(value, 220)).filter(Boolean) : [],
      risks: Array.isArray(item.risks) ? item.risks.map((value) => cleanText(value, 220)).filter(Boolean) : [],
      reasonsToInspect: Array.isArray(item.reasonsToInspect) ? item.reasonsToInspect.map((value) => cleanText(value, 220)).filter(Boolean) : [],
      responsibilitySnippets: Array.isArray(item.responsibilitySnippets) ? item.responsibilitySnippets.map((value) => cleanText(value, 260)).filter(Boolean) : [],
      experienceSnippets: Array.isArray(item.experienceSnippets) ? item.experienceSnippets.map((value) => cleanText(value, 260)).filter(Boolean) : [],
      descriptionSnippet: cleanText(item.descriptionSnippet, 600),
      sourceUrl: cleanText(item.sourceUrl, 600),
      decision: decisionByKey.get(`${cleanText(item.reviewKey, 80)}:${matchingRulesVersion}`) ?? null,
    }));

    return NextResponse.json({
      persistence: exported.summary?.persistence ?? "supabase",
      matchingConfigSource: exported.summary?.matchingConfigSource ?? "fallback_private",
      matchingRulesVersion,
      sourceCoverage: {
        totalSources: exported.summary?.totalSources ?? 0,
        broadSources: exported.summary?.broadSources ?? 0,
        targetedSources: exported.summary?.targetedSources ?? 0,
      },
      batchMode: "exported_review_batch",
      batchNumber,
      companiesChecked: exported.summary?.totalSources ?? 0,
      fetched: exported.summary?.fetched ?? 0,
      nearMisses: exported.summary?.nearMissPool ?? 0,
      previouslyReviewed: 0,
      returned: ranked.length,
      exportedSummary: exported.summary ?? {},
      sourceSummaries: exported.sourceSummaries ?? [],
      reviewBatch: ranked,
      decisions,
      writesEnabled: false,
    });
  }

  if (body?.action === "buildBatch") {
    const limit = cleanLimit(body.limit);
    const dashboard = await getDashboardState();
    const activeMatching = await getActiveMatchingConfig();
    const decisions = await getNearMissReviewDecisions();
    const decisionByKey = new Map(decisions.map((decision) => [
      `${decision.reviewKey}:${decision.rulesVersion}`,
      decision,
    ]));
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
            companyName: job.companyName || company.companyName,
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
              companyName: job.companyName || company.companyName,
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
        reviewType: "near_miss_supplement",
        matchQuality: item.decision.matchQuality,
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
        decision: decisionByKey.get(`${item.reviewKey}:${activeMatching.matchingConfig.rulesVersion}`) ?? null,
      }));

    return NextResponse.json({
      persistence: dashboard.persistence,
      matchingConfigSource: activeMatching.source,
      matchingRulesVersion: activeMatching.matchingConfig.rulesVersion,
      sourceCoverage: searchSources.summary,
      companiesChecked: searchSources.sources.length,
      fetched: sourceSummaries.reduce((sum, source) => sum + source.fetched, 0),
      nearMisses: reviewItems.length,
      previouslyReviewed: reviewItems.length - unreviewedItems.length,
      returned: ranked.length,
      selectionSummary: balanced.summary,
      sourceSummaries,
      reviewBatch: ranked,
      decisions,
      writesEnabled: false,
    });
  }

  if (body?.action === "saveDecision") {
    const rawDecision = body.decision;
    const verdict = body.verdict;
    const provider = body.provider;
    const rationaleChips = Array.isArray(body.rationaleChips)
      ? body.rationaleChips.filter(isReviewRationaleChipValue)
      : [];
    const decision = isReviewFitVerdict(verdict)
      ? legacyDecisionForReviewVerdict(verdict)
      : rawDecision;

    if (
      typeof body.reviewKey !== "string" ||
      typeof decision !== "string" ||
      !reviewDecisions.has(decision as NearMissReviewDecisionValue) ||
      typeof provider !== "string" ||
      !sourceProviders.has(provider as SourceProvider) ||
      typeof body.title !== "string" ||
      typeof body.companyName !== "string" ||
      typeof body.sourceUrl !== "string" ||
      typeof body.reviewBucket !== "string" ||
      typeof body.rulesVersion !== "string"
    ) {
      return NextResponse.json({
        error: "Could not save review decision.",
        detail: "Send reviewKey, fit verdict, rationale chips, provider, title, company, sourceUrl, bucket, and rulesVersion.",
      }, { status: 400 });
    }

    const reason = isReviewFitVerdict(verdict)
      ? serializeReviewReason({
          verdict,
          rationale: rationaleChips,
          note: cleanText(body.reason, 500),
        })
      : cleanText(body.reason, 500);

    const savedDecision = await saveNearMissReviewDecision({
      reviewKey: cleanText(body.reviewKey, 80),
      decision: decision as NearMissReviewDecisionValue,
      reason,
      titleSignal: cleanText(body.titleSignal, 120),
      companyName: cleanText(body.companyName, 120),
      provider: provider as SourceProvider,
      title: cleanText(body.title, 160),
      sourceUrl: cleanText(body.sourceUrl, 600),
      reviewBucket: cleanText(body.reviewBucket, 80),
      rulesVersion: cleanText(body.rulesVersion, 120),
    });

    return NextResponse.json({
      decision: savedDecision,
      writesEnabled: true,
    });
  }

  return NextResponse.json({
    error: "Unsupported tuning review action.",
    detail: "Use buildBatch or saveDecision.",
  }, { status: 400 });
}

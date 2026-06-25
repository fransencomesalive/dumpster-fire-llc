import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getJobSearchAuthState } from "../../auth";
import { buildConnectorFetchPreview, buildConnectorPlan, fetchPostingSalary, normalizeConnectorPayload } from "../../connectors";
import type { NormalizedConnectorJob } from "../../connectors";
import { fetchNormalizedConnectorJobs, summarizeConnectorFetch } from "../../connector-runner";
import { duplicateKeyForConnectorJob } from "../../dedupe";
import { evaluateConnectorJobRelevance, filterConnectorJobsByRelevance } from "../../relevance";
import { connectedSearchSources } from "../../search-sources";
import { applyConnectorJobs, ensureSourceCompaniesPersisted, getActiveMatchingConfig, getDashboardState, recordScanLog } from "../../store";

// A full scan fans out across ~90 sources. Run sequentially the fetch phase alone measured ~127s
// (plus ~85s of applies), which blows Vercel's function budget. The scan now fetches with
// host-aware concurrency: different hosts in parallel, but each individual host strictly
// sequential so rate-limited aggregator APIs (Adzuna, Himalayas) are never hit in parallel (naive
// global concurrency triggered 429s and barely helped, because those two hosts dominate the wall
// clock). 60s is provably allowed on this plan (the zombify route already uses it) and each fetch
// is capped at 12s. Avoid a higher value that some plans reject at deploy time.
export const maxDuration = 60;

const BATCH_MAX_STRETCH_JOBS_PER_COMPANY = 15;
// How many distinct hosts to fetch from at once. Hosts are independent, so this can be high; the
// real throttle is the per-host sequential rule below.
const HOST_FETCH_CONCURRENCY = 16;
// Applies are Supabase round-trips against distinct companies; safe to parallelize.
const APPLY_CONCURRENCY = 10;

// Salary hydration: when a surfaced job's source gave no salary, fetch its posting page once and
// extract the salary "on the page". Only the surfaced set (included + capped stretch, ~tens) is
// hydrated, never the thousands of filtered jobs, so this stays inside the 60s scan budget. A
// wall-clock deadline plus a hard count cap guarantee it can never blow the function budget.
const SALARY_HYDRATE_CONCURRENCY = 6;
const SALARY_HYDRATE_MAX_JOBS = 80;
const SALARY_HYDRATE_BUDGET_MS = 14_000;
const SALARY_HYDRATE_FETCH_TIMEOUT_MS = 8_000;

// Run an async map over items with at most `limit` in flight, preserving input order in output.
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

// Group key = the host we fetch from, so all query variants that share a rate-limited API (e.g.
// every Adzuna or Himalayas variant) land in one group and run one at a time. Distinct companies
// on shared ATS hosts (greenhouse/ashby/lever public APIs) also group together; those APIs are
// fast and tolerant, so the small serialization is cheap.
function fetchHostKey(endpointUrl: string | null | undefined, fallback: string): string {
  if (!endpointUrl) return fallback;
  try {
    return new URL(endpointUrl).host;
  } catch {
    return fallback;
  }
}

// Progress events streamed to the client during a scan so it can show what is being pulled and
// when. `summary` (the full result payload) and `error` are sent by the stream wrapper, not here.
type ScanProgressEvent =
  | { type: "start"; total: number }
  | { type: "source"; id: string; label: string; sourceKind: string; status: "fetched" | "blocked" | "error"; jobs: number }
  | { type: "phase"; phase: "matching" | "saving" };

// Turn a source's stored company name into a compact label for the progress feed, e.g.
// "Adzuna Broad Job Board - Creative Producer" -> "Adzuna · Creative Producer". Targeted company
// rows (e.g. "Accenture") are already concise and pass through unchanged.
function scanSourceLabel(companyName: string): string {
  return companyName
    .replace(/\s*Broad Job Board\s*/i, " ")
    .replace(/\s*\bRSS\b\s*/i, " ")
    .replace(/\s+-\s+/g, " · ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function scanLogErrorMessage(result: { companyName: string; warnings: string[] }) {
  return result.warnings.map((warning) => {
    if (result.companyName.startsWith("We Work Remotely RSS") && warning === "RSS feed error") {
      return "We Work Remotely RSS did not return results (RSS feed error)";
    }
    return `${result.companyName}: ${warning}`;
  });
}

async function requireConnectorAuth() {
  const authState = getJobSearchAuthState(await cookies());
  if (!authState.authenticated) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return null;
}

export async function POST(request: Request) {
  const authError = await requireConnectorAuth();
  if (authError) return authError;

  const body = await request.json().catch(() => null) as { action?: unknown; companyId?: unknown; confirmCompanyName?: unknown; confirmBatchApply?: unknown; payload?: unknown } | null;

  const dashboard = await getDashboardState();
  const activeMatching = await getActiveMatchingConfig();

  if (body?.action === "batchPlan" || body?.action === "batchFetchPreview" || body?.action === "batchApplyFetchPreview" || body?.action === "batchScanApply") {
    const searchSources = connectedSearchSources(dashboard.companies, dashboard.searchProfile);
    const plans = searchSources.sources
      .map((source) => ({ ...source, plan: buildConnectorPlan(source.company) }));

    if (body.action === "batchApplyFetchPreview" || body.action === "batchScanApply") {
      if (body.action === "batchApplyFetchPreview" && body.confirmBatchApply !== "APPLY ACTIVE SOURCES") {
        return NextResponse.json(
          { error: "Batch confirmation required." },
          { status: 400 }
        );
      }

      const isScanApply = body.action === "batchScanApply";

      type PlanEntry = (typeof plans)[number];
      type ScanSourceResult = {
        companyId: string;
        companyName: string;
        sourceKind: PlanEntry["sourceKind"];
        provider: PlanEntry["plan"]["provider"];
        status: "applied" | "blocked" | "error";
        warnings: string[];
        inserted: number;
        updated: number;
        closed: number;
        totalFetched?: number;
        totalRelevant?: number;
        filteredOut?: number;
        duplicatesFiltered?: number;
        stretchCapped?: number;
      };

      // The whole phased scan. Identical work for both actions; `onEvent` (set only for the
      // streaming Scan path) reports progress as each source settles. Returns the final summary,
      // which is the exact payload both response shapes use.
      const runBatchScan = async (onEvent?: (event: ScanProgressEvent) => void) => {
        const scanStartedAt = new Date().toISOString();

        // Broad-board sources are generated at request time and have no watchlist row. Persist
        // them before the loop so their jobs satisfy the job_search_jobs -> companies foreign key.
        await ensureSourceCompaniesPersisted(plans.map(({ company }) => company));
        // Read the dashboard once after persisting source companies, then hand the same snapshot to
        // every per-source apply so the scan does one full-dashboard read instead of ~90.
        const scanState = await getDashboardState();
        onEvent?.({ type: "start", total: plans.length });

        const results = new Array<ScanSourceResult>(plans.length);

        // Phase 1 — fetch with host-aware concurrency. Group sources by the host they hit; run the
        // groups in parallel but each group's sources strictly in order, so a rate-limited host is
        // never hit concurrently. Original index is carried through so output order is preserved.
        const hostGroups = new Map<string, Array<{ index: number; entry: PlanEntry }>>();
        plans.forEach((entry, index) => {
          const key = fetchHostKey(entry.plan.endpointUrl, entry.company.id);
          const group = hostGroups.get(key);
          if (group) group.push({ index, entry });
          else hostGroups.set(key, [{ index, entry }]);
        });

        type SourceFetch =
          | { kind: "blocked"; index: number; entry: PlanEntry }
          | { kind: "error"; index: number; entry: PlanEntry; message: string }
          | { kind: "fetched"; index: number; entry: PlanEntry; normalizedJobs: Awaited<ReturnType<typeof fetchNormalizedConnectorJobs>> };

        const emitSource = (entry: PlanEntry, status: "fetched" | "blocked" | "error", jobs: number) =>
          onEvent?.({ type: "source", id: entry.company.id, label: scanSourceLabel(entry.company.companyName), sourceKind: entry.sourceKind, status, jobs });

        const groupedFetches = await mapWithConcurrency(Array.from(hostGroups.values()), HOST_FETCH_CONCURRENCY, async (group) => {
          const out: SourceFetch[] = [];
          for (const { index, entry } of group) {
            if (!entry.plan.canPreview || !entry.plan.endpointUrl) {
              out.push({ kind: "blocked", index, entry });
              emitSource(entry, "blocked", 0);
              continue;
            }
            try {
              const normalizedJobs = await fetchNormalizedConnectorJobs(entry.company);
              out.push({ kind: "fetched", index, entry, normalizedJobs });
              emitSource(entry, "fetched", normalizedJobs.length);
            } catch (error) {
              out.push({ kind: "error", index, entry, message: error instanceof Error ? error.message : "Unable to apply source." });
              emitSource(entry, "error", 0);
            }
          }
          return out;
        });

        // Flatten back to source order so phase 2's dedupe sees the same order the old serial loop did.
        const fetches = groupedFetches.flat().sort((a, b) => a.index - b.index);
        onEvent?.({ type: "phase", phase: "matching" });

        // Phase 2 — relevance + cross-source dedupe, strictly sequential in source order so the
        // shared reservedDuplicateKeys set yields the identical result to the old serial loop. CPU
        // only (no network/DB), so it is cheap.
        const reservedDuplicateKeys = new Set<string>();
        const applyQueue: Array<{
          index: number;
          entry: PlanEntry;
          relevance: ReturnType<typeof filterConnectorJobsByRelevance>;
          totalFetched: number;
        }> = [];

        for (const fetched of fetches) {
          const { company, plan, sourceKind } = fetched.entry;
          if (fetched.kind === "blocked") {
            results[fetched.index] = {
              companyId: company.id,
              companyName: company.companyName,
              sourceKind,
              provider: plan.provider,
              status: "blocked",
              warnings: plan.warnings,
              inserted: 0,
              updated: 0,
              closed: 0,
            };
            continue;
          }
          if (fetched.kind === "error") {
            results[fetched.index] = {
              companyId: company.id,
              companyName: company.companyName,
              sourceKind,
              provider: plan.provider,
              status: "error",
              warnings: [fetched.message],
              inserted: 0,
              updated: 0,
              closed: 0,
            };
            continue;
          }

          const relevance = filterConnectorJobsByRelevance(fetched.normalizedJobs, company, dashboard.searchProfile, {
            reservedDuplicateKeys,
            matchingConfig: activeMatching.matchingConfig,
            maxStretchJobsPerCompany: BATCH_MAX_STRETCH_JOBS_PER_COMPANY,
          });
          relevance.relevantJobs.forEach((job) => reservedDuplicateKeys.add(duplicateKeyForConnectorJob(job)));
          applyQueue.push({ index: fetched.index, entry: fetched.entry, relevance, totalFetched: fetched.normalizedJobs.length });
        }

        // Phase 2b — salary hydration. Fetch the posting page only for surfaced jobs whose source
        // payload carried no salary, then re-run the matcher for the sources that gained one so a
        // now-visible below-floor full-time salary still excludes the role (the gate could not fire
        // while salary was absent). Bounded by deadline + count cap; folds under the matching phase.
        let salaryHydrated = 0;
        const hydrateCandidates: Array<{ entryIndex: number; job: NormalizedConnectorJob }> = [];
        applyQueue.forEach((queued, entryIndex) => {
          for (const job of queued.relevance.relevantJobs) {
            if (!job.salaryText.trim() && /^https?:\/\//i.test(job.sourceUrl)) {
              hydrateCandidates.push({ entryIndex, job });
            }
          }
        });

        if (hydrateCandidates.length > 0) {
          const deadline = Date.now() + SALARY_HYDRATE_BUDGET_MS;
          const touchedEntries = new Set<number>();

          await mapWithConcurrency(hydrateCandidates.slice(0, SALARY_HYDRATE_MAX_JOBS), SALARY_HYDRATE_CONCURRENCY, async ({ entryIndex, job }) => {
            if (Date.now() >= deadline) return;
            const salary = await fetchPostingSalary(job.sourceUrl, { timeoutMs: SALARY_HYDRATE_FETCH_TIMEOUT_MS });
            if (!salary?.salaryText) return;
            job.salaryText = salary.salaryText;
            if (salary.salaryMin !== undefined) job.salaryMin = salary.salaryMin;
            if (salary.salaryMax !== undefined) job.salaryMax = salary.salaryMax;
            salaryHydrated += 1;
            touchedEntries.add(entryIndex);
          });

          for (const entryIndex of touchedEntries) {
            const queued = applyQueue[entryIndex];
            const { company } = queued.entry;
            queued.relevance.relevantJobs = queued.relevance.relevantJobs.filter((job) => {
              const redecision = evaluateConnectorJobRelevance(job, company, dashboard.searchProfile, activeMatching.matchingConfig);
              const decision = queued.relevance.decisions.find((item) => item.externalJobId === job.externalJobId);
              if (decision) {
                decision.included = redecision.included;
                decision.reasons = redecision.reasons;
                decision.risks = redecision.risks;
                decision.matchDecision = redecision.matchDecision;
              }
              return redecision.included;
            });
          }
        }

        onEvent?.({ type: "phase", phase: "saving" });

        // Phase 3 — apply writes concurrently. Distinct companies never share rows and the
        // cross-source dedupe already ran, so parallel applies are safe.
        await mapWithConcurrency(applyQueue, APPLY_CONCURRENCY, async ({ index, entry, relevance, totalFetched }) => {
          const { company, plan, sourceKind } = entry;
          try {
            const result = await applyConnectorJobs(company.id, relevance.relevantJobs, relevance.decisions, activeMatching.matchingConfig, {
              writeScanLog: !isScanApply,
              // The batch path re-reads the dashboard once at the end, so skip the per-source re-read.
              skipReturnState: true,
              // One shared snapshot for the whole scan instead of a full read per source.
              dashboardState: scanState,
            });
            results[index] = {
              companyId: company.id,
              companyName: company.companyName,
              sourceKind,
              provider: plan.provider,
              status: "applied",
              warnings: [],
              totalFetched,
              totalRelevant: relevance.relevantJobs.length,
              filteredOut: relevance.filteredOut,
              duplicatesFiltered: relevance.duplicatesFiltered,
              stretchCapped: relevance.stretchCapped,
              inserted: result.inserted,
              updated: result.updated,
              closed: result.closed,
            };
          } catch (error) {
            results[index] = {
              companyId: company.id,
              companyName: company.companyName,
              sourceKind,
              provider: plan.provider,
              status: "error",
              warnings: [error instanceof Error ? error.message : "Unable to apply source."],
              inserted: 0,
              updated: 0,
              closed: 0,
            };
          }
        });
        const scanCompletedAt = new Date().toISOString();
        const errorResults = results.filter((result) => result.status === "error");

        if (isScanApply) {
          // The scan log is a post-apply side effect: jobs are already persisted. A log-write
          // failure must not silently vanish, but it also should not falsely fail an otherwise
          // successful scan, so surface its cause as a warning in the summary's errors list.
          try {
            await recordScanLog({
              startedAt: scanStartedAt,
              completedAt: scanCompletedAt,
              status: errorResults.length > 0 ? "completed_with_errors" : "completed",
              companiesScanned: plans.length,
              jobsFound: results.reduce((total, result) => total + (result.totalRelevant ?? 0), 0),
              newJobsAdded: results.reduce((total, result) => total + (result.inserted ?? 0), 0),
              jobsUpdated: results.reduce((total, result) => total + (result.updated ?? 0), 0),
              jobsClosed: results.reduce((total, result) => total + (result.closed ?? 0), 0),
              errors: errorResults.flatMap(scanLogErrorMessage),
            });
          } catch (logError) {
            results.push({
              companyId: "scan-log",
              companyName: "Scan log",
              sourceKind: "broad_job_board",
              provider: "html",
              status: "error",
              warnings: [`Scan log write failed: ${logError instanceof Error ? logError.message : "unknown error"}`],
              inserted: 0,
              updated: 0,
              closed: 0,
            });
          }
        }

        const aggregateDashboardState = await getDashboardState();

        return {
          sourceCoverage: searchSources.summary,
          results,
          applied: results.filter((result) => result.status === "applied").length,
          blocked: results.filter((result) => result.status === "blocked").length,
          errors: results.filter((result) => result.status === "error").length,
          salaryHydrated,
          dashboardState: aggregateDashboardState,
          mode: isScanApply ? "legacy_scan_apply" : "confirmed_batch_apply",
          writesEnabled: true,
        };
      };

      // The user-facing Scan streams NDJSON progress; the manual "APPLY ACTIVE SOURCES" path keeps
      // its single JSON response (its consumer expects JSON).
      if (isScanApply) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (event: object) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            try {
              const summary = await runBatchScan(send);
              send({ type: "summary", ...summary });
            } catch (error) {
              send({ type: "error", message: error instanceof Error ? error.message : "Unable to run scan." });
            } finally {
              controller.close();
            }
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-store, no-transform",
            "X-Accel-Buffering": "no",
          },
        });
      }

      const summary = await runBatchScan();
      return NextResponse.json(summary);
    }

    if (body.action === "batchFetchPreview") {
      const results = await Promise.all(plans.map(async ({ company, sourceKind }) => {
        const summary = await summarizeConnectorFetch(company, dashboard.jobs, dashboard.searchProfile, activeMatching.matchingConfig, BATCH_MAX_STRETCH_JOBS_PER_COMPANY);
        return {
          ...summary,
          sourceKind,
        };
      }));

      return NextResponse.json({
        sourceCoverage: searchSources.summary,
        results,
        ready: results.filter((result) => result.status === "ready").length,
        blocked: results.filter((result) => result.status === "blocked").length,
        errors: results.filter((result) => result.status === "error").length,
        writesEnabled: false,
      });
    }

    const planList = plans.map(({ plan }) => plan);

    return NextResponse.json({
      sourceCoverage: searchSources.summary,
      plans: planList,
      ready: planList.filter((plan) => plan.canPreview).length,
      blocked: planList.filter((plan) => !plan.canPreview).length,
      matchingConfigSource: activeMatching.source,
      matchingRulesVersion: activeMatching.matchingConfig.rulesVersion,
      liveFetchEnabled: false,
      writesEnabled: false,
    });
  }

  if (!body || typeof body.companyId !== "string") {
    return NextResponse.json({ error: "Expected companyId." }, { status: 400 });
  }

  const company = dashboard.companies.find((item) => item.id === body.companyId);

  if (!company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const plan = buildConnectorPlan(company);

  if (body.action === "previewPayload" || body.action === "applyPayload") {
    const normalizedJobs = normalizeConnectorPayload(body.payload, company);
    const relevance = filterConnectorJobsByRelevance(normalizedJobs, company, dashboard.searchProfile, {
      matchingConfig: activeMatching.matchingConfig,
    });

    if (body.action === "applyPayload") {
      if (body.confirmCompanyName !== company.companyName) {
        return NextResponse.json(
          { error: "Company confirmation required.", plan },
          { status: 400 }
        );
      }

      const result = await applyConnectorJobs(company.id, relevance.relevantJobs, relevance.decisions, activeMatching.matchingConfig);

      return NextResponse.json({
        apply: {
          totalFetched: normalizedJobs.length,
          totalRelevant: relevance.relevantJobs.length,
          filteredOut: relevance.filteredOut,
          duplicatesFiltered: relevance.duplicatesFiltered,
          inserted: result.inserted,
          updated: result.updated,
          closed: result.closed,
        },
        dashboardState: result.dashboardState,
        writesEnabled: true,
      });
    }

    return NextResponse.json({
      preview: buildConnectorFetchPreview(plan, relevance.relevantJobs, dashboard.jobs, new Date().toISOString(), normalizedJobs.length, relevance.filteredOut),
      liveFetchEnabled: false,
      writesEnabled: false,
    });
  }

  if (body.action === "fetchPreview" || body.action === "applyFetchPreview") {
    if (!plan.canPreview || !plan.endpointUrl) {
      return NextResponse.json({ error: "Connector is not ready.", plan }, { status: 422 });
    }

    if (body.action === "applyFetchPreview" && body.confirmCompanyName !== company.companyName) {
      return NextResponse.json(
        { error: "Company confirmation required.", plan },
        { status: 400 }
      );
    }

    try {
      const normalizedJobs = await fetchNormalizedConnectorJobs(company);
      const relevance = filterConnectorJobsByRelevance(normalizedJobs, company, dashboard.searchProfile, {
        matchingConfig: activeMatching.matchingConfig,
      });

      if (body.action === "applyFetchPreview") {
        const result = await applyConnectorJobs(company.id, relevance.relevantJobs, relevance.decisions, activeMatching.matchingConfig);

        return NextResponse.json({
          apply: {
            totalFetched: normalizedJobs.length,
            totalRelevant: relevance.relevantJobs.length,
            filteredOut: relevance.filteredOut,
            duplicatesFiltered: relevance.duplicatesFiltered,
            inserted: result.inserted,
            updated: result.updated,
            closed: result.closed,
          },
          dashboardState: result.dashboardState,
          writesEnabled: true,
        });
      }

      return NextResponse.json({
        preview: buildConnectorFetchPreview(plan, relevance.relevantJobs, dashboard.jobs, new Date().toISOString(), normalizedJobs.length, relevance.filteredOut),
        liveFetchEnabled: true,
        writesEnabled: false,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unable to fetch source.", plan },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({
    plan,
    liveFetchEnabled: false,
  });
}

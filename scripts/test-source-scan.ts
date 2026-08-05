import assert from "node:assert/strict";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";
import {
  inspectPublicPostingLink,
  isGenericJobLandingUrl,
  reconcileSavedPursuitLinkHealth,
} from "../lib/public-jobs/link-health";
import { runSourceScan } from "../lib/scan/source-scan";
import { loadActiveJobSources, type JobSourceRecord } from "../lib/scan/sources/registry";
import type { JobSource, NormalizedConnectorJob } from "../lib/scan/sources/types";

const now = "2026-06-29T12:00:00.000Z";

function jobSource(overrides: Partial<JobSourceRecord> = {}): JobSourceRecord {
  return {
    id: "src-1",
    companyName: "Useful Studio",
    websiteUrl: "https://useful.example",
    careersUrl: "",
    atsProvider: "greenhouse",
    atsBoardToken: "usefulstudio",
    status: "active",
    workdayVariants: [],
    ...overrides,
  };
}

function connectorJob(overrides: Partial<NormalizedConnectorJob> = {}): NormalizedConnectorJob {
  return {
    companyId: "src-1",
    externalJobId: "job-1",
    sourceProvider: "greenhouse",
    sourceUrl: "https://boards.greenhouse.io/usefulstudio/jobs/1",
    applyUrl: "https://boards.greenhouse.io/usefulstudio/jobs/1",
    title: "Program Director",
    companyName: "Useful Studio",
    location: "Remote - US",
    remoteType: "remote",
    employmentType: "full-time",
    department: "Operations",
    salaryMin: 120000,
    salaryMax: 150000,
    salaryText: "$120,000 - $150,000",
    descriptionText: "Lead delivery.",
    rawPayload: {},
    ...overrides,
  };
}

type Call = { table: string; method: string; query?: string; body: unknown };

function recordingRequest(): { request: PublicProfileRepositoryRequest; calls: Call[] } {
  const calls: Call[] = [];
  const request: PublicProfileRepositoryRequest = async <T>(
    table: string,
    options: Parameters<PublicProfileRepositoryRequest>[1],
  ) => {
    calls.push({ table, method: options.method ?? "GET", query: options.query, body: options.body });
    return [] as T;
  };
  return { request, calls };
}

async function main() {
  // ---- Global registry excludes private user-owned boards ----
  {
    let query = "";
    await loadActiveJobSources(async <T>(_table: string, options: Parameters<PublicProfileRepositoryRequest>[1]) => {
      query = decodeURIComponent(options.query ?? "");
      return [] as T;
    });
    assert.match(query, /owner_user_id=is\.null/);
    assert.match(query, /status=eq\.active/);
  }

  // ---- Empty source list is a safe no-op ----
  {
    const { request, calls } = recordingRequest();
    const result = await runSourceScan(request, {
      now: () => now,
      loadSources: async () => [],
      fetchSource: async () => { throw new Error("should not fetch with no sources"); },
    });
    assert.equal(result.totalSources, 0);
    assert.equal(result.totalUpserted, 0);
    assert.equal(result.linkHealth.checked, 0);
    assert.deepEqual(calls.map((call) => call.table), ["pursuits"]);
  }

  // ---- Happy path: fetch + upsert + mark ingested ----
  {
    const { request, calls } = recordingRequest();
    const fetched: Array<{ source: JobSource; options: unknown }> = [];
    const result = await runSourceScan(request, {
      now: () => now,
      loadSources: async () => [jobSource({ id: "src-1" })],
      fetchSource: async (source, options) => {
        fetched.push({ source, options });
        return [connectorJob({
          sourceUrl: "https://boards.greenhouse.io/usefulstudio/jobs/1",
          descriptionText: "Responsibilities Own the roadmap end to end. Requirements 5+ years of product experience.",
        })];
      },
    });

    assert.equal(fetched.length, 1);
    assert.deepEqual((fetched[0].options as { workdayVariants?: string[] }).workdayVariants, []);

    const upsert = calls.find((call) => call.table === "jobs");
    assert.ok(upsert, "jobs upsert should occur");
    assert.equal(upsert?.method, "POST");
    assert.equal(upsert?.query, "?on_conflict=source,source_url,owner_user_id");
    const rows = upsert?.body as Array<Record<string, unknown>>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, "greenhouse");
    assert.equal(rows[0].source_url, "https://boards.greenhouse.io/usefulstudio/jobs/1");
    assert.equal(rows[0].external_job_id, "job-1");
    assert.equal(rows[0].apply_url, "https://boards.greenhouse.io/usefulstudio/jobs/1");
    assert.equal(rows[0].department, "Operations");
    assert.equal(rows[0].salary_min, 120000);
    assert.equal(rows[0].salary_max, 150000);
    assert.equal(rows[0].scraped_at, now);
    // Posting sections are parsed + stored (heuristic) when the description has headings.
    assert.deepEqual(rows[0].responsibilities, ["Own the roadmap end to end"]);
    assert.deepEqual(rows[0].required_experience, ["5+ years of product experience."]);

    const mark = calls.find((call) => call.table === "job_sources");
    assert.ok(mark, "source should be marked ingested");
    assert.equal(mark?.method, "PATCH");
    assert.deepEqual(mark?.body, { last_scanned_at: now, last_error: null, updated_at: now });

    assert.equal(result.totalUpserted, 1);
    assert.equal(result.sources[0].status, "scanned");
  }

  // ---- Dedupe by source_url, drop empty source_url ----
  {
    const { request, calls } = recordingRequest();
    await runSourceScan(request, {
      now: () => now,
      loadSources: async () => [jobSource()],
      fetchSource: async () => [
        connectorJob({ externalJobId: "a", sourceUrl: "https://x/1" }),
        connectorJob({ externalJobId: "b", sourceUrl: "https://x/1" }),
        connectorJob({ externalJobId: "c", sourceUrl: "   " }),
        connectorJob({ externalJobId: "d", sourceUrl: "https://x/2" }),
      ],
    });
    const upsert = calls.find((call) => call.table === "jobs");
    const rows = upsert?.body as Array<Record<string, unknown>>;
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.source_url), ["https://x/1", "https://x/2"]);
  }

  // ---- maxJobsPerSource cap ----
  {
    const { request, calls } = recordingRequest();
    await runSourceScan(request, {
      now: () => now,
      maxJobsPerSource: 1,
      loadSources: async () => [jobSource()],
      fetchSource: async () => [
        connectorJob({ externalJobId: "a", sourceUrl: "https://x/1" }),
        connectorJob({ externalJobId: "b", sourceUrl: "https://x/2" }),
      ],
    });
    const upsert = calls.find((call) => call.table === "jobs");
    assert.equal((upsert?.body as unknown[]).length, 1);
  }

  // ---- Per-source error isolation ----
  {
    const { request, calls } = recordingRequest();
    const result = await runSourceScan(request, {
      now: () => now,
      loadSources: async () => [
        jobSource({ id: "src-bad", companyName: "Bad Co" }),
        jobSource({ id: "src-good", companyName: "Good Co" }),
      ],
      fetchSource: async (sourceArg) => {
        if (sourceArg.id === "src-bad") throw new Error("Source returned 500.");
        return [connectorJob({ sourceUrl: "https://good/1" })];
      },
    });

    assert.equal(result.sources.length, 2);
    const bad = result.sources.find((entry) => entry.sourceId === "src-bad");
    const good = result.sources.find((entry) => entry.sourceId === "src-good");
    assert.equal(bad?.status, "error");
    assert.equal(bad?.error, "Source returned 500.");
    assert.equal(good?.status, "scanned");
    assert.equal(good?.upserted, 1);

    // The failed source is still marked (with its error), and the good source still upserts.
    const badMark = calls.find((call) => call.table === "job_sources" && (call.body as Record<string, unknown>).last_error === "Source returned 500.");
    assert.ok(badMark, "failed source should record its error");
    const goodUpsert = calls.find((call) => call.table === "jobs");
    assert.ok(goodUpsert, "good source should still upsert");
  }

  // ---- Different hosts overlap; the same host stays sequential; result order is stable ----
  {
    const { request } = recordingRequest();
    let globalActive = 0;
    let maxGlobalActive = 0;
    const hostActive = new Map<string, number>();
    const maxHostActive = new Map<string, number>();
    const sources = [
      jobSource({ id: "greenhouse-1", companyName: "Greenhouse One", atsProvider: "greenhouse" }),
      jobSource({ id: "ashby-1", companyName: "Ashby One", atsProvider: "ashby" }),
      jobSource({ id: "greenhouse-2", companyName: "Greenhouse Two", atsProvider: "greenhouse" }),
    ];
    const result = await runSourceScan(request, {
      now: () => now,
      hostConcurrency: 3,
      loadSources: async () => sources,
      fetchSource: async (sourceArg) => {
        const host = sourceArg.atsProvider;
        globalActive += 1;
        maxGlobalActive = Math.max(maxGlobalActive, globalActive);
        hostActive.set(host, (hostActive.get(host) ?? 0) + 1);
        maxHostActive.set(host, Math.max(maxHostActive.get(host) ?? 0, hostActive.get(host) ?? 0));
        await new Promise((resolve) => setTimeout(resolve, 15));
        hostActive.set(host, (hostActive.get(host) ?? 1) - 1);
        globalActive -= 1;
        return [];
      },
    });
    assert.ok(maxGlobalActive >= 2, "different hosts should fetch concurrently");
    assert.equal(maxHostActive.get("greenhouse"), 1, "same-host sources must stay sequential");
    assert.deepEqual(result.sources.map((source) => source.sourceId), sources.map((source) => source.id));
  }

  // ---- Broad postings retain explicit source identity instead of generic html ----
  {
    const { request, calls } = recordingRequest();
    await runSourceScan(request, {
      now: () => now,
      loadSources: async () => [jobSource({ atsProvider: "html", careersUrl: "https://remotive.com/api/remote-jobs" })],
      fetchSource: async () => [connectorJob({
        sourceProvider: "html",
        sourceUrl: "https://remotive.com/remote-jobs/project-management/program-manager-1",
      })],
    });
    const upsert = calls.find((call) => call.table === "jobs");
    assert.equal((upsert?.body as Array<Record<string, unknown>>)[0].source, "remotive");
  }

  // ---- Workday variants are passed through to the fetcher ----
  {
    const { request } = recordingRequest();
    let seenVariants: string[] | undefined;
    await runSourceScan(request, {
      now: () => now,
      loadSources: async () => [jobSource({ atsProvider: "workday", workdayVariants: ["producer", "director"] })],
      fetchSource: async (_source, options) => {
        seenVariants = options.workdayVariants;
        return [];
      },
    });
    assert.deepEqual(seenVariants, ["producer", "director"]);
  }

  // ---- Empty-section rows omit the section columns (so LLM gap-fills aren't clobbered) ----
  {
    const { request, calls } = recordingRequest();
    await runSourceScan(request, {
      now: () => now,
      loadSources: async () => [jobSource()],
      fetchSource: async () => [
        connectorJob({ externalJobId: "a", sourceUrl: "https://x/withheadings", descriptionText: "Responsibilities Own delivery end to end across teams." }),
        connectorJob({ externalJobId: "b", sourceUrl: "https://x/plain", descriptionText: "Just a short blurb with no recognizable headings at all." }),
      ],
    });
    const allRows = calls.filter((call) => call.table === "jobs").flatMap((call) => call.body as Array<Record<string, unknown>>);
    const withHeadings = allRows.find((row) => row.source_url === "https://x/withheadings");
    const plain = allRows.find((row) => row.source_url === "https://x/plain") ?? {};
    assert.ok((withHeadings?.responsibilities as string[]).length > 0);
    assert.equal("responsibilities" in plain, false);
    assert.equal("required_experience" in plain, false);
  }

  // ---- Link-health classification is conservative and provider-neutral ----
  {
    const publicResolver = async () => [{ address: "93.184.216.34", family: 4 }];
    const redirectingFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://jobs.example/posting/123") {
        return new Response(null, { status: 302, headers: { location: "/jobs" } });
      }
      assert.equal(url, "https://jobs.example/jobs");
      return new Response(null, { status: 200 });
    };
    const landing = await inspectPublicPostingLink("https://jobs.example/posting/123", {
      now: () => now,
      fetchImpl: redirectingFetch,
      resolveHostname: publicResolver,
    });
    assert.equal(landing.status, "gone");
    assert.equal(landing.reason, "generic_landing_redirect");
    assert.equal(landing.resolvedUrl, "https://jobs.example/jobs");
    assert.equal(isGenericJobLandingUrl("https://jobs.example/en/careers/"), true);
    assert.equal(isGenericJobLandingUrl("https://jobs.example/en/jobs/123"), false);

    const methods: string[] = [];
    const gone = await inspectPublicPostingLink("https://jobs.example/posting/404", {
      now: () => now,
      resolveHostname: publicResolver,
      fetchImpl: async (_input, init) => {
        methods.push(init?.method ?? "GET");
        return new Response(null, { status: 404 });
      },
    });
    assert.equal(gone.status, "gone");
    assert.equal(gone.reason, "http_gone");
    assert.deepEqual(methods, ["HEAD", "GET"], "HEAD 404 must be confirmed by GET before retiring a link");

    const blocked = await inspectPublicPostingLink("https://jobs.example/posting/blocked", {
      now: () => now,
      resolveHostname: publicResolver,
      fetchImpl: async () => new Response(null, { status: 403 }),
    });
    assert.equal(blocked.status, "uncertain");
    assert.equal(blocked.reason, "access_limited");

    let unsafeFetched = false;
    const unsafe = await inspectPublicPostingLink("http://127.0.0.1/admin", {
      now: () => now,
      fetchImpl: async () => {
        unsafeFetched = true;
        return new Response(null, { status: 200 });
      },
    });
    assert.equal(unsafe.status, "gone");
    assert.equal(unsafe.reason, "unsafe_url");
    assert.equal(unsafeFetched, false, "unsafe destinations must be rejected before network access");

    const dnsFailure = await inspectPublicPostingLink("https://missing.example/job/1", {
      now: () => now,
      resolveHostname: async () => { throw new Error("getaddrinfo ENOTFOUND missing.example"); },
      fetchImpl: async () => { throw new Error("DNS failure must stop before fetch"); },
    });
    assert.equal(dnsFailure.status, "uncertain");
    assert.equal(dnsFailure.reason, "network_error");
  }

  // ---- Reconciliation persists current health and expires only confirmed-gone scan rows ----
  {
    const calls: Call[] = [];
    const request: PublicProfileRepositoryRequest = async <T>(
      table: string,
      options: Parameters<PublicProfileRepositoryRequest>[1],
    ) => {
      calls.push({ table, method: options.method ?? "GET", query: options.query, body: options.body });
      if (table === "pursuits") return [
        { job_id: "job-gone" },
        { job_id: "job-uncertain" },
        { job_id: "job-private" },
        { job_id: "job-fresh" },
      ] as T;
      if (table === "jobs" && (options.method ?? "GET") === "GET") return [
        { id: "job-gone", source_url: "https://jobs.example/gone", owner_user_id: null, link_status: "unknown", link_checked_at: null },
        { id: "job-uncertain", source_url: "https://jobs.example/uncertain", owner_user_id: null, link_status: "gone", link_checked_at: null },
        { id: "job-private", source_url: "https://private.example/job", owner_user_id: "user-1", link_status: "unknown", link_checked_at: null },
        { id: "job-fresh", source_url: "https://jobs.example/fresh", owner_user_id: null, link_status: "healthy", link_checked_at: now },
      ] as T;
      return [] as T;
    };
    const result = await reconcileSavedPursuitLinkHealth(request, {
      now: () => now,
      concurrency: 2,
      inspectLink: async (url) => url.endsWith("/gone")
        ? { status: "gone", reason: "http_gone", checkedAt: now, httpStatus: 404 }
        : { status: "uncertain", reason: "access_limited", checkedAt: now, httpStatus: 403 },
    });
    assert.deepEqual(result, {
      candidates: 4,
      checked: 2,
      healthy: 0,
      gone: 1,
      uncertain: 1,
      skippedPrivate: 1,
      skippedFresh: 1,
    });
    const jobPatches = calls.filter((call) => call.table === "jobs" && call.method === "PATCH");
    assert.equal(jobPatches.length, 2);
    assert.ok(jobPatches.some((call) => (call.body as Record<string, unknown>).link_health_reason === "http_gone"));
    const expirations = calls.filter((call) => call.table === "job_scan_results" && call.method === "PATCH");
    assert.equal(expirations.length, 2);
    assert.ok(expirations.some((call) => /job_id=eq\.job-gone/.test(decodeURIComponent(call.query ?? ""))));
    assert.ok(expirations.some((call) => /job_id=eq\.job-uncertain/.test(decodeURIComponent(call.query ?? ""))));
    assert.ok(jobPatches.some((call) => {
      const query = decodeURIComponent(call.query ?? "");
      const body = call.body as Record<string, unknown>;
      return /id=eq\.job-uncertain/.test(query)
        && body.link_status === "gone"
        && body.link_health_reason === "gone_recheck_access_limited";
    }));
    assert.deepEqual(expirations[0].body, { status: "expired", updated_at: now });
  }

  console.log("public jobs source scan: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

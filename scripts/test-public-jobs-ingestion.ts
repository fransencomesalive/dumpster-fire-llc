import assert from "node:assert/strict";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";
import { runJobIngestion } from "../lib/public-jobs/ingestion";
import type { JobSourceRecord } from "../lib/public-jobs/job-sources";
import type { JobSource, NormalizedConnectorJob } from "../lib/job-connectors/types";

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
  // ---- Empty source list is a safe no-op ----
  {
    const { request, calls } = recordingRequest();
    const result = await runJobIngestion(request, {
      now: () => now,
      loadSources: async () => [],
      fetchSource: async () => { throw new Error("should not fetch with no sources"); },
    });
    assert.equal(result.totalSources, 0);
    assert.equal(result.totalUpserted, 0);
    assert.equal(calls.length, 0);
  }

  // ---- Happy path: fetch + upsert + mark ingested ----
  {
    const { request, calls } = recordingRequest();
    const fetched: Array<{ source: JobSource; options: unknown }> = [];
    const result = await runJobIngestion(request, {
      now: () => now,
      loadSources: async () => [jobSource({ id: "src-1" })],
      fetchSource: async (source, options) => {
        fetched.push({ source, options });
        return [connectorJob({ sourceUrl: "https://boards.greenhouse.io/usefulstudio/jobs/1" })];
      },
    });

    assert.equal(fetched.length, 1);
    assert.deepEqual((fetched[0].options as { workdayVariants?: string[] }).workdayVariants, []);

    const upsert = calls.find((call) => call.table === "jobs");
    assert.ok(upsert, "jobs upsert should occur");
    assert.equal(upsert?.method, "POST");
    assert.equal(upsert?.query, "?on_conflict=source,source_url");
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

    const mark = calls.find((call) => call.table === "job_sources");
    assert.ok(mark, "source should be marked ingested");
    assert.equal(mark?.method, "PATCH");
    assert.deepEqual(mark?.body, { last_ingested_at: now, last_error: null, updated_at: now });

    assert.equal(result.totalUpserted, 1);
    assert.equal(result.sources[0].status, "ingested");
  }

  // ---- Dedupe by source_url, drop empty source_url ----
  {
    const { request, calls } = recordingRequest();
    await runJobIngestion(request, {
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
    await runJobIngestion(request, {
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
    const result = await runJobIngestion(request, {
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
    assert.equal(good?.status, "ingested");
    assert.equal(good?.upserted, 1);

    // The failed source is still marked (with its error), and the good source still upserts.
    const badMark = calls.find((call) => call.table === "job_sources" && (call.body as Record<string, unknown>).last_error === "Source returned 500.");
    assert.ok(badMark, "failed source should record its error");
    const goodUpsert = calls.find((call) => call.table === "jobs");
    assert.ok(goodUpsert, "good source should still upsert");
  }

  // ---- Workday variants are passed through to the fetcher ----
  {
    const { request } = recordingRequest();
    let seenVariants: string[] | undefined;
    await runJobIngestion(request, {
      now: () => now,
      loadSources: async () => [jobSource({ atsProvider: "workday", workdayVariants: ["producer", "director"] })],
      fetchSource: async (_source, options) => {
        seenVariants = options.workdayVariants;
        return [];
      },
    });
    assert.deepEqual(seenVariants, ["producer", "director"]);
  }

  console.log("public jobs ingestion: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import assert from "node:assert/strict";
import { handlePublicJobFromLinkRequest } from "../lib/public-jobs/api";
import { ingestJobFromLink } from "../lib/public-jobs/ingest-link";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";

const now = "2026-07-14T18:00:00.000Z";
const publicResolver = async () => [{ address: "93.184.216.34", family: 4 }];

type RepositoryCall = {
  table: string;
  method: string;
  query?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

function mockRequest(
  respond: (call: RepositoryCall) => unknown,
  mockOptions: { rpc?: (call: RepositoryCall) => unknown } = {},
): {
  request: PublicProfileRepositoryRequest;
  calls: RepositoryCall[];
} {
  const calls: RepositoryCall[] = [];
  const request: PublicProfileRepositoryRequest = async <T>(
    table: string,
    options: Parameters<PublicProfileRepositoryRequest>[1],
  ) => {
    const call = {
      table,
      method: options.method ?? "GET",
      query: options.query,
      body: options.body,
      headers: options.headers,
    };
    calls.push(call);
    if (table.startsWith("rpc/")) {
      if (mockOptions.rpc) return mockOptions.rpc(call) as T;
      if (table === "rpc/claim_job_link_extraction") {
        return [{
          claimed: true,
          claim_token: "00000000-0000-0000-0000-000000000099",
          claim_state: "claimed",
          attempt_count: 1,
        }] as T;
      }
      return [{ applied: true, claim_state: "succeeded", last_outcome: "success" }] as T;
    }
    return respond(call) as T;
  };
  return { request, calls };
}

async function main() {
  // Unsafe URLs stop before storage, fetch, or model work.
  {
    let fetched = false;
    let modeled = false;
    const { request, calls } = mockRequest(() => []);
    const result = await ingestJobFromLink({ url: "http://internal.example/job/1", userId: "user-1" }, {
      request,
      resolveHostname: async () => [{ address: "127.0.0.1", family: 4 }],
      fetchImpl: async () => {
        fetched = true;
        return new Response();
      },
      callModel: async () => {
        modeled = true;
        return undefined;
      },
    });
    assert.deepEqual(result, { status: "unsafe_url" });
    assert.equal(calls.length, 0);
    assert.equal(fetched, false);
    assert.equal(modeled, false);
  }

  // A readable posting is normalized, extracted, and inserted once.
  {
    const insertedRow = { id: "job-1", title: "Product Director", company_name: "Useful Co" };
    const { request, calls } = mockRequest((call) => call.method === "POST" ? [insertedRow] : []);
    let fetchedUrl = "";
    let modelInput = "";
    const result = await ingestJobFromLink({
      url: " https://jobs.example.test/openings/123#apply ",
      userId: "user-1",
    }, {
      request,
      resolveHostname: publicResolver,
      fetchImpl: async (url) => {
        fetchedUrl = String(url);
        return new Response("<html><body><h1>Product Director</h1><p>Lead useful product work.</p></body></html>", {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
      callModel: async ({ user }) => {
        modelInput = user;
        return JSON.stringify({
          title: "Product Director",
          companyName: "Useful Co",
          description: "Responsibilities: Lead useful product work. Required Qualifications: 8 years of product leadership.",
          responsibilities: ["Lead useful product work."],
          requiredExperience: ["8 years of product leadership."],
        });
      },
      now: () => now,
    });

    assert.deepEqual(result, {
      status: "ingested",
      jobId: "job-1",
      title: "Product Director",
      company: "Useful Co",
    });
    assert.equal(fetchedUrl, "https://jobs.example.test/openings/123");
    assert.match(modelInput, /Product Director/);
    const insert = calls.find((call) => call.table === "jobs" && call.method === "POST");
    assert.ok(insert);
    const insertBody = insert.body as Record<string, unknown>;
    assert.match(String(insertBody.source_content_hash), /^[0-9a-f]{64}$/);
    const insertWithoutHash = { ...insertBody };
    delete insertWithoutHash.source_content_hash;
    assert.deepEqual(insertWithoutHash, {
      source: "user_link",
      source_url: "https://jobs.example.test/openings/123",
      owner_user_id: "user-1",
      company_name: "Useful Co",
      title: "Product Director",
      description: "Responsibilities: Lead useful product work. Required Qualifications: 8 years of product leadership.",
      responsibilities: ["Lead useful product work."],
      required_experience: ["8 years of product leadership."],
      scraped_at: now,
      updated_at: now,
    });
    assert.match(insert.query ?? "", /on_conflict=source,source_url,owner_user_id/);
    const claimCall = calls.find((call) => call.table === "rpc/claim_job_link_extraction");
    const finishCall = calls.find((call) => call.table === "rpc/finish_job_link_extraction");
    assert.ok(claimCall);
    assert.ok(finishCall);
    assert.match(
      String((claimCall?.body as Record<string, unknown>).p_source_url_hash),
      /^[0-9a-f]{64}$/,
    );
    assert.equal(
      JSON.stringify(claimCall?.body).includes("https://jobs.example.test"),
      false,
    );
    assert.equal(
      (finishCall?.body as Record<string, unknown>).p_outcome,
      "success",
    );
    // The dedupe lookup only sees shared-pool rows and the caller's own rows.
    const dedupe = calls.find((call) => call.method === "GET");
    assert.ok(dedupe);
    assert.match(decodeURIComponent(dedupe.query ?? ""), /or=\(owner_user_id\.is\.null,owner_user_id\.eq\.user-1\)/);
  }

  // A complete JSON-LD JobPosting is deterministic and never calls the model.
  {
    const insertedRow = { id: "job-ld", title: "Brand Project Manager", company_name: "Kit" };
    const { request, calls } = mockRequest((call) => call.method === "POST" ? [insertedRow] : []);
    let modeled = false;
    const shellHtml = [
      "<html><head>",
      '<script type="application/ld+json">',
      JSON.stringify({
        "@context": "https://schema.org/",
        "@type": "JobPosting",
        title: "Brand Project Manager",
        hiringOrganization: { "@type": "Organization", name: "Kit" },
        employmentType: "CONTRACTOR",
        description: "<p>Kit is hiring a Brand Project Manager.</p><ul><li>Run brand production timelines.</li></ul>",
      }),
      "</script>",
      '<script>window.__appData = {"maintenanceMode":false};</script>',
      "</head><body><div id=\"root\">You need to enable JavaScript to run this app.</div></body></html>",
    ].join("");
    const result = await ingestJobFromLink({ url: "https://jobs.example.test/kit/brand-pm", userId: "user-1" }, {
      request,
      resolveHostname: publicResolver,
      fetchImpl: async () => new Response(shellHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
      callModel: async () => {
        modeled = true;
        throw new Error("Complete JSON-LD must not call the model");
      },
      now: () => now,
    });
    assert.equal(result.status, "ingested");
    assert.equal(modeled, false);
    assert.equal(
      calls.some((call) => call.table === "rpc/claim_job_link_extraction"),
      false,
    );
    const insert = calls.find((call) => call.table === "jobs" && call.method === "POST");
    assert.ok(insert);
    const body = insert?.body as Record<string, unknown>;
    assert.equal(body.title, "Brand Project Manager");
    assert.equal(body.company_name, "Kit");
    assert.match(String(body.description), /Run brand production timelines/);
    assert.match(String(body.source_content_hash), /^[0-9a-f]{64}$/);
  }

  // The same user can reuse a successful extraction for identical content at a
  // different URL. The new URL still receives its own private jobs row.
  {
    const cached = {
      id: "job-cache-source",
      title: "Cached Role",
      company_name: "Cached Co",
      description: "Own the cached work.",
      responsibilities: ["Own the cached work."],
      required_experience: ["Five years of experience."],
    };
    const insertedRow = { id: "job-cache-copy", title: "Cached Role", company_name: "Cached Co" };
    const { request, calls } = mockRequest((call) => {
      if (call.method === "POST") return [insertedRow];
      if (decodeURIComponent(call.query ?? "").includes("source_content_hash=eq.")) return [cached];
      return [];
    });
    let modeled = false;
    const result = await ingestJobFromLink({
      url: "https://jobs.example.test/cache-copy",
      userId: "user-cache",
    }, {
      request,
      resolveHostname: publicResolver,
      fetchImpl: async () => new Response("<h1>Cached Role</h1><p>Own the cached work.</p>", {
        headers: { "Content-Type": "text/html" },
      }),
      callModel: async () => {
        modeled = true;
        return undefined;
      },
      now: () => now,
    });
    assert.equal(result.status, "ingested");
    assert.equal(modeled, false);
    assert.equal(
      calls.some((call) => call.table === "rpc/claim_job_link_extraction"),
      false,
    );
    const cacheLookup = calls.find((call) =>
      decodeURIComponent(call.query ?? "").includes("source_content_hash=eq."));
    assert.ok(cacheLookup);
    assert.match(decodeURIComponent(cacheLookup?.query ?? ""), /owner_user_id=eq\.user-cache/);
    const insert = calls.find((call) => call.table === "jobs" && call.method === "POST");
    assert.equal((insert?.body as Record<string, unknown>).source_url, "https://jobs.example.test/cache-copy");
    assert.deepEqual(
      (insert?.body as Record<string, unknown>).required_experience,
      ["Five years of experience."],
    );
  }

  // A known normalized URL returns its existing id without fetch, model, or insert.
  {
    const existing = { id: "job-known", title: "Known Role", company_name: "Known Co" };
    const { request, calls } = mockRequest(() => [existing]);
    let fetched = false;
    let modeled = false;
    const result = await ingestJobFromLink({ url: "https://jobs.example.test/known", userId: "user-2" }, {
      request,
      resolveHostname: publicResolver,
      fetchImpl: async () => {
        fetched = true;
        return new Response();
      },
      callModel: async () => {
        modeled = true;
        return undefined;
      },
    });
    assert.deepEqual(result, {
      status: "already_known",
      jobId: "job-known",
      title: "Known Role",
      company: "Known Co",
    });
    assert.equal(calls.length, 1);
    assert.equal(fetched, false);
    assert.equal(modeled, false);
  }

  // Another user's private paste of the same URL is invisible: the dedupe lookup is
  // owner-scoped, so this user proceeds to ingest their own private copy.
  {
    const insertedRow = { id: "job-own-copy", title: "Known Role", company_name: "Known Co" };
    const { request, calls } = mockRequest((call) => call.method === "POST" ? [insertedRow] : []);
    const result = await ingestJobFromLink({ url: "https://jobs.example.test/known", userId: "user-b" }, {
      request,
      resolveHostname: publicResolver,
      fetchImpl: async () => new Response("<h1>Known Role</h1><p>Own the known work.</p>", {
        headers: { "Content-Type": "text/html" },
      }),
      callModel: async () => JSON.stringify({
        title: "Known Role",
        companyName: "Known Co",
        description: "Own the known work.",
        responsibilities: [],
        requiredExperience: [],
      }),
      now: () => now,
    });
    assert.equal(result.status, "ingested");
    const dedupe = calls.find((call) => call.method === "GET");
    assert.ok(dedupe);
    assert.match(decodeURIComponent(dedupe.query ?? ""), /or=\(owner_user_id\.is\.null,owner_user_id\.eq\.user-b\)/);
    const insert = calls.find((call) => call.table === "jobs" && call.method === "POST");
    assert.ok(insert);
    assert.equal((insert.body as Record<string, unknown>).owner_user_id, "user-b");
  }

  // No model output degrades explicitly and never inserts a partial job.
  {
    const { request, calls } = mockRequest(() => []);
    const result = await ingestJobFromLink({ url: "https://jobs.example.test/model-down", userId: "user-3" }, {
      request,
      resolveHostname: publicResolver,
      fetchImpl: async () => new Response("<h1>A real posting</h1>", {
        headers: { "Content-Type": "text/html" },
      }),
      callModel: async () => undefined,
    });
    assert.deepEqual(result, { status: "extraction_unavailable" });
    assert.equal(calls.some((call) => call.table === "jobs" && call.method === "POST"), false);
    const finish = calls.find((call) => call.table === "rpc/finish_job_link_extraction");
    assert.equal((finish?.body as Record<string, unknown>).p_outcome, "unavailable");
  }

  // A concurrent/busy claim does not call the model. The API rechecks the exact
  // URL once in case the first worker inserted before finishing its claim.
  {
    let modeled = false;
    const { request, calls } = mockRequest(
      () => [],
      {
        rpc: (call) => call.table === "rpc/claim_job_link_extraction"
          ? [{
              claimed: false,
              claim_token: null,
              claim_state: "claimed",
              attempt_count: 1,
            }]
          : [],
      },
    );
    const result = await ingestJobFromLink({
      url: "https://jobs.example.test/busy",
      userId: "user-busy",
    }, {
      request,
      resolveHostname: publicResolver,
      fetchImpl: async () => new Response("<h1>Busy role</h1>", {
        headers: { "Content-Type": "text/html" },
      }),
      callModel: async () => {
        modeled = true;
        return undefined;
      },
      now: () => now,
    });
    assert.deepEqual(result, { status: "extraction_unavailable" });
    assert.equal(modeled, false);
    assert.equal(
      calls.filter((call) => call.table === "jobs" && call.method === "GET").length,
      3,
    );
  }

  // Redirect targets are safety-checked before the next fetch.
  {
    const { request } = mockRequest(() => []);
    let fetchCount = 0;
    const result = await ingestJobFromLink({ url: "https://jobs.example.test/redirect", userId: "user-4" }, {
      request,
      resolveHostname: async (hostname) => hostname === "jobs.example.test"
        ? [{ address: "93.184.216.34", family: 4 }]
        : [{ address: "127.0.0.1", family: 4 }],
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response(null, { status: 302, headers: { Location: "http://internal.example/private" } });
      },
      callModel: async () => undefined,
    });
    assert.deepEqual(result, { status: "unsafe_url" });
    assert.equal(fetchCount, 1);
  }

  // Content-Length is rejected before a large response is read or modeled.
  {
    const { request, calls } = mockRequest(() => []);
    let modeled = false;
    const result = await ingestJobFromLink({ url: "https://jobs.example.test/large", userId: "user-5" }, {
      request,
      resolveHostname: publicResolver,
      maxResponseBytes: 32,
      fetchImpl: async () => new Response("large", {
        headers: { "Content-Type": "text/html", "Content-Length": "1000" },
      }),
      callModel: async () => {
        modeled = true;
        return undefined;
      },
    });
    assert.deepEqual(result, { status: "response_too_large" });
    assert.equal(calls.some((call) => call.table === "jobs" && call.method === "POST"), false);
    assert.equal(modeled, false);
  }

  // The streaming cap still applies when Content-Length is absent or inaccurate.
  {
    const { request, calls } = mockRequest(() => []);
    const result = await ingestJobFromLink({ url: "https://jobs.example.test/stream-large", userId: "user-6" }, {
      request,
      resolveHostname: publicResolver,
      maxResponseBytes: 4,
      fetchImpl: async () => new Response("12345", {
        headers: { "Content-Type": "text/plain" },
      }),
      callModel: async () => {
        throw new Error("model must not run");
      },
    });
    assert.deepEqual(result, { status: "response_too_large" });
    assert.equal(calls.some((call) => call.table === "jobs" && call.method === "POST"), false);
  }

  // The API handler rejects malformed bodies and preserves response hygiene.
  {
    const { request: repositoryRequest } = mockRequest(() => []);
    let ingested = false;
    const response = await handlePublicJobFromLinkRequest(new Request("https://app.example/api/jobs/from-link", {
      method: "POST",
      body: JSON.stringify({ nope: true }),
      headers: { "Content-Type": "application/json" },
    }), {
      getSession: async () => ({ status: "authenticated", userId: "user-api", email: "user@example.test" }),
      repositoryRequest,
      ingestJob: async () => {
        ingested = true;
        return { status: "extraction_unavailable" };
      },
    });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(ingested, false);
    assert.deepEqual(await response.json(), { error: "Expected url.", status: "invalid_url" });
  }

  console.log("job link ingestion: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import assert from "node:assert/strict";
import { handlePublicJobFromLinkRequest } from "../lib/public-jobs/api";
import { ingestJobFromLink } from "../lib/public-jobs/ingest-link";
import { parseIndexedPostingResponse } from "../lib/public-jobs/indexed-posting";
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
  const blockedSourceUrl = "https://www.indeed.com/viewjob?jk=blocked-posting";
  const indexedResponse = JSON.stringify({
    sourceUrl: blockedSourceUrl,
    canonicalUrl: "https://careers.example.test/jobs/director-1",
    title: "Global Operations Director",
    companyName: "Useful Co",
    description: "Lead global content operations, modernize production workflows, and build measurable systems across a distributed organization.",
    responsibilities: ["Modernize production workflows."],
    requiredExperience: ["Experience leading global content operations."],
    evidenceUrls: [blockedSourceUrl, "https://careers.example.test/jobs/director-1"],
  });
  assert.equal(
    parseIndexedPostingResponse(indexedResponse, blockedSourceUrl)?.posting.title,
    "Global Operations Director",
  );
  assert.equal(
    parseIndexedPostingResponse(indexedResponse, "https://www.indeed.com/viewjob?jk=different"),
    undefined,
    "indexed retrieval must repeat the exact requested source URL",
  );
  assert.equal(
    parseIndexedPostingResponse(JSON.stringify({
      ...JSON.parse(indexedResponse),
      evidenceUrls: [],
    }), blockedSourceUrl),
    undefined,
    "indexed retrieval must include supporting source URLs",
  );

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

  // A server-blocked aggregator page falls back to indexed retrieval. The
  // original pasted URL remains the stored source even when an employer URL is
  // found and used as supporting evidence.
  {
    const insertedRow = { id: "job-indexed", title: "Global Operations Director", company_name: "Useful Co" };
    const { request, calls } = mockRequest((call) => call.method === "POST" ? [insertedRow] : []);
    let resolvedUrl = "";
    const result = await ingestJobFromLink({ url: blockedSourceUrl, userId: "user-indexed" }, {
      request,
      resolveHostname: publicResolver,
      fetchImpl: async () => new Response("Blocked", { status: 403 }),
      resolveIndexedPostingImpl: async (sourceUrl) => {
        resolvedUrl = sourceUrl;
        return parseIndexedPostingResponse(indexedResponse, sourceUrl);
      },
      now: () => now,
    });
    assert.deepEqual(result, {
      status: "ingested",
      jobId: "job-indexed",
      title: "Global Operations Director",
      company: "Useful Co",
    });
    assert.equal(resolvedUrl, blockedSourceUrl);
    const insert = calls.find((call) => call.table === "jobs" && call.method === "POST");
    assert.equal((insert?.body as Record<string, unknown>).source_url, blockedSourceUrl);
    assert.match(String((insert?.body as Record<string, unknown>).description), /modernize production workflows/);
  }

  // If indexed retrieval cannot verify the exact posting, retain the original
  // fetch failure and never insert guessed job data.
  {
    const { request, calls } = mockRequest(() => []);
    const result = await ingestJobFromLink({ url: blockedSourceUrl, userId: "user-indexed-empty" }, {
      request,
      resolveHostname: publicResolver,
      fetchImpl: async () => new Response("Blocked", { status: 403 }),
      resolveIndexedPostingImpl: async () => undefined,
    });
    assert.deepEqual(result, { status: "fetch_failed" });
    assert.equal(calls.some((call) => call.table === "jobs" && call.method === "POST"), false);
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
    let indexed = false;
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
      resolveIndexedPostingImpl: async () => {
        indexed = true;
        return undefined;
      },
    });
    assert.deepEqual(result, { status: "response_too_large" });
    assert.equal(calls.some((call) => call.table === "jobs" && call.method === "POST"), false);
    assert.equal(modeled, false);
    assert.equal(indexed, false);
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

  // A link copied from LinkedIn carries campaign parameters the board's own URL
  // never had. The stored posting must still be recognized instead of refetched.
  {
    const stored = { id: "job-known", title: "Director", company_name: "Gitlab" };
    let dedupeQuery = "";
    const { request } = mockRequest((call) => {
      if (call.method === "GET" && call.table === "jobs") {
        dedupeQuery = decodeURIComponent(call.query ?? "");
        return dedupeQuery.includes("jobs/8607104002\"") ? [stored] : [];
      }
      return [];
    });
    const result = await ingestJobFromLink({
      url: "https://job-boards.greenhouse.io/gitlab/jobs/8607104002?gh_src=abc&utm_source=linkedin&grnh.se=z",
      userId: "user-tracked",
    }, {
      request,
      resolveHostname: publicResolver,
      fetchImpl: async () => {
        throw new Error("a posting we already hold must not be refetched");
      },
    });
    assert.deepEqual(result, {
      status: "already_known",
      jobId: "job-known",
      title: "Director",
      company: "Gitlab",
    });
    // Both the pasted URL and its campaign-stripped form are matched.
    assert.match(dedupeQuery, /gh_src=abc/);
    assert.match(dedupeQuery, /"https:\/\/job-boards\.greenhouse\.io\/gitlab\/jobs\/8607104002"/);
  }

  // A company careers host guesses the wrong board token from its hostname
  // ("jobs" for jobs.dropbox.com). The configured job_sources token wins.
  {
    const { request } = mockRequest((call) => {
      if (call.table === "job_sources") {
        return [
          { ats_board_token: "airbnb", company_name: "Airbnb" },
          { ats_board_token: "dropbox", company_name: "Dropbox" },
        ];
      }
      if (call.method === "POST") return [{ id: "job-db", title: "Staff Engineer", company_name: "Dropbox" }];
      return [];
    });
    let seenToken = "";
    const result = await ingestJobFromLink({
      url: "https://jobs.dropbox.com/listing/8006972?gh_jid=8006972",
      userId: "user-token",
    }, {
      request,
      resolveHostname: publicResolver,
      fetchImpl: async () => {
        throw new Error("the board API should answer before any page fetch");
      },
      fetchBoardPostingImpl: async (_url, board) => {
        seenToken = board.atsBoardToken;
        return {
          status: "ok",
          posting: {
            title: "Staff Engineer",
            companyName: "Dropbox",
            description: "Build storage systems. Requirements: 8 years experience.",
          },
        };
      },
    });
    assert.equal(seenToken, "dropbox");
    assert.equal(result.status, "ingested");
  }

  // Scan/paste parity is a whole-pipeline invariant, not a short allowlist of ATS
  // boards. Every source/hostname class currently emitted by the production scan
  // must be recognized from its stored URL or the durable external_job_id saved
  // by the connector, even when the pasted link carries different tracking.
  {
    const parityCases = [
      {
        name: "Adzuna API",
        source: "adzuna",
        storedUrl: "https://www.adzuna.com/details/5774552417?utm_medium=api&utm_source=scan-token",
        pastedUrl: "https://www.adzuna.com/details/5774552417?utm_source=linkedin",
        externalJobId: "5774552417",
      },
      {
        name: "Arbeitnow",
        source: "arbeitnow",
        storedUrl: "https://www.arbeitnow.com/jobs/companies/acme/program-manager-179794",
        pastedUrl: "https://www.arbeitnow.com/jobs/companies/acme/program-manager-179794?utm_source=linkedin",
        externalJobId: "program-manager-179794",
      },
      {
        name: "Ashby",
        source: "ashby",
        storedUrl: "https://jobs.ashbyhq.com/linear/069c4628-88d7-4e4d-b393-c996fc7f3076",
        pastedUrl: "https://jobs.ashbyhq.com/linear/069c4628-88d7-4e4d-b393-c996fc7f3076?utm_source=linkedin",
        externalJobId: "069c4628-88d7-4e4d-b393-c996fc7f3076",
      },
      {
        name: "Greenhouse legacy host",
        source: "greenhouse",
        storedUrl: "https://boards.greenhouse.io/figma/jobs/5220003004?gh_jid=5220003004",
        pastedUrl: "https://boards.greenhouse.io/figma/jobs/5220003004?gh_jid=5220003004&utm_source=linkedin",
        externalJobId: "5220003004",
      },
      {
        name: "Greenhouse Airbnb host",
        source: "greenhouse",
        storedUrl: "https://careers.airbnb.com/positions/6153760?gh_jid=6153760",
        pastedUrl: "https://careers.airbnb.com/positions/6153760?gh_jid=6153760&utm_source=linkedin",
        externalJobId: "6153760",
      },
      {
        name: "Greenhouse Databricks host",
        source: "greenhouse",
        storedUrl: "https://databricks.com/company/careers/open-positions/job?gh_jid=5313313002",
        pastedUrl: "https://databricks.com/company/careers/open-positions/job?gh_jid=5313313002&utm_source=linkedin",
        externalJobId: "5313313002",
      },
      {
        name: "Greenhouse current host",
        source: "greenhouse",
        storedUrl: "https://job-boards.greenhouse.io/anthropic/jobs/4020350008",
        pastedUrl: "https://job-boards.greenhouse.io/anthropic/jobs/4020350008?utm_source=linkedin",
        externalJobId: "4020350008",
      },
      {
        name: "Greenhouse Dropbox host",
        source: "greenhouse",
        storedUrl: "https://jobs.dropbox.com/listing/6330377?gh_jid=6330377",
        pastedUrl: "https://jobs.dropbox.com/listing/6330377?gh_jid=6330377&utm_source=linkedin",
        externalJobId: "6330377",
      },
      {
        name: "Greenhouse Stripe host",
        source: "greenhouse",
        storedUrl: "https://stripe.com/jobs/search?gh_jid=4921361",
        pastedUrl: "https://stripe.com/jobs/search?gh_jid=4921361&utm_source=linkedin",
        externalJobId: "4921361",
      },
      {
        name: "Greenhouse Coinbase host",
        source: "greenhouse",
        storedUrl: "https://www.coinbase.com/careers/positions/6784618?gh_jid=6784618",
        pastedUrl: "https://www.coinbase.com/careers/positions/6784618?gh_jid=6784618&utm_source=linkedin",
        externalJobId: "6784618",
      },
      {
        name: "Himalayas API",
        source: "himalayas",
        storedUrl: "https://himalayas.app/companies/abridge/jobs/product-operations-strategy",
        pastedUrl: "https://himalayas.app/companies/abridge/jobs/product-operations-strategy?utm_source=linkedin",
        externalJobId: "https://himalayas.app/companies/abridge/jobs/product-operations-strategy",
      },
      {
        name: "Arbeitnow UK",
        source: "html",
        storedUrl: "https://www.arbeitnow.co.uk/jobs/companies/acme/product-manager-348104",
        pastedUrl: "https://www.arbeitnow.co.uk/jobs/companies/acme/product-manager-348104?utm_source=linkedin",
        externalJobId: "product-manager-348104",
      },
      {
        name: "Lever",
        source: "lever",
        storedUrl: "https://jobs.lever.co/spotify/003df472-fd5a-4988-8175-f185aa9b1298",
        pastedUrl: "https://jobs.lever.co/spotify/003df472-fd5a-4988-8175-f185aa9b1298?utm_source=linkedin",
        externalJobId: "003df472-fd5a-4988-8175-f185aa9b1298",
      },
      {
        name: "Magnit",
        source: "magnit",
        storedUrl: "https://directsource.magnitglobal.com/us/magnitds/jobs/107972-content-coordinator",
        pastedUrl: "https://directsource.magnitglobal.com/us/magnitds/jobs/107972-content-coordinator?utm_source=linkedin",
        externalJobId: "107972-content-coordinator",
      },
      {
        name: "Remote OK API legacy URL",
        source: "remote_ok",
        storedUrl: "https://remoteOK.com/remote-jobs/",
        pastedUrl: "https://remoteok.com/remote-jobs/?utm_source=linkedin",
        externalJobId: "1135321",
      },
      {
        name: "Remotive API",
        source: "remotive",
        storedUrl: "https://remotive.com/remote-jobs/project-management/program-manager-2091074",
        pastedUrl: "https://remotive.com/remote-jobs/project-management/program-manager-2091074?utm_source=linkedin",
        externalJobId: "https://remotive.com/remote-jobs/project-management/program-manager-2091074",
      },
      {
        name: "We Work Remotely RSS",
        source: "we_work_remotely",
        storedUrl: "https://weworkremotely.com/remote-jobs/acme-program-manager",
        pastedUrl: "https://weworkremotely.com/remote-jobs/acme-program-manager?utm_source=linkedin",
        externalJobId: "https://weworkremotely.com/remote-jobs/acme-program-manager",
      },
      {
        name: "Workable aggregate API",
        source: "workable",
        storedUrl: "https://jobs.workable.com/view/135ioBovapSAwPk3tkKBeq/remote-head-of-product",
        pastedUrl: "https://jobs.workable.com/view/135ioBovapSAwPk3tkKBeq/remote-head-of-product?utm_source=linkedin",
        externalJobId: "004a232c-b7d6-4025-a908-081144ba0abe",
      },
      {
        name: "Workable account API",
        source: "html",
        storedUrl: "https://apply.workable.com/acme/j/ABC123",
        pastedUrl: "https://apply.workable.com/acme/j/ABC123?utm_source=linkedin",
        externalJobId: "ABC123",
      },
      {
        name: "Workday CXS",
        source: "workday",
        storedUrl: "https://acme.wd1.myworkdayjobs.com/en-US/External/job/Program-Manager_R12345",
        pastedUrl: "https://acme.wd1.myworkdayjobs.com/en-US/External/job/Program-Manager_R12345?utm_source=linkedin",
        externalJobId: "/job/Program-Manager_R12345",
      },
      {
        name: "iCIMS",
        source: "icims",
        storedUrl: "https://careers-acme.icims.com/jobs/12345/program-manager/job",
        pastedUrl: "https://careers-acme.icims.com/jobs/12345/program-manager/job?utm_source=linkedin",
        externalJobId: "12345",
      },
      {
        name: "Rippling HTML",
        source: "html",
        storedUrl: "https://ats.rippling.com/acme/jobs/2a329145-1111-4444-8888-123456789abc",
        pastedUrl: "https://ats.rippling.com/acme/jobs/2a329145-1111-4444-8888-123456789abc?utm_source=linkedin",
        externalJobId: "2a329145-1111-4444-8888-123456789abc",
      },
      {
        name: "Generic JSON-LD",
        source: "html",
        storedUrl: "https://jobs.recruiterflow.com/acme/jobs/123",
        pastedUrl: "https://jobs.recruiterflow.com/acme/jobs/123?utm_source=linkedin",
        externalJobId: "123",
      },
    ];

    for (const fixture of parityCases) {
      const stored = {
        id: `job-parity-${fixture.name}`,
        title: `${fixture.name} Role`,
        company_name: `${fixture.name} Company`,
      };
      const { request, calls } = mockRequest((call) => {
        if (call.table !== "jobs" || call.method !== "GET") return [];
        const query = decodeURIComponent(call.query ?? "");
        if (query.includes("source_url=in.") && query.includes(`"${fixture.storedUrl}"`)) {
          return [stored];
        }
        if (
          query.includes(`external_job_id=eq.${fixture.externalJobId}`)
          && query.includes(`source=in.("${fixture.source}"`)
        ) {
          return [stored];
        }
        return [];
      });
      const result = await ingestJobFromLink({
        url: fixture.pastedUrl,
        userId: "00000000-0000-0000-0000-000000000099",
      }, {
        request,
        resolveHostname: publicResolver,
        fetchImpl: async () => {
          throw new Error(`${fixture.name} scan URL must resolve before a page fetch`);
        },
        callModel: async () => {
          throw new Error(`${fixture.name} scan URL must resolve before a model call`);
        },
      });
      assert.equal(result.status, "already_known", fixture.name);
      assert.equal(
        calls.some((call) => call.table === "jobs" && call.method === "POST"),
        false,
        fixture.name,
      );
    }
  }

  // Gem's public page is a JavaScript shell, but its own unauthenticated browser
  // client reads the posting from a public GraphQL query. Use that structured path
  // rather than rejecting a valid posting or adding a headless-browser dependency.
  {
    const stored = {
      id: "job-gem",
      title: "Head of Special Projects",
      company_name: "Function Health",
    };
    const { request, calls } = mockRequest((call) => call.method === "POST" ? [stored] : []);
    let pageFetched = false;
    let gemApiFetched = false;
    const result = await ingestJobFromLink({
      url: "https://jobs.gem.com/function-health/am9icG9zdDrdd46zjoAxOoJURvZYzyfN?src=LinkedIn",
      userId: "user-gem",
    }, {
      request,
      resolveHostname: publicResolver,
      fetchImpl: async () => {
        pageFetched = true;
        return new Response("<html></html>", { headers: { "Content-Type": "text/html" } });
      },
      callModel: async () => {
        throw new Error("model must not be called when Gem's public API answered");
      },
      boardPosting: {
        fetchImpl: async (input, init) => {
          gemApiFetched = true;
          assert.equal(input.toString(), "https://jobs.gem.com/api/public/graphql");
          assert.equal(init?.method, "POST");
          const body = JSON.parse(String(init?.body)) as {
            variables: { boardId: string; extId: string };
          };
          assert.deepEqual(body.variables, {
            boardId: "function-health",
            extId: "am9icG9zdDrdd46zjoAxOoJURvZYzyfN",
          });
          return new Response(JSON.stringify({
            data: {
              oatsExternalJobPosting: {
                title: "Head of Special Projects",
                descriptionHtml: "<p>Own high-priority projects from scratch.</p>",
                job: { teamDisplayName: "Function Health" },
                jobPostSectionHtml: {
                  introHtml: "<p>Build what does not have an owner.</p>",
                  outroHtml: null,
                },
                compensationHtml: "<p>$180,000 to $220,000 per year.</p>",
              },
            },
          }), { headers: { "Content-Type": "application/json" } });
        },
      },
    });
    assert.deepEqual(result, {
      status: "ingested",
      jobId: "job-gem",
      title: "Head of Special Projects",
      company: "Function Health",
    });
    assert.equal(gemApiFetched, true);
    assert.equal(pageFetched, false);
    assert.equal(calls.some((call) => call.table === "rpc/claim_job_link_extraction"), false);
    const insert = calls.find((call) => call.table === "jobs" && call.method === "POST");
    assert.ok(insert);
    assert.match(String((insert.body as Record<string, unknown>).description), /180,000/);
  }

  // A pasted board link is read through the ATS API, not the web page: no model
  // call, no extraction claim, and the posting is stored from labeled fields.
  {
    const boardRow = { id: "job-board-1", title: "Program Director", company_name: "Acme Co" };
    const { request, calls } = mockRequest((call) => call.method === "POST" ? [boardRow] : []);
    let pageFetched = false;
    const result = await ingestJobFromLink({
      url: "https://job-boards.greenhouse.io/codeforamerica/jobs/8080688?grnh.se=369a4df81us&gh_src=7691645b1us",
      userId: "user-board",
    }, {
      request,
      resolveHostname: publicResolver,
      fetchImpl: async () => {
        pageFetched = true;
        return new Response("<html>enable javascript</html>", {
          headers: { "Content-Type": "text/html" },
        });
      },
      callModel: async () => {
        throw new Error("model must not be called when the board API answered");
      },
      boardPosting: {
        fetchImpl: async (input, init) => {
          assert.equal(
            input.toString(),
            "https://boards-api.greenhouse.io/v1/boards/codeforamerica/jobs/8080688?content=true",
          );
          assert.equal(init?.method, "GET");
          return new Response(JSON.stringify({
            title: "Program Director",
            company_name: "Acme Co",
            content: "<p>Responsibilities: Lead the program. Requirements: 5 years experience.</p>",
          }), { headers: { "Content-Type": "application/json" } });
        },
      },
    });
    assert.equal(result.status, "ingested");
    // The shell page is never fetched when the structured API answers.
    assert.equal(pageFetched, false);
    assert.equal(calls.some((call) => call.table === "rpc/claim_job_link_extraction"), false);
    const insert = calls.find((call) => call.table === "jobs" && call.method === "POST");
    assert.ok(insert);
    const body = insert.body as Record<string, unknown>;
    assert.equal(body.title, "Program Director");
    assert.equal(body.company_name, "Acme Co");
    assert.equal(body.source, "user_link");
  }

  // The exact reported Ashby URL resolves the board and posting id, ignores its
  // campaign parameter for routing, and selects the posting from the public feed.
  {
    const boardRow = {
      id: "job-ashby",
      title: "Senior Product Manager",
      company_name: "Thumbtack",
    };
    const { request, calls } = mockRequest((call) => call.method === "POST" ? [boardRow] : []);
    let pageFetched = false;
    const result = await ingestJobFromLink({
      url: "https://jobs.ashbyhq.com/thumbtack/ba203a0f-7c3a-444f-9f4d-6ebc548fbd7e?utm_source=Otta",
      userId: "user-ashby",
    }, {
      request,
      resolveHostname: publicResolver,
      fetchImpl: async () => {
        pageFetched = true;
        return new Response("<html>enable javascript</html>", {
          headers: { "Content-Type": "text/html" },
        });
      },
      callModel: async () => {
        throw new Error("model must not be called when the Ashby API answered");
      },
      boardPosting: {
        fetchImpl: async (input, init) => {
          assert.equal(input.toString(), "https://api.ashbyhq.com/posting-api/job-board/thumbtack");
          assert.equal(init?.method, "GET");
          return new Response(JSON.stringify({
            jobs: [{
              id: "ba203a0f-7c3a-444f-9f4d-6ebc548fbd7e",
              title: "Senior Product Manager",
              descriptionPlain: "Own product strategy. Requirements: 7 years experience.",
            }],
          }), { headers: { "Content-Type": "application/json" } });
        },
      },
    });
    assert.equal(result.status, "ingested");
    assert.equal(pageFetched, false);
    assert.equal(calls.some((call) => call.table === "rpc/claim_job_link_extraction"), false);
  }

  // When the board API cannot answer, the HTML reader still runs.
  {
    const fallbackRow = { id: "job-fallback-1", title: "Fallback Role", company_name: "Acme Co" };
    const { request } = mockRequest((call) => call.method === "POST" ? [fallbackRow] : []);
    let pageFetched = false;
    const result = await ingestJobFromLink({
      url: "https://job-boards.greenhouse.io/acme/jobs/999",
      userId: "user-fallback",
    }, {
      request,
      resolveHostname: publicResolver,
      fetchImpl: async () => {
        pageFetched = true;
        return new Response(
          '<script type="application/ld+json">{"@type":"JobPosting","title":"Fallback Role",'
          + '"hiringOrganization":{"name":"Acme Co"},"description":"<p>Real posting body here.</p>"}</script>',
          { headers: { "Content-Type": "text/html" } },
        );
      },
      callModel: async () => {
        throw new Error("JSON-LD should have covered this page");
      },
      fetchBoardPostingImpl: async () => ({ status: "unavailable" }),
    });
    assert.equal(result.status, "ingested");
    assert.equal(pageFetched, true);
  }

  // A throw from the ingest pipeline (for example a database function missing at
  // runtime) must still answer with JSON naming the failing stage plus a traceable
  // reference. Before this, it escaped as a bare 500 with no body and the client
  // could only report a generic failure.
  {
    const { request: repositoryRequest } = mockRequest(() => []);
    const response = await handlePublicJobFromLinkRequest(new Request("https://app.example/api/jobs/from-link", {
      method: "POST",
      body: JSON.stringify({ url: "https://jobs.example.test/boom" }),
      headers: { "Content-Type": "application/json" },
    }), {
      getSession: async () => ({ status: "authenticated", userId: "user-api", email: "user@example.test" }),
      repositoryRequest,
      ingestJob: async () => {
        throw new Error('Supabase POST jobs failed (404): {"code":"42883"}');
      },
    });
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json() as {
      error?: string;
      status?: string;
      stage?: string;
      reference?: string;
    };
    assert.equal(body.status, "ingest_failed");
    assert.equal(body.stage, "store");
    assert.match(body.reference ?? "", /^[0-9a-f-]{36}$/);
    assert.match(body.error ?? "", /server error/i);
    // The raw database text must not leak to the user; the reference carries it.
    assert.equal(/42883|Supabase/.test(body.error ?? ""), false);
  }

  console.log("job link ingestion: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

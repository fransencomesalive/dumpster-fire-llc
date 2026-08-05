import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";
import { handleLinkHealthRequest, handleSourceScanRequest } from "../lib/scan/api";
import type { SourceScanResult } from "../lib/scan/source-scan";

const now = "2026-06-29T12:00:00.000Z";

function request(headers: Record<string, string> = {}) {
  return new Request("https://app.example/api/jobs/source-scan", { method: "POST", headers });
}

const repositoryRequest: PublicProfileRepositoryRequest = async () => {
  throw new Error("repository should not be called by mocked handlers");
};

const scanResult: SourceScanResult = {
  ranAt: now,
  totalSources: 2,
  totalFetched: 40,
  totalUpserted: 35,
  sources: [],
};

async function body(response: Response) {
  return await response.json() as Record<string, unknown>;
}

async function main() {
  const sourceScanRoute = readFileSync("app/api/jobs/source-scan/route.ts", "utf8");
  assert.match(sourceScanRoute, /export const maxDuration = 180;/);

  // ---- Not configured: no CRON_SECRET ----
  {
    const response = await handleSourceScanRequest(request({ authorization: "Bearer anything" }), {
      env: {} as NodeJS.ProcessEnv,
      repositoryRequest,
      runScan: async () => { throw new Error("should not run without secret"); },
    });
    assert.equal(response.status, 503);
    assert.deepEqual((await body(response)).missing, ["CRON_SECRET"]);
  }

  // ---- Missing bearer ----
  {
    const response = await handleSourceScanRequest(request(), {
      env: { CRON_SECRET: "s3cret" } as unknown as NodeJS.ProcessEnv,
      repositoryRequest,
      runScan: async () => { throw new Error("should not run unauthorized"); },
    });
    assert.equal(response.status, 401);
  }

  // ---- Wrong bearer ----
  {
    const response = await handleSourceScanRequest(request({ authorization: "Bearer nope" }), {
      env: { CRON_SECRET: "s3cret" } as unknown as NodeJS.ProcessEnv,
      repositoryRequest,
      runScan: async () => { throw new Error("should not run unauthorized"); },
    });
    assert.equal(response.status, 401);
  }

  // ---- Storage not configured ----
  {
    const response = await handleSourceScanRequest(request({ authorization: "Bearer s3cret" }), {
      env: { CRON_SECRET: "s3cret" } as unknown as NodeJS.ProcessEnv,
      runScan: async () => { throw new Error("should not run without storage"); },
    });
    assert.equal(response.status, 503);
    assert.equal((await body(response)).error, "Public jobs storage is not configured.");
  }

  // ---- Authorized: runs scan and returns summary ----
  {
    let ranWith: { env?: NodeJS.ProcessEnv; now?: () => string } | undefined;
    const response = await handleSourceScanRequest(request({ authorization: "Bearer s3cret" }), {
      env: { CRON_SECRET: "s3cret" } as unknown as NodeJS.ProcessEnv,
      now: () => now,
      repositoryRequest,
      runScan: async (_request, options) => {
        ranWith = options;
        return scanResult;
      },
    });
    assert.equal(response.status, 200);
    const payload = await body(response);
    assert.equal(payload.totalUpserted, 35);
    assert.equal(payload.totalSources, 2);
    assert.equal(typeof ranWith?.now, "function");
    assert.equal(ranWith?.env?.CRON_SECRET, "s3cret");
  }

  // ---- Authorized standalone link-health maintenance ----
  {
    let checkedAt = "";
    const response = await handleLinkHealthRequest(request({ authorization: "Bearer s3cret" }), {
      env: { CRON_SECRET: "s3cret" } as unknown as NodeJS.ProcessEnv,
      now: () => now,
      repositoryRequest,
      runReconciliation: async (_request, options) => {
        checkedAt = options.now?.() ?? "";
        return {
          candidates: 4,
          checked: 4,
          healthy: 3,
          gone: 1,
          uncertain: 0,
          skippedPrivate: 0,
          skippedFresh: 0,
        };
      },
    });
    assert.equal(response.status, 200);
    assert.equal(checkedAt, now);
    assert.deepEqual(await body(response), {
      checkedAt: now,
      candidates: 4,
      checked: 4,
      healthy: 3,
      gone: 1,
      uncertain: 0,
      skippedPrivate: 0,
      skippedFresh: 0,
    });
  }

  console.log("scan api: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

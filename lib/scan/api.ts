import {
  createPublicProfileRepositoryRequest,
  getPublicProfileRepositoryConfig,
  type PublicProfileRepositoryRequest,
} from "../public-profile/repository";
import { runSourceScan, type SourceScanOptions, type SourceScanResult } from "./source-scan";

export type SourceScanHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  repositoryRequest?: PublicProfileRepositoryRequest;
  runScan?: (
    request: PublicProfileRepositoryRequest,
    options: SourceScanOptions,
  ) => Promise<SourceScanResult>;
};

function json(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...init.headers,
    },
  });
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

function repositoryRequestForOptions(options: SourceScanHandlerOptions) {
  if (options.repositoryRequest) return options.repositoryRequest;
  const config = getPublicProfileRepositoryConfig(options.env);
  if (!config) return undefined;
  return createPublicProfileRepositoryRequest(config);
}

// System-wide source scan trigger. Intended to be driven by a scheduler (Vercel Cron sends
// `Authorization: Bearer ${CRON_SECRET}`), so it is guarded by the CRON_SECRET shared secret rather
// than per-user auth. This is an application-level route guard, not server-level auth.
export async function handleSourceScanRequest(
  request: Request,
  options: SourceScanHandlerOptions = {},
) {
  const env = options.env ?? process.env;

  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    return json({
      error: "Source scan trigger is not configured.",
      missing: ["CRON_SECRET"],
    }, { status: 503 });
  }

  if (bearerToken(request) !== secret) {
    return json({ error: "Unauthorized." }, { status: 401 });
  }

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) {
    return json({ error: "Public jobs storage is not configured." }, { status: 503 });
  }

  const runScan = options.runScan ?? runSourceScan;
  const result = await runScan(repositoryRequest, { env, now: options.now });

  return json(result);
}

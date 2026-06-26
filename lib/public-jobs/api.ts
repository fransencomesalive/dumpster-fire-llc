import { getPublicAuthSession, type PublicAuthSession } from "@/lib/public-auth/session";
import {
  createPublicProfileRepositoryRequest,
  getPublicProfileRepositoryConfig,
  type PublicProfileRepositoryRequest,
} from "@/lib/public-profile/repository";
import {
  readPublicJobsForUser,
  runPublicJobsScanForUser,
  setPublicJobSavedForUser,
} from "./repository";

export type PublicJobsHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
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

async function sessionForRequest(
  request: Request,
  options: PublicJobsHandlerOptions,
) {
  return options.getSession
    ? await options.getSession(request)
    : await getPublicAuthSession(request, { env: options.env });
}

function repositoryRequestForOptions(options: PublicJobsHandlerOptions) {
  if (options.repositoryRequest) return options.repositoryRequest;
  const config = getPublicProfileRepositoryConfig(options.env);
  if (!config) return undefined;
  return createPublicProfileRepositoryRequest(config);
}

function authErrorResponse(session: Exclude<PublicAuthSession, { status: "authenticated" }>) {
  if (session.status === "config_error") {
    return json({
      error: "Public auth is not configured.",
      missing: session.missing,
    }, { status: 503 });
  }

  return json({
    error: "Unauthorized.",
    reason: session.reason,
  }, { status: 401 });
}

function repositoryConfigErrorResponse() {
  return json({
    error: "Public jobs storage is not configured.",
  }, { status: 503 });
}

function readinessResponse(result: { status: string; reasons?: string[] }) {
  if (result.status === "not_found") {
    return json({
      error: "Candidate profile not found.",
      status: result.status,
    }, { status: 404 });
  }

  return json({
    error: "A complete profile is required before scanning jobs.",
    status: result.status,
    reasons: result.reasons ?? [],
  }, { status: 409 });
}

export async function handlePublicJobsGetRequest(
  request: Request,
  options: PublicJobsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const checkedAt = options.now?.() ?? new Date().toISOString();
  const result = await readPublicJobsForUser(repositoryRequest, session.userId, checkedAt);
  if ("status" in result) return readinessResponse(result);

  return json(result);
}

export async function handlePublicJobsScanRequest(
  request: Request,
  options: PublicJobsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const scannedAt = options.now?.() ?? new Date().toISOString();
  const result = await runPublicJobsScanForUser(repositoryRequest, session.userId, scannedAt);
  if ("status" in result) return readinessResponse(result);

  return json(result);
}

export async function handlePublicJobSaveRequest(
  request: Request,
  options: PublicJobsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const body = await request.json().catch(() => null) as { jobId?: unknown; saved?: unknown } | null;
  if (!body || typeof body.jobId !== "string" || !body.jobId.trim() || typeof body.saved !== "boolean") {
    return json({
      error: "Expected jobId and saved.",
    }, { status: 400 });
  }

  const updatedAt = options.now?.() ?? new Date().toISOString();
  const result = await setPublicJobSavedForUser(repositoryRequest, session.userId, body.jobId, body.saved, updatedAt);
  if ("status" in result) {
    if (result.status === "not_in_results") {
      return json({
        error: "Job is not in this user's active scan results.",
        status: result.status,
      }, { status: 404 });
    }
    return readinessResponse(result);
  }

  return json(result);
}

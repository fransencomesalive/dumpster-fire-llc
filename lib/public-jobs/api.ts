import { getPublicAuthSession, type PublicAuthSession } from "@/lib/public-auth/session";
import {
  createPublicProfileRepositoryRequest,
  getPublicProfileRepositoryConfig,
  type PublicProfileRepositoryRequest,
} from "@/lib/public-profile/repository";
import {
  addPublicJobBoardForUser,
  listPublicJobBoardsForUser,
  readPublicJobsForUser,
  removePublicJobBoardForUser,
  runPublicJobsScanForUser,
  setPublicJobDismissedForUser,
  setPublicJobSavedForUser,
  type PublicJobsScanOptions,
} from "./repository";

export type PublicJobsHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  getSession?: (request: Request) => Promise<PublicAuthSession>;
  repositoryRequest?: PublicProfileRepositoryRequest;
  // Injectable board-fetch machinery (tests); env is threaded automatically.
  scanOptions?: PublicJobsScanOptions;
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
  const result = await runPublicJobsScanForUser(repositoryRequest, session.userId, scannedAt, {
    env: options.env,
    ...options.scanOptions,
  });
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

// Skip ("not interested"): dismisses the posting from this user's results for good.
export async function handlePublicJobSkipRequest(
  request: Request,
  options: PublicJobsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const body = await request.json().catch(() => null) as { jobId?: unknown } | null;
  if (!body || typeof body.jobId !== "string" || !body.jobId.trim()) {
    return json({
      error: "Expected jobId.",
    }, { status: 400 });
  }

  const updatedAt = options.now?.() ?? new Date().toISOString();
  const result = await setPublicJobDismissedForUser(repositoryRequest, session.userId, body.jobId, updatedAt);
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

// --- Company job boards (private per user) ---

export async function handlePublicJobBoardsGetRequest(
  request: Request,
  options: PublicJobsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  return json(await listPublicJobBoardsForUser(repositoryRequest, session.userId));
}

export async function handlePublicJobBoardAddRequest(
  request: Request,
  options: PublicJobsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const body = await request.json().catch(() => null) as { url?: unknown } | null;
  if (!body || typeof body.url !== "string" || !body.url.trim()) {
    return json({
      error: "Expected url.",
    }, { status: 400 });
  }

  const now = options.now?.() ?? new Date().toISOString();
  const result = await addPublicJobBoardForUser(repositoryRequest, session.userId, body.url, now, {
    env: options.env,
    ...options.scanOptions,
  });
  if ("status" in result) {
    if (result.status === "unrecognized_board") {
      return json({
        error: "That page could not be read as a job board.",
        code: result.status,
      }, { status: 422 });
    }
    if (result.status === "board_limit") {
      return json({
        error: "You've hit the board limit. Remove a board before adding another.",
        code: result.status,
      }, { status: 422 });
    }
    return json({
      error: "That board could not be fetched.",
      code: result.status,
      detail: result.message,
    }, { status: 422 });
  }

  return json(result);
}

export async function handlePublicJobBoardRemoveRequest(
  request: Request,
  options: PublicJobsHandlerOptions = {},
) {
  const session = await sessionForRequest(request, options);
  if (session.status !== "authenticated") return authErrorResponse(session);

  const repositoryRequest = repositoryRequestForOptions(options);
  if (!repositoryRequest) return repositoryConfigErrorResponse();

  const id = new URL(request.url).searchParams.get("id");
  if (!id || !id.trim()) {
    return json({
      error: "Expected id.",
    }, { status: 400 });
  }

  return json(await removePublicJobBoardForUser(repositoryRequest, session.userId, id));
}

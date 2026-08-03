import {
  createPublicProfileRepositoryRequest,
  getPublicProfileRepositoryConfig,
  type PublicProfileRepositoryRequest,
} from "../public-profile/repository";

// Access-code expiry sweep. Access-code grants run 30 days from redemption
// (Randall, 2026-08-03); this flips them to 'canceled' once that window closes,
// which is the single point every entitlement check already honours — the two SQL
// sites (usage_ledger_quota_before_insert, persist_human_path_generation) and the
// TypeScript enforcement path all refuse a non-active status.
//
// Cron-triggered, so it is guarded by the CRON_SECRET shared secret rather than
// per-user auth, matching the source-scan and refine-postings routes. This is an
// application-level route guard, not server-level auth.

export type ExpireAccessCodesHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  repositoryRequest?: PublicProfileRepositoryRequest;
};

function json(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store", ...init.headers },
  });
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export async function expireAccessCodeSubscriptions(
  request: PublicProfileRepositoryRequest,
  input: { now?: string } = {},
) {
  return request<number>("rpc/expire_access_code_subscriptions", {
    method: "POST",
    body: { p_now: input.now ?? null },
  });
}

export async function handleExpireAccessCodesRequest(
  request: Request,
  options: ExpireAccessCodesHandlerOptions = {},
) {
  const env = options.env ?? process.env;

  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    return json({
      error: "Access-code expiry sweep is not configured.",
      missing: ["CRON_SECRET"],
    }, { status: 503 });
  }

  if (bearerToken(request) !== secret) {
    return json({ error: "Unauthorized." }, { status: 401 });
  }

  let repositoryRequest = options.repositoryRequest;
  if (!repositoryRequest) {
    const config = getPublicProfileRepositoryConfig(env);
    if (!config) {
      return json({ error: "Account storage is not configured." }, { status: 503 });
    }
    repositoryRequest = createPublicProfileRepositoryRequest(config);
  }

  const now = options.now?.();
  try {
    const expired = await expireAccessCodeSubscriptions(repositoryRequest, { now });
    return json({
      status: "swept",
      expired: typeof expired === "number" ? expired : 0,
      sweptAt: now ?? new Date().toISOString(),
    });
  } catch (error) {
    return json({
      error: "Could not run the access-code expiry sweep.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 503 });
  }
}

import { getPublicAuthConfig } from "./config";

export type PublicAuthSession =
  | {
      status: "authenticated";
      userId: string;
      email?: string;
    }
  | {
      status: "unauthenticated";
      reason: string;
    }
  | {
      status: "config_error";
      missing: string[];
    };

export type PublicAuthSessionOptions = {
  env?: NodeJS.ProcessEnv;
  fetcher?: typeof fetch;
};

type SupabaseAuthUserResponse = {
  id?: unknown;
  email?: unknown;
};

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

export async function getPublicAuthSession(
  request: Request,
  options: PublicAuthSessionOptions = {},
): Promise<PublicAuthSession> {
  const config = getPublicAuthConfig(options.env);
  if (config.missing.length > 0) {
    return {
      status: "config_error",
      missing: config.missing,
    };
  }

  const token = bearerToken(request);
  if (!token) {
    return {
      status: "unauthenticated",
      reason: "Missing bearer token.",
    };
  }

  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${config.supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return {
      status: "unauthenticated",
      reason: "Invalid bearer token.",
    };
  }

  const user = await response.json().catch(() => null) as SupabaseAuthUserResponse | null;
  if (!user || typeof user.id !== "string" || !user.id.trim()) {
    return {
      status: "unauthenticated",
      reason: "Bearer token did not resolve to a user.",
    };
  }

  return {
    status: "authenticated",
    userId: user.id,
    email: typeof user.email === "string" ? user.email : undefined,
  };
}

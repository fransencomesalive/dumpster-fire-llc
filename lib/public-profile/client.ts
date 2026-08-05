import { recordClientApiFailure } from "../qa/client-diagnostics";

export class PublicProfileApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "PublicProfileApiError";
    this.status = status;
    this.body = body;
  }
}

export type PublicProfileApiRequestOptions = Omit<RequestInit, "body" | "headers"> & {
  accessToken: string;
  body?: unknown;
  headers?: HeadersInit;
};

// Access tokens expire (~1h). Pages capture the token in state at load, so a
// long-lived tab can send an expired token and 401. Refresh the session once
// (supabase-js rotates via the stored refresh token) and hand back the fresh
// token; browser-only — outside the browser this resolves to "".
export async function refreshPublicProfileAccessToken(): Promise<string> {
  if (typeof window === "undefined") return "";
  try {
    const { syncPublicProfileSession } = await import("../public-auth/supabase-browser");
    return await syncPublicProfileSession();
  } catch {
    return "";
  }
}

export async function requestPublicProfileApi<T>(
  path: string,
  options: PublicProfileApiRequestOptions,
): Promise<T> {
  const startedAt = Date.now();
  const attempt = async (token: string) => {
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (options.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(path, {
      ...options,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const body = await response.json().catch(() => null);
    return {
      response,
      body,
      requestId: response.headers.get("x-request-id")
        || response.headers.get("x-vercel-id")
        || response.headers.get("traceparent")
    };
  };

  let response: Response;
  let body: unknown;
  let requestId: string | null;
  try {
    ({ response, body, requestId } = await attempt(options.accessToken));

    if (response.status === 401) {
      const freshToken = await refreshPublicProfileAccessToken();
      if (freshToken) {
        ({ response, body, requestId } = await attempt(freshToken));
      }
    }
  } catch (error) {
    recordClientApiFailure({
      path,
      method: options.method,
      status: 0,
      durationMs: Date.now() - startedAt,
      requestBody: options.body
    });
    throw error;
  }

  if (!response.ok) {
    recordClientApiFailure({
      path,
      method: options.method,
      status: response.status,
      body,
      requestId,
      durationMs: Date.now() - startedAt,
      requestBody: options.body
    });
    // Include the HTTP status: when a route fails before it can answer with JSON
    // there is no body to read, and a bare "request failed" is undiagnosable.
    throw new PublicProfileApiError(
      `Public profile API request failed (HTTP ${response.status}).`,
      response.status,
      body,
    );
  }

  return body as T;
}

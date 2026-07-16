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
    return { response, body };
  };

  let { response, body } = await attempt(options.accessToken);

  if (response.status === 401) {
    const freshToken = await refreshPublicProfileAccessToken();
    if (freshToken && freshToken !== options.accessToken) {
      ({ response, body } = await attempt(freshToken));
    }
  }

  if (!response.ok) {
    throw new PublicProfileApiError("Public profile API request failed.", response.status, body);
  }

  return body as T;
}

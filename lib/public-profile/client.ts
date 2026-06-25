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

export async function requestPublicProfileApi<T>(
  path: string,
  options: PublicProfileApiRequestOptions,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${options.accessToken}`);
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new PublicProfileApiError("Public profile API request failed.", response.status, body);
  }

  return body as T;
}

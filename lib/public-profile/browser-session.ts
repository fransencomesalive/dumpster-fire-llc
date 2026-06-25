export const publicProfileAccessTokenStorageKey = "dumpster-fire-public-access-token";

export function readPublicProfileAccessToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(publicProfileAccessTokenStorageKey) ?? "";
}

export function writePublicProfileAccessToken(accessToken: string) {
  window.localStorage.setItem(publicProfileAccessTokenStorageKey, accessToken);
}

export function clearPublicProfileAccessToken() {
  window.localStorage.removeItem(publicProfileAccessTokenStorageKey);
}

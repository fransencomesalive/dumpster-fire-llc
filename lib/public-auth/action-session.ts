export type PublicActionSessionDependencies = {
  syncSession: () => Promise<string>;
  readStoredToken: () => string;
};

// Interactive actions must resolve the authoritative Supabase session first. The
// legacy localStorage token is only a compatibility fallback: browser storage can
// be cleared or fall out of sync while the Supabase refresh-token session remains
// valid, and treating that mirror as authority silently prevents the request.
export async function resolvePublicActionAccessToken(
  dependencies: PublicActionSessionDependencies,
): Promise<string> {
  try {
    const sessionToken = (await dependencies.syncSession()).trim();
    if (sessionToken) return sessionToken;
  } catch {
    // A valid mirrored token can still carry the action when session refresh is
    // temporarily unavailable. The API helper will refresh once on a 401.
  }

  return dependencies.readStoredToken().trim();
}

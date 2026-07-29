import { getServerAuthUser } from "./supabase-server";
import {
  createPublicProfileRepositoryRequest,
  getPublicProfileRepositoryConfig,
  loadCandidateProfileAggregate,
} from "../public-profile/repository";

// Everything the header needs, resolved on the server so the first paint is the
// final one (Randall, 2026-07-28). Previously all of this was fetched in the
// browser, which is why the bar rendered three times: signed-out, then signed-in,
// then Job scan appearing.

export type ServerHeaderState = {
  signedIn: boolean;
  email: string;
  profileStatus: "incomplete" | "complete" | "unknown";
};

export const signedOutHeaderState: ServerHeaderState = {
  signedIn: false,
  email: "",
  profileStatus: "unknown",
};

export async function getServerHeaderState(): Promise<ServerHeaderState> {
  const user = await getServerAuthUser();
  if (!user) return signedOutHeaderState;

  const base: ServerHeaderState = { signedIn: true, email: user.email, profileStatus: "unknown" };

  // loadCandidateProfileAggregate, NOT ensureCandidateProfileAggregate: the
  // "ensure" variant creates a profile row when none exists, and this runs on
  // every page render. A Server Component must not write, and it would mint a
  // profile for anyone who merely loaded a page.
  const config = getPublicProfileRepositoryConfig();
  if (!config) return base;

  try {
    const aggregate = await loadCandidateProfileAggregate(
      createPublicProfileRepositoryRequest(config),
      user.userId,
    );
    const status = aggregate?.profileQuality?.status ?? aggregate?.profile?.status;
    return { ...base, profileStatus: status === "complete" ? "complete" : "incomplete" };
  } catch (error) {
    // Never let a profile lookup break the page. "unknown" only costs the Job
    // scan link, and the client reconcile will fill it in a moment later.
    console.error("[header] server profile status lookup failed; Job scan will fill in client-side.", error);
    return base;
  }
}

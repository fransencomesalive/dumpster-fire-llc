"use client";

import { useCallback, useEffect, useState } from "react";
import { useServerHeaderState } from "./AccountSessionProvider";
import { clearPublicProfileAccessToken, readPublicProfileAccessToken } from "@/lib/public-profile/browser-session";
import { signOutSupabaseSession, syncPublicProfileSession } from "@/lib/public-auth/supabase-browser";
import { requestPublicProfileApi } from "@/lib/public-profile/client";

// The signed-in header's single data source (Randall, 2026-07-28). The header is
// profile-dependent on every page, so the identity, the plan, and the profile
// status all have to be readable from outside /onboarding — that is the whole
// reason the account controls moved out of the onboarding profile card.
export const onboardingDraftKeyPrefix = "df-onboarding-drafts:";
// Hand-off used by the plan chooser and the Apply Wizard to ask the header to
// open a specific account popup after navigating.
export const accountPopupHandoffKey = "df-open-account-popup";

export type AccountPlan = {
  email: string | null;
  planName: string | null;
  planCode?: string | null;
  publicPlanName?: string | null;
  status?: string;
  subscriptionStatus?: string;
  source?: string | null;
  used?: number;
  limit?: number;
  remaining?: number;
  periodStart?: string;
  periodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  markdownExport?: boolean;
  hasBillingManagement?: boolean;
};

export type AccountSession = {
  // "checking" until the browser session resolves. The header renders its
  // signed-out contents during that beat, so both states must be the same height.
  status: "checking" | "signed_out" | "signed_in";
  accessToken: string;
  email: string;
  plan: AccountPlan | null;
  profileStatus: "incomplete" | "complete" | "unknown";
  // A popup another surface asked the header to open on arrival. Consumed once.
  pendingPopup: "plan" | "billing" | null;
  refreshPlan: () => Promise<AccountPlan | null>;
  signOut: () => void;
};

export function useAccountSession(enabled = true): AccountSession {
  // Seeded from the layout's server-resolved state, so the very first render
  // already knows whether the user is signed in, their email, and whether the
  // profile is complete. Without this seed the header shipped signed-out and
  // then flipped twice in the browser.
  const seed = useServerHeaderState();
  const seeded = enabled && Boolean(seed?.signedIn);

  const [status, setStatus] = useState<AccountSession["status"]>(
    !enabled ? "signed_out" : seed ? (seed.signedIn ? "signed_in" : "signed_out") : "checking",
  );
  const [accessToken, setAccessToken] = useState("");
  const [email, setEmail] = useState(seeded ? seed!.email : "");
  const [plan, setPlan] = useState<AccountPlan | null>(null);
  const [profileStatus, setProfileStatus] = useState<AccountSession["profileStatus"]>(
    seeded ? seed!.profileStatus : "unknown",
  );
  const [pendingPopup, setPendingPopup] = useState<AccountSession["pendingPopup"]>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const token = (await syncPublicProfileSession()) || readPublicProfileAccessToken();
      if (cancelled) return;
      if (!token) {
        // Only contradict the server if it did not already say we are signed in.
        // A cookie session the browser has not finished reading yet must not be
        // mistaken for a signed-out user, or the bar would flip back and forth.
        if (!seeded) setStatus("signed_out");
        return;
      }
      setAccessToken(token);
      setStatus("signed_in");

      // The plan chooser and the Apply Wizard ask for a popup by writing this key
      // and navigating. It used to be read by OnboardingClient, which is why they
      // both route to /onboarding; the header owns the popup now, so it opens
      // wherever the user lands. Read here rather than in the header so the state
      // update stays off the synchronous path of an effect.
      const requested = window.sessionStorage.getItem(accountPopupHandoffKey);
      if (requested === "plan" || requested === "billing") {
        window.sessionStorage.removeItem(accountPopupHandoffKey);
        setPendingPopup(requested);
      }

      // Neither call may block the header from rendering. A failed plan lookup
      // degrades to an icon with no email; a failed bootstrap leaves the profile
      // status unknown, which hides Job scan.
      //
      // Both failures are reported. A bare `.catch(() => null)` here is what let
      // a wrong HTTP method reach production: the route below is POST-only, a GET
      // 405'd, the catch ate it, and Job scan silently vanished for every
      // complete profile with nothing anywhere saying why.
      const report = (label: string) => (error: unknown) => {
        console.error(`[header] ${label} failed; the header is degraded.`, error);
        return null;
      };
      const [account, bootstrap] = await Promise.all([
        requestPublicProfileApi<AccountPlan>(
          "/api/account/plan",
          { method: "GET", accessToken: token },
        ).catch(report("GET /api/account/plan (email + plan)")),
        // POST, not GET — the bootstrap route only exports POST.
        requestPublicProfileApi<{ profileStatus: "incomplete" | "complete" }>(
          "/api/public-profile/bootstrap",
          { method: "POST", accessToken: token },
        ).catch(report("POST /api/public-profile/bootstrap (profile status)")),
      ]);
      if (cancelled) return;
      if (account) {
        setEmail(account.email ?? "");
        setPlan(account);
      }
      if (bootstrap) setProfileStatus(bootstrap.profileStatus);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, seeded]);

  const refreshPlan = useCallback(async () => {
    if (!accessToken) return null;
    const refreshed = await requestPublicProfileApi<AccountPlan>(
      "/api/account/plan",
      { method: "GET", accessToken },
    );
    setEmail(refreshed.email ?? "");
    setPlan(refreshed);
    return refreshed;
  }, [accessToken]);

  // A hard navigation, not a router push: the header cannot reach into whatever
  // page is mounted to reset its state, and onboarding in particular holds a
  // large amount of profile state. Dropping the document is the only way to
  // guarantee nothing signed-in survives.
  const signOut = useCallback(() => {
    // Onboarding keys its draft by profile id (`df-onboarding-drafts:<id>`), so
    // the header cannot name the key. Sweep the prefix instead — signing out has
    // always cleared the draft, and that has to keep being true now that Sign
    // out lives here rather than on the onboarding profile card.
    try {
      const stale: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key?.startsWith(onboardingDraftKeyPrefix)) stale.push(key);
      }
      stale.forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // noop — worst case a stale draft lingers for the next sign-in
    }
    void signOutSupabaseSession();
    clearPublicProfileAccessToken();
    window.location.assign("/");
  }, []);

  return { status, accessToken, email, plan, profileStatus, pendingPopup, refreshPlan, signOut };
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "../components/SiteHeader";
import { accountPopupHandoffKey } from "../components/useAccountSession";
import { syncPublicProfileSession } from "@/lib/public-auth/supabase-browser";
import { readPublicProfileAccessToken } from "@/lib/public-profile/browser-session";
import { PublicProfileApiError, requestPublicProfileApi } from "@/lib/public-profile/client";
import styles from "./plan.module.css";

type PlanCode = "basic" | "premium";
type FlowState =
  | "checking"
  | "selecting"
  | "redirecting"
  | "processing"
  | "active"
  | "canceled"
  | "applied"
  | "already"
  | "unavailable";

type AccountPlan = {
  planName: string | null;
  publicPlanName?: string | null;
  subscriptionStatus?: string;
  source?: string | null;
  limit?: number;
};

const PLAN_STORAGE_KEY = "df-selected-plan";

const PLANS = [
  {
    code: "basic" as const,
    name: "Smoldering",
    tagline: "Keep a steady burn under your\u00a0search.",
    price: "22",
    allowance: "20",
    featured: false,
    features: [
      "Career profile in your voice",
      "Scan, match ratings, saved jobs, pursuit\u00a0tracking",
      "Contact discovery and custom outreach in your voice",
    ],
  },
  {
    code: "premium" as const,
    name: "Roaring",
    tagline: "Go all in when the search gets hot.",
    price: "32",
    allowance: "45",
    featured: true,
    features: [
      "Markdown export of your full pursuit\u00a0history",
      "Everything in Smoldering",
    ],
  },
] as const;

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SuccessIcon() {
  return (
    <svg className={`${styles.panelIcon} ${styles.panelIconPositive}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="8 12 11 15 16 9" />
    </svg>
  );
}

function publicPlanName(account: AccountPlan | null) {
  if (account?.source === "access_code" || account?.planName === "tester") return "Full access";
  if (account?.publicPlanName) return account.publicPlanName;
  if (account?.planName === "basic") return "Smoldering";
  if (account?.planName === "premium") return "Roaring";
  return "your plan";
}

function planAllowance(account: AccountPlan | null) {
  if (typeof account?.limit === "number") return account.limit;
  if (account?.planName === "tester") return 25;
  return account?.planName === "basic" ? 20 : 45;
}

function hasActivePlan(account: AccountPlan | null) {
  if (!account) return false;
  if (account.subscriptionStatus) {
    return account.subscriptionStatus === "active" || account.subscriptionStatus === "trialing";
  }
  return Boolean(account.planName);
}

function safeStripeRedirect(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "checkout.stripe.com" || url.hostname.endsWith(".stripe.com"))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export default function PlanClient() {
  const router = useRouter();
  const [flow, setFlow] = useState<FlowState>("checking");
  const [token, setToken] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<PlanCode>("basic");
  const [account, setAccount] = useState<AccountPlan | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [codeError, setCodeError] = useState("");

  const loadAccount = useCallback(async (activeToken: string) => {
    const next = await requestPublicProfileApi<AccountPlan>(
      "/api/account/plan",
      { method: "GET", accessToken: activeToken },
    );
    setAccount(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("plan");
      const stored = window.sessionStorage.getItem(PLAN_STORAGE_KEY);
      const initialPlan: PlanCode = requested === "premium" || requested === "basic"
        ? requested
        : stored === "premium"
          ? "premium"
          : "basic";
      setSelectedPlan(initialPlan);
      window.sessionStorage.setItem(PLAN_STORAGE_KEY, initialPlan);

      const active = (await syncPublicProfileSession()) || readPublicProfileAccessToken();
      if (cancelled) return;
      if (!active) {
        router.replace("/signup");
        return;
      }
      setToken(active);

      const checkoutReturn = params.get("checkout");
      const firstAccount = await loadAccount(active).catch(() => null);
      if (cancelled) return;

      if (hasActivePlan(firstAccount)) {
        setFlow(checkoutReturn === "success" ? "active" : "already");
        return;
      }
      if (checkoutReturn === "canceled") {
        setFlow("canceled");
        return;
      }
      if (checkoutReturn !== "success") {
        setFlow("selecting");
        return;
      }

      setFlow("processing");
      for (let attempt = 0; attempt < 12 && !cancelled; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        if (cancelled) return;
        const refreshed = await loadAccount(active).catch(() => null);
        if (hasActivePlan(refreshed)) {
          setFlow("active");
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAccount, router]);

  const startCheckout = useCallback(async (planCode: PlanCode) => {
    if (!token) return;
    setSelectedPlan(planCode);
    window.sessionStorage.setItem(PLAN_STORAGE_KEY, planCode);
    setFlow("redirecting");
    try {
      const result = await requestPublicProfileApi<{ status: string; url: string }>(
        "/api/billing/checkout",
        {
          method: "POST",
          accessToken: token,
          body: { planCode },
          headers: { "Idempotency-Key": `checkout:${crypto.randomUUID()}` },
        },
      );
      const destination = safeStripeRedirect(result.url);
      if (!destination) throw new Error("Stripe returned an invalid checkout address.");
      window.location.assign(destination);
    } catch (error) {
      if (error instanceof PublicProfileApiError && error.status === 409) {
        const refreshed = await loadAccount(token).catch(() => null);
        if (hasActivePlan(refreshed)) {
          setFlow("already");
          return;
        }
      }
      setFlow("unavailable");
    }
  }, [loadAccount, token]);

  const redeem = useCallback(async () => {
    if (!token || !inviteCode.trim()) return;
    setRedeeming(true);
    setCodeError("");
    try {
      await requestPublicProfileApi<{ status: string; planName: string }>(
        "/api/account/redeem-code",
        { method: "POST", accessToken: token, body: { code: inviteCode } },
      );
      const refreshed = await loadAccount(token);
      if (!hasActivePlan(refreshed)) {
        throw new Error("The access code was accepted, but the account is not active yet.");
      }
      setInviteCode("");
      setFlow("applied");
    } catch (error) {
      const body = error instanceof PublicProfileApiError
        ? error.body as { error?: string } | null
        : null;
      setCodeError(body?.error || "This code is invalid, expired, or already used up. Check it and try again, or choose a plan above.");
    } finally {
      setRedeeming(false);
    }
  }, [inviteCode, loadAccount, token]);

  function openProfilePlan() {
    window.sessionStorage.setItem(accountPopupHandoffKey, "plan");
    router.push("/onboarding");
  }

  function retryCheckout() {
    void startCheckout(selectedPlan);
  }

  function refreshProcessing() {
    if (!token) return;
    void loadAccount(token).then((next) => {
      if (hasActivePlan(next)) setFlow("active");
    });
  }

  const planName = publicPlanName(account);

  return (
    <div>
      <SiteHeader sectionHrefPrefix="/" variant="public" />
      {flow === "checking" ? (
        <div className={styles.pageLoad}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.pageLoadGif} src="/DF-small.gif" alt="" aria-hidden="true" />
          <p className={styles.pageLoadLabel}>Loading your plan…</p>
        </div>
      ) : (
        <main className={styles.wrap}>
          {flow === "selecting" ? (
            <>
              <div className={styles.stepHead}>
                <h1>Pick where you want to start</h1>
                <p>You can change plans later. Have an access code? Redeem it below for full access, no checkout.</p>
              </div>
              <div className={styles.tiers}>
                {PLANS.map((plan) => (
                  <article className={`${styles.tier} ${plan.featured ? styles.tierFeatured : ""}`} key={plan.code}>
                    {plan.featured ? <span className={styles.tierTag}>Top plan</span> : null}
                    <div className={styles.tierHead}>
                      <h2 className={styles.tierName}>{plan.name}</h2>
                      <p className={styles.tierTagline}>{plan.tagline}</p>
                      <div className={styles.tierPrice}><span>${plan.price}</span><small>/ month</small></div>
                    </div>
                    <ul className={styles.tierFeatures}>
                      <li className={styles.tierFeatureHero}><Check /><span><b>{plan.allowance}</b> Apply Wizard pursuits a month</span></li>
                      {plan.features.map((feature) => (
                        <li className={feature.startsWith("Markdown") ? styles.tierFeatureHero : undefined} key={feature}>
                          <Check /><span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={`${styles.tierBtn} ${plan.featured ? styles.tierBtnTeal : styles.tierBtnGhost}`}
                      onClick={() => void startCheckout(plan.code)}
                    >
                      Start {plan.name}
                    </button>
                    <p className={styles.cardDisclose}>${plan.price}/month, billed monthly. Cancel anytime, effective at period end.</p>
                  </article>
                ))}
              </div>
              <p className={styles.consentLine}>
                Taxes are shown at checkout. Starting a plan means you agree to the{" "}
                <Link href="/legal/terms">Terms</Link>, <Link href="/legal/privacy">Privacy Policy</Link>, and{" "}
                <Link href="/legal/billing">Billing Terms</Link>. Payment is handled on Stripe&apos;s secure checkout.
              </p>
              <div className={`${styles.codeStrip} ${codeError ? styles.codeStripError : ""}`}>
                <div className={styles.codeCopy}>
                  <strong>{codeError ? "That code didn't work" : "Have an access code?"}</strong>
                  <span className={codeError ? styles.codeError : ""}>
                    {codeError || "Testers get full access with a code. No checkout."}
                  </span>
                </div>
                <div className={styles.codeForm}>
                  <input
                    className={codeError ? styles.codeInputError : ""}
                    type="text"
                    placeholder="Enter access code"
                    aria-label="Access code"
                    value={inviteCode}
                    onChange={(event) => {
                      setInviteCode(event.target.value);
                      if (codeError) setCodeError("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void redeem();
                    }}
                  />
                  <button type="button" className={styles.btnRedeem} disabled={redeeming || !inviteCode.trim()} onClick={() => void redeem()}>
                    {redeeming ? "Redeeming…" : "Redeem"}
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {flow === "redirecting" ? (
            <section className={styles.panel} aria-live="polite">
              <span className={styles.spinner} role="status" aria-label="Loading" />
              <h1>Taking you to secure checkout</h1>
              <p>Hang tight while we open Stripe. Don&apos;t refresh or use the back button.</p>
            </section>
          ) : null}

          {flow === "processing" ? (
            <section className={styles.panel} aria-live="polite">
              <span className={styles.spinner} role="status" aria-label="Finishing" />
              <h1>Payment received. Setting up your plan.</h1>
              <p>This usually takes a few seconds. Your plan unlocks once payment is confirmed, not just because you landed back here. This page refreshes on its own.</p>
              <button type="button" className={styles.btnGhost} onClick={refreshProcessing}>Refresh now</button>
            </section>
          ) : null}

          {flow === "active" ? (
            <section className={`${styles.panel} ${styles.panelPositive}`}>
              <SuccessIcon />
              <h1>You&apos;re {planName}</h1>
              <p>{planAllowance(account)} Apply Wizard pursuits are ready this period. You can manage billing anytime in Profile, then Plan.</p>
              <Link className={styles.btnPrimary} href="/onboarding">Start building your profile</Link>
            </section>
          ) : null}

          {flow === "canceled" ? (
            <section className={styles.panel}>
              <svg className={`${styles.panelIcon} ${styles.panelIconWait}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <h1>OK, nevermind</h1>
              <p>No payment was made. Your plan is still open. Pick back up whenever you&apos;re ready.</p>
              <button type="button" className={styles.btnGhost} onClick={() => setFlow("selecting")}>Back to plans</button>
            </section>
          ) : null}

          {flow === "applied" ? (
            <div className={`${styles.codeStrip} ${styles.codeStripApplied}`}>
              <span className={styles.applyMark}><SuccessIcon />Access code applied. Full access unlocked.</span>
              <Link className={styles.btnContinue} href="/onboarding">Continue to onboarding</Link>
            </div>
          ) : null}

          {flow === "already" ? (
            <section className={`${styles.panel} ${styles.panelPositive}`}>
              <SuccessIcon />
              <h1>You&apos;re already {planName}</h1>
              <p>No need to pick again. Change plans, see usage, or manage billing in Profile, then Plan.</p>
              <div className={styles.btnRow}>
                <button type="button" className={styles.btnPrimary} onClick={openProfilePlan}>Go to Profile, then Plan</button>
                <Link className={styles.btnGhost} href="/onboarding">Continue to onboarding</Link>
              </div>
            </section>
          ) : null}

          {flow === "unavailable" ? (
            <section className={`${styles.panel} ${styles.panelNegative}`}>
              <svg className={`${styles.panelIcon} ${styles.panelIconNegative}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <h1>Checkout is having a moment</h1>
              <p>We couldn&apos;t reach secure checkout just now, and you were not charged. Give it another try in a minute. Your plan choice is saved.</p>
              <button type="button" className={styles.btnPrimary} onClick={retryCheckout}>Try again</button>
            </section>
          ) : null}
        </main>
      )}
    </div>
  );
}

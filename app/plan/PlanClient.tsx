"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "../components/SiteHeader";
import { syncPublicProfileSession } from "@/lib/public-auth/supabase-browser";
import { readPublicProfileAccessToken } from "@/lib/public-profile/browser-session";
import { requestPublicProfileApi } from "@/lib/public-profile/client";
import styles from "./plan.module.css";

// Plan & Billing step (approved plan-billing-step DS card). Everyone lands here
// after auth; for launch the only path forward is an access code (tester) —
// paid checkout is coming soon. A user who already holds a plan is forwarded
// straight to onboarding.
type Tier = {
  name: string;
  featured?: boolean;
  tag?: string;
  features: string[];
};

const TIERS: Tier[] = [
  {
    name: "Good",
    features: [
      "Career profile in your voice",
      "Work examples, woven into your outreach",
    ],
  },
  {
    name: "Gooder",
    featured: true,
    tag: "Most popular",
    features: [
      "Everything in Good",
      "Match ratings on every role",
      "Saved jobs",
      "Contact discovery: customized outreach",
    ],
  },
  {
    name: "Goodest",
    features: [
      "Everything in Gooder",
      "Generate custom outreach (1 per contact)",
      "Pursuit tracking",
      "Export history",
      "Pursue up to 50 jobs each month",
    ],
  },
];

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function PlanClient() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [token, setToken] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [applied, setApplied] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const active = (await syncPublicProfileSession()) || readPublicProfileAccessToken();
      if (cancelled) return;
      if (!active) {
        router.replace("/signup");
        return;
      }
      setToken(active);
      const account = await requestPublicProfileApi<{ email: string | null; planName: string | null }>(
        "/api/account/plan",
        { method: "GET", accessToken: active },
      ).catch(() => null);
      if (cancelled) return;
      if (account?.planName) {
        router.replace("/onboarding");
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const redeem = useCallback(async () => {
    if (!token || !inviteCode.trim()) return;
    setRedeeming(true);
    setMessage("");
    try {
      await requestPublicProfileApi<{ status: string; planName: string }>(
        "/api/account/redeem-code",
        { method: "POST", accessToken: token, body: { code: inviteCode } },
      );
      setInviteCode("");
      setApplied(true);
    } catch (error) {
      const body = (error as { body?: { error?: string } }).body;
      setMessage(body?.error || "That code did not work.");
    } finally {
      setRedeeming(false);
    }
  }, [token, inviteCode]);

  function chooseTier() {
    setMessage("Paid checkout is coming soon — redeem an access code to get started.");
  }

  return (
    <div>
      <SiteHeader sectionHrefPrefix="/" />
      {checking ? (
        <p className={styles.loading}>Loading…</p>
      ) : (
        <div className={styles.wrap}>
          {applied ? (
            <>
              <div className={styles.stepHead}>
                <h1>You&rsquo;re all set</h1>
                <p>Full access is unlocked. Next, build your profile.</p>
              </div>
              <div className={`${styles.codeStrip} ${styles.codeStripApplied}`}>
                <span className={styles.applyMark}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <polyline points="8 12 11 15 16 9" />
                  </svg>
                  Access code applied — full access unlocked
                </span>
                <button type="button" className={styles.btnContinue} onClick={() => router.push("/onboarding")}>
                  Continue to onboarding
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.stepHead}>
                <h1>Pick where you want to start</h1>
                <p>You can change plans later. Have an access code? Redeem it below for full access.</p>
              </div>

              <div className={styles.tiers}>
                {TIERS.map((tier) => (
                  <div key={tier.name} className={`${styles.tier} ${tier.featured ? styles.tierFeatured : ""}`}>
                    {tier.tag ? <span className={styles.tierTag}>{tier.tag}</span> : null}
                    <div>
                      <div className={styles.tierName}>{tier.name}</div>
                      <div className={styles.tierPrice}>Pricing coming soon</div>
                    </div>
                    <ul className={styles.tierFeatures}>
                      {tier.features.map((f) => (
                        <li key={f}><Check />{f}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={`${styles.tierBtn} ${tier.featured ? styles.tierBtnTeal : styles.tierBtnGhost}`}
                      onClick={chooseTier}
                    >
                      Choose {tier.name}
                    </button>
                    <p className={styles.comingSoon}>Checkout coming soon</p>
                  </div>
                ))}
              </div>

              <div className={styles.codeStrip}>
                <div className={styles.codeCopy}>
                  <span className={styles.t}>Have an access code?</span>
                  <span className={styles.s}>Testers get full access with a code — no checkout.</span>
                </div>
                <div className={styles.codeForm}>
                  <input
                    type="text"
                    placeholder="Enter access code"
                    aria-label="Access code"
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") void redeem(); }}
                  />
                  <button type="button" className={styles.btnRedeem} disabled={redeeming || !inviteCode.trim()} onClick={redeem}>
                    {redeeming ? "Redeeming…" : "Redeem"}
                  </button>
                </div>
              </div>

              <p className={styles.msg}>{message}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

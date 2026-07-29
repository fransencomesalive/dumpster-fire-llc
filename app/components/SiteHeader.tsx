"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import mascotImg from "../dumpsterfireguy.png";
import styles from "../site.module.css";
import AccountPopup, { type AccountPopupKind } from "./AccountPopup";
import { useAccountSession } from "./useAccountSession";

const CONTACT_HREF = "mailto:fransencomesalive@gmail.com?subject=Dumpster%20Fire";

// The persistent sticky site header, shared by every surface so the two states
// never drift. One bar, one grid, two sets of contents — the layout is the live
// production header and does not change (design-system/components/header.html r8,
// approved by Randall 2026-07-28). Signed in, only what sits inside the two
// existing slots differs: the links row becomes Job scan / Saved Pursuits, a
// divider, then Plan and Billing; the actions slot becomes the email and the
// profile icon. Below 900px the links move into a hamburger rather than wrapping,
// so the bar is one line at every width.
export default function SiteHeader({
  sectionHrefPrefix = "",
  variant = "auto",
}: {
  sectionHrefPrefix?: string;
  // "public" forces the signed-out bar on /signup and /plan: the user is
  // authenticated there but has no plan yet, so Plan, Billing, and Job scan
  // would be lies.
  variant?: "auto" | "public";
}) {
  const session = useAccountSession(variant === "auto");
  // null = untouched, so a popup handed off by another surface can still show.
  const [popup, setPopup] = useState<AccountPopupKind | null>(null);
  const [handoffConsumed, setHandoffConsumed] = useState(false);

  const signedIn = variant === "auto" && session.status === "signed_in";
  const openPopup = popup ?? (handoffConsumed ? null : session.pendingPopup);

  function closePopup() {
    setHandoffConsumed(true);
    setPopup(null);
  }

  function choosePopup(next: AccountPopupKind) {
    setHandoffConsumed(true);
    setPopup(next);
  }
  const showJobScan = session.profileStatus === "complete";


  if (!signedIn) {
    return (
      <header className={styles.publicLandingNav} aria-label="Dumpster Fire navigation">
        <div className={styles.publicLandingNavLeft}>
          <Link className={styles.publicLandingNavBrand} href="/" aria-label="Dumpster Fire home">
            <Image className={styles.publicLandingNavMark} src={mascotImg} alt="" sizes="40px" />
            <span>Home</span>
          </Link>
          <nav className={styles.publicLandingNavLinks} aria-label="Page sections">
            <a href={`${sectionHrefPrefix}#features`}>Features</a>
            <a href={`${sectionHrefPrefix}#human-path`}>Human Path</a>
            <a href={`${sectionHrefPrefix}#subscription`}>Pricing</a>
            <a href={CONTACT_HREF}>Contact</a>
          </nav>
        </div>
        <div className={styles.publicLandingNavActions}>
          <Link className={styles.publicLandingNavSignIn} href="/onboarding">
            Sign in
          </Link>
          <Link className={styles.publicLandingNavCta} href="/signup">
            Create profile
          </Link>
        </div>
      </header>
    );
  }

  return (
    <>
      <header
        className={`${styles.publicLandingNav} ${styles.publicLandingNavSignedIn}`}
        aria-label="Dumpster Fire navigation"
      >
        <div className={styles.publicLandingNavLeft}>
          {/* Home is the profile page once you are signed in. */}
          <Link className={styles.publicLandingNavBrand} href="/onboarding" aria-label="Your profile">
            <Image className={styles.publicLandingNavMark} src={mascotImg} alt="" sizes="40px" />
            <span>Home</span>
          </Link>
          <nav className={styles.publicLandingNavLinks} aria-label="Browse">
            {showJobScan ? <Link href="/dashboard">Job scan</Link> : null}
            <Link href="/saved-pursuits">Saved Pursuits</Link>
            <span className={styles.publicLandingNavSep} aria-hidden="true" />
            <button type="button" onClick={() => choosePopup("plan")}>Plan</button>
            <button type="button" onClick={() => choosePopup("billing")}>Billing</button>
          </nav>
        </div>

        <div className={styles.publicLandingNavActions}>
          <div className={styles.publicLandingNavIdentity}>
            {session.email ? <span className={styles.publicLandingNavEmail}>{session.email}</span> : null}
            <div className={styles.publicLandingNavProfileWrap}>
              <button
                type="button"
                className={styles.publicLandingNavProfile}
                aria-haspopup="menu"
                aria-label="Your account"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M12 14c-5 0-8 2.7-8 6v0h16v0c0-3.3-3-6-8-6z" /></svg>
              </button>
              {/* Opens on hover and on keyboard focus — hover alone would be
                  unreachable by keyboard and touch. */}
              <div className={styles.publicLandingNavMenu} role="menu">
                <div className={styles.publicLandingNavMenuCard}>
                  <button
                    type="button"
                    className={styles.publicLandingNavSignOut}
                    role="menuitem"
                    onClick={session.signOut}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.publicLandingNavBurgerWrap}>
            <button
              type="button"
              className={styles.publicLandingNavBurger}
              aria-haspopup="menu"
              aria-label="Menu"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            </button>
            {/* Carries exactly what left the bar: the two links, then Plan and
                Billing. Sign out stays on the profile icon. */}
            <div className={styles.publicLandingNavBurgerMenu} role="menu">
              <div className={styles.publicLandingNavBurgerCard}>
                {showJobScan ? (
                  <Link href="/dashboard" role="menuitem"><span>Job scan</span></Link>
                ) : null}
                <Link href="/saved-pursuits" role="menuitem"><span>Saved Pursuits</span></Link>
                <button type="button" role="menuitem" onClick={() => choosePopup("plan")}><span>Plan</span></button>
                <button type="button" role="menuitem" onClick={() => choosePopup("billing")}><span>Billing</span></button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <AccountPopup
        kind={openPopup}
        onKindChange={choosePopup}
        onClose={closePopup}
        accessToken={session.accessToken}
        accountPlan={session.plan}
        refreshPlan={session.refreshPlan}
      />
    </>
  );
}

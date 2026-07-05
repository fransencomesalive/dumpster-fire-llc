import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import mascotImg from "../scans/dumpsterfireguy.png";
import styles from "../site.module.css";

// The persistent sticky site header, shared by the homepage and onboarding so the
// two never drift (Randall, 2026-07-05). Markup + classes are lifted verbatim from
// the homepage nav. Section links take an optional prefix so the same nav can point
// at the homepage's in-page anchors from another route (e.g. "/" from /onboarding).
export default function SiteHeader({
  sectionHrefPrefix = "",
  actions,
}: {
  sectionHrefPrefix?: string;
  actions?: ReactNode;
}) {
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
          <a href="mailto:fransencomesalive@gmail.com?subject=Dumpster%20Fire">Contact</a>
        </nav>
      </div>
      <div className={styles.publicLandingNavActions}>
        {actions ?? (
          <>
            <Link className={styles.publicLandingNavSignIn} href="/onboarding">
              Sign in
            </Link>
            <Link className={styles.publicLandingNavCta} href="/onboarding">
              Create profile
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

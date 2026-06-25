import Link from "next/link";
import HomeAuthRouter from "./HomeAuthRouter";
import styles from "./site.module.css";

export default function HomePage() {
  return (
    <main className={styles.page}>
      <HomeAuthRouter />
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.copy}>
          <p className={styles.status}>Public site in progress</p>
          <h1 id="home-title">The Job Market Is a Dumpster Fire</h1>
          <p>
            The public home is being shaped from source notes and profiles. Private scans are already staged behind an
            access-code gate.
          </p>
          <div className={styles.actions}>
            <Link className={styles.link} href="/onboarding">
              Start public onboarding
            </Link>
            <Link className={styles.secondaryLink} href="/scans">
              Open private scans
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { publicProfileOnboardingSections } from "@/lib/public-profile/onboarding";
import OnboardingClient from "./OnboardingClient";
import styles from "./onboarding.module.css";

export const metadata = {
  title: "Onboarding",
  description: "Build the Career Operating System profile used by The Job Market Is a Dumpster Fire.",
};

export default function OnboardingPage() {
  const requiredSections = publicProfileOnboardingSections.filter((section) => section.required);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.nav} aria-label="Onboarding navigation">
          <Link className={styles.brand} href="/">
            The Job Market Is a Dumpster Fire
          </Link>
          <Link className={styles.homeLink} href="/">
            Back to public home
          </Link>
        </nav>

        <section className={styles.hero} aria-labelledby="onboarding-title">
          <div className={styles.intro}>
            <h1 id="onboarding-title">Build the profile once. Use it everywhere.</h1>
            <p>
              This onboarding flow creates the structured Career Operating System behind matching, proof selection,
              Human Path, and outreach. Complete the sections once, then keep improving the profile as your search
              changes.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primaryAction} href="#sections">
                Review sections
              </Link>
              <Link className={styles.secondaryAction} href="/">
                Back to public home
              </Link>
            </div>
          </div>

          <aside className={styles.statusCard} aria-label="Profile completion status">
            <p className={styles.statusLabel}>Profile Completion</p>
            <p className={styles.statusValue}>Sign in</p>
            <p className={styles.statusDetail}>
              Required sections: {requiredSections.length}. Live completion status appears after profile sign-in.
            </p>
          </aside>
        </section>
        <OnboardingClient sections={publicProfileOnboardingSections} />
      </div>
    </main>
  );
}

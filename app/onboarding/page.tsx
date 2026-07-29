import { publicProfileOnboardingSections } from "@/lib/public-profile/onboarding";
import SiteHeader from "../components/SiteHeader";
import OnboardingClient from "./OnboardingClient";
import styles from "./onboarding.module.css";

export const metadata = {
  title: "Onboarding",
  description: "Build the career profile used by The Job Market Is a Dumpster Fire.",
};

export default function OnboardingPage() {
  return (
    <>
      {/* Outside <main> so the header sits at the same viewport offset on every
          page. Inside, main's page padding pushed it 72px down while Saved
          Pursuits sat at 12px. */}
      <SiteHeader />
      <main className={styles.page}>
        <OnboardingClient sections={publicProfileOnboardingSections} />
      </main>
    </>
  );
}

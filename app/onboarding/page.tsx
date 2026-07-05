import { publicProfileOnboardingSections } from "@/lib/public-profile/onboarding";
import OnboardingClient from "./OnboardingClient";
import styles from "./onboarding.module.css";

export const metadata = {
  title: "Onboarding",
  description: "Build the career profile used by The Job Market Is a Dumpster Fire.",
};

export default function OnboardingPage() {
  return (
    <main className={styles.page}>
      <OnboardingClient sections={publicProfileOnboardingSections} />
    </main>
  );
}

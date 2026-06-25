"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearPublicProfileAccessToken, readPublicProfileAccessToken } from "@/lib/public-profile/browser-session";
import { requestPublicProfileApi } from "@/lib/public-profile/client";
import styles from "../site.module.css";

type BootstrapResponse = {
  profileStatus: "incomplete" | "complete";
  profileQuality: {
    incompleteReasons: string[];
    weakResponseCount: number;
  };
};

type GuardState =
  | { status: "checking" }
  | { status: "complete"; blockerCount: number; weakResponseCount: number }
  | { status: "error"; message: string };

export default function DashboardClient() {
  const router = useRouter();
  const [guardState, setGuardState] = useState<GuardState>({ status: "checking" });

  useEffect(() => {
    const accessToken = readPublicProfileAccessToken();
    if (!accessToken) {
      router.replace("/onboarding");
      return;
    }

    requestPublicProfileApi<BootstrapResponse>("/api/public-profile/bootstrap", {
      method: "POST",
      accessToken,
    })
      .then((response) => {
        if (response.profileStatus !== "complete") {
          router.replace("/onboarding");
          return;
        }

        setGuardState({
          status: "complete",
          blockerCount: response.profileQuality.incompleteReasons.length,
          weakResponseCount: response.profileQuality.weakResponseCount,
        });
      })
      .catch((error) => {
        clearPublicProfileAccessToken();
        setGuardState({
          status: "error",
          message: error instanceof Error ? error.message : "Dashboard access could not be verified.",
        });
      });
  }, [router]);

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="dashboard-title">
        <div className={styles.copy}>
          <p className={styles.status}>Profile Complete</p>
          <h1 id="dashboard-title">Your Career Operating System is active.</h1>
          {guardState.status === "checking" ? (
            <p>Checking profile readiness before opening the dashboard.</p>
          ) : null}
          {guardState.status === "complete" ? (
            <>
              <p>
                Dumpster Fire can now match jobs against your Role Tracks, select proof, recommend resumes, and route
                outreach through the profile you built.
              </p>
              <p>
                {guardState.blockerCount} blockers and {guardState.weakResponseCount} weak responses remain.
              </p>
              <div className={styles.actions}>
                <Link className={styles.link} href="/onboarding">
                  Edit profile inputs
                </Link>
                <Link className={styles.secondaryLink} href="/">
                  Back to public home
                </Link>
              </div>
            </>
          ) : null}
          {guardState.status === "error" ? (
            <>
              <p>{guardState.message}</p>
              <div className={styles.actions}>
                <Link className={styles.link} href="/onboarding">
                  Return to onboarding
                </Link>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}

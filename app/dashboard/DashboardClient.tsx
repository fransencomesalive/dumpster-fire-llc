"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearPublicProfileAccessToken, readPublicProfileAccessToken } from "@/lib/public-profile/browser-session";
import { requestPublicProfileApi } from "@/lib/public-profile/client";
import { publicProfileOnboardingSections } from "@/lib/public-profile/onboarding";
import OnboardingClient from "../onboarding/OnboardingClient";
import styles from "../site.module.css";
import type { PublicJobRecord, PublicJobsResponse, PublicJobsScanResponse } from "@/lib/public-jobs/types";

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

type JobsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; response: PublicJobsResponse; message?: string }
  | { status: "error"; message: string };

function formatJobDate(value?: string) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function DashboardClient() {
  const router = useRouter();
  const [guardState, setGuardState] = useState<GuardState>({ status: "checking" });
  const [jobsState, setJobsState] = useState<JobsState>({ status: "idle" });
  const [jobsBusy, setJobsBusy] = useState(false);
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);

  async function loadJobs(accessToken: string, message?: string) {
    setJobsState((state) => state.status === "ready" ? { ...state, message } : { status: "loading" });
    const response = await requestPublicProfileApi<PublicJobsResponse>("/api/jobs", {
      method: "GET",
      accessToken,
    });
    setJobsState({ status: "ready", response, message });
  }

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
        return loadJobs(accessToken).catch((error) => {
          setJobsState({
            status: "error",
            message: error instanceof Error ? error.message : "Jobs could not be loaded.",
          });
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

  async function runScan() {
    const accessToken = readPublicProfileAccessToken();
    if (!accessToken) {
      router.replace("/onboarding");
      return;
    }

    setJobsBusy(true);
    setJobsState((state) => state.status === "ready" ? { ...state, message: "Scanning from your current profile search requirements…" } : { status: "loading" });
    try {
      const response = await requestPublicProfileApi<PublicJobsScanResponse>("/api/jobs/scan", {
        method: "POST",
        accessToken,
      });
      setJobsState({
        status: "ready",
        response,
        message: `${response.scan.matchedJobs} matched job${response.scan.matchedJobs === 1 ? "" : "s"} scanned. ${response.scan.mergedResults} active job${response.scan.mergedResults === 1 ? "" : "s"} available.`,
      });
    } catch (error) {
      setJobsState({
        status: "error",
        message: error instanceof Error ? error.message : "Scan failed.",
      });
    } finally {
      setJobsBusy(false);
    }
  }

  async function setJobSaved(job: PublicJobRecord, saved: boolean) {
    const accessToken = readPublicProfileAccessToken();
    if (!accessToken) {
      router.replace("/onboarding");
      return;
    }

    setJobsBusy(true);
    try {
      const response = await requestPublicProfileApi<PublicJobsResponse>("/api/jobs/save", {
        method: "POST",
        accessToken,
        body: { jobId: job.id, saved },
      });
      setJobsState({
        status: "ready",
        response,
        message: saved ? "Saved for pursue later." : "Removed from Saved Jobs.",
      });
    } catch (error) {
      setJobsState({
        status: "error",
        message: error instanceof Error ? error.message : "Saved Jobs update failed.",
      });
    } finally {
      setJobsBusy(false);
    }
  }

  const jobsResponse = jobsState.status === "ready" ? jobsState.response : undefined;
  const jobs = jobsResponse?.jobs ?? [];
  const savedJobs = jobs.filter((job) => job.saved);

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
                Dumpster Fire has the full picture it needs. Scan, Matching, Saved Jobs, Pursuits, Human Path,
                Outreach, and Pursued Jobs Export can build from this profile.
              </p>
              <p>
                Profile gate clear: {guardState.blockerCount} blockers and {guardState.weakResponseCount} weak
                responses remain in the current completion check.
              </p>
              <div className={styles.actions}>
                <button className={styles.linkButton} onClick={() => setIsProfileEditorOpen(true)} type="button">
                  Edit Career Profile
                </button>
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
      {guardState.status === "complete" ? (
        <section className={styles.jobsPanel} aria-labelledby="jobs-title">
          <div className={styles.jobsPanelHeader}>
            <div>
              <p className={styles.status}>Jobs</p>
              <h2 id="jobs-title">Scan results and Saved Jobs.</h2>
              <p>
                Scan uses your current Career Profile search requirements. New scans merge with unsaved and
                unactioned prior results so nothing useful disappears.
              </p>
            </div>
            <button className={styles.linkButton} disabled={jobsBusy} onClick={runScan} type="button">
              {jobsBusy ? "Scanning…" : "Run scan"}
            </button>
          </div>

          <div className={styles.jobsSummaryGrid}>
            <div>
              <span>{jobsResponse?.summary.totalJobs ?? 0}</span>
              <small>Active jobs</small>
            </div>
            <div>
              <span>{jobsResponse?.summary.savedJobs ?? 0}</span>
              <small>Saved for pursue later</small>
            </div>
            <div>
              <span>{jobsResponse?.summary.lastScanAt ? formatJobDate(jobsResponse.summary.lastScanAt) : "Not scanned"}</span>
              <small>Last scan</small>
            </div>
          </div>

          {jobsState.status === "loading" ? (
            <p className={styles.jobsMessage}>Loading jobs…</p>
          ) : null}
          {jobsState.status === "error" ? (
            <p className={styles.jobsError}>{jobsState.message}</p>
          ) : null}
          {jobsState.status === "ready" && jobsState.message ? (
            <p className={styles.jobsMessage}>{jobsState.message}</p>
          ) : null}

          <div className={styles.jobsGrid}>
            <div className={styles.jobsColumn}>
              <h3>Jobs</h3>
              {jobs.length === 0 ? (
                <p className={styles.jobsEmpty}>No active jobs yet. Run a scan after your profile search requirements are ready.</p>
              ) : (
                <div className={styles.jobCardList}>
                  {jobs.map((job) => (
                    <article className={styles.jobCard} key={job.id}>
                      <div>
                        <p>{job.companyName}</p>
                        <h4>{job.title}</h4>
                      </div>
                      <dl>
                        <div><dt>Location</dt><dd>{job.location || job.remoteType || "Unknown"}</dd></div>
                        <div><dt>Source</dt><dd>{job.source}</dd></div>
                        <div><dt>First seen</dt><dd>{formatJobDate(job.firstSeenAt)}</dd></div>
                        <div><dt>Last seen</dt><dd>{formatJobDate(job.lastSeenAt)}</dd></div>
                      </dl>
                      {job.compensationText ? <p className={styles.jobMetaText}>{job.compensationText}</p> : null}
                      <div className={styles.jobActions}>
                        <a href={job.sourceUrl} rel="noreferrer" target="_blank">Open posting</a>
                        <button disabled={jobsBusy} onClick={() => setJobSaved(job, !job.saved)} type="button">
                          {job.saved ? "Saved" : "Save for later"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <aside className={styles.jobsColumn}>
              <h3>Saved Jobs</h3>
              {savedJobs.length === 0 ? (
                <p className={styles.jobsEmpty}>Saved Jobs are only for pursue later. They do not create pursuits yet.</p>
              ) : (
                <div className={styles.jobCardList}>
                  {savedJobs.map((job) => (
                    <article className={styles.jobCard} key={`saved-${job.id}`}>
                      <div>
                        <p>{job.companyName}</p>
                        <h4>{job.title}</h4>
                      </div>
                      <p className={styles.jobMetaText}>Saved for pursue later. Pursuit creation comes in the next workflow step.</p>
                      <div className={styles.jobActions}>
                        <a href={job.sourceUrl} rel="noreferrer" target="_blank">Open posting</a>
                        <button disabled={jobsBusy} onClick={() => setJobSaved(job, false)} type="button">
                          Unsave
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </aside>
          </div>
        </section>
      ) : null}
      {isProfileEditorOpen ? (
        <section className={styles.profileEditorOverlay} aria-labelledby="profile-editor-title" role="dialog" aria-modal="true">
          <div className={styles.profileEditorShell}>
            <header className={styles.profileEditorHeader}>
              <div>
                <p className={styles.profileEditorLabel}>Career Profile</p>
                <h2 id="profile-editor-title">Edit Career Profile</h2>
                <p>
                  Maintain the structured profile behind Scan, Matching, Saved Jobs, Pursuits, Human Path,
                  Outreach, and Pursued Jobs Export. No profile export lives here.
                </p>
              </div>
              <button className={styles.profileEditorClose} onClick={() => setIsProfileEditorOpen(false)} type="button">
                Close
              </button>
            </header>
            <div className={styles.profileEditorBody}>
              <nav className={styles.profileEditorNav} aria-label="Career Profile sections">
                {publicProfileOnboardingSections.map((section) => (
                  <a href={`#career-profile-${section.key}`} key={section.key}>
                    <span>{section.label}</span>
                    <small>{section.required ? "Required" : "Optional"}</small>
                  </a>
                ))}
              </nav>
              <div className={styles.profileEditorContent}>
                <OnboardingClient sections={publicProfileOnboardingSections} mode="profile-editor" />
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}

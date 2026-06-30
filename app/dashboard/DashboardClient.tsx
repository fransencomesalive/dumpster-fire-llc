"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearPublicProfileAccessToken, readPublicProfileAccessToken } from "@/lib/public-profile/browser-session";
import { requestPublicProfileApi } from "@/lib/public-profile/client";
import { publicProfileOnboardingSections } from "@/lib/public-profile/onboarding";
import OnboardingClient from "../onboarding/OnboardingClient";
import styles from "../site.module.css";
import jobsStyles from "./dashboard.module.css";
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

function truncateText(value: string, max = 240) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

function matchBadgeClass(label?: string) {
  switch (label) {
    case "Strong Match": return jobsStyles.matchStrong;
    case "Potential Match": return jobsStyles.matchPotential;
    case "Weak Match": return jobsStyles.matchWeak;
    default: return jobsStyles.matchLow;
  }
}

function JobMetaGrid({ job }: { job: PublicJobRecord }) {
  return (
    <dl className={jobsStyles.metaGrid}>
      <div><dt>Source</dt><dd>{job.source}</dd></div>
      <div><dt>Salary</dt><dd>{job.compensationText || "Not listed"}</dd></div>
      <div><dt>Remote</dt><dd>{job.remoteType || "Unknown"}</dd></div>
      <div><dt>Location</dt><dd>{job.location || "Unknown"}</dd></div>
    </dl>
  );
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
    setJobsState((state) => state.status === "ready" ? { ...state, message: "Scanning from your current profile targets..." } : { status: "loading" });
    try {
      const response = await requestPublicProfileApi<PublicJobsScanResponse>("/api/jobs/scan", {
        method: "POST",
        accessToken,
      });
      setJobsState({
        status: "ready",
        response,
        message: `${response.scan.matchedJobs} matched job${response.scan.matchedJobs === 1 ? "" : "s"} found. ${response.scan.mergedResults} active job${response.scan.mergedResults === 1 ? "" : "s"} available.`,
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
        message: saved ? "Saved for later." : "Removed from Saved Jobs.",
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
          <h1 id="dashboard-title">Your career profile is active.</h1>
          {guardState.status === "checking" ? (
            <p>Checking profile readiness before opening the dashboard.</p>
          ) : null}
          {guardState.status === "complete" ? (
            <>
              <p>
                Dumpster Fire has enough of the picture to start working from your profile. You can keep refining it
                as your search changes.
              </p>
              <p>
                Profile check: {guardState.blockerCount} blocker{guardState.blockerCount === 1 ? "" : "s"} and{" "}
                {guardState.weakResponseCount} weak response{guardState.weakResponseCount === 1 ? "" : "s"}.
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
        <section className={jobsStyles.jobsPanel} aria-labelledby="jobs-title">
          <div className={jobsStyles.panelHeaderRow}>
            <div>
              <h2 className={jobsStyles.panelTitle} id="jobs-title">Scan results &amp; Saved Jobs</h2>
              <p className={jobsStyles.panelLede}>
                Scan uses your current profile targets and constraints. New scans merge with unsaved,
                unactioned prior results so useful jobs do not disappear between sessions.
              </p>
            </div>
            <button className={jobsStyles.runScanBtn} disabled={jobsBusy} onClick={runScan} type="button">
              {jobsBusy ? "Scanning…" : "Run scan"}
            </button>
          </div>

          <div className={jobsStyles.summaryGrid}>
            <div className={jobsStyles.summaryStat}>
              <span>{jobsResponse?.summary.totalJobs ?? 0}</span>
              <small>Active jobs</small>
            </div>
            <div className={jobsStyles.summaryStat}>
              <span>{jobsResponse?.summary.savedJobs ?? 0}</span>
              <small>Saved for later</small>
            </div>
            <div className={jobsStyles.summaryStat}>
              <span>{jobsResponse?.summary.lastScanAt ? formatJobDate(jobsResponse.summary.lastScanAt) : "Not scanned"}</span>
              <small>Last scan</small>
            </div>
          </div>

          {jobsState.status === "loading" ? (
            <p className={jobsStyles.message}>Loading jobs…</p>
          ) : null}
          {jobsState.status === "error" ? (
            <p className={jobsStyles.error}>{jobsState.message}</p>
          ) : null}
          {jobsState.status === "ready" && jobsState.message ? (
            <p className={jobsStyles.message}>{jobsState.message}</p>
          ) : null}

          <div className={jobsStyles.jobsGrid}>
            <div className={jobsStyles.column}>
              <h3 className={jobsStyles.columnTitle}>Jobs</h3>
              {jobs.length === 0 ? (
                <p className={jobsStyles.empty}>No active jobs yet. Run a scan after your profile search requirements are ready.</p>
              ) : (
                <div className={jobsStyles.cardList}>
                  {jobs.map((job, index) => (
                    <article className={jobsStyles.jobCard} key={job.id}>
                      <div className={jobsStyles.jobCardHeader}>
                        <span className={jobsStyles.rankNumber} aria-hidden="true">{index + 1}</span>
                        <h4 className={jobsStyles.jobTitle}>
                          {job.title}
                          <span className={jobsStyles.titleDivider} aria-hidden="true" />
                          <span className={jobsStyles.companyName}>{job.companyName}</span>
                        </h4>
                      </div>
                      {job.match ? (
                        <div className={jobsStyles.fitRow}>
                          <span className={jobsStyles.fitLabel}>Fit</span>
                          <span className={jobsStyles.fitScore}>{job.match.score}<small>/100</small></span>
                          <span className={`${jobsStyles.matchBadge} ${matchBadgeClass(job.match.label)}`}>{job.match.label}</span>
                        </div>
                      ) : null}
                      <JobMetaGrid job={job} />
                      {job.description ? (
                        <div className={jobsStyles.descriptionBox}>
                          <p className={jobsStyles.descriptionText}>{truncateText(job.description)}</p>
                        </div>
                      ) : null}
                      <div className={jobsStyles.actionRail}>
                        <button className={job.saved ? jobsStyles.btnSaved : jobsStyles.btnSave} disabled={jobsBusy} onClick={() => setJobSaved(job, !job.saved)} type="button">
                          {job.saved ? "Saved" : "Save for later"}
                        </button>
                        <a className={jobsStyles.btnSource} href={job.sourceUrl} rel="noreferrer" target="_blank">Open posting ↗</a>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <aside className={jobsStyles.column}>
              <h3 className={jobsStyles.columnTitle}>Saved Jobs</h3>
              {savedJobs.length === 0 ? (
                <p className={jobsStyles.empty}>Save jobs you want to revisit before deciding whether to pursue them.</p>
              ) : (
                <div className={jobsStyles.cardList}>
                  {savedJobs.map((job) => (
                    <article className={jobsStyles.jobCard} key={`saved-${job.id}`}>
                      <h4 className={jobsStyles.jobTitle}>
                        {job.title}
                        <span className={jobsStyles.titleDivider} aria-hidden="true" />
                        <span className={jobsStyles.companyName}>{job.companyName}</span>
                      </h4>
                      <JobMetaGrid job={job} />
                      <div className={jobsStyles.actionRail}>
                        <button className={jobsStyles.btnSaved} disabled={jobsBusy} onClick={() => setJobSaved(job, false)} type="button">
                          Unsave
                        </button>
                        <a className={jobsStyles.btnSource} href={job.sourceUrl} rel="noreferrer" target="_blank">Open posting ↗</a>
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
                  Keep the profile current so scans, saved jobs, and Human Path can stay grounded in what
                  you actually want.
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

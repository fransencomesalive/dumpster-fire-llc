"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { clearPublicProfileAccessToken, readPublicProfileAccessToken } from "@/lib/public-profile/browser-session";
import { syncPublicProfileSession } from "@/lib/public-auth/supabase-browser";
import { PublicProfileApiError, requestPublicProfileApi } from "@/lib/public-profile/client";
import ApplyWizardModal from "./ApplyWizardModal";
import styles from "../site.module.css";
import jobsStyles from "./dashboard.module.css";
import type { PublicJobBoardRecord, PublicJobBoardsResponse, PublicJobRecord, PublicJobsResponse, PublicJobsScanResponse } from "@/lib/public-jobs/types";

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

type ScanProgress =
  | { status: "idle" }
  | { status: "running"; phase: 0 | 1 | 2 }
  | { status: "complete"; roles: number; fits: number }
  | { status: "error"; message: string };

const SCAN_PHASES = ["Fetching", "Matching", "Saving"] as const;

function formatJobDate(value?: string) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatRemotePreference(value: string) {
  switch (value) {
    case "remote_only": return "Remote only";
    case "remote_preferred": return "Remote preferred";
    case "hybrid_ok": return "Hybrid OK";
    case "onsite_ok": return "Onsite OK";
    default: return value;
  }
}

function truncateText(value: string, max = 220) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

function boardDomain(careersUrl: string) {
  try {
    return new URL(careersUrl).hostname;
  } catch {
    return careersUrl;
  }
}

const STAR_POINTS = "12 2 15 9 22 9.3 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9.3 9 9";

function starsFromScore(score: number) {
  return Math.max(1, Math.min(5, Math.round(score / 20)));
}

function StarRow({ score }: { score: number }) {
  const filled = starsFromScore(score);
  return (
    <span className={jobsStyles.starIconRow} title={`${score}/100`} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((index) => (
        <svg key={index} width="15" height="15" viewBox="0 0 24 24" fill={index < filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
          <polygon points={STAR_POINTS} />
        </svg>
      ))}
    </span>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Wrap occurrences of the candidate's matched signals in a mustard highlight.
function highlightText(text: string, signals: string[]): ReactNode {
  const terms = signals.map((signal) => signal.trim()).filter((signal) => signal.length >= 3);
  if (terms.length === 0) return text;
  const escaped = [...terms].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const splitter = new RegExp(`(${escaped.join("|")})`, "gi");
  const matcher = new RegExp(`^(${escaped.join("|")})$`, "i");
  return text
    .split(splitter)
    .filter((part) => part !== "")
    .map((part, index) =>
      matcher.test(part)
        ? <mark key={index} className={jobsStyles.matchHighlight} style={{ "--rot": `${index % 2 ? 1.4 : -1.6}deg` } as CSSProperties}>{part}</mark>
        : <span key={index}>{part}</span>,
    );
}

// Collapsed to a ~5-line preview so a long posting doesn't dominate the scroll
// (Randall, 2026-07-11). Measures the full list once; only long sections get a
// clamp + "Show more" toggle.
const MATCH_CLAMP_PX = 148;

function MatchSection({ label, items, signals }: { label: string; items: string[]; signals: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) setOverflowing(el.scrollHeight > MATCH_CLAMP_PX + 8);
  }, [items]);
  if (items.length === 0) return null;
  const clamped = overflowing && !expanded;
  return (
    <div className={jobsStyles.matchSection}>
      <span className={jobsStyles.matchSectionLabel}>{label}</span>
      <ul ref={listRef} className={`${jobsStyles.matchSectionList} ${clamped ? jobsStyles.matchSectionListClamped : ""}`}>
        {items.map((item, index) => <li key={index}>{highlightText(item, signals)}</li>)}
      </ul>
      {overflowing ? (
        <button type="button" className={jobsStyles.matchSectionToggle} onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

function JobMetaGrid({ job }: { job: PublicJobRecord }) {
  return (
    <dl className={jobsStyles.jobMetaGrid}>
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
  const [pursuitContext, setPursuitContext] = useState<{ job: PublicJobRecord; accessToken: string } | null>(null);
  const [fitFilter, setFitFilter] = useState<number | null>(null);
  const [savedOnly, setSavedOnly] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress>({ status: "idle" });
  // Company job boards card — the user's private job_sources rows.
  const [boards, setBoards] = useState<PublicJobBoardRecord[]>([]);
  const [boardUrlDraft, setBoardUrlDraft] = useState("");
  const [boardBusy, setBoardBusy] = useState(false);
  const [boardError, setBoardError] = useState<"unreadable" | { message: string } | null>(null);

  async function loadJobs(accessToken: string, message?: string) {
    setJobsState((state) => state.status === "ready" ? { ...state, message } : { status: "loading" });
    const response = await requestPublicProfileApi<PublicJobsResponse>("/api/jobs", {
      method: "GET",
      accessToken,
    });
    setJobsState({ status: "ready", response, message });
  }

  useEffect(() => {
    void (async () => {
    const accessToken = (await syncPublicProfileSession()) || readPublicProfileAccessToken();
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
        // Boards load independently — a failure never blocks the dashboard.
        requestPublicProfileApi<PublicJobBoardsResponse>("/api/jobs/boards", { method: "GET", accessToken })
          .then((boardsResponse) => setBoards(boardsResponse.boards))
          .catch(() => {});
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
    })();
  }, [router]);

  async function runScan() {
    const accessToken = readPublicProfileAccessToken();
    if (!accessToken) {
      router.replace("/onboarding");
      return;
    }

    setJobsBusy(true);
    setScanProgress({ status: "running", phase: 0 });
    // Estimated progress — the per-user scan is a single match pass, so the phases animate on a
    // timer rather than reporting live per-source fetches.
    const advance1 = setTimeout(() => setScanProgress((state) => state.status === "running" ? { status: "running", phase: 1 } : state), 700);
    const advance2 = setTimeout(() => setScanProgress((state) => state.status === "running" ? { status: "running", phase: 2 } : state), 1600);
    try {
      const response = await requestPublicProfileApi<PublicJobsScanResponse>("/api/jobs/scan", {
        method: "POST",
        accessToken,
      });
      setJobsState({ status: "ready", response });
      const fits = response.jobs.filter((job) => starsFromScore(job.match?.score ?? 0) >= 4).length;
      setScanProgress({ status: "complete", roles: response.summary.totalJobs, fits });
    } catch (error) {
      setScanProgress({ status: "error", message: error instanceof Error ? error.message : "Scan failed." });
    } finally {
      clearTimeout(advance1);
      clearTimeout(advance2);
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

  // Skip = "not interested" — dismisses the posting from this user's results for good.
  async function skipJob(job: PublicJobRecord) {
    const accessToken = readPublicProfileAccessToken();
    if (!accessToken) {
      router.replace("/onboarding");
      return;
    }

    setJobsBusy(true);
    try {
      const response = await requestPublicProfileApi<PublicJobsResponse>("/api/jobs/skip", {
        method: "POST",
        accessToken,
        body: { jobId: job.id },
      });
      setJobsState({
        status: "ready",
        response,
        message: `Removed ${job.title} from results.`,
      });
    } catch (error) {
      setJobsState({
        status: "error",
        message: error instanceof Error ? error.message : "Skip failed.",
      });
    } finally {
      setJobsBusy(false);
    }
  }

  async function addBoard() {
    const accessToken = readPublicProfileAccessToken();
    if (!accessToken) {
      router.replace("/onboarding");
      return;
    }
    const url = boardUrlDraft.trim();
    if (!url) return;

    setBoardBusy(true);
    setBoardError(null);
    try {
      const response = await requestPublicProfileApi<PublicJobBoardsResponse>("/api/jobs/boards", {
        method: "POST",
        accessToken,
        body: { url },
      });
      setBoards(response.boards);
      setBoardUrlDraft("");
    } catch (error) {
      const body = error instanceof PublicProfileApiError ? error.body as { error?: string; code?: string } | null : null;
      if (body?.code === "unrecognized_board" || body?.code === "board_fetch_failed") {
        setBoardError("unreadable");
      } else {
        setBoardError({ message: body?.error ?? (error instanceof Error ? error.message : "Board could not be added.") });
      }
    } finally {
      setBoardBusy(false);
    }
  }

  async function removeBoard(board: PublicJobBoardRecord) {
    const accessToken = readPublicProfileAccessToken();
    if (!accessToken) {
      router.replace("/onboarding");
      return;
    }

    setBoardBusy(true);
    try {
      const response = await requestPublicProfileApi<PublicJobBoardsResponse>(`/api/jobs/boards?id=${encodeURIComponent(board.id)}`, {
        method: "DELETE",
        accessToken,
      });
      setBoards(response.boards);
    } catch (error) {
      setBoardError({ message: error instanceof Error ? error.message : "Board could not be removed." });
    } finally {
      setBoardBusy(false);
    }
  }

  // Pursue opens the Human Path apply wizard (Review → Contacts → Outreach → Track). The wizard
  // itself creates/ensures the pursuit and drives every step; here we only gate on auth and hand
  // it the access token.
  function startPursuit(job: PublicJobRecord) {
    const accessToken = readPublicProfileAccessToken();
    if (!accessToken) {
      router.replace("/onboarding");
      return;
    }
    setPursuitContext({ job, accessToken });
  }

  const jobsResponse = jobsState.status === "ready" ? jobsState.response : undefined;
  const jobs = jobsResponse?.jobs ?? [];
  const savedJobs = jobs.filter((job) => job.saved);
  const searchSettings = jobsResponse?.searchSettings;
  const tierCounts = [5, 4, 3, 2, 1].map((tier) => ({
    tier,
    count: jobs.filter((job) => starsFromScore(job.match?.score ?? 0) === tier).length,
  }));
  const visibleJobs = savedOnly
    ? savedJobs
    : (fitFilter ? jobs.filter((job) => starsFromScore(job.match?.score ?? 0) === fitFilter) : jobs);
  const scanFillWidth = scanProgress.status === "running"
    ? (scanProgress.phase === 0 ? "30%" : scanProgress.phase === 1 ? "62%" : "88%")
    : "100%";

  return (
    <main className={styles.page}>
      <header className={jobsStyles.topBar}>
        <h1 className={jobsStyles.topTitle} id="dashboard-title">Your career dashboard</h1>
        <div className={jobsStyles.topActions}>
          {guardState.status === "complete" ? (
            <button className={jobsStyles.topEdit} onClick={() => router.push("/onboarding")} type="button">
              Edit Career Profile
            </button>
          ) : null}
          <Link className={jobsStyles.topLink} href="/">Home</Link>
        </div>
      </header>

      {guardState.status === "checking" ? (
        <p className={jobsStyles.stateNote}>Checking profile readiness before opening the dashboard.</p>
      ) : null}
      {guardState.status === "error" ? (
        <p className={jobsStyles.stateNote}>{guardState.message} <Link className={jobsStyles.topLink} href="/onboarding">Return to onboarding</Link></p>
      ) : null}

      {guardState.status === "complete" ? (
        <section className={jobsStyles.pageWrap} aria-labelledby="jobs-title">
          <div className={jobsStyles.sectionHead}>
            <h2 id="jobs-title">{savedOnly ? "Saved jobs" : "Your best matches"}</h2>
            {jobsResponse?.summary.lastScanAt ? (
              <p className={jobsStyles.lastScan}>Last scan {formatJobDate(jobsResponse.summary.lastScanAt)}</p>
            ) : null}
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

          <div className={jobsStyles.dashboardGrid}>
            <div className={jobsStyles.dashboardMain}>
              {!savedOnly && jobs.length > 0 ? (
                <div className={jobsStyles.ratingFilterGrid} aria-label="Filter matches by fit">
                  {tierCounts.map(({ tier, count }) => (
                    <button
                      key={tier}
                      type="button"
                      aria-pressed={fitFilter === tier}
                      className={`${jobsStyles.ratingFilterBtn} ${fitFilter === tier ? jobsStyles.ratingFilterBtnActive : ""}`}
                      onClick={() => setFitFilter((current) => current === tier ? null : tier)}
                    >
                      <span className={jobsStyles.ratingStars}>
                        <span className={jobsStyles.on}>{"★".repeat(tier)}</span>
                        <span className={jobsStyles.off}>{"★".repeat(5 - tier)}</span>
                      </span>
                      <strong>{count}</strong>
                      <span className={jobsStyles.ratingCount}>roles</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {visibleJobs.length === 0 ? (
                <p className={jobsStyles.empty}>
                  {savedOnly
                    ? "No saved jobs yet. Save matches you want to revisit before deciding whether to pursue them."
                    : "No active jobs yet. Run a scan once your profile search settings are ready."}
                </p>
              ) : (
                <div className={jobsStyles.matchList}>
                  {visibleJobs.map((job) => {
                    const signals = job.match?.signals ?? [];
                    const isWildcard = job.match?.label === "Probably Not Worth Your Time";
                    return (
                      <article className={`${jobsStyles.card} ${jobsStyles.jobCard}`} key={job.id}>
                        {isWildcard ? (
                          <span className={jobsStyles.weirdMatchTag} aria-label="Wildcard match">
                            {"WEIRD".split("").map((letter, index) => <span key={`w${index}`}>{letter}</span>)}
                            <span className={jobsStyles.sp} />
                            {"MATCH".split("").map((letter, index) => <span key={`m${index}`}>{letter}</span>)}
                          </span>
                        ) : null}
                        <div className={jobsStyles.jobCardHeader}>
                          <div className={jobsStyles.jobNumberTitle}>
                            <span className={jobsStyles.jobNumber} aria-hidden="true">{jobs.indexOf(job) + 1}</span>
                            <h3 className={jobsStyles.jobTitle}>
                              {job.title}
                              <span className={jobsStyles.titleDivider} aria-hidden="true" />
                              <span className={jobsStyles.companyName}>{job.companyName}</span>
                            </h3>
                          </div>
                        </div>

                        {job.match ? (
                          <div className={jobsStyles.stars}>
                            <span className={jobsStyles.starLabel}>Fit</span>
                            <span className={jobsStyles.starScore}>{job.match.score}<small>/100</small></span>
                            <StarRow score={job.match.score} />
                          </div>
                        ) : null}

                        <JobMetaGrid job={job} />

                        {job.description ? (
                          <div className={jobsStyles.descriptionBox}>
                            <p className={jobsStyles.descriptionText}>{truncateText(job.description)}</p>
                            {signals.length > 0 ? (
                              <div className={jobsStyles.keywordPills}>
                                {signals.slice(0, 5).map((signal) => (
                                  <span className={jobsStyles.keywordPill} key={signal}>{signal}</span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {job.responsibilities.length > 0 || job.requiredExperience.length > 0 ? (
                          <div className={jobsStyles.matchSections}>
                            <MatchSection label="Responsibilities" items={job.responsibilities} signals={signals} />
                            <MatchSection label="Required experience" items={job.requiredExperience} signals={signals} />
                          </div>
                        ) : null}

                        <div className={jobsStyles.actionRail}>
                          <button className={jobsStyles.btnSave} disabled={jobsBusy} onClick={() => setJobSaved(job, !job.saved)} type="button">
                            {job.saved ? "Saved" : "Save"}
                          </button>
                          <button className={jobsStyles.btnSkip} disabled={jobsBusy} onClick={() => skipJob(job)} type="button" title="This job will be removed from results.">Skip</button>
                          <a className={jobsStyles.btnSource} href={job.sourceUrl} rel="noreferrer" target="_blank">Open posting ↗</a>
                          <button className={jobsStyles.btnApply} disabled={jobsBusy} onClick={() => startPursuit(job)} type="button">Pursue</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <aside className={jobsStyles.dashboardSidebar}>
              <div className={jobsStyles.card}>
                <div className={jobsStyles.panelHeaderRow}>
                  <h3 className={jobsStyles.sidebarHeading}>Overview</h3>
                </div>
                <div className={jobsStyles.ovScanRow}>
                  <span className={jobsStyles.dim}>Last scan</span>
                  <span className={jobsStyles.date}>{jobsResponse?.summary.lastScanAt ? formatJobDate(jobsResponse.summary.lastScanAt) : "Not scanned"}</span>
                </div>
                <div className={jobsStyles.ovSources}>
                  <span><strong>{jobsResponse?.summary.totalJobs ?? 0}</strong> active jobs</span>
                  <span><strong>{jobsResponse?.summary.savedJobs ?? 0}</strong> saved</span>
                </div>
                <button className={jobsStyles.scanNowBtn} disabled={jobsBusy} onClick={runScan} type="button">
                  {scanProgress.status === "running" ? "Scanning…" : "Run scan"}
                </button>
                <button className={jobsStyles.scanSecondaryBtn} onClick={() => setSavedOnly((current) => !current)} type="button">
                  {savedOnly ? "Show all jobs" : "View saved jobs"}
                </button>
              </div>

              {jobsResponse && jobsResponse.summary.titleParameters.length > 0 ? (
                <div className={jobsStyles.card}>
                  <div className={jobsStyles.panelHeaderRow}>
                    <h3 className={jobsStyles.sidebarHeading}>Job titles in this scan</h3>
                  </div>
                  <div className={jobsStyles.titleChips}>
                    {jobsResponse.summary.titleParameters.map((title) => (
                      <span key={title} className={jobsStyles.titleChip}>{title}</span>
                    ))}
                  </div>
                  <p className={jobsStyles.chipNote}>To edit job titles, change parameters in this role track in your profile.</p>
                </div>
              ) : null}

              {searchSettings ? (
                <div className={jobsStyles.card}>
                  <div className={jobsStyles.panelHeaderRow}>
                    <h3 className={jobsStyles.sidebarHeading}>Search settings</h3>
                    <button className={jobsStyles.editBtn} onClick={() => router.push("/onboarding")} type="button">Edit</button>
                  </div>
                  <div className={jobsStyles.configStats}>
                    <div className={jobsStyles.configStat}>
                      <span className={jobsStyles.metaLabel}>Remote</span>
                      <strong className={jobsStyles.metaValue}>{formatRemotePreference(searchSettings.remotePreference)}</strong>
                    </div>
                    <div className={jobsStyles.configStat}>
                      <span className={jobsStyles.metaLabel}>Salary floor</span>
                      <strong className={jobsStyles.metaValue}>{searchSettings.salaryFloor ? `$${Math.round(searchSettings.salaryFloor / 1000)}k` : "Any"}</strong>
                    </div>
                    <div className={jobsStyles.configStat}>
                      <span className={jobsStyles.metaLabel}>Target titles</span>
                      <strong className={jobsStyles.metaValue}>{searchSettings.targetTitleCount}</strong>
                    </div>
                    <div className={jobsStyles.configStat}>
                      <span className={jobsStyles.metaLabel}>Avoided cos.</span>
                      <strong className={jobsStyles.metaValue}>{searchSettings.avoidedCompanyCount}</strong>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className={jobsStyles.card}>
                <div className={jobsStyles.panelHeaderRow}>
                  <h3 className={jobsStyles.sidebarHeading}>Company job boards</h3>
                </div>
                <p className={jobsStyles.boardHint}>Watching a company? Paste their careers page and every scan checks their board directly.</p>
                <div className={jobsStyles.boardInputRow}>
                  <input
                    className={jobsStyles.boardInput}
                    placeholder="Paste a careers page URL"
                    value={boardUrlDraft}
                    disabled={boardBusy}
                    onChange={(event) => setBoardUrlDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void addBoard();
                      }
                    }}
                  />
                  <button className={jobsStyles.boardAddBtn} disabled={boardBusy} onClick={() => void addBoard()} type="button">
                    {boardBusy ? "Adding…" : "Add"}
                  </button>
                </div>
                {boards.length > 0 ? (
                  <div className={jobsStyles.boardList}>
                    {boards.map((board) => (
                      <div className={jobsStyles.boardRow} key={board.id}>
                        <div className={jobsStyles.boardMain}>
                          <span className={jobsStyles.boardName}>{board.companyName}</span>
                          <span className={jobsStyles.boardDomain}>{boardDomain(board.careersUrl)}</span>
                        </div>
                        <button
                          className={jobsStyles.boardRemove}
                          type="button"
                          aria-label={`Remove ${board.companyName}`}
                          disabled={boardBusy}
                          onClick={() => void removeBoard(board)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {boardError === "unreadable" ? (
                  <p className={jobsStyles.boardErr}>
                    <b>We couldn&apos;t read that page as a job board.</b> Try the company&apos;s careers page link — the page
                    that lists their open roles. Still stuck? Use the feedback chat bubble to request a job board that
                    didn&apos;t work.
                  </p>
                ) : boardError ? (
                  <p className={jobsStyles.boardErr}>{boardError.message}</p>
                ) : null}
              </div>
            </aside>
          </div>
        </section>
      ) : null}
      {scanProgress.status !== "idle" ? (
        <div className={jobsStyles.scanOverlay} role="dialog" aria-modal="true" aria-label="Scan progress">
          <div className={jobsStyles.scanBox}>
            {scanProgress.status === "running" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={jobsStyles.scanLoadingGif} src="/DF-small.gif" alt="" aria-hidden="true" />
            ) : null}
            <div className={jobsStyles.scanModalHead}>
              <h3 className={jobsStyles.scanModalTitle}>
                {scanProgress.status === "running" ? "Scanning" : scanProgress.status === "complete" ? "Scan complete" : "Scan stopped"}
              </h3>
              {scanProgress.status !== "running" ? (
                <button className={jobsStyles.scanClose} onClick={() => setScanProgress({ status: "idle" })} type="button" aria-label="Close">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              ) : null}
            </div>
            <div className={jobsStyles.scanProgressTrack} aria-hidden="true">
              <div
                className={`${jobsStyles.scanProgressFill} ${scanProgress.status === "error" ? jobsStyles.scanProgressFillError : ""}`}
                style={{ width: scanFillWidth }}
              />
            </div>
            {scanProgress.status === "complete" ? (
              <div className={jobsStyles.scanCounts}>
                <span><strong>{scanProgress.roles}</strong> role{scanProgress.roles === 1 ? "" : "s"}</span>
                <span><strong>{scanProgress.fits}</strong> a fit</span>
              </div>
            ) : null}
            <div className={jobsStyles.scanPhases} aria-hidden="true">
              {SCAN_PHASES.map((label, index) => {
                const phaseClass = scanProgress.status === "complete"
                  ? jobsStyles.scanPhaseDone
                  : scanProgress.status === "running"
                    ? (index < scanProgress.phase ? jobsStyles.scanPhaseDone : index === scanProgress.phase ? jobsStyles.scanPhaseActive : "")
                    : "";
                return <span key={label} className={`${jobsStyles.scanPhase} ${phaseClass}`}>{label}</span>;
              })}
            </div>
            {scanProgress.status === "error" ? <p className={jobsStyles.scanError}>{scanProgress.message}</p> : null}
            {scanProgress.status !== "running" ? (
              <div className={jobsStyles.scanModalFoot}>
                <button className={jobsStyles.scanDoneBtn} onClick={() => setScanProgress({ status: "idle" })} type="button">
                  {scanProgress.status === "complete" ? "View matches" : "Close"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {pursuitContext ? (
        <ApplyWizardModal
          job={pursuitContext.job}
          accessToken={pursuitContext.accessToken}
          onClose={() => setPursuitContext(null)}
          onPursuitChanged={(message) => { void loadJobs(pursuitContext.accessToken, message); }}
        />
      ) : null}
    </main>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { clearPublicProfileAccessToken, readPublicProfileAccessToken } from "@/lib/public-profile/browser-session";
import { syncPublicProfileSession } from "@/lib/public-auth/supabase-browser";
import { PublicProfileApiError, requestPublicProfileApi } from "@/lib/public-profile/client";
import ApplyWizardModal from "./ApplyWizardModal";
import SiteHeader from "../components/SiteHeader";
import styles from "../site.module.css";
import jobsStyles from "./dashboard.module.css";
import type { PublicJobBoardRecord, PublicJobBoardsResponse, PublicJobFeedbackReasonCode, PublicJobRecord, PublicJobsResponse, PublicJobsScanResponse } from "@/lib/public-jobs/types";

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

// Optimistic list edits: Save/Skip update the displayed list immediately, then reconcile with
// the authoritative server response (or revert on failure), so there is no dead round-trip on
// screen. The saved count is kept in step so the Overview total does not lag.
function withJobSaved(response: PublicJobsResponse, jobId: string, saved: boolean): PublicJobsResponse {
  let delta = 0;
  const jobs = response.jobs.map((job) => {
    if (job.id !== jobId || job.saved === saved) return job;
    delta = saved ? 1 : -1;
    return { ...job, saved };
  });
  return { ...response, summary: { ...response.summary, savedJobs: Math.max(0, response.summary.savedJobs + delta) }, jobs };
}

function withJobRemoved(response: PublicJobsResponse, jobId: string): PublicJobsResponse {
  const removed = response.jobs.find((job) => job.id === jobId);
  const jobs = response.jobs.filter((job) => job.id !== jobId);
  const savedDelta = removed?.saved ? -1 : 0;
  return { ...response, summary: { ...response.summary, savedJobs: Math.max(0, response.summary.savedJobs + savedDelta) }, jobs };
}

const JOB_FEEDBACK_REASONS: { code: PublicJobFeedbackReasonCode; label: string }[] = [
  { code: "wrong_role_title", label: "Wrong role/title" },
  { code: "wrong_location_preference", label: "Wrong location preference" },
  { code: "wrong_comp", label: "Wrong Comp" },
  { code: "wrong_industry", label: "Wrong Industry" },
];

const OPEN_LINK_ICON = (
  <svg className={jobsStyles.extIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

// The job card flips as one complete card to a feedback face. Saving records evidence only
// (POST /api/jobs/feedback) — it does not skip, save, pursue, or change the job. The free text
// lives in the "Something Else" row (checkbox + inline input), which maps to the `other` code.
function JobCard({
  job, number, leaving, jobsBusy, pending, onToggleSave, onSkip, onPursue,
}: {
  job: PublicJobRecord;
  number: number;
  leaving: boolean;
  jobsBusy: boolean;
  pending: boolean;
  onToggleSave: () => void;
  onSkip: () => void;
  onPursue: () => void;
}) {
  const signals = job.match?.signals ?? [];
  const isWildcard = job.match?.label === "Probably Not Worth Your Time";

  const [flipped, setFlipped] = useState(false);
  const [codes, setCodes] = useState<Set<PublicJobFeedbackReasonCode>>(new Set());
  const [seChecked, setSeChecked] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [errored, setErrored] = useState(false);
  const [acked, setAcked] = useState(false);
  const frontRef = useRef<HTMLElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const seInputRef = useRef<HTMLInputElement>(null);
  const feedbackSessionRef = useRef(0);
  const focusTimerRef = useRef<number | null>(null);
  const ackTimerRef = useRef<number | null>(null);

  const backId = `job-feedback-${job.id}`;
  const titleId = `job-feedback-title-${job.id}`;
  const seId = `job-feedback-se-${job.id}`;
  const hasSelection = codes.size > 0 || seChecked;

  // Only the visible face stays focusable / in the a11y tree.
  useEffect(() => {
    if (frontRef.current) frontRef.current.inert = flipped;
    if (backRef.current) backRef.current.inert = !flipped;
  }, [flipped]);

  useEffect(() => () => {
    feedbackSessionRef.current += 1;
    if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
    if (ackTimerRef.current !== null) window.clearTimeout(ackTimerRef.current);
  }, []);

  function openFeedback() {
    const session = feedbackSessionRef.current + 1;
    feedbackSessionRef.current = session;
    if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
    setErrored(false);
    setFlipped(true);
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    focusTimerRef.current = window.setTimeout(() => {
      if (feedbackSessionRef.current === session) headingRef.current?.focus();
    }, reduce ? 0 : 200);
  }

  function closeFeedback() {
    feedbackSessionRef.current += 1;
    if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
    setFlipped(false);
    setSaving(false);
    setErrored(false);
    setCodes(new Set());
    setSeChecked(false);
    setNote("");
    focusTimerRef.current = window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function toggleCode(code: PublicJobFeedbackReasonCode) {
    setCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  async function saveFeedback() {
    if (!hasSelection || saving) return;
    const accessToken = readPublicProfileAccessToken();
    if (!accessToken) {
      setErrored(true);
      return;
    }
    const session = feedbackSessionRef.current;
    const reasonCodes = [...codes];
    if (seChecked) reasonCodes.push("other");
    const trimmed = note.trim();
    setSaving(true);
    setErrored(false);
    try {
      await requestPublicProfileApi<unknown>("/api/jobs/feedback", {
        method: "POST",
        accessToken,
        body: { jobId: job.id, reasonCodes, ...(seChecked && trimmed ? { note: trimmed } : {}) },
      });
      if (feedbackSessionRef.current !== session) return;
      closeFeedback();
      setAcked(true);
      if (ackTimerRef.current !== null) window.clearTimeout(ackTimerRef.current);
      ackTimerRef.current = window.setTimeout(() => setAcked(false), 2600);
    } catch {
      if (feedbackSessionRef.current !== session) return;
      setErrored(true);
      setSaving(false);
    }
  }

  return (
    <div className={`${jobsStyles.flipScene} ${leaving ? jobsStyles.cardLeaving : ""}`}>
      <div className={`${jobsStyles.flipCard} ${flipped ? jobsStyles.flipCardFlipped : ""}`}>
        <article ref={frontRef} aria-hidden={flipped} className={`${jobsStyles.card} ${jobsStyles.jobCard} ${jobsStyles.flipFace} ${jobsStyles.flipFront}`}>
          {isWildcard ? (
            <span className={jobsStyles.weirdMatchTag} aria-label="Wildcard match">
              {"WEIRD".split("").map((letter, index) => <span key={`w${index}`}>{letter}</span>)}
              <span className={jobsStyles.sp} />
              {"MATCH".split("").map((letter, index) => <span key={`m${index}`}>{letter}</span>)}
            </span>
          ) : null}
          {acked ? (
            <span className={jobsStyles.notedTag} role="status" aria-live="polite" aria-label="Noted">
              {"NOTED".split("").map((letter, index) => <span key={`n${index}`}>{letter}</span>)}
            </span>
          ) : null}
          <div className={jobsStyles.jobCardHeader}>
            <div className={jobsStyles.jobNumberTitle}>
              <span className={jobsStyles.jobNumber} aria-hidden="true">{number}</span>
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

          <div className={jobsStyles.actionRow}>
            <div className={jobsStyles.actionLeft}>
              <button className={`${jobsStyles.btnAct} ${jobsStyles.btnSave} ${job.saved ? jobsStyles.btnSaveOn : ""}`} disabled={jobsBusy || pending} onClick={onToggleSave} type="button">
                {job.saved ? (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                    Saved
                  </>
                ) : "Save"}
              </button>
              <button className={`${jobsStyles.btnAct} ${jobsStyles.btnSkip}`} disabled={jobsBusy} onClick={onSkip} type="button" title="This job will be removed from results.">Skip</button>
            </div>
            <span className={jobsStyles.linkStack}>
              <a className={`${jobsStyles.linkAct} ${jobsStyles.linkOpen}`} href={job.sourceUrl} rel="noreferrer" target="_blank">Open posting {OPEN_LINK_ICON}</a>
              <button ref={triggerRef} className={`${jobsStyles.linkAct} ${jobsStyles.linkNotMatch}`} type="button" onClick={openFeedback} aria-expanded={flipped} aria-controls={backId}>Not a match</button>
            </span>
            <button className={`${jobsStyles.btnAct} ${jobsStyles.btnPursue}`} disabled={jobsBusy} onClick={onPursue} type="button">Pursue</button>
          </div>
        </article>

        <div
          ref={backRef}
          id={backId}
          className={`${jobsStyles.card} ${jobsStyles.jobCard} ${jobsStyles.flipFace} ${jobsStyles.flipBack}`}
          role="group"
          aria-labelledby={titleId}
          aria-hidden={!flipped}
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closeFeedback(); } }}
        >
          <div className={jobsStyles.feedbackFace}>
            <div className={jobsStyles.feedbackHead}>
              <h3 ref={headingRef} tabIndex={-1} id={titleId} className={jobsStyles.feedbackTitle}>
                What&apos;s off about this match? <small>Pick all that apply.</small>
              </h3>
              <button className={jobsStyles.feedbackClose} onClick={closeFeedback} type="button" aria-label="Back to job">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className={jobsStyles.chipSet} role="group" aria-label="What's off about this match">
              {JOB_FEEDBACK_REASONS.map((reason) => {
                const on = codes.has(reason.code);
                return (
                  <button key={reason.code} type="button" disabled={saving} className={`${jobsStyles.chip} ${on ? jobsStyles.chipOn : ""}`} aria-pressed={on} onClick={() => toggleCode(reason.code)}>
                    {on ? (
                      <span className={jobsStyles.chipCheck}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg></span>
                    ) : null}
                    {reason.label}
                  </button>
                );
              })}
            </div>
            <div className={jobsStyles.seRow}>
              <input
                type="checkbox"
                id={seId}
                checked={seChecked}
                disabled={saving}
                onChange={(event) => {
                  setSeChecked(event.target.checked);
                  if (event.target.checked) {
                    const session = feedbackSessionRef.current;
                    if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
                    focusTimerRef.current = window.setTimeout(() => {
                      if (feedbackSessionRef.current === session) seInputRef.current?.focus();
                    }, 0);
                  }
                }}
              />
              <label htmlFor={seId}>Something Else</label>
              <input ref={seInputRef} type="text" className={jobsStyles.seInput} maxLength={500} placeholder="Tell us what missed" value={note} disabled={!seChecked || saving} onChange={(event) => setNote(event.target.value)} />
              <span className={jobsStyles.seCount}>{note.length}/500</span>
            </div>
            {errored ? (
              <div className={jobsStyles.feedbackAlert} role="alert">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                <p>That didn&apos;t save. Your selections are still here, give it another go.</p>
              </div>
            ) : null}
            <div className={jobsStyles.feedbackFooter}>
              <button className={jobsStyles.btnGhost} type="button" onClick={closeFeedback}>Close</button>
              <button className={jobsStyles.btnPrimary} type="button" disabled={!hasSelection || saving} onClick={saveFeedback}>{saving ? "Saving…" : "Save feedback"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Case-insensitive append for the token editors (job titles, avoided companies): a typed or
// pasted comma splits into one chip per segment; dedupe ignores casing.
function addTokens(current: string[], raw: string): string[] {
  const next = [...current];
  for (const part of raw.split(",").map((segment) => segment.trim()).filter(Boolean)) {
    if (!next.some((value) => value.toLowerCase() === part.toLowerCase())) next.push(part);
  }
  return next;
}

// The shared token-input primitive (onboarding-pickers): removable chips above, an add field
// below where Enter / comma / the Add button all commit.
function TokenInput({ values, onChange, placeholder, disabled }: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    if (!draft.trim()) return;
    onChange(addTokens(values, draft));
    setDraft("");
  }
  return (
    <>
      {values.length > 0 ? (
        <div className={jobsStyles.tokens}>
          {values.map((value) => (
            <span key={value} className={jobsStyles.token}>
              {value}
              <button type="button" className={jobsStyles.tokenX} aria-label={`Remove ${value}`} disabled={disabled} onClick={() => onChange(values.filter((entry) => entry !== value))}>×</button>
            </span>
          ))}
        </div>
      ) : null}
      <div className={jobsStyles.boardInputRow}>
        <input
          className={jobsStyles.boardInput}
          placeholder={placeholder}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); commit(); } }}
        />
        <button type="button" className={jobsStyles.boardAddBtn} disabled={disabled} onClick={commit}>Add</button>
      </div>
    </>
  );
}

// A sidebar card that flips in 3D to its edit face (approved dashboard-jobs DS card). The card
// height is driven explicitly so it grows from the compact view up to the taller form in step
// with the rotation; the CSS handles the 680ms flip + reduced-motion cross-fade.
function FlipEditCard({ heading, editHeading, view, form, onOpen, onSave, saveDisabled, footerHint }: {
  heading: string;
  editHeading: string;
  view: ReactNode;
  form: ReactNode;
  onOpen: () => void;
  onSave: () => Promise<void>;
  saveDisabled?: boolean;
  footerHint?: string;
}) {
  const [flipped, setFlipped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sflipRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  // Runs every render so the height tracks the visible face — this drives the grow-as-it-turns
  // animation on flip and keeps the height correct as tokens are added/removed in the form.
  useLayoutEffect(() => {
    const face = flipped ? backRef.current : frontRef.current;
    if (sflipRef.current && face) sflipRef.current.style.height = `${face.offsetHeight}px`;
  });

  function open() {
    setError(null);
    onOpen();
    setFlipped(true);
  }
  function cancel() {
    setFlipped(false);
    setSaving(false);
    setError(null);
  }
  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave();
      setFlipped(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That didn't save. Give it another go.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={jobsStyles.sflipScene}>
      <div ref={sflipRef} className={`${jobsStyles.sflip} ${flipped ? jobsStyles.sflipFlipped : ""}`}>
        <div ref={frontRef} className={`${jobsStyles.card} ${jobsStyles.sflipFace} ${jobsStyles.sfront}`} aria-hidden={flipped}>
          <div className={jobsStyles.panelHeaderRow}>
            <h3 className={jobsStyles.sidebarHeading}>{heading}</h3>
            <button type="button" className={jobsStyles.editBtn} onClick={open} aria-expanded={flipped}>Edit</button>
          </div>
          {view}
        </div>
        <div ref={backRef} className={`${jobsStyles.card} ${jobsStyles.sflipFace} ${jobsStyles.sback}`} aria-hidden={!flipped}>
          <form className={jobsStyles.editForm} onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <div className={jobsStyles.sflipEditHead}>
              <h3 className={jobsStyles.sidebarHeading}>{editHeading}</h3>
              <button type="button" className={jobsStyles.editBtn} onClick={cancel} disabled={saving}>Cancel</button>
            </div>
            {form}
            {footerHint ? <p className={jobsStyles.editHint}>{footerHint}</p> : null}
            {error ? <p className={jobsStyles.boardErr}>{error}</p> : null}
            <div className={jobsStyles.editFooter}>
              <button type="submit" className={jobsStyles.btnPrimary} disabled={saving || saveDisabled}>{saving ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Role-track objects are rich; the dashboard only touches targetTitles, so keep the rest opaque
// and pass it back through on save.
type RoleTrackForSave = { targetTitles: string[] } & Record<string, unknown>;

type SearchDraft = { remotePreference: string; salaryFloor: string; avoidCompanies: string[] };

export default function DashboardClient() {
  const router = useRouter();
  const [guardState, setGuardState] = useState<GuardState>({ status: "checking" });
  const [jobsState, setJobsState] = useState<JobsState>({ status: "idle" });
  // jobsBusy is now scoped to the global scan only; per-job Save requests track their own id so
  // one action never freezes the whole list.
  const [jobsBusy, setJobsBusy] = useState(false);
  const [pendingJobIds, setPendingJobIds] = useState<Set<string>>(() => new Set());
  // Cards mid-skip carry a leave animation before they are removed from the list.
  const [leavingJobIds, setLeavingJobIds] = useState<Set<string>>(() => new Set());
  const [pursuitContext, setPursuitContext] = useState<{ job: PublicJobRecord; accessToken: string } | null>(null);
  // Each star tier toggles on/off independently. Every tier starts ON (teal); toggling a
  // tier off (cream) hides that bucket. Matches the legacy /scans default.
  const [fitFilters, setFitFilters] = useState<Set<number>>(() => new Set([5, 4, 3, 2, 1]));
  const [scanProgress, setScanProgress] = useState<ScanProgress>({ status: "idle" });
  // Company job boards card — the user's private job_sources rows.
  const [boards, setBoards] = useState<PublicJobBoardRecord[]>([]);
  const [boardUrlDraft, setBoardUrlDraft] = useState("");
  const [boardBusy, setBoardBusy] = useState(false);
  const [boardError, setBoardError] = useState<"unreadable" | { message: string } | null>(null);
  // Pursue-a-link card — single URL in, then the normal Pursue flow (approved DS card 2026-07-15).
  const [pursueLinkDraft, setPursueLinkDraft] = useState("");
  const [pursueLinkBusy, setPursueLinkBusy] = useState(false);
  const [pursueLinkError, setPursueLinkError] = useState<string | null>(null);
  // Company-boards edit mode gates the × removers (Randall 2026-07-21).
  const [boardsEditing, setBoardsEditing] = useState(false);
  // Inline-edit drafts for the flip cards, seeded when a card flips to its edit face.
  const [titleDraft, setTitleDraft] = useState<string[]>([]);
  const [searchDraft, setSearchDraft] = useState<SearchDraft>({ remotePreference: "remote_preferred", salaryFloor: "", avoidCompanies: [] });

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
        // Surface a load failure in the boards card (still never blocks the dashboard) so a
        // backend error is visible instead of looking like an empty boards list.
        requestPublicProfileApi<PublicJobBoardsResponse>("/api/jobs/boards", { method: "GET", accessToken })
          .then((boardsResponse) => setBoards(boardsResponse.boards))
          .catch((error) => setBoardError({ message: error instanceof Error ? error.message : "Your saved company boards couldn't be loaded. Give it a refresh." }));
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

    // Flip the flag immediately so the button confirms on click; reconcile with the server after.
    const snapshot = jobsState.status === "ready" ? jobsState.response : null;
    const confirmation = saved ? "Saved for later." : "Removed from Saved Pursuits.";
    if (snapshot) {
      setJobsState({ status: "ready", response: withJobSaved(snapshot, job.id, saved), message: confirmation });
    }
    setPendingJobIds((prev) => new Set(prev).add(job.id));
    try {
      const response = await requestPublicProfileApi<PublicJobsResponse>("/api/jobs/save", {
        method: "POST",
        accessToken,
        body: { jobId: job.id, saved },
      });
      setJobsState({ status: "ready", response, message: confirmation });
    } catch (error) {
      // Revert the optimistic flag but keep the list on screen.
      const message = error instanceof Error ? error.message : "Saved Pursuits update failed.";
      setJobsState(snapshot
        ? { status: "ready", response: snapshot, message }
        : { status: "error", message });
    } finally {
      setPendingJobIds((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  }

  // Skip = "not interested" — dismisses the posting from this user's results for good.
  async function skipJob(job: PublicJobRecord) {
    const accessToken = readPublicProfileAccessToken();
    if (!accessToken) {
      router.replace("/onboarding");
      return;
    }

    const snapshot = jobsState.status === "ready" ? jobsState.response : null;
    const confirmation = `Removed ${job.title} from results.`;

    // Fire the request now, but play the leave animation before pulling the card so the
    // dismissal is visible rather than an instant vanish or a frozen round-trip.
    setLeavingJobIds((prev) => new Set(prev).add(job.id));
    const request = requestPublicProfileApi<PublicJobsResponse>("/api/jobs/skip", {
      method: "POST",
      accessToken,
      body: { jobId: job.id },
    });
    // Match the .cardLeaving animation duration (680ms, same as the card flip) so the card is
    // pulled from the list exactly as the leave animation finishes.
    await new Promise((resolve) => setTimeout(resolve, 680));
    if (snapshot) {
      setJobsState({ status: "ready", response: withJobRemoved(snapshot, job.id), message: confirmation });
    }
    setLeavingJobIds((prev) => {
      const next = new Set(prev);
      next.delete(job.id);
      return next;
    });
    try {
      const response = await request;
      setJobsState({ status: "ready", response, message: confirmation });
    } catch (error) {
      // Put the card back and surface the failure without wiping the list.
      const message = error instanceof Error ? error.message : "Skip failed.";
      setJobsState(snapshot
        ? { status: "ready", response: snapshot, message }
        : { status: "error", message });
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

  // Search settings save → identity-search PATCH (remote pref + salary floor on the profile,
  // avoided companies on preferences). Reload jobs so the card and matches reflect the change.
  async function saveSearchSettings(draft: SearchDraft) {
    const accessToken = readPublicProfileAccessToken();
    if (!accessToken) {
      router.replace("/onboarding");
      return;
    }
    await requestPublicProfileApi("/api/public-profile/identity-search", {
      method: "PATCH",
      accessToken,
      body: {
        remotePreference: draft.remotePreference,
        targetCompensationMin: draft.salaryFloor ? Number(draft.salaryFloor) : null,
        avoidCompanies: draft.avoidCompanies,
      },
    });
    await loadJobs(accessToken, "Search settings updated.");
  }

  // Job titles save → the flat scan-title pool maps back to role tracks: removed titles are
  // stripped from every track; added titles land on the first (primary) track (Randall
  // 2026-07-21). Role-track positioning is otherwise untouched, so the apply wizard is unchanged.
  async function saveTitles(nextTitles: string[]) {
    const accessToken = readPublicProfileAccessToken();
    if (!accessToken) {
      router.replace("/onboarding");
      return;
    }
    const current = await requestPublicProfileApi<{ section: { roleTracks: RoleTrackForSave[] } }>(
      "/api/public-profile/role-tracks",
      { method: "GET", accessToken },
    );
    const lower = (value: string) => value.trim().toLowerCase();
    const keep = new Set(nextTitles.map(lower));
    const existing = new Set(current.section.roleTracks.flatMap((track) => track.targetTitles.map(lower)));
    const added = nextTitles.filter((title) => !existing.has(lower(title)));
    const roleTracks = current.section.roleTracks.map((track, index) => {
      const retained = track.targetTitles.filter((title) => keep.has(lower(title)));
      return { ...track, targetTitles: index === 0 ? [...retained, ...added] : retained };
    });
    await requestPublicProfileApi("/api/public-profile/role-tracks", {
      method: "PATCH",
      accessToken,
      body: { roleTracks },
    });
    await loadJobs(accessToken, "Job titles updated.");
  }

  // Pursue-a-link: ingest the pasted posting via /api/jobs/from-link, then hand the job
  // straight to the wizard. The stub record only needs the id up front; the wizard replaces
  // it with the full record from the pursuit create/read response.
  async function pursueLink() {
    const accessToken = readPublicProfileAccessToken();
    if (!accessToken) {
      router.replace("/onboarding");
      return;
    }
    const url = pursueLinkDraft.trim();
    if (!url) return;

    setPursueLinkBusy(true);
    setPursueLinkError(null);
    try {
      const response = await requestPublicProfileApi<{ status: string; jobId: string; title: string; company: string }>("/api/jobs/from-link", {
        method: "POST",
        accessToken,
        body: { url },
      });
      setPursueLinkDraft("");
      setPursuitContext({
        job: {
          id: response.jobId,
          source: "user_link",
          sourceUrl: url,
          companyName: response.company,
          title: response.title,
          description: "",
          scrapedAt: "",
          firstSeenAt: "",
          lastSeenAt: "",
          saved: false,
          responsibilities: [],
          requiredExperience: [],
        },
        accessToken,
      });
    } catch (error) {
      const body = error instanceof PublicProfileApiError ? error.body as { error?: string } | null : null;
      setPursueLinkError(body?.error ?? (error instanceof Error ? error.message : "That link could not be read."));
    } finally {
      setPursueLinkBusy(false);
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
  const searchSettings = jobsResponse?.searchSettings;
  const tierCounts = [5, 4, 3, 2, 1].map((tier) => ({
    tier,
    count: jobs.filter((job) => starsFromScore(job.match?.score ?? 0) === tier).length,
  }));
  const visibleJobs = jobs.filter((job) => fitFilters.has(starsFromScore(job.match?.score ?? 0)));
  const scanFillWidth = scanProgress.status === "running"
    ? (scanProgress.phase === 0 ? "30%" : scanProgress.phase === 1 ? "62%" : "88%")
    : "100%";

  return (
    <main className={styles.page}>
      <SiteHeader profileHref="/onboarding" />
      <header className={jobsStyles.topBar}>
        <h1 className={jobsStyles.topTitle} id="dashboard-title">Your career dashboard</h1>
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
            <h2 id="jobs-title">Your best matches</h2>
            {jobsResponse?.summary.lastScanAt ? (
              <p className={jobsStyles.lastScan}>Last scan {formatJobDate(jobsResponse.summary.lastScanAt)}</p>
            ) : null}
          </div>

          {jobsState.status === "loading" ? (
            <div className={jobsStyles.pageLoad}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={jobsStyles.pageLoadGif} src="/DF-small.gif" alt="" aria-hidden="true" />
              <p className={jobsStyles.pageLoadLabel}>Loading your matches…</p>
            </div>
          ) : null}
          {jobsState.status === "error" ? (
            <p className={jobsStyles.error}>{jobsState.message}</p>
          ) : null}
          {jobsState.status === "ready" && jobsState.message ? (
            <p className={jobsStyles.message}>{jobsState.message}</p>
          ) : null}

          <div className={jobsStyles.dashboardGrid}>
            <div className={jobsStyles.dashboardMain}>
              {/* Pursue a job link — 1:1 from the approved DS card (dashboard-jobs.html, 2026-07-15). */}
              <div className={`${jobsStyles.card} ${jobsStyles.pursueLinkCard}`}>
                <div className={jobsStyles.panelHeaderRow}>
                  <h3 className={jobsStyles.sidebarHeading}>Found a job somewhere else?</h3>
                </div>
                <p className={jobsStyles.boardHint}>Paste the posting link and pursue it like any match. We pull the details, find the right person, and draft outreach that sounds like&nbsp;you.</p>
                <div className={jobsStyles.boardInputRow}>
                  <input
                    className={jobsStyles.boardInput}
                    placeholder="Paste a job posting link"
                    value={pursueLinkDraft}
                    disabled={pursueLinkBusy}
                    onChange={(event) => setPursueLinkDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void pursueLink();
                      }
                    }}
                  />
                  <button className={jobsStyles.boardAddBtn} disabled={pursueLinkBusy} onClick={() => void pursueLink()} type="button">
                    {pursueLinkBusy ? "Reading…" : "Pursue"}
                  </button>
                </div>
                {pursueLinkError ? <p className={jobsStyles.boardErr}>{pursueLinkError}</p> : null}
              </div>

              {jobs.length > 0 ? (
                <div className={jobsStyles.ratingFilterGrid} aria-label="Filter matches by fit">
                  {tierCounts.map(({ tier, count }) => (
                    <button
                      key={tier}
                      type="button"
                      aria-pressed={fitFilters.has(tier)}
                      className={`${jobsStyles.ratingFilterBtn} ${fitFilters.has(tier) ? jobsStyles.ratingFilterBtnActive : ""}`}
                      onClick={() => setFitFilters((current) => {
                        const next = new Set(current);
                        if (next.has(tier)) next.delete(tier); else next.add(tier);
                        return next;
                      })}
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
                  {jobs.length > 0
                    ? "Every fit tier is turned off. Turn a star tier back on to see your matches."
                    : "No active jobs yet. Run a scan once your profile search settings are ready."}
                </p>
              ) : (
                <div className={jobsStyles.matchList}>
                  {visibleJobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      number={jobs.indexOf(job) + 1}
                      leaving={leavingJobIds.has(job.id)}
                      jobsBusy={jobsBusy}
                      pending={pendingJobIds.has(job.id)}
                      onToggleSave={() => setJobSaved(job, !job.saved)}
                      onSkip={() => skipJob(job)}
                      onPursue={() => startPursuit(job)}
                    />
                  ))}
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
                <button className={jobsStyles.scanSecondaryBtn} onClick={() => router.push("/saved-pursuits")} type="button">
                  View Saved Pursuits
                </button>
              </div>

              {searchSettings ? (
                <>
                  <FlipEditCard
                    heading="Job titles in this scan"
                    editHeading="Edit job titles"
                    view={
                      <>
                        {searchSettings.targetTitles.length > 0 ? (
                          <div className={jobsStyles.titleChips}>
                            {searchSettings.targetTitles.map((title) => (
                              <span key={title} className={jobsStyles.titleChip}>{title}</span>
                            ))}
                          </div>
                        ) : (
                          <p className={jobsStyles.chipNote}>No titles yet. Add the roles you want scans to look for.</p>
                        )}
                        <p className={jobsStyles.chipNote}>Every title here is used in each scan, across all your role tracks.</p>
                      </>
                    }
                    form={<TokenInput values={titleDraft} onChange={setTitleDraft} placeholder="Add a title (Enter or comma adds it)" />}
                    footerHint="Enter or comma adds it. These titles drive every scan."
                    onOpen={() => setTitleDraft(searchSettings.targetTitles)}
                    onSave={() => saveTitles(titleDraft)}
                  />

                  <FlipEditCard
                    heading="Search settings"
                    editHeading="Edit search settings"
                    view={
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
                          <span className={jobsStyles.metaLabel}>Avoided cos.</span>
                          <strong className={jobsStyles.metaValue}>{searchSettings.avoidCompanies.length}</strong>
                        </div>
                      </div>
                    }
                    form={
                      <>
                        <div className={jobsStyles.editField}>
                          <span className={jobsStyles.metaLabel}>Remote preference</span>
                          <select className={jobsStyles.editControl} value={searchDraft.remotePreference} onChange={(event) => setSearchDraft((draft) => ({ ...draft, remotePreference: event.target.value }))}>
                            <option value="remote_only">Remote only</option>
                            <option value="remote_preferred">Remote preferred</option>
                            <option value="hybrid_ok">Hybrid OK</option>
                            <option value="onsite_ok">Onsite OK</option>
                          </select>
                        </div>
                        <div className={jobsStyles.editField}>
                          <span className={jobsStyles.metaLabel}>Salary floor</span>
                          <div className={jobsStyles.moneyField}>
                            <span className={jobsStyles.moneyPrefix}>$</span>
                            <input className={jobsStyles.editControl} inputMode="numeric" placeholder="Any" value={searchDraft.salaryFloor} onChange={(event) => setSearchDraft((draft) => ({ ...draft, salaryFloor: event.target.value.replace(/[^0-9]/g, "") }))} />
                          </div>
                        </div>
                        <div className={jobsStyles.editField}>
                          <span className={jobsStyles.metaLabel}>Avoided companies</span>
                          <TokenInput values={searchDraft.avoidCompanies} onChange={(next) => setSearchDraft((draft) => ({ ...draft, avoidCompanies: next }))} placeholder="Add a company (Enter or comma adds it)" />
                        </div>
                      </>
                    }
                    footerHint="Job titles live in the card above. Saving updates your profile settings."
                    onOpen={() => setSearchDraft({ remotePreference: searchSettings.remotePreference, salaryFloor: searchSettings.salaryFloor ? String(searchSettings.salaryFloor) : "", avoidCompanies: searchSettings.avoidCompanies })}
                    onSave={() => saveSearchSettings(searchDraft)}
                  />
                </>
              ) : null}

              <div className={jobsStyles.card}>
                <div className={jobsStyles.panelHeaderRow}>
                  <h3 className={jobsStyles.sidebarHeading}>Company job boards</h3>
                  {boards.length > 0 ? (
                    <button className={jobsStyles.editBtn} onClick={() => setBoardsEditing((editing) => !editing)} type="button">{boardsEditing ? "Done" : "Edit"}</button>
                  ) : null}
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
                  <div className={`${jobsStyles.boardList} ${boardsEditing ? jobsStyles.boardListEditing : ""}`}>
                    {boards.map((board) => (
                      <div className={jobsStyles.boardRow} key={board.id}>
                        <div className={jobsStyles.boardMain}>
                          <a className={jobsStyles.boardLink} href={board.careersUrl} target="_blank" rel="noreferrer">{board.companyName}</a>
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
                    Couldn&apos;t read that one yet. We&apos;ve saved the link and we&apos;ll see about adding it. Got a direct link to their listings? Paste that and it may scan right now.
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
          target={{ kind: "job", job: pursuitContext.job }}
          accessToken={pursuitContext.accessToken}
          onClose={() => setPursuitContext(null)}
          onPursuitChanged={(message) => { void loadJobs(pursuitContext.accessToken, message); }}
        />
      ) : null}
    </main>
  );
}

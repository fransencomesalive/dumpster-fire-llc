"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { PublicProfileApiError, requestPublicProfileApi } from "@/lib/public-profile/client";
import type { PublicJobRecord } from "@/lib/public-jobs/types";
import type { MatchResult } from "@/lib/public-profile/matching/types";
import type {
  HumanPathContactSuggestion,
  OutreachMessageFeedbackReason,
  OutreachMessageRecord,
  Pursuit,
  PursuitHistoryEntry,
} from "@/lib/public-profile/pursuits/types";
import { runSingleFlight, type SingleFlightState } from "@/lib/public-profile/single-flight";
import {
  PURSUIT_TRACKING_ACTIONS,
  emptyPursuitTrackingState,
  pursuitTrackingLabel,
  type PursuitBucket,
  type PursuitTrackingState,
} from "@/lib/public-profile/pursuits/tracking";
import styles from "./apply-wizard.module.css";

// The Human Path apply wizard: Review → Contacts → Outreach → Track. Markup + CSS are ported
// 1:1 from the approved DS card (design-system/components/apply-wizard.html); the wiring drives
// the already-built public pursuit backend, re-reading the pursuit after each step.
//
// Two entry modes (design "PRODUCTION COMPONENT MAPPING", Randall 2026-07-18):
//   · kind:"job"     starts a new pursuit for a job and walks all four steps.
//   · kind:"pursuit"  re-opens an existing pursuit from the Saved Pursuits page. Applied
//                     pursuits open straight into Track behind an appliedBar (no stepper, no
//                     generation); Saved-for-later pursuits resume on the stepper's Track step.
export type ApplyWizardTarget =
  | { kind: "job"; job: PublicJobRecord }
  | { kind: "pursuit"; pursuitId: string };

type WizardStep = 1 | 2 | 3 | 4;
const STEP_LABELS: Record<WizardStep, string> = { 1: "Review", 2: "Contacts", 3: "Outreach", 4: "Track" };

// Message feedback flips the whole modal to a chip picker. Saving records evidence only
// (POST .../outreach/[messageId]/feedback) — it never edits, regenerates, sends, or changes the
// message or pursuit. The free text lives in the "something else" row (maps to the `other` code).
const MESSAGE_FEEDBACK_REASONS: { code: OutreachMessageFeedbackReason; label: string }[] = [
  { code: "wrong_skills_title_applied", label: "Wrong skills/title applied" },
  { code: "personal_voice_mismatch", label: "Doesn't sound like Me" },
  { code: "selected_tone_mismatch", label: "Doesn't sound like selected tone" },
  { code: "awkward_to_read", label: "Awkward to read" },
  { code: "would_not_send", label: "I wouldn't send this" },
];

type RoleTrackOption = { id: string; name: string };
type CreateResponse = { status: string; job: PublicJobRecord; match: MatchResult; pursuit: Pursuit };
type RoleTracksResponse = { status: string; section: { roleTracks: RoleTrackOption[] } };
type PostingDisplay = {
  title: string | null;
  companyName: string | null;
  location: string | null;
  remoteType: string | null;
  compensation: string | null;
  sourceUrl: string | null;
};
type PursuitReadResponse = {
  status: string;
  pursuit: Pursuit;
  job: PublicJobRecord | null;
  posting: PostingDisplay;
  contacts: HumanPathContactSuggestion[];
  outreachMessages: OutreachMessageRecord[];
  bucket: PursuitBucket;
  tracking: PursuitTrackingState;
  history: PursuitHistoryEntry[];
  humanPathNeedsRefresh: boolean;
  humanPathProviderVersion: number;
};
type TrackingResponse = {
  status: string;
  bucket: PursuitBucket;
  trackingStartedAt: string | null;
  tracking: PursuitTrackingState;
  history: PursuitHistoryEntry[];
};
type MessageFeedbackTarget = Pick<
  OutreachMessageRecord,
  "id" | "regenerationCount" | "updatedAt"
>;

function humanizeContactType(type: HumanPathContactSuggestion["contactType"]): string {
  switch (type) {
    case "likely_hiring_manager": return "Hiring Manager";
    case "functional_leader": return "Functional Leader";
    case "recruiter": return "Recruiter";
    case "executive_sponsor": return "Executive Sponsor";
    case "referral_candidate": return "Referral";
    default: return "Contact";
  }
}

function linkedInBooleanSearch(jobTitle: string, companyName: string | null) {
  const clean = (value: string) => value.replace(/["“”]/g, "").trim();
  const fragments = clean(jobTitle)
    .split(/\s*[,|/]\s*|\s+[–—-]\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const roleTerms = Array.from(new Set([clean(jobTitle), ...fragments])).slice(0, 4);
  const roleClause = roleTerms.map((term) => `"${term}"`).join(" OR ");
  const companyClause = companyName ? `"${clean(companyName)}" AND ` : "";
  const query = `${companyClause}(${roleClause}) AND ("Manager" OR "Director" OR "Head" OR "Recruiter" OR "Talent Acquisition")`;
  return {
    query,
    url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}&origin=GLOBAL_SEARCH_HEADER`,
  };
}

function confidenceStars(confidence: HumanPathContactSuggestion["confidence"]): string {
  const filled = confidence === "high" ? 4 : confidence === "medium" ? 3 : 2;
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

// A stable-per-message key keeps re-copies and retries idempotent (the backend also guards
// against recording the same copied message twice); tracking saves use a fresh key per click.
function newIdempotencyKey(prefix: string): string {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${rand}`;
}

function formatHistoryTime(entry: PursuitHistoryEntry): string {
  if (!entry.timestampAvailable || !entry.occurredAt) return "Date unavailable";
  const date = new Date(entry.occurredAt);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return `Today · ${time}`;
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${day} · ${time}`;
}

const EXTERNAL_LINK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

// The Copied state only appears after the clipboard write resolves; a blocked write leaves the
// button in its Copy state. On a successful write we record the copy server-side (marks
// "Sent outreach message" and moves the pursuit to Applied); the parent surfaces a failure.
function WizardCopyButton({ text, onCopied }: { text: string; onCopied: () => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard unavailable or blocked; stay on Copy and do not claim anything was recorded.
      return;
    }
    void onCopied();
  }
  return (
    <button
      type="button"
      className={`${styles.copyButton}${copied ? ` ${styles.copyButtonCopied}` : ""}`}
      onClick={copyText}
      aria-label={copied ? "Message copied to clipboard" : "Copy message"}
    >
      {copied ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      )}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

// JS autosize fallback for browsers without CSS field-sizing: the box always grows to
// the full message instead of clipping behind an inner scrollbar.
function AutosizeTextarea({ value }: { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 4}px`;
  }, [value]);
  return <textarea ref={ref} className={styles.messageTextarea} value={value} readOnly />;
}

// A designed, human-readable record of the pursuit: dated marks, reversals, and expandable
// sent-message snapshots (view-only, non-selectable). Never shows event codes or IDs.
function PursuitHistoryRail({ history, flush }: { history: PursuitHistoryEntry[]; flush?: boolean }) {
  const className = `${styles.pursuitHistory}${flush ? ` ${styles.pursuitHistoryFlush}` : ""}`;
  return (
    <section className={className}>
      <strong>Pursuit history</strong>
      {history.length === 0 ? (
        <p className={styles.dsStateLabel}>Nothing tracked yet. Marks and sent messages will appear here with their dates.</p>
      ) : (
        <ol className={styles.historyList}>
          {history.map((entry, index) => {
            const time = formatHistoryTime(entry);
            if (entry.type === "message") {
              const recipientName = entry.recipient.name;
              const summaryLabel = recipientName
                ? `Sent outreach message to ${recipientName}`
                : "Sent an outreach message";
              if (!entry.message.available || !entry.message.text) {
                // Legacy import with no saved message body: nothing to open.
                return (
                  <li className={`${styles.historyItem} ${styles.isUnavailable}`} key={index}>
                    <div className={styles.historyLine}>
                      <span className={styles.historyLabel}>{summaryLabel}</span>
                      <span className={styles.historyTime}>{time}</span>
                    </div>
                    <span className={styles.historyMeta}>The exact message and recipient were not saved, so there is nothing to open.</span>
                  </li>
                );
              }
              return (
                <li className={styles.historyItem} key={index}>
                  <details className={styles.historyMsg}>
                    <summary>
                      <span className={styles.historyLabel}>{summaryLabel}</span>
                      {entry.recipient.linkedinUrl ? (
                        <a href={entry.recipient.linkedinUrl} target="_blank" rel="noreferrer" className={styles.seeProfileBtn}>LI Profile{EXTERNAL_LINK_ICON}</a>
                      ) : null}
                      <span className={styles.historyTime}>{time}</span>
                      <span className={styles.msgDisclosure}>Show message</span>
                    </summary>
                    <div className={styles.historyMsgBody}><p>{entry.message.text}</p></div>
                  </details>
                  {recipientName && !entry.recipient.linkedinUrl ? (
                    <span className={styles.historyMeta}>A profile link was not saved for this recipient.</span>
                  ) : null}
                </li>
              );
            }
            const reversal = entry.change === "unmarked";
            return (
              <li className={`${styles.historyItem}${reversal ? ` ${styles.isReversal}` : ""}`} key={index}>
                <div className={styles.historyLine}>
                  <span className={styles.historyLabel}>{reversal ? `Unmarked ${entry.label}` : entry.label}</span>
                  <span className={styles.historyTime}>{time}</span>
                </div>
                {reversal ? <span className={styles.historyMeta}>Correction. Earlier marks are kept below.</span> : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof PublicProfileApiError) {
    const body = error.body as { error?: string } | null;
    if (body?.error) return body.error;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function ApplyWizardModal({
  target,
  accessToken,
  onClose,
  onPursuitChanged,
}: {
  target: ApplyWizardTarget;
  accessToken: string;
  onClose: () => void;
  onPursuitChanged?: (message: string) => void;
}) {
  const [mode, setMode] = useState<"stepper" | "applied">("stepper");
  const [step, setStep] = useState<WizardStep>(target.kind === "pursuit" ? 4 : 1);
  // Highest step legitimately reached. Reached steps navigate freely; the frontier advances one
  // step in order; anything further ahead is a skip and is refused with a contextual message.
  const [reached, setReached] = useState<WizardStep>(target.kind === "pursuit" ? 4 : 1);
  const [pursuitId, setPursuitId] = useState<string | null>(target.kind === "pursuit" ? target.pursuitId : null);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [job, setJob] = useState<PublicJobRecord | null>(target.kind === "job" ? target.job : null);
  const [posting, setPosting] = useState<PostingDisplay | null>(null);
  const [roleTracks, setRoleTracks] = useState<RoleTrackOption[]>([]);
  const [selectedRoleTrackId, setSelectedRoleTrackId] = useState<string | null>(null);
  const [recommendedRoleTrackId, setRecommendedRoleTrackId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<HumanPathContactSuggestion[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const [noContactsFound, setNoContactsFound] = useState(false);
  const actionInFlightRef = useRef<SingleFlightState>({ active: false });
  const [messages, setMessages] = useState<OutreachMessageRecord[]>([]);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  // Tracking: `tracking` is the last committed server state; `draft` is the in-progress
  // checkbox state. The badge and CTA react to `draft`; the history rail reflects `tracking`.
  const [tracking, setTracking] = useState<PursuitTrackingState>(emptyPursuitTrackingState);
  const [draft, setDraft] = useState<PursuitTrackingState>(emptyPursuitTrackingState);
  const [history, setHistory] = useState<PursuitHistoryEntry[]>([]);
  const [trackingStartedAt, setTrackingStartedAt] = useState<string | null>(null);
  const [resumedSavedForLater, setResumedSavedForLater] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copyRetryMessageId, setCopyRetryMessageId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Message feedback: flips the whole modal to a chip picker tied to one message.
  const [feedbackTarget, setFeedbackTarget] = useState<MessageFeedbackTarget | null>(null);
  const [fbCodes, setFbCodes] = useState<Set<OutreachMessageFeedbackReason>>(new Set());
  const [fbSeChecked, setFbSeChecked] = useState(false);
  const [fbNote, setFbNote] = useState("");
  const [fbSaving, setFbSaving] = useState(false);
  const [fbError, setFbError] = useState<string | null>(null);
  const [ackedMessageId, setAckedMessageId] = useState<string | null>(null);
  const fbFrontRef = useRef<HTMLDivElement>(null);
  const fbBackRef = useRef<HTMLDivElement>(null);
  const fbHeadingRef = useRef<HTMLHeadingElement>(null);
  const fbTriggerRef = useRef<HTMLButtonElement | null>(null);
  const fbSeInputRef = useRef<HTMLInputElement>(null);
  const modalOverlayRef = useRef<HTMLDivElement>(null);
  const feedbackSessionRef = useRef(0);
  const fbFocusTimerRef = useRef<number | null>(null);
  const fbAckTimerRef = useRef<number | null>(null);
  const feedbackOpen = feedbackTarget !== null;
  const fbHasSelection = fbCodes.size > 0 || fbSeChecked;

  // Only the visible face stays focusable / in the a11y tree.
  useEffect(() => {
    if (fbFrontRef.current) fbFrontRef.current.inert = feedbackOpen;
    if (fbBackRef.current) fbBackRef.current.inert = !feedbackOpen;
  }, [feedbackOpen]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      feedbackSessionRef.current += 1;
      if (fbFocusTimerRef.current !== null) window.clearTimeout(fbFocusTimerRef.current);
      if (fbAckTimerRef.current !== null) window.clearTimeout(fbAckTimerRef.current);
    };
  }, []);

  const api = useCallback(
    <T,>(path: string, method: string, body?: unknown) =>
      requestPublicProfileApi<T>(path, { method, accessToken, body }),
    [accessToken],
  );

  function openMessageFeedback(message: OutreachMessageRecord, triggerEl: HTMLButtonElement) {
    const session = feedbackSessionRef.current + 1;
    feedbackSessionRef.current = session;
    if (fbFocusTimerRef.current !== null) window.clearTimeout(fbFocusTimerRef.current);
    fbTriggerRef.current = triggerEl;
    setFbError(null);
    setFeedbackTarget({
      id: message.id,
      regenerationCount: message.regenerationCount ?? 0,
      updatedAt: message.updatedAt,
    });
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    fbFocusTimerRef.current = window.setTimeout(() => {
      if (feedbackSessionRef.current === session) fbHeadingRef.current?.focus();
    }, reduce ? 0 : 200);
  }

  function closeMessageFeedback() {
    feedbackSessionRef.current += 1;
    if (fbFocusTimerRef.current !== null) window.clearTimeout(fbFocusTimerRef.current);
    setFeedbackTarget(null);
    setFbSaving(false);
    setFbError(null);
    setFbCodes(new Set());
    setFbSeChecked(false);
    setFbNote("");
    fbFocusTimerRef.current = window.setTimeout(() => fbTriggerRef.current?.focus(), 0);
  }

  function toggleFbCode(code: OutreachMessageFeedbackReason) {
    setFbCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  async function saveMessageFeedback() {
    if (!feedbackTarget || !fbHasSelection || fbSaving) return;
    const session = feedbackSessionRef.current;
    const targetSnapshot = feedbackTarget;
    const reasonCodes = [...fbCodes];
    if (fbSeChecked) reasonCodes.push("other");
    const trimmed = fbNote.trim();
    setFbSaving(true);
    setFbError(null);
    try {
      await api<unknown>(
        `/api/public-profile/pursuits/outreach/${targetSnapshot.id}/feedback`,
        "POST",
        {
          reasonCodes,
          expectedMessageRevision: targetSnapshot.regenerationCount ?? 0,
          expectedMessageUpdatedAt: targetSnapshot.updatedAt,
          ...(fbSeChecked && trimmed ? { notes: trimmed } : {}),
        },
      );
      if (feedbackSessionRef.current !== session) return;
      const savedId = targetSnapshot.id;
      closeMessageFeedback();
      setAckedMessageId(savedId);
      if (fbAckTimerRef.current !== null) window.clearTimeout(fbAckTimerRef.current);
      fbAckTimerRef.current = window.setTimeout(() => setAckedMessageId((cur) => (cur === savedId ? null : cur)), 2600);
    } catch (err) {
      if (feedbackSessionRef.current !== session) return;
      setFbError(errorMessage(err, "That didn't save. Your selections are still here, give it another go."));
      setFbSaving(false);
    }
  }

  function handleModalKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && feedbackOpen) {
      event.stopPropagation();
      closeMessageFeedback();
      return;
    }
    if (event.key !== "Tab") return;
    const visibleFace = feedbackOpen ? fbBackRef.current : fbFrontRef.current;
    if (!visibleFace) return;
    const focusable = [...visibleFace.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
    )].filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !visibleFace.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !visibleFace.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleBackdropMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && feedbackOpen) closeMessageFeedback();
  }

  const applyTracking = useCallback((data: { tracking: PursuitTrackingState; history: PursuitHistoryEntry[]; trackingStartedAt: string | null }) => {
    setTracking(data.tracking);
    setDraft(data.tracking);
    setHistory(data.history);
    setTrackingStartedAt(data.trackingStartedAt);
  }, []);

  const readPursuit = useCallback(
    async (id: string) => {
      const load = () => api<PursuitReadResponse>(`/api/public-profile/pursuits/${id}`, "GET");
      let data = await load();
      if (data.humanPathNeedsRefresh) {
        try {
          await api("/api/public-profile/pursuits/human-path", "POST", { pursuitId: id });
          data = await load();
        } catch (err) {
          if (err instanceof PublicProfileApiError && err.status === 503) {
            setProviderUnavailable(true);
          } else {
            throw err;
          }
        }
      }
      if (data.job) setJob(data.job);
      setPosting(data.posting);
      setContacts(data.contacts);
      setNoContactsFound(data.pursuit.status === "human_path_generated" && data.contacts.length === 0);
      setMessages(data.outreachMessages);
      applyTracking({ tracking: data.tracking, history: data.history, trackingStartedAt: data.pursuit.trackingStartedAt ?? null });
      return data;
    },
    [api, applyTracking],
  );

  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    (async () => {
      // Re-entry from the Saved Pursuits page: read the pursuit, then route by bucket.
      if (target.kind === "pursuit") {
        try {
          const data = await readPursuit(target.pursuitId);
          if (data.bucket === "applied") {
            setMode("applied");
            setStep(4);
            setReached(4);
          } else {
            setMode("stepper");
            const emptyHumanPath = data.pursuit.status === "human_path_generated" && data.contacts.length === 0;
            setStep(emptyHumanPath ? 2 : 4);
            setReached(emptyHumanPath ? 2 : 4);
            setResumedSavedForLater(!emptyHumanPath);
            // Best-effort match + role tracks so the stepper can navigate back to Review;
            // a snapshot-only posting (no live job) degrades to Track-only.
            if (data.pursuit.jobId) {
              try {
                const [tracks, matched] = await Promise.all([
                  api<RoleTracksResponse>("/api/public-profile/role-tracks", "GET").catch(() => null),
                  api<{ match: MatchResult }>("/api/public-profile/match", "POST", { jobId: data.pursuit.jobId }).catch(() => null),
                ]);
                if (matched) {
                  setMatch(matched.match);
                  setRecommendedRoleTrackId(matched.match.recommendations.roleTrack?.roleTrack.id ?? null);
                }
                const trackList = tracks?.section.roleTracks ?? [];
                setRoleTracks(trackList);
                setSelectedRoleTrackId(data.pursuit.selectedRoleTrackId ?? matched?.match.recommendations.roleTrack?.roleTrack.id ?? trackList[0]?.id ?? null);
              } catch {
                // Non-fatal: Track still works without Review context.
              }
            }
          }
          setReady(true);
        } catch (err) {
          setInitError(errorMessage(err, "Could not open this pursuit."));
        }
        return;
      }

      // New pursuit for a dashboard job.
      const initialJob = target.job;
      try {
        const [created, tracks] = await Promise.all([
          api<CreateResponse>("/api/public-profile/pursuits", "POST", { jobId: initialJob.id }),
          api<RoleTracksResponse>("/api/public-profile/role-tracks", "GET").catch(() => null),
        ]);
        setPursuitId(created.pursuit.id);
        setMatch(created.match);
        setJob(created.job);
        setTrackingStartedAt(created.pursuit.trackingStartedAt ?? null);
        const recommended = created.match.recommendations.roleTrack?.roleTrack.id ?? null;
        setRecommendedRoleTrackId(recommended);
        const trackList = tracks?.section.roleTracks ?? [];
        setRoleTracks(trackList);
        setSelectedRoleTrackId(recommended ?? trackList[0]?.id ?? null);
        setReady(true);
      } catch (err) {
        // A pursuit already exists for this job: resume it instead of failing. The 409
        // carries the existing pursuit; contacts/messages/tracking come from the pursuit read.
        if (err instanceof PublicProfileApiError && err.status === 409) {
          const body = err.body as { status?: string; pursuit?: Pursuit } | null;
          if (body?.status === "already_pursuing" && body.pursuit) {
            const existing = body.pursuit;
            try {
              setPursuitId(existing.id);
              const [resumed, tracks, matched] = await Promise.all([
                readPursuit(existing.id),
                api<RoleTracksResponse>("/api/public-profile/role-tracks", "GET").catch(() => null),
                api<{ match: MatchResult }>("/api/public-profile/match", "POST", { jobId: initialJob.id }),
              ]);
              setSelectedContactIds(new Set(
                resumed.contacts.filter((contact) => contact.confidence === "high").map((contact) => contact.id),
              ));
              setMatch(matched.match);
              const recommended = matched.match.recommendations.roleTrack?.roleTrack.id ?? null;
              setRecommendedRoleTrackId(recommended);
              const trackList = tracks?.section.roleTracks ?? [];
              setRoleTracks(trackList);
              setSelectedRoleTrackId(existing.selectedRoleTrackId ?? recommended ?? trackList[0]?.id ?? null);
              setReady(true);
              return;
            } catch (resumeErr) {
              setInitError(errorMessage(resumeErr, "Could not resume this pursuit."));
              return;
            }
          }
        }
        setInitError(errorMessage(err, "Could not start this pursuit."));
      }
    })();
  }, [api, target, readPursuit]);

  async function run(fn: () => Promise<void>) {
    await runSingleFlight(actionInFlightRef.current, async () => {
      setBusy(true);
      setError(null);
      try {
        await fn();
      } catch (err) {
        setError(errorMessage(err, "Something went wrong. Try again."));
      } finally {
        setBusy(false);
      }
    });
  }

  function submitReview() {
    if (!pursuitId) return;
    run(async () => {
      await api(`/api/public-profile/pursuits/review`, "POST", {
        pursuitId,
        selectedRoleTrackId: selectedRoleTrackId ?? undefined,
      });
      setStep(2);
      setReached((r) => (r < 2 ? 2 : r));
      if (contacts.length === 0) await discoverContacts(pursuitId);
    });
  }

  async function discoverContacts(id: string) {
    setProviderUnavailable(false);
    setNoContactsFound(false);
    try {
      await api(`/api/public-profile/pursuits/human-path`, "POST", { pursuitId: id });
    } catch (err) {
      if (err instanceof PublicProfileApiError && err.status === 503) {
        setProviderUnavailable(true);
        return;
      }
      throw err;
    }
    const data = await readPursuit(id);
    setSelectedContactIds(new Set(
      data.contacts.filter((contact) => contact.confidence === "high").map((contact) => contact.id),
    ));
  }

  function retryContacts() {
    if (!pursuitId) return;
    run(() => discoverContacts(pursuitId));
  }

  function toggleContact(id: string) {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function submitContacts() {
    if (!pursuitId) return;
    if (noContactsFound) return;
    const contactIds = [...selectedContactIds];
    if (contactIds.length === 0) {
      setError("Select at least one contact to continue.");
      return;
    }
    run(async () => {
      await api(`/api/public-profile/pursuits/contacts`, "POST", { pursuitId, contactIds });
      setStep(3);
      setReached((r) => (r < 3 ? 3 : r));
      await generateOutreach(pursuitId);
    });
  }

  async function generateOutreach(id: string) {
    try {
      await api(`/api/public-profile/pursuits/outreach`, "POST", { pursuitId: id });
    } catch (err) {
      const body = err instanceof PublicProfileApiError ? err.body as { status?: string } | null : null;
      if (!(err instanceof PublicProfileApiError && err.status === 409 && body?.status === "already_generated")) throw err;
    }
    await readPursuit(id);
  }

  function regenerateOutreach(message: OutreachMessageRecord) {
    if (!pursuitId) return;
    setRegeneratingId(message.id);
    void run(async () => {
      await api(`/api/public-profile/pursuits/outreach`, "POST", {
        pursuitId,
        regenerate: true,
        previousMessageId: message.id,
      });
      await readPursuit(pursuitId);
    }).finally(() => setRegeneratingId(null));
  }

  // Copying a message records "Sent outreach message" and promotes the pursuit to Applied.
  // If the clipboard write succeeded but this server record fails, we surface an honest retry
  // (design state 7) and never show the action as tracked.
  const recordMessageCopy = useCallback(async (messageId: string) => {
    if (!pursuitId) return;
    try {
      const data = await api<TrackingResponse>(
        `/api/public-profile/pursuits/outreach/${messageId}/copy`,
        "POST",
        { idempotencyKey: `copy:${messageId}` },
      );
      applyTracking({ tracking: data.tracking, history: data.history, trackingStartedAt: data.trackingStartedAt });
      setCopyError(null);
      setCopyRetryMessageId(null);
    } catch {
      setCopyError("Your message is on the clipboard. We could not record it to this pursuit, so it is not tracked yet.");
      setCopyRetryMessageId(messageId);
    }
  }, [api, pursuitId, applyTracking]);

  function retryCopyRecord() {
    if (!copyRetryMessageId) return;
    void run(() => recordMessageCopy(copyRetryMessageId));
  }

  function toggleDraft(action: (typeof PURSUIT_TRACKING_ACTIONS)[number]) {
    setDraft((prev) => ({ ...prev, [action]: !prev[action] }));
  }

  function saveTracking() {
    if (!pursuitId) {
      onClose();
      return;
    }
    const changes: Partial<PursuitTrackingState> = {};
    for (const action of PURSUIT_TRACKING_ACTIONS) {
      if (draft[action] !== tracking[action]) changes[action] = draft[action];
    }
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    run(async () => {
      const data = await api<TrackingResponse>(
        `/api/public-profile/pursuits/${pursuitId}/tracking`,
        "PATCH",
        { changes, idempotencyKey: newIdempotencyKey(`track:${pursuitId}`) },
      );
      applyTracking({ tracking: data.tracking, history: data.history, trackingStartedAt: data.trackingStartedAt });
      onPursuitChanged?.(`Pursuit updated for ${title}.`);
      onClose();
    });
  }

  const title = job?.title ?? posting?.title ?? "Saved posting";
  const company = job?.companyName ?? posting?.companyName ?? null;
  const sourceUrl = job?.sourceUrl ?? posting?.sourceUrl ?? null;
  const linkedInSearch = linkedInBooleanSearch(title, company);
  const jobMetaLine = [company, job?.compensationText ?? posting?.compensation, job?.location ?? posting?.location, job?.remoteType ?? posting?.remoteType]
    .filter(Boolean)
    .join(" · ");

  const anyChecked = PURSUIT_TRACKING_ACTIONS.some((action) => draft[action]);
  const isApplied = Boolean(trackingStartedAt) || anyChecked;
  const headerTitle = mode === "applied"
    ? [title, company].filter(Boolean).join(" · ")
    : `Human Path: ${title}`;
  const saveLabel = mode === "applied" ? "Save changes" : isApplied ? "Save to Applied" : "Save for later";

  const closeButton = (
    <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );

  // Stepper navigation. Reached steps navigate freely; the frontier advances one step in order
  // (running that step's real work); skipping further ahead is refused with a message naming the
  // missing prerequisite. The message renders in the canon tomato ds-callout beneath the stepper.
  const goToStep = (target: WizardStep) => {
    if (!ready || busy || actionInFlightRef.current.active || target === step) return;
    if (noContactsFound && target >= 3) return;
    setError(null);
    if (target <= reached) { setStep(target); return; }
    if (target === 4 && reached >= 3) { setStep(4); setReached(4); return; }
    if (target === reached + 1 && step === reached) {
      if (step === 1) { submitReview(); return; }
      if (step === 2) { submitContacts(); return; }
    }
    setError(target >= 4
      ? "Can't wrestle if you don't weigh in, go back to Contacts first."
      : "Can't generate a message without contacts first, go back a step.");
  };

  const stepper = (
    <div className={styles.wizardSteps} aria-label="Human Path steps">
      {([1, 2, 3, 4] as WizardStep[]).map((n) => (
        <button
          type="button"
          key={n}
          className={`${styles.wizardStep} ${n === step ? styles.wizardStepActive : ""}`}
          onClick={() => goToStep(n)}
          disabled={!ready || busy || (noContactsFound && n >= 3)}
          aria-current={n === step ? "step" : undefined}
        >
          <span>{n}</span>{STEP_LABELS[n]}
        </button>
      ))}
    </div>
  );

  const appliedBar = (
    <div className={styles.appliedBar}>
      <span className={styles.appliedTag}>Applied</span>
      <small>Your saved tracking and messages are here.</small>
    </div>
  );

  const footer = (
    <div className={styles.modalFooter}>
      {sourceUrl ? (
        <a href={sourceUrl} target="_blank" rel="noreferrer" className={`${styles.modalBtnClose} ${styles.footerSpacer}`}>Open job posting{EXTERNAL_LINK_ICON}</a>
      ) : <span className={styles.footerSpacer} />}
      {mode === "stepper" && step > 1 ? (
        <button type="button" className={styles.modalBtnClose} onClick={() => { if (!actionInFlightRef.current.active) setStep((s) => (s - 1) as WizardStep); }} disabled={!ready || busy}>Back</button>
      ) : null}
      {mode === "stepper" && step === 1 ? (
        <button type="button" className={styles.modalBtnSave} onClick={submitReview} disabled={!ready || busy}>Continue</button>
      ) : mode === "stepper" && step === 2 ? (
        <button type="button" className={styles.modalBtnSave} onClick={submitContacts} disabled={!ready || busy || providerUnavailable || noContactsFound}>Continue</button>
      ) : mode === "stepper" && step === 3 ? (
        <button type="button" className={styles.modalBtnSave} onClick={() => { if (!actionInFlightRef.current.active) { setStep(4); setReached(4); } }} disabled={!ready || busy}>Continue</button>
      ) : (
        <button type="button" className={`${styles.modalBtnSave} ${isApplied ? styles.modalBtnSaveOn : ""}`} onClick={saveTracking} disabled={!ready || busy}>{saveLabel}</button>
      )}
    </div>
  );

  const trackStep = (
    <div className={styles.modalStack}>
      {copyError ? (
        <div className={styles.trackAlert}>
          <p><strong>Copied, but not saved.</strong> {copyError}</p>
          <button type="button" className={styles.retryBtn} onClick={retryCopyRecord} disabled={busy}>Retry saving</button>
        </div>
      ) : null}
      <section>
        <div className={styles.trackIntro}>
          <strong>Pursuit tracking</strong>
          <span className={`${styles.trackClass} ${isApplied ? "" : styles.isSaved}`}>{isApplied ? "Applied" : "Saved for later"}</span>
        </div>
        {resumedSavedForLater && !anyChecked ? (
          <p className={styles.formSuccess}>Your review, contacts, and draft message are saved. This stays Saved for later until you check an action.</p>
        ) : (
          <p>
            {isApplied
              ? "Mark as many as apply. The actions are independent, and every change is kept with its date. Unchecking corrects the record but never moves this back to Saved for later."
              : "Check what has happened. Every mark is kept with its date, and nothing is overwritten. The first check moves this pursuit to Applied."}
          </p>
        )}
      </section>
      <div className={styles.checklistGrid}>
        {PURSUIT_TRACKING_ACTIONS.map((action) => (
          <label key={action}>
            <input type="checkbox" checked={draft[action]} onChange={() => toggleDraft(action)} />
            <span>{pursuitTrackingLabel(action)}</span>
          </label>
        ))}
      </div>
      <PursuitHistoryRail history={history} />
    </div>
  );

  const messageFeedbackFace = (
    <>
      <div className={styles.modalHeader}>
        <h4 ref={fbHeadingRef} tabIndex={-1} id="wizard-msg-fb-title" className={styles.modalTitle}>What&apos;s off about this message?</h4>
        <button type="button" className={styles.modalClose} onClick={closeMessageFeedback} aria-label="Back to message">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <div className={styles.feedbackFace}>
        <p className={styles.feedbackSub}>Pick all that apply. This won&apos;t edit, regenerate, or send the message.</p>
        <div className={styles.chipSet} role="group" aria-label="What's off about this message">
          {MESSAGE_FEEDBACK_REASONS.map((reason) => {
            const on = fbCodes.has(reason.code);
            return (
              <button key={reason.code} type="button" disabled={fbSaving} className={`${styles.chip} ${on ? styles.chipOn : ""}`} aria-pressed={on} onClick={() => toggleFbCode(reason.code)}>
                {on ? (
                  <span className={styles.chipCheck}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg></span>
                ) : null}
                {reason.label}
              </button>
            );
          })}
        </div>
        <div className={styles.seRow}>
          <input
            type="checkbox"
            id="wizard-msg-fb-se"
            checked={fbSeChecked}
            disabled={fbSaving}
            onChange={(event) => {
              setFbSeChecked(event.target.checked);
              if (event.target.checked) {
                const session = feedbackSessionRef.current;
                if (fbFocusTimerRef.current !== null) window.clearTimeout(fbFocusTimerRef.current);
                fbFocusTimerRef.current = window.setTimeout(() => {
                  if (feedbackSessionRef.current === session) fbSeInputRef.current?.focus();
                }, 0);
              }
            }}
          />
          <label htmlFor="wizard-msg-fb-se">something else</label>
          <input ref={fbSeInputRef} type="text" className={styles.seInput} maxLength={500} placeholder="Tell us what missed" value={fbNote} disabled={!fbSeChecked || fbSaving} onChange={(event) => setFbNote(event.target.value)} />
          <span className={styles.seCount}>{fbNote.length}/500</span>
        </div>
        {fbError ? (
          <div className={styles.feedbackAlert} role="alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            <p>{fbError}</p>
          </div>
        ) : null}
        <div className={styles.feedbackFooter}>
          <button type="button" className={styles.btnGhost} onClick={closeMessageFeedback}>Close</button>
          <button type="button" className={styles.btnPrimary} disabled={!fbHasSelection || fbSaving} onClick={saveMessageFeedback}>{fbSaving ? "Saving…" : "Save feedback"}</button>
        </div>
      </div>
    </>
  );

  return (
    <div
      ref={modalOverlayRef}
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby={feedbackOpen ? "wizard-msg-fb-title" : "apply-wizard-title"}
      onKeyDown={handleModalKeyDown}
      onMouseDown={handleBackdropMouseDown}
    >
      <div className={`${styles.flipCard} ${feedbackOpen ? styles.flipCardFlipped : ""}`}>
      <div ref={fbFrontRef} aria-hidden={feedbackOpen} className={`${styles.modalBox} ${styles.flipFace} ${styles.flipFront}`}>
        <div className={styles.modalHeader}>
          <h4 id="apply-wizard-title" className={styles.modalTitle}>{headerTitle}</h4>
          {closeButton}
        </div>
        {mode === "applied" ? appliedBar : stepper}
        {error ? <div className={`ds-callout ${styles.skipError}`} role="alert">{error}</div> : null}

        {initError ? (
          <div className={styles.modalStack}>
            <section><strong>Can&apos;t open this pursuit</strong><p>{initError}</p></section>
          </div>
        ) : !ready ? (
          <div className={styles.modalStack}>
            <section><p className={styles.dsStateLabel}>{mode === "applied" ? "Opening your pursuit…" : "Setting up your Human Path…"}</p></section>
          </div>
        ) : (
          <>
            {mode === "stepper" && step === 1 && match ? (
              <div className={styles.modalStack}>
                <section className={styles.modeSection}>
                  <div className={styles.modeSelector} aria-label="Choose role track">
                    <span>Applying as:</span>
                    {roleTracks.length === 0 ? (
                      <label><span>Add a role track in your profile to tailor this.</span></label>
                    ) : roleTracks.map((track) => (
                      <label key={track.id}>
                        <input
                          type="checkbox"
                          checked={selectedRoleTrackId === track.id}
                          onChange={() => setSelectedRoleTrackId(track.id)}
                        />
                        <span>{track.name}{track.id === recommendedRoleTrackId ? " (recommended)" : ""}</span>
                      </label>
                    ))}
                  </div>
                  {match.recommendations.roleTrack?.reason ? (
                    <p className={styles.modeRecommendation}>{match.recommendations.roleTrack.reason}</p>
                  ) : null}
                </section>
                <section>
                  <strong>Job review</strong>
                  {jobMetaLine ? <p>{jobMetaLine}</p> : null}
                  <p>Fit: {match.label}. {match.explanation}</p>
                </section>
                {match.risks.length > 0 ? (
                  <section>
                    <strong>Recommended strategy</strong>
                    <p>Watch for: {match.risks.join("; ")}</p>
                  </section>
                ) : null}
              </div>
            ) : null}

            {mode === "stepper" && step === 2 ? (
              <div className={styles.modalStack}>
                <section>
                  <strong>Human Path</strong>
                  <p>The reporting chain is built automatically when you pursue this role: owning function, manager, functional leader, then recruiter.</p>
                  {providerUnavailable ? (
                    <p className={styles.formNotice}>Contact discovery is unavailable right now. Try again in a moment.</p>
                  ) : noContactsFound ? (
                    <>
                      <p className={styles.formNotice}>No verified contacts turned up for this role. Use the preloaded LinkedIn search, or open the job posting and look for a current team leader or recruiter.</p>
                      <a href={linkedInSearch.url} target="_blank" rel="noreferrer" className={styles.seeProfileBtn} aria-label={`Search LinkedIn people with: ${linkedInSearch.query}`}>Search LinkedIn{EXTERNAL_LINK_ICON}</a>
                    </>
                  ) : contacts.length > 0 ? (
                    <p className={styles.formSuccess}>Found {contacts.length} reporting-chain contact{contacts.length === 1 ? "" : "s"}.</p>
                  ) : null}
                </section>
                {busy && contacts.length === 0 && !providerUnavailable ? (
                  <div className={styles.contactsLoading}>
                    <div className={styles.progressLine}><span className={styles.progressDot} />Fetching potential contacts&hellip;</div>
                    <div className={styles.skeletonCard}><span className={`${styles.skeletonBar} ${styles.w60}`} /><span className={`${styles.skeletonBar} ${styles.w40}`} /><span className={`${styles.skeletonBar} ${styles.w80}`} /></div>
                    <div className={styles.skeletonCard}><span className={`${styles.skeletonBar} ${styles.w50}`} /><span className={`${styles.skeletonBar} ${styles.w35}`} /><span className={`${styles.skeletonBar} ${styles.w80}`} /></div>
                  </div>
                ) : null}
                {contacts.map((contact) => (
                  <label className={styles.contactSuggestion} key={contact.id}>
                    <input type="checkbox" checked={selectedContactIds.has(contact.id)} onChange={() => toggleContact(contact.id)} />
                    <span>
                      <span className={styles.copyRecipient}>
                        <strong>{contact.name}</strong>
                        {contact.linkedinUrl ? (
                          <a href={contact.linkedinUrl} target="_blank" rel="noreferrer" className={styles.seeProfileBtn}>LI Profile{EXTERNAL_LINK_ICON}</a>
                        ) : null}
                      </span>
                      <em>{contact.title} &middot; {humanizeContactType(contact.contactType)}</em>
                      <b>{confidenceStars(contact.confidence)} &middot; {contact.confidence} confidence</b>
                      <small>{contact.roleConnection || contact.relevanceReason}</small>
                      {contact.verificationNotes.length > 0 ? <small>{contact.verificationNotes.join(" ")}</small> : null}
                    </span>
                  </label>
                ))}
                {providerUnavailable ? (
                  <button type="button" className={styles.modalBtnClose} onClick={retryContacts} disabled={busy}>Try again</button>
                ) : null}
              </div>
            ) : null}

            {mode === "stepper" && step === 3 ? (
              <div className={styles.modalStack}>
                {messages.length === 0 ? (
                  busy ? (
                    <section>
                      <div className={styles.contactsLoading}>
                        <div className={styles.progressLine}><span className={styles.progressDot} />Writing your message&hellip;</div>
                        <div className={styles.skeletonCard}><span className={`${styles.skeletonBar} ${styles.w60}`} /><span className={`${styles.skeletonBar} ${styles.w40}`} /><span className={`${styles.skeletonBar} ${styles.w80}`} /></div>
                        <div className={styles.skeletonCard}><span className={`${styles.skeletonBar} ${styles.w50}`} /><span className={`${styles.skeletonBar} ${styles.w35}`} /><span className={`${styles.skeletonBar} ${styles.w80}`} /></div>
                      </div>
                    </section>
                  ) : <section><p className={styles.dsStateLabel}>No drafts yet.</p></section>
                ) : messages.map((message) => {
                  const recipient = contacts.find((contact) => contact.id === message.contactSuggestionId);
                  const regenerated = (message.regenerationCount ?? 0) > 0;
                  return (
                    <section key={message.id}>
                      {regeneratingId === message.id ? (
                        <div className={styles.contactsLoading}>
                          <div className={styles.progressLine}><span className={styles.progressDot} />Writing your message&hellip;</div>
                          <div className={styles.skeletonCard}><span className={`${styles.skeletonBar} ${styles.w60}`} /><span className={`${styles.skeletonBar} ${styles.w40}`} /><span className={`${styles.skeletonBar} ${styles.w80}`} /></div>
                          <div className={styles.skeletonCard}><span className={`${styles.skeletonBar} ${styles.w50}`} /><span className={`${styles.skeletonBar} ${styles.w35}`} /><span className={`${styles.skeletonBar} ${styles.w80}`} /></div>
                        </div>
                      ) : (
                        <>
                          <div className={styles.copyHeader}>
                            <span className={styles.copyRecipient}>
                              <strong>{recipient?.name ?? "Draft"}</strong>
                              {recipient?.linkedinUrl ? (
                                <a href={recipient.linkedinUrl} target="_blank" rel="noreferrer" className={styles.seeProfileBtn}>LI Profile{EXTERNAL_LINK_ICON}</a>
                              ) : null}
                            </span>
                            <div className={styles.copyActions}>
                              <WizardCopyButton key={`${message.id}:${message.regenerationCount ?? 0}`} text={message.message} onCopied={() => recordMessageCopy(message.id)} />
                              <span className={styles.tipWrap} data-tip={regenerated ? "re-generations used" : "1 re-generation per message"}>
                                <button type="button" className={`${styles.modalBtnSave} ${styles.generateMessageBtn}`} onClick={() => regenerateOutreach(message)} disabled={busy || regenerated}>Regenerate</button>
                              </span>
                            </div>
                          </div>
                          <AutosizeTextarea value={message.message} />
                          <div className={styles.msgTrigger}>
                            <button type="button" className={styles.linkNotMatch} onClick={(event) => openMessageFeedback(message, event.currentTarget)} aria-expanded={feedbackTarget?.id === message.id} aria-controls="wizard-message-feedback">This message is not great</button>
                            {ackedMessageId === message.id ? (
                              <span className={styles.savedAck} role="status" aria-live="polite">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>Noted
                              </span>
                            ) : null}
                          </div>
                        </>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : null}

            {step === 4 ? trackStep : null}
          </>
        )}
        {footer}
      </div>
      <div
        ref={fbBackRef}
        id="wizard-message-feedback"
        className={`${styles.modalBox} ${styles.flipFace} ${styles.flipBack}`}
        role="group"
        aria-labelledby="wizard-msg-fb-title"
        aria-hidden={!feedbackOpen}
      >
        {messageFeedbackFace}
      </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readPublicProfileAccessToken } from "@/lib/public-profile/browser-session";
import { syncPublicProfileSession } from "@/lib/public-auth/supabase-browser";
import { PublicProfileApiError, requestPublicProfileApi } from "@/lib/public-profile/client";
import SiteHeader from "../components/SiteHeader";
import ApplyWizardModal from "../dashboard/ApplyWizardModal";
import styles from "./saved-pursuits.module.css";

type PursuitBucket = "saved_for_later" | "applied";
type TrackingAction =
  | "outreach_sent"
  | "applied_online"
  | "response_received"
  | "interviewing"
  | "not_moving_forward"
  | "never_heard_back";
type TrackingState = Record<TrackingAction, boolean>;

type SavedPursuitItem = {
  id: string;
  bucket: PursuitBucket;
  posting: {
    title: string | null;
    companyName: string | null;
    location: string | null;
    compensation: string | null;
    sourceUrl: string | null;
    sourceState: "user_owned" | "shared" | null;
    availability: "available" | "snapshot_only" | "unavailable";
  };
  savedContext: { selectedContactCount: number; messageCount: number };
  tracking: TrackingState;
  createdAt: string;
  lastActivityAt: string;
};

type SavedPursuitsResponse = {
  status: string;
  counts: { savedForLater: number; applied: number };
  savedForLater: SavedPursuitItem[];
  applied: SavedPursuitItem[];
};

type ViewState =
  | { status: "loading" }
  | { status: "ready"; data: SavedPursuitsResponse }
  | { status: "error"; message: string };

// Positive actions carry the check mark; the two negative outcomes render as a muted chip
// with no check (design-system/patterns/saved-pursuits-page.html · trackChip.isNeg).
const CHIP_ORDER: { action: TrackingAction; label: string; negative?: boolean }[] = [
  { action: "outreach_sent", label: "Sent message" },
  { action: "applied_online", label: "Applied" },
  { action: "response_received", label: "Response" },
  { action: "interviewing", label: "Interviewing" },
  { action: "not_moving_forward", label: "Not moving forward", negative: true },
  { action: "never_heard_back", label: "Never heard back", negative: true },
];

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function metaText(posting: SavedPursuitItem["posting"]): string {
  return [posting.compensation ?? "Compensation not listed", posting.location]
    .filter(Boolean)
    .join(" · ");
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function SavedPursuitsClient() {
  const router = useRouter();
  const [view, setView] = useState<ViewState>({ status: "loading" });
  const [bucket, setBucket] = useState<PursuitBucket>("saved_for_later");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [openPursuitId, setOpenPursuitId] = useState<string | null>(null);

  // `load` opens with the async session read so no state is set synchronously; the view seeds
  // as "loading" already. Manual triggers use `reload`, which resets to loading first.
  const load = useCallback(async () => {
    const accessToken = (await syncPublicProfileSession()) || readPublicProfileAccessToken();
    if (!accessToken) {
      router.replace("/onboarding");
      return;
    }
    setAccessToken(accessToken);
    try {
      const data = await requestPublicProfileApi<SavedPursuitsResponse>(
        "/api/public-profile/saved-pursuits",
        { method: "GET", accessToken },
      );
      setView({ status: "ready", data });
    } catch (error) {
      if (error instanceof PublicProfileApiError && error.status === 401) {
        router.replace("/onboarding");
        return;
      }
      setView({ status: "error", message: "load-failed" });
    }
  }, [router]);

  const reload = useCallback(() => {
    setView({ status: "loading" });
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => { await load(); })();
  }, [load]);

  // Resume / Open tracking opens the pursuit in the Apply Wizard by pursuitId: Applied opens
  // straight into Track behind an appliedBar (generation-free), Saved-for-later resumes on the
  // stepper's Track step. Closing reloads the list so a tracked pursuit moves Saved → Applied.
  const openPursuit = useCallback((pursuitId: string) => {
    setOpenPursuitId(pursuitId);
  }, []);

  const closeWizard = useCallback(() => {
    setOpenPursuitId(null);
    reload();
  }, [reload]);

  const counts = view.status === "ready"
    ? view.data.counts
    : { savedForLater: 0, applied: 0 };
  const items = view.status === "ready"
    ? (bucket === "saved_for_later" ? view.data.savedForLater : view.data.applied)
    : [];

  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <header className={styles.topBar}>
          <h1 className={styles.topTitle}>Saved Pursuits</h1>
          <p className={styles.topLede}>
            Everything you have saved or started, in one place. Switch between Saved for later
            (unstarted and in progress) and Applied (anything you have tracked).
          </p>
        </header>

        <section className={styles.savedShell}>
          <div
            className={styles.bucketToggle}
            role="tablist"
            aria-label="Choose bucket"
            aria-busy={view.status === "loading" ? true : undefined}
          >
            <button
              type="button"
              role="tab"
              aria-selected={bucket === "saved_for_later"}
              onClick={() => setBucket("saved_for_later")}
            >
              Saved for later
              {view.status === "ready" ? <span className={styles.tCount}>{counts.savedForLater}</span> : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={bucket === "applied"}
              onClick={() => setBucket("applied")}
            >
              Applied
              {view.status === "ready" ? <span className={styles.tCount}>{counts.applied}</span> : null}
            </button>
          </div>

          {view.status === "loading" ? (
            <div className={styles.pursuitList} aria-hidden="true">
              {[["w70", "w45", "w30"], ["w45", "w70", "w30"], ["w70", "w30", "w45"]].map((bars, index) => (
                <div className={styles.skelCard} key={index}>
                  {bars.map((width, barIndex) => (
                    <span className={`${styles.skelBar} ${styles[width]}`} key={barIndex} />
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          {view.status === "error" ? (
            <div className={styles.bucketError} role="alert">
              <p>
                <strong>We could not load your pursuits.</strong> Nothing was lost. Check your
                connection and try again.
              </p>
              <button type="button" className={styles.retryBtn} onClick={reload}>Retry</button>
            </div>
          ) : null}

          {view.status === "ready" ? (
            <>
              <div className={styles.bucketSubHead}>
                <span className={styles.bucketSubTitle}>
                  {bucket === "saved_for_later" ? "Saved for later" : "Applied"}
                </span>
                <span className={styles.bucketSort}>Latest activity</span>
              </div>

              {items.length === 0 ? (
                <div className={styles.bucketEmpty}>
                  <strong>{bucket === "saved_for_later" ? "Nothing saved yet" : "Nothing applied yet"}</strong>
                  <p>
                    {bucket === "saved_for_later"
                      ? "Save a match or paste a posting link from your dashboard, and it lands here."
                      : "Track a pursuit and it moves here. Sending a message or marking a step promotes it to Applied."}
                  </p>
                  <Link href="/dashboard" className={styles.emptyCta}>Go to dashboard</Link>
                </div>
              ) : (
                <div className={styles.pursuitList}>
                  {items.map((item) => (
                    <PursuitCard key={item.id} item={item} onOpen={() => openPursuit(item.id)} />
                  ))}
                </div>
              )}
            </>
          ) : null}
        </section>
      </main>
      {openPursuitId && accessToken ? (
        <ApplyWizardModal
          target={{ kind: "pursuit", pursuitId: openPursuitId }}
          accessToken={accessToken}
          onClose={closeWizard}
        />
      ) : null}
    </>
  );
}

function PursuitCard({ item, onOpen }: { item: SavedPursuitItem; onOpen: () => void }) {
  const { posting, tracking, savedContext } = item;
  const applied = item.bucket === "applied";
  const unavailable = posting.availability !== "available";
  const pasted = posting.sourceState === "user_owned" && !unavailable;
  const canOpenPosting = Boolean(posting.sourceUrl) && !unavailable;

  const activeChips = CHIP_ORDER.filter((chip) => tracking[chip.action]);
  const hasWork = savedContext.messageCount > 0 || savedContext.selectedContactCount > 0;

  const savedHintText = (() => {
    if (savedContext.messageCount > 0 && savedContext.selectedContactCount > 0) {
      return `Draft message and ${savedContext.selectedContactCount} contact${savedContext.selectedContactCount === 1 ? "" : "s"} ready`;
    }
    if (savedContext.messageCount > 0) return "Draft message ready";
    if (savedContext.selectedContactCount > 0) {
      return `${savedContext.selectedContactCount} contact${savedContext.selectedContactCount === 1 ? "" : "s"} ready`;
    }
    return "Saved posting, not started";
  })();

  const stamp = applied
    ? `Last activity ${formatDay(item.lastActivityAt)}`
    : `${hasWork ? "Updated" : "Saved"} ${formatDay(item.lastActivityAt)}`;

  return (
    <article className={`${styles.pursuitCard} ${unavailable ? styles.isDim : ""}`.trim()}>
      <h3 className={styles.pursuitTitle}>
        {posting.title ?? "Saved posting"}
        {posting.companyName ? (
          <>
            <span className={styles.titleDivider} aria-hidden="true" />
            <span className={styles.companyName}>{posting.companyName}</span>
          </>
        ) : null}
      </h3>
      <p className={styles.pursuitMeta}>{metaText(posting)}</p>

      {applied ? (
        activeChips.length > 0 ? (
          <div className={styles.trackChips}>
            {activeChips.map((chip) => (
              <span key={chip.action} className={`${styles.trackChip} ${chip.negative ? styles.isNeg : ""}`.trim()}>
                {chip.negative ? null : <CheckIcon />}
                {chip.label}
              </span>
            ))}
          </div>
        ) : null
      ) : (
        <span className={`${styles.savedHint} ${hasWork ? "" : styles.isNone}`.trim()}>
          <span className={styles.dot} />
          {savedHintText}
        </span>
      )}

      {(pasted || unavailable) ? (
        <div className={styles.flagRow2}>
          {pasted ? <span className={`${styles.pursuitFlag} ${styles.isPasted}`}>Pasted posting</span> : null}
          {unavailable ? <span className={styles.pursuitFlag}>No longer listed</span> : null}
        </div>
      ) : null}

      <div className={styles.pursuitFoot}>
        <span className={styles.pursuitStamp}>{stamp}</span>
        <div className={styles.pursuitActions}>
          {canOpenPosting ? (
            <a href={posting.sourceUrl!} className={styles.btnQuiet} target="_blank" rel="noreferrer">Open posting ↗</a>
          ) : (
            <button type="button" className={styles.btnQuiet} disabled>Posting closed</button>
          )}
          <button type="button" className={styles.btnOpen} onClick={onOpen}>
            {applied ? "Open tracking" : "Resume"}
          </button>
        </div>
      </div>
    </article>
  );
}

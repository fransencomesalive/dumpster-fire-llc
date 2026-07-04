"use client";

import { useEffect, useRef, useState } from "react";
import { readPublicProfileAccessToken } from "@/lib/public-profile/browser-session";
import styles from "./QAFeedbackWidget.module.css";

const DRAFT_KEY = "dumpster-fire-qa-feedback-draft";
const MESSAGE_MAX = 5000;
const CONTACT_MAX = 320;

type SubmitStatus = "idle" | "sending" | "sent" | "error";

function detectDevice() {
  if (typeof window === "undefined") return "desktop";
  if (window.innerWidth < 768) return "mobile";
  if (window.innerWidth < 1024) return "tablet";
  return "desktop";
}

export default function QAFeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    };
  }, []);

  function restoreDraft() {
    try {
      const draft = window.localStorage.getItem(DRAFT_KEY);
      if (draft) setMessage((prev) => (prev.length > 0 ? prev : draft.slice(0, MESSAGE_MAX)));
    } catch {
      // localStorage unavailable; drafts just don't persist
    }
  }

  function updateMessage(next: string) {
    const trimmed = next.slice(0, MESSAGE_MAX);
    setMessage(trimmed);
    if (status !== "sending") setStatus("idle");
    try {
      if (trimmed.length > 0) {
        window.localStorage.setItem(DRAFT_KEY, trimmed);
      } else {
        window.localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      // ignore
    }
  }

  async function submit() {
    const trimmed = message.trim();
    if (trimmed.length === 0 || status === "sending") return;
    setStatus("sending");

    let ok = false;
    try {
      const response = await fetch("/api/qa-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_message: trimmed,
          user_contact: contact.trim().slice(0, CONTACT_MAX) || undefined,
          system_context: {
            url: window.location.href,
            browser: navigator.userAgent,
            device: detectDevice(),
            signed_in: Boolean(readPublicProfileAccessToken()),
          },
        }),
      });
      const result = (await response.json()) as { ok?: boolean };
      ok = response.ok && result.ok === true;
    } catch {
      ok = false;
    }

    if (!ok) {
      setStatus("error");
      return;
    }

    setStatus("sent");
    setMessage("");
    setContact("");
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    collapseTimer.current = setTimeout(() => {
      setOpen(false);
      setStatus("idle");
    }, 2000);
  }

  return (
    <div className={styles.root}>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="Leave feedback">
          <div className={styles.header}>
            <span>Something broken? Tell us</span>
            {status === "sent" && <small>Feedback saved</small>}
          </div>
          <label className={styles.field}>
            <span>What happened?</span>
            <textarea
              value={message}
              maxLength={MESSAGE_MAX}
              rows={3}
              placeholder="What broke, what looked off, what you expected."
              disabled={status === "sending"}
              onChange={(event) => updateMessage(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>Email for updates (optional)</span>
            <input
              type="email"
              value={contact}
              maxLength={CONTACT_MAX}
              placeholder="you@example.com"
              disabled={status === "sending"}
              onChange={(event) => setContact(event.target.value)}
            />
          </label>
          {status === "error" && (
            <p className={styles.errorNote}>Couldn&apos;t send right now. Try again later.</p>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.submit}
              disabled={status === "sending" || message.trim().length === 0}
              onClick={() => void submit()}
            >
              {status === "sending" ? "Sending…" : "Send feedback"}
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        className={`${styles.dockBtn}${open ? ` ${styles.dockBtnOpen}` : ""}`}
        aria-expanded={open}
        aria-label="Feedback & bug reports"
        onClick={() => {
          if (!open) restoreDraft();
          setOpen((prev) => !prev);
          if (status !== "sending") setStatus("idle");
        }}
      >
        <span className={styles.dockIcon} aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
            <line x1="9" y1="10" x2="15" y2="10" />
            <line x1="9" y1="13.5" x2="13" y2="13.5" />
          </svg>
        </span>
        <span className={styles.dockLabel}>Feedback &amp; Bug Reports</span>
      </button>
    </div>
  );
}

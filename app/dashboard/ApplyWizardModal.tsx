"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PublicProfileApiError, requestPublicProfileApi } from "@/lib/public-profile/client";
import type { PublicJobRecord } from "@/lib/public-jobs/types";
import type { MatchResult } from "@/lib/public-profile/matching/types";
import type {
  HumanPathContactSuggestion,
  OutreachMessageRecord,
  Pursuit,
} from "@/lib/public-profile/pursuits/types";
import styles from "./apply-wizard.module.css";

// The Human Path apply wizard: Review → Contacts → Outreach → Track. Markup + CSS are ported
// 1:1 from the approved DS card (design-system/components/apply-wizard.html); the wiring drives
// the already-built public pursuit backend, re-reading the pursuit after each step.

type WizardStep = 1 | 2 | 3 | 4;
const STEP_LABELS: Record<WizardStep, string> = { 1: "Review", 2: "Contacts", 3: "Outreach", 4: "Track" };

// The legacy free-text checklist has no public analog; each item maps to one real status
// transition reachable from an outreach-ready pursuit.
const TRACK_ACTIONS: { action: string; label: string }[] = [
  { action: "outreach_sent", label: "Sent outreach message" },
  { action: "applied", label: "Applied online" },
  { action: "responded", label: "They responded" },
  { action: "interviewing", label: "Interviewing" },
  { action: "offer", label: "Got an offer" },
  { action: "rejected", label: "Not moving forward" },
];

type RoleTrackOption = { id: string; name: string };
type CreateResponse = { status: string; job: PublicJobRecord; match: MatchResult; pursuit: Pursuit };
type RoleTracksResponse = { status: string; section: { roleTracks: RoleTrackOption[] } };
type PursuitReadResponse = {
  status: string;
  pursuit: Pursuit;
  job: PublicJobRecord | null;
  contacts: HumanPathContactSuggestion[];
  outreachMessages: OutreachMessageRecord[];
};

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

function confidenceStars(confidence: HumanPathContactSuggestion["confidence"]): string {
  const filled = confidence === "high" ? 4 : confidence === "medium" ? 3 : 2;
  return "★".repeat(filled) + "☆".repeat(5 - filled);
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
  job: initialJob,
  accessToken,
  onClose,
  onPursuitChanged,
}: {
  job: PublicJobRecord;
  accessToken: string;
  onClose: () => void;
  onPursuitChanged?: (message: string) => void;
}) {
  const [step, setStep] = useState<WizardStep>(1);
  const [pursuitId, setPursuitId] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [job, setJob] = useState<PublicJobRecord>(initialJob);
  const [roleTracks, setRoleTracks] = useState<RoleTrackOption[]>([]);
  const [selectedRoleTrackId, setSelectedRoleTrackId] = useState<string | null>(null);
  const [recommendedRoleTrackId, setRecommendedRoleTrackId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<HumanPathContactSuggestion[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const [messages, setMessages] = useState<OutreachMessageRecord[]>([]);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [trackAction, setTrackAction] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const api = useCallback(
    <T,>(path: string, method: string, body?: unknown) =>
      requestPublicProfileApi<T>(path, { method, accessToken, body }),
    [accessToken],
  );

  const readPursuit = useCallback(
    async (id: string) => {
      const data = await api<PursuitReadResponse>(`/api/public-profile/pursuits/${id}`, "GET");
      if (data.job) setJob(data.job);
      setContacts(data.contacts);
      setMessages(data.outreachMessages);
      return data;
    },
    [api],
  );

  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    (async () => {
      try {
        const [created, tracks] = await Promise.all([
          api<CreateResponse>("/api/public-profile/pursuits", "POST", { jobId: initialJob.id }),
          api<RoleTracksResponse>("/api/public-profile/role-tracks", "GET").catch(() => null),
        ]);
        setPursuitId(created.pursuit.id);
        setMatch(created.match);
        setJob(created.job);
        const recommended = created.match.recommendations.roleTrack?.roleTrack.id ?? null;
        setRecommendedRoleTrackId(recommended);
        const trackList = tracks?.section.roleTracks ?? [];
        setRoleTracks(trackList);
        setSelectedRoleTrackId(recommended ?? trackList[0]?.id ?? null);
      } catch (err) {
        setInitError(errorMessage(err, "Could not start this pursuit."));
      }
    })();
  }, [api, initialJob.id]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err, "Something went wrong. Try again."));
    } finally {
      setBusy(false);
    }
  }

  function submitReview() {
    if (!pursuitId) return;
    run(async () => {
      await api(`/api/public-profile/pursuits/review`, "POST", {
        pursuitId,
        selectedRoleTrackId: selectedRoleTrackId ?? undefined,
      });
      setStep(2);
      await discoverContacts(pursuitId);
    });
  }

  async function discoverContacts(id: string) {
    setProviderUnavailable(false);
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
    const contactIds = [...selectedContactIds];
    if (contactIds.length === 0) {
      setError("Select at least one contact to continue.");
      return;
    }
    run(async () => {
      await api(`/api/public-profile/pursuits/contacts`, "POST", { pursuitId, contactIds });
      setStep(3);
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

  function copyDraft(message: OutreachMessageRecord) {
    void navigator.clipboard?.writeText(message.message);
  }

  function saveTracking() {
    if (!pursuitId || !trackAction) {
      onClose();
      return;
    }
    run(async () => {
      await api(`/api/public-profile/pursuits/status`, "POST", { pursuitId, action: trackAction });
      onPursuitChanged?.(`Pursuit updated for ${job.title}.`);
      onClose();
    });
  }

  const jobMetaLine = [job.companyName, job.compensationText, job.location, job.remoteType].filter(Boolean).join(" · ");

  const closeButton = (
    <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );

  const stepper = (
    <div className={styles.wizardSteps} aria-label="Human Path steps">
      {([1, 2, 3, 4] as WizardStep[]).map((n) => (
        <button
          type="button"
          key={n}
          className={`${styles.wizardStep} ${n === step ? styles.wizardStepActive : ""}`}
          onClick={() => { if (n < step) setStep(n); }}
        >
          <span>{n}</span>{STEP_LABELS[n]}
        </button>
      ))}
    </div>
  );

  const footer = (
    <div className={styles.modalFooter}>
      <a href={job.sourceUrl} target="_blank" rel="noreferrer" className={`${styles.modalBtnClose} ${styles.footerSpacer}`}>Open job posting</a>
      {step > 1 ? (
        <button type="button" className={styles.modalBtnClose} onClick={() => setStep((s) => (s - 1) as WizardStep)} disabled={busy}>Back</button>
      ) : null}
      {step === 1 ? (
        <button type="button" className={styles.modalBtnSave} onClick={submitReview} disabled={busy}>Continue</button>
      ) : step === 2 ? (
        <button type="button" className={styles.modalBtnSave} onClick={submitContacts} disabled={busy || providerUnavailable}>Continue</button>
      ) : step === 3 ? (
        <button type="button" className={styles.modalBtnSave} onClick={() => setStep(4)} disabled={busy}>Continue</button>
      ) : (
        <button type="button" className={`${styles.modalBtnSave} ${styles.modalBtnSaveOn}`} onClick={saveTracking} disabled={busy}>Save pursuit</button>
      )}
    </div>
  );

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label={`Human Path: ${job.title}`}>
      <div className={styles.modalBox}>
        <div className={styles.modalHeader}>
          <h4 className={styles.modalTitle}>Human Path: {job.title}</h4>
          {closeButton}
        </div>
        {stepper}

        {initError ? (
          <div className={styles.modalStack}>
            <section><strong>Can&apos;t start this pursuit</strong><p>{initError}</p></section>
          </div>
        ) : !pursuitId ? (
          <div className={styles.modalStack}>
            <section><p className={styles.dsStateLabel}>Setting up your Human Path&hellip;</p></section>
          </div>
        ) : (
          <>
            {step === 1 && match ? (
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
                        <span>{track.name}{track.id === recommendedRoleTrackId ? " recommended" : ""}</span>
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

            {step === 2 ? (
              <div className={styles.modalStack}>
                <section>
                  <strong>Human Path</strong>
                  <p>The reporting chain is built automatically when you pursue this role: owning function, manager, functional leader, then recruiter.</p>
                  {providerUnavailable ? (
                    <p className={styles.formNotice}>Contact discovery is unavailable right now. Try again in a moment.</p>
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
                      <strong>{contact.name}</strong>
                      <em>{contact.title} &middot; {humanizeContactType(contact.contactType)}</em>
                      <b>{confidenceStars(contact.confidence)} &middot; {contact.confidence} confidence</b>
                      <small>{contact.roleConnection || contact.relevanceReason}</small>
                      {contact.verificationNotes.length > 0 ? <small>{contact.verificationNotes.join(" ")}</small> : null}
                      {contact.linkedinUrl ? (
                        <span className={styles.contactLinks}><a href={contact.linkedinUrl} target="_blank" rel="noreferrer" className={styles.seeProfileBtn}>See LI Profile</a></span>
                      ) : null}
                    </span>
                  </label>
                ))}
                {providerUnavailable ? (
                  <button type="button" className={styles.modalBtnClose} onClick={retryContacts} disabled={busy}>Try again</button>
                ) : null}
              </div>
            ) : null}

            {step === 3 ? (
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
                ) : messages.map((message) => (
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
                          <strong>{contacts.find((contact) => contact.id === message.contactSuggestionId)?.name ?? "Draft"}</strong>
                          <div className={styles.copyActions}>
                            <button type="button" className={styles.copyButton} onClick={() => copyDraft(message)}>Copy</button>
                            {(message.regenerationCount ?? 0) === 0 ? (
                              <button type="button" className={`${styles.modalBtnSave} ${styles.generateMessageBtn}`} onClick={() => regenerateOutreach(message)} disabled={busy}>Regenerate once</button>
                            ) : null}
                          </div>
                        </div>
                        <textarea className={styles.messageTextarea} value={message.message} readOnly />
                      </>
                    )}
                  </section>
                ))}
              </div>
            ) : null}

            {step === 4 ? (
              <div className={styles.modalStack}>
                <section>
                  <strong>Pursuit tracking</strong>
                  <p>Check what happened. Saving moves the role into the right pipeline state.</p>
                </section>
                <div className={styles.checklistGrid}>
                  {TRACK_ACTIONS.map((item) => (
                    <label key={item.action}>
                      <input
                        type="checkbox"
                        checked={trackAction === item.action}
                        onChange={() => setTrackAction((prev) => (prev === item.action ? null : item.action))}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {error ? <p className={styles.errorNote}>{error}</p> : null}
          </>
        )}
        {footer}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { applyModeOptions, getApplyModeOption, recommendApplyMode } from "./apply-modes";
import { buildFallbackApplyCopy } from "./apply-copy";
import EditButton from "./EditButton";
import mascotImg from "./dumpsterfireguy.png";
import loadingGif from "./DF-small.gif";
import styles from "./scans.module.css";
import { buildConnectorPlan } from "./connectors";
import { randallPrivateMatchingConfig } from "./matching";
import { connectedSearchSources } from "./search-sources";
import { groupedScanLogsForDisplay } from "./scan-log-display";
import { extractJobSections } from "./near-miss-review";
import type { ConnectorFetchPreview, ConnectorPlan } from "./connectors";
import type { CompiledSearchProfile, ProfileCompilerPreferences } from "./profile-compiler";
import type { CompanyCreate, CompanyUpdate, DashboardState, MatchFeedbackCreate, SearchProfileUpdate, SettingsUpdate } from "./store";
import type { ApplyCopyDraft, ApplyMode, ApplyWizardSubmission, Company, CompanyStatus, ContactSuggestion, DashboardSettings, Job, JobMatchFeedback, JobStatus, ScanCadence, ScanLog, SourceProvider, UserSearchProfile } from "./types";

type ActionError = {
  message: string;
};

type ActiveMatchingSummary = {
  source: "compiled_profile" | "fallback_private";
  rulesVersion: string;
};

type OnboardingProfilePayload = {
  resumeText: string;
  profileText: string;
  preferences: ProfileCompilerPreferences;
};

type OnboardingProfileResult = {
  compiledProfile: CompiledSearchProfile;
  dashboardState?: DashboardState;
  persistence?: "supabase" | "memory";
  writesEnabled?: boolean;
};

type ConnectorApplySummary = {
  inserted: number;
  updated: number;
  closed: number;
};

type ConnectorBatchPlan = {
  plans: ConnectorPlan[];
  ready: number;
  blocked: number;
};

type ConnectorBatchFetchResult = {
  companyId: string;
  companyName: string;
  provider: string;
  status: "ready" | "applied" | "blocked" | "error";
  warnings: string[];
  totalFetched: number;
  totalRelevant: number;
  filteredOut: number;
  duplicatesFiltered?: number;
  newJobs: number;
  existingJobs: number;
  missingExistingJobs: number;
  inserted?: number;
  updated?: number;
  closed?: number;
};

type ConnectorBatchApplyResult = {
  companyId: string;
  companyName: string;
  provider: string;
  status: "applied" | "blocked" | "error";
  warnings: string[];
  totalFetched?: number;
  totalRelevant?: number;
  filteredOut?: number;
  duplicatesFiltered?: number;
  inserted: number;
  updated: number;
  closed: number;
};

type ScheduledScanPreview = {
  skipped: boolean;
  reason?: string;
  message?: string;
  mode?: string;
  cadence?: string;
  checkedCompanies?: number;
  ready?: number;
  blocked?: number;
  errors?: number;
  totalFetched?: number;
  totalRelevant?: number;
  filteredOut?: number;
  newJobs?: number;
  existingJobs?: number;
  inserted?: number;
  updated?: number;
  closed?: number;
  results?: ConnectorBatchFetchResult[];
};

type ScanProgressItem = {
  id: string;
  label: string;
  status: "fetched" | "blocked" | "error";
  jobs: number;
};

type ScanProgress = {
  total: number;
  done: number;
  roles: number;
  phase: "fetching" | "matching" | "saving" | "done" | "error";
  items: ScanProgressItem[];
  fit?: number;
  message?: string;
};

type ScanSummaryPayload = {
  results?: ConnectorBatchFetchResult[];
  dashboardState?: DashboardState;
  applied?: number;
  blocked?: number;
  errors?: number;
};

type ScanStreamEvent =
  | { type: "start"; total: number }
  | { type: "source"; id: string; label: string; status: ScanProgressItem["status"]; jobs: number }
  | { type: "phase"; phase: "matching" | "saving" }
  | ({ type: "summary" } & ScanSummaryPayload)
  | { type: "error"; message?: string };

type CompanyImportSummary = {
  requested: number;
  imported: number;
  created: number;
  updated: number;
  skipped: number;
};

type ConnectorPreviewMode = "fetch" | "payload";

const statusLabels: Partial<Record<JobStatus, string>> = {
  reviewed: "Reviewed",
  saved: "Saved",
  applied: "Applied",
  messaged: "Messaged",
  skipped: "Skipped",
};

function matchingSourceLabel(source: ActiveMatchingSummary["source"]) {
  return source === "compiled_profile" ? "Compiled profile" : "Private fallback";
}

function matchingRulesLabel(rulesVersion: string) {
  if (rulesVersion.includes("profile-evidence")) return "Profile evidence";
  if (rulesVersion.includes("compiled-profile")) return "Compiled profile";
  return rulesVersion;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSalary(min?: number, max?: number, salaryText?: string) {
  if (salaryText) return salaryText;
  if (!min && !max) return "No comp signal";
  if (min && max) return `$${Math.round(min / 1000)}k-$${Math.round(max / 1000)}k`;
  return `$${Math.round((min ?? max ?? 0) / 1000)}k+`;
}

function excerptText(value: string, maxLength = 360) {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) return compacted;
  return `${compacted.slice(0, maxLength).replace(/\s+\S*$/, "")}…`;
}

function jobBoardTypeLabel(provider: SourceProvider) {
  const labels: Record<SourceProvider, string> = {
    greenhouse: "Greenhouse board",
    lever: "Lever board",
    ashby: "Ashby board",
    icims: "iCIMS board",
    workday: "Workday board",
    magnit: "Magnit board",
    html: "Careers page",
  };

  return labels[provider];
}

function actionSummary(action: ApplyWizardSubmission) {
  if (action.completedActions.length > 0) return action.completedActions.slice(0, 3).join(" · ");
  if (action.generatedMessages.length > 0) return `${action.generatedMessages.length} outreach draft${action.generatedMessages.length !== 1 ? "s" : ""} prepared`;
  if (action.coverLetterText || action.resumeNotesText) return "Application workspace saved";
  return "Reviewed in apply wizard";
}

function actionStats(action: ApplyWizardSubmission) {
  const stats = [];
  if (action.selectedContactIds.length > 0) stats.push(`${action.selectedContactIds.length} contact${action.selectedContactIds.length !== 1 ? "s" : ""}`);
  if (action.generatedMessages.length > 0) stats.push(`${action.generatedMessages.length} draft${action.generatedMessages.length !== 1 ? "s" : ""}`);
  if (action.coverLetterText) stats.push("application note");
  if (action.resumeNotesText) stats.push("resume notes");
  return stats.join(" · ");
}

function StarRating({ score }: { score: number }) {
  const filled = Math.min(5, Math.max(0, Math.round(score / 20)));
  return (
    <div className={styles.stars} title={`${score}/100`} aria-label={`Fit filter rating: ${filled} out of 5`}>
      <span className={styles.starLabel}>Fit filter</span>
      <span className={styles.starIconRow}>
        {Array.from({ length: 5 }, (_, index) => (
          <svg
            key={index}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill={index < filled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={index < filled ? styles.starFilled : styles.starEmpty}
            aria-hidden="true"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        ))}
      </span>
    </div>
  );
}

function sourceLabelFromJob(job: Job) {
  try {
    const host = new URL(job.sourceUrl).hostname.replace(/^www\./, "");
    if (host.includes("himalayas.app")) return "Himalayas";
    if (host.includes("ashbyhq.com")) return "Ashby";
    if (host.includes("greenhouse.io")) return "Greenhouse";
    if (host.includes("lever.co")) return "Lever";
    if (host.includes("workdayjobs.com")) return "Workday";
    if (host.includes("adzuna.com")) return "Adzuna";
    return host.split(".")[0] || job.sourceProvider;
  } catch {
    return job.sourceProvider;
  }
}

function remoteLabel(remoteType: Job["remoteType"]) {
  if (remoteType === "remote") return "yes";
  if (remoteType === "onsite") return "no";
  if (remoteType === "hybrid") return "hybrid";
  return "not defined";
}

function visibleRiskFlags(job: Job) {
  return job.riskFlags.filter((risk) => {
    const normalized = risk.toLowerCase();
    return !normalized.includes("remote status unclear") && !normalized.includes("unclear location");
  });
}

function ProgressLine({ label }: { label: string }) {
  return (
    <div className={styles.progressLine} role="status" aria-live="polite">
      <span className={styles.progressDot} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function StarBucketLabel({ rating }: { rating: number }) {
  return (
    <span className={styles.starBucketStars} aria-label={`${rating} star${rating !== 1 ? "s" : ""}`}>
      {Array.from({ length: 5 }, (_, index) => (
        <svg
          key={index}
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill={index < rating ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={index < rating ? styles.starFilled : styles.starEmpty}
          aria-hidden="true"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  );
}

function ratingStars(rating: number) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

function contactRoleLabel(contact: ContactSuggestion) {
  const connection = contact.roleConnection.toLowerCase();
  if (connection.startsWith("hiring manager")) return "Hiring Manager";
  if (connection.startsWith("functional leader")) return "Functional Leader";
  if (connection.startsWith("recruiter")) return "Recruiter";
  if (connection.startsWith("long shot")) return "Long Shot";
  if (contact.contactType === "hiring_manager") return "Hiring Manager";
  if (contact.contactType === "recruiter" || contact.contactType === "talent_partner") return "Recruiter";
  if (contact.confidenceScore < 55) return "Long Shot";
  return "Functional Leader";
}

function fallbackErrorForStatus(status: number, fallback: string) {
  if (status === 400) return "That request is missing required information. Check the fields and try again.";
  if (status === 401) return "Session expired. Reload and sign in again.";
  if (status === 404) return "That item was not found. Refresh the dashboard and try again.";
  if (status === 422) return "That source is not ready yet. Check the source setup and try again.";
  if (status >= 500) return "The server hit a problem. Try again in a minute; if it keeps happening, check the latest source or Supabase change.";
  return fallback;
}

async function readApiError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: unknown; detail?: unknown } | null;
  const message = typeof payload?.error === "string" ? payload.error : fallbackErrorForStatus(response.status, fallback);
  const detail = typeof payload?.detail === "string" ? payload.detail : "";
  return detail ? `${message} ${detail}` : message;
}

function useDashboardActions(initialState: DashboardState) {
  const [dashboardState, setDashboardState] = useState(initialState);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [pendingFeedbackJobId, setPendingFeedbackJobId] = useState<string | null>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [scheduledScanPreview, setScheduledScanPreview] = useState<ScheduledScanPreview | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [companyImportSummary, setCompanyImportSummary] = useState<CompanyImportSummary | null>(null);
  const [isScanning, startScanTransition] = useTransition();
  const [isUpdatingProfile, startProfileTransition] = useTransition();
  const [isCompilingProfile, startProfileCompileTransition] = useTransition();
  const [isUpdatingCompany, startCompanyTransition] = useTransition();
  const [isUpdatingSettings, startSettingsTransition] = useTransition();
  const [isPreviewingConnector, startConnectorPreviewTransition] = useTransition();
  const [isFetchingConnector, startConnectorFetchTransition] = useTransition();
  const [isApplyingConnector, startConnectorApplyTransition] = useTransition();
  const [isPreviewingPayload, startPayloadPreviewTransition] = useTransition();
  const [isPreviewingBatch, startBatchPreviewTransition] = useTransition();
  const [isFetchingBatch, startBatchFetchTransition] = useTransition();
  const [isApplyingBatch, startBatchApplyTransition] = useTransition();
  const [connectorPlan, setConnectorPlan] = useState<ConnectorPlan | null>(null);
  const [connectorFetchPreview, setConnectorFetchPreview] = useState<ConnectorFetchPreview | null>(null);
  const [connectorPreviewMode, setConnectorPreviewMode] = useState<ConnectorPreviewMode | null>(null);
  const [connectorApplySummary, setConnectorApplySummary] = useState<ConnectorApplySummary | null>(null);
  const [connectorBatchPlan, setConnectorBatchPlan] = useState<ConnectorBatchPlan | null>(null);
  const [connectorBatchFetchResults, setConnectorBatchFetchResults] = useState<ConnectorBatchFetchResult[] | null>(null);
  const [connectorBatchApplyResults, setConnectorBatchApplyResults] = useState<ConnectorBatchApplyResult[] | null>(null);

  async function updateStatus(jobId: string, status: JobStatus) {
    setPendingJobId(jobId);
    setError(null);

    try {
      const response = await fetch("/scans/api/dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, status }),
      });
      const nextState = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Session expired. Reload and sign in again.");
        }
        throw new Error(nextState.error ?? "Unable to update job.");
      }

      setDashboardState(nextState);
    } catch (actionError) {
      setError({ message: actionError instanceof Error ? actionError.message : "Unable to update job." });
    } finally {
      setPendingJobId(null);
    }
  }

  async function saveApplyWizard(submission: ApplyWizardSubmission): Promise<boolean> {
    setPendingJobId(submission.jobId);
    setError(null);

    try {
      const response = await fetch("/scans/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveApplyWizard", submission }),
      });
      const nextState = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Session expired. Reload and sign in again.");
        }
        throw new Error(nextState.error ?? "Unable to save apply actions.");
      }

      setDashboardState(nextState);
      return true;
    } catch (actionError) {
      setError({ message: actionError instanceof Error ? actionError.message : "Unable to save apply actions." });
      return false;
    } finally {
      setPendingJobId(null);
    }
  }

  async function saveFeedback(feedback: MatchFeedbackCreate): Promise<boolean> {
    setPendingFeedbackJobId(feedback.jobId);
    setError(null);

    try {
      const response = await fetch("/scans/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveMatchFeedback", feedback }),
      });
      const nextState = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Session expired. Reload and sign in again.");
        }
        throw new Error(nextState.error ?? "Unable to save match feedback.");
      }

      setDashboardState(nextState);
      return true;
    } catch (actionError) {
      setError({ message: actionError instanceof Error ? actionError.message : "Unable to save match feedback." });
      return false;
    } finally {
      setPendingFeedbackJobId(null);
    }
  }

  // Apply the final summary payload to dashboard state + the post-scan summary panel. Returns the
  // per-source results so the caller can derive feed totals. Shared by the stream and JSON paths.
  function applyScanSummary(summary: ScanSummaryPayload): ConnectorBatchFetchResult[] {
    const results = Array.isArray(summary.results) ? summary.results : [];
    if (summary.dashboardState) setDashboardState(summary.dashboardState);
    setScheduledScanPreview({
      skipped: false,
      message: "Scan complete. New matches were added to Today’s Best Matches.",
      mode: "manual",
      checkedCompanies: results.length,
      ready: summary.applied ?? results.filter((result) => result.status === "applied").length,
      blocked: summary.blocked ?? results.filter((result) => result.status === "blocked").length,
      errors: summary.errors ?? results.filter((result) => result.status === "error").length,
      totalFetched: results.reduce((total, result) => total + (result.totalFetched ?? 0), 0),
      totalRelevant: results.reduce((total, result) => total + (result.totalRelevant ?? 0), 0),
      filteredOut: results.reduce((total, result) => total + (result.filteredOut ?? 0), 0),
      newJobs: results.reduce((total, result) => total + (result.inserted ?? result.newJobs), 0),
      existingJobs: results.reduce((total, result) => total + (result.updated ?? result.existingJobs), 0),
      inserted: results.reduce((total, result) => total + (result.inserted ?? 0), 0),
      updated: results.reduce((total, result) => total + (result.updated ?? 0), 0),
      closed: results.reduce((total, result) => total + (result.closed ?? 0), 0),
      results,
    });
    return results;
  }

  function runScan() {
    setError(null);
    setScheduledScanPreview(null);
    setScanProgress({ total: 0, done: 0, roles: 0, phase: "fetching", items: [] });

    startScanTransition(async () => {
      try {
        const response = await fetch("/scans/api/connectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "batchScanApply" }),
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Session expired. Reload and sign in again.");
          }
          let message = "Unable to run scan.";
          try { message = (await response.json()).error ?? message; } catch { /* non-JSON error body */ }
          throw new Error(message);
        }

        const contentType = response.headers.get("content-type") ?? "";

        // Back-compat: if the route didn't stream (no body / not NDJSON), parse one JSON object.
        if (!response.body || !contentType.includes("ndjson")) {
          const summary = await response.json() as ScanSummaryPayload;
          const results = applyScanSummary(summary);
          setScanProgress((prev) => prev && { ...prev, phase: "done", fit: results.reduce((t, r) => t + (r.totalRelevant ?? 0), 0) });
          return;
        }

        const handleEvent = (event: ScanStreamEvent) => {
          switch (event.type) {
            case "start":
              setScanProgress((prev) => ({ total: event.total, done: 0, roles: 0, phase: "fetching", items: prev?.items ?? [] }));
              break;
            case "source":
              setScanProgress((prev) => {
                const base = prev ?? { total: 0, done: 0, roles: 0, phase: "fetching" as const, items: [] };
                const item: ScanProgressItem = { id: event.id, label: event.label, status: event.status, jobs: event.jobs };
                return {
                  ...base,
                  done: base.done + 1,
                  roles: base.roles + (event.status === "fetched" ? event.jobs : 0),
                  items: [item, ...base.items].slice(0, 60),
                };
              });
              break;
            case "phase":
              setScanProgress((prev) => prev && { ...prev, phase: event.phase });
              break;
            case "error":
              throw new Error(event.message ?? "Unable to run scan.");
            case "summary":
              break;
          }
        };

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let summary: ScanSummaryPayload | null = null;

        for (;;) {
          const { done, value } = await reader.read();
          if (value) buffer += decoder.decode(value, { stream: true });
          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (!line) continue;
            const event = JSON.parse(line) as ScanStreamEvent;
            if (event.type === "summary") summary = event;
            else handleEvent(event);
          }
          if (done) break;
        }
        const tail = buffer.trim();
        if (tail) {
          const event = JSON.parse(tail) as ScanStreamEvent;
          if (event.type === "summary") summary = event;
          else handleEvent(event);
        }

        if (summary) {
          const results = applyScanSummary(summary);
          setScanProgress((prev) => prev && { ...prev, phase: "done", fit: results.reduce((t, r) => t + (r.totalRelevant ?? 0), 0) });
        } else {
          setScanProgress((prev) => prev && { ...prev, phase: "done" });
        }
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : "Unable to run scan.";
        setError({ message });
        setScanProgress((prev) => (prev ? { ...prev, phase: "error", message } : { total: 0, done: 0, roles: 0, phase: "error", items: [], message }));
      }
    });
  }

  function updateProfile(update: SearchProfileUpdate, onSaved: () => void) {
    setError(null);
    startProfileTransition(async () => {
      try {
        const response = await fetch("/scans/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        });
        const nextState = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Session expired. Reload and sign in again.");
          }
          throw new Error(nextState.error ?? "Unable to update configuration.");
        }

        setDashboardState(nextState);
        onSaved();
      } catch (actionError) {
        setError({ message: actionError instanceof Error ? actionError.message : "Unable to update configuration." });
      }
    });
  }

  function compileOnboardingProfile(payload: OnboardingProfilePayload, action: "preview" | "apply", onSaved: (result: OnboardingProfileResult) => void) {
    setError(null);
    startProfileCompileTransition(async () => {
      try {
        const response = await fetch("/scans/api/onboarding-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, action }),
        });

        if (!response.ok) {
          throw new Error(await readApiError(response, "Unable to compile and save this profile."));
        }

        const result = await response.json() as OnboardingProfileResult;
        if (result.dashboardState) setDashboardState(result.dashboardState);
        onSaved(result);
      } catch (actionError) {
        setError({ message: actionError instanceof Error ? actionError.message : "Unable to compile and save this profile." });
      }
    });
  }

  function updateCompany(companyId: string, update: CompanyUpdate, onSaved: () => void) {
    setError(null);
    startCompanyTransition(async () => {
      try {
        const response = await fetch("/scans/api/company", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId, ...update }),
        });
        const nextState = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Session expired. Reload and sign in again.");
          }
          throw new Error(nextState.error ?? "Unable to update company.");
        }

        setDashboardState(nextState);
        onSaved();
      } catch (actionError) {
        setError({ message: actionError instanceof Error ? actionError.message : "Unable to update company." });
      }
    });
  }

  function createCompany(update: CompanyCreate, onSaved: () => void) {
    setError(null);
    startCompanyTransition(async () => {
      try {
        const response = await fetch("/scans/api/company", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        });
        const nextState = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Session expired. Reload and sign in again.");
          }
          throw new Error(nextState.error ?? "Unable to add company.");
        }

        setDashboardState(nextState);
        onSaved();
      } catch (actionError) {
        setError({ message: actionError instanceof Error ? actionError.message : "Unable to add company." });
      }
    });
  }

  function importCompanyList(payloadText: string, onSaved: () => void) {
    setError(null);
    startCompanyTransition(async () => {
      try {
        const response = await fetch("/scans/api/company", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ importText: payloadText }),
        });
        const nextState = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Session expired. Reload and sign in again.");
          }
          throw new Error(nextState.error ?? "Unable to import companies.");
        }

        setDashboardState(nextState);
        setCompanyImportSummary(nextState.importSummary);
        onSaved();
      } catch (actionError) {
        setError({ message: actionError instanceof Error ? actionError.message : "Unable to import companies." });
      }
    });
  }

  function updateSettings(update: SettingsUpdate, onSaved: () => void) {
    setError(null);
    startSettingsTransition(async () => {
      try {
        const response = await fetch("/scans/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        });
        const nextState = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Session expired. Reload and sign in again.");
          }
          throw new Error(nextState.error ?? "Unable to update overview settings.");
        }

        setDashboardState(nextState);
        onSaved();
      } catch (actionError) {
        setError({ message: actionError instanceof Error ? actionError.message : "Unable to update overview settings." });
      }
    });
  }

  function previewConnector(companyId: string) {
    setError(null);
    startConnectorPreviewTransition(async () => {
      try {
        const response = await fetch("/scans/api/connectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId }),
        });
        const nextState = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Session expired. Reload and sign in again.");
          }
          throw new Error(nextState.error ?? "Unable to preview connector.");
        }

        setConnectorPlan(nextState.plan);
        setConnectorFetchPreview(null);
        setConnectorPreviewMode(null);
        setConnectorApplySummary(null);
      } catch (actionError) {
        setError({ message: actionError instanceof Error ? actionError.message : "Unable to preview connector." });
      }
    });
  }

  function previewConnectorBatch() {
    setError(null);
    startBatchPreviewTransition(async () => {
      try {
        const response = await fetch("/scans/api/connectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "batchPlan" }),
        });
        const nextState = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Session expired. Reload and sign in again.");
          }
          throw new Error(nextState.error ?? "Unable to preview sources.");
        }

        setConnectorBatchPlan({
          plans: nextState.plans,
          ready: nextState.ready,
          blocked: nextState.blocked,
        });
        setConnectorBatchFetchResults(null);
        setConnectorBatchApplyResults(null);
      } catch (actionError) {
        setError({ message: actionError instanceof Error ? actionError.message : "Unable to preview sources." });
      }
    });
  }

  function fetchConnectorBatchPreview() {
    setError(null);
    startBatchFetchTransition(async () => {
      try {
        const response = await fetch("/scans/api/connectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "batchFetchPreview" }),
        });
        const nextState = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Session expired. Reload and sign in again.");
          }
          throw new Error(nextState.error ?? "Unable to fetch source previews.");
        }

        setConnectorBatchFetchResults(nextState.results);
        setConnectorBatchApplyResults(null);
      } catch (actionError) {
        setError({ message: actionError instanceof Error ? actionError.message : "Unable to fetch source previews." });
      }
    });
  }

  function applyConnectorBatch(confirmBatchApply: string) {
    setError(null);
    startBatchApplyTransition(async () => {
      try {
        const response = await fetch("/scans/api/connectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "batchApplyFetchPreview", confirmBatchApply }),
        });
        const nextState = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Session expired. Reload and sign in again.");
          }
          throw new Error(nextState.error ?? "Unable to apply batch sources.");
        }

        setDashboardState(nextState.dashboardState);
        setConnectorBatchApplyResults(nextState.results);
        setConnectorBatchFetchResults(null);
      } catch (actionError) {
        setError({ message: actionError instanceof Error ? actionError.message : "Unable to apply batch sources." });
      }
    });
  }

  function fetchConnectorPreview(companyId: string) {
    setError(null);
    startConnectorFetchTransition(async () => {
      try {
        const response = await fetch("/scans/api/connectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "fetchPreview", companyId }),
        });
        const nextState = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Session expired. Reload and sign in again.");
          }
          throw new Error(nextState.error ?? "Unable to fetch connector preview.");
        }

        setConnectorPlan(nextState.preview.plan);
        setConnectorFetchPreview(nextState.preview);
        setConnectorPreviewMode("fetch");
        setConnectorApplySummary(null);
      } catch (actionError) {
        setError({ message: actionError instanceof Error ? actionError.message : "Unable to fetch connector preview." });
      }
    });
  }

  function previewConnectorPayload(companyId: string, payloadText: string) {
    setError(null);
    startPayloadPreviewTransition(async () => {
      try {
        const payload = JSON.parse(payloadText);
        const response = await fetch("/scans/api/connectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "previewPayload", companyId, payload }),
        });
        const nextState = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Session expired. Reload and sign in again.");
          }
          throw new Error(nextState.error ?? "Unable to preview pasted payload.");
        }

        setConnectorPlan(nextState.preview.plan);
        setConnectorFetchPreview(nextState.preview);
        setConnectorPreviewMode("payload");
        setConnectorApplySummary(null);
      } catch (actionError) {
        setError({ message: actionError instanceof Error ? actionError.message : "Unable to preview pasted payload." });
      }
    });
  }

  function applyConnectorPreview(companyId: string, confirmCompanyName: string) {
    setError(null);
    startConnectorApplyTransition(async () => {
      try {
        const response = await fetch("/scans/api/connectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "applyFetchPreview", companyId, confirmCompanyName }),
        });
        const nextState = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Session expired. Reload and sign in again.");
          }
          throw new Error(nextState.error ?? "Unable to apply connector preview.");
        }

        setDashboardState(nextState.dashboardState);
        setConnectorApplySummary(nextState.apply);
        setConnectorFetchPreview(null);
        setConnectorPreviewMode(null);
      } catch (actionError) {
        setError({ message: actionError instanceof Error ? actionError.message : "Unable to apply connector preview." });
      }
    });
  }

  function applyConnectorPayload(companyId: string, confirmCompanyName: string, payloadText: string) {
    setError(null);
    startConnectorApplyTransition(async () => {
      try {
        const payload = JSON.parse(payloadText);
        const response = await fetch("/scans/api/connectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "applyPayload", companyId, confirmCompanyName, payload }),
        });
        const nextState = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Session expired. Reload and sign in again.");
          }
          throw new Error(nextState.error ?? "Unable to apply pasted payload.");
        }

        setDashboardState(nextState.dashboardState);
        setConnectorApplySummary(nextState.apply);
        setConnectorFetchPreview(null);
        setConnectorPreviewMode(null);
      } catch (actionError) {
        setError({ message: actionError instanceof Error ? actionError.message : "Unable to apply pasted payload." });
      }
    });
  }

  return {
    dashboardState,
    applyDashboardState: (state: DashboardState) => setDashboardState(state),
    scheduledScanPreview,
    scanProgress,
    companyImportSummary,
    pendingJobId,
    pendingFeedbackJobId,
    error,
    isScanning,
    isUpdatingProfile,
    isCompilingProfile,
    isUpdatingCompany,
    isUpdatingSettings,
    isPreviewingConnector,
    isFetchingConnector,
    isApplyingConnector,
    isPreviewingPayload,
    isPreviewingBatch,
    isFetchingBatch,
    isApplyingBatch,
    connectorPlan,
    connectorFetchPreview,
    connectorPreviewMode,
    connectorApplySummary,
    connectorBatchPlan,
    connectorBatchFetchResults,
    connectorBatchApplyResults,
    updateStatus,
    saveApplyWizard,
    saveFeedback,
    runScan,
    updateProfile,
    compileOnboardingProfile,
    updateCompany,
    createCompany,
    importCompanyList,
    updateSettings,
    previewConnector,
    previewConnectorBatch,
    fetchConnectorBatchPreview,
    applyConnectorBatch,
    fetchConnectorPreview,
    previewConnectorPayload,
    applyConnectorPreview,
    applyConnectorPayload,
    clearConnectorPlan: () => {
      setConnectorPlan(null);
      setConnectorFetchPreview(null);
      setConnectorPreviewMode(null);
      setConnectorApplySummary(null);
    },
    clearConnectorBatchPlan: () => {
      setConnectorBatchPlan(null);
      setConnectorBatchFetchResults(null);
      setConnectorBatchApplyResults(null);
    },
    clearCompanyImportSummary: () => setCompanyImportSummary(null),
    clearScanProgress: () => setScanProgress(null),
  };
}

function listToText(items: string[]) {
  return items.join("\n");
}

function textToList(value: string) {
  return Array.from(new Set(
    value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
  ));
}

function ConfigurationModal({
  profile,
  isPending,
  onClose,
  onSave,
}: {
  profile: UserSearchProfile;
  isPending: boolean;
  onClose: () => void;
  onSave: (update: SearchProfileUpdate) => void;
}) {
  const [targetTitles, setTargetTitles] = useState(listToText(profile.targetTitles));
  const [doNotApplyCompanies, setDoNotApplyCompanies] = useState(listToText(profile.doNotApplyCompanies));
  const [compensationFloor, setCompensationFloor] = useState(String(profile.compensationFloor));
  const [freelanceRateFloor, setFreelanceRateFloor] = useState(String(profile.freelanceRateFloor));
  const [remoteOnly, setRemoteOnly] = useState(profile.remoteOnly);

  function saveConfiguration() {
    onSave({
      targetTitles: textToList(targetTitles),
      compensationFloor: Math.max(0, Math.round(Number(compensationFloor) || 0)),
      freelanceRateFloor: Math.max(0, Math.round(Number(freelanceRateFloor) || 0)),
      remoteOnly,
      doNotApplyCompanies: textToList(doNotApplyCompanies),
    });
  }

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Edit configuration"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.modalBox}>
        <div className={styles.modalHeader}>
          <h4 className={styles.modalTitle}>Edit: Configuration</h4>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.formGrid}>
          <label className={styles.formField}>
            <span>Target titles</span>
            <textarea value={targetTitles} onChange={(event) => setTargetTitles(event.target.value)} rows={7} />
            <small>One per line, or comma-separated.</small>
          </label>
          <label className={styles.formField}>
            <span>Do-not-apply companies</span>
            <textarea value={doNotApplyCompanies} onChange={(event) => setDoNotApplyCompanies(event.target.value)} rows={7} />
            <small>Used to suppress known bad-fit companies.</small>
          </label>
          <label className={styles.formField}>
            <span>Base compensation floor</span>
            <input type="number" min="0" step="1000" value={compensationFloor} onChange={(event) => setCompensationFloor(event.target.value)} />
          </label>
          <label className={styles.formField}>
            <span>Freelance hourly floor</span>
            <input type="number" min="0" step="5" value={freelanceRateFloor} onChange={(event) => setFreelanceRateFloor(event.target.value)} />
          </label>
          <label className={styles.toggleField}>
            <input type="checkbox" checked={remoteOnly} onChange={(event) => setRemoteOnly(event.target.checked)} />
            <span>
              <strong>Remote only</strong>
              <small>Prioritize roles that can work without office proximity.</small>
            </span>
          </label>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.modalBtnClose} onClick={onClose} disabled={isPending}>
            Cancel
          </button>
          <button type="button" className={styles.modalBtnSave} onClick={saveConfiguration} disabled={isPending}>
            {isPending ? "Saving..." : "Save configuration"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OnboardingProfileModal({
  profile,
  isPending,
  onClose,
  onCompile,
}: {
  profile: UserSearchProfile;
  isPending: boolean;
  onClose: () => void;
  onCompile: (payload: OnboardingProfilePayload, action: "preview" | "apply", onSaved: (result: OnboardingProfileResult) => void) => void;
}) {
  const [resumeText, setResumeText] = useState("");
  const [profileText, setProfileText] = useState("");
  const [desiredTitles, setDesiredTitles] = useState(listToText(profile.targetTitles));
  const [avoidedTitles, setAvoidedTitles] = useState("");
  const [desiredIndustries, setDesiredIndustries] = useState(listToText(profile.targetIndustries));
  const [avoidedKeywords, setAvoidedKeywords] = useState(listToText(profile.negativeKeywords));
  const [doNotApplyCompanies, setDoNotApplyCompanies] = useState(listToText(profile.doNotApplyCompanies));
  const [compensationFloor, setCompensationFloor] = useState(String(profile.compensationFloor));
  const [freelanceRateFloor, setFreelanceRateFloor] = useState(String(profile.freelanceRateFloor));
  const [remoteOnly, setRemoteOnly] = useState(profile.remoteOnly);
  const [localError, setLocalError] = useState("");
  const [compiledProfile, setCompiledProfile] = useState<CompiledSearchProfile | null>(null);
  const [appliedMessage, setAppliedMessage] = useState("");

  function payload(): OnboardingProfilePayload {
    return {
      resumeText,
      profileText,
      preferences: {
        desiredTitles: textToList(desiredTitles),
        avoidedTitles: textToList(avoidedTitles),
        desiredIndustries: textToList(desiredIndustries),
        avoidedKeywords: textToList(avoidedKeywords),
        compensationFloor: Math.max(0, Math.round(Number(compensationFloor) || 0)),
        freelanceRateFloor: Math.max(0, Math.round(Number(freelanceRateFloor) || 0)),
        remoteOnly,
        doNotApplyCompanies: textToList(doNotApplyCompanies),
        approvedLoginEmail: profile.approvedLoginEmail,
      },
    };
  }

  function runCompile(action: "preview" | "apply") {
    if (!resumeText.trim() && !profileText.trim()) {
      setLocalError("Paste a resume, a profile brief, or both before compiling. The dumpster cannot read your mind yet.");
      return;
    }

    setLocalError("");
    setAppliedMessage("");
    onCompile(payload(), action, (result) => {
      setCompiledProfile(result.compiledProfile);
      if (action === "apply") setAppliedMessage("Compiled profile applied to matching configuration.");
    });
  }

  const titlePreview = compiledProfile?.searchProfile.targetTitles.slice(0, 8) ?? [];
  const keywordPreview = compiledProfile?.searchProfile.positiveKeywords.slice(0, 10) ?? [];
  const industryPreview = compiledProfile?.searchProfile.targetIndustries.slice(0, 8) ?? [];

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Compile profile from resume"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`${styles.modalBox} ${styles.modalBoxWide}`}>
        <div className={styles.modalHeader}>
          <h4 className={styles.modalTitle}>Compile profile from resume</h4>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className={styles.modalIntro}>
          Paste resume/profile context, add explicit wants and avoids, then preview what the matcher would learn before applying it.
        </p>

        <div className={styles.compilerGrid}>
          <div className={styles.compilerInputStack}>
            <label className={styles.formField}>
              <span>Resume text</span>
              <textarea value={resumeText} onChange={(event) => setResumeText(event.target.value)} rows={8} placeholder="Paste resume text here. It is compiled into structured signals; raw text is not stored by default." />
            </label>
            <label className={styles.formField}>
              <span>Profile brief</span>
              <textarea value={profileText} onChange={(event) => setProfileText(event.target.value)} rows={5} placeholder="What kind of work do you actually want? What should the tool avoid?" />
            </label>
            <div className={styles.formGrid}>
              <label className={styles.formField}>
                <span>Desired titles</span>
                <textarea value={desiredTitles} onChange={(event) => setDesiredTitles(event.target.value)} rows={5} />
              </label>
              <label className={styles.formField}>
                <span>Avoided titles</span>
                <textarea value={avoidedTitles} onChange={(event) => setAvoidedTitles(event.target.value)} rows={5} placeholder="Software Engineer, Counsel, Compliance Manager" />
              </label>
              <label className={styles.formField}>
                <span>Desired industries</span>
                <textarea value={desiredIndustries} onChange={(event) => setDesiredIndustries(event.target.value)} rows={4} />
              </label>
              <label className={styles.formField}>
                <span>Avoided keywords</span>
                <textarea value={avoidedKeywords} onChange={(event) => setAvoidedKeywords(event.target.value)} rows={4} />
              </label>
              <label className={styles.formField}>
                <span>Base compensation floor</span>
                <input type="number" min="0" step="1000" value={compensationFloor} onChange={(event) => setCompensationFloor(event.target.value)} />
              </label>
              <label className={styles.formField}>
                <span>Freelance hourly floor</span>
                <input type="number" min="0" step="5" value={freelanceRateFloor} onChange={(event) => setFreelanceRateFloor(event.target.value)} />
              </label>
              <label className={styles.formField}>
                <span>Do-not-apply companies</span>
                <textarea value={doNotApplyCompanies} onChange={(event) => setDoNotApplyCompanies(event.target.value)} rows={4} />
              </label>
              <label className={styles.toggleField}>
                <input type="checkbox" checked={remoteOnly} onChange={(event) => setRemoteOnly(event.target.checked)} />
                <span>
                  <strong>Remote only</strong>
                  <small>Suppress onsite roles before ranking.</small>
                </span>
              </label>
            </div>
          </div>

          <aside className={styles.compilerReviewPanel}>
            <strong>Compiler review</strong>
            {!compiledProfile ? (
              <p>Preview creates the structured profile, matcher rules, confidence, and missing-input prompts before you apply anything.</p>
            ) : (
              <>
                <div className={styles.compilerConfidence}>
                  <span>Confidence</span>
                  <strong>{compiledProfile.confidence}</strong>
                </div>
                {compiledProfile.missingInputs.length > 0 ? (
                  <div className={styles.compilerWarning}>
                    <strong>Needs better signal</strong>
                    <p>Add: {compiledProfile.missingInputs.join(", ")}.</p>
                  </div>
                ) : (
                  <div className={styles.compilerSuccess}>
                    <strong>Enough signal to apply</strong>
                    <p>The compiled profile has titles, strengths, industries, and constraints.</p>
                  </div>
                )}
                <div className={styles.compilerPreviewGroup}>
                  <span>Target titles</span>
                  <div>{titlePreview.map((item) => <small key={item}>{item}</small>)}</div>
                </div>
                <div className={styles.compilerPreviewGroup}>
                  <span>Strength signals</span>
                  <div>{keywordPreview.map((item) => <small key={item}>{item}</small>)}</div>
                </div>
                <div className={styles.compilerPreviewGroup}>
                  <span>Industries</span>
                  <div>{industryPreview.map((item) => <small key={item}>{item}</small>)}</div>
                </div>
              </>
            )}
            {localError && <p className={styles.formError}>{localError}</p>}
            {appliedMessage && <p className={styles.compilerApplied}>{appliedMessage}</p>}
          </aside>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.modalBtnClose} onClick={onClose} disabled={isPending}>
            Close
          </button>
          <button type="button" className={styles.modalBtnClose} onClick={() => runCompile("preview")} disabled={isPending}>
            {isPending ? "Compiling..." : "Preview compiler output"}
          </button>
          <button type="button" className={styles.modalBtnSave} onClick={() => runCompile("apply")} disabled={isPending}>
            {isPending ? "Applying..." : "Apply compiled profile"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OverviewModal({
  settings,
  isPending,
  onClose,
  onSave,
}: {
  settings: DashboardSettings;
  isPending: boolean;
  onClose: () => void;
  onSave: (update: SettingsUpdate) => void;
}) {
  const [scanEnabled, setScanEnabled] = useState(settings.scanEnabled);
  const [scanCadence, setScanCadence] = useState<ScanCadence>(settings.scanCadence);
  const [maxRolesPerScan, setMaxRolesPerScan] = useState(String(settings.maxRolesPerScan));

  function saveSettings() {
    onSave({
      scanEnabled,
      scanCadence,
      digestEnabled: settings.digestEnabled,
      digestCadence: settings.digestCadence,
      digestTime: settings.digestTime,
      maxRolesPerScan: Math.max(1, Math.min(250, Math.round(Number(maxRolesPerScan) || 25))),
    });
  }

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Edit overview settings"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.modalBox}>
        <div className={styles.modalHeader}>
          <h4 className={styles.modalTitle}>Edit: Overview</h4>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.formGrid}>
          <label className={styles.toggleField}>
            <input type="checkbox" checked={scanEnabled} onChange={(event) => setScanEnabled(event.target.checked)} />
            <span>
              <strong>Enable scheduled scans</strong>
              <small>Stores the preference only; automation comes later.</small>
            </span>
          </label>
          <label className={styles.formField}>
            <span>Scan cadence</span>
            <select value={scanCadence} onChange={(event) => setScanCadence(event.target.value as ScanCadence)}>
              <option value="manual">Manual</option>
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <label className={styles.formField}>
            <span>Max roles per scan</span>
            <input type="number" min="1" max="250" value={maxRolesPerScan} onChange={(event) => setMaxRolesPerScan(event.target.value)} />
          </label>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.modalBtnClose} onClick={onClose} disabled={isPending}>
            Cancel
          </button>
          <button type="button" className={styles.modalBtnSave} onClick={saveSettings} disabled={isPending}>
            {isPending ? "Saving..." : "Save overview"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DigestScheduleModal({
  settings,
  isPending,
  onClose,
  onSave,
}: {
  settings: DashboardSettings;
  isPending: boolean;
  onClose: () => void;
  onSave: (update: SettingsUpdate) => void;
}) {
  const [digestEnabled, setDigestEnabled] = useState(settings.digestEnabled);
  const [digestCadence, setDigestCadence] = useState<ScanCadence>(settings.digestCadence);
  const [digestTime, setDigestTime] = useState(settings.digestTime);

  function saveDigestSchedule() {
    onSave({
      scanEnabled: settings.scanEnabled,
      scanCadence: settings.scanCadence,
      digestEnabled,
      digestCadence,
      digestTime,
      maxRolesPerScan: settings.maxRolesPerScan,
    });
  }

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Schedule daily digest email"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`${styles.modalBox} ${styles.modalBoxSmall}`}>
        <div className={styles.modalHeader}>
          <h4 className={styles.modalTitle}>Schedule Daily Digest Email</h4>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className={styles.modalIntro}>
          Save the preferred digest schedule now. Email sending is not connected yet, so this stores the preference without sending anything.
        </p>

        <div className={styles.formGrid}>
          <label className={styles.toggleField}>
            <input type="checkbox" checked={digestEnabled} onChange={(event) => setDigestEnabled(event.target.checked)} />
            <span>
              <strong>Digest preference</strong>
              <small>Non-sending until the email service is connected.</small>
            </span>
          </label>
          <label className={styles.formField}>
            <span>Frequency</span>
            <select value={digestCadence} onChange={(event) => setDigestCadence(event.target.value as ScanCadence)}>
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekly">Weekly</option>
              <option value="manual">Manual only</option>
            </select>
          </label>
          <label className={styles.formField}>
            <span>Send time</span>
            <input type="time" value={digestTime} onChange={(event) => setDigestTime(event.target.value)} />
          </label>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.modalBtnClose} onClick={onClose} disabled={isPending}>
            Cancel
          </button>
          <button type="button" className={styles.modalBtnSave} onClick={saveDigestSchedule} disabled={isPending}>
            {isPending ? "Saving..." : "Save schedule preference"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompanyModal({
  company,
  isPending,
  onClose,
  onSave,
}: {
  company: Company | null;
  isPending: boolean;
  onClose: () => void;
  onSave: (companyId: string | null, update: CompanyUpdate) => void;
}) {
  const [companyName, setCompanyName] = useState(company?.companyName ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(company?.websiteUrl ?? "");
  const [careersUrl, setCareersUrl] = useState(company?.careersUrl ?? "");
  const [atsProvider, setAtsProvider] = useState<SourceProvider>(company?.atsProvider ?? "greenhouse");
  const [atsBoardToken, setAtsBoardToken] = useState(company?.atsBoardToken ?? "");
  const [industryBucket, setIndustryBucket] = useState(company?.industryBucket ?? "");
  const [remoteLikelihood, setRemoteLikelihood] = useState(String(company?.remoteLikelihood ?? 50));
  const [status, setStatus] = useState<CompanyStatus>(company?.status ?? "active");
  const [notes, setNotes] = useState(company?.notes ?? "");

  function saveCompany() {
    onSave(company?.id ?? null, {
      companyName,
      websiteUrl,
      careersUrl,
      atsProvider,
      atsBoardToken,
      industryBucket,
      remoteLikelihood: Math.min(100, Math.max(0, Math.round(Number(remoteLikelihood) || 0))),
      status,
      notes,
    });
  }

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={company ? `Edit ${company.companyName}` : "Add company"}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.modalBox}>
        <div className={styles.modalHeader}>
          <h4 className={styles.modalTitle}>{company ? `Edit: ${company.companyName}` : "Add a company to watch"}</h4>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.formGrid}>
          <label className={styles.formField}>
            <span>Company name</span>
            <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
          </label>
          <label className={styles.formField}>
            <span>Company category</span>
            <input value={industryBucket} onChange={(event) => setIndustryBucket(event.target.value)} />
          </label>
          <label className={styles.formField}>
            <span>Website URL</span>
            <input value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} />
          </label>
          <label className={styles.formField}>
            <span>Job board URL</span>
            <input value={careersUrl} onChange={(event) => setCareersUrl(event.target.value)} />
            <small>Paste the page where this company lists open roles. The app will scan this page or its public job feed.</small>
          </label>
          <label className={styles.formField}>
            <span>Job board type</span>
            <select value={atsProvider} onChange={(event) => setAtsProvider(event.target.value as SourceProvider)}>
              <option value="greenhouse">Greenhouse</option>
              <option value="lever">Lever</option>
              <option value="ashby">Ashby</option>
              <option value="icims">iCIMS</option>
              <option value="workday">Workday</option>
              <option value="magnit">Magnit DirectSource</option>
              <option value="html">Regular careers page</option>
            </select>
            <small>If you are not sure, choose Regular careers page. Known boards can often be detected from the URL.</small>
          </label>
          <label className={styles.formField}>
            <span>Board identifier</span>
            <input value={atsBoardToken} onChange={(event) => setAtsBoardToken(event.target.value)} />
            <small>Usually auto-filled. Leave blank unless a board needs a short ID such as a Greenhouse slug.</small>
          </label>
          <label className={styles.formField}>
            <span>Remote-friendly estimate</span>
            <input type="number" min="0" max="100" value={remoteLikelihood} onChange={(event) => setRemoteLikelihood(event.target.value)} />
            <small>0–100. Your best guess for how likely this company is to support remote work.</small>
          </label>
          <label className={styles.formField}>
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as CompanyStatus)}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="deprioritized">Deprioritized</option>
              <option value="do_not_apply">Do not apply</option>
            </select>
          </label>
          <label className={`${styles.formField} ${styles.formFieldFull}`}>
            <span>Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={6} />
          </label>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.modalBtnClose} onClick={onClose} disabled={isPending}>
            Cancel
          </button>
          <button type="button" className={styles.modalBtnSave} onClick={saveCompany} disabled={isPending}>
            {isPending ? "Saving..." : company ? "Save company" : "Add to watchlist"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompanyImportModal({
  isPending,
  onClose,
  onImport,
}: {
  isPending: boolean;
  onClose: () => void;
  onImport: (payloadText: string) => void;
}) {
  const [payloadText, setPayloadText] = useState("");

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Import companies"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.modalBox}>
        <div className={styles.modalHeader}>
          <h4 className={styles.modalTitle}>Import companies to watch</h4>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <label className={`${styles.formField} ${styles.formFieldFull}`}>
          <span>Company list</span>
          <textarea value={payloadText} onChange={(event) => setPayloadText(event.target.value)} rows={12} />
          <small>Paste one company per line for a simple import, or paste a spreadsheet-style CSV when you have URLs. Best columns: companyName, websiteUrl, careersUrl, notes. Known Greenhouse, Lever, Ashby, iCIMS, Workday, and Magnit links are detected automatically.</small>
        </label>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.modalBtnClose} onClick={onClose} disabled={isPending}>
            Cancel
          </button>
          <button type="button" className={styles.modalBtnSave} onClick={() => onImport(payloadText)} disabled={isPending || !payloadText.trim()}>
            {isPending ? "Importing..." : "Add companies"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConnectorPreviewModal({
  plan,
  preview,
  previewMode,
  applySummary,
  isFetching,
  isPreviewingPayload,
  isApplying,
  onClose,
  onFetchPreview,
  onPreviewPayload,
  onApplyPreview,
  onApplyPayload,
}: {
  plan: ConnectorPlan;
  preview: ConnectorFetchPreview | null;
  previewMode: ConnectorPreviewMode | null;
  applySummary: ConnectorApplySummary | null;
  isFetching: boolean;
  isPreviewingPayload: boolean;
  isApplying: boolean;
  onClose: () => void;
  onFetchPreview: (companyId: string) => void;
  onPreviewPayload: (companyId: string, payloadText: string) => void;
  onApplyPreview: (companyId: string, confirmCompanyName: string) => void;
  onApplyPayload: (companyId: string, confirmCompanyName: string, payloadText: string) => void;
}) {
  const [confirmCompanyName, setConfirmCompanyName] = useState("");
  const [payloadText, setPayloadText] = useState("");
  const canApply = preview && confirmCompanyName === plan.companyName;
  const hasPayload = payloadText.trim().length > 0;

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={`Connector preview for ${plan.companyName}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.modalBox}>
        <div className={styles.modalHeader}>
          <h4 className={styles.modalTitle}>Source preview: {plan.companyName}</h4>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.connectorPreview}>
          <div className={styles.connectorStatusRow}>
            <span className={`${styles.scanStatusBadge}${plan.canPreview ? "" : ` ${styles.scanStatusBadgeWarn}`}`}>
              {plan.canPreview ? "ready" : "needs setup"}
            </span>
            <span>{plan.provider}</span>
            <span>{plan.requestLabel}</span>
          </div>

          <div className={styles.connectorEndpoint}>
            <span className={styles.metaLabel}>Planned endpoint</span>
            <strong>{plan.endpointUrl || "Not configured"}</strong>
          </div>

          {plan.warnings.length > 0 && (
            <div className={styles.connectorBlock}>
              <span className={styles.metaLabel}>Warnings</span>
              <ul>
                {plan.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}

          <div className={styles.connectorBlock}>
            <span className={styles.metaLabel}>Normalized fields</span>
            <div className={styles.keywordCloud}>
              {plan.normalizationFields.map((field) => <span key={field} className={styles.keyword}>{field}</span>)}
            </div>
          </div>

          <div className={styles.connectorBlock}>
            <span className={styles.metaLabel}>Guardrails</span>
            <ul>
              {plan.guardrails.map((guardrail) => <li key={guardrail}>{guardrail}</li>)}
            </ul>
          </div>

          <p className={styles.modalNote}>
            Preview fetches do not write to the database. Upserts stay off until explicitly enabled.
          </p>

          <label className={`${styles.formField} ${styles.formFieldFull}`}>
            <span>Paste source JSON</span>
            <textarea value={payloadText} onChange={(event) => setPayloadText(event.target.value)} rows={6} />
            <small>Accepts a raw array or provider payload with jobs/postings/data.</small>
          </label>

          {preview && (
            <div className={styles.connectorResults}>
              <div className={styles.connectorResultStats}>
                <span><strong>{preview.totalFetched}</strong> fetched</span>
                <span><strong>{preview.totalRelevant}</strong> relevant</span>
                <span><strong>{preview.filteredOut}</strong> filtered</span>
                <span><strong>{preview.newJobs.length}</strong> new</span>
                <span><strong>{preview.existingJobs.length}</strong> existing</span>
                <span><strong>{preview.missingExistingJobs.length}</strong> missing</span>
              </div>

              {preview.newJobs.length > 0 && (
                <div className={styles.connectorBlock}>
                  <span className={styles.metaLabel}>New from source</span>
                  <ul>
                    {preview.newJobs.slice(0, 8).map((job) => (
                      <li key={job.externalJobId}>{job.title} · {job.location || "location unclear"}</li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.missingExistingJobs.length > 0 && (
                <div className={styles.connectorBlock}>
                  <span className={styles.metaLabel}>Existing roles missing from source</span>
                  <ul>
                    {preview.missingExistingJobs.slice(0, 8).map((job) => (
                      <li key={job.id}>{job.title} · currently {job.status}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {preview && (
            <label className={`${styles.formField} ${styles.connectorConfirmField}`}>
              <span>Type {plan.companyName} to enable writes</span>
              <input value={confirmCompanyName} onChange={(event) => setConfirmCompanyName(event.target.value)} />
              <small>Applying inserts/updates roles and archives active roles missing from the source.</small>
            </label>
          )}

          {applySummary && (
            <div className={styles.connectorApplySummary}>
              <strong>Applied to dashboard</strong>
              <span>{applySummary.inserted} inserted</span>
              <span>{applySummary.updated} updated</span>
              <span>{applySummary.closed} archived</span>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.modalBtnClose} onClick={() => onFetchPreview(plan.companyId)} disabled={isFetching || !plan.canPreview}>
            {isFetching ? "Fetching..." : "Fetch preview"}
          </button>
          <button type="button" className={styles.modalBtnClose} onClick={() => onPreviewPayload(plan.companyId, payloadText)} disabled={isPreviewingPayload || !hasPayload}>
            {isPreviewingPayload ? "Previewing..." : "Preview pasted JSON"}
          </button>
          {preview && previewMode === "fetch" && (
            <button type="button" className={styles.modalBtnSave} onClick={() => onApplyPreview(plan.companyId, confirmCompanyName)} disabled={isApplying || !canApply}>
              {isApplying ? "Applying..." : "Apply to dashboard"}
            </button>
          )}
          {preview && previewMode === "payload" && hasPayload && (
            <button type="button" className={styles.modalBtnSave} onClick={() => onApplyPayload(plan.companyId, confirmCompanyName, payloadText)} disabled={isApplying || !canApply}>
              {isApplying ? "Applying..." : "Apply pasted JSON"}
            </button>
          )}
          <button type="button" className={styles.modalBtnSave} onClick={onClose}>
            Close preview
          </button>
        </div>
      </div>
    </div>
  );
}

function ConnectorBatchModal({
  batch,
  results,
  applyResults,
  isFetching,
  isApplying,
  onClose,
  onFetchPreviews,
  onApplyBatch,
}: {
  batch: ConnectorBatchPlan;
  results: ConnectorBatchFetchResult[] | null;
  applyResults: ConnectorBatchApplyResult[] | null;
  isFetching: boolean;
  isApplying: boolean;
  onClose: () => void;
  onFetchPreviews: () => void;
  onApplyBatch: (confirmBatchApply: string) => void;
}) {
  const [confirmBatchApply, setConfirmBatchApply] = useState("");
  const canApplyBatch = confirmBatchApply === "APPLY ACTIVE SOURCES";

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Source readiness preview"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.modalBox}>
        <div className={styles.modalHeader}>
          <h4 className={styles.modalTitle}>Source readiness</h4>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.connectorResults}>
          <div className={styles.connectorResultStats}>
            <span><strong>{batch.plans.length}</strong> active</span>
            <span><strong>{batch.ready}</strong> ready</span>
            <span><strong>{batch.blocked}</strong> blocked</span>
            <span><strong>0</strong> writes</span>
          </div>

          <div className={styles.connectorBlock}>
            <span className={styles.metaLabel}>Plans</span>
            <ul>
              {batch.plans.map((plan) => (
                <li key={plan.companyId}>
                  {plan.companyName} · {plan.provider} · {plan.canPreview ? "ready" : plan.warnings.join(", ")}
                </li>
              ))}
            </ul>
          </div>

          {results && (
            <div className={styles.connectorBlock}>
              <span className={styles.metaLabel}>Fetch preview summaries</span>
              <ul>
                {results.map((result) => (
                  <li key={result.companyId}>
                    {result.companyName} · {result.status} · {result.totalFetched} fetched · {result.totalRelevant} relevant · {result.filteredOut} filtered{result.duplicatesFiltered ? ` · ${result.duplicatesFiltered} duplicates` : ""} · {result.newJobs} new · {result.existingJobs} existing · {result.missingExistingJobs} missing
                    {result.warnings.length > 0 ? ` · ${result.warnings.join(", ")}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {applyResults && (
            <div className={styles.connectorBlock}>
              <span className={styles.metaLabel}>Batch apply results</span>
              <ul>
                {applyResults.map((result) => (
                  <li key={result.companyId}>
                    {result.companyName} · {result.status}{typeof result.totalRelevant === "number" ? ` · ${result.totalRelevant} relevant · ${result.filteredOut ?? 0} filtered${result.duplicatesFiltered ? ` · ${result.duplicatesFiltered} duplicates` : ""}` : ""} · {result.inserted} inserted · {result.updated} updated · {result.closed} archived
                    {result.warnings.length > 0 ? ` · ${result.warnings.join(", ")}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label className={`${styles.formField} ${styles.connectorConfirmField}`}>
            <span>Type APPLY ACTIVE SOURCES to enable batch writes</span>
            <input value={confirmBatchApply} onChange={(event) => setConfirmBatchApply(event.target.value)} />
            <small>Batch apply fetches ready active sources, inserts/updates jobs, and archives active jobs missing from each source.</small>
          </label>

          <p className={styles.modalNote}>Batch fetch summarizes source diffs only. It does not write jobs.</p>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.modalBtnClose} onClick={onFetchPreviews} disabled={isFetching}>
            {isFetching ? "Fetching..." : "Fetch all previews"}
          </button>
          <button type="button" className={styles.modalBtnSave} onClick={() => onApplyBatch(confirmBatchApply)} disabled={isApplying || !canApplyBatch}>
            {isApplying ? "Applying..." : "Apply active sources"}
          </button>
          <button type="button" className={styles.modalBtnSave} onClick={onClose}>
            Close preview
          </button>
        </div>
      </div>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copyText() {
    setCopied(true);

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Keep the clicked state visible; the action is still an explicit copy attempt.
    }
  }

  return (
    <button type="button" className={`${styles.copyBtn}${copied ? ` ${styles.copyBtnCopied}` : ""}`} onClick={copyText} aria-label={`Copy ${label}`}>
      {copied ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

function ApplyModal({
  job,
  contacts,
  resumeTerms,
  isPending,
  onClose,
  onSaveActions,
  onContactsResearched,
}: {
  job: Job;
  contacts: ContactSuggestion[];
  resumeTerms: string[];
  isPending: boolean;
  onClose: () => void;
  onSaveActions: (submission: ApplyWizardSubmission) => void;
  onContactsResearched: (state: DashboardState) => void;
}) {
  const [step, setStep] = useState(0);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>(
    contacts.slice(0, 1).map((contact) => contact.id)
  );
  const [completedActions, setCompletedActions] = useState<string[]>([]);
  const [copyDraft, setCopyDraft] = useState<ApplyCopyDraft | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [isResearchingContacts, setIsResearchingContacts] = useState(false);
  const [contactResearchError, setContactResearchError] = useState<string | null>(null);
  const [contactResearchRan, setContactResearchRan] = useState(false);
  const [contactResearchStatus, setContactResearchStatus] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const modeRecommendation = useMemo(() => recommendApplyMode(job), [job]);
  const [applicationMode, setApplicationMode] = useState<ApplyMode>(() => modeRecommendation.recommendedMode);
  const selectedContacts = contacts.filter((contact) => selectedContactIds.includes(contact.id));
  const mode = getApplyModeOption(applicationMode);
  const fallbackDraft = useMemo(() => buildFallbackApplyCopy({
    job,
    contacts: selectedContacts,
    applicationMode,
  }), [applicationMode, job, selectedContacts]);
  const activeDraft = copyDraft ?? fallbackDraft;
  const stepLabels = ["Review", "Contacts", "Outreach", "Track"];
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryText);
  const risks = visibleRiskFlags(job);

  function toggleContact(contactId: string) {
    setCopyDraft(null);
    setCopyError(null);
    setSelectedContactIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId]
    );
  }

  function toggleAction(action: string) {
    setCompletedActions((current) =>
      current.includes(action)
        ? current.filter((item) => item !== action)
        : [...current, action]
    );
  }

  function selectApplicationMode(nextMode: ApplyMode) {
    setApplicationMode(nextMode);
    setCopyDraft(null);
    setCopyError(null);
  }

  function updateDraftMessage(contactId: string, update: Partial<ApplyCopyDraft["generatedMessages"][number]>) {
    const baseDraft = copyDraft ?? fallbackDraft;
    setCopyDraft({
      ...baseDraft,
      generatedMessages: baseDraft.generatedMessages.map((message) => (
        message.contactId === contactId ? { ...message, ...update } : message
      )),
    });
  }

  async function researchContacts() {
    setIsResearchingContacts(true);
    setContactResearchError(null);
    setContactResearchStatus("Building a reporting-chain hypothesis, then searching current leaders and recruiters.");

    try {
      const response = await fetch("/scans/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });
      const payload = await response.json().catch(() => ({})) as { dashboardState?: DashboardState; found?: number; error?: string; detail?: string; searchGuidance?: string };

      if (!response.ok || !payload.dashboardState) {
        throw new Error(payload.detail || payload.error || "Contact research could not complete. The search service returned an error.");
      }

      onContactsResearched(payload.dashboardState);
      setContactResearchRan(true);
      const guidance = payload.searchGuidance ? ` ${payload.searchGuidance}` : "";
      setContactResearchStatus(payload.found && payload.found > 0
        ? `${payload.found} contact${payload.found === 1 ? "" : "s"} found.${payload.found < 3 ? guidance : ""}`
        : `Search completed. No credible contacts were found.${guidance}`);
    } catch (error) {
      setContactResearchStatus(null);
      setContactResearchError(error instanceof Error ? error.message : "Contact research could not complete. Try again.");
    } finally {
      setIsResearchingContacts(false);
    }
  }

  async function generateCopy() {
    setIsGeneratingCopy(true);
    setCopyError(null);

    try {
      const response = await fetch("/scans/api/apply-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          applicationMode,
          selectedContactIds,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { draft?: ApplyCopyDraft; error?: string };

      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || "Unable to generate copy.");
      }

      setCopyDraft(payload.draft);
    } catch (error) {
      setCopyDraft(null);
      setCopyError(error instanceof Error ? error.message : "Unable to generate copy.");
    } finally {
      setIsGeneratingCopy(false);
    }
  }

  function saveActions() {
    const savedAt = new Date().toISOString();
    onSaveActions({
      sessionId: crypto.randomUUID(),
      savedAt,
      jobId: job.id,
      applicationMode,
      selectedContactIds,
      completedActions,
      generatedMessages: activeDraft.generatedMessages,
      coverLetterText: activeDraft.coverLetterText,
      resumeNotesText: activeDraft.resumeNotesText,
      notes: `Applying mode: ${mode.label}`,
    });
  }

  function requestClose() {
    setShowCloseConfirm(true);
  }

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={`Apply to ${job.title}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className={styles.modalBox}>
        <div className={styles.modalHeader}>
          <h4 className={styles.modalTitle}>Apply wizard: {job.title}</h4>
          <button type="button" className={styles.modalClose} onClick={requestClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {showCloseConfirm && (
          <section className={styles.closeConfirmPanel}>
            <strong>Do you want to save?</strong>
            <p>Doing so will add this to Previous Applications so you can track it. If you didn&apos;t apply, you can ignore and close.</p>
            <div className={styles.closeConfirmActions}>
              <button type="button" className={styles.modalBtnSave} onClick={saveActions} disabled={isPending}>
                {isPending ? "Saving..." : "Save actions"}
              </button>
              <button type="button" className={styles.modalBtnClose} onClick={onClose} disabled={isPending}>
                Ignore and close
              </button>
              <button type="button" className={styles.modalBtnClose} onClick={() => setShowCloseConfirm(false)} disabled={isPending}>
                Keep editing
              </button>
            </div>
          </section>
        )}

        <div className={styles.wizardSteps} aria-label="Apply wizard steps">
          {stepLabels.map((label, index) => (
            <button
              key={label}
              type="button"
              className={`${styles.wizardStep}${step === index ? ` ${styles.wizardStepActive}` : ""}`}
              onClick={() => setStep(index)}
            >
              <span>{index + 1}</span>
              {label}
            </button>
          ))}
        </div>

        {step === 0 && (
          <div className={styles.modalStack}>
            <section className={styles.modeSection}>
              <div className={styles.modeSelector} aria-label="Choose application mode">
                <span>Applying as:</span>
                {applyModeOptions.map((option) => {
                  const isRecommended = modeRecommendation.recommendedMode === option.id;
                  return (
                  <label key={option.id}>
                    <input
                      type="checkbox"
                      checked={applicationMode === option.id}
                      onChange={() => selectApplicationMode(option.id)}
                    />
                    <span>{option.label}{isRecommended ? " recommended" : ""}</span>
                  </label>
                  );
                })}
              </div>
              <p className={styles.modeRecommendation}>{modeRecommendation.summary}</p>
            </section>
            <section>
              <strong>Job review</strong>
              <p>{job.companyName} · {salary} · {job.location}</p>
              <p>Fit: {job.fitBucket} / {job.fitScore}. {job.fitSummary}</p>
            </section>
            <section>
              <strong>Remote read</strong>
              <p>Posting: {job.postingRemoteLanguage ?? job.location}</p>
              <p>System: {job.remoteSystemRead ?? job.remoteType}</p>
              <p>Evidence: {job.remoteEvidenceSummary ?? "No remote exception evidence recorded yet."} Confidence: {job.remoteConfidenceScore ?? 0}/5</p>
            </section>
            <section>
              <strong>Recommended strategy</strong>
              <p>{job.outreachAngle}</p>
              {job.riskFlags.length > 0 && <p>Risks: {job.riskFlags.join(" · ")}</p>}
            </section>
          </div>
        )}

        {step === 1 && (
          <div className={styles.modalStack}>
            <section className={styles.copyGenerationPanel}>
              <div>
                <strong>Contact identification</strong>
                <p>Select one or more contacts for outreach. Research now starts with the likely reporting chain: owning function, manager layer, functional leader, then recruiter.</p>
                {isResearchingContacts && <ProgressLine label="Building reporting chain and verifying current contacts" />}
                {!isResearchingContacts && contactResearchStatus && <p className={styles.formSuccess}>{contactResearchStatus}</p>}
                {contactResearchError && <p className={styles.formError}>{contactResearchError}</p>}
              </div>
              <button type="button" className={`${styles.modalBtnSave} ${styles.generateMessageBtn}`} onClick={researchContacts} disabled={isResearchingContacts}>
                {isResearchingContacts ? "Researching..." : contacts.length > 0 ? "Re-research Contacts" : "Research Contacts"}
              </button>
            </section>
            {contacts.length === 0 ? (
              <section>
                <strong>No contact suggestions yet</strong>
                <p>{contactResearchRan ? "Search completed, but no credible reporting-chain contacts were found. You can still generate a no-contact outreach note in the next step, or search manually by function owner, one-level-up leader, then recruiter." : "Run contact research to find likely reporting-chain contacts, or continue and generate a no-contact outreach note."}</p>
              </section>
            ) : contacts.map((contact) => (
              <label key={contact.id} className={styles.contactSuggestion}>
                <input
                  type="checkbox"
                  checked={selectedContactIds.includes(contact.id)}
                  onChange={() => toggleContact(contact.id)}
                />
                <span>
                  <strong>{contact.name}</strong>
                  <em>{contactRoleLabel(contact)} · {contact.title} · {contact.contactType.replaceAll("_", " ")}</em>
                  <b>{ratingStars(contact.outreachFitRating)} · {contact.confidenceScore}% confidence · {contact.verified ? "Verified" : "Unverified lead"}</b>
                  {contact.relevanceReason && <small>{contact.relevanceReason}</small>}
                  {contact.roleConnection && contact.roleConnection !== contact.relevanceReason && (
                    <small>{contact.roleConnection}</small>
                  )}
                  <small>{contact.verified ? "Current company evidence recorded." : "Confirm this person before reaching out."}</small>
                  {contact.riskNotes.length > 0 && <small>Note: {contact.riskNotes.join(" · ")}</small>}
                  {contact.linkedinUrl && (
                    <span className={styles.contactLinks}>
                      <a href={contact.linkedinUrl} target="_blank" rel="noreferrer" className={styles.seeProfileBtn}>See LI Profile</a>
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className={styles.modalStack}>
            <section className={styles.copyGenerationPanel}>
              <div>
                <strong>Tailored outreach message</strong>
                <p>Template messaging is below. Generate a fresh draft for the selected contacts, or a no-contact note when none are selected.</p>
                {isGeneratingCopy && <ProgressLine label="Drafting outreach from the role and dossier" />}
                {copyError && <p className={styles.formError}>{copyError}</p>}
              </div>
              <button type="button" className={`${styles.modalBtnSave} ${styles.generateMessageBtn}`} onClick={generateCopy} disabled={isGeneratingCopy}>
                {isGeneratingCopy ? "Generating..." : "Generate New Message"}
              </button>
            </section>
            {selectedContacts.length === 0 ? (
              activeDraft.generatedMessages.map((message) => (
                <section key={message.contactId}>
                  <div className={styles.copyHeader}>
                    <strong>No-contact outreach</strong>
                    <CopyButton text={message.messageText} label="No-contact outreach message" />
                  </div>
                  <textarea
                    value={message.messageText}
                    rows={5}
                    className={styles.messageTextarea}
                    onChange={(event) => updateDraftMessage(message.contactId, { messageText: event.target.value, approved: false })}
                  />
                  <label className={styles.messageApproval}>
                    <input
                      type="checkbox"
                      checked={message.approved === true}
                      onChange={(event) => updateDraftMessage(message.contactId, { approved: event.target.checked, rejectedReason: event.target.checked ? undefined : message.rejectedReason })}
                    />
                    Save as approved Randall voice example
                  </label>
                </section>
              ))
            ) : activeDraft.generatedMessages.map((message) => (
              <section key={message.contactId}>
                <div className={styles.copyHeader}>
                  <strong>{message.contactName}</strong>
                  <CopyButton text={message.messageText} label={`${message.contactName} message`} />
                </div>
                <textarea
                  value={message.messageText}
                  rows={5}
                  className={styles.messageTextarea}
                  onChange={(event) => updateDraftMessage(message.contactId, { messageText: event.target.value, approved: false })}
                />
                <div className={styles.messageReviewRow}>
                  <label className={styles.messageApproval}>
                    <input
                      type="checkbox"
                      checked={message.approved === true}
                      onChange={(event) => updateDraftMessage(message.contactId, { approved: event.target.checked, rejectedReason: event.target.checked ? undefined : message.rejectedReason })}
                    />
                    Save as approved Randall voice example
                  </label>
                  <select
                    value={message.rejectedReason ?? ""}
                    onChange={(event) => updateDraftMessage(message.contactId, { rejectedReason: event.target.value || undefined, approved: false })}
                    aria-label="Rejected message reason"
                  >
                    <option value="">No rejection note</option>
                    <option value="too corporate">Too corporate</option>
                    <option value="too generic">Too generic</option>
                    <option value="wrong proof">Wrong proof</option>
                    <option value="too formal">Too formal</option>
                    <option value="too long">Too long</option>
                    <option value="wrong posture">Wrong posture</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                {contacts.find((contact) => contact.id === message.contactId)?.linkedinUrl && (
                  <a href={contacts.find((contact) => contact.id === message.contactId)?.linkedinUrl} target="_blank" rel="noreferrer" className={styles.modalInlineLink}>
                    Open LinkedIn profile
                  </a>
                )}
              </section>
            ))}
            <section>
              <strong>What this role needs</strong>
              <JobMatchSections descriptionText={job.descriptionText} resumeTerms={resumeTerms} limit={6} />
            </section>
            <section>
              <div className={styles.copyHeader}>
                <strong>Resume notes</strong>
                <CopyButton text={activeDraft.resumeNotesText} label="resume notes" />
              </div>
              <ul>
                {activeDraft.resumeNotesText.split("\n").filter(Boolean).map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {step === 3 && (
          <div className={styles.modalStack}>
            <section>
              <strong>Application tracking</strong>
              <p>Check what happened. Saving this screen will move the role into the right pipeline state.</p>
            </section>
            <div className={styles.checklistGrid}>
              {[
                "Applied online",
                "Applied via LinkedIn",
                ...selectedContacts.map((contact) => `Messaged ${contact.name}`),
                "Sent email",
                "Saved for follow-up",
                "Needs resume adjustment",
                "Needs cover letter revision",
                "No action taken",
                "Skipped after review",
              ].map((action) => (
                <label key={action}>
                  <input
                    type="checkbox"
                    checked={completedActions.includes(action)}
                    onChange={() => toggleAction(action)}
                  />
                  <span>{action}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className={styles.modalFooter}>
          {step > 0 && (
            <button type="button" className={styles.modalBtnClose} onClick={() => setStep((current) => current - 1)}>
              Back
            </button>
          )}
          <a href={job.applyUrl} target="_blank" rel="noreferrer" className={styles.modalBtnClose}>
            Open apply link
          </a>
          {step < 3 ? (
            <button type="button" className={styles.modalBtnSave} onClick={() => setStep((current) => current + 1)}>
              Continue
            </button>
          ) : (
            <button type="button" className={styles.modalBtnSave} onClick={saveActions} disabled={isPending}>
              {isPending ? "Saving..." : "Save actions"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MatchFeedbackControl({
  job,
  feedback,
  isPending,
  onSaveFeedback,
}: {
  job: Job;
  feedback?: JobMatchFeedback;
  isPending: boolean;
  onSaveFeedback: (feedback: MatchFeedbackCreate) => Promise<boolean>;
}) {
  const [selectedRating, setSelectedRating] = useState<JobMatchFeedback["rating"] | null>(feedback?.rating ?? null);
  const [reason, setReason] = useState(feedback?.reason ?? "");
  const [savedMessage, setSavedMessage] = useState(feedback ? "Feedback saved" : "");

  async function saveRating(rating: JobMatchFeedback["rating"], nextReason = reason) {
    setSelectedRating(rating);
    if (rating < 4 && nextReason.trim().length === 0) {
      setSavedMessage("");
      return;
    }

    const saved = await onSaveFeedback({
      jobId: job.id,
      rating,
      reason: rating < 4 ? nextReason.trim().slice(0, 200) : "",
      matchVersion: randallPrivateMatchingConfig.rulesVersion,
    });

    if (saved) setSavedMessage("Feedback saved");
  }

  const showReason = selectedRating !== null && selectedRating < 4;

  return (
    <div className={styles.feedbackBox}>
      <div className={styles.feedbackHeader}>
        <span>Rate this match for learning</span>
        {savedMessage && <small>{savedMessage}</small>}
      </div>
      <div className={styles.feedbackStars} aria-label="Rate this match">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            className={`${styles.feedbackStar}${selectedRating !== null && rating <= selectedRating ? ` ${styles.feedbackStarActive}` : ""}`}
            aria-label={`${rating} star${rating !== 1 ? "s" : ""}`}
            disabled={isPending}
            onClick={() => void saveRating(rating as JobMatchFeedback["rating"])}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill={selectedRating !== null && rating <= selectedRating ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        ))}
      </div>
      {showReason && (
        <label className={styles.feedbackReason}>
          <span>What felt off?</span>
          <textarea
            value={reason}
            maxLength={200}
            rows={2}
            placeholder="Too legal. Not enough creative ops. Sounds junior."
            disabled={isPending}
            onChange={(event) => {
              setReason(event.target.value.slice(0, 200));
              setSavedMessage("");
            }}
            onBlur={() => {
              if (selectedRating) void saveRating(selectedRating, reason);
            }}
          />
          <small>{reason.length}/200</small>
        </label>
      )}
    </div>
  );
}

function buildHighlightRegex(terms: string[]): RegExp | null {
  const cleaned = Array.from(
    new Set(terms.map((term) => term.trim().toLowerCase()).filter((term) => term.length >= 3))
  )
    .sort((a, b) => b.length - a.length)
    .slice(0, 80);
  if (cleaned.length === 0) return null;
  const escaped = cleaned.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(${escaped.join("|")})`, "gi");
}

function highlightSnippet(text: string, regex: RegExp | null) {
  if (!regex) return text;
  // String.split with a single capturing group puts the matched terms at odd indices.
  return text.split(regex).map((part, index) =>
    index % 2 === 1
      ? <mark key={index} className={styles.matchHighlight}>{part}</mark>
      : <span key={index}>{part}</span>
  );
}

function JobMatchSections({
  descriptionText,
  resumeTerms,
  limit = 4,
}: {
  descriptionText: string;
  resumeTerms: string[];
  limit?: number;
}) {
  const sections = useMemo(() => extractJobSections(descriptionText), [descriptionText]);
  const regex = useMemo(() => buildHighlightRegex(resumeTerms), [resumeTerms]);
  const responsibilities = sections.responsibilitySnippets.slice(0, limit);
  const experience = sections.experienceSnippets.slice(0, limit);

  if (responsibilities.length === 0 && experience.length === 0) return null;

  return (
    <div className={styles.matchSections}>
      {responsibilities.length > 0 && (
        <div className={styles.matchSection}>
          <span className={styles.matchSectionLabel}>Responsibilities</span>
          <ul className={styles.matchSectionList}>
            {responsibilities.map((snippet, index) => (
              <li key={`r-${index}`}>{highlightSnippet(snippet, regex)}</li>
            ))}
          </ul>
        </div>
      )}
      {experience.length > 0 && (
        <div className={styles.matchSection}>
          <span className={styles.matchSectionLabel}>Required experience</span>
          <ul className={styles.matchSectionList}>
            {experience.map((snippet, index) => (
              <li key={`e-${index}`}>{highlightSnippet(snippet, regex)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function JobCard({
  job,
  index,
  resumeTerms,
  pendingJobId,
  pendingFeedbackJobId,
  feedback,
  onUpdateStatus,
  onSaveFeedback,
  onApply,
}: {
  job: Job;
  index: number;
  resumeTerms: string[];
  pendingJobId: string | null;
  pendingFeedbackJobId: string | null;
  feedback?: JobMatchFeedback;
  onUpdateStatus: (jobId: string, status: JobStatus) => void;
  onSaveFeedback: (feedback: MatchFeedbackCreate) => Promise<boolean>;
  onApply: (job: Job) => void;
}) {
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryText);
  const isPending = pendingJobId === job.id;
  const isFeedbackPending = pendingFeedbackJobId === job.id;
  const isWeirdMatch = job.fitScore >= 50 && job.fitScore < 75;
  const risks = visibleRiskFlags(job);

  return (
    <article className={`${styles.card} ${styles.jobCard}`}>
      <div className={styles.jobCardHeader}>
        <div className={styles.jobNumberTitle}>
          <span className={styles.jobNumber}>{index}</span>
          <h3 className={styles.jobTitle}>{job.title} <span>| {job.companyName}</span></h3>
        </div>
        {isWeirdMatch && (
          <span className={styles.weirdMatchTag} title="This isn’t perfect, but it could work.">
            Weird match
          </span>
        )}
      </div>
      <StarRating score={job.fitScore} />
      <dl className={styles.jobMetaGrid}>
        <div>
          <dt>Job Posting</dt>
          <dd>{sourceLabelFromJob(job)}</dd>
        </div>
        <div>
          <dt>Salary</dt>
          <dd>{salary}</dd>
        </div>
        <div>
          <dt>Remote</dt>
          <dd>{remoteLabel(job.remoteType)}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{job.location || "not defined"}</dd>
        </div>
      </dl>
      <div className={styles.descriptionBox}>
        <p className={styles.descriptionText}>{excerptText(job.descriptionText)}</p>
        {job.descriptionText.length > 420 && (
          <small className={styles.descriptionMeta}>Full posting text saved for pursuit details and pursued-jobs export.</small>
        )}
        {job.whyItMatches.length > 0 && (
          <div className={styles.keywordPills}>
            {job.whyItMatches.map((keyword) => (
              <span key={keyword} className={styles.keywordPill}>{keyword}</span>
            ))}
          </div>
        )}
        <JobMatchSections descriptionText={job.descriptionText} resumeTerms={resumeTerms} />
      </div>
      <p className={styles.fitSummary}>{job.fitSummary}</p>
      {risks.length > 0 && (
        <div className={styles.flagRow}>
          <span className={styles.flagText}>{risks.join(" · ")}</span>
        </div>
      )}
      <MatchFeedbackControl
        job={job}
        feedback={feedback}
        isPending={isFeedbackPending}
        onSaveFeedback={onSaveFeedback}
      />
      <div className={styles.actionRail}>
        <button type="button" className={styles.btnSave} disabled={isPending} onClick={() => onUpdateStatus(job.id, "saved")}>
          {isPending ? "Saving..." : "Save"}
        </button>
        <button type="button" className={styles.btnSkip} disabled={isPending} onClick={() => onUpdateStatus(job.id, "skipped")}>
          {isPending ? "Skipping..." : "Skip"}
        </button>
        <a href={job.sourceUrl} target="_blank" rel="noreferrer" className={styles.btnSource}>
          Source &#x2197;
        </a>
        <button type="button" className={styles.btnApply} disabled={isPending} onClick={() => onApply(job)}>
          Apply
        </button>
      </div>
    </article>
  );
}

function CompanyCard({
  company,
  onEdit,
}: {
  company: Company;
  onEdit: (company: Company) => void;
}) {
  const connectorPlan = buildConnectorPlan(company);

  return (
    <article className={styles.card}>
      <div className={styles.jobCardHeader}>
        <div className={styles.jobNumberTitle}>
          <span className={styles.industryTag}>{company.industryBucket}</span>
          <h3 className={styles.jobTitle}>{company.companyName}</h3>
        </div>
        <EditButton label={company.companyName} onClick={() => onEdit(company)} />
      </div>
      <div className={styles.companyMeta}>
        <div className={styles.companyMetaItem}>
          <span className={styles.metaLabel}>Remote fit</span>
          <span className={styles.metaValue}>{company.remoteLikelihood}</span>
        </div>
        <div className={styles.companyMetaItem}>
          <span className={styles.metaLabel}>Status</span>
          <span className={styles.metaValue}>{company.status.replaceAll("_", " ")}</span>
        </div>
      </div>
      <div className={styles.companySourceRow}>
        <span>{jobBoardTypeLabel(company.atsProvider)}</span>
        {company.careersUrl && (
          <a href={company.careersUrl} target="_blank" rel="noreferrer">
            Careers &#x2197;
          </a>
        )}
      </div>
      {!connectorPlan.canPreview && connectorPlan.warnings.length > 0 && (
        <p className={styles.companySourceWarning}>{connectorPlan.warnings.join(" ")}</p>
      )}
      <p className={styles.companyNote}>{company.notes}</p>
      {company.lastError && <p className={styles.companyError}>{company.lastError}</p>}
    </article>
  );
}

function AddCompanyCard({ onAdd }: { onAdd: () => void }) {
  return (
    <button type="button" className={styles.addCompanyCard} onClick={onAdd} aria-label="Add company to watchlist">
      <span className={styles.addCompanyIcon} aria-hidden="true">+</span>
      <span>Add company</span>
    </button>
  );
}

function ScanCard({ log }: { log: ScanLog }) {
  const isWarn = log.status !== "completed";
  return (
    <article className={styles.card}>
      <span className={`${styles.scanStatusBadge}${isWarn ? ` ${styles.scanStatusBadgeWarn}` : ""}`}>
        {log.status.replaceAll("_", " ")}
      </span>
      <span className={styles.scanDate}>{formatDate(log.completedAt)}</span>
      <p className={styles.scanCounts}>
        {log.companiesScanned} companies &middot; {log.jobsFound} relevant
      </p>
      <p className={styles.scanCounts}>
        {log.newJobsAdded} new &middot; {log.jobsUpdated} updated &middot; {log.jobsClosed} closed
      </p>
      {log.errors.length > 0 && (
        <p className={styles.scanError}>{log.errors.join(" ")}</p>
      )}
    </article>
  );
}

function PreviousApplicationsSection({
  jobs,
  applicationActions,
}: {
  jobs: Job[];
  applicationActions: ApplyWizardSubmission[];
}) {
  const [filter, setFilter] = useState<"all" | "applied" | "saved" | "skipped" | "no_action">("all");
  const [detailJob, setDetailJob] = useState<Job | null>(null);
  const addressedJobs = useMemo(() => {
    const actionJobIds = new Set(applicationActions.map((action) => action.jobId));
    const latestActionAt = new Map(applicationActions.map((action) => [action.jobId, action.savedAt]));

    return jobs
      .filter((job) => actionJobIds.has(job.id))
      .sort((a, b) => (latestActionAt.get(b.id) ?? "").localeCompare(latestActionAt.get(a.id) ?? ""));
  }, [applicationActions, jobs]);

  const tabs = [
    { id: "all", label: "All" },
    { id: "applied", label: "Applied" },
    { id: "saved", label: "Saved" },
    { id: "skipped", label: "Skipped" },
    { id: "no_action", label: "No action" },
  ] as const;

  const filtered = addressedJobs.filter((job) => {
    if (filter === "all") return true;
    if (filter === "applied") return job.status === "applied" || job.status === "messaged";
    if (filter === "saved") return job.status === "saved";
    if (filter === "skipped") return job.status === "skipped";
    return job.status === "reviewed";
  });

  const counts = {
    all: addressedJobs.length,
    applied: addressedJobs.filter((job) => job.status === "applied" || job.status === "messaged").length,
    saved: addressedJobs.filter((job) => job.status === "saved").length,
    skipped: addressedJobs.filter((job) => job.status === "skipped").length,
    no_action: addressedJobs.filter((job) => job.status === "reviewed").length,
  };

  return (
    <section className={styles.section}>
      <div className={styles.sectionIntro}>
        <div className={styles.kickerRow}>
          <span className={styles.kicker}>Previous Applications</span>
        </div>
        <h2>Find your previous roles and applications here.</h2>
      </div>
      <div className={styles.filterRow} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={filter === tab.id}
            className={`${styles.filterTab}${filter === tab.id ? ` ${styles.filterTabActive}` : ""}`}
            onClick={() => setFilter(tab.id)}
          >
            {tab.label}
            <span className={styles.tabCount}>{counts[tab.id]}</span>
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className={styles.emptyState}>Nothing in this category yet.</p>
      ) : (
        <div className={`${styles.cardGrid} ${styles.threeColumn}`}>
          {filtered.map((job) => {
            const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryText);
            const jobActions = applicationActions.filter((action) => action.jobId === job.id);
            const latestAction = jobActions[0];
            return (
              <article key={job.id} className={styles.card}>
                <div className={styles.jobCardHeader}>
                  <h3 className={styles.jobTitle}>{job.title}</h3>
                  <div className={styles.cardHeaderActions}>
                    <span className={styles.statusBadge}>{statusLabels[job.status] ?? job.status}</span>
                  </div>
                </div>
                <StarRating score={job.fitScore} />
                <p className={styles.jobMeta}>
                  {job.companyName} &middot; {salary} &middot; {job.remoteType}
                </p>
                <p className={styles.fitSummary}>{job.fitSummary}</p>
                {job.notes && <p className={styles.privateNote}>{job.notes}</p>}
                {latestAction && (
                  <div className={styles.actionHistoryInline}>
                    <span className={styles.actionHistoryLabel}>Latest action</span>
                    <strong>{actionSummary(latestAction)}</strong>
                    {actionStats(latestAction) && <small>{actionStats(latestAction)}</small>}
                    {jobActions.length > 1 && <small>{jobActions.length} saved wizard sessions</small>}
                  </div>
                )}
                <button type="button" className={styles.detailsButton} onClick={() => setDetailJob(job)}>
                  See details
                </button>
              </article>
            );
          })}
        </div>
      )}
      {detailJob && (
        <ApplicationDetailsModal
          job={detailJob}
          actions={applicationActions.filter((action) => action.jobId === detailJob.id)}
          onClose={() => setDetailJob(null)}
        />
      )}
    </section>
  );
}

function ApplicationDetailsModal({
  job,
  actions,
  onClose,
}: {
  job: Job;
  actions: ApplyWizardSubmission[];
  onClose: () => void;
}) {
  const latestAction = actions[0];
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryText);

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={`Application details for ${job.title}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.modalBox}>
        <div className={styles.modalHeader}>
          <h4 className={styles.modalTitle}>Application details: {job.title}</h4>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.modalStack}>
          <section>
            <strong>Role snapshot</strong>
            <div className={styles.detailGrid}>
              <span>Company: {job.companyName}</span>
              <span>Status: {statusLabels[job.status] ?? job.status}</span>
              <span>Fit: {job.fitBucket} / {job.fitScore}</span>
              <span>Comp: {salary}</span>
              <span>Remote: {job.remoteType}</span>
              <span>Source: {job.sourceProvider}</span>
            </div>
            <p>{job.fitSummary}</p>
            {job.notes && <p className={styles.privateNote}>{job.notes}</p>}
          </section>

          {latestAction ? (
            <>
              <section>
                <strong>Track actions</strong>
                <div className={styles.detailGrid}>
                  <span>Saved: {formatDate(latestAction.savedAt)}</span>
                  <span>Mode: {getApplyModeOption(latestAction.applicationMode).label}</span>
                  <span>Contacts: {latestAction.selectedContactIds.length}</span>
                  <span>Sessions: {actions.length}</span>
                </div>
                {latestAction.completedActions.length > 0 ? (
                  <ul>
                    {latestAction.completedActions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No track actions saved yet.</p>
                )}
              </section>

              {latestAction.generatedMessages.length > 0 && (
                <section>
                  <strong>Outreach drafts</strong>
                  {latestAction.generatedMessages.map((message) => (
                    <div key={`${message.contactId}-${message.contactName}`} className={styles.detailTextBlock}>
                      <div className={styles.copyHeader}>
                        <strong>{message.contactName}</strong>
                        <CopyButton text={message.messageText} label={`${message.contactName} saved message`} />
                      </div>
                      <p>{message.messageText}</p>
                    </div>
                  ))}
                </section>
              )}

              {latestAction.coverLetterText && (
                <section>
                  <div className={styles.copyHeader}>
                    <strong>Application note</strong>
                    <CopyButton text={latestAction.coverLetterText} label="saved application note" />
                  </div>
                  <p>{latestAction.coverLetterText}</p>
                </section>
              )}

              {latestAction.resumeNotesText && (
                <section>
                  <div className={styles.copyHeader}>
                    <strong>Resume notes</strong>
                    <CopyButton text={latestAction.resumeNotesText} label="saved resume notes" />
                  </div>
                  <ul>
                    {latestAction.resumeNotesText.split("\n").filter(Boolean).map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </section>
              )}

              {latestAction.notes && (
                <section>
                  <strong>Session notes</strong>
                  <p>{latestAction.notes}</p>
                </section>
              )}
            </>
          ) : (
            <section>
              <strong>No Apply Wizard session</strong>
              <p>This role has a status history, but no saved Step 4 tracking details yet.</p>
            </section>
          )}
        </div>

        <div className={styles.modalFooter}>
          <a href={job.applyUrl} target="_blank" rel="noreferrer" className={styles.modalBtnClose}>
            Open apply link
          </a>
          <button type="button" className={styles.modalBtnSave} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardClient({
  initialState,
  activeMatching,
}: {
  initialState: DashboardState;
  activeMatching: ActiveMatchingSummary;
}) {
  const { dashboardState, applyDashboardState, scheduledScanPreview, scanProgress, companyImportSummary, pendingJobId, pendingFeedbackJobId, error, isScanning, isUpdatingProfile, isCompilingProfile, isUpdatingCompany, isUpdatingSettings, isFetchingConnector, isApplyingConnector, isPreviewingPayload, isPreviewingBatch, isFetchingBatch, isApplyingBatch, connectorPlan, connectorFetchPreview, connectorPreviewMode, connectorApplySummary, connectorBatchPlan, connectorBatchFetchResults, connectorBatchApplyResults, updateStatus, saveApplyWizard, saveFeedback, runScan, updateProfile, compileOnboardingProfile, updateCompany, createCompany, importCompanyList, updateSettings, previewConnectorBatch, fetchConnectorBatchPreview, applyConnectorBatch, fetchConnectorPreview, previewConnectorPayload, applyConnectorPreview, applyConnectorPayload, clearConnectorPlan, clearConnectorBatchPlan, clearCompanyImportSummary, clearScanProgress } = useDashboardActions(initialState);
  const [applyJob, setApplyJob] = useState<Job | null>(null);
  const matchListRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  // Desktop: keep the matches scroll window the same height as the configuration
  // column so the two columns end at the same point. Mobile (single column) keeps
  // the CSS default.
  useEffect(() => {
    const list = matchListRef.current;
    const sidebar = sidebarRef.current;
    if (!list || !sidebar) return;
    const sync = () => {
      if (window.matchMedia("(max-width: 960px)").matches) {
        list.style.maxHeight = "";
        return;
      }
      // The matches list starts below the star-filter row, so subtract that offset
      // from the sidebar height to make both columns bottom-align.
      const offset = list.getBoundingClientRect().top - sidebar.getBoundingClientRect().top;
      list.style.maxHeight = `${Math.max(360, sidebar.offsetHeight - offset)}px`;
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(sidebar);
    window.addEventListener("resize", sync);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [onboardingProfileOpen, setOnboardingProfileOpen] = useState(false);
  const [companyEdit, setCompanyEdit] = useState<Company | null>(null);
  const [companyCreateOpen, setCompanyCreateOpen] = useState(false);
  const [companyImportOpen, setCompanyImportOpen] = useState(false);
  const [selectedStarRatings, setSelectedStarRatings] = useState(() => new Set([5, 4, 3, 2, 1]));
  const [activeMatchingState, setActiveMatchingState] = useState(activeMatching);
  const { applicationActions, companies, contactSuggestions, jobs, matchFeedback, scanLogs, searchProfile, settings } = dashboardState;
  const feedbackByJobId = useMemo(() => new Map(matchFeedback.map((feedback) => [feedback.jobId, feedback])), [matchFeedback]);
  const displayScanLogs = useMemo(() => groupedScanLogsForDisplay(scanLogs), [scanLogs]);
  const sourceCoverage = useMemo(() => connectedSearchSources(companies, searchProfile).summary, [companies, searchProfile]);
  // Generated broad-board sources are persisted only to satisfy the jobs foreign key; they are
  // not user-managed target companies, so keep them out of the Watchlist.
  const watchlistCompanies = useMemo(() => companies.filter((company) => !company.id.startsWith("generated-broad-")), [companies]);

  const reviewableJobs = jobs.filter((job) => job.status === "new" || job.status === "saved").sort((a, b) => b.fitScore - a.fitScore);
  const ratingForJob = (job: Job) => Math.min(5, Math.max(1, Math.round(job.fitScore / 20)));
  const matchStarBuckets = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: reviewableJobs.filter((job) => ratingForJob(job) === rating).length,
  }));
  const displayedMatches = reviewableJobs.filter((job) => selectedStarRatings.has(ratingForJob(job)));
  const latestScan = displayScanLogs[0];
  const scanIsWarn = latestScan.status !== "completed";

  async function saveApplyActions(submission: ApplyWizardSubmission) {
    const saved = await saveApplyWizard(submission);
    if (saved) setApplyJob(null);
  }

  function compileProfileAndTrackMatcher(
    payload: OnboardingProfilePayload,
    action: "preview" | "apply",
    onSaved: (result: OnboardingProfileResult) => void
  ) {
    compileOnboardingProfile(payload, action, (result) => {
      if (action === "apply") {
        setActiveMatchingState({
          source: "compiled_profile",
          rulesVersion: result.compiledProfile.matchingConfig.rulesVersion,
        });
      }

      onSaved(result);
    });
  }

  return (
    <main className={styles.page}>
      <div className={styles.meshBg} aria-hidden="true" />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroTitleRow}>
            <h1>The Job Market Is a Dumpster Fire</h1>
            <Image
              src={mascotImg}
              alt=""
              width={200}
              height={200}
              className={styles.heroMascot}
              aria-hidden="true"
              priority
            />
          </div>
          <p>
            Private role tracking, fit scoring, and morning triage. Each scan pulls open roles,
            scores them against your profile, and surfaces the strongest matches first.
          </p>
        </div>
      </section>

      {error && <p className={styles.actionError}>{error.message}</p>}

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <div className={styles.kickerRow}>
            <span className={styles.kicker}>Today&rsquo;s Best Matches</span>
          </div>
          <h2>
            Last scan {formatDate(latestScan.completedAt)}
            <span className={`${styles.scanBadge}${scanIsWarn ? ` ${styles.scanBadgeWarn}` : ""}`}>
              {latestScan.status.replaceAll("_", " ")}
            </span>
          </h2>
        </div>

        <div className={styles.dashboardGrid}>
          <div className={styles.dashboardMain}>
            <div className={styles.ratingFilterGrid} aria-label="Filter matches by star rating">
              {matchStarBuckets.map((bucket) => {
                const isActive = selectedStarRatings.has(bucket.rating);
                return (
                  <button
                    key={bucket.rating}
                    type="button"
                    className={`${styles.ratingFilterBtn}${isActive ? ` ${styles.ratingFilterBtnActive}` : ""}`}
                    aria-pressed={isActive}
                    onClick={() => {
                      setSelectedStarRatings((currentRatings) => {
                        const nextRatings = new Set(currentRatings);

                        if (nextRatings.has(bucket.rating)) {
                          if (nextRatings.size === 1) return nextRatings;
                          nextRatings.delete(bucket.rating);
                        } else {
                          nextRatings.add(bucket.rating);
                        }

                        return nextRatings;
                      });
                    }}
                  >
                    <StarBucketLabel rating={bucket.rating} />
                    <strong>{bucket.count}</strong>
                  </button>
                );
              })}
            </div>
            <div className={styles.matchList} ref={matchListRef}>
              {displayedMatches.length > 0
                ? displayedMatches.map((job, index) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    index={index + 1}
                    resumeTerms={searchProfile.positiveKeywords}
                    pendingJobId={pendingJobId}
                    pendingFeedbackJobId={pendingFeedbackJobId}
                    feedback={feedbackByJobId.get(job.id)}
                    onUpdateStatus={updateStatus}
                    onSaveFeedback={saveFeedback}
                    onApply={setApplyJob}
                  />
                ))
                : <p className={styles.emptyState}>No roles match within current search parameters.</p>}
            </div>
          </div>

          <aside className={styles.dashboardSidebar} ref={sidebarRef}>
            <div className={styles.card}>
              <div className={styles.panelHeaderRow}>
                <h3 className={styles.sidebarHeading}>Overview</h3>
                <EditButton label="Overview" onClick={() => setOverviewOpen(true)} />
              </div>
              <div className={styles.ccScanRow}>
                <span className={styles.dimText}>Last scan</span>
                <span className={styles.scanDate}>{formatDate(latestScan.completedAt)}</span>
                <span className={`${styles.scanStatusBadge}${scanIsWarn ? ` ${styles.scanStatusBadgeWarn}` : ""}`}>
                  {latestScan.status.replaceAll("_", " ")}
                </span>
              </div>
              {latestScan.errors.length > 0 && (
                <p className={styles.scanError}>{latestScan.errors.join(" ")}</p>
              )}
              <div className={styles.scanPreviewSummary}>
                <span>{sourceCoverage.totalSources} active sources</span>
                <span>{sourceCoverage.broadSources} broad</span>
                <span>{sourceCoverage.targetedSources} targeted</span>
              </div>
              <button type="button" className={styles.scanNowBtn} disabled={isScanning} onClick={runScan}>
                {isScanning ? "Scanning..." : "Scan"}
              </button>
              <button type="button" className={styles.scanSecondaryBtn} onClick={() => setDigestOpen(true)}>
                Schedule Daily Digest Email
              </button>
              <a className={styles.scanSecondaryBtn} href="/scans/admin/tuning">
                Review &amp; Learning Dashboard
              </a>
              {scheduledScanPreview && (
                <div className={styles.scanPreviewSummary}>
                  {scheduledScanPreview.skipped ? (
                    <span>{scheduledScanPreview.reason}</span>
                  ) : (
                    <>
                      {scheduledScanPreview.message && <span>{scheduledScanPreview.message}</span>}
                      <span>{scheduledScanPreview.checkedCompanies} companies checked</span>
                      {typeof scheduledScanPreview.totalFetched === "number" && <span>{scheduledScanPreview.totalFetched} fetched</span>}
                      {typeof scheduledScanPreview.totalRelevant === "number" && <span>{scheduledScanPreview.totalRelevant} relevant</span>}
                      {typeof scheduledScanPreview.inserted === "number"
                        ? <span>{scheduledScanPreview.inserted} added</span>
                        : typeof scheduledScanPreview.newJobs === "number" && <span>{scheduledScanPreview.newJobs} new</span>}
                      {typeof scheduledScanPreview.updated === "number"
                        ? <span>{scheduledScanPreview.updated} updated</span>
                        : typeof scheduledScanPreview.existingJobs === "number" && <span>{scheduledScanPreview.existingJobs} existing</span>}
                      {typeof scheduledScanPreview.closed === "number" && <span>{scheduledScanPreview.closed} archived</span>}
                      <span>{scheduledScanPreview.ready} sources applied</span>
                      <span>{scheduledScanPreview.blocked} blocked</span>
                      <span>{scheduledScanPreview.errors} errors</span>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className={`${styles.card} ${styles.cardSpacedTop}`}>
              <div className={styles.panelHeaderRow}>
                <h3 className={styles.sidebarHeading}>Configuration</h3>
                <EditButton label="Configuration" onClick={() => setConfigurationOpen(true)} />
              </div>
              <div className={styles.configStats}>
                <div className={styles.configStat}>
                  <span className={styles.metaLabel}>Remote only</span>
                  <strong className={styles.metaValue}>{searchProfile.remoteOnly ? "On" : "Off"}</strong>
                </div>
                <div className={styles.configStat}>
                  <span className={styles.metaLabel}>Base floor</span>
                  <strong className={styles.metaValue}>${Math.round(searchProfile.compensationFloor / 1000)}k</strong>
                </div>
                <div className={styles.configStat}>
                  <span className={styles.metaLabel}>Freelance floor</span>
                  <strong className={styles.metaValue}>${searchProfile.freelanceRateFloor}/hr</strong>
                </div>
                <div className={styles.configStat}>
                  <span className={styles.metaLabel}>Do-not-apply</span>
                  <strong className={styles.metaValue}>{searchProfile.doNotApplyCompanies.length} companies</strong>
                </div>
                <div className={styles.configStat}>
                  <span className={styles.metaLabel}>Matcher</span>
                  <strong className={styles.metaValue}>{matchingSourceLabel(activeMatchingState.source)}</strong>
                </div>
                <div className={styles.configStat}>
                  <span className={styles.metaLabel}>Rules</span>
                  <strong className={styles.metaValue} title={activeMatchingState.rulesVersion}>
                    {matchingRulesLabel(activeMatchingState.rulesVersion)}
                  </strong>
                </div>
              </div>
              <div className={styles.keywordCloud}>
                {searchProfile.targetTitles.slice(0, 7).map((title) => (
                  <span key={title} className={styles.keyword}>{title}</span>
                ))}
              </div>
              <div className={styles.compilerCardPrompt}>
                <strong>Build from resume/profile</strong>
                <p>Preview compiled matcher signals before applying them to the search profile.</p>
                <button type="button" className={styles.scanSecondaryBtn} onClick={() => setOnboardingProfileOpen(true)}>
                  Compile profile
                </button>
              </div>
              <div className={styles.exportPanel}>
                <div>
                  <span className={styles.premiumEyebrow}>Premium export</span>
                  <strong>Download your history as CSV</strong>
                  <p>Download your history as CSV and give it to your LLM of choice for analysis.</p>
                </div>
                <button type="button" className={styles.exportButton} disabled title="CSV export backend is not enabled yet.">
                  Download CSV
                </button>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <div className={styles.divider} aria-hidden="true" />

      <PreviousApplicationsSection jobs={jobs} applicationActions={applicationActions} />

      <div className={styles.divider} aria-hidden="true" />

      <section className={styles.section}>
        <div className={styles.sectionIntroRow}>
          <div className={styles.sectionIntro}>
            <div className={styles.kickerRow}>
              <span className={styles.kicker}>Company Watchlist</span>
            </div>
            <h2>{watchlistCompanies.length} companies in the target list.</h2>
            <p>Add companies or specific job-board URLs here. These are source inputs for the main Scan button, not separate searches.</p>
          </div>
          <div className={styles.sectionActionGroup}>
            <button type="button" className={styles.sectionActionBtn} onClick={previewConnectorBatch} disabled={isPreviewingBatch}>
              {isPreviewingBatch ? "Checking..." : "Audit sources"}
            </button>
            <button type="button" className={styles.sectionActionBtn} onClick={() => setCompanyImportOpen(true)}>
              Import list
            </button>
          </div>
        </div>
        {companyImportSummary && (
          <p className={styles.inlineSummary}>
            Imported {companyImportSummary.imported} companies · {companyImportSummary.created} created · {companyImportSummary.updated} updated · {companyImportSummary.skipped} skipped
            <button type="button" onClick={clearCompanyImportSummary}>Dismiss</button>
          </p>
        )}
        <div className={`${styles.cardGrid} ${styles.threeColumn}`}>
          {watchlistCompanies.map((company) => (
            <CompanyCard
              key={company.id}
              company={company}
              onEdit={setCompanyEdit}
            />
          ))}
          <AddCompanyCard onAdd={() => setCompanyCreateOpen(true)} />
        </div>
      </section>

      <div className={styles.divider} aria-hidden="true" />

      <section className={`${styles.section} ${styles.systemSection}`}>
        <div className={styles.sectionIntro}>
          <div className={styles.kickerRow}>
            <span className={styles.kicker}>Scan History</span>
          </div>
        </div>
        <div className={`${styles.cardGrid} ${styles.threeColumn}`}>
          {displayScanLogs.map((log) => (
            <ScanCard key={log.id} log={log} />
          ))}
        </div>
      </section>

      {applyJob && (
        <ApplyModal
          job={applyJob}
          contacts={contactSuggestions.filter((contact) => contact.jobId === applyJob.id)}
          resumeTerms={searchProfile.positiveKeywords}
          isPending={pendingJobId === applyJob.id}
          onClose={() => setApplyJob(null)}
          onSaveActions={(submission) => void saveApplyActions(submission)}
          onContactsResearched={(state) => applyDashboardState(state)}
        />
      )}

      {overviewOpen && (
        <OverviewModal
          settings={settings}
          isPending={isUpdatingSettings}
          onClose={() => setOverviewOpen(false)}
          onSave={(update) => updateSettings(update, () => setOverviewOpen(false))}
        />
      )}

      {digestOpen && (
        <DigestScheduleModal
          settings={settings}
          isPending={isUpdatingSettings}
          onClose={() => setDigestOpen(false)}
          onSave={(update) => updateSettings(update, () => setDigestOpen(false))}
        />
      )}

      {configurationOpen && (
        <ConfigurationModal
          profile={searchProfile}
          isPending={isUpdatingProfile}
          onClose={() => setConfigurationOpen(false)}
          onSave={(update) => updateProfile(update, () => setConfigurationOpen(false))}
        />
      )}

      {onboardingProfileOpen && (
        <OnboardingProfileModal
          profile={searchProfile}
          isPending={isCompilingProfile}
          onClose={() => setOnboardingProfileOpen(false)}
          onCompile={compileProfileAndTrackMatcher}
        />
      )}

      {(companyEdit || companyCreateOpen) && (
        <CompanyModal
          company={companyEdit}
          isPending={isUpdatingCompany}
          onClose={() => {
            setCompanyEdit(null);
            setCompanyCreateOpen(false);
          }}
          onSave={(companyId, update) => {
            if (companyId) {
              updateCompany(companyId, update, () => setCompanyEdit(null));
              return;
            }

            createCompany(update, () => setCompanyCreateOpen(false));
          }}
        />
      )}

      {companyImportOpen && (
        <CompanyImportModal
          isPending={isUpdatingCompany}
          onClose={() => setCompanyImportOpen(false)}
          onImport={(payloadText) => importCompanyList(payloadText, () => setCompanyImportOpen(false))}
        />
      )}

      {connectorPlan && (
        <ConnectorPreviewModal
          plan={connectorPlan}
          preview={connectorFetchPreview}
          previewMode={connectorPreviewMode}
          applySummary={connectorApplySummary}
          isFetching={isFetchingConnector}
          isPreviewingPayload={isPreviewingPayload}
          isApplying={isApplyingConnector}
          onClose={clearConnectorPlan}
          onFetchPreview={fetchConnectorPreview}
          onPreviewPayload={previewConnectorPayload}
          onApplyPreview={applyConnectorPreview}
          onApplyPayload={applyConnectorPayload}
        />
      )}

      {connectorBatchPlan && (
        <ConnectorBatchModal
          batch={connectorBatchPlan}
          results={connectorBatchFetchResults}
          applyResults={connectorBatchApplyResults}
          isFetching={isFetchingBatch}
          isApplying={isApplyingBatch}
          onClose={clearConnectorBatchPlan}
          onFetchPreviews={fetchConnectorBatchPreview}
          onApplyBatch={applyConnectorBatch}
        />
      )}

      {scanProgress && (
        <ScanProgressModal progress={scanProgress} onClose={clearScanProgress} />
      )}

    </main>
  );
}

function ScanProgressModal({ progress, onClose }: { progress: ScanProgress; onClose: () => void }) {
  const isDone = progress.phase === "done";
  const isError = progress.phase === "error";
  const isRunning = !isDone && !isError;
  const total = Math.max(progress.total, progress.done);
  const pct = total > 0 ? Math.min(100, Math.round((progress.done / total) * 100)) : isDone ? 100 : 0;

  const phaseSteps: { key: ScanProgress["phase"]; label: string }[] = [
    { key: "fetching", label: "Fetching" },
    { key: "matching", label: "Matching" },
    { key: "saving", label: "Saving" },
  ];
  const phaseOrder = ["fetching", "matching", "saving", "done"];
  const activeIndex = isDone ? phaseSteps.length : phaseOrder.indexOf(progress.phase);

  const title = isError ? "Scan stopped" : isDone ? "Scan complete" : "Scanning";

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Scan progress">
      <div className={`${styles.modalBox} ${styles.scanModal}`}>
        {isRunning && (
          <Image
            src={loadingGif}
            alt=""
            width={120}
            height={120}
            className={styles.scanLoadingGif}
            aria-hidden="true"
            unoptimized
            priority
          />
        )}
        <div className={styles.scanModalHead}>
          <h3 className={styles.scanModalTitle}>{title}</h3>
          {!isRunning && (
            <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">×</button>
          )}
        </div>

        <div className={styles.scanProgressTrack} aria-hidden>
          <div
            className={`${styles.scanProgressFill} ${isError ? styles.scanProgressFillError : ""}`}
            style={{ width: `${isError ? 100 : pct}%` }}
          />
        </div>

        <div className={styles.scanCounts}>
          <span><strong>{progress.done}</strong>/{total || "…"} sources</span>
          <span><strong>{progress.roles}</strong> roles</span>
          <span><strong>{progress.fit ?? "—"}</strong> a fit</span>
        </div>

        {!isError && (
          <div className={styles.scanPhases} aria-hidden>
            {phaseSteps.map((step, index) => (
              <span
                key={step.key}
                className={`${styles.scanPhase} ${index < activeIndex ? styles.scanPhaseDone : ""} ${index === activeIndex && isRunning ? styles.scanPhaseActive : ""}`}
              >
                {step.label}
              </span>
            ))}
          </div>
        )}

        {isError && progress.message && (
          <p className={styles.scanError}>{progress.message}</p>
        )}

        <div className={styles.scanFeed}>
          {progress.items.length === 0 && isRunning && (
            <p className={styles.scanFeedEmpty}>Reaching out to sources…</p>
          )}
          {progress.items.map((item) => (
            <div key={`${item.id}-${item.status}`} className={styles.scanFeedRow}>
              <span
                className={`${styles.scanFeedDot} ${
                  item.status === "fetched" ? styles.scanFeedDotOk :
                  item.status === "error" ? styles.scanFeedDotErr :
                  styles.scanFeedDotSkip
                }`}
                aria-hidden
              />
              <span className={styles.scanFeedLabel}>{item.label}</span>
              <span className={styles.scanFeedCount}>
                {item.status === "fetched" ? `${item.jobs}` : item.status === "error" ? "—" : "skip"}
              </span>
            </div>
          ))}
        </div>

        {!isRunning && (
          <div className={styles.scanModalFoot}>
            <button type="button" className={styles.scanDoneBtn} onClick={onClose}>
              {isError ? "Close" : "View matches"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeNearMissReviewDecisions } from "../../review-learning";
import {
  fallbackVerdictForLegacyDecision,
  humanizeMatcherReasons,
  labelForReviewRationale,
  labelForReviewVerdict,
  parseReviewReason,
  reviewFitVerdicts,
  reviewRationaleChips,
  type ReviewFitVerdict,
  type ReviewRationaleChipValue,
  type ReviewRationaleTone,
} from "../../review-feedback";
import styles from "../../scans.module.css";
import type { NearMissReviewDecision, SourceProvider } from "../../types";

type ReviewBatchItem = {
  reviewKey: string;
  externalJobId: string;
  companyName: string;
  provider: SourceProvider;
  reviewType?: string;
  sourceKind?: string;
  sourceName?: string;
  title: string;
  location: string;
  remoteType: string;
  department: string;
  employmentType: string;
  salaryText: string;
  reviewBucket: string;
  matchQuality?: string;
  roleFamily: string;
  fitSummary: string;
  positives: string[];
  evidence: string[];
  risks: string[];
  reasonsToInspect: string[];
  responsibilitySnippets: string[];
  experienceSnippets: string[];
  descriptionSnippet: string;
  sourceUrl: string;
  decision: NearMissReviewDecision | null;
};

type ReviewBatchResponse = {
  batchMode?: string;
  batchNumber?: number;
  matchingRulesVersion: string;
  companiesChecked: number;
  fetched: number;
  nearMisses: number;
  previouslyReviewed: number;
  returned: number;
  sourceSummaries?: Array<{
    companyName: string;
    provider: SourceProvider;
    status: "ready" | "blocked" | "error";
    warnings: string[];
    fetched: number;
    nearMisses: number;
  }>;
  selectionSummary?: {
    requested: number;
    returned: number;
    available: number;
    maxPerCompany: number;
    maxPerSignalGroup: number;
    companiesRepresented: number;
    signalGroupsRepresented: number;
    diversityFiltered: number;
  };
  exportedSummary?: {
    selectedMatcherPasses?: number;
    selectedNearMissSupplements?: number;
    matcherPassPool?: number;
    nearMissPool?: number;
    unreviewedMatcherPassPool?: number;
    reviewReady?: boolean;
    includeNearMissSupplements?: boolean;
  };
  reviewBlockedReason?: string;
  reviewBatch: ReviewBatchItem[];
};

type Draft = {
  verdict: ReviewFitVerdict;
  note: string;
  titleSignal: string;
  rationale: ReviewRationaleChipValue[];
};

function defaultTitleSignal(title: string) {
  return title
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function decisionSummary(decision: NearMissReviewDecision | null) {
  if (!decision) return "No decision yet";
  const parsed = parseReviewReason(decision.reason);
  const verdict = parsed.verdict ?? fallbackVerdictForLegacyDecision(decision.decision);
  const rationale = parsed.rationale.length > 0
    ? ` · ${parsed.rationale.map(labelForReviewRationale).join(", ")}`
    : "";
  return `${labelForReviewVerdict(verdict)}${rationale}${parsed.note ? ` — ${parsed.note}` : ""}`;
}

function detailList(items: string[], fallback: string) {
  return items.length > 0 ? items.slice(0, 3) : [fallback];
}

function sourceHost(sourceUrl: string) {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return "source URL";
  }
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function reviewStatus(item: ReviewBatchItem) {
  const matchQuality = item.matchQuality ? titleCase(item.matchQuality) : "";

  if (item.reviewType === "matcher_pass") {
    return {
      label: matchQuality ? `Currently shown · ${matchQuality} match` : "Currently shown by matcher",
      detail: "This passed the matcher before review caps. Use a verdict and rationale chips to confirm its fit.",
    };
  }

  return {
    label: matchQuality ? `Currently filtered · ${matchQuality} near miss` : "Currently filtered near miss",
    detail: "This did not make the visible match list. Mark Match, Good, or Stretch only if it should be learned as plausible.",
  };
}

function reasonChips(item: ReviewBatchItem) {
  const rawReasons = item.reviewType === "matcher_pass"
    ? [
        ...item.positives,
        ...item.evidence,
        ...item.risks,
      ]
    : [
        ...item.risks,
        ...item.evidence,
        ...item.reasonsToInspect,
      ];

  return humanizeMatcherReasons(
    rawReasons.map((reason) => reason.replace(/^passed matcher before review cap$/i, "").trim())
  ).slice(0, 8);
}

function matcherSummary(item: ReviewBatchItem) {
  if (item.reviewType === "matcher_pass") {
    const why = humanizeMatcherReasons(item.positives).slice(0, 3).join("; ");
    return why ? `Why it surfaced: ${why}.` : "Surfaced by the matcher.";
  }

  const why = humanizeMatcherReasons(item.risks).slice(0, 3).join("; ");
  return why ? `Why it was filtered: ${why}.` : "Filtered by the matcher.";
}

function rationaleToneClass(tone: ReviewRationaleTone) {
  if (tone === "positive") return styles.tuningReviewRationalePositive;
  if (tone === "source") return styles.tuningReviewRationaleSource;
  return styles.tuningReviewRationaleConcern;
}

function reviewVerdictCounts(decisions: NearMissReviewDecision[]) {
  return decisions.reduce<Record<ReviewFitVerdict, number>>((counts, decision) => {
    const parsed = parseReviewReason(decision.reason);
    const verdict = parsed.verdict ?? fallbackVerdictForLegacyDecision(decision.decision);
    counts[verdict] += 1;
    return counts;
  }, {
    match: 0,
    good: 0,
    stretch: 0,
    not_a_match: 0,
  });
}

function draftFromDecision(decision: NearMissReviewDecision | null, item: ReviewBatchItem): Draft {
  const parsed = parseReviewReason(decision?.reason ?? "");

  return {
    verdict: parsed.verdict ?? (decision ? fallbackVerdictForLegacyDecision(decision.decision) : "good"),
    note: parsed.note,
    titleSignal: decision?.titleSignal || defaultTitleSignal(item.title),
    rationale: parsed.rationale,
  };
}

export default function TuningReviewClient({ initialDecisions }: { initialDecisions: NearMissReviewDecision[] }) {
  const [batch, setBatch] = useState<ReviewBatchResponse | null>(null);
  const [decisions, setDecisions] = useState(initialDecisions);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [activeBatchNumber, setActiveBatchNumber] = useState(1);
  const didAutoBuild = useRef(false);

  const decisionByKey = useMemo(() => {
    return new Map(decisions.map((decision) => [`${decision.reviewKey}:${decision.rulesVersion}`, decision]));
  }, [decisions]);
  const reviewAnalysis = useMemo(() => analyzeNearMissReviewDecisions(decisions), [decisions]);
  const verdictCounts = useMemo(() => reviewVerdictCounts(decisions), [decisions]);

  async function buildBatch(batchNumber = activeBatchNumber) {
    setLoading(true);
    setError("");
    setActiveBatchNumber(batchNumber);

    try {
      const response = await fetch("/scans/api/tuning-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "buildExportedBatch", batchNumber }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.detail || payload?.error || "Unable to build review batch.");
      }

      setBatch(payload);
      setDecisions(payload.decisions ?? decisions);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to build review batch.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (didAutoBuild.current) return;
    didAutoBuild.current = true;
    void buildBatch(1);
  }, []);

  function updateDraft(reviewKey: string, patch: Partial<Draft>, fallback?: Draft) {
    setSavedKeys((current) => {
      if (!current[reviewKey]) return current;
      const next = { ...current };
      delete next[reviewKey];
      return next;
    });
    setDrafts((current) => ({
      ...current,
      [reviewKey]: {
        verdict: current[reviewKey]?.verdict ?? fallback?.verdict ?? "good",
        note: current[reviewKey]?.note ?? fallback?.note ?? "",
        titleSignal: current[reviewKey]?.titleSignal ?? fallback?.titleSignal ?? "",
        rationale: current[reviewKey]?.rationale ?? fallback?.rationale ?? [],
        ...patch,
      },
    }));
  }

  function toggleRationale(reviewKey: string, chip: ReviewRationaleChipValue, baseDraft: Draft) {
    const currentRationale = drafts[reviewKey]?.rationale ?? baseDraft.rationale;
    updateDraft(reviewKey, {
      ...baseDraft,
      rationale: currentRationale.includes(chip)
        ? currentRationale.filter((currentChip) => currentChip !== chip)
        : [...currentRationale, chip],
    }, baseDraft);
  }

  async function saveDecision(item: ReviewBatchItem) {
    if (!batch) return;

    const draft = drafts[item.reviewKey] ?? {
      verdict: "good" as const,
      note: "",
      titleSignal: defaultTitleSignal(item.title),
      rationale: [],
    };

    setSavingKey(item.reviewKey);
    setError("");

    try {
      const response = await fetch("/scans/api/tuning-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveDecision",
          reviewKey: item.reviewKey,
          verdict: draft.verdict,
          rationaleChips: draft.rationale,
          reason: draft.note,
          titleSignal: draft.titleSignal || defaultTitleSignal(item.title),
          companyName: item.companyName,
          provider: item.provider,
          title: item.title,
          sourceUrl: item.sourceUrl,
          reviewBucket: item.reviewBucket,
          rulesVersion: batch.matchingRulesVersion,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.detail || payload?.error || "Unable to save review decision.");
      }

      setDecisions((current) => {
        const nextDecision = payload.decision as NearMissReviewDecision;
        return [nextDecision, ...current.filter((decision) => (
          decision.reviewKey !== nextDecision.reviewKey || decision.rulesVersion !== nextDecision.rulesVersion
        ))];
      });
      setSavedKeys((current) => ({ ...current, [item.reviewKey]: true }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save review decision.");
    } finally {
      setSavingKey("");
    }
  }

  return (
    <section className={styles.tuningReviewPanel}>
      <div className={styles.tuningReviewHeader}>
        <div>
          <h2>Batch review and learning queue</h2>
          <p>
            Pick one fit verdict for each role, then add rationale chips that explain the choice. Internal matcher states stay
            diagnostic; the human feedback model is Match, Good, Stretch, or Not a Match.
          </p>
        </div>
        <div className={styles.tuningReviewControls}>
          <button
            className={activeBatchNumber === 1 ? styles.tuningReviewChoiceActive : styles.tuningReviewChoice}
            type="button"
            onClick={() => buildBatch(1)}
            disabled={loading}
          >
            Batch 1
          </button>
          <button
            className={activeBatchNumber === 2 ? styles.tuningReviewChoiceActive : styles.tuningReviewChoice}
            type="button"
            onClick={() => buildBatch(2)}
            disabled={loading}
          >
            Batch 2
          </button>
          <button className={styles.tuningReviewPrimary} type="button" onClick={() => buildBatch(activeBatchNumber)} disabled={loading}>
            {loading ? "Loading batch…" : batch ? "Reload batch" : "Load review batch"}
          </button>
        </div>
      </div>

      <div className={styles.tuningReviewStats}>
        <span>
          <strong>{batch?.nearMisses ?? "—"}</strong>
          Candidate pool
        </span>
        <span>
          <strong>{batch?.returned ?? "—"}</strong>
          Returned for review
        </span>
        <span>
          <strong>{batch?.previouslyReviewed ?? "—"}</strong>
          Previously reviewed omitted
        </span>
        <span>
          <strong>{decisions.length}</strong>
          Saved verdicts
        </span>
      </div>

      {loading && !batch && (
        <p className={styles.tuningReviewNote}>
          Building the first review list now. This can take a few seconds because it checks the live source boards.
        </p>
      )}

      {batch && (
        <p className={styles.tuningReviewNote}>
          {batch.reviewBlockedReason
            ? `Batch ${batch.batchNumber ?? activeBatchNumber} is blocked. Checked ${batch.companiesChecked} sources and ${batch.fetched} jobs, but there are not enough unreviewed matcher-pass roles for a reviewable batch.`
            : `Showing Batch ${batch.batchNumber ?? activeBatchNumber}. Checked ${batch.companiesChecked} sources and ${batch.fetched} jobs. This is a review queue, not the live match list.`}
        </p>
      )}

      {batch?.exportedSummary && (
        <div className={styles.tuningReviewBalance}>
          <strong>Exported sample</strong>
          <span>{batch.exportedSummary.matcherPassPool ?? "—"} matcher-pass pool</span>
          <span>{batch.exportedSummary.unreviewedMatcherPassPool ?? "—"} unreviewed matcher-pass pool</span>
          <span>{batch.exportedSummary.nearMissPool ?? "—"} supplement pool</span>
          <span>{batch.exportedSummary.selectedMatcherPasses ?? "—"} matcher-pass selected</span>
          <span>{batch.exportedSummary.selectedNearMissSupplements ?? "—"} supplement selected</span>
          <span>{batch.exportedSummary.reviewReady ? "review-ready" : "not review-ready"}</span>
        </div>
      )}

      {batch?.selectionSummary && (
        <div className={styles.tuningReviewBalance}>
          <strong>Batch balance</strong>
          <span>{batch.selectionSummary.companiesRepresented} companies represented</span>
          <span>{batch.selectionSummary.signalGroupsRepresented} signal groups represented</span>
          <span>{batch.selectionSummary.diversityFiltered} repetitive candidates held back</span>
        </div>
      )}

      {batch?.sourceSummaries && (
        <div className={styles.tuningReviewSources}>
          <div>
            <strong>Source coverage</strong>
            <span>
              {batch.sourceSummaries.filter((source) => source.status === "ready").length} ready ·{" "}
              {batch.sourceSummaries.filter((source) => source.status === "blocked").length} blocked ·{" "}
              {batch.sourceSummaries.filter((source) => source.status === "error").length} errors
            </span>
          </div>
          <div className={styles.tuningReviewSourceGrid}>
            {batch.sourceSummaries.map((source) => (
              <span key={`${source.companyName}-${source.provider}`}>
                <strong>{source.companyName}</strong>
                {source.status === "ready"
                  ? `${source.fetched} fetched · ${source.nearMisses} candidates`
                  : `${source.status}: ${source.warnings[0] ?? "source unavailable"}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {error && <p className={styles.tuningReviewError}>{error}</p>}

      {reviewAnalysis.totalDecisions > 0 && (
        <div className={styles.tuningReviewAnalysis}>
          <div className={styles.tuningReviewAnalysisHeader}>
            <div>
              <strong>Review learning summary</strong>
              <p>
                {reviewAnalysis.blankReasonCount} of {reviewAnalysis.totalDecisions} saved decision
                {reviewAnalysis.totalDecisions === 1 ? "" : "s"} have no written reason. Blank reasons still inherit
                logic from similar title-signal clusters.
              </p>
            </div>
            <span>
              {verdictCounts.match} match · {verdictCounts.good} good · {verdictCounts.stretch} stretch · {verdictCounts.not_a_match} not a match
            </span>
          </div>

          {reviewAnalysis.companySkew && (
            <p className={styles.tuningReviewSkew}>
              {reviewAnalysis.companySkew.companyName} accounts for {reviewAnalysis.companySkew.share}% of this review
              slice. {reviewAnalysis.companySkew.warning}
            </p>
          )}

          <div className={styles.tuningReviewClusterGrid}>
            {reviewAnalysis.groups.slice(0, 8).map((group) => (
              <article key={group.id}>
                <div>
                  <strong>{group.label}</strong>
                  <span>{labelForReviewVerdict(group.verdict)} · {group.count} role{group.count === 1 ? "" : "s"}</span>
                </div>
                <p>{group.inheritedReason}</p>
                {group.blankReasonCount > 0 && (
                  <small>{group.blankReasonCount} decision{group.blankReasonCount === 1 ? "" : "s"} using inherited logic</small>
                )}
              </article>
            ))}
          </div>
        </div>
      )}

      <div className={styles.tuningReviewList}>
        {batch && batch.reviewBatch.length === 0 && (
          <p className={styles.tuningEmptyGroup}>
            {batch.reviewBlockedReason ?? "No filtered jobs were close enough for manual review in this batch."}
          </p>
        )}

        {batch?.reviewBatch.map((item) => {
          const savedDecision = decisionByKey.get(`${item.reviewKey}:${batch.matchingRulesVersion}`) ?? item.decision;
          const status = reviewStatus(item);
          const chips = reasonChips(item);
          const draft = drafts[item.reviewKey] ?? draftFromDecision(savedDecision, item);
          const selectedRationaleLabels = draft.rationale.map(labelForReviewRationale);

          return (
            <article className={styles.tuningReviewCard} key={item.reviewKey}>
              <div className={styles.tuningReviewCardHeader}>
                <div>
                  <h3>{item.title}</h3>
                  <p>
                    {item.companyName} · {item.location || "Location unclear"} · {item.remoteType}
                    {" · "}
                    {item.salaryText ? item.salaryText : "Salary not posted"}
                  </p>
                  <p className={styles.tuningReviewSourceLine}>
                    Original source: {item.sourceKind ?? "source"} · {item.sourceName ?? item.provider} · {sourceHost(item.sourceUrl)} ·{" "}
                    <a href={item.sourceUrl} target="_blank" rel="noreferrer">Open original posting</a>
                  </p>
                </div>
              </div>

              <p className={styles.tuningReviewSummary}>{matcherSummary(item)}</p>

              <div className={styles.tuningReviewStatus}>
                <strong>{status.label}</strong>
                <span>{status.detail}</span>
                {chips.length > 0 && (
                  <div className={styles.tuningReviewReasonChips}>
                    {chips.map((chip) => (
                      <span key={chip}>{chip}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.tuningReviewDetailGrid}>
                <div>
                  <strong>Company / role context</strong>
                  <p>{item.companyName}{item.department ? ` · ${item.department}` : ""} · {item.employmentType}</p>
                  <p>Original source: {item.sourceKind ?? "source"} · {item.sourceName ?? item.provider} · {sourceHost(item.sourceUrl)}</p>
                  <p>{item.descriptionSnippet || "No usable description excerpt returned by the source."}</p>
                </div>
                <div>
                  <strong>Responsibilities</strong>
                  <ul>
                    {detailList(item.responsibilitySnippets, "No responsibility excerpt found in the returned posting text.").map((snippet) => (
                      <li key={snippet}>{snippet}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>Experience required</strong>
                  <ul>
                    {detailList(item.experienceSnippets, "No experience requirement excerpt found in the returned posting text.").map((snippet) => (
                      <li key={snippet}>{snippet}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className={styles.tuningReviewEvidence}>
                <span>Risks: {humanizeMatcherReasons(item.risks).slice(0, 3).join("; ") || "none flagged"}</span>
              </div>

              <div className={styles.tuningReviewControls}>
                {reviewFitVerdicts.map((verdict) => (
                  <button
                    key={verdict.value}
                    className={draft.verdict === verdict.value ? styles.tuningReviewChoiceActive : styles.tuningReviewChoice}
                    type="button"
                    onClick={() => updateDraft(item.reviewKey, { verdict: verdict.value }, draft)}
                  >
                    {verdict.label}
                  </button>
                ))}
              </div>

              <label className={styles.tuningReviewField}>
                What to capture
                <textarea
                  value={draft.note}
                  maxLength={500}
                  rows={3}
                  onChange={(event) => updateDraft(item.reviewKey, { note: event.target.value }, draft)}
                />
                <span className={styles.tuningReviewHint}>
                  Written note only: {draft.note.length}/500 characters. This is not a score.
                </span>
              </label>

              <label className={styles.tuningReviewField}>
                Title signal to learn from
                <input
                  value={draft.titleSignal}
                  maxLength={120}
                  onChange={(event) => updateDraft(item.reviewKey, { titleSignal: event.target.value }, draft)}
                />
              </label>

              <div className={styles.tuningReviewField}>
                Rationale chips
                <span className={styles.tuningReviewHint}>
                  Use chips as explicit learning signals for the selected verdict. They do not add points, rank the role, or change a score.
                  {selectedRationaleLabels.length > 0 ? ` Selected: ${selectedRationaleLabels.join(", ")}.` : " No rationale signals selected yet."}
                </span>
                <div className={styles.tuningReviewTagGrid}>
                  {reviewRationaleChips.map((chip) => (
                    <button
                      key={chip.value}
                      className={[
                        draft.rationale.includes(chip.value) ? styles.tuningReviewChoiceActive : styles.tuningReviewChoice,
                        rationaleToneClass(chip.tone),
                      ].join(" ")}
                      type="button"
                      onClick={() => toggleRationale(item.reviewKey, chip.value, draft)}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.tuningReviewFooter}>
                <a href={item.sourceUrl} target="_blank" rel="noreferrer">Open original posting</a>
                <span>{decisionSummary(savedDecision)}</span>
                <button
                  type="button"
                  className={savedKeys[item.reviewKey] ? styles.tuningReviewSavedButton : undefined}
                  onClick={() => saveDecision(item)}
                  disabled={savingKey === item.reviewKey}
                >
                  {savingKey === item.reviewKey ? "Saving…" : savedKeys[item.reviewKey] ? "✓ Saved" : "Save decision"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import styles from "../../scans.module.css";
import type { TuningPreviewDraft, TuningPreviewImpact } from "../../tuning-preview";

const draftGroupLabels: Record<TuningPreviewDraft["group"], string> = {
  title_family: "Potential recall",
  negative_signal: "Noise reduction",
  stretch_boundary: "Stretch boundary evidence",
};

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

function draftSummary(draft: TuningPreviewDraft) {
  const companyCopy = `${draft.companyCount} compan${draft.companyCount === 1 ? "y" : "ies"}`;
  return `${draft.evidenceCount} decisions · ${companyCopy}`;
}

export default function TuningPreviewClient({ initialImpact }: { initialImpact: TuningPreviewImpact }) {
  const [impact, setImpact] = useState(initialImpact);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedCount = selectedDraftIds.length;
  const selectedDraftIdSet = useMemo(() => new Set(selectedDraftIds), [selectedDraftIds]);

  function toggleDraft(draftId: string) {
    setSelectedDraftIds((current) => (
      current.includes(draftId)
        ? current.filter((id) => id !== draftId)
        : [...current, draftId]
    ));
  }

  function selectRecommended() {
    const recommended = impact.drafts
      .filter((draft) => draft.group === "negative_signal" && !draft.requiresBroaderConfirmation)
      .map((draft) => draft.id);
    setSelectedDraftIds(recommended);
  }

  async function previewSelected() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/scans/api/tuning-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedDraftIds }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.detail || payload?.error || "Unable to preview selected matcher changes.");
      }

      setImpact(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to preview selected matcher changes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.tuningPreviewPanel}>
      <div className={styles.tuningPreviewHeader}>
        <div>
          <h2>Preview matcher changes</h2>
          <p>
            Select draft signals from manual review, then preview how recent decision evidence would move before any
            matcher config can be saved.
          </p>
        </div>
        <div className={styles.tuningPreviewActions}>
          <button type="button" onClick={selectRecommended}>
            Select safer reductions
          </button>
          <button type="button" onClick={() => setSelectedDraftIds([])}>
            Clear
          </button>
          <button type="button" onClick={previewSelected} disabled={loading || selectedCount === 0}>
            {loading ? "Previewing..." : `Preview ${selectedCount || ""}`.trim()}
          </button>
        </div>
      </div>

      <div className={styles.tuningPreviewStats}>
        <span>
          <strong>{formatCount(impact.currentCounts.included)}</strong>
          Current included
        </span>
        <span>
          <strong>{formatCount(impact.previewCounts.included)}</strong>
          Preview included
        </span>
        <span>
          <strong>{formatCount(impact.impactCounts.added)}</strong>
          Added visible
        </span>
        <span>
          <strong>{formatCount(impact.impactCounts.removed)}</strong>
          Removed visible
        </span>
        <span>
          <strong>{formatCount(impact.impactCounts.requiresLiveReplay)}</strong>
          Need live replay
        </span>
      </div>

      {error && <p className={styles.tuningReviewError}>{error}</p>}

      <div className={styles.tuningPreviewDraftGrid}>
        {impact.drafts.map((draft) => (
          <label
            className={selectedDraftIdSet.has(draft.id) ? styles.tuningPreviewDraftActive : styles.tuningPreviewDraft}
            key={draft.id}
          >
            <input
              checked={selectedDraftIdSet.has(draft.id)}
              type="checkbox"
              onChange={() => toggleDraft(draft.id)}
            />
            <span>
              <strong>{draft.signal}</strong>
              <small>{draftGroupLabels[draft.group]} · {draftSummary(draft)}</small>
              <em>{draft.inheritedReason}</em>
            </span>
            {draft.requiresBroaderConfirmation && <b>Needs broader confirmation</b>}
          </label>
        ))}
      </div>

      <div className={styles.tuningPreviewImpactGrid}>
        <article>
          <strong>Added</strong>
          {impact.examples.added.length > 0 ? (
            <ul>
              {impact.examples.added.map((example) => (
                <li key={`${example.title}-${example.companyName}`}>
                  {example.title} at {example.companyName} · {example.previewBucket}
                </li>
              ))}
            </ul>
          ) : (
            <p>No visible additions in the latest preview.</p>
          )}
        </article>
        <article>
          <strong>Removed or downgraded</strong>
          {[...impact.examples.removed, ...impact.examples.downgraded].length > 0 ? (
            <ul>
              {[...impact.examples.removed, ...impact.examples.downgraded].map((example) => (
                <li key={`${example.title}-${example.companyName}-${example.previewBucket}`}>
                  {example.title} at {example.companyName} · {example.currentBucket} to {example.previewBucket}
                </li>
              ))}
            </ul>
          ) : (
            <p>No removals or downgrades in the latest preview.</p>
          )}
        </article>
        <article>
          <strong>Warnings</strong>
          <ul>
            {[...impact.warnings, ...impact.applyBlockedReasons].map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

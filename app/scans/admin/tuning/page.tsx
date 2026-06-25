import Link from "next/link";
import { cookies } from "next/headers";
import LoginPanel from "../../LoginPanel";
import { getJobSearchAuthState } from "../../auth";
import styles from "../../scans.module.css";
import { getMatchTuningPreviewImpact, getMatchTuningReport, getNearMissReviewDecisions } from "../../store";
import type { TuningDecisionGroup, TuningSuggestion } from "../../tuning-report";
import TuningPreviewClient from "./TuningPreviewClient";
import TuningReviewClient from "./TuningReviewClient";

const groupLabels: Record<TuningDecisionGroup, string> = {
  profile_scoped_exclusions: "Profile-scoped exclusions",
  title_families: "Title families",
  positive_signals: "Positive signals",
  negative_signals: "Negative signals",
  thresholds: "Threshold presets",
};

const groupDescriptions: Record<TuningDecisionGroup, string> = {
  profile_scoped_exclusions: "Wrong for this profile/search context only. These are not universal judgments about a role.",
  title_families: "Potential recall improvements for valid target-role families the matcher may be missing.",
  positive_signals: "Signals that can boost a match, but cannot bypass the title-family gate.",
  negative_signals: "Signals that should reduce confidence without becoming absolute exclusions.",
  thresholds: "Small preset changes to bucket strictness. No raw percentage sliders in V1.",
};

function groupSuggestions(suggestions: TuningSuggestion[]) {
  return (Object.keys(groupLabels) as TuningDecisionGroup[]).map((group) => ({
    group,
    suggestions: suggestions.filter((suggestion) => suggestion.group === group),
  }));
}

function readinessText(report: Awaited<ReturnType<typeof getMatchTuningReport>>) {
  if (report.ready) {
    return "Ready for review. Suggestions are still read-only until preview impact and version apply are built.";
  }

  if (report.feedbackCount === 0) {
    return "Not ready yet. Collect match ratings first so the tuning report has real evidence.";
  }

  return `Not ready yet. Collect ${report.scansRemaining} more completed scan${report.scansRemaining === 1 ? "" : "s"} after feedback.`;
}

function riskClass(riskLevel: TuningSuggestion["riskLevel"]) {
  if (riskLevel === "low") return styles.tuningRiskLow;
  if (riskLevel === "medium") return styles.tuningRiskMedium;
  return styles.tuningRiskHigh;
}

function TuningSuggestionCard({ suggestion }: { suggestion: TuningSuggestion }) {
  return (
    <article className={styles.tuningSuggestionCard}>
      <div className={styles.tuningSuggestionHeader}>
        <h3>{suggestion.title}</h3>
        <span className={`${styles.tuningRiskBadge} ${riskClass(suggestion.riskLevel)}`}>
          {suggestion.riskLevel} risk
        </span>
      </div>
      <p>{suggestion.rationale}</p>
      <div className={styles.tuningRecommendation}>
        <strong>Recommended review</strong>
        <span>{suggestion.recommendation}</span>
      </div>
      <div className={styles.tuningControlRow}>
        {suggestion.controls.map((control) => (
          <span key={control}>{control}</span>
        ))}
      </div>
      {suggestion.examples.length > 0 && (
        <div className={styles.tuningExamples}>
          <strong>Evidence examples</strong>
          <ul>
            {suggestion.examples.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ul>
        </div>
      )}
      <small>{suggestion.evidenceCount} evidence item{suggestion.evidenceCount === 1 ? "" : "s"}</small>
    </article>
  );
}

export default async function DumpsterFireTuningPage() {
  const authState = getJobSearchAuthState(await cookies());

  if (!authState.authenticated) {
    return <LoginPanel />;
  }

  const report = await getMatchTuningReport();
  const previewImpact = await getMatchTuningPreviewImpact([]);
  const reviewDecisions = await getNearMissReviewDecisions();
  const groupedSuggestions = groupSuggestions(report.suggestions);

  return (
    <main className={`${styles.page} ${styles.tuningPage}`}>
      <div className={styles.meshBg} />
      <section className={styles.tuningShell}>
        <div className={styles.tuningHeader}>
          <Link className={styles.tuningBackLink} href="/scans">
            Back to dashboard
          </Link>
          <div>
            <h1>Match tuning report</h1>
            <p>
              Internal read-only review for deciding how the profile-scoped matcher should improve after enough real
              feedback exists. Nothing here applies rule changes yet.
            </p>
          </div>
        </div>

        <section className={styles.tuningReadinessPanel}>
          <div>
            <strong>{report.ready ? "Ready" : "Collecting evidence"}</strong>
            <p>{readinessText(report)}</p>
          </div>
          <div className={styles.tuningStatsGrid}>
            <span>
              <strong>{report.feedbackCount}</strong>
              Feedback rows
            </span>
            <span>
              <strong>{report.completedScansSinceFirstFeedback}</strong>
              Completed scans
            </span>
            <span>
              <strong>{report.decisionCount}</strong>
              Decisions read
            </span>
            <span>
              <strong>{report.scansRemaining}</strong>
              Scans remaining
            </span>
          </div>
          <div className={styles.tuningMetaGrid}>
            <span>Rules version: {report.matchingRulesVersion}</span>
            <span>Config source: {report.matchingConfigSource === "compiled_profile" ? "compiled profile" : "private fallback"}</span>
            <span>Poor ratings: {report.poorRatings}</span>
            <span>Strong ratings: {report.strongRatings}</span>
          </div>
        </section>

        <section className={styles.tuningGuardrailPanel}>
          <h2>Guardrails</h2>
          <ul>
            <li>Hard exclusions mean wrong for this profile/search context only.</li>
            <li>V1 uses approve, reject, edit, and limited strength choices — no percentage sliders.</li>
            <li>Applying changes requires a preview-impact step and a new matcher config version.</li>
            <li>Candidate-facing cards stay simple: short reasons, Weird match, and rating feedback.</li>
          </ul>
        </section>

        <TuningReviewClient initialDecisions={reviewDecisions} />

        <TuningPreviewClient initialImpact={previewImpact} />

        <section className={styles.tuningGroupList}>
          {groupedSuggestions.map(({ group, suggestions }) => (
            <div className={styles.tuningGroup} key={group}>
              <div className={styles.tuningGroupHeader}>
                <div>
                  <h2>{groupLabels[group]}</h2>
                  <p>{groupDescriptions[group]}</p>
                </div>
                <span>{suggestions.length} suggestion{suggestions.length === 1 ? "" : "s"}</span>
              </div>
              {suggestions.length > 0 ? (
                <div className={styles.tuningSuggestionGrid}>
                  {suggestions.map((suggestion) => (
                    <TuningSuggestionCard key={suggestion.id} suggestion={suggestion} />
                  ))}
                </div>
              ) : (
                <p className={styles.tuningEmptyGroup}>No evidence-backed suggestions yet.</p>
              )}
            </div>
          ))}
        </section>
      </section>
    </main>
  );
}

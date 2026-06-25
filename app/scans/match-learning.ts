import type { Job, JobMatchFeedback, ScanLog } from "./types";

export type MatchLearningSignal = {
  label: string;
  count: number;
  averageRating: number;
  examples: string[];
  recommendation: "tighten_exclusion" | "increase_weight" | "review_manually";
};

export type MatchLearningSummary = {
  ready: boolean;
  completedScansSinceFirstFeedback: number;
  scansRemaining: number;
  poorRatings: number;
  strongRatings: number;
  signals: MatchLearningSignal[];
};

type MatchLearningInput = {
  feedback: JobMatchFeedback[];
  jobs: Job[];
  scanLogs: ScanLog[];
  scansRequired?: number;
};

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10;
}

function completedScanCountSince(scanLogs: ScanLog[], since: string) {
  const sinceTime = new Date(since).getTime();

  return scanLogs.filter((log) => {
    if (log.status === "failed") return false;
    return new Date(log.completedAt).getTime() >= sinceTime;
  }).length;
}

function normalizeSignal(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

function titleFamilySignal(title: string) {
  const normalizedTitle = normalizeSignal(title);

  if (normalizedTitle.includes("compliance") || normalizedTitle.includes("legal") || normalizedTitle.includes("counsel")) return "legal/compliance";
  if (normalizedTitle.includes("engineer") || normalizedTitle.includes("developer")) return "engineering";
  if (normalizedTitle.includes("designer") || normalizedTitle.includes("design director")) return "design-track";
  if (normalizedTitle.includes("marketing") || normalizedTitle.includes("social")) return "marketing/social";
  if (normalizedTitle.includes("technical program") || normalizedTitle.includes("technical project")) return "technical-program";
  if (normalizedTitle.includes("program") || normalizedTitle.includes("operations") || normalizedTitle.includes("production")) return "target-adjacent";

  return "uncategorized";
}

function recommendationFor(label: string, averageRating: number): MatchLearningSignal["recommendation"] {
  if (averageRating < 3 && label !== "target-adjacent" && label !== "uncategorized") return "tighten_exclusion";
  if (averageRating >= 4) return "increase_weight";
  return "review_manually";
}

export function summarizeMatchLearning({
  feedback,
  jobs,
  scanLogs,
  scansRequired = 10,
}: MatchLearningInput): MatchLearningSummary {
  const sortedFeedback = [...feedback].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const firstFeedbackAt = sortedFeedback[0]?.createdAt;
  const completedScansSinceFirstFeedback = firstFeedbackAt ? completedScanCountSince(scanLogs, firstFeedbackAt) : 0;
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const grouped = new Map<string, { ratings: number[]; examples: string[] }>();

  for (const item of feedback) {
    const job = jobsById.get(item.jobId);
    if (!job) continue;

    const label = titleFamilySignal(job.title);
    const current = grouped.get(label) ?? { ratings: [], examples: [] };
    current.ratings.push(item.rating);
    if (current.examples.length < 3) {
      current.examples.push(`${job.title} at ${job.companyName}${item.reason ? ` — ${item.reason}` : ""}`);
    }
    grouped.set(label, current);
  }

  const signals = [...grouped.entries()]
    .map(([label, group]) => {
      const averageRating = average(group.ratings);
      return {
        label,
        count: group.ratings.length,
        averageRating,
        examples: group.examples,
        recommendation: recommendationFor(label, averageRating),
      };
    })
    .sort((a, b) => b.count - a.count || a.averageRating - b.averageRating);

  return {
    ready: completedScansSinceFirstFeedback >= scansRequired && feedback.length > 0,
    completedScansSinceFirstFeedback,
    scansRemaining: Math.max(0, scansRequired - completedScansSinceFirstFeedback),
    poorRatings: feedback.filter((item) => item.rating < 4).length,
    strongRatings: feedback.filter((item) => item.rating >= 4).length,
    signals,
  };
}

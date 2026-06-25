import type { FitBucket, Job, RecommendedAction, UserSearchProfile } from "./types";
import { evaluateJobMatch } from "./matching";
import type { MatchingRuleConfig } from "./matching";

type ScoreResult = {
  score: number;
  bucket: FitBucket;
  recommendedAction: RecommendedAction;
  positives: string[];
  risks: string[];
};

export function scoreJob(
  job: Omit<Job, "fitScore" | "fitBucket" | "recommendedAction">,
  profile: UserSearchProfile,
  config?: MatchingRuleConfig
): ScoreResult {
  const decision = evaluateJobMatch(job, profile, config);

  return {
    score: decision.score,
    bucket: decision.bucket,
    recommendedAction: decision.recommendedAction,
    positives: decision.positives,
    risks: decision.risks,
  };
}

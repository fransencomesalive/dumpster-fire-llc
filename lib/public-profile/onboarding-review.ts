export type OnboardingReviewIntent = "section_save" | "completion_attempt";

export type OnboardingReviewState = {
  completionAttempted: boolean;
  reviewOpen: boolean;
};

export function nextOnboardingReviewState(options: {
  current: OnboardingReviewState;
  profileStatus: "complete" | "incomplete";
  intent: OnboardingReviewIntent;
}): OnboardingReviewState {
  if (options.profileStatus === "complete") {
    return { completionAttempted: true, reviewOpen: false };
  }
  if (options.intent === "completion_attempt") {
    return { completionAttempted: true, reviewOpen: true };
  }
  return options.current;
}

export function onboardingSectionReadiness(options: {
  profileLoaded: boolean;
  required: boolean;
  hasIssues: boolean;
  completionAttempted: boolean;
}) {
  if (!options.profileLoaded) return "not_loaded" as const;
  if (!options.required) return "optional" as const;
  if (!options.hasIssues) return "complete" as const;
  return options.completionAttempted ? "incomplete" as const : "not_loaded" as const;
}

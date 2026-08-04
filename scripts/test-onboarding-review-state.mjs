import assert from "node:assert/strict";
import {
  nextOnboardingReviewState,
  onboardingSectionReadiness,
} from "../lib/public-profile/onboarding-review.ts";

const untouched = { completionAttempted: false, reviewOpen: false };

assert.deepEqual(nextOnboardingReviewState({
  current: untouched,
  profileStatus: "incomplete",
  intent: "section_save",
}), untouched, "an ordinary section save must not become a whole-profile completion attempt");

assert.deepEqual(nextOnboardingReviewState({
  current: untouched,
  profileStatus: "incomplete",
  intent: "completion_attempt",
}), { completionAttempted: true, reviewOpen: true }, "the final onboarding save must reveal remaining blockers");

assert.deepEqual(nextOnboardingReviewState({
  current: { completionAttempted: true, reviewOpen: true },
  profileStatus: "complete",
  intent: "section_save",
}), { completionAttempted: true, reviewOpen: false }, "completing the profile must close the review panel");

assert.equal(onboardingSectionReadiness({
  profileLoaded: true,
  required: true,
  hasIssues: true,
  completionAttempted: false,
}), "not_loaded", "unfinished sections remain neutral before a completion attempt");

assert.equal(onboardingSectionReadiness({
  profileLoaded: true,
  required: true,
  hasIssues: true,
  completionAttempted: true,
}), "incomplete", "unfinished sections become actionable after a completion attempt");

assert.equal(onboardingSectionReadiness({
  profileLoaded: true,
  required: true,
  hasIssues: false,
  completionAttempted: false,
}), "complete", "completed sections still show progress before the final attempt");

console.log("onboarding review state: all assertions passed");

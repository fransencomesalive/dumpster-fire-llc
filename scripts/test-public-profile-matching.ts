import assert from "node:assert/strict";
import type { CandidateProfileAggregate } from "../lib/public-profile/types";
import { evaluateMatch } from "../lib/public-profile/matching/engine";
import type { MatchJob } from "../lib/public-profile/matching/types";
import { completeCandidateProfileAggregate } from "./fixtures/public-profile";

const now = "2026-06-28T12:00:00.000Z";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function profile(overrides: Partial<CandidateProfileAggregate> = {}) {
  const aggregate = completeCandidateProfileAggregate(now);
  aggregate.profile.targetCompensationMin = 140000;
  aggregate.profile.targetCompensationPreferred = 165000;
  aggregate.companyWatchlist = [{
    id: "watch-1",
    profileId: "profile-1",
    companyName: "Useful Studio",
    reason: "Product-led company with messy workflow problems.",
    priority: "high",
    createdAt: now,
    updatedAt: now,
  }];
  return Object.assign(aggregate, overrides);
}

const strongJob: MatchJob = {
  id: "job-strong",
  title: "Program Director, AI Workflow Systems",
  companyName: "Useful Studio",
  description: [
    "Lead ambiguous systems work across product and operations.",
    "Own stakeholder alignment for internal AI workflow systems.",
    "This role needs cross-functional programs and program leadership.",
  ].join(" "),
  location: "Remote",
  remoteType: "remote",
  employmentType: "full_time",
  compensationText: "$170k-$190k",
  industry: "AI",
  postedAt: "2026-06-27T12:00:00.000Z",
  applyMethod: "direct",
};

const strong = evaluateMatch({ profile: profile(), job: strongJob, evaluatedAt: now });
assert.equal(strong.label, "Strong Match");
assert.ok(strong.internalScore >= 80);
assert.equal(strong.recommendations.roleTrack?.roleTrack.name, "Program Director");
assert.equal(strong.recommendations.resume?.resume.name, "Program Director Resume");
assert.equal(strong.recommendations.workExample?.workExample.title, "Phred");
assert.ok(strong.whyMatched.some((reason) => reason.includes("Program Director")));
assert.deepEqual(strong.softExclusions, []);

const weakJob: MatchJob = {
  id: "job-weak",
  title: "Senior Platform Engineering Manager",
  companyName: "Enterprise Staffing Co",
  description: [
    "Own deep platform engineering management.",
    "Heavy Adobe Commerce specialization.",
    "Staffing-only delivery with pure scrum ceremony.",
  ].join(" "),
  location: "Onsite in Dallas, TX",
  remoteType: "onsite",
  employmentType: "full_time",
  compensationText: "$80k-$95k",
  industry: "Staffing",
  postedAt: "2026-05-01T12:00:00.000Z",
  applyMethod: "easy_apply",
};

const weakProfile = profile();
weakProfile.profile.remotePreference = "remote_only";
if (weakProfile.preferences) {
  weakProfile.preferences.avoidIndustries = ["Staffing"];
  weakProfile.preferences.avoidCompanies = ["Enterprise Staffing Co"];
}
const weak = evaluateMatch({ profile: weakProfile, job: weakJob, evaluatedAt: now });
assert.equal(weak.label, "Probably Not Worth Your Time");
assert.ok(weak.internalScore < 40);
assert.ok(weak.softExclusions.includes("Below compensation target."));
assert.ok(weak.softExclusions.includes("Remote preference conflict."));
assert.ok(weak.softExclusions.includes("Company avoid list."));
assert.ok(weak.whyNotMatched.some((reason) => reason.includes("Staffing")));
assert.ok(weak.risks.length > 0);

const softEdgeProfile = profile();
softEdgeProfile.profile.remotePreference = "remote_only";
const softEdge = evaluateMatch({
  profile: softEdgeProfile,
  job: {
    ...strongJob,
    id: "job-soft-edge",
    location: "Hybrid in Denver, CO",
    remoteType: "hybrid",
  },
  evaluatedAt: now,
  remoteExceptions: [{
    companyName: "Useful Studio",
    remoteRiskReduction: "high",
    reason: "Recent remote exceptions have been credible.",
  }],
});
assert.ok(softEdge.internalScore > 0);
assert.ok(softEdge.softExclusions.includes("Remote preference conflict."));
assert.ok(softEdge.categoryFits.some((fit) => fit.category === "location" && fit.reasons.some((reason) => reason.includes("Remote exception noted"))));

const missingDataProfile = clone(profile());
missingDataProfile.workExamples = [];
missingDataProfile.resumes = [];
missingDataProfile.roleTracks[0].resumeIds = [];
const missingData = evaluateMatch({
  profile: missingDataProfile,
  job: {
    id: "job-missing",
    title: "Program Director",
    companyName: "Quiet Company",
    description: "Lead stakeholder alignment.",
  },
  evaluatedAt: now,
});
assert.ok(missingData.internalScore > 0);
assert.ok(missingData.categoryFits.some((fit) => fit.category === "work_example" && fit.risks.length > 0));
assert.ok(missingData.categoryFits.some((fit) => fit.category === "resume" && fit.risks.length > 0));
assert.equal(missingData.recommendations.resume, undefined);
assert.equal(missingData.recommendations.workExample, undefined);

// --- Hourly↔yearly compensation normalization (2026-07-09) ---

// Hourly-only profile vs a yearly posting: $72.50/hr ≈ $150,800/yr clears a
// $170k–$190k posting but a $60k posting lands below the floor.
const hourlyProfile = clone(profile());
hourlyProfile.profile.targetCompensationMin = undefined;
hourlyProfile.profile.targetCompensationPreferred = undefined;
hourlyProfile.profile.targetCompensationHourlyMin = 72.5;
const hourlyVsYearly = evaluateMatch({ profile: hourlyProfile, job: strongJob, evaluatedAt: now });
const hourlyCompFit = hourlyVsYearly.categoryFits.find((fit) => fit.category === "compensation");
assert.ok(hourlyCompFit && hourlyCompFit.score >= 0.7, "hourly floor should clear a $170k+ posting");

const lowYearlyJob: MatchJob = { ...strongJob, id: "job-low", compensationText: "$60k" };
const hourlyVsLow = evaluateMatch({ profile: hourlyProfile, job: lowYearlyJob, evaluatedAt: now });
const hourlyLowFit = hourlyVsLow.categoryFits.find((fit) => fit.category === "compensation");
assert.ok(hourlyLowFit && hourlyLowFit.score <= 0.2, "a $60k posting sits below a $72.50/hr floor");

// Yearly profile vs an hourly posting: "$90 - $100 / hr" ≈ $187k–$208k clears
// a $140k floor; "$30/hr" ≈ $62k does not.
const yearlyVsHourly = evaluateMatch({
  profile: profile(),
  job: { ...strongJob, id: "job-hourly", compensationText: "$90 - $100 / hr" },
  evaluatedAt: now,
});
const yearlyHourlyFit = yearlyVsHourly.categoryFits.find((fit) => fit.category === "compensation");
assert.ok(yearlyHourlyFit && yearlyHourlyFit.score >= 0.7, "an hourly posting should convert before comparing");

const lowHourly = evaluateMatch({
  profile: profile(),
  job: { ...strongJob, id: "job-low-hourly", compensationText: "$30/hr" },
  evaluatedAt: now,
});
const lowHourlyFit = lowHourly.categoryFits.find((fit) => fit.category === "compensation");
assert.ok(lowHourlyFit && lowHourlyFit.score <= 0.2, "a $30/hr posting sits below a $140k floor");

// --- Employment type: soft signal, never a hard filter (2026-07-09) ---

const contractProfile = clone(profile());
if (contractProfile.preferences) contractProfile.preferences.employmentTypes = ["contract", "freelance"];
const contractJob = evaluateMatch({
  profile: contractProfile,
  job: { ...strongJob, id: "job-contract", employmentType: "Contract" },
  evaluatedAt: now,
});
const contractFit = contractJob.categoryFits.find((fit) => fit.category === "employment_type");
assert.ok(contractFit && contractFit.score >= 0.85, "contract preference should match a contract posting");

const mismatch = evaluateMatch({
  profile: contractProfile,
  job: { ...strongJob, id: "job-ft", employmentType: "Full-time" },
  evaluatedAt: now,
});
const mismatchFit = mismatch.categoryFits.find((fit) => fit.category === "employment_type");
assert.ok(mismatchFit && mismatchFit.score <= 0.4, "a full-time posting scores low for a contract-only profile");
assert.ok(mismatchFit && mismatchFit.softExclusions.length === 0, "employment type must never hard-exclude");
assert.ok(mismatch.internalScore > 0, "mismatched employment type still surfaces the job");

const noPref = evaluateMatch({ profile: profile(), job: { ...strongJob, id: "job-nopref", employmentType: undefined }, evaluatedAt: now });
const noPrefFit = noPref.categoryFits.find((fit) => fit.category === "employment_type");
assert.ok(noPrefFit, "employment_type category always present");

console.log("public profile matching: all assertions passed");

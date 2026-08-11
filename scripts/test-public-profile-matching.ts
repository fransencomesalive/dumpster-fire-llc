import assert from "node:assert/strict";
import type { CandidateProfileAggregate } from "../lib/public-profile/types";
import { evaluateMatch } from "../lib/public-profile/matching/engine";
import {
  evaluatePublicJobDecision,
  matchingSignalsForAggregate,
} from "../lib/public-profile/matching/decision";
import { classifyOccupation } from "../lib/public-profile/matching/occupation";
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
assert.ok(weak.softExclusions.some((reason) => reason.toLowerCase().includes("avoid list")));
assert.ok(weak.softExclusions.some((reason) => reason.toLowerCase().includes("onsite")));
assert.ok(weak.softExclusions.some((reason) => reason.toLowerCase().includes("below your floor")));
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
assert.ok(softEdge.whyNotMatched.some((reason) => reason.includes("Hybrid")));
assert.ok(softEdge.categoryFits.some((fit) => fit.category === "location" && fit.reasons.some((reason) => reason.includes("Remote exception noted"))));

const noPreferenceProfile = profile();
noPreferenceProfile.profile.remotePreference = "no_preference";
const noPreferenceRemote = evaluateMatch({
  profile: noPreferenceProfile,
  job: { ...strongJob, id: "job-no-preference-remote", location: "Remote", remoteType: "remote" },
  evaluatedAt: now,
});
const noPreferenceOnsite = evaluateMatch({
  profile: noPreferenceProfile,
  job: { ...strongJob, id: "job-no-preference-onsite", location: "Onsite", remoteType: "onsite" },
  evaluatedAt: now,
});
const noPreferenceRemoteFit = noPreferenceRemote.categoryFits.find((fit) => fit.category === "location");
const noPreferenceOnsiteFit = noPreferenceOnsite.categoryFits.find((fit) => fit.category === "location");
assert.equal(noPreferenceRemoteFit?.score, noPreferenceOnsiteFit?.score);
assert.deepEqual(noPreferenceRemoteFit?.risks, []);
assert.deepEqual(noPreferenceOnsiteFit?.risks, []);

const noPreferenceSignals = matchingSignalsForAggregate(noPreferenceProfile);
const neutralRemoteDecision = evaluatePublicJobDecision(
  { ...strongJob, id: "decision-no-preference-remote", location: "", remoteType: "remote" },
  noPreferenceSignals,
  now,
);
const neutralOnsiteDecision = evaluatePublicJobDecision(
  { ...strongJob, id: "decision-no-preference-onsite", location: "", remoteType: "onsite" },
  noPreferenceSignals,
  now,
);
assert.equal(neutralRemoteDecision.score, neutralOnsiteDecision.score);
assert.equal(neutralRemoteDecision.risks.some((risk) => /remote|onsite/i.test(risk)), false);
assert.equal(neutralOnsiteDecision.risks.some((risk) => /remote|onsite/i.test(risk)), false);

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

// --- Wrong-lane exclusion, ported from the legacy occupation classifier (2026-07-16 P0) ---
// A remote, fresh, well-paid posting in an unrelated lane must never float to a
// mid rating on neutral category defaults; the 2026-07-16 bug rated these 3 stars.

const wrongLaneJobs: MatchJob[] = [
  {
    id: "job-swe",
    title: "Senior Staff Software Engineer, Payments",
    companyName: "Big Exchange",
    description: "Own backend engineering for payments. Write code, design APIs, lead architecture reviews for our platform. Cross-functional delivery with product stakeholders.",
    remoteType: "remote",
    compensationText: "$220k-$260k",
    postedAt: "2026-06-27T12:00:00.000Z",
    scrapedAt: now,
  },
  {
    id: "job-finance",
    title: "Manager, Finance Operations",
    companyName: "Big Exchange",
    description: "Own financial forecast and budget model operations. Lead vendor contracts and procurement process across stakeholders.",
    remoteType: "remote",
    compensationText: "$180k-$210k",
    postedAt: "2026-06-27T12:00:00.000Z",
    scrapedAt: now,
  },
];
for (const wrongLaneJob of wrongLaneJobs) {
  const wrongLane = evaluateMatch({ profile: profile(), job: wrongLaneJob, evaluatedAt: now });
  assert.equal(wrongLane.label, "Probably Not Worth Your Time", `${wrongLaneJob.title} must not rate`);
  assert.ok(wrongLane.internalScore <= 37, `${wrongLaneJob.title} must stay under the excluded-score cap`);
}

// A more specific wrong-lane title beats a generic target-title hit: a profile
// targeting "Program Director"/"Program Manager" roles must not rate technical
// program management as a fit (legacy hard-exclude semantics).
const tpmProfile = profile();
tpmProfile.roleTracks[0].targetTitles = ["Program Director", "Program Manager"];
const tpm = evaluateMatch({
  profile: tpmProfile,
  job: {
    id: "job-tpm",
    title: "Technical Program Manager, Compute Infrastructure",
    companyName: "Big Exchange",
    description: "Own infrastructure and hardware compute programs. Lead cross-functional delivery with engineering stakeholders across network and storage roadmaps.",
    remoteType: "remote",
    compensationText: "$200k",
    postedAt: "2026-06-27T12:00:00.000Z",
    scrapedAt: now,
  },
  evaluatedAt: now,
});
assert.equal(tpm.label, "Probably Not Worth Your Time", "technical program manager must not outrank the lane block");
assert.ok(tpm.internalScore <= 37);

// --- Executive Producer scan titles (Randall 2026-07-16): the scan matches the
// sidebar title list (track names + target titles), and producer-family roles
// must rate on those titles alone.
const epProfile = profile();
epProfile.roleTracks[0].name = "Executive Producer";
epProfile.roleTracks[0].targetTitles = ["Executive Producer", "creative producer", "production lead"];
const epJob: MatchJob = {
  id: "job-ep",
  title: "Executive Producer",
  companyName: "Big Agency",
  description: "Lead integrated campaign production across film and digital. Own budgets, vendor relationships, and delivery timelines with creative and account stakeholders.",
  remoteType: "remote",
  compensationText: "$190,000 - $230,000",
  postedAt: "2026-06-27T12:00:00.000Z",
  scrapedAt: now,
};
const ep = evaluateMatch({ profile: epProfile, job: epJob, evaluatedAt: now });
assert.equal(ep.label, "Strong Match", "a remote, well-paid Executive Producer role must rate Strong");
assert.ok(ep.whyMatched.some((reason) => reason.includes("Executive Producer")));

const epWrongLane = evaluateMatch({
  profile: epProfile,
  job: {
    id: "job-ep-swe",
    title: "Staff Software Engineer, Production Infrastructure",
    companyName: "Big Agency",
    description: "Own backend engineering for production systems. Write code, design APIs, and lead architecture for our platform infrastructure.",
    remoteType: "remote",
    compensationText: "$220,000",
    postedAt: "2026-06-27T12:00:00.000Z",
    scrapedAt: now,
  },
  evaluatedAt: now,
});
assert.equal(epWrongLane.label, "Probably Not Worth Your Time", "engineering roles must not ride the word 'production'");
assert.ok(epWrongLane.internalScore <= 37);

// --- Production feedback regressions (2026-08-04) ---
// Remote-work arrangement and geographic hiring eligibility are separate dimensions.
// Explicit country restrictions must be compared with each user's profile location.
for (const restrictedLocation of ["China", "Australia, New Zealand", "Argentina", "Romania"]) {
  const restricted = evaluateMatch({
    profile: profile(),
    job: {
      ...strongJob,
      id: `job-restricted-${restrictedLocation}`,
      location: restrictedLocation,
      remoteType: "remote",
    },
    evaluatedAt: now,
  });
  assert.equal(restricted.label, "Probably Not Worth Your Time", `${restrictedLocation} restriction must not receive a remote boost`);
  assert.ok(restricted.softExclusions.some((reason) => reason.toLowerCase().includes("location")));
  const locationFit = restricted.categoryFits.find((fit) => fit.category === "location");
  assert.equal(locationFit?.score, 0.05);
  assert.ok(locationFit?.softExclusions.includes("Location eligibility conflict."));
}

const usRestricted = evaluateMatch({
  profile: profile(),
  job: { ...strongJob, id: "job-us-restricted", location: "Remote - US", remoteType: "remote" },
  evaluatedAt: now,
});
assert.equal(usRestricted.label, "Strong Match", "a US restriction must remain compatible with Denver, CO");

const canadianProfile = profile();
canadianProfile.profile.location = "Toronto, ON, CA";
const canadaRestricted = evaluateMatch({
  profile: canadianProfile,
  job: { ...strongJob, id: "job-canada-restricted", location: "Canada", remoteType: "remote" },
  evaluatedAt: now,
});
assert.equal(canadaRestricted.label, "Strong Match", "a Canada restriction must remain compatible with Toronto, ON");

const noPreferenceRestrictedProfile = profile();
noPreferenceRestrictedProfile.profile.remotePreference = "no_preference";
const noPreferenceRestricted = evaluateMatch({
  profile: noPreferenceRestrictedProfile,
  job: { ...strongJob, id: "job-no-preference-china", location: "China", remoteType: "remote" },
  evaluatedAt: now,
});
assert.equal(noPreferenceRestricted.label, "Probably Not Worth Your Time", "No preference must not erase country eligibility");

// Specialized operations titles outrank broad program/operations language. A user who targets
// Marketing should not receive a Strong Match for Sales Operations merely because the posting
// mentions hospitality, strategy, and cross-functional ownership.
const marketingProfile = profile();
marketingProfile.roleTracks[0] = {
  ...marketingProfile.roleTracks[0],
  name: "Marketing",
  targetTitles: ["Director of Marketing", "Content Strategy Director"],
  keyResponsibilities: ["Content Strategy", "Brand Voice"],
  requiredExperiencePatterns: ["Marketing leadership"],
  strongJobSignals: ["Hospitality", "Travel"],
};
if (marketingProfile.preferences) marketingProfile.preferences.targetIndustries = ["hospitality", "travel"];
const salesOperations = evaluateMatch({
  profile: marketingProfile,
  job: {
    id: "job-sales-operations-feedback",
    title: "Senior Sales Operations Lead",
    companyName: "Travel Marketplace",
    description: "Own global acquisition strategy, sales forecasting, quotas, pipeline analysis, and cross-functional revenue operations.",
    location: "United States",
    remoteType: "remote",
    compensationText: "$204,000 - $249,000",
    postedAt: "2026-06-27T12:00:00.000Z",
  },
  evaluatedAt: now,
});
assert.equal(salesOperations.label, "Probably Not Worth Your Time");
assert.ok(salesOperations.whyNotMatched.some((reason) => reason.includes("different lane")));

// A generic Program Manager target does not override a title-qualified Enterprise Technology
// specialization when the user's Role Tracks do not support that technical lane.
const enterpriseTechnology = evaluateMatch({
  profile: profile(),
  job: {
    id: "job-enterprise-technology-feedback",
    title: "Senior Program Manager, Enterprise Technology & AI",
    companyName: "Developer Platform",
    description: "Lead enterprise IT programs spanning business systems, data, security, infrastructure, and enterprise architecture.",
    location: "Remote - US",
    remoteType: "remote",
    postedAt: "2026-06-27T12:00:00.000Z",
  },
  evaluatedAt: now,
});
assert.equal(enterpriseTechnology.label, "Probably Not Worth Your Time");
assert.ok(enterpriseTechnology.whyNotMatched.some((reason) => reason.includes("different lane")));

// Stretch titles with thin résumé and Work Example support stay Weak even when generic strategy,
// authority, industry, and remote signals would otherwise inflate the result.
const thinStretch = evaluateMatch({
  profile: profile(),
  job: {
    id: "job-thin-strategy-operations-feedback",
    title: "Company Strategy & Operations",
    companyName: "Payments Company",
    description: "Lead corporate strategy, investment analysis, executive recommendations, and cross-functional strategic initiatives.",
    location: "Remote - US",
    remoteType: "remote",
    postedAt: "2026-06-27T12:00:00.000Z",
  },
  evaluatedAt: now,
});
assert.equal(thinStretch.label, "Weak Match");
assert.ok(thinStretch.internalScore <= 59);
assert.ok(thinStretch.whyNotMatched.some((reason) => reason.includes("too thin")));

// Compound functional titles stay in their specific occupation family. A profile
// targeting Marketing Project Manager must not inherit the entire generic program
// management lane, while nearby marketing/creative project roles remain eligible.
const marketingCreativeProfile = profile();
marketingCreativeProfile.roleTracks[0] = {
  ...marketingCreativeProfile.roleTracks[0],
  name: "Marketing",
  targetTitles: [
    "Director of Marketing",
    "Creative Director",
    "Director of Content",
    "Head of Content",
    "Head of Creative",
    "Head of Brand Creative",
    "Brand Marketing Director",
    "Director of Social Media",
    "Digital Marketing Director",
    "Marketing Project Manager",
  ],
  keyResponsibilities: ["Lead brand marketing campaigns", "Own creative and content strategy"],
  requiredExperiencePatterns: ["Marketing leadership", "Creative team leadership"],
  strongJobSignals: ["Brand marketing", "Content production", "Social media"],
  weakJobSignals: [],
  mismatchSignals: [],
};
const marketingCreativeSignals = matchingSignalsForAggregate(marketingCreativeProfile);
assert.ok(marketingCreativeSignals.lanes.coreLanes.has("marketing-creative-project-management"));
assert.ok(marketingCreativeSignals.lanes.coreLanes.has("marketing-management"));
assert.ok(marketingCreativeSignals.lanes.coreLanes.has("creative-leadership"));
assert.ok(marketingCreativeSignals.lanes.coreLanes.has("social-creative"));
assert.equal(marketingCreativeSignals.lanes.coreLanes.has("program-project-management"), false);

for (const title of [
  "Senior Program Manager",
  "Program Director, Workforce Planning",
  "Project Manager, New Product Engineering",
]) {
  const genericProgramDecision = evaluatePublicJobDecision({
    id: `generic-${title}`,
    title,
    companyName: "Generic Company",
    description: "Own cross-functional planning, stakeholder alignment, delivery milestones, risk, scope, and executive reporting.",
    location: "Remote - US",
    remoteType: "remote",
    postedAt: "2026-06-27T12:00:00.000Z",
  }, marketingCreativeSignals, now);
  assert.equal(genericProgramDecision.included, false, `${title} must not inherit a compound marketing project target`);
  assert.equal(genericProgramDecision.label, "Probably Not Worth Your Time");
  assert.ok(genericProgramDecision.risks.some((risk) => risk.includes("different lane")));
}

for (const title of ["Marketing Project Manager", "Creative Project Manager", "Campaign Program Lead"]) {
  const specializedDecision = evaluatePublicJobDecision({
    id: `specialized-${title}`,
    title,
    companyName: "Creative Company",
    description: "Own brand marketing campaigns, creative assets, content production, stakeholder planning, and cross-functional delivery.",
    location: "Remote - US",
    remoteType: "remote",
    postedAt: "2026-06-27T12:00:00.000Z",
  }, marketingCreativeSignals, now);
  assert.equal(specializedDecision.included, true, `${title} should remain eligible for this profile`);
  assert.equal(specializedDecision.roleFamily, title === "Marketing Project Manager"
    ? "profile-target"
    : "marketing-creative-project-management");
}

// General operations, finance/accounting, and procurement are separate occupation
// families. A Chief of Staff target must not make Accounting or Controller jobs a
// core match, while profiles that explicitly target those specialties keep them.
const generalOperationsProfile = profile();
generalOperationsProfile.roleTracks[0] = {
  ...generalOperationsProfile.roleTracks[0],
  name: "General",
  targetTitles: ["Chief of Staff", "Operations Manager", "Director of Operations"],
  keyResponsibilities: ["Lead cross-functional business operations and executive planning"],
  requiredExperiencePatterns: ["Operating rhythm and stakeholder alignment"],
  strongJobSignals: ["Strategic initiatives", "Business planning"],
  weakJobSignals: [],
  mismatchSignals: [],
};
const generalOperationsSignals = matchingSignalsForAggregate(generalOperationsProfile);
assert.ok(generalOperationsSignals.lanes.coreLanes.has("strategy-operations"));
assert.equal(generalOperationsSignals.lanes.coreLanes.has("finance-accounting"), false);
assert.equal(generalOperationsSignals.lanes.stretchLanes.has("finance-accounting"), false);
assert.equal(generalOperationsSignals.lanes.coreLanes.has("procurement-supply-chain-operations"), false);
assert.equal(generalOperationsSignals.lanes.stretchLanes.has("procurement-supply-chain-operations"), false);

const unrelatedFinanceJobs: MatchJob[] = [
  {
    id: "job-037-finance-operations",
    title: "Manager, Finance Operations",
    companyName: "Finance Company",
    description: "Own financial planning, forecasting, budget models, and month-end reporting.",
  },
  {
    id: "job-037-accounting-manager",
    title: "Senior Manager, Accounting",
    companyName: "Accounting Company",
    description: "Lead accounting policy, audits, reconciliations, and financial reporting.",
  },
  {
    id: "job-037-controller",
    title: "Senior Manager, Assistant Controller",
    companyName: "Controller Company",
    description: "Own controllership, accounting close, audit readiness, and financial controls.",
  },
  {
    id: "job-037-procurement",
    title: "Procurement Manager",
    companyName: "Procurement Company",
    description: "Lead procurement, supplier management, sourcing, and vendor contracts.",
  },
  {
    id: "job-037-sourcing",
    title: "Strategic Sourcing Manager",
    companyName: "Sourcing Company",
    description: "Own strategic sourcing, supplier negotiations, procurement, and category strategy.",
  },
  {
    id: "job-037-accounts-receivable",
    title: "Accounts Receivable and Billing Operations Manager",
    companyName: "Billing Company",
    description: "Own accounts receivable, billing operations, collections, and financial reporting.",
  },
  {
    id: "job-037-fraud-strategy",
    title: "Fraud Strategy Manager",
    companyName: "Financial Services Company",
    description: "Own fraud controls, fraud investigations, risk policy, and loss prevention.",
  },
];

for (const unrelatedJob of unrelatedFinanceJobs) {
  const decision = evaluatePublicJobDecision(unrelatedJob, generalOperationsSignals, now);
  assert.equal(decision.included, false, `${unrelatedJob.title} must not inherit a general-operations target`);
  assert.equal(decision.label, "Probably Not Worth Your Time");
  assert.ok(decision.score <= 37, `${unrelatedJob.title} must stay under the excluded-score cap`);
  assert.ok(decision.risks.some((risk) => risk.includes("different lane")));
}

for (const title of ["Chief of Staff", "Business Operations Manager", "Director of Operations"]) {
  const decision = evaluatePublicJobDecision({
    id: `job-general-operations-${title}`,
    title,
    companyName: "Operations Company",
    description: "Lead business operations, executive planning, operating rhythms, and cross-functional strategic initiatives.",
  }, generalOperationsSignals, now);
  assert.equal(decision.included, true, `${title} should remain eligible for a general-operations profile`);
}

const financeProfile = profile();
financeProfile.roleTracks[0] = {
  ...financeProfile.roleTracks[0],
  name: "Finance Leadership",
  targetTitles: ["Director of Finance", "Corporate Controller"],
  keyResponsibilities: ["Lead financial planning, accounting, forecasting, and reporting"],
  requiredExperiencePatterns: ["Controllership and audit leadership"],
  strongJobSignals: ["Budget ownership", "Financial controls"],
  weakJobSignals: [],
  mismatchSignals: [],
};
const financeSignals = matchingSignalsForAggregate(financeProfile);
assert.ok(financeSignals.lanes.coreLanes.has("finance-accounting"));
for (const title of ["Finance Operations Manager", "Corporate Controller", "Accounts Receivable Manager"]) {
  const decision = evaluatePublicJobDecision({
    id: `job-finance-supported-${title}`,
    title,
    companyName: "Finance Company",
    description: "Own financial planning, accounting, forecasting, reporting, and audit readiness.",
  }, financeSignals, now);
  assert.equal(decision.included, true, `${title} should remain eligible for a finance profile`);
}

const fraudRiskProfile = profile();
fraudRiskProfile.roleTracks[0] = {
  ...fraudRiskProfile.roleTracks[0],
  name: "Fraud Risk Leadership",
  targetTitles: ["Fraud Strategy Manager", "Fraud Operations Manager"],
  keyResponsibilities: ["Lead fraud controls, investigations, risk policy, and loss prevention"],
  requiredExperiencePatterns: ["Fraud prevention and risk operations leadership"],
  strongJobSignals: ["Fraud strategy", "Risk controls"],
  weakJobSignals: [],
  mismatchSignals: [],
};
const fraudRiskSignals = matchingSignalsForAggregate(fraudRiskProfile);
assert.ok(fraudRiskSignals.lanes.coreLanes.has("risk-safety-operations"));
const fraudRiskDecision = evaluatePublicJobDecision({
  id: "job-fraud-risk-supported",
  title: "Fraud Strategy Manager",
  companyName: "Financial Services Company",
  description: "Own fraud controls, investigations, risk policy, and loss prevention.",
}, fraudRiskSignals, now);
assert.equal(fraudRiskDecision.included, true, "Fraud roles should remain eligible for a fraud-risk profile");

const procurementProfile = profile();
procurementProfile.roleTracks[0] = {
  ...procurementProfile.roleTracks[0],
  name: "Procurement Leadership",
  targetTitles: ["Procurement Manager", "Strategic Sourcing Manager"],
  keyResponsibilities: ["Lead procurement, strategic sourcing, and supplier management"],
  requiredExperiencePatterns: ["Vendor contracts and supply chain operations"],
  strongJobSignals: ["Supplier negotiations", "Category strategy"],
  weakJobSignals: [],
  mismatchSignals: [],
};
const procurementSignals = matchingSignalsForAggregate(procurementProfile);
assert.ok(procurementSignals.lanes.coreLanes.has("procurement-supply-chain-operations"));
for (const title of ["Procurement Operations Manager", "Strategic Sourcing Manager"]) {
  const decision = evaluatePublicJobDecision({
    id: `job-procurement-supported-${title}`,
    title,
    companyName: "Procurement Company",
    description: "Lead procurement, strategic sourcing, supplier management, and vendor contracts.",
  }, procurementSignals, now);
  assert.equal(decision.included, true, `${title} should remain eligible for a procurement profile`);
}

assert.equal(classifyOccupation({
  title: "Finance Strategy Manager",
  companyName: "Finance Company",
  description: "Own financial planning, forecasting, and executive finance strategy.",
}).lane, "finance-accounting");

console.log("public profile matching: all assertions passed");

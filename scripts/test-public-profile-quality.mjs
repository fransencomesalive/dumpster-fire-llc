import assert from "node:assert/strict";
import { evaluateCandidateProfileQuality } from "../lib/public-profile/profile-quality.ts";

const now = "2026-06-23T00:00:00.000Z";

const requiredQualityFields = {
  why_people_hire_me: [
    "problemsPeopleBringMe",
    "whatBreaksIfImNotThere",
    "messesICleanUp",
    "teamsThatBenefitFromMe",
    "situationsWhereIAmMostUseful",
    "situationsWhereIAmNotUseful",
  ],
  operating_style: [
    "howIApproachProblems",
    "howIHandleAmbiguity",
    "howIWorkWithTeams",
    "whatIValue",
    "whatIReject",
  ],
  decision_style: [
    "howIEvaluateRoles",
    "whatMakesRoleWorthPursuing",
    "whatMakesRoleBadFit",
    "whatILookForInCompanies",
    "redFlags",
    "greenFlags",
  ],
  communication_style: [
    "voiceDescription",
    "whatIShouldSoundLike",
    "whatIShouldNeverSoundLike",
  ],
  ai_misreadings: [
    "wrongAssumptions",
    "badDefaultFramings",
    "skillsNotToExaggerate",
    "rolesNotToForceMeInto",
    "languageThatMisrepresentsMe",
  ],
  outreach_rules: [
    "hiringManagerApproach",
    "recruiterApproach",
    "functionalLeaderApproach",
    "executiveSponsorApproach",
    "noContactRoutingApproach",
  ],
};

function qualityFields() {
  return Object.entries(requiredQualityFields).flatMap(([section, fieldKeys]) =>
    fieldKeys.map((fieldKey) => ({
      id: `${section}-${fieldKey}`,
      profileId: "profile-1",
      section,
      fieldKey,
      value: `Specific answer for ${fieldKey}.`,
      quality: "complete",
      createdAt: now,
      updatedAt: now,
    })),
  );
}

function completeAggregate() {
  return {
    profile: {
      id: "profile-1",
      userId: "user-1",
      status: "incomplete",
      version: 1,
      fullName: "Avery Candidate",
      location: "Denver, CO",
      workAuthorization: "US authorized",
      remotePreference: "remote_preferred",
      availability: "Two weeks",
      generatedMarkdown: "",
      createdAt: now,
      updatedAt: now,
    },
    preferences: {
      id: "preferences-1",
      profileId: "profile-1",
      employmentTypes: ["full_time"],
      targetIndustries: ["AI"],
      avoidIndustries: [],
      targetCompanyTypes: ["Product-led"],
      avoidCompanies: [],
      createdAt: now,
      updatedAt: now,
    },
    companyWatchlist: [],
    roleTracks: [{
      id: "track-1",
      profileId: "profile-1",
      name: "Program Director",
      description: "Leads ambiguous cross-functional delivery.",
      corePositioning: "Turns messy strategic work into shipped systems.",
      outreachAngle: "Workflow and stakeholder alignment.",
      targetTitles: ["Program Director"],
      keyResponsibilities: ["Stakeholder alignment"],
      requiredExperiencePatterns: ["Cross-functional programs"],
      strongJobSignals: ["Ambiguous systems work"],
      weakJobSignals: ["Pure scrum ceremony"],
      mismatchSignals: ["Staffing-only delivery"],
      doNotOverclaim: ["Deep platform engineering"],
      resumeIds: ["resume-1"],
      createdAt: now,
      updatedAt: now,
    }],
    resumes: [{
      id: "resume-1",
      profileId: "profile-1",
      name: "Program Director Resume",
      fileUrl: "https://files.example/resume.pdf",
      parsedText: "Program leadership and workflow systems.",
      associatedRoleTrackIds: ["track-1"],
      strengths: ["Program leadership"],
      gaps: ["No deep engineering management"],
      useWhen: ["Program-heavy roles"],
      avoidWhen: ["Pure engineering roles"],
      parsingQuality: "complete",
      parsingIssues: [],
      createdAt: now,
      updatedAt: now,
    }],
    workHistory: [{
      id: "work-1",
      profileId: "profile-1",
      company: "Studio Co",
      title: "Director of Programs",
      currentRole: false,
      responsibilities: ["Led launch operations"],
      accomplishments: [],
      skills: ["Stakeholder leadership"],
      metrics: [],
      associatedResumeIds: ["resume-1"],
      source: "resume_parse",
      createdAt: now,
      updatedAt: now,
    }],
    projects: [{
      id: "project-1",
      profileId: "profile-1",
      name: "Phred",
      description: "Internal AI workflow system.",
      candidateRole: "Product and program lead",
      whatThisProves: ["Can orchestrate AI workflow"],
      capabilitiesDemonstrated: ["Workflow design"],
      keyResponsibilitiesSupported: ["Delivery governance"],
      requiredExperienceSupported: ["Systems thinking"],
      industriesRelevant: ["AI"],
      bestUsedFor: ["AI operations roles"],
      avoidUsingFor: ["Pure software engineering"],
      metricsResults: [],
      caveats: ["Not a commercial SaaS"],
      confidence: "high",
      createdAt: now,
      updatedAt: now,
    }],
    skills: [{
      id: "skill-1",
      profileId: "profile-1",
      skillName: "Workflow Strategy",
      proficiency: "expert",
      evidence: ["Phred"],
      relatedProjectIds: ["project-1"],
      relatedWorkHistoryIds: ["work-1"],
      bestRoleFit: ["Program Director"],
      doNotOverclaim: ["Backend architecture"],
      createdAt: now,
      updatedAt: now,
    }],
    qualityFields: qualityFields(),
    communicationStyle: {
      id: "communication-1",
      profileId: "profile-1",
      preferredTone: ["direct"],
      formalityLevel: "medium",
      humorLevel: "light",
      messageLengthPreference: "short",
      greetingPreferences: ["Hi first-name"],
      signoffPreferences: ["Thanks"],
      phrasesToAvoid: ["I am excited to apply"],
      phrasesThatSoundLikeMe: ["Here is the useful bit"],
      createdAt: now,
      updatedAt: now,
    },
    writingSamples: [{
      id: "sample-1",
      profileId: "profile-1",
      sampleType: "like",
      channel: "email",
      text: "Short, direct, useful.",
      whyItWorksOrFails: "It gets to the point.",
      createdAt: now,
      updatedAt: now,
    }, {
      id: "sample-2",
      profileId: "profile-1",
      sampleType: "hate",
      channel: "linkedin",
      text: "I am thrilled to submit my candidacy.",
      whyItWorksOrFails: "It sounds generic.",
      createdAt: now,
      updatedAt: now,
    }],
    outreachRules: {
      id: "rules-1",
      profileId: "profile-1",
      globalRules: ["No cover-letter posture"],
      followUpRules: ["One useful follow-up"],
      linkSelectionRules: ["Use Phred for AI workflow roles"],
      createdAt: now,
      updatedAt: now,
    },
    roleTrackOutreachRules: [],
  };
}

const complete = evaluateCandidateProfileQuality(completeAggregate(), now);
assert.equal(complete.status, "complete");
assert.equal(complete.weakResponseCount, 0);
assert.deepEqual(complete.incompleteReasons, []);
assert.ok(complete.completeFields.includes("roleTracks.track-1.resumeIds"));
assert.ok(complete.completeFields.includes("outreach_rules.noContactRoutingApproach"));

const weak = completeAggregate();
weak.qualityFields = weak.qualityFields.map((field) =>
  field.section === "why_people_hire_me" && field.fieldKey === "problemsPeopleBringMe"
    ? { ...field, quality: "weak" }
    : field,
);
const weakResult = evaluateCandidateProfileQuality(weak, now);
assert.equal(weakResult.status, "incomplete");
assert.equal(weakResult.weakResponseCount, 1);
assert.ok(weakResult.weakFields.includes("why_people_hire_me.problemsPeopleBringMe"));
assert.ok(weakResult.incompleteReasons.includes("Weak required profile answer: why_people_hire_me.problemsPeopleBringMe"));

const missingRelationship = completeAggregate();
missingRelationship.resumes[0].associatedRoleTrackIds = [];
missingRelationship.roleTracks[0].resumeIds = [];
const missingRelationshipResult = evaluateCandidateProfileQuality(missingRelationship, now);
assert.equal(missingRelationshipResult.status, "incomplete");
assert.ok(missingRelationshipResult.incompleteReasons.some((reason) => reason.includes("must be attached to a resume")));
assert.ok(missingRelationshipResult.incompleteReasons.some((reason) => reason.includes("must be attached to a Role Track")));

const weakResume = completeAggregate();
weakResume.resumes[0].parsingQuality = "weak";
const weakResumeResult = evaluateCandidateProfileQuality(weakResume, now);
assert.equal(weakResumeResult.status, "incomplete");
assert.ok(weakResumeResult.incompleteReasons.includes("Resume Program Director Resume parsing quality must be complete."));

const missingWritingSample = completeAggregate();
missingWritingSample.writingSamples = missingWritingSample.writingSamples.filter((sample) => sample.sampleType !== "hate");
const missingWritingSampleResult = evaluateCandidateProfileQuality(missingWritingSample, now);
assert.equal(missingWritingSampleResult.status, "incomplete");
assert.ok(missingWritingSampleResult.incompleteReasons.includes("At least one hated writing sample is required."));

console.log("public profile quality: all assertions passed");

import assert from "node:assert/strict";
import { regenerateCandidateProfileArtifacts } from "../lib/public-profile/profile-generation";
import type { CandidateProfileAggregate, QualityScoredTextField, QualitySection } from "../lib/public-profile/types";

const now = "2026-06-23T12:00:00.000Z";

const requiredQualityFields: Record<Exclude<QualitySection, "leadership_profile">, string[]> = {
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

function qualityFields(): QualityScoredTextField[] {
  return Object.entries(requiredQualityFields).flatMap(([section, fieldKeys]) =>
    fieldKeys.map((fieldKey) => ({
      id: `${section}-${fieldKey}`,
      profileId: "profile-1",
      section: section as QualitySection,
      fieldKey,
      value: `Specific answer for ${fieldKey}.`,
      quality: "complete",
      createdAt: now,
      updatedAt: now,
    })),
  );
}

function aggregate(): CandidateProfileAggregate {
  return {
    profile: {
      id: "profile-1",
      userId: "user-1",
      status: "incomplete",
      version: 4,
      fullName: "Avery Candidate",
      location: "Denver, CO",
      workAuthorization: "US authorized",
      remotePreference: "remote_preferred",
      availability: "Two weeks",
      generatedMarkdown: "old markdown",
      markdownGeneratedAt: "2026-06-22T12:00:00.000Z",
      createdAt: "2026-06-22T00:00:00.000Z",
      updatedAt: "2026-06-22T12:00:00.000Z",
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

const complete = regenerateCandidateProfileArtifacts(aggregate(), {
  generatedAt: now,
  changeSummary: "Fixture regeneration.",
});

assert.equal(complete.profileQuality.status, "complete");
assert.equal(complete.aggregate.profile.status, "complete");
assert.equal(complete.aggregate.profile.version, 5);
assert.equal(complete.aggregate.profile.markdownGeneratedAt, now);
assert.equal(complete.generatedMarkdown.profileVersion, 5);
assert.equal(complete.profileVersion.version, 5);
assert.equal(complete.profileVersion.changeSummary, "Fixture regeneration.");
assert.match(complete.profileVersion.generatedMarkdown, /Status: complete/);
assert.equal(complete.persistenceRows.candidateProfile.status, "complete");
assert.equal(complete.persistenceRows.candidateProfile.version, 5);
assert.equal(complete.persistenceRows.profileQuality.weak_response_count, 0);
assert.equal(complete.persistenceRows.profileVersion.change_summary, "Fixture regeneration.");

const weak = aggregate();
weak.qualityFields = weak.qualityFields.map((field) =>
  field.section === "outreach_rules" && field.fieldKey === "hiringManagerApproach"
    ? { ...field, quality: "weak" }
    : field,
);
const incomplete = regenerateCandidateProfileArtifacts(weak, {
  generatedAt: now,
  nextVersion: 12,
});

assert.equal(incomplete.profileQuality.status, "incomplete");
assert.equal(incomplete.aggregate.profile.status, "incomplete");
assert.equal(incomplete.aggregate.profile.version, 12);
assert.equal(incomplete.persistenceRows.candidateProfile.status, "incomplete");
assert.equal(incomplete.persistenceRows.profileQuality.weak_response_count, 1);
assert.deepEqual(incomplete.persistenceRows.profileQuality.weak_fields, ["outreach_rules.hiringManagerApproach"]);
assert.match(incomplete.profileVersion.generatedMarkdown, /Status: incomplete/);

console.log("public profile generation: all assertions passed");

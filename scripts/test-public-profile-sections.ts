import assert from "node:assert/strict";
import {
  updateLoadedIdentitySearchSectionForUser,
  updateLoadedCommunicationStyleSectionForUser,
  updateLoadedLeadershipProfileSectionForUser,
  updateLoadedProofLibrarySectionForUser,
  updateLoadedOutreachRulesSectionForUser,
  updateLoadedQualityNarrativeSectionForUser,
  updateLoadedResumeUploadsSectionForUser,
  updateLoadedRoleTracksSectionForUser,
  updateLoadedSkillsInventorySectionForUser,
  updateLoadedWorkHistorySectionForUser,
  updateLoadedWritingSamplesSectionForUser,
} from "../lib/public-profile/section-service";
import {
  applyResumeUploadsSectionPatch,
  applyProofLibrarySectionPatch,
  applyQualityNarrativeSectionPatch,
  applyRoleTracksSectionPatch,
  applySkillsInventorySectionPatch,
  applyWorkHistorySectionPatch,
  applyWritingSamplesSectionPatch,
  applyIdentitySearchSectionPatch,
  applyCommunicationStyleSectionPatch,
  applyLeadershipProfileSectionPatch,
  applyOutreachRulesSectionPatch,
  parseIdentitySearchSectionPatch,
  parseCommunicationStyleSectionPatch,
  parseLeadershipProfileSectionPatch,
  parseOutreachRulesSectionPatch,
  parseProofLibrarySectionPatch,
  parseQualityNarrativeSectionPatch,
  parseResumeUploadsSectionPatch,
  parseRoleTracksSectionPatch,
  parseSkillsInventorySectionPatch,
  parseWorkHistorySectionPatch,
  parseWritingSamplesSectionPatch,
} from "../lib/public-profile/sections";
import type { CandidateProfileAggregate } from "../lib/public-profile/types";
import { completeCandidateProfileAggregate } from "./fixtures/public-profile";

const now = "2026-06-23T17:00:00.000Z";

function aggregate(): CandidateProfileAggregate {
  return {
    profile: {
      id: "profile-1",
      userId: "user-1",
      status: "incomplete",
      version: 1,
      fullName: "Avery Candidate",
      preferredName: "Avery",
      location: "Denver, CO",
      workAuthorization: "US authorized",
      email: "avery@example.com",
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
    roleTracks: [],
    resumes: [],
    workHistory: [],
    projects: [],
    skills: [],
    qualityFields: [],
    writingSamples: [],
    roleTrackOutreachRules: [],
  };
}

async function main() {
  const invalidBody = parseIdentitySearchSectionPatch(null);
  assert.equal(invalidBody.ok, false);
  if (!invalidBody.ok) {
    assert.equal(invalidBody.issues[0].field, "body");
  }

  const invalidEnum = parseIdentitySearchSectionPatch({
    remotePreference: "anywhere",
  });
  assert.equal(invalidEnum.ok, false);
  if (!invalidEnum.ok) {
    assert.equal(invalidEnum.issues[0].field, "remotePreference");
  }

  const parsed = parseIdentitySearchSectionPatch({
    fullName: "  Avery Candidate  ",
    email: "",
    remotePreference: "hybrid_ok",
    targetCompensationMin: "140000.4",
    employmentTypes: ["full_time", "contract", "full_time"],
    targetIndustries: [" AI ", "", "Media", "AI"],
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.patch, {
      fullName: "Avery Candidate",
      email: undefined,
      remotePreference: "hybrid_ok",
      targetCompensationMin: 140000,
      employmentTypes: ["full_time", "contract"],
      targetIndustries: ["AI", "Media"],
    });
  }

  const applied = applyIdentitySearchSectionPatch(aggregate(), {
    fullName: "",
    email: undefined,
    employmentTypes: [],
  }, now);
  assert.equal(applied.aggregate.profile.fullName, "");
  assert.equal(applied.aggregate.profile.email, undefined);
  assert.deepEqual(applied.section.employmentTypes, []);
  assert.equal(applied.profileQuality.status, "incomplete");
  assert.ok(applied.profileQuality.incompleteReasons.includes("Full name is required."));
  assert.ok(applied.profileQuality.incompleteReasons.includes("At least one employment type is required."));

  const validationPersisted: unknown[] = [];
  const validationResult = await updateLoadedIdentitySearchSectionForUser({
    loadAggregate: async () => aggregate(),
    persistIdentitySearchSection: async (result) => {
      validationPersisted.push(result);
    },
  }, "user-1", { remotePreference: "mars" }, { updatedAt: now });
  assert.equal(validationResult.status, "validation_error");
  assert.equal(validationPersisted.length, 0);

  const missingResult = await updateLoadedIdentitySearchSectionForUser({
    loadAggregate: async () => undefined,
    persistIdentitySearchSection: async () => {
      throw new Error("missing profile should not persist");
    },
  }, "user-404", { fullName: "Avery" }, { updatedAt: now });
  assert.deepEqual(missingResult, {
    status: "not_found",
    userId: "user-404",
  });

  const persisted: unknown[] = [];
  const updateResult = await updateLoadedIdentitySearchSectionForUser({
    loadAggregate: async () => aggregate(),
    persistIdentitySearchSection: async (result) => {
      persisted.push(result);
    },
  }, "user-1", {
    location: "Boulder, CO",
    avoidCompanies: ["Bad Co", "Bad Co", "  "],
  }, { updatedAt: now });
  assert.equal(updateResult.status, "updated");
  if (updateResult.status === "updated") {
    assert.equal(updateResult.section.location, "Boulder, CO");
    assert.deepEqual(updateResult.section.avoidCompanies, ["Bad Co"]);
    assert.equal(updateResult.aggregate.profile.updatedAt, now);
  }
  assert.equal(persisted.length, 1);

  const roleTrackValidation = parseRoleTracksSectionPatch({
    roleTracks: [{
      id: "",
      name: " ",
      description: "Leads ambiguous work.",
      corePositioning: "Turns mess into shipped systems.",
      outreachAngle: "Useful delivery context.",
      targetTitles: ["Program Director"],
      keyResponsibilities: ["Stakeholder alignment"],
      requiredExperiencePatterns: ["Cross-functional delivery"],
      strongJobSignals: ["Ambiguous systems"],
      weakJobSignals: ["Pure ceremonies"],
      mismatchSignals: ["Staffing only"],
      doNotOverclaim: ["Platform engineering"],
      resumeIds: ["resume-1"],
    }],
  });
  assert.equal(roleTrackValidation.ok, false);
  if (!roleTrackValidation.ok) {
    assert.ok(roleTrackValidation.issues.some((issue) => issue.field === "roleTracks.0.id"));
    assert.ok(roleTrackValidation.issues.some((issue) => issue.field === "roleTracks.0.name"));
  }

  const roleTrackDuplicate = parseRoleTracksSectionPatch({
    roleTracks: [completeCandidateProfileAggregate(now).roleTracks[0], completeCandidateProfileAggregate(now).roleTracks[0]],
  });
  assert.equal(roleTrackDuplicate.ok, false);
  if (!roleTrackDuplicate.ok) {
    assert.ok(roleTrackDuplicate.issues.some((issue) => issue.message.includes("Duplicate Role Track id")));
  }

  const completeAggregate = completeCandidateProfileAggregate(now);
  const emptyRoleTracks = applyRoleTracksSectionPatch(completeAggregate, {
    roleTracks: [],
  }, now);
  assert.equal(emptyRoleTracks.section.roleTracks.length, 0);
  assert.equal(emptyRoleTracks.profileQuality.status, "incomplete");
  assert.ok(emptyRoleTracks.profileQuality.incompleteReasons.includes("At least one Role Track is required."));

  const roleTrackPersisted: unknown[] = [];
  const roleTracksUpdate = await updateLoadedRoleTracksSectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => {
      throw new Error("role track update should not persist identity/search");
    },
    persistRoleTracksSection: async (result) => {
      roleTrackPersisted.push(result);
    },
  }, "user-1", {
    roleTracks: [{
      ...completeAggregate.roleTracks[0],
      name: "Senior Program Director",
      targetTitles: ["Senior Program Director", "Program Director", "Senior Program Director"],
    }],
  }, { updatedAt: now });
  assert.equal(roleTracksUpdate.status, "updated");
  if (roleTracksUpdate.status === "updated") {
    assert.equal(roleTracksUpdate.section.roleTracks[0].name, "Senior Program Director");
    assert.deepEqual(roleTracksUpdate.section.roleTracks[0].targetTitles, ["Senior Program Director", "Program Director"]);
  }
  assert.equal(roleTrackPersisted.length, 1);

  const resumeValidation = parseResumeUploadsSectionPatch({
    resumes: [{
      id: "resume-1",
      name: "Program Resume",
      fileUrl: "https://files.example/resume.pdf",
      parsedText: "Parsed text.",
      associatedRoleTrackIds: ["track-1"],
      strengths: ["Program leadership"],
      gaps: ["No deep engineering management"],
      useWhen: ["Program-heavy roles"],
      avoidWhen: ["Pure engineering roles"],
      parsingQuality: "mostly-fine",
      parsingIssues: [],
    }],
  });
  assert.equal(resumeValidation.ok, false);
  if (!resumeValidation.ok) {
    assert.ok(resumeValidation.issues.some((issue) => issue.field === "resumes.0.parsingQuality"));
  }

  const emptyResumes = applyResumeUploadsSectionPatch(completeAggregate, {
    resumes: [],
  }, now);
  assert.equal(emptyResumes.section.resumes.length, 0);
  assert.equal(emptyResumes.profileQuality.status, "incomplete");
  assert.ok(emptyResumes.profileQuality.incompleteReasons.includes("At least one resume is required."));

  const invalidAttachment = await updateLoadedResumeUploadsSectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => {
      throw new Error("resume update should not persist identity/search");
    },
    persistResumeUploadsSection: async () => {
      throw new Error("invalid attachment should not persist resumes");
    },
  }, "user-1", {
    resumes: [{
      ...completeAggregate.resumes[0],
      associatedRoleTrackIds: ["missing-track"],
    }],
  }, { updatedAt: now });
  assert.equal(invalidAttachment.status, "validation_error");
  if (invalidAttachment.status === "validation_error") {
    assert.ok(invalidAttachment.issues.some((issue) => issue.message.includes("Unknown Role Track id")));
  }

  const resumePersisted: unknown[] = [];
  const resumeUpdate = await updateLoadedResumeUploadsSectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => {
      throw new Error("resume update should not persist identity/search");
    },
    persistResumeUploadsSection: async (result) => {
      resumePersisted.push(result);
    },
  }, "user-1", {
    resumes: [{
      ...completeAggregate.resumes[0],
      name: "Senior Program Resume",
      strengths: ["Program leadership", "Workflow design", "Program leadership"],
    }],
  }, { updatedAt: now });
  assert.equal(resumeUpdate.status, "updated");
  if (resumeUpdate.status === "updated") {
    assert.equal(resumeUpdate.section.resumes[0].name, "Senior Program Resume");
    assert.deepEqual(resumeUpdate.section.resumes[0].strengths, ["Program leadership", "Workflow design"]);
  }
  assert.equal(resumePersisted.length, 1);

  const workHistoryValidation = parseWorkHistorySectionPatch({
    workHistory: [{
      id: "work-1",
      company: "Studio Co",
      title: "Director of Programs",
      currentRole: "nope",
      responsibilities: ["Led launch operations"],
      accomplishments: [],
      skills: ["Stakeholder leadership"],
      metrics: [],
      associatedResumeIds: ["resume-1"],
      source: "resume_parse",
    }],
  });
  assert.equal(workHistoryValidation.ok, false);
  if (!workHistoryValidation.ok) {
    assert.ok(workHistoryValidation.issues.some((issue) => issue.field === "workHistory.0.currentRole"));
  }

  const emptyWorkHistory = applyWorkHistorySectionPatch(completeAggregate, {
    workHistory: [],
  }, now);
  assert.equal(emptyWorkHistory.section.workHistory.length, 0);
  assert.equal(emptyWorkHistory.profileQuality.status, "incomplete");
  assert.ok(emptyWorkHistory.profileQuality.incompleteReasons.includes("Parsed work history is required."));

  const invalidWorkHistoryAttachment = await updateLoadedWorkHistorySectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => {
      throw new Error("work history update should not persist identity/search");
    },
    persistWorkHistorySection: async () => {
      throw new Error("invalid attachment should not persist work history");
    },
  }, "user-1", {
    workHistory: [{
      ...completeAggregate.workHistory[0],
      associatedResumeIds: ["missing-resume"],
    }],
  }, { updatedAt: now });
  assert.equal(invalidWorkHistoryAttachment.status, "validation_error");
  if (invalidWorkHistoryAttachment.status === "validation_error") {
    assert.ok(invalidWorkHistoryAttachment.issues.some((issue) => issue.message.includes("Unknown Resume id")));
  }

  const workHistoryPersisted: unknown[] = [];
  const workHistoryUpdate = await updateLoadedWorkHistorySectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => {
      throw new Error("work history update should not persist identity/search");
    },
    persistWorkHistorySection: async (result) => {
      workHistoryPersisted.push(result);
    },
  }, "user-1", {
    workHistory: [{
      ...completeAggregate.workHistory[0],
      title: "Senior Director of Programs",
      responsibilities: ["Led launch operations", "Built workflow systems", "Led launch operations"],
      currentRole: false,
      source: "user_corrected",
    }],
  }, { updatedAt: now });
  assert.equal(workHistoryUpdate.status, "updated");
  if (workHistoryUpdate.status === "updated") {
    assert.equal(workHistoryUpdate.section.workHistory[0].title, "Senior Director of Programs");
    assert.deepEqual(workHistoryUpdate.section.workHistory[0].responsibilities, ["Led launch operations", "Built workflow systems"]);
    assert.equal(workHistoryUpdate.section.workHistory[0].source, "user_corrected");
  }
  assert.equal(workHistoryPersisted.length, 1);

  const proofValidation = parseProofLibrarySectionPatch({
    projects: [{
      id: "project-1",
      name: "",
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
      confidence: "maybe",
    }],
  });
  assert.equal(proofValidation.ok, false);
  if (!proofValidation.ok) {
    assert.ok(proofValidation.issues.some((issue) => issue.field === "projects.0.name"));
    assert.ok(proofValidation.issues.some((issue) => issue.field === "projects.0.confidence"));
  }

  const emptyProofLibrary = applyProofLibrarySectionPatch(completeAggregate, {
    projects: [],
  }, now);
  assert.equal(emptyProofLibrary.section.projects.length, 0);
  assert.equal(emptyProofLibrary.profileQuality.status, "incomplete");
  assert.ok(emptyProofLibrary.profileQuality.incompleteReasons.includes("At least one Project is required."));

  const proofPersisted: unknown[] = [];
  const proofUpdate = await updateLoadedProofLibrarySectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => {
      throw new Error("proof update should not persist identity/search");
    },
    persistProofLibrarySection: async (result) => {
      proofPersisted.push(result);
    },
  }, "user-1", {
    projects: [{
      ...completeAggregate.projects[0],
      name: "Phred Workflow System",
      link: "",
      capabilitiesDemonstrated: ["Workflow design", "AI orchestration", "Workflow design"],
    }],
  }, { updatedAt: now });
  assert.equal(proofUpdate.status, "updated");
  if (proofUpdate.status === "updated") {
    assert.equal(proofUpdate.section.projects[0].name, "Phred Workflow System");
    assert.equal(proofUpdate.section.projects[0].link, undefined);
    assert.deepEqual(proofUpdate.section.projects[0].capabilitiesDemonstrated, ["Workflow design", "AI orchestration"]);
  }
  assert.equal(proofPersisted.length, 1);

  const skillsValidation = parseSkillsInventorySectionPatch({
    skills: [{
      id: "skill-1",
      skillName: "",
      proficiency: "wizard",
      evidence: ["Led launch operations"],
      relatedProjectIds: ["project-1"],
      relatedWorkHistoryIds: ["work-1"],
      bestRoleFit: ["Program Director"],
      doNotOverclaim: ["Deep platform engineering"],
    }],
  });
  assert.equal(skillsValidation.ok, false);
  if (!skillsValidation.ok) {
    assert.ok(skillsValidation.issues.some((issue) => issue.field === "skills.0.skillName"));
    assert.ok(skillsValidation.issues.some((issue) => issue.field === "skills.0.proficiency"));
  }

  const emptySkills = applySkillsInventorySectionPatch(completeAggregate, {
    skills: [],
  }, now);
  assert.equal(emptySkills.section.skills.length, 0);
  assert.equal(emptySkills.profileQuality.status, "incomplete");
  assert.ok(emptySkills.profileQuality.incompleteReasons.includes("At least one skill is required."));

  const invalidSkillRelationship = await updateLoadedSkillsInventorySectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => {
      throw new Error("skills update should not persist identity/search");
    },
    persistSkillsInventorySection: async () => {
      throw new Error("invalid relationship should not persist skills");
    },
  }, "user-1", {
    skills: [{
      ...completeAggregate.skills[0],
      relatedProjectIds: ["missing-project"],
      relatedWorkHistoryIds: ["missing-work"],
    }],
  }, { updatedAt: now });
  assert.equal(invalidSkillRelationship.status, "validation_error");
  if (invalidSkillRelationship.status === "validation_error") {
    assert.ok(invalidSkillRelationship.issues.some((issue) => issue.message.includes("Unknown Proof object id")));
    assert.ok(invalidSkillRelationship.issues.some((issue) => issue.message.includes("Unknown Work History id")));
  }

  const skillsPersisted: unknown[] = [];
  const skillsUpdate = await updateLoadedSkillsInventorySectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => {
      throw new Error("skills update should not persist identity/search");
    },
    persistSkillsInventorySection: async (result) => {
      skillsPersisted.push(result);
    },
  }, "user-1", {
    skills: [{
      ...completeAggregate.skills[0],
      skillName: "AI workflow leadership",
      evidence: ["Led launch operations", "Built workflow systems", "Led launch operations"],
      proficiency: "expert",
    }],
  }, { updatedAt: now });
  assert.equal(skillsUpdate.status, "updated");
  if (skillsUpdate.status === "updated") {
    assert.equal(skillsUpdate.section.skills[0].skillName, "AI workflow leadership");
    assert.deepEqual(skillsUpdate.section.skills[0].evidence, ["Led launch operations", "Built workflow systems"]);
  }
  assert.equal(skillsPersisted.length, 1);

  const narrativeValidation = parseQualityNarrativeSectionPatch("why_people_hire_me", {
    fields: [{
      id: "why-problems",
      fieldKey: "howIApproachProblems",
      value: "Wrong section field.",
      quality: "perfect",
    }],
  });
  assert.equal(narrativeValidation.ok, false);
  if (!narrativeValidation.ok) {
    assert.ok(narrativeValidation.issues.some((issue) => issue.field === "fields.0.fieldKey"));
    assert.ok(narrativeValidation.issues.some((issue) => issue.field === "fields.0.quality"));
  }

  const duplicateNarrativeField = parseQualityNarrativeSectionPatch("why_people_hire_me", {
    fields: [
      completeAggregate.qualityFields[0],
      {
        ...completeAggregate.qualityFields[0],
        id: "why-duplicate",
      },
    ],
  });
  assert.equal(duplicateNarrativeField.ok, false);
  if (!duplicateNarrativeField.ok) {
    assert.ok(duplicateNarrativeField.issues.some((issue) => issue.message.includes("Duplicate narrative field key")));
  }

  const weakNarrative = applyQualityNarrativeSectionPatch(completeAggregate, "why_people_hire_me", {
    section: "why_people_hire_me",
    fields: completeAggregate.qualityFields
      .filter((field) => field.section === "why_people_hire_me")
      .map((field) => field.fieldKey === "problemsPeopleBringMe"
        ? {
            id: field.id,
            fieldKey: field.fieldKey,
            value: "",
            quality: "weak",
            feedback: "Needs specifics.",
          }
        : {
            id: field.id,
            fieldKey: field.fieldKey,
            value: field.value,
            quality: field.quality,
            feedback: field.feedback,
          }),
  }, now);
  assert.equal(weakNarrative.section.fields[0].value, "");
  assert.equal(weakNarrative.profileQuality.status, "incomplete");
  assert.ok(weakNarrative.profileQuality.incompleteReasons.includes("Missing required profile answer: why_people_hire_me.problemsPeopleBringMe"));

  const narrativePersisted: unknown[] = [];
  const narrativeUpdate = await updateLoadedQualityNarrativeSectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => {
      throw new Error("narrative update should not persist identity/search");
    },
    persistQualityNarrativeSection: async (result) => {
      narrativePersisted.push(result);
    },
  }, "user-1", "operating_style", {
    fields: completeAggregate.qualityFields
      .filter((field) => field.section === "operating_style")
      .map((field) => ({
        id: field.id,
        fieldKey: field.fieldKey,
        value: field.fieldKey === "howIApproachProblems" ? "  I map the messy system first.  " : field.value,
        quality: field.quality,
        feedback: "",
      })),
  }, { updatedAt: now });
  assert.equal(narrativeUpdate.status, "updated");
  if (narrativeUpdate.status === "updated") {
    assert.equal(narrativeUpdate.section.section, "operating_style");
    assert.equal(narrativeUpdate.section.fields[0].value, "I map the messy system first.");
    assert.equal(narrativeUpdate.section.fields[0].feedback, undefined);
  }
  assert.equal(narrativePersisted.length, 1);

  const aiMisreadingsParsed = parseQualityNarrativeSectionPatch("ai_misreadings", {
    fields: completeAggregate.qualityFields
      .filter((field) => field.section === "ai_misreadings")
      .map((field) => ({
        id: field.id,
        fieldKey: field.fieldKey,
        value: field.value,
        quality: field.quality,
      })),
  });
  assert.equal(aiMisreadingsParsed.ok, true);

  const communicationValidation = parseCommunicationStyleSectionPatch({
    settings: {
      preferredTone: ["Direct"],
      formalityLevel: "cosmic",
      humorLevel: "light",
      messageLengthPreference: "short",
      greetingPreferences: ["Hi"],
      signoffPreferences: ["Thanks"],
      phrasesToAvoid: ["rockstar"],
      phrasesThatSoundLikeMe: ["clean up messy systems"],
    },
    fields: [{
      id: "voice",
      fieldKey: "wrongAssumptions",
      value: "Wrong field.",
      quality: "complete",
    }],
  });
  assert.equal(communicationValidation.ok, false);
  if (!communicationValidation.ok) {
    assert.ok(communicationValidation.issues.some((issue) => issue.field === "settings.formalityLevel"));
    assert.ok(communicationValidation.issues.some((issue) => issue.field === "fields.0.fieldKey"));
  }

  const weakCommunication = applyCommunicationStyleSectionPatch(completeAggregate, {
    settings: {
      ...completeAggregate.communicationStyle!,
      preferredTone: [],
    },
    fields: completeAggregate.qualityFields
      .filter((field) => field.section === "communication_style")
      .map((field) => ({
        id: field.id,
        fieldKey: field.fieldKey,
        value: field.value,
        quality: field.quality,
        feedback: field.feedback,
      })),
  }, now);
  assert.deepEqual(weakCommunication.section.settings?.preferredTone, []);
  assert.equal(weakCommunication.profileQuality.status, "incomplete");
  assert.ok(weakCommunication.profileQuality.incompleteReasons.includes("Preferred tone is required."));

  const communicationPersisted: unknown[] = [];
  const communicationUpdate = await updateLoadedCommunicationStyleSectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => {
      throw new Error("communication update should not persist identity/search");
    },
    persistCommunicationStyleSection: async (result) => {
      communicationPersisted.push(result);
    },
  }, "user-1", {
    settings: {
      ...completeAggregate.communicationStyle!,
      preferredTone: ["Direct", "Warm", "Direct"],
      phrasesToAvoid: ["rockstar", "ninja", "rockstar"],
    },
    fields: completeAggregate.qualityFields
      .filter((field) => field.section === "communication_style")
      .map((field) => ({
        id: field.id,
        fieldKey: field.fieldKey,
        value: field.fieldKey === "voiceDescription" ? "  Direct, specific, and unforced.  " : field.value,
        quality: field.quality,
        feedback: field.feedback,
      })),
  }, { updatedAt: now });
  assert.equal(communicationUpdate.status, "updated");
  if (communicationUpdate.status === "updated") {
    assert.deepEqual(communicationUpdate.section.settings?.preferredTone, ["Direct", "Warm"]);
    assert.deepEqual(communicationUpdate.section.settings?.phrasesToAvoid, ["rockstar", "ninja"]);
    assert.equal(communicationUpdate.section.fields[0].value, "Direct, specific, and unforced.");
  }
  assert.equal(communicationPersisted.length, 1);

  const writingSamplesValidation = parseWritingSamplesSectionPatch({
    writingSamples: [{
      id: "sample-1",
      sampleType: "love",
      channel: "carrier_pigeon",
      text: "",
      whyItWorksOrFails: "Specific reason.",
    }],
  });
  assert.equal(writingSamplesValidation.ok, false);
  if (!writingSamplesValidation.ok) {
    assert.ok(writingSamplesValidation.issues.some((issue) => issue.field === "writingSamples.0.sampleType"));
    assert.ok(writingSamplesValidation.issues.some((issue) => issue.field === "writingSamples.0.channel"));
    assert.ok(writingSamplesValidation.issues.some((issue) => issue.field === "writingSamples.0.text"));
  }

  const emptyWritingSamples = applyWritingSamplesSectionPatch(completeAggregate, {
    writingSamples: [],
  }, now);
  assert.equal(emptyWritingSamples.section.writingSamples.length, 0);
  assert.equal(emptyWritingSamples.profileQuality.status, "incomplete");
  assert.ok(emptyWritingSamples.profileQuality.incompleteReasons.includes("At least one liked writing sample is required."));
  assert.ok(emptyWritingSamples.profileQuality.incompleteReasons.includes("At least one hated writing sample is required."));

  const writingSamplesPersisted: unknown[] = [];
  const writingSamplesUpdate = await updateLoadedWritingSamplesSectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => {
      throw new Error("writing samples update should not persist identity/search");
    },
    persistWritingSamplesSection: async (result) => {
      writingSamplesPersisted.push(result);
    },
  }, "user-1", {
    writingSamples: completeAggregate.writingSamples.map((sample) => ({
      id: sample.id,
      sampleType: sample.sampleType,
      channel: sample.channel,
      text: sample.sampleType === "like" ? "  Short, clear, useful.  " : sample.text,
      whyItWorksOrFails: sample.whyItWorksOrFails,
    })),
  }, { updatedAt: now });
  assert.equal(writingSamplesUpdate.status, "updated");
  if (writingSamplesUpdate.status === "updated") {
    assert.equal(writingSamplesUpdate.section.writingSamples[0].text, "Short, clear, useful.");
  }
  assert.equal(writingSamplesPersisted.length, 1);

  const outreachValidation = parseOutreachRulesSectionPatch({
    settings: {
      globalRules: ["Be specific."],
      followUpRules: ["Follow up once."],
      linkSelectionRules: ["Use relevant proof."],
    },
    fields: [{
      id: "outreach-bad",
      fieldKey: "voiceDescription",
      value: "Wrong section.",
      quality: "complete",
    }],
    roleTrackSpecificRules: [{
      id: "track-rule-1",
      roleTrackId: "",
      rules: ["Lead with proof"],
      preferredProofTypes: ["workflow"],
      avoidProofTypes: ["deep engineering"],
    }],
  });
  assert.equal(outreachValidation.ok, false);
  if (!outreachValidation.ok) {
    assert.ok(outreachValidation.issues.some((issue) => issue.field === "fields.0.fieldKey"));
    assert.ok(outreachValidation.issues.some((issue) => issue.field === "roleTrackSpecificRules.0.roleTrackId"));
  }

  const weakOutreach = applyOutreachRulesSectionPatch(completeAggregate, {
    settings: {
      ...completeAggregate.outreachRules!,
      globalRules: [],
    },
    fields: completeAggregate.qualityFields
      .filter((field) => field.section === "outreach_rules")
      .map((field) => ({
        id: field.id,
        fieldKey: field.fieldKey,
        value: field.value,
        quality: field.quality,
        feedback: field.feedback,
      })),
    roleTrackSpecificRules: [],
  }, now);
  assert.deepEqual(weakOutreach.section.settings?.globalRules, []);
  assert.equal(weakOutreach.profileQuality.status, "incomplete");
  assert.ok(weakOutreach.profileQuality.incompleteReasons.includes("Global outreach rules are required."));

  const invalidOutreachRelationship = await updateLoadedOutreachRulesSectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => {
      throw new Error("outreach update should not persist identity/search");
    },
    persistOutreachRulesSection: async () => {
      throw new Error("invalid outreach relationship should not persist");
    },
  }, "user-1", {
    settings: completeAggregate.outreachRules,
    fields: completeAggregate.qualityFields
      .filter((field) => field.section === "outreach_rules")
      .map((field) => ({
        id: field.id,
        fieldKey: field.fieldKey,
        value: field.value,
        quality: field.quality,
      })),
    roleTrackSpecificRules: [{
      id: "track-rule-1",
      roleTrackId: "missing-track",
      rules: ["Lead with proof"],
      preferredProofTypes: ["workflow"],
      avoidProofTypes: ["deep engineering"],
    }],
  }, { updatedAt: now });
  assert.equal(invalidOutreachRelationship.status, "validation_error");

  const outreachPersisted: unknown[] = [];
  const outreachUpdate = await updateLoadedOutreachRulesSectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => {
      throw new Error("outreach update should not persist identity/search");
    },
    persistOutreachRulesSection: async (result) => {
      outreachPersisted.push(result);
    },
  }, "user-1", {
    settings: {
      ...completeAggregate.outreachRules!,
      globalRules: ["Be specific.", "Lead with relevant proof.", "Be specific."],
    },
    fields: completeAggregate.qualityFields
      .filter((field) => field.section === "outreach_rules")
      .map((field) => ({
        id: field.id,
        fieldKey: field.fieldKey,
        value: field.fieldKey === "hiringManagerApproach" ? "  Lead with the useful proof.  " : field.value,
        quality: field.quality,
        feedback: field.feedback,
      })),
    roleTrackSpecificRules: [{
      id: "track-rule-1",
      roleTrackId: "track-1",
      rules: ["Lead with systems proof"],
      preferredProofTypes: ["workflow"],
      avoidProofTypes: ["deep engineering"],
    }],
  }, { updatedAt: now });
  assert.equal(outreachUpdate.status, "updated");
  if (outreachUpdate.status === "updated") {
    assert.deepEqual(outreachUpdate.section.settings?.globalRules, ["Be specific.", "Lead with relevant proof."]);
    assert.equal(outreachUpdate.section.fields[0].value, "Lead with the useful proof.");
    assert.equal(outreachUpdate.section.roleTrackSpecificRules[0].roleTrackId, "track-1");
  }
  assert.equal(outreachPersisted.length, 1);

  const leadershipValidation = parseLeadershipProfileSectionPatch({
    visible: "yes",
    fields: [{
      id: "leadership-bad",
      fieldKey: "voiceDescription",
      value: "Wrong section.",
      quality: "complete",
    }],
  });
  assert.equal(leadershipValidation.ok, false);
  if (!leadershipValidation.ok) {
    assert.ok(leadershipValidation.issues.some((issue) => issue.field === "visible"));
    assert.ok(leadershipValidation.issues.some((issue) => issue.field === "fields.0.fieldKey"));
  }

  const leadershipHidden = applyLeadershipProfileSectionPatch(completeAggregate, {
    visible: false,
    fields: [],
  }, now);
  assert.equal(leadershipHidden.section.visible, false);
  assert.deepEqual(leadershipHidden.section.fields, []);
  assert.equal(leadershipHidden.profileQuality.status, "complete");

  const leadershipPersisted: unknown[] = [];
  const leadershipUpdate = await updateLoadedLeadershipProfileSectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => {
      throw new Error("leadership update should not persist identity/search");
    },
    persistLeadershipProfileSection: async (result) => {
      leadershipPersisted.push(result);
    },
  }, "user-1", {
    visible: true,
    fields: [{
      id: "leadership-style",
      fieldKey: "leadershipStyle",
      value: "  Calm operator in messy systems.  ",
      quality: "complete",
      feedback: "",
    }],
  }, { updatedAt: now });
  assert.equal(leadershipUpdate.status, "updated");
  if (leadershipUpdate.status === "updated") {
    assert.equal(leadershipUpdate.section.visible, true);
    assert.equal(leadershipUpdate.section.fields[0].fieldKey, "leadershipStyle");
    assert.equal(leadershipUpdate.section.fields[0].value, "Calm operator in messy systems.");
    assert.equal(leadershipUpdate.profileQuality.status, "complete");
  }
  assert.equal(leadershipPersisted.length, 1);

  console.log("public profile sections: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

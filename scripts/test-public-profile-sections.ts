import assert from "node:assert/strict";
import {
  updateLoadedIdentitySearchSectionForUser,
  updateLoadedFitSignalsSectionForUser,
  updateLoadedVoicePersonalitySectionForUser,
  updateLoadedLeadershipProfileSectionForUser,
  updateLoadedWorkExamplesSectionForUser,
  updateLoadedOutreachRulesSectionForUser,
  updateLoadedResumeUploadsSectionForUser,
  updateLoadedRoleTracksSectionForUser,
  updateLoadedSkillsInventorySectionForUser,
  updateLoadedWritingSamplesSectionForUser,
} from "../lib/public-profile/section-service";
import {
  applyRoleTracksSectionPatch,
  applyWorkExamplesSectionPatch,
  applyWritingSamplesSectionPatch,
  parseFitSignalsSectionPatch,
  parseIdentitySearchSectionPatch,
  parseVoicePersonalitySectionPatch,
  parseRoleTracksSectionPatch,
  parseResumeUploadsSectionPatch,
  parseWorkExamplesSectionPatch,
  parseSkillsInventorySectionPatch,
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
      email: "avery@example.com",
      remotePreference: "remote_preferred",
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
    workExamples: [],
    skills: [],
    qualityFields: [],
    writingSamples: [],
    roleTrackOutreachRules: [],
  };
}

async function main() {
  // Identity & Search
  const invalidBody = parseIdentitySearchSectionPatch(null);
  assert.equal(invalidBody.ok, false);
  if (!invalidBody.ok) assert.equal(invalidBody.issues[0].field, "body");

  const invalidEnum = parseIdentitySearchSectionPatch({ remotePreference: "anywhere" });
  assert.equal(invalidEnum.ok, false);
  if (!invalidEnum.ok) assert.equal(invalidEnum.issues[0].field, "remotePreference");

  const parsedIdentity = parseIdentitySearchSectionPatch({
    fullName: "  Avery Candidate  ",
    email: "",
    remotePreference: "hybrid_ok",
    targetCompensationMin: "140000.4",
    employmentTypes: ["full_time", "contract", "full_time"],
    targetIndustries: [" AI ", "", "Media", "AI"],
  });
  assert.equal(parsedIdentity.ok, true);
  if (parsedIdentity.ok) {
    assert.deepEqual(parsedIdentity.patch, {
      fullName: "Avery Candidate",
      email: undefined,
      remotePreference: "hybrid_ok",
      targetCompensationMin: 140000,
      employmentTypes: ["full_time", "contract"],
      targetIndustries: ["AI", "Media"],
    });
  }

  const identityPersisted: unknown[] = [];
  const identityUpdate = await updateLoadedIdentitySearchSectionForUser({
    loadAggregate: async () => aggregate(),
    persistIdentitySearchSection: async (result) => { identityPersisted.push(result); },
  }, "user-1", { location: "Boulder, CO", avoidCompanies: ["Bad Co", "Bad Co", "  "] }, { updatedAt: now });
  assert.equal(identityUpdate.status, "updated");
  if (identityUpdate.status === "updated") {
    assert.equal(identityUpdate.section.location, "Boulder, CO");
    assert.deepEqual(identityUpdate.section.avoidCompanies, ["Bad Co"]);
  }
  assert.equal(identityPersisted.length, 1);

  const identityMissing = await updateLoadedIdentitySearchSectionForUser({
    loadAggregate: async () => undefined,
    persistIdentitySearchSection: async () => { throw new Error("missing profile should not persist"); },
  }, "user-404", { fullName: "Avery" }, { updatedAt: now });
  assert.deepEqual(identityMissing, { status: "not_found", userId: "user-404" });

  // Fit Signals
  const fitInvalid = parseFitSignalsSectionPatch({ goodSignals: "nope" });
  assert.equal(fitInvalid.ok, false);
  if (!fitInvalid.ok) assert.ok(fitInvalid.issues.some((issue) => issue.field === "goodSignals"));

  const fitParsed = parseFitSignalsSectionPatch({ goodSignals: [" Green ", "Green"], poorFitSignals: ["Red"] });
  assert.equal(fitParsed.ok, true);
  if (fitParsed.ok) {
    assert.deepEqual(fitParsed.patch.goodSignals, ["Green"]);
    assert.deepEqual(fitParsed.patch.poorFitSignals, ["Red"]);
  }

  const fitPersisted: unknown[] = [];
  const fitUpdate = await updateLoadedFitSignalsSectionForUser({
    loadAggregate: async () => aggregate(),
    persistIdentitySearchSection: async () => { throw new Error("fit signals should not persist identity"); },
    persistFitSignalsSection: async (result) => { fitPersisted.push(result); },
  }, "user-1", { goodSignals: ["Ambiguous systems work"], poorFitSignals: ["Staffing only"] }, { updatedAt: now });
  assert.equal(fitUpdate.status, "updated");
  if (fitUpdate.status === "updated") {
    assert.deepEqual(fitUpdate.section.goodSignals, ["Ambiguous systems work"]);
  }
  assert.equal(fitPersisted.length, 1);

  // Role Tracks
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

  const completeAggregate = completeCandidateProfileAggregate(now);
  const emptyRoleTracks = applyRoleTracksSectionPatch(completeAggregate, { roleTracks: [] }, now);
  assert.equal(emptyRoleTracks.section.roleTracks.length, 0);
  assert.equal(emptyRoleTracks.profileQuality.status, "incomplete");
  assert.ok(emptyRoleTracks.profileQuality.incompleteReasons.includes("At least one Role Track is required."));

  const roleTrackPersisted: unknown[] = [];
  const roleTracksUpdate = await updateLoadedRoleTracksSectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => { throw new Error("role track update should not persist identity/search"); },
    persistRoleTracksSection: async (result) => { roleTrackPersisted.push(result); },
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

  // Resumes
  const resumeValidation = parseRoleTracksSectionPatch({ roleTracks: "no" });
  assert.equal(resumeValidation.ok, false);

  const emptyResumes = applyRoleTracksSectionPatch(completeAggregate, { roleTracks: [] }, now);
  assert.equal(emptyResumes.section.roleTracks.length, 0);

  const invalidResumeAttachment = await updateLoadedResumeUploadsSectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => { throw new Error("resume update should not persist identity/search"); },
    persistResumeUploadsSection: async () => { throw new Error("invalid attachment should not persist resumes"); },
  }, "user-1", {
    resumes: [{ ...completeAggregate.resumes[0], associatedRoleTrackIds: ["missing-track"] }],
  }, { updatedAt: now });
  assert.equal(invalidResumeAttachment.status, "validation_error");
  if (invalidResumeAttachment.status === "validation_error") {
    assert.ok(invalidResumeAttachment.issues.some((issue) => issue.message.includes("Unknown Role Track id")));
  }

  // Resume highlights parse: preserved when present, default [] when omitted (backward compat).
  const resumeNoHighlights = { ...completeAggregate.resumes[0], id: "resume-2" };
  delete (resumeNoHighlights as { highlights?: string[] }).highlights; // simulate an older payload
  const resumeHighlightsParse = parseResumeUploadsSectionPatch({
    resumes: [
      { ...completeAggregate.resumes[0], highlights: ["Cut cost 30% at Beta Co"] },
      resumeNoHighlights,
    ],
  });
  assert.equal(resumeHighlightsParse.ok, true);
  if (resumeHighlightsParse.ok) {
    assert.deepEqual(resumeHighlightsParse.patch.resumes[0].highlights, ["Cut cost 30% at Beta Co"]);
    assert.deepEqual(resumeHighlightsParse.patch.resumes[1].highlights, []);
  }

  // Work Examples
  const workExampleValidation = parseWorkExamplesSectionPatch({
    workExamples: [{ id: "example-1", title: "", oneHitter: "Cut time 40%.", context: "Workflow system." }],
  });
  assert.equal(workExampleValidation.ok, false);
  if (!workExampleValidation.ok) {
    assert.ok(workExampleValidation.issues.some((issue) => issue.field === "workExamples.0.title"));
  }

  const emptyWorkExamples = applyWorkExamplesSectionPatch(completeAggregate, { workExamples: [] }, now);
  assert.equal(emptyWorkExamples.section.workExamples.length, 0);
  assert.equal(emptyWorkExamples.profileQuality.status, "incomplete");
  assert.ok(emptyWorkExamples.profileQuality.incompleteReasons.includes("At least one Work Example is required."));

  const workExamplePersisted: unknown[] = [];
  const workExampleUpdate = await updateLoadedWorkExamplesSectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => { throw new Error("work examples should not persist identity/search"); },
    persistWorkExamplesSection: async (result) => { workExamplePersisted.push(result); },
  }, "user-1", {
    workExamples: [{ ...completeAggregate.workExamples[0], title: "Phred Workflow System", link: "" }],
  }, { updatedAt: now });
  assert.equal(workExampleUpdate.status, "updated");
  if (workExampleUpdate.status === "updated") {
    assert.equal(workExampleUpdate.section.workExamples[0].title, "Phred Workflow System");
    assert.equal(workExampleUpdate.section.workExamples[0].link, undefined);
  }
  assert.equal(workExamplePersisted.length, 1);

  // Skills
  const skillsValidation = parseSkillsInventorySectionPatch({
    skills: [{
      id: "skill-1",
      skillName: "",
      proficiency: "wizard",
      evidence: ["Led launch operations"],
      relatedWorkExampleIds: ["example-1"],
      bestRoleFit: ["Program Director"],
      doNotOverclaim: ["Deep platform engineering"],
    }],
  });
  assert.equal(skillsValidation.ok, false);
  if (!skillsValidation.ok) {
    assert.ok(skillsValidation.issues.some((issue) => issue.field === "skills.0.skillName"));
    assert.ok(skillsValidation.issues.some((issue) => issue.field === "skills.0.proficiency"));
  }

  const invalidSkillRelationship = await updateLoadedSkillsInventorySectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => { throw new Error("skills update should not persist identity/search"); },
    persistSkillsInventorySection: async () => { throw new Error("invalid relationship should not persist skills"); },
  }, "user-1", {
    skills: [{ ...completeAggregate.skills[0], relatedWorkExampleIds: ["missing-example"] }],
  }, { updatedAt: now });
  assert.equal(invalidSkillRelationship.status, "validation_error");
  if (invalidSkillRelationship.status === "validation_error") {
    assert.ok(invalidSkillRelationship.issues.some((issue) => issue.message.includes("Unknown Work Example id")));
  }

  // Voice & Personality
  const voiceInvalid = parseVoicePersonalitySectionPatch({ toneTags: "nope" });
  assert.equal(voiceInvalid.ok, false);
  if (!voiceInvalid.ok) assert.ok(voiceInvalid.issues.some((issue) => issue.field === "toneTags"));

  const voiceLongNote = parseVoicePersonalitySectionPatch({
    q1Value: "Untangling delivery.",
    q4Opinion: "Most PM is theater.",
    toneTags: ["direct"],
    avoidTags: ["Corporate Jargon"],
    avoidNote: Array.from({ length: 30 }, (_, index) => `word${index}`).join(" "),
  });
  assert.equal(voiceLongNote.ok, false);
  if (!voiceLongNote.ok) assert.ok(voiceLongNote.issues.some((issue) => issue.field === "avoidNote"));

  const voicePersisted: unknown[] = [];
  const voiceUpdate = await updateLoadedVoicePersonalitySectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => { throw new Error("voice update should not persist identity/search"); },
    persistVoicePersonalitySection: async (result) => { voicePersisted.push(result); },
  }, "user-1", {
    q1Value: "  Untangling messy delivery.  ",
    q4Opinion: "Most program management is theater.",
    toneTags: ["direct", "no-fluff", "direct"],
    avoidTags: ["Corporate Jargon"],
    avoidNote: "No synergy.",
  }, { updatedAt: now });
  assert.equal(voiceUpdate.status, "updated");
  if (voiceUpdate.status === "updated") {
    assert.equal(voiceUpdate.section.q1Value, "Untangling messy delivery.");
    assert.deepEqual(voiceUpdate.section.toneTags, ["direct", "no-fluff"]);
  }
  assert.equal(voicePersisted.length, 1);

  // Writing Samples
  const writingSamplesValidation = parseWritingSamplesSectionPatch({
    writingSamples: [{ id: "sample-1", bucket: "love", channel: "carrier_pigeon", text: "", tags: [] }],
  });
  assert.equal(writingSamplesValidation.ok, false);
  if (!writingSamplesValidation.ok) {
    assert.ok(writingSamplesValidation.issues.some((issue) => issue.field === "writingSamples.0.bucket"));
    assert.ok(writingSamplesValidation.issues.some((issue) => issue.field === "writingSamples.0.channel"));
    assert.ok(writingSamplesValidation.issues.some((issue) => issue.field === "writingSamples.0.text"));
  }

  const longSample = parseWritingSamplesSectionPatch({
    writingSamples: [{
      id: "sample-1",
      bucket: "sounds_like_me",
      channel: "email",
      text: Array.from({ length: 130 }, (_, index) => `word${index}`).join(" "),
      tags: [],
    }],
  });
  assert.equal(longSample.ok, false);
  if (!longSample.ok) assert.ok(longSample.issues.some((issue) => issue.field === "writingSamples.0.text"));

  const emptyWritingSamples = applyWritingSamplesSectionPatch(completeAggregate, { writingSamples: [] }, now);
  assert.equal(emptyWritingSamples.section.writingSamples.length, 0);
  assert.equal(emptyWritingSamples.profileQuality.status, "incomplete");
  assert.ok(emptyWritingSamples.profileQuality.incompleteReasons.includes("At least one \"sounds like me\" writing sample is required."));
  assert.ok(emptyWritingSamples.profileQuality.incompleteReasons.includes("At least one \"never sound like this\" writing sample is required."));

  const writingSamplesPersisted: unknown[] = [];
  const writingSamplesUpdate = await updateLoadedWritingSamplesSectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => { throw new Error("writing samples update should not persist identity/search"); },
    persistWritingSamplesSection: async (result) => { writingSamplesPersisted.push(result); },
  }, "user-1", {
    writingSamples: completeAggregate.writingSamples.map((sample) => ({
      id: sample.id,
      bucket: sample.bucket,
      channel: sample.channel,
      text: sample.bucket === "sounds_like_me" ? "  Short, clear, useful.  " : sample.text,
      tags: sample.tags,
    })),
  }, { updatedAt: now });
  assert.equal(writingSamplesUpdate.status, "updated");
  if (writingSamplesUpdate.status === "updated") {
    assert.equal(writingSamplesUpdate.section.writingSamples[0].text, "Short, clear, useful.");
  }
  assert.equal(writingSamplesPersisted.length, 1);

  // Outreach Rules
  const outreachPersisted: unknown[] = [];
  const outreachUpdate = await updateLoadedOutreachRulesSectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => { throw new Error("outreach update should not persist identity/search"); },
    persistOutreachRulesSection: async (result) => { outreachPersisted.push(result); },
  }, "user-1", {
    settings: {
      ...completeAggregate.outreachRules!,
      globalRules: ["Be specific.", "Lead with relevant work.", "Be specific."],
    },
    fields: completeAggregate.qualityFields
      .filter((field) => field.section === "outreach_rules")
      .map((field) => ({
        id: field.id,
        fieldKey: field.fieldKey,
        value: field.fieldKey === "hiringManagerApproach" ? "  Lead with the useful work.  " : field.value,
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
    assert.deepEqual(outreachUpdate.section.settings?.globalRules, ["Be specific.", "Lead with relevant work."]);
    assert.equal(outreachUpdate.section.fields[0].value, "Lead with the useful work.");
    assert.equal(outreachUpdate.section.roleTrackSpecificRules[0].roleTrackId, "track-1");
  }
  assert.equal(outreachPersisted.length, 1);

  // Leadership Profile
  const leadershipPersisted: unknown[] = [];
  const leadershipUpdate = await updateLoadedLeadershipProfileSectionForUser({
    loadAggregate: async () => completeAggregate,
    persistIdentitySearchSection: async () => { throw new Error("leadership update should not persist identity/search"); },
    persistLeadershipProfileSection: async (result) => { leadershipPersisted.push(result); },
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
  }
  assert.equal(leadershipPersisted.length, 1);

  console.log("public profile sections: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

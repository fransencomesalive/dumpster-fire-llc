import assert from "node:assert/strict";
import {
  handleCommunicationStyleSectionGetRequest,
  handleCommunicationStyleSectionPatchRequest,
  handleIdentitySearchSectionGetRequest,
  handleIdentitySearchSectionPatchRequest,
  handleLeadershipProfileSectionGetRequest,
  handleLeadershipProfileSectionPatchRequest,
  handleOutreachRulesSectionGetRequest,
  handleOutreachRulesSectionPatchRequest,
  handleProofLibrarySectionGetRequest,
  handleProofLibrarySectionPatchRequest,
  handlePublicProfileBootstrapRequest,
  handlePublicProfileRegenerationRequest,
  handleQualityNarrativeSectionGetRequest,
  handleQualityNarrativeSectionPatchRequest,
  handleResumeUploadsSectionGetRequest,
  handleResumeUploadsSectionPatchRequest,
  handleRoleTracksSectionGetRequest,
  handleRoleTracksSectionPatchRequest,
  handleSkillsInventorySectionGetRequest,
  handleSkillsInventorySectionPatchRequest,
  handleWorkHistorySectionGetRequest,
  handleWorkHistorySectionPatchRequest,
  handleWritingSamplesSectionGetRequest,
  handleWritingSamplesSectionPatchRequest,
} from "../lib/public-profile/api";
import type { PublicProfileRepositoryRequest } from "../lib/public-profile/repository";
import type {
  PublicProfileCommunicationStyleReadResult,
  PublicProfileCommunicationStyleUpdateResult,
  PublicProfileIdentitySearchReadResult,
  PublicProfileIdentitySearchUpdateResult,
  PublicProfileLeadershipProfileReadResult,
  PublicProfileLeadershipProfileUpdateResult,
  PublicProfileOutreachRulesReadResult,
  PublicProfileOutreachRulesUpdateResult,
  PublicProfileProofLibraryReadResult,
  PublicProfileProofLibraryUpdateResult,
  PublicProfileQualityNarrativeReadResult,
  PublicProfileQualityNarrativeUpdateResult,
  PublicProfileResumeUploadsReadResult,
  PublicProfileResumeUploadsUpdateResult,
  PublicProfileRoleTracksReadResult,
  PublicProfileRoleTracksUpdateResult,
  PublicProfileSkillsInventoryReadResult,
  PublicProfileSkillsInventoryUpdateResult,
  PublicProfileWorkHistoryReadResult,
  PublicProfileWorkHistoryUpdateResult,
  PublicProfileWritingSamplesReadResult,
  PublicProfileWritingSamplesUpdateResult,
} from "../lib/public-profile/section-service";
import type { PublicProfileRegenerationResult } from "../lib/public-profile/service";
import { completeCandidateProfileAggregate } from "./fixtures/public-profile";

const now = "2026-06-23T16:00:00.000Z";
const request = new Request("https://app.example/api/public-profile/regenerate", {
  method: "POST",
});
const identityRequest = new Request("https://app.example/api/public-profile/identity-search", {
  method: "GET",
});
const repositoryRequest: PublicProfileRepositoryRequest = async () => {
  throw new Error("repository should not be called by mocked regeneration");
};

async function body(response: Response) {
  return await response.json() as Record<string, unknown>;
}

function incompleteResult(): PublicProfileRegenerationResult {
  return {
    status: "incomplete",
    userId: "user-1",
    aggregate: {
      profile: {
        id: "profile-1",
        userId: "user-1",
        status: "incomplete",
        version: 2,
        fullName: "Avery Candidate",
        location: "Denver, CO",
        workAuthorization: "US authorized",
        remotePreference: "remote_preferred",
        availability: "Two weeks",
        generatedMarkdown: "",
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
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "incomplete",
      incompleteReasons: ["At least one Role Track is required."],
      weakFields: ["roleTracks"],
      completeFields: [],
      weakResponseCount: 1,
      lastCheckedAt: now,
    },
  };
}

function regeneratedResult(): PublicProfileRegenerationResult {
  return {
    status: "regenerated",
    userId: "user-1",
    generation: {
      aggregate: {
        profile: {
          id: "profile-1",
          userId: "user-1",
          status: "complete",
          version: 3,
          fullName: "Avery Candidate",
          location: "Denver, CO",
          workAuthorization: "US authorized",
          remotePreference: "remote_preferred",
          availability: "Two weeks",
          generatedMarkdown: "generated markdown",
          markdownGeneratedAt: now,
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
        profileQuality: {
          id: "profile-quality-profile-1",
          profileId: "profile-1",
          status: "complete",
          incompleteReasons: [],
          weakFields: [],
          completeFields: ["identity.fullName"],
          weakResponseCount: 0,
          lastCheckedAt: now,
        },
      },
      generatedMarkdown: {
        markdown: "generated markdown",
        generatedAt: now,
        profileVersion: 3,
      },
      profileQuality: {
        id: "profile-quality-profile-1",
        profileId: "profile-1",
        status: "complete",
        incompleteReasons: [],
        weakFields: [],
        completeFields: ["identity.fullName"],
        weakResponseCount: 0,
        lastCheckedAt: now,
      },
      profileVersion: {
        profileId: "profile-1",
        version: 3,
        generatedMarkdown: "generated markdown",
        changeSummary: "Profile regenerated through public profile API.",
        createdAt: now,
      },
      persistenceRows: {
        candidateProfile: {
          id: "profile-1",
          status: "complete",
          version: 3,
          generated_markdown: "generated markdown",
          markdown_generated_at: now,
          updated_at: now,
        },
        profileQuality: {
          profile_id: "profile-1",
          status: "complete",
          incomplete_reasons: [],
          weak_fields: [],
          complete_fields: ["identity.fullName"],
          weak_response_count: 0,
          last_checked_at: now,
        },
        profileVersion: {
          profile_id: "profile-1",
          version: 3,
          generated_markdown: "generated markdown",
          change_summary: "Profile regenerated through public profile API.",
          created_at: now,
        },
      },
    },
  };
}

function identityReadResult(): PublicProfileIdentitySearchReadResult {
  return {
    status: "found",
    userId: "user-1",
    section: {
      fullName: "Avery Candidate",
      location: "Denver, CO",
      workAuthorization: "US authorized",
      remotePreference: "remote_preferred",
      availability: "Two weeks",
      employmentTypes: ["full_time"],
      targetIndustries: ["AI"],
      avoidIndustries: [],
      targetCompanyTypes: ["Product-led"],
      avoidCompanies: [],
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "incomplete",
      incompleteReasons: ["At least one Role Track is required."],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate: {
      profile: {
        id: "profile-1",
        userId: "user-1",
        status: "incomplete",
        version: 2,
        fullName: "Avery Candidate",
        location: "Denver, CO",
        workAuthorization: "US authorized",
        remotePreference: "remote_preferred",
        availability: "Two weeks",
        generatedMarkdown: "",
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
    },
  };
}

function identityUpdateResult(): PublicProfileIdentitySearchUpdateResult {
  return {
    status: "updated",
    userId: "user-1",
    section: {
      fullName: "Avery Candidate",
      location: "Boulder, CO",
      workAuthorization: "US authorized",
      remotePreference: "hybrid_ok",
      availability: "Two weeks",
      employmentTypes: ["full_time", "contract"],
      targetIndustries: ["AI"],
      avoidIndustries: [],
      targetCompanyTypes: ["Product-led"],
      avoidCompanies: ["Bad Co"],
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "incomplete",
      incompleteReasons: ["At least one Role Track is required."],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate: {
      profile: {
        id: "profile-1",
        userId: "user-1",
        status: "incomplete",
        version: 2,
        fullName: "Avery Candidate",
        location: "Boulder, CO",
        workAuthorization: "US authorized",
        remotePreference: "hybrid_ok",
        availability: "Two weeks",
        generatedMarkdown: "",
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
    },
  };
}

function roleTracksReadResult(): PublicProfileRoleTracksReadResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "found",
    userId: "user-1",
    section: {
      roleTracks: [{
        id: "track-1",
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
      }],
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate,
  };
}

function roleTracksUpdateResult(): PublicProfileRoleTracksUpdateResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "updated",
    userId: "user-1",
    section: {
      roleTracks: [{
        id: "track-1",
        name: "Senior Program Director",
        description: "Leads ambiguous cross-functional delivery.",
        corePositioning: "Turns messy strategic work into shipped systems.",
        outreachAngle: "Workflow and stakeholder alignment.",
        targetTitles: ["Senior Program Director"],
        keyResponsibilities: ["Stakeholder alignment"],
        requiredExperiencePatterns: ["Cross-functional programs"],
        strongJobSignals: ["Ambiguous systems work"],
        weakJobSignals: ["Pure scrum ceremony"],
        mismatchSignals: ["Staffing-only delivery"],
        doNotOverclaim: ["Deep platform engineering"],
        resumeIds: ["resume-1"],
      }],
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate: {
      ...aggregate,
      roleTracks: [{
        ...aggregate.roleTracks[0],
        name: "Senior Program Director",
      }],
    },
  };
}

function resumeUploadsReadResult(): PublicProfileResumeUploadsReadResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "found",
    userId: "user-1",
    section: {
      resumes: [{
        id: "resume-1",
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
      }],
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate,
  };
}

function resumeUploadsUpdateResult(): PublicProfileResumeUploadsUpdateResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "updated",
    userId: "user-1",
    section: {
      resumes: [{
        id: "resume-1",
        name: "Senior Program Resume",
        fileUrl: "https://files.example/resume.pdf",
        parsedText: "Program leadership and workflow systems.",
        associatedRoleTrackIds: ["track-1"],
        strengths: ["Program leadership", "Workflow design"],
        gaps: ["No deep engineering management"],
        useWhen: ["Program-heavy roles"],
        avoidWhen: ["Pure engineering roles"],
        parsingQuality: "complete",
        parsingIssues: [],
      }],
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate: {
      ...aggregate,
      resumes: [{
        ...aggregate.resumes[0],
        name: "Senior Program Resume",
        strengths: ["Program leadership", "Workflow design"],
      }],
    },
  };
}

function workHistoryReadResult(): PublicProfileWorkHistoryReadResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "found",
    userId: "user-1",
    section: {
      workHistory: [{
        id: "work-1",
        company: "Studio Co",
        title: "Director of Programs",
        currentRole: false,
        responsibilities: ["Led launch operations"],
        accomplishments: [],
        skills: ["Stakeholder leadership"],
        metrics: [],
        associatedResumeIds: ["resume-1"],
        source: "resume_parse",
      }],
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate,
  };
}

function workHistoryUpdateResult(): PublicProfileWorkHistoryUpdateResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "updated",
    userId: "user-1",
    section: {
      workHistory: [{
        id: "work-1",
        company: "Studio Co",
        title: "Senior Director of Programs",
        currentRole: false,
        responsibilities: ["Led launch operations", "Built workflow systems"],
        accomplishments: [],
        skills: ["Stakeholder leadership"],
        metrics: [],
        associatedResumeIds: ["resume-1"],
        source: "user_corrected",
      }],
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate: {
      ...aggregate,
      workHistory: [{
        ...aggregate.workHistory[0],
        title: "Senior Director of Programs",
        responsibilities: ["Led launch operations", "Built workflow systems"],
        source: "user_corrected",
      }],
    },
  };
}

function proofLibraryReadResult(): PublicProfileProofLibraryReadResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "found",
    userId: "user-1",
    section: {
      projects: [{
        id: "project-1",
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
      }],
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate,
  };
}

function proofLibraryUpdateResult(): PublicProfileProofLibraryUpdateResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "updated",
    userId: "user-1",
    section: {
      projects: [{
        id: "project-1",
        name: "Phred Workflow System",
        description: "Internal AI workflow system.",
        candidateRole: "Product and program lead",
        whatThisProves: ["Can orchestrate AI workflow"],
        capabilitiesDemonstrated: ["Workflow design", "AI orchestration"],
        keyResponsibilitiesSupported: ["Delivery governance"],
        requiredExperienceSupported: ["Systems thinking"],
        industriesRelevant: ["AI"],
        bestUsedFor: ["AI operations roles"],
        avoidUsingFor: ["Pure software engineering"],
        metricsResults: [],
        caveats: ["Not a commercial SaaS"],
        confidence: "high",
      }],
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate: {
      ...aggregate,
      projects: [{
        ...aggregate.projects[0],
        name: "Phred Workflow System",
        capabilitiesDemonstrated: ["Workflow design", "AI orchestration"],
      }],
    },
  };
}

function skillsInventoryReadResult(): PublicProfileSkillsInventoryReadResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "found",
    userId: "user-1",
    section: {
      skills: [{
        id: "skill-1",
        skillName: "Program leadership",
        proficiency: "expert",
        evidence: ["Led launch operations"],
        relatedProjectIds: ["project-1"],
        relatedWorkHistoryIds: ["work-1"],
        bestRoleFit: ["Program Director"],
        doNotOverclaim: ["Deep platform engineering"],
      }],
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate,
  };
}

function skillsInventoryUpdateResult(): PublicProfileSkillsInventoryUpdateResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "updated",
    userId: "user-1",
    section: {
      skills: [{
        id: "skill-1",
        skillName: "AI workflow leadership",
        proficiency: "expert",
        evidence: ["Led launch operations", "Built workflow systems"],
        relatedProjectIds: ["project-1"],
        relatedWorkHistoryIds: ["work-1"],
        bestRoleFit: ["Program Director"],
        doNotOverclaim: ["Deep platform engineering"],
      }],
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate: {
      ...aggregate,
      skills: [{
        ...aggregate.skills[0],
        skillName: "AI workflow leadership",
        evidence: ["Led launch operations", "Built workflow systems"],
      }],
    },
  };
}

function qualityNarrativeReadResult(): PublicProfileQualityNarrativeReadResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "found",
    userId: "user-1",
    section: {
      section: "why_people_hire_me",
      fields: aggregate.qualityFields
        .filter((field) => field.section === "why_people_hire_me")
        .map((field) => ({
          id: field.id,
          fieldKey: field.fieldKey,
          value: field.value,
          quality: field.quality,
          ...(field.feedback ? { feedback: field.feedback } : {}),
        })),
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate,
  };
}

function qualityNarrativeUpdateResult(): PublicProfileQualityNarrativeUpdateResult {
  const aggregate = completeCandidateProfileAggregate(now);
  const fields = aggregate.qualityFields
    .filter((field) => field.section === "why_people_hire_me")
    .map((field) => ({
      id: field.id,
      fieldKey: field.fieldKey,
      value: field.fieldKey === "problemsPeopleBringMe" ? "Updated problems people bring me." : field.value,
      quality: field.quality,
      ...(field.feedback ? { feedback: field.feedback } : {}),
    }));

  return {
    status: "updated",
    userId: "user-1",
    section: {
      section: "why_people_hire_me",
      fields,
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate: {
      ...aggregate,
      qualityFields: aggregate.qualityFields.map((field) => field.section === "why_people_hire_me" && field.fieldKey === "problemsPeopleBringMe"
        ? {
            ...field,
            value: "Updated problems people bring me.",
          }
        : field),
    },
  };
}

function communicationStyleReadResult(): PublicProfileCommunicationStyleReadResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "found",
    userId: "user-1",
    section: {
      settings: aggregate.communicationStyle ? {
        id: aggregate.communicationStyle.id,
        preferredTone: aggregate.communicationStyle.preferredTone,
        formalityLevel: aggregate.communicationStyle.formalityLevel,
        humorLevel: aggregate.communicationStyle.humorLevel,
        messageLengthPreference: aggregate.communicationStyle.messageLengthPreference,
        greetingPreferences: aggregate.communicationStyle.greetingPreferences,
        signoffPreferences: aggregate.communicationStyle.signoffPreferences,
        phrasesToAvoid: aggregate.communicationStyle.phrasesToAvoid,
        phrasesThatSoundLikeMe: aggregate.communicationStyle.phrasesThatSoundLikeMe,
      } : undefined,
      fields: aggregate.qualityFields
        .filter((field) => field.section === "communication_style")
        .map((field) => ({
          id: field.id,
          fieldKey: field.fieldKey,
          value: field.value,
          quality: field.quality,
          ...(field.feedback ? { feedback: field.feedback } : {}),
        })),
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate,
  };
}

function communicationStyleUpdateResult(): PublicProfileCommunicationStyleUpdateResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "updated",
    userId: "user-1",
    section: {
      settings: aggregate.communicationStyle ? {
        id: aggregate.communicationStyle.id,
        preferredTone: ["Direct", "Warm"],
        formalityLevel: aggregate.communicationStyle.formalityLevel,
        humorLevel: aggregate.communicationStyle.humorLevel,
        messageLengthPreference: aggregate.communicationStyle.messageLengthPreference,
        greetingPreferences: aggregate.communicationStyle.greetingPreferences,
        signoffPreferences: aggregate.communicationStyle.signoffPreferences,
        phrasesToAvoid: ["rockstar", "ninja"],
        phrasesThatSoundLikeMe: aggregate.communicationStyle.phrasesThatSoundLikeMe,
      } : undefined,
      fields: aggregate.qualityFields
        .filter((field) => field.section === "communication_style")
        .map((field) => ({
          id: field.id,
          fieldKey: field.fieldKey,
          value: field.fieldKey === "voiceDescription" ? "Updated voice." : field.value,
          quality: field.quality,
          ...(field.feedback ? { feedback: field.feedback } : {}),
        })),
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate,
  };
}

function writingSamplesReadResult(): PublicProfileWritingSamplesReadResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "found",
    userId: "user-1",
    section: {
      writingSamples: aggregate.writingSamples.map((sample) => ({
        id: sample.id,
        sampleType: sample.sampleType,
        channel: sample.channel,
        text: sample.text,
        whyItWorksOrFails: sample.whyItWorksOrFails,
      })),
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate,
  };
}

function writingSamplesUpdateResult(): PublicProfileWritingSamplesUpdateResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "updated",
    userId: "user-1",
    section: {
      writingSamples: aggregate.writingSamples.map((sample) => ({
        id: sample.id,
        sampleType: sample.sampleType,
        channel: sample.channel,
        text: sample.sampleType === "like" ? "Updated short, direct sample." : sample.text,
        whyItWorksOrFails: sample.whyItWorksOrFails,
      })),
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate,
  };
}

function outreachRulesReadResult(): PublicProfileOutreachRulesReadResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "found",
    userId: "user-1",
    section: {
      settings: aggregate.outreachRules ? {
        id: aggregate.outreachRules.id,
        globalRules: aggregate.outreachRules.globalRules,
        followUpRules: aggregate.outreachRules.followUpRules,
        linkSelectionRules: aggregate.outreachRules.linkSelectionRules,
      } : undefined,
      fields: aggregate.qualityFields
        .filter((field) => field.section === "outreach_rules")
        .map((field) => ({
          id: field.id,
          fieldKey: field.fieldKey,
          value: field.value,
          quality: field.quality,
          ...(field.feedback ? { feedback: field.feedback } : {}),
        })),
      roleTrackSpecificRules: [],
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate,
  };
}

function outreachRulesUpdateResult(): PublicProfileOutreachRulesUpdateResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "updated",
    userId: "user-1",
    section: {
      settings: aggregate.outreachRules ? {
        id: aggregate.outreachRules.id,
        globalRules: ["Be specific.", "Lead with proof."],
        followUpRules: aggregate.outreachRules.followUpRules,
        linkSelectionRules: aggregate.outreachRules.linkSelectionRules,
      } : undefined,
      fields: aggregate.qualityFields
        .filter((field) => field.section === "outreach_rules")
        .map((field) => ({
          id: field.id,
          fieldKey: field.fieldKey,
          value: field.fieldKey === "hiringManagerApproach" ? "Updated approach." : field.value,
          quality: field.quality,
          ...(field.feedback ? { feedback: field.feedback } : {}),
        })),
      roleTrackSpecificRules: [{
        id: "track-rule-1",
        roleTrackId: "track-1",
        rules: ["Lead with systems proof"],
        preferredProofTypes: ["workflow"],
        avoidProofTypes: ["deep engineering"],
      }],
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate,
  };
}

function leadershipProfileReadResult(): PublicProfileLeadershipProfileReadResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "found",
    userId: "user-1",
    section: {
      visible: aggregate.leadershipProfile?.visible ?? false,
      fields: [],
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate,
  };
}

function leadershipProfileUpdateResult(): PublicProfileLeadershipProfileUpdateResult {
  const aggregate = completeCandidateProfileAggregate(now);
  return {
    status: "updated",
    userId: "user-1",
    section: {
      visible: true,
      fields: [{
        id: "leadership-style",
        fieldKey: "leadershipStyle",
        value: "Calm operator in messy systems.",
        quality: "complete",
      }],
    },
    profileQuality: {
      id: "profile-quality-profile-1",
      profileId: "profile-1",
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      completeFields: ["identity.fullName"],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
    aggregate,
  };
}

async function main() {
  const configError = await handlePublicProfileRegenerationRequest(request, {
    getSession: async () => ({
      status: "config_error",
      missing: ["NEXT_PUBLIC_SUPABASE_URL"],
    }),
  });
  assert.equal(configError.status, 503);
  assert.equal((await body(configError)).error, "Public auth is not configured.");

  const unauthorized = await handlePublicProfileRegenerationRequest(request, {
    getSession: async () => ({
      status: "unauthenticated",
      reason: "Missing bearer token.",
    }),
  });
  assert.equal(unauthorized.status, 401);
  assert.equal((await body(unauthorized)).detail, "Missing bearer token.");

  const repoConfigError = await handlePublicProfileRegenerationRequest(request, {
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    env: {} as NodeJS.ProcessEnv,
  });
  assert.equal(repoConfigError.status, 503);
  assert.equal((await body(repoConfigError)).error, "Public profile repository is not configured.");

  const missing = await handlePublicProfileRegenerationRequest(request, {
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    regenerateProfile: async () => ({
      status: "not_found",
      userId: "user-1",
    }),
  });
  assert.equal(missing.status, 404);
  assert.equal((await body(missing)).status, "not_found");

  const incomplete = await handlePublicProfileRegenerationRequest(request, {
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    regenerateProfile: async () => incompleteResult(),
  });
  assert.equal(incomplete.status, 409);
  assert.deepEqual(await body(incomplete), {
    status: "incomplete",
    profileId: "profile-1",
    profileStatus: "incomplete",
    incompleteReasons: ["At least one Role Track is required."],
    weakFields: ["roleTracks"],
    weakResponseCount: 1,
    lastCheckedAt: now,
  });

  let calledWithUserId = "";
  let calledWithGeneratedAt = "";
  const regenerated = await handlePublicProfileRegenerationRequest(request, {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    regenerateProfile: async (_request, userId, options) => {
      calledWithUserId = userId;
      calledWithGeneratedAt = options.generatedAt;
      return regeneratedResult();
    },
  });
  assert.equal(regenerated.status, 200);
  assert.equal(calledWithUserId, "user-1");
  assert.equal(calledWithGeneratedAt, now);
  assert.deepEqual(await body(regenerated), {
    status: "regenerated",
    profileId: "profile-1",
    profileStatus: "complete",
    version: 3,
    generatedAt: now,
  });
  assert.equal(regenerated.headers.get("cache-control"), "no-store");

  let bootstrapUserId = "";
  let bootstrapEmail = "";
  const bootstrap = await handlePublicProfileBootstrapRequest(new Request("https://app.example/api/public-profile/bootstrap", {
    method: "POST",
  }), {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
      email: "avery@example.com",
    }),
    repositoryRequest,
    ensureProfile: async (_request, userId, options) => {
      bootstrapUserId = userId;
      bootstrapEmail = options.email ?? "";
      return completeCandidateProfileAggregate(now);
    },
  });
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrapUserId, "user-1");
  assert.equal(bootstrapEmail, "avery@example.com");
  assert.deepEqual(await body(bootstrap), {
    status: "ready",
    profileId: "profile-1",
    profileStatus: "complete",
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  let readUserId = "";
  let readCheckedAt = "";
  const identityGet = await handleIdentitySearchSectionGetRequest(identityRequest, {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    readIdentitySearch: async (_request, userId, checkedAt) => {
      readUserId = userId;
      readCheckedAt = checkedAt;
      return identityReadResult();
    },
  });
  assert.equal(identityGet.status, 200);
  assert.equal(readUserId, "user-1");
  assert.equal(readCheckedAt, now);
  const expectedIdentityRead = identityReadResult();
  if (expectedIdentityRead.status !== "found") {
    throw new Error("Expected found identity fixture.");
  }
  assert.deepEqual(await body(identityGet), {
    status: "found",
    profileId: "profile-1",
    profileStatus: "incomplete",
    section: expectedIdentityRead.section,
    profileQuality: {
      status: "incomplete",
      incompleteReasons: ["At least one Role Track is required."],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const identityGetMissing = await handleIdentitySearchSectionGetRequest(identityRequest, {
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    readIdentitySearch: async () => ({
      status: "not_found",
      userId: "user-1",
    }),
  });
  assert.equal(identityGetMissing.status, 404);
  assert.equal((await body(identityGetMissing)).status, "not_found");

  const identityPatchValidation = await handleIdentitySearchSectionPatchRequest(new Request(identityRequest, {
    method: "PATCH",
    body: JSON.stringify({ remotePreference: "mars" }),
  }), {
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateIdentitySearch: async () => ({
      status: "validation_error",
      issues: [{
        field: "remotePreference",
        message: "Invalid remote preference.",
      }],
    }),
  });
  assert.equal(identityPatchValidation.status, 400);
  assert.equal((await body(identityPatchValidation)).status, "validation_error");

  const identityPatchMissing = await handleIdentitySearchSectionPatchRequest(new Request(identityRequest, {
    method: "PATCH",
    body: JSON.stringify({ location: "Boulder, CO" }),
  }), {
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateIdentitySearch: async () => ({
      status: "not_found",
      userId: "user-1",
    }),
  });
  assert.equal(identityPatchMissing.status, 404);
  assert.equal((await body(identityPatchMissing)).status, "not_found");

  let patchUserId = "";
  let patchInput: unknown;
  let patchUpdatedAt = "";
  const identityPatch = await handleIdentitySearchSectionPatchRequest(new Request(identityRequest, {
    method: "PATCH",
    body: JSON.stringify({ location: "Boulder, CO" }),
  }), {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateIdentitySearch: async (_request, userId, input, options) => {
      patchUserId = userId;
      patchInput = input;
      patchUpdatedAt = options.updatedAt;
      return identityUpdateResult();
    },
  });
  assert.equal(identityPatch.status, 200);
  assert.equal(patchUserId, "user-1");
  assert.deepEqual(patchInput, { location: "Boulder, CO" });
  assert.equal(patchUpdatedAt, now);
  const expectedIdentityUpdate = identityUpdateResult();
  if (expectedIdentityUpdate.status !== "updated") {
    throw new Error("Expected updated identity fixture.");
  }
  assert.deepEqual(await body(identityPatch), {
    status: "updated",
    profileId: "profile-1",
    profileStatus: "incomplete",
    section: expectedIdentityUpdate.section,
    profileQuality: {
      status: "incomplete",
      incompleteReasons: ["At least one Role Track is required."],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const roleTracksRequest = new Request("https://app.example/api/public-profile/role-tracks", {
    method: "GET",
  });
  const roleTracksGet = await handleRoleTracksSectionGetRequest(roleTracksRequest, {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    readRoleTracks: async () => roleTracksReadResult(),
  });
  assert.equal(roleTracksGet.status, 200);
  const expectedRoleTracksRead = roleTracksReadResult();
  if (expectedRoleTracksRead.status !== "found") {
    throw new Error("Expected found Role Tracks fixture.");
  }
  assert.deepEqual(await body(roleTracksGet), {
    status: "found",
    profileId: "profile-1",
    profileStatus: "complete",
    section: expectedRoleTracksRead.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const roleTracksPatchValidation = await handleRoleTracksSectionPatchRequest(new Request(roleTracksRequest, {
    method: "PATCH",
    body: JSON.stringify({ roleTracks: [{ id: "" }] }),
  }), {
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateRoleTracks: async () => ({
      status: "validation_error",
      issues: [{
        field: "roleTracks.0.id",
        message: "id is required.",
      }],
    }),
  });
  assert.equal(roleTracksPatchValidation.status, 400);
  assert.equal((await body(roleTracksPatchValidation)).status, "validation_error");

  let rolePatchInput: unknown;
  const roleTracksUpdateFixture = roleTracksUpdateResult();
  if (roleTracksUpdateFixture.status !== "updated") {
    throw new Error("Expected updated Role Tracks fixture.");
  }
  const roleTracksPatch = await handleRoleTracksSectionPatchRequest(new Request(roleTracksRequest, {
    method: "PATCH",
    body: JSON.stringify({ roleTracks: roleTracksUpdateFixture.section.roleTracks }),
  }), {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateRoleTracks: async (_request, _userId, input) => {
      rolePatchInput = input;
      return roleTracksUpdateResult();
    },
  });
  assert.equal(roleTracksPatch.status, 200);
  assert.deepEqual(rolePatchInput, { roleTracks: roleTracksUpdateFixture.section.roleTracks });
  assert.deepEqual(await body(roleTracksPatch), {
    status: "updated",
    profileId: "profile-1",
    profileStatus: "complete",
    section: roleTracksUpdateFixture.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const resumeUploadsRequest = new Request("https://app.example/api/public-profile/resumes", {
    method: "GET",
  });
  const resumesGet = await handleResumeUploadsSectionGetRequest(resumeUploadsRequest, {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    readResumeUploads: async () => resumeUploadsReadResult(),
  });
  assert.equal(resumesGet.status, 200);
  const expectedResumesRead = resumeUploadsReadResult();
  if (expectedResumesRead.status !== "found") {
    throw new Error("Expected found Resume Uploads fixture.");
  }
  assert.deepEqual(await body(resumesGet), {
    status: "found",
    profileId: "profile-1",
    profileStatus: "complete",
    section: expectedResumesRead.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const resumesPatchValidation = await handleResumeUploadsSectionPatchRequest(new Request(resumeUploadsRequest, {
    method: "PATCH",
    body: JSON.stringify({ resumes: [{ id: "" }] }),
  }), {
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateResumeUploads: async () => ({
      status: "validation_error",
      issues: [{
        field: "resumes.0.id",
        message: "id is required.",
      }],
    }),
  });
  assert.equal(resumesPatchValidation.status, 400);
  assert.equal((await body(resumesPatchValidation)).status, "validation_error");

  let resumePatchInput: unknown;
  const resumeUploadsUpdateFixture = resumeUploadsUpdateResult();
  if (resumeUploadsUpdateFixture.status !== "updated") {
    throw new Error("Expected updated Resume Uploads fixture.");
  }
  const resumesPatch = await handleResumeUploadsSectionPatchRequest(new Request(resumeUploadsRequest, {
    method: "PATCH",
    body: JSON.stringify({ resumes: resumeUploadsUpdateFixture.section.resumes }),
  }), {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateResumeUploads: async (_request, _userId, input) => {
      resumePatchInput = input;
      return resumeUploadsUpdateFixture;
    },
  });
  assert.equal(resumesPatch.status, 200);
  assert.deepEqual(resumePatchInput, { resumes: resumeUploadsUpdateFixture.section.resumes });
  assert.deepEqual(await body(resumesPatch), {
    status: "updated",
    profileId: "profile-1",
    profileStatus: "complete",
    section: resumeUploadsUpdateFixture.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const workHistoryRequest = new Request("https://app.example/api/public-profile/work-history", {
    method: "GET",
  });
  const workHistoryGet = await handleWorkHistorySectionGetRequest(workHistoryRequest, {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    readWorkHistory: async () => workHistoryReadResult(),
  });
  assert.equal(workHistoryGet.status, 200);
  const expectedWorkHistoryRead = workHistoryReadResult();
  if (expectedWorkHistoryRead.status !== "found") {
    throw new Error("Expected found Work History fixture.");
  }
  assert.deepEqual(await body(workHistoryGet), {
    status: "found",
    profileId: "profile-1",
    profileStatus: "complete",
    section: expectedWorkHistoryRead.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const workHistoryPatchValidation = await handleWorkHistorySectionPatchRequest(new Request(workHistoryRequest, {
    method: "PATCH",
    body: JSON.stringify({ workHistory: [{ id: "" }] }),
  }), {
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateWorkHistory: async () => ({
      status: "validation_error",
      issues: [{
        field: "workHistory.0.id",
        message: "id is required.",
      }],
    }),
  });
  assert.equal(workHistoryPatchValidation.status, 400);
  assert.equal((await body(workHistoryPatchValidation)).status, "validation_error");

  let workHistoryPatchInput: unknown;
  const workHistoryUpdateFixture = workHistoryUpdateResult();
  if (workHistoryUpdateFixture.status !== "updated") {
    throw new Error("Expected updated Work History fixture.");
  }
  const workHistoryPatch = await handleWorkHistorySectionPatchRequest(new Request(workHistoryRequest, {
    method: "PATCH",
    body: JSON.stringify({ workHistory: workHistoryUpdateFixture.section.workHistory }),
  }), {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateWorkHistory: async (_request, _userId, input) => {
      workHistoryPatchInput = input;
      return workHistoryUpdateFixture;
    },
  });
  assert.equal(workHistoryPatch.status, 200);
  assert.deepEqual(workHistoryPatchInput, { workHistory: workHistoryUpdateFixture.section.workHistory });
  assert.deepEqual(await body(workHistoryPatch), {
    status: "updated",
    profileId: "profile-1",
    profileStatus: "complete",
    section: workHistoryUpdateFixture.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const proofLibraryRequest = new Request("https://app.example/api/public-profile/proof-library", {
    method: "GET",
  });
  const proofLibraryGet = await handleProofLibrarySectionGetRequest(proofLibraryRequest, {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    readProofLibrary: async () => proofLibraryReadResult(),
  });
  assert.equal(proofLibraryGet.status, 200);
  const expectedProofLibraryRead = proofLibraryReadResult();
  if (expectedProofLibraryRead.status !== "found") {
    throw new Error("Expected found Proof Library fixture.");
  }
  assert.deepEqual(await body(proofLibraryGet), {
    status: "found",
    profileId: "profile-1",
    profileStatus: "complete",
    section: expectedProofLibraryRead.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const proofLibraryPatchValidation = await handleProofLibrarySectionPatchRequest(new Request(proofLibraryRequest, {
    method: "PATCH",
    body: JSON.stringify({ projects: [{ id: "" }] }),
  }), {
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateProofLibrary: async () => ({
      status: "validation_error",
      issues: [{
        field: "projects.0.id",
        message: "id is required.",
      }],
    }),
  });
  assert.equal(proofLibraryPatchValidation.status, 400);
  assert.equal((await body(proofLibraryPatchValidation)).status, "validation_error");

  let proofLibraryPatchInput: unknown;
  const proofLibraryUpdateFixture = proofLibraryUpdateResult();
  if (proofLibraryUpdateFixture.status !== "updated") {
    throw new Error("Expected updated Proof Library fixture.");
  }
  const proofLibraryPatch = await handleProofLibrarySectionPatchRequest(new Request(proofLibraryRequest, {
    method: "PATCH",
    body: JSON.stringify({ projects: proofLibraryUpdateFixture.section.projects }),
  }), {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateProofLibrary: async (_request, _userId, input) => {
      proofLibraryPatchInput = input;
      return proofLibraryUpdateFixture;
    },
  });
  assert.equal(proofLibraryPatch.status, 200);
  assert.deepEqual(proofLibraryPatchInput, { projects: proofLibraryUpdateFixture.section.projects });
  assert.deepEqual(await body(proofLibraryPatch), {
    status: "updated",
    profileId: "profile-1",
    profileStatus: "complete",
    section: proofLibraryUpdateFixture.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const skillsRequest = new Request("https://app.example/api/public-profile/skills", {
    method: "GET",
  });
  const skillsGet = await handleSkillsInventorySectionGetRequest(skillsRequest, {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    readSkillsInventory: async () => skillsInventoryReadResult(),
  });
  assert.equal(skillsGet.status, 200);
  const expectedSkillsRead = skillsInventoryReadResult();
  if (expectedSkillsRead.status !== "found") {
    throw new Error("Expected found Skills Inventory fixture.");
  }
  assert.deepEqual(await body(skillsGet), {
    status: "found",
    profileId: "profile-1",
    profileStatus: "complete",
    section: expectedSkillsRead.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const skillsPatchValidation = await handleSkillsInventorySectionPatchRequest(new Request(skillsRequest, {
    method: "PATCH",
    body: JSON.stringify({ skills: [{ id: "" }] }),
  }), {
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateSkillsInventory: async () => ({
      status: "validation_error",
      issues: [{
        field: "skills.0.id",
        message: "id is required.",
      }],
    }),
  });
  assert.equal(skillsPatchValidation.status, 400);
  assert.equal((await body(skillsPatchValidation)).status, "validation_error");

  let skillsPatchInput: unknown;
  const skillsUpdateFixture = skillsInventoryUpdateResult();
  if (skillsUpdateFixture.status !== "updated") {
    throw new Error("Expected updated Skills Inventory fixture.");
  }
  const skillsPatch = await handleSkillsInventorySectionPatchRequest(new Request(skillsRequest, {
    method: "PATCH",
    body: JSON.stringify({ skills: skillsUpdateFixture.section.skills }),
  }), {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateSkillsInventory: async (_request, _userId, input) => {
      skillsPatchInput = input;
      return skillsUpdateFixture;
    },
  });
  assert.equal(skillsPatch.status, 200);
  assert.deepEqual(skillsPatchInput, { skills: skillsUpdateFixture.section.skills });
  assert.deepEqual(await body(skillsPatch), {
    status: "updated",
    profileId: "profile-1",
    profileStatus: "complete",
    section: skillsUpdateFixture.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const narrativeRequest = new Request("https://app.example/api/public-profile/why-people-hire-me", {
    method: "GET",
  });
  let narrativeReadSection = "";
  const narrativeGet = await handleQualityNarrativeSectionGetRequest(narrativeRequest, "why_people_hire_me", {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    readQualityNarrative: async (_request, _userId, section) => {
      narrativeReadSection = section;
      return qualityNarrativeReadResult();
    },
  });
  assert.equal(narrativeGet.status, 200);
  assert.equal(narrativeReadSection, "why_people_hire_me");
  const expectedNarrativeRead = qualityNarrativeReadResult();
  if (expectedNarrativeRead.status !== "found") {
    throw new Error("Expected found quality narrative fixture.");
  }
  assert.deepEqual(await body(narrativeGet), {
    status: "found",
    profileId: "profile-1",
    profileStatus: "complete",
    section: expectedNarrativeRead.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const narrativePatchValidation = await handleQualityNarrativeSectionPatchRequest(new Request(narrativeRequest, {
    method: "PATCH",
    body: JSON.stringify({ fields: [{ id: "" }] }),
  }), "why_people_hire_me", {
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateQualityNarrative: async () => ({
      status: "validation_error",
      issues: [{
        field: "fields.0.id",
        message: "id is required.",
      }],
    }),
  });
  assert.equal(narrativePatchValidation.status, 400);
  assert.equal((await body(narrativePatchValidation)).status, "validation_error");

  let narrativePatchInput: unknown;
  let narrativePatchSection = "";
  const narrativeUpdateFixture = qualityNarrativeUpdateResult();
  if (narrativeUpdateFixture.status !== "updated") {
    throw new Error("Expected updated quality narrative fixture.");
  }
  const narrativePatch = await handleQualityNarrativeSectionPatchRequest(new Request(narrativeRequest, {
    method: "PATCH",
    body: JSON.stringify({ fields: narrativeUpdateFixture.section.fields }),
  }), "why_people_hire_me", {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateQualityNarrative: async (_request, _userId, section, input) => {
      narrativePatchSection = section;
      narrativePatchInput = input;
      return narrativeUpdateFixture;
    },
  });
  assert.equal(narrativePatch.status, 200);
  assert.equal(narrativePatchSection, "why_people_hire_me");
  assert.deepEqual(narrativePatchInput, { fields: narrativeUpdateFixture.section.fields });
  assert.deepEqual(await body(narrativePatch), {
    status: "updated",
    profileId: "profile-1",
    profileStatus: "complete",
    section: narrativeUpdateFixture.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const aiMisreadingsRequest = new Request("https://app.example/api/public-profile/ai-misreadings", {
    method: "GET",
  });
  let aiReadSection = "";
  const aiGet = await handleQualityNarrativeSectionGetRequest(aiMisreadingsRequest, "ai_misreadings", {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    readQualityNarrative: async (_request, _userId, section) => {
      aiReadSection = section;
      return {
        ...qualityNarrativeReadResult(),
        section: {
          section: "ai_misreadings",
          fields: completeCandidateProfileAggregate(now).qualityFields
            .filter((field) => field.section === "ai_misreadings")
            .map((field) => ({
              id: field.id,
              fieldKey: field.fieldKey,
              value: field.value,
              quality: field.quality,
            })),
        },
      };
    },
  });
  assert.equal(aiGet.status, 200);
  assert.equal(aiReadSection, "ai_misreadings");
  assert.equal(((await body(aiGet)).section as { section: string }).section, "ai_misreadings");

  const communicationRequest = new Request("https://app.example/api/public-profile/communication-style", {
    method: "GET",
  });
  const communicationGet = await handleCommunicationStyleSectionGetRequest(communicationRequest, {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    readCommunicationStyle: async () => communicationStyleReadResult(),
  });
  assert.equal(communicationGet.status, 200);
  const expectedCommunicationRead = communicationStyleReadResult();
  if (expectedCommunicationRead.status !== "found") {
    throw new Error("Expected found Communication Style fixture.");
  }
  assert.deepEqual(await body(communicationGet), {
    status: "found",
    profileId: "profile-1",
    profileStatus: "complete",
    section: expectedCommunicationRead.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const communicationPatchValidation = await handleCommunicationStyleSectionPatchRequest(new Request(communicationRequest, {
    method: "PATCH",
    body: JSON.stringify({ settings: { formalityLevel: "cosmic" }, fields: [] }),
  }), {
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateCommunicationStyle: async () => ({
      status: "validation_error",
      issues: [{
        field: "settings.formalityLevel",
        message: "Invalid formality.",
      }],
    }),
  });
  assert.equal(communicationPatchValidation.status, 400);
  assert.equal((await body(communicationPatchValidation)).status, "validation_error");

  let communicationPatchInput: unknown;
  const communicationUpdateFixture = communicationStyleUpdateResult();
  if (communicationUpdateFixture.status !== "updated") {
    throw new Error("Expected updated Communication Style fixture.");
  }
  const communicationPatch = await handleCommunicationStyleSectionPatchRequest(new Request(communicationRequest, {
    method: "PATCH",
    body: JSON.stringify(communicationUpdateFixture.section),
  }), {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateCommunicationStyle: async (_request, _userId, input) => {
      communicationPatchInput = input;
      return communicationUpdateFixture;
    },
  });
  assert.equal(communicationPatch.status, 200);
  assert.deepEqual(communicationPatchInput, communicationUpdateFixture.section);
  assert.deepEqual(await body(communicationPatch), {
    status: "updated",
    profileId: "profile-1",
    profileStatus: "complete",
    section: communicationUpdateFixture.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const writingSamplesRequest = new Request("https://app.example/api/public-profile/writing-samples", {
    method: "GET",
  });
  const writingSamplesGet = await handleWritingSamplesSectionGetRequest(writingSamplesRequest, {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    readWritingSamples: async () => writingSamplesReadResult(),
  });
  assert.equal(writingSamplesGet.status, 200);
  const expectedWritingSamplesRead = writingSamplesReadResult();
  if (expectedWritingSamplesRead.status !== "found") {
    throw new Error("Expected found Writing Samples fixture.");
  }
  assert.deepEqual(await body(writingSamplesGet), {
    status: "found",
    profileId: "profile-1",
    profileStatus: "complete",
    section: expectedWritingSamplesRead.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const writingSamplesPatchValidation = await handleWritingSamplesSectionPatchRequest(new Request(writingSamplesRequest, {
    method: "PATCH",
    body: JSON.stringify({ writingSamples: [{ id: "" }] }),
  }), {
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateWritingSamples: async () => ({
      status: "validation_error",
      issues: [{
        field: "writingSamples.0.id",
        message: "id is required.",
      }],
    }),
  });
  assert.equal(writingSamplesPatchValidation.status, 400);
  assert.equal((await body(writingSamplesPatchValidation)).status, "validation_error");

  let writingSamplesPatchInput: unknown;
  const writingSamplesUpdateFixture = writingSamplesUpdateResult();
  if (writingSamplesUpdateFixture.status !== "updated") {
    throw new Error("Expected updated Writing Samples fixture.");
  }
  const writingSamplesPatch = await handleWritingSamplesSectionPatchRequest(new Request(writingSamplesRequest, {
    method: "PATCH",
    body: JSON.stringify({ writingSamples: writingSamplesUpdateFixture.section.writingSamples }),
  }), {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateWritingSamples: async (_request, _userId, input) => {
      writingSamplesPatchInput = input;
      return writingSamplesUpdateFixture;
    },
  });
  assert.equal(writingSamplesPatch.status, 200);
  assert.deepEqual(writingSamplesPatchInput, { writingSamples: writingSamplesUpdateFixture.section.writingSamples });
  assert.deepEqual(await body(writingSamplesPatch), {
    status: "updated",
    profileId: "profile-1",
    profileStatus: "complete",
    section: writingSamplesUpdateFixture.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const outreachRulesRequest = new Request("https://app.example/api/public-profile/outreach-rules", {
    method: "GET",
  });
  const outreachRulesGet = await handleOutreachRulesSectionGetRequest(outreachRulesRequest, {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    readOutreachRules: async () => outreachRulesReadResult(),
  });
  assert.equal(outreachRulesGet.status, 200);
  const expectedOutreachRead = outreachRulesReadResult();
  if (expectedOutreachRead.status !== "found") {
    throw new Error("Expected found Outreach Rules fixture.");
  }
  assert.deepEqual(await body(outreachRulesGet), {
    status: "found",
    profileId: "profile-1",
    profileStatus: "complete",
    section: expectedOutreachRead.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const outreachRulesPatchValidation = await handleOutreachRulesSectionPatchRequest(new Request(outreachRulesRequest, {
    method: "PATCH",
    body: JSON.stringify({ settings: {}, fields: [], roleTrackSpecificRules: [] }),
  }), {
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateOutreachRules: async () => ({
      status: "validation_error",
      issues: [{
        field: "settings.globalRules",
        message: "globalRules is required.",
      }],
    }),
  });
  assert.equal(outreachRulesPatchValidation.status, 400);
  assert.equal((await body(outreachRulesPatchValidation)).status, "validation_error");

  let outreachRulesPatchInput: unknown;
  const outreachUpdateFixture = outreachRulesUpdateResult();
  if (outreachUpdateFixture.status !== "updated") {
    throw new Error("Expected updated Outreach Rules fixture.");
  }
  const outreachRulesPatch = await handleOutreachRulesSectionPatchRequest(new Request(outreachRulesRequest, {
    method: "PATCH",
    body: JSON.stringify(outreachUpdateFixture.section),
  }), {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateOutreachRules: async (_request, _userId, input) => {
      outreachRulesPatchInput = input;
      return outreachUpdateFixture;
    },
  });
  assert.equal(outreachRulesPatch.status, 200);
  assert.deepEqual(outreachRulesPatchInput, outreachUpdateFixture.section);
  assert.deepEqual(await body(outreachRulesPatch), {
    status: "updated",
    profileId: "profile-1",
    profileStatus: "complete",
    section: outreachUpdateFixture.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const leadershipProfileRequest = new Request("https://app.example/api/public-profile/leadership-profile", {
    method: "GET",
  });
  const leadershipGet = await handleLeadershipProfileSectionGetRequest(leadershipProfileRequest, {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    readLeadershipProfile: async () => leadershipProfileReadResult(),
  });
  assert.equal(leadershipGet.status, 200);
  const expectedLeadershipRead = leadershipProfileReadResult();
  if (expectedLeadershipRead.status !== "found") {
    throw new Error("Expected found Leadership Profile fixture.");
  }
  assert.deepEqual(await body(leadershipGet), {
    status: "found",
    profileId: "profile-1",
    profileStatus: "complete",
    section: expectedLeadershipRead.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  const leadershipPatchValidation = await handleLeadershipProfileSectionPatchRequest(new Request(leadershipProfileRequest, {
    method: "PATCH",
    body: JSON.stringify({ visible: "yes", fields: [] }),
  }), {
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateLeadershipProfile: async () => ({
      status: "validation_error",
      issues: [{
        field: "visible",
        message: "visible must be a boolean.",
      }],
    }),
  });
  assert.equal(leadershipPatchValidation.status, 400);
  assert.equal((await body(leadershipPatchValidation)).status, "validation_error");

  let leadershipPatchInput: unknown;
  const leadershipUpdateFixture = leadershipProfileUpdateResult();
  if (leadershipUpdateFixture.status !== "updated") {
    throw new Error("Expected updated Leadership Profile fixture.");
  }
  const leadershipPatch = await handleLeadershipProfileSectionPatchRequest(new Request(leadershipProfileRequest, {
    method: "PATCH",
    body: JSON.stringify(leadershipUpdateFixture.section),
  }), {
    now: () => now,
    getSession: async () => ({
      status: "authenticated",
      userId: "user-1",
    }),
    repositoryRequest,
    updateLeadershipProfile: async (_request, _userId, input) => {
      leadershipPatchInput = input;
      return leadershipUpdateFixture;
    },
  });
  assert.equal(leadershipPatch.status, 200);
  assert.deepEqual(leadershipPatchInput, leadershipUpdateFixture.section);
  assert.deepEqual(await body(leadershipPatch), {
    status: "updated",
    profileId: "profile-1",
    profileStatus: "complete",
    section: leadershipUpdateFixture.section,
    profileQuality: {
      status: "complete",
      incompleteReasons: [],
      weakFields: [],
      weakResponseCount: 0,
      lastCheckedAt: now,
    },
  });

  console.log("public profile API: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

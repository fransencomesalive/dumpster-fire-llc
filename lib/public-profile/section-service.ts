import {
  applyIdentitySearchSectionPatch,
  applyFitSignalsSectionPatch,
  applyVoicePersonalitySectionPatch,
  applyLeadershipProfileSectionPatch,
  applyOutreachRulesSectionPatch,
  applyWorkExamplesSectionPatch,
  applyQualityNarrativeSectionPatch,
  applyResumeUploadsSectionPatch,
  applyRoleTracksSectionPatch,
  applySkillsInventorySectionPatch,
  applyWritingSamplesSectionPatch,
  identitySearchSection,
  fitSignalsSection,
  voicePersonalitySection,
  leadershipProfileSection,
  outreachRulesSection,
  parseIdentitySearchSectionPatch,
  parseFitSignalsSectionPatch,
  parseVoicePersonalitySectionPatch,
  parseLeadershipProfileSectionPatch,
  parseOutreachRulesSectionPatch,
  parseWorkExamplesSectionPatch,
  parseQualityNarrativeSectionPatch,
  parseResumeUploadsSectionPatch,
  parseRoleTracksSectionPatch,
  parseSkillsInventorySectionPatch,
  parseWritingSamplesSectionPatch,
  workExamplesSection,
  qualityNarrativeSection,
  resumeUploadsSection,
  roleTracksSection,
  skillsInventorySection,
  writingSamplesSection,
  type ApplyIdentitySearchSectionResult,
  type ApplyFitSignalsSectionResult,
  type ApplyVoicePersonalitySectionResult,
  type ApplyLeadershipProfileSectionResult,
  type ApplyOutreachRulesSectionResult,
  type ApplyWorkExamplesSectionResult,
  type ApplyQualityNarrativeSectionResult,
  type ApplyResumeUploadsSectionResult,
  type ApplyRoleTracksSectionResult,
  type ApplySkillsInventorySectionResult,
  type ApplyWritingSamplesSectionResult,
  type IdentitySearchSection,
  type FitSignalsSection,
  type VoicePersonalitySection,
  type LeadershipProfileSection,
  type OutreachRulesSection,
  type WorkExamplesSection,
  type QualityNarrativeSection,
  type ResumeUploadsSection,
  type RoleTracksSection,
  type SectionValidationIssue,
  type SkillsInventorySection,
  type WritingSamplesSection,
  validateResumeUploadsSectionPatch,
  validateOutreachRulesSectionPatch,
  validateSkillsInventorySectionPatch,
} from "./sections";
import { evaluateCandidateProfileQuality } from "./profile-quality";
import {
  loadCandidateProfileAggregate,
  persistIdentitySearchSection,
  persistFitSignalsSection,
  persistVoicePersonalitySection,
  persistLeadershipProfileSection,
  persistOutreachRulesSection,
  persistWorkExamplesSection,
  persistQualityNarrativeSection,
  persistResumeUploadsSection,
  persistRoleTracksSection,
  persistSkillsInventorySection,
  persistWritingSamplesSection,
  type PublicProfileRepositoryRequest,
} from "./repository";
import type { CandidateProfileAggregate, ProfileQuality, QualitySection } from "./types";

export type PublicProfileSectionServiceDependencies = {
  loadAggregate: (userId: string) => Promise<CandidateProfileAggregate | undefined>;
  persistIdentitySearchSection: (result: ApplyIdentitySearchSectionResult) => Promise<void>;
  persistFitSignalsSection?: (result: ApplyFitSignalsSectionResult) => Promise<void>;
  persistVoicePersonalitySection?: (result: ApplyVoicePersonalitySectionResult) => Promise<void>;
  persistLeadershipProfileSection?: (result: ApplyLeadershipProfileSectionResult) => Promise<void>;
  persistOutreachRulesSection?: (result: ApplyOutreachRulesSectionResult) => Promise<void>;
  persistWorkExamplesSection?: (result: ApplyWorkExamplesSectionResult) => Promise<void>;
  persistQualityNarrativeSection?: (result: ApplyQualityNarrativeSectionResult) => Promise<void>;
  persistResumeUploadsSection?: (result: ApplyResumeUploadsSectionResult) => Promise<void>;
  persistRoleTracksSection?: (result: ApplyRoleTracksSectionResult) => Promise<void>;
  persistSkillsInventorySection?: (result: ApplySkillsInventorySectionResult) => Promise<void>;
  persistWritingSamplesSection?: (result: ApplyWritingSamplesSectionResult) => Promise<void>;
};

export type PublicProfileIdentitySearchUpdateResult =
  | {
      status: "validation_error";
      issues: SectionValidationIssue[];
    }
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "updated";
      userId: string;
      section: IdentitySearchSection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileIdentitySearchReadResult =
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "found";
      userId: string;
      section: IdentitySearchSection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileRoleTracksUpdateResult =
  | {
      status: "validation_error";
      issues: SectionValidationIssue[];
    }
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "updated";
      userId: string;
      section: RoleTracksSection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileRoleTracksReadResult =
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "found";
      userId: string;
      section: RoleTracksSection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileResumeUploadsUpdateResult =
  | {
      status: "validation_error";
      issues: SectionValidationIssue[];
    }
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "updated";
      userId: string;
      section: ResumeUploadsSection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileResumeUploadsReadResult =
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "found";
      userId: string;
      section: ResumeUploadsSection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileFitSignalsUpdateResult =
  | {
      status: "validation_error";
      issues: SectionValidationIssue[];
    }
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "updated";
      userId: string;
      section: FitSignalsSection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileFitSignalsReadResult =
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "found";
      userId: string;
      section: FitSignalsSection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileWorkExamplesUpdateResult =
  | {
      status: "validation_error";
      issues: SectionValidationIssue[];
    }
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "updated";
      userId: string;
      section: WorkExamplesSection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileWorkExamplesReadResult =
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "found";
      userId: string;
      section: WorkExamplesSection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileSkillsInventoryUpdateResult =
  | {
      status: "validation_error";
      issues: SectionValidationIssue[];
    }
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "updated";
      userId: string;
      section: SkillsInventorySection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileSkillsInventoryReadResult =
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "found";
      userId: string;
      section: SkillsInventorySection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileQualityNarrativeUpdateResult =
  | {
      status: "validation_error";
      issues: SectionValidationIssue[];
    }
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "updated";
      userId: string;
      section: QualityNarrativeSection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileQualityNarrativeReadResult =
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "found";
      userId: string;
      section: QualityNarrativeSection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileVoicePersonalityUpdateResult =
  | {
      status: "validation_error";
      issues: SectionValidationIssue[];
    }
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "updated";
      userId: string;
      section: VoicePersonalitySection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileVoicePersonalityReadResult =
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "found";
      userId: string;
      section: VoicePersonalitySection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileWritingSamplesUpdateResult =
  | {
      status: "validation_error";
      issues: SectionValidationIssue[];
    }
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "updated";
      userId: string;
      section: WritingSamplesSection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileWritingSamplesReadResult =
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "found";
      userId: string;
      section: WritingSamplesSection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileOutreachRulesUpdateResult =
  | {
      status: "validation_error";
      issues: SectionValidationIssue[];
    }
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "updated";
      userId: string;
      section: OutreachRulesSection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileOutreachRulesReadResult =
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "found";
      userId: string;
      section: OutreachRulesSection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileLeadershipProfileUpdateResult =
  | {
      status: "validation_error";
      issues: SectionValidationIssue[];
    }
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "updated";
      userId: string;
      section: LeadershipProfileSection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileLeadershipProfileReadResult =
  | {
      status: "not_found";
      userId: string;
    }
  | {
      status: "found";
      userId: string;
      section: LeadershipProfileSection;
      profileQuality: ProfileQuality;
      aggregate: CandidateProfileAggregate;
    };

export type PublicProfileSectionUpdateOptions = {
  updatedAt?: string;
};

export async function readLoadedIdentitySearchSectionForUser(
  loadAggregate: PublicProfileSectionServiceDependencies["loadAggregate"],
  userId: string,
  checkedAt = new Date().toISOString(),
): Promise<PublicProfileIdentitySearchReadResult> {
  const aggregate = await loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  const profileQuality = evaluateCandidateProfileQuality(aggregate, checkedAt);

  return {
    status: "found",
    userId,
    section: identitySearchSection(aggregate),
    profileQuality,
    aggregate: {
      ...aggregate,
      profileQuality,
    },
  };
}

export async function updateLoadedIdentitySearchSectionForUser(
  dependencies: PublicProfileSectionServiceDependencies,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
): Promise<PublicProfileIdentitySearchUpdateResult> {
  const parsed = parseIdentitySearchSectionPatch(input);
  if (parsed.ok === false) {
    return {
      status: "validation_error",
      issues: parsed.issues,
    };
  }

  const aggregate = await dependencies.loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  const result = applyIdentitySearchSectionPatch(
    aggregate,
    parsed.patch,
    options.updatedAt,
  );
  await dependencies.persistIdentitySearchSection(result);

  return {
    status: "updated",
    userId,
    section: result.section,
    profileQuality: result.profileQuality,
    aggregate: result.aggregate,
  };
}

export async function readLoadedRoleTracksSectionForUser(
  loadAggregate: PublicProfileSectionServiceDependencies["loadAggregate"],
  userId: string,
  checkedAt = new Date().toISOString(),
): Promise<PublicProfileRoleTracksReadResult> {
  const aggregate = await loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  const profileQuality = evaluateCandidateProfileQuality(aggregate, checkedAt);

  return {
    status: "found",
    userId,
    section: roleTracksSection(aggregate),
    profileQuality,
    aggregate: {
      ...aggregate,
      profileQuality,
    },
  };
}

export async function updateLoadedRoleTracksSectionForUser(
  dependencies: PublicProfileSectionServiceDependencies,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
): Promise<PublicProfileRoleTracksUpdateResult> {
  const parsed = parseRoleTracksSectionPatch(input);
  if (parsed.ok === false) {
    return {
      status: "validation_error",
      issues: parsed.issues,
    };
  }

  const aggregate = await dependencies.loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  if (!dependencies.persistRoleTracksSection) {
    throw new Error("Role Tracks persistence dependency is required.");
  }

  const result = applyRoleTracksSectionPatch(
    aggregate,
    parsed.patch,
    options.updatedAt,
  );
  await dependencies.persistRoleTracksSection(result);

  return {
    status: "updated",
    userId,
    section: result.section,
    profileQuality: result.profileQuality,
    aggregate: result.aggregate,
  };
}

export async function readLoadedResumeUploadsSectionForUser(
  loadAggregate: PublicProfileSectionServiceDependencies["loadAggregate"],
  userId: string,
  checkedAt = new Date().toISOString(),
): Promise<PublicProfileResumeUploadsReadResult> {
  const aggregate = await loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  const profileQuality = evaluateCandidateProfileQuality(aggregate, checkedAt);

  return {
    status: "found",
    userId,
    section: resumeUploadsSection(aggregate),
    profileQuality,
    aggregate: {
      ...aggregate,
      profileQuality,
    },
  };
}

export async function updateLoadedResumeUploadsSectionForUser(
  dependencies: PublicProfileSectionServiceDependencies,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
): Promise<PublicProfileResumeUploadsUpdateResult> {
  const parsed = parseResumeUploadsSectionPatch(input);
  if (parsed.ok === false) {
    return {
      status: "validation_error",
      issues: parsed.issues,
    };
  }

  const aggregate = await dependencies.loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  const attachmentIssues = validateResumeUploadsSectionPatch(aggregate, parsed.patch);
  if (attachmentIssues.length > 0) {
    return {
      status: "validation_error",
      issues: attachmentIssues,
    };
  }

  if (!dependencies.persistResumeUploadsSection) {
    throw new Error("Resume Uploads persistence dependency is required.");
  }

  const result = applyResumeUploadsSectionPatch(
    aggregate,
    parsed.patch,
    options.updatedAt,
  );
  await dependencies.persistResumeUploadsSection(result);

  return {
    status: "updated",
    userId,
    section: result.section,
    profileQuality: result.profileQuality,
    aggregate: result.aggregate,
  };
}

export async function readLoadedFitSignalsSectionForUser(
  loadAggregate: PublicProfileSectionServiceDependencies["loadAggregate"],
  userId: string,
  checkedAt = new Date().toISOString(),
): Promise<PublicProfileFitSignalsReadResult> {
  const aggregate = await loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  const profileQuality = evaluateCandidateProfileQuality(aggregate, checkedAt);

  return {
    status: "found",
    userId,
    section: fitSignalsSection(aggregate),
    profileQuality,
    aggregate: {
      ...aggregate,
      profileQuality,
    },
  };
}

export async function updateLoadedFitSignalsSectionForUser(
  dependencies: PublicProfileSectionServiceDependencies,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
): Promise<PublicProfileFitSignalsUpdateResult> {
  const parsed = parseFitSignalsSectionPatch(input);
  if (parsed.ok === false) {
    return {
      status: "validation_error",
      issues: parsed.issues,
    };
  }

  const aggregate = await dependencies.loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  if (!dependencies.persistFitSignalsSection) {
    throw new Error("Fit Signals persistence dependency is required.");
  }

  const result = applyFitSignalsSectionPatch(
    aggregate,
    parsed.patch,
    options.updatedAt,
  );
  await dependencies.persistFitSignalsSection(result);

  return {
    status: "updated",
    userId,
    section: result.section,
    profileQuality: result.profileQuality,
    aggregate: result.aggregate,
  };
}

export async function readLoadedWorkExamplesSectionForUser(
  loadAggregate: PublicProfileSectionServiceDependencies["loadAggregate"],
  userId: string,
  checkedAt = new Date().toISOString(),
): Promise<PublicProfileWorkExamplesReadResult> {
  const aggregate = await loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  const profileQuality = evaluateCandidateProfileQuality(aggregate, checkedAt);

  return {
    status: "found",
    userId,
    section: workExamplesSection(aggregate),
    profileQuality,
    aggregate: {
      ...aggregate,
      profileQuality,
    },
  };
}

export async function updateLoadedWorkExamplesSectionForUser(
  dependencies: PublicProfileSectionServiceDependencies,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
): Promise<PublicProfileWorkExamplesUpdateResult> {
  const parsed = parseWorkExamplesSectionPatch(input);
  if (parsed.ok === false) {
    return {
      status: "validation_error",
      issues: parsed.issues,
    };
  }

  const aggregate = await dependencies.loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  if (!dependencies.persistWorkExamplesSection) {
    throw new Error("Work Examples persistence dependency is required.");
  }

  const result = applyWorkExamplesSectionPatch(
    aggregate,
    parsed.patch,
    options.updatedAt,
  );
  await dependencies.persistWorkExamplesSection(result);

  return {
    status: "updated",
    userId,
    section: result.section,
    profileQuality: result.profileQuality,
    aggregate: result.aggregate,
  };
}

export async function readLoadedSkillsInventorySectionForUser(
  loadAggregate: PublicProfileSectionServiceDependencies["loadAggregate"],
  userId: string,
  checkedAt = new Date().toISOString(),
): Promise<PublicProfileSkillsInventoryReadResult> {
  const aggregate = await loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  const profileQuality = evaluateCandidateProfileQuality(aggregate, checkedAt);

  return {
    status: "found",
    userId,
    section: skillsInventorySection(aggregate),
    profileQuality,
    aggregate: {
      ...aggregate,
      profileQuality,
    },
  };
}

export async function updateLoadedSkillsInventorySectionForUser(
  dependencies: PublicProfileSectionServiceDependencies,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
): Promise<PublicProfileSkillsInventoryUpdateResult> {
  const parsed = parseSkillsInventorySectionPatch(input);
  if (parsed.ok === false) {
    return {
      status: "validation_error",
      issues: parsed.issues,
    };
  }

  const aggregate = await dependencies.loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  const relationshipIssues = validateSkillsInventorySectionPatch(aggregate, parsed.patch);
  if (relationshipIssues.length > 0) {
    return {
      status: "validation_error",
      issues: relationshipIssues,
    };
  }

  if (!dependencies.persistSkillsInventorySection) {
    throw new Error("Skills Inventory persistence dependency is required.");
  }

  const result = applySkillsInventorySectionPatch(
    aggregate,
    parsed.patch,
    options.updatedAt,
  );
  await dependencies.persistSkillsInventorySection(result);

  return {
    status: "updated",
    userId,
    section: result.section,
    profileQuality: result.profileQuality,
    aggregate: result.aggregate,
  };
}

export async function readLoadedQualityNarrativeSectionForUser(
  loadAggregate: PublicProfileSectionServiceDependencies["loadAggregate"],
  userId: string,
  section: QualitySection,
  checkedAt = new Date().toISOString(),
): Promise<PublicProfileQualityNarrativeReadResult> {
  const aggregate = await loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  const profileQuality = evaluateCandidateProfileQuality(aggregate, checkedAt);

  return {
    status: "found",
    userId,
    section: qualityNarrativeSection(aggregate, section),
    profileQuality,
    aggregate: {
      ...aggregate,
      profileQuality,
    },
  };
}

export async function updateLoadedQualityNarrativeSectionForUser(
  dependencies: PublicProfileSectionServiceDependencies,
  userId: string,
  section: QualitySection,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
): Promise<PublicProfileQualityNarrativeUpdateResult> {
  const parsed = parseQualityNarrativeSectionPatch(section, input);
  if (parsed.ok === false) {
    return {
      status: "validation_error",
      issues: parsed.issues,
    };
  }

  const aggregate = await dependencies.loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  if (!dependencies.persistQualityNarrativeSection) {
    throw new Error("Quality narrative persistence dependency is required.");
  }

  const result = applyQualityNarrativeSectionPatch(
    aggregate,
    section,
    parsed.patch,
    options.updatedAt,
  );
  await dependencies.persistQualityNarrativeSection(result);

  return {
    status: "updated",
    userId,
    section: result.section,
    profileQuality: result.profileQuality,
    aggregate: result.aggregate,
  };
}

export async function readLoadedVoicePersonalitySectionForUser(
  loadAggregate: PublicProfileSectionServiceDependencies["loadAggregate"],
  userId: string,
  checkedAt = new Date().toISOString(),
): Promise<PublicProfileVoicePersonalityReadResult> {
  const aggregate = await loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  const profileQuality = evaluateCandidateProfileQuality(aggregate, checkedAt);

  return {
    status: "found",
    userId,
    section: voicePersonalitySection(aggregate),
    profileQuality,
    aggregate: {
      ...aggregate,
      profileQuality,
    },
  };
}

export async function updateLoadedVoicePersonalitySectionForUser(
  dependencies: PublicProfileSectionServiceDependencies,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
): Promise<PublicProfileVoicePersonalityUpdateResult> {
  const parsed = parseVoicePersonalitySectionPatch(input);
  if (parsed.ok === false) {
    return {
      status: "validation_error",
      issues: parsed.issues,
    };
  }

  const aggregate = await dependencies.loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  if (!dependencies.persistVoicePersonalitySection) {
    throw new Error("Voice & Personality persistence dependency is required.");
  }

  const result = applyVoicePersonalitySectionPatch(
    aggregate,
    parsed.patch,
    options.updatedAt,
  );
  await dependencies.persistVoicePersonalitySection(result);

  return {
    status: "updated",
    userId,
    section: result.section,
    profileQuality: result.profileQuality,
    aggregate: result.aggregate,
  };
}

export async function readLoadedWritingSamplesSectionForUser(
  loadAggregate: PublicProfileSectionServiceDependencies["loadAggregate"],
  userId: string,
  checkedAt = new Date().toISOString(),
): Promise<PublicProfileWritingSamplesReadResult> {
  const aggregate = await loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  const profileQuality = evaluateCandidateProfileQuality(aggregate, checkedAt);

  return {
    status: "found",
    userId,
    section: writingSamplesSection(aggregate),
    profileQuality,
    aggregate: {
      ...aggregate,
      profileQuality,
    },
  };
}

export async function updateLoadedWritingSamplesSectionForUser(
  dependencies: PublicProfileSectionServiceDependencies,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
): Promise<PublicProfileWritingSamplesUpdateResult> {
  const parsed = parseWritingSamplesSectionPatch(input);
  if (parsed.ok === false) {
    return {
      status: "validation_error",
      issues: parsed.issues,
    };
  }

  const aggregate = await dependencies.loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  if (!dependencies.persistWritingSamplesSection) {
    throw new Error("Writing Samples persistence dependency is required.");
  }

  const result = applyWritingSamplesSectionPatch(
    aggregate,
    parsed.patch,
    options.updatedAt,
  );
  await dependencies.persistWritingSamplesSection(result);

  return {
    status: "updated",
    userId,
    section: result.section,
    profileQuality: result.profileQuality,
    aggregate: result.aggregate,
  };
}

export async function readLoadedOutreachRulesSectionForUser(
  loadAggregate: PublicProfileSectionServiceDependencies["loadAggregate"],
  userId: string,
  checkedAt = new Date().toISOString(),
): Promise<PublicProfileOutreachRulesReadResult> {
  const aggregate = await loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  const profileQuality = evaluateCandidateProfileQuality(aggregate, checkedAt);

  return {
    status: "found",
    userId,
    section: outreachRulesSection(aggregate),
    profileQuality,
    aggregate: {
      ...aggregate,
      profileQuality,
    },
  };
}

export async function updateLoadedOutreachRulesSectionForUser(
  dependencies: PublicProfileSectionServiceDependencies,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
): Promise<PublicProfileOutreachRulesUpdateResult> {
  const parsed = parseOutreachRulesSectionPatch(input);
  if (parsed.ok === false) {
    return {
      status: "validation_error",
      issues: parsed.issues,
    };
  }

  const aggregate = await dependencies.loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  const roleTrackIssues = validateOutreachRulesSectionPatch(aggregate, parsed.patch);
  if (roleTrackIssues.length > 0) {
    return {
      status: "validation_error",
      issues: roleTrackIssues,
    };
  }

  if (!dependencies.persistOutreachRulesSection) {
    throw new Error("Outreach Rules persistence dependency is required.");
  }

  const result = applyOutreachRulesSectionPatch(
    aggregate,
    parsed.patch,
    options.updatedAt,
  );
  await dependencies.persistOutreachRulesSection(result);

  return {
    status: "updated",
    userId,
    section: result.section,
    profileQuality: result.profileQuality,
    aggregate: result.aggregate,
  };
}

export async function readLoadedLeadershipProfileSectionForUser(
  loadAggregate: PublicProfileSectionServiceDependencies["loadAggregate"],
  userId: string,
  checkedAt = new Date().toISOString(),
): Promise<PublicProfileLeadershipProfileReadResult> {
  const aggregate = await loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  const profileQuality = evaluateCandidateProfileQuality(aggregate, checkedAt);

  return {
    status: "found",
    userId,
    section: leadershipProfileSection(aggregate),
    profileQuality,
    aggregate: {
      ...aggregate,
      profileQuality,
    },
  };
}

export async function updateLoadedLeadershipProfileSectionForUser(
  dependencies: PublicProfileSectionServiceDependencies,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
): Promise<PublicProfileLeadershipProfileUpdateResult> {
  const parsed = parseLeadershipProfileSectionPatch(input);
  if (parsed.ok === false) {
    return {
      status: "validation_error",
      issues: parsed.issues,
    };
  }

  const aggregate = await dependencies.loadAggregate(userId);
  if (!aggregate) {
    return {
      status: "not_found",
      userId,
    };
  }

  if (!dependencies.persistLeadershipProfileSection) {
    throw new Error("Leadership Profile persistence dependency is required.");
  }

  const result = applyLeadershipProfileSectionPatch(
    aggregate,
    parsed.patch,
    options.updatedAt,
  );
  await dependencies.persistLeadershipProfileSection(result);

  return {
    status: "updated",
    userId,
    section: result.section,
    profileQuality: result.profileQuality,
    aggregate: result.aggregate,
  };
}

export async function readIdentitySearchSectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  checkedAt?: string,
) {
  return readLoadedIdentitySearchSectionForUser(
    (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    userId,
    checkedAt,
  );
}

export async function updateIdentitySearchSectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
) {
  return updateLoadedIdentitySearchSectionForUser({
    loadAggregate: (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    persistIdentitySearchSection: (result) => persistIdentitySearchSection(request, result),
  }, userId, input, options);
}

export async function readRoleTracksSectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  checkedAt?: string,
) {
  return readLoadedRoleTracksSectionForUser(
    (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    userId,
    checkedAt,
  );
}

export async function updateRoleTracksSectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
) {
  return updateLoadedRoleTracksSectionForUser({
    loadAggregate: (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    persistIdentitySearchSection: (result) => persistIdentitySearchSection(request, result),
    persistRoleTracksSection: (result) => persistRoleTracksSection(request, result),
  }, userId, input, options);
}

export async function readResumeUploadsSectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  checkedAt?: string,
) {
  return readLoadedResumeUploadsSectionForUser(
    (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    userId,
    checkedAt,
  );
}

export async function updateResumeUploadsSectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
) {
  return updateLoadedResumeUploadsSectionForUser({
    loadAggregate: (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    persistIdentitySearchSection: (result) => persistIdentitySearchSection(request, result),
    persistResumeUploadsSection: (result) => persistResumeUploadsSection(request, result),
  }, userId, input, options);
}

export async function readFitSignalsSectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  checkedAt?: string,
) {
  return readLoadedFitSignalsSectionForUser(
    (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    userId,
    checkedAt,
  );
}

export async function updateFitSignalsSectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
) {
  return updateLoadedFitSignalsSectionForUser({
    loadAggregate: (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    persistIdentitySearchSection: (result) => persistIdentitySearchSection(request, result),
    persistFitSignalsSection: (result) => persistFitSignalsSection(request, result),
  }, userId, input, options);
}

export async function readWorkExamplesSectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  checkedAt?: string,
) {
  return readLoadedWorkExamplesSectionForUser(
    (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    userId,
    checkedAt,
  );
}

export async function updateWorkExamplesSectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
) {
  return updateLoadedWorkExamplesSectionForUser({
    loadAggregate: (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    persistIdentitySearchSection: (result) => persistIdentitySearchSection(request, result),
    persistWorkExamplesSection: (result) => persistWorkExamplesSection(request, result),
  }, userId, input, options);
}

export async function readSkillsInventorySectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  checkedAt?: string,
) {
  return readLoadedSkillsInventorySectionForUser(
    (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    userId,
    checkedAt,
  );
}

export async function updateSkillsInventorySectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
) {
  return updateLoadedSkillsInventorySectionForUser({
    loadAggregate: (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    persistIdentitySearchSection: (result) => persistIdentitySearchSection(request, result),
    persistSkillsInventorySection: (result) => persistSkillsInventorySection(request, result),
  }, userId, input, options);
}

export async function readQualityNarrativeSectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  section: QualitySection,
  checkedAt?: string,
) {
  return readLoadedQualityNarrativeSectionForUser(
    (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    userId,
    section,
    checkedAt,
  );
}

export async function updateQualityNarrativeSectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  section: QualitySection,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
) {
  return updateLoadedQualityNarrativeSectionForUser({
    loadAggregate: (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    persistIdentitySearchSection: (result) => persistIdentitySearchSection(request, result),
    persistQualityNarrativeSection: (result) => persistQualityNarrativeSection(request, result),
  }, userId, section, input, options);
}

export async function readVoicePersonalitySectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  checkedAt?: string,
) {
  return readLoadedVoicePersonalitySectionForUser(
    (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    userId,
    checkedAt,
  );
}

export async function updateVoicePersonalitySectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
) {
  return updateLoadedVoicePersonalitySectionForUser({
    loadAggregate: (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    persistIdentitySearchSection: (result) => persistIdentitySearchSection(request, result),
    persistVoicePersonalitySection: (result) => persistVoicePersonalitySection(request, result),
  }, userId, input, options);
}

export async function readWritingSamplesSectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  checkedAt?: string,
) {
  return readLoadedWritingSamplesSectionForUser(
    (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    userId,
    checkedAt,
  );
}

export async function updateWritingSamplesSectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
) {
  return updateLoadedWritingSamplesSectionForUser({
    loadAggregate: (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    persistIdentitySearchSection: (result) => persistIdentitySearchSection(request, result),
    persistWritingSamplesSection: (result) => persistWritingSamplesSection(request, result),
  }, userId, input, options);
}

export async function readOutreachRulesSectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  checkedAt?: string,
) {
  return readLoadedOutreachRulesSectionForUser(
    (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    userId,
    checkedAt,
  );
}

export async function updateOutreachRulesSectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
) {
  return updateLoadedOutreachRulesSectionForUser({
    loadAggregate: (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    persistIdentitySearchSection: (result) => persistIdentitySearchSection(request, result),
    persistOutreachRulesSection: (result) => persistOutreachRulesSection(request, result),
  }, userId, input, options);
}

export async function readLeadershipProfileSectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  checkedAt?: string,
) {
  return readLoadedLeadershipProfileSectionForUser(
    (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    userId,
    checkedAt,
  );
}

export async function updateLeadershipProfileSectionForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  input: unknown,
  options: PublicProfileSectionUpdateOptions = {},
) {
  return updateLoadedLeadershipProfileSectionForUser({
    loadAggregate: (requestedUserId) => loadCandidateProfileAggregate(request, requestedUserId),
    persistIdentitySearchSection: (result) => persistIdentitySearchSection(request, result),
    persistLeadershipProfileSection: (result) => persistLeadershipProfileSection(request, result),
  }, userId, input, options);
}

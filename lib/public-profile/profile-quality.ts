import type {
  CandidateProfileAggregate,
  ProfileQuality,
  QualityScoredTextField,
  QualitySection,
} from "./types";

export const requiredProfileQualityFields: Record<QualitySection, string[]> = {
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
  leadership_profile: [],
};

export const allowedProfileQualityFields: Record<QualitySection, string[]> = {
  ...requiredProfileQualityFields,
  leadership_profile: [
    "leadershipStyle",
    "teamManagementStyle",
    "stakeholderManagementStyle",
    "conflictStyle",
    "executiveCommunicationStyle",
  ],
};

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function hasText(value: string | undefined) {
  return clean(value).length > 0;
}

function hasItems(values: string[] | undefined) {
  return (values ?? []).some((value) => hasText(value));
}

function qualityFieldKey(section: QualitySection, fieldKey: string) {
  return `${section}.${fieldKey}`;
}

function qualityFieldMap(fields: QualityScoredTextField[]) {
  return fields.reduce((map, field) => {
    map.set(qualityFieldKey(field.section, field.fieldKey), field);
    return map;
  }, new Map<string, QualityScoredTextField>());
}

type CompletionAccumulator = {
  incompleteReasons: string[];
  weakFields: string[];
  completeFields: string[];
};

function requireCondition(
  accumulator: CompletionAccumulator,
  field: string,
  complete: boolean,
  reason: string,
) {
  if (complete) {
    accumulator.completeFields.push(field);
  } else {
    accumulator.incompleteReasons.push(reason);
  }
}

function evaluateRequiredQualityFields(
  aggregate: CandidateProfileAggregate,
  accumulator: CompletionAccumulator,
) {
  const fields = qualityFieldMap(aggregate.qualityFields);

  for (const [section, fieldKeys] of Object.entries(requiredProfileQualityFields) as Array<[QualitySection, string[]]>) {
    for (const fieldKey of fieldKeys) {
      const stableKey = qualityFieldKey(section, fieldKey);
      const field = fields.get(stableKey);

      if (!field || !hasText(field.value)) {
        accumulator.incompleteReasons.push(`Missing required profile answer: ${stableKey}`);
        accumulator.weakFields.push(stableKey);
        continue;
      }

      if (field.quality === "weak") {
        accumulator.incompleteReasons.push(`Weak required profile answer: ${stableKey}`);
        accumulator.weakFields.push(stableKey);
        continue;
      }

      accumulator.completeFields.push(stableKey);
    }
  }
}

export function evaluateCandidateProfileQuality(
  aggregate: CandidateProfileAggregate,
  checkedAt = new Date().toISOString(),
): ProfileQuality {
  const accumulator: CompletionAccumulator = {
    incompleteReasons: [],
    weakFields: [],
    completeFields: [],
  };
  const roleTrackIds = new Set(aggregate.roleTracks.map((track) => track.id));
  const resumeIds = new Set(aggregate.resumes.map((resume) => resume.id));

  requireCondition(accumulator, "identity.fullName", hasText(aggregate.profile.fullName), "Full name is required.");
  requireCondition(accumulator, "identity.location", hasText(aggregate.profile.location), "Location is required.");
  requireCondition(accumulator, "identity.workAuthorization", hasText(aggregate.profile.workAuthorization), "Work authorization is required.");
  requireCondition(accumulator, "search.remotePreference", hasText(aggregate.profile.remotePreference), "Remote preference is required.");
  requireCondition(accumulator, "search.availability", hasText(aggregate.profile.availability), "Availability is required.");
  requireCondition(
    accumulator,
    "search.employmentTypes",
    hasItems(aggregate.preferences?.employmentTypes),
    "At least one employment type is required.",
  );

  requireCondition(accumulator, "roleTracks", aggregate.roleTracks.length > 0, "At least one Role Track is required.");
  for (const track of aggregate.roleTracks) {
    const prefix = `roleTracks.${track.id}`;
    requireCondition(accumulator, `${prefix}.name`, hasText(track.name), `Role Track ${track.id} needs a name.`);
    requireCondition(accumulator, `${prefix}.description`, hasText(track.description), `Role Track ${track.name || track.id} needs a description.`);
    requireCondition(accumulator, `${prefix}.corePositioning`, hasText(track.corePositioning), `Role Track ${track.name || track.id} needs core positioning.`);
    requireCondition(accumulator, `${prefix}.targetTitles`, hasItems(track.targetTitles), `Role Track ${track.name || track.id} needs target titles.`);
    requireCondition(accumulator, `${prefix}.keyResponsibilities`, hasItems(track.keyResponsibilities), `Role Track ${track.name || track.id} needs key responsibilities.`);
    requireCondition(accumulator, `${prefix}.requiredExperiencePatterns`, hasItems(track.requiredExperiencePatterns), `Role Track ${track.name || track.id} needs required experience patterns.`);
    requireCondition(accumulator, `${prefix}.strongJobSignals`, hasItems(track.strongJobSignals), `Role Track ${track.name || track.id} needs strong job signals.`);
    requireCondition(accumulator, `${prefix}.weakJobSignals`, hasItems(track.weakJobSignals), `Role Track ${track.name || track.id} needs weak job signals.`);
    requireCondition(accumulator, `${prefix}.mismatchSignals`, hasItems(track.mismatchSignals), `Role Track ${track.name || track.id} needs mismatch signals.`);
    requireCondition(accumulator, `${prefix}.resumeIds`, track.resumeIds.some((resumeId) => resumeIds.has(resumeId)), `Role Track ${track.name || track.id} must be attached to a resume.`);
    requireCondition(accumulator, `${prefix}.outreachAngle`, hasText(track.outreachAngle), `Role Track ${track.name || track.id} needs an outreach angle.`);
    requireCondition(accumulator, `${prefix}.doNotOverclaim`, hasItems(track.doNotOverclaim), `Role Track ${track.name || track.id} needs do-not-overclaim guidance.`);
  }

  requireCondition(accumulator, "resumes", aggregate.resumes.length > 0, "At least one resume is required.");
  for (const resume of aggregate.resumes) {
    const prefix = `resumes.${resume.id}`;
    requireCondition(accumulator, `${prefix}.name`, hasText(resume.name), `Resume ${resume.id} needs a name.`);
    requireCondition(accumulator, `${prefix}.fileUrl`, hasText(resume.fileUrl), `Resume ${resume.name || resume.id} needs a file URL.`);
    requireCondition(accumulator, `${prefix}.parsedText`, hasText(resume.parsedText), `Resume ${resume.name || resume.id} needs parsed text.`);
    requireCondition(accumulator, `${prefix}.associatedRoleTrackIds`, resume.associatedRoleTrackIds.some((trackId) => roleTrackIds.has(trackId)), `Resume ${resume.name || resume.id} must be attached to a Role Track.`);
    requireCondition(accumulator, `${prefix}.strengths`, hasItems(resume.strengths), `Resume ${resume.name || resume.id} needs strengths.`);
    requireCondition(accumulator, `${prefix}.gaps`, hasItems(resume.gaps), `Resume ${resume.name || resume.id} needs gaps.`);
    requireCondition(accumulator, `${prefix}.useWhen`, hasItems(resume.useWhen), `Resume ${resume.name || resume.id} needs use-when guidance.`);
    requireCondition(accumulator, `${prefix}.avoidWhen`, hasItems(resume.avoidWhen), `Resume ${resume.name || resume.id} needs avoid-when guidance.`);
    requireCondition(accumulator, `${prefix}.parsingQuality`, resume.parsingQuality === "complete", `Resume ${resume.name || resume.id} parsing quality must be complete.`);
  }

  requireCondition(accumulator, "workHistory", aggregate.workHistory.length > 0, "Parsed work history is required.");
  for (const item of aggregate.workHistory) {
    const prefix = `workHistory.${item.id}`;
    requireCondition(accumulator, `${prefix}.company`, hasText(item.company), `Work history ${item.id} needs a company.`);
    requireCondition(accumulator, `${prefix}.title`, hasText(item.title), `Work history ${item.id} needs a title.`);
    requireCondition(accumulator, `${prefix}.responsibilitiesOrAccomplishments`, hasItems(item.responsibilities) || hasItems(item.accomplishments), `Work history ${item.title || item.id} needs responsibilities or accomplishments.`);
    requireCondition(accumulator, `${prefix}.associatedResumeIds`, item.associatedResumeIds.some((resumeId) => resumeIds.has(resumeId)), `Work history ${item.title || item.id} must be tied to a resume.`);
    requireCondition(accumulator, `${prefix}.source`, item.source === "resume_parse" || item.source === "user_corrected", `Work history ${item.title || item.id} needs a valid source.`);
  }

  requireCondition(accumulator, "projects", aggregate.projects.length > 0, "At least one Project is required.");
  for (const project of aggregate.projects) {
    const prefix = `projects.${project.id}`;
    requireCondition(accumulator, `${prefix}.name`, hasText(project.name), `Project ${project.id} needs a name.`);
    requireCondition(accumulator, `${prefix}.description`, hasText(project.description), `Project ${project.name || project.id} needs a description.`);
    requireCondition(accumulator, `${prefix}.candidateRole`, hasText(project.candidateRole), `Project ${project.name || project.id} needs candidate role.`);
    requireCondition(accumulator, `${prefix}.whatThisProves`, hasItems(project.whatThisProves), `Project ${project.name || project.id} needs what-this-proves evidence.`);
    requireCondition(accumulator, `${prefix}.capabilitiesDemonstrated`, hasItems(project.capabilitiesDemonstrated), `Project ${project.name || project.id} needs capabilities demonstrated.`);
    requireCondition(accumulator, `${prefix}.keyResponsibilitiesSupported`, hasItems(project.keyResponsibilitiesSupported), `Project ${project.name || project.id} needs key responsibilities supported.`);
    requireCondition(accumulator, `${prefix}.requiredExperienceSupported`, hasItems(project.requiredExperienceSupported), `Project ${project.name || project.id} needs required experience supported.`);
    requireCondition(accumulator, `${prefix}.bestUsedFor`, hasItems(project.bestUsedFor), `Project ${project.name || project.id} needs best-used-for guidance.`);
    requireCondition(accumulator, `${prefix}.avoidUsingFor`, hasItems(project.avoidUsingFor), `Project ${project.name || project.id} needs avoid-using-for guidance.`);
    requireCondition(accumulator, `${prefix}.caveats`, hasItems(project.caveats), `Project ${project.name || project.id} needs caveats.`);
    requireCondition(accumulator, `${prefix}.confidence`, hasText(project.confidence), `Project ${project.name || project.id} needs confidence.`);
  }

  requireCondition(accumulator, "skills", aggregate.skills.length > 0, "At least one skill is required.");
  for (const skill of aggregate.skills) {
    const prefix = `skills.${skill.id}`;
    requireCondition(accumulator, `${prefix}.skillName`, hasText(skill.skillName), `Skill ${skill.id} needs a name.`);
    requireCondition(accumulator, `${prefix}.proficiency`, hasText(skill.proficiency), `Skill ${skill.skillName || skill.id} needs proficiency.`);
    requireCondition(accumulator, `${prefix}.evidence`, hasItems(skill.evidence), `Skill ${skill.skillName || skill.id} needs evidence.`);
    requireCondition(accumulator, `${prefix}.bestRoleFit`, hasItems(skill.bestRoleFit), `Skill ${skill.skillName || skill.id} needs best role fit.`);
    requireCondition(accumulator, `${prefix}.doNotOverclaim`, hasItems(skill.doNotOverclaim), `Skill ${skill.skillName || skill.id} needs do-not-overclaim guidance.`);
  }

  requireCondition(accumulator, "communicationStyle", Boolean(aggregate.communicationStyle), "Communication style settings are required.");
  if (aggregate.communicationStyle) {
    requireCondition(accumulator, "communicationStyle.preferredTone", hasItems(aggregate.communicationStyle.preferredTone), "Preferred tone is required.");
    requireCondition(accumulator, "communicationStyle.messageLengthPreference", hasText(aggregate.communicationStyle.messageLengthPreference), "Message length preference is required.");
    requireCondition(accumulator, "communicationStyle.greetingPreferences", hasItems(aggregate.communicationStyle.greetingPreferences), "Greeting preferences are required.");
    requireCondition(accumulator, "communicationStyle.signoffPreferences", hasItems(aggregate.communicationStyle.signoffPreferences), "Signoff preferences are required.");
    requireCondition(accumulator, "communicationStyle.phrasesToAvoid", hasItems(aggregate.communicationStyle.phrasesToAvoid), "Phrases to avoid are required.");
    requireCondition(accumulator, "communicationStyle.phrasesThatSoundLikeMe", hasItems(aggregate.communicationStyle.phrasesThatSoundLikeMe), "Phrases that sound like me are required.");
  }

  requireCondition(accumulator, "writingSamples.like", aggregate.writingSamples.some((sample) => sample.sampleType === "like" && hasText(sample.text) && hasText(sample.whyItWorksOrFails)), "At least one liked writing sample is required.");
  requireCondition(accumulator, "writingSamples.hate", aggregate.writingSamples.some((sample) => sample.sampleType === "hate" && hasText(sample.text) && hasText(sample.whyItWorksOrFails)), "At least one hated writing sample is required.");

  requireCondition(accumulator, "outreachRules", Boolean(aggregate.outreachRules), "Outreach rule settings are required.");
  if (aggregate.outreachRules) {
    requireCondition(accumulator, "outreachRules.globalRules", hasItems(aggregate.outreachRules.globalRules), "Global outreach rules are required.");
    requireCondition(accumulator, "outreachRules.followUpRules", hasItems(aggregate.outreachRules.followUpRules), "Follow-up rules are required.");
    requireCondition(accumulator, "outreachRules.linkSelectionRules", hasItems(aggregate.outreachRules.linkSelectionRules), "Link selection rules are required.");
  }

  evaluateRequiredQualityFields(aggregate, accumulator);

  const incompleteReasons = Array.from(new Set(accumulator.incompleteReasons));
  const weakFields = Array.from(new Set(accumulator.weakFields));
  const completeFields = Array.from(new Set(accumulator.completeFields));

  return {
    id: aggregate.profileQuality?.id ?? `profile-quality-${aggregate.profile.id}`,
    profileId: aggregate.profile.id,
    status: incompleteReasons.length === 0 && weakFields.length === 0 ? "complete" : "incomplete",
    incompleteReasons,
    weakFields,
    completeFields,
    weakResponseCount: weakFields.length,
    lastCheckedAt: checkedAt,
  };
}

import type {
  CandidateProfileAggregate,
  ProfileQuality,
  QualityScoredTextField,
  QualitySection,
} from "./types";

export const requiredProfileQualityFields: Record<QualitySection, string[]> = {
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
  requireCondition(accumulator, "search.remotePreference", hasText(aggregate.profile.remotePreference), "Remote preference is required.");
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

  requireCondition(accumulator, "workExamples", aggregate.workExamples.length > 0, "At least one Work Example is required.");
  for (const example of aggregate.workExamples) {
    const prefix = `workExamples.${example.id}`;
    requireCondition(accumulator, `${prefix}.title`, hasText(example.title), `Work Example ${example.id} needs a title.`);
    requireCondition(accumulator, `${prefix}.oneHitter`, hasText(example.oneHitter), `Work Example ${example.title || example.id} needs a one-hitter.`);
    requireCondition(accumulator, `${prefix}.context`, hasText(example.context), `Work Example ${example.title || example.id} needs context.`);
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

  requireCondition(accumulator, "voicePersonality", Boolean(aggregate.voicePersonality), "Voice & Personality answers are required.");
  if (aggregate.voicePersonality) {
    requireCondition(accumulator, "voicePersonality.q1Value", hasText(aggregate.voicePersonality.q1Value), "Q1 (what you're the person for) is required.");
    requireCondition(accumulator, "voicePersonality.q4Opinion", hasText(aggregate.voicePersonality.q4Opinion), "Q4 (an opinion you'll defend) is required.");
    requireCondition(accumulator, "voicePersonality.toneTags", hasItems(aggregate.voicePersonality.toneTags), "At least one tone tag is required.");
  }

  requireCondition(accumulator, "writingSamples.soundsLikeMe", aggregate.writingSamples.some((sample) => sample.bucket === "sounds_like_me" && hasText(sample.text)), "At least one \"sounds like me\" writing sample is required.");
  requireCondition(accumulator, "writingSamples.neverSound", aggregate.writingSamples.some((sample) => sample.bucket === "never_sound" && hasText(sample.text)), "At least one \"never sound like this\" writing sample is required.");

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

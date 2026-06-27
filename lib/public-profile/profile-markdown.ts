import type {
  CandidateProfileAggregate,
  GeneratedMarkdown,
  QualityScoredTextField,
  QualitySection,
  RoleTrack,
  WritingSample,
  WritingSampleBucket,
} from "./types";

const sectionLabels: Record<QualitySection, string> = {
  outreach_rules: "Outreach Rules",
  leadership_profile: "Leadership Profile",
};

const writingBucketLabels: Record<WritingSampleBucket, string> = {
  sounds_like_me: "Sounds like me",
  want_to_sound: "Want to sound like this",
  never_sound: "Never sound like this",
};

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function labelFromKey(key: string) {
  return key
    .replace(/\bAI\b/g, "Ai")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\bI([A-Z])/g, "I $1")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function list(values: string[] | undefined) {
  const cleaned = (values ?? []).map(clean).filter(Boolean);
  if (cleaned.length === 0) return "- None captured";
  return cleaned.map((value) => `- ${value}`).join("\n");
}

function line(label: string, value: string | number | undefined) {
  const cleaned = typeof value === "number" ? String(value) : clean(value);
  return `- ${label}: ${cleaned || "Not captured"}`;
}

function qualityFieldsBySection(fields: QualityScoredTextField[]) {
  return fields.reduce((groups, field) => {
    const group = groups.get(field.section) ?? [];
    group.push(field);
    groups.set(field.section, group);
    return groups;
  }, new Map<QualitySection, QualityScoredTextField[]>());
}

function renderQualitySection(section: QualitySection, fields: QualityScoredTextField[]) {
  if (fields.length === 0) return `## ${sectionLabels[section]}\n\nNo answers captured.`;

  const body = fields
    .sort((left, right) => left.fieldKey.localeCompare(right.fieldKey))
    .map((field) => [
      `### ${labelFromKey(field.fieldKey)}`,
      "",
      clean(field.value) || "Not captured",
      "",
      `Quality: ${field.quality}`,
      field.feedback ? `Feedback: ${field.feedback}` : "",
    ].filter(Boolean).join("\n"))
    .join("\n\n");

  return `## ${sectionLabels[section]}\n\n${body}`;
}

function renderRoleTrack(track: RoleTrack) {
  return [
    `### ${track.name}`,
    "",
    clean(track.description) || "No description captured.",
    "",
    line("Core positioning", track.corePositioning),
    line("Outreach angle", track.outreachAngle),
    "",
    "Target titles:",
    list(track.targetTitles),
    "",
    "Key responsibilities:",
    list(track.keyResponsibilities),
    "",
    "Strong job signals:",
    list(track.strongJobSignals),
    "",
    "Weak job signals:",
    list(track.weakJobSignals),
    "",
    "Mismatch signals:",
    list(track.mismatchSignals),
  ].filter(Boolean).join("\n");
}

function renderWritingSamplesByBucket(samples: WritingSample[], bucket: WritingSampleBucket) {
  const matching = samples.filter((sample) => sample.bucket === bucket);
  if (matching.length === 0) return "";
  const body = matching
    .map((sample) => [
      `> ${clean(sample.text) || "Not captured"}`,
      sample.tags.length > 0 ? `Tags: ${sample.tags.join(", ")}` : "",
      `Channel: ${sample.channel}`,
    ].filter(Boolean).join("\n"))
    .join("\n\n");
  return [`${writingBucketLabels[bucket]}:`, "", body].join("\n");
}

export function generateCandidateProfileMarkdown(
  aggregate: CandidateProfileAggregate,
  generatedAt = new Date().toISOString()
): GeneratedMarkdown {
  const { profile, voicePersonality, fitSignals } = aggregate;
  const qualityGroups = qualityFieldsBySection(aggregate.qualityFields);
  const preferredName = clean(profile.preferredName);

  // Per-Role-Track and per-Skill do-not-overclaim, plus never-sound samples,
  // are collected into the Guardrails block at the bottom.
  const trackOverclaim = aggregate.roleTracks
    .filter((track) => track.doNotOverclaim.length > 0)
    .map((track) => `- ${track.name}:\n${track.doNotOverclaim.map((rule) => `  - ${clean(rule)}`).join("\n")}`)
    .join("\n");
  const skillOverclaim = aggregate.skills
    .filter((skill) => skill.doNotOverclaim.length > 0)
    .map((skill) => `- ${skill.skillName}:\n${skill.doNotOverclaim.map((rule) => `  - ${clean(rule)}`).join("\n")}`)
    .join("\n");
  const neverSound = renderWritingSamplesByBucket(aggregate.writingSamples, "never_sound");

  const sections = [
    "# Candidate Profile",
    "",
    // Voice Profile slot. Phase C injects a distilled voice fingerprint at the
    // top of this section; until then it carries the raw voice inputs.
    "## Voice Profile",
    "",
    voicePersonality ? [
      line("What I'm the person for", voicePersonality.q1Value),
      line("An opinion I'll defend", voicePersonality.q4Opinion),
      "",
      "Tone tags:",
      list(voicePersonality.toneTags),
    ].join("\n") : "No voice inputs captured.",
    "",
    renderWritingSamplesByBucket(aggregate.writingSamples, "sounds_like_me"),
    "",
    renderWritingSamplesByBucket(aggregate.writingSamples, "want_to_sound"),
    "",
    "## Identity & Search",
    "",
    line("Full name", profile.fullName),
    preferredName ? line("Preferred name", preferredName) : "",
    line("Location", profile.location),
    line("LinkedIn", profile.linkedInUrl),
    line("Portfolio", profile.portfolioUrl),
    line("Website", profile.personalWebsiteUrl),
    line("Email", profile.email),
    line("Remote preference", profile.remotePreference),
    line("Compensation floor", profile.targetCompensationMin),
    line("Preferred compensation", profile.targetCompensationPreferred),
    "",
    "Employment types:",
    list(aggregate.preferences?.employmentTypes),
    "",
    "Target industries:",
    list(aggregate.preferences?.targetIndustries),
    "",
    "Avoid industries:",
    list(aggregate.preferences?.avoidIndustries),
    "",
    "Target company types:",
    list(aggregate.preferences?.targetCompanyTypes),
    "",
    "Avoid companies:",
    list(aggregate.preferences?.avoidCompanies),
    "",
    aggregate.companyWatchlist.length === 0 ? "" : [
      "Company watchlist:",
      aggregate.companyWatchlist
        .map((company) => `- ${company.companyName} (${company.priority}): ${company.reason}${company.notes ? ` Notes: ${company.notes}` : ""}`)
        .join("\n"),
    ].join("\n"),
    "",
    "## Fit Signals",
    "",
    "Good signals (raise fit):",
    list(fitSignals?.goodSignals),
    "",
    "Poor-fit signals (lower fit, still surfaced):",
    list(fitSignals?.poorFitSignals),
    "",
    "## Role Tracks",
    "",
    aggregate.roleTracks.length === 0 ? "No Role Tracks captured." : aggregate.roleTracks.map(renderRoleTrack).join("\n\n"),
    "",
    "## Resumes",
    "",
    aggregate.resumes.length === 0
      ? "No resumes captured."
      : aggregate.resumes.map((resume) => [
        `### ${resume.name}`,
        "",
        line("Parsing quality", resume.parsingQuality),
        "Strengths:",
        list(resume.strengths),
        "",
        "Gaps:",
        list(resume.gaps),
        "",
        "Use when:",
        list(resume.useWhen),
        "",
        "Avoid when:",
        list(resume.avoidWhen),
      ].join("\n")).join("\n\n"),
    "",
    "## Skills",
    "",
    aggregate.skills.length === 0
      ? "No skills captured."
      : aggregate.skills.map((skill) => [
        `### ${skill.skillName}`,
        "",
        line("Proficiency", skill.proficiency),
        "Evidence:",
        list(skill.evidence),
        "",
        "Best role fit:",
        list(skill.bestRoleFit),
      ].join("\n")).join("\n\n"),
    "",
    "## Work Examples",
    "",
    aggregate.workExamples.length === 0
      ? "No work examples captured."
      : aggregate.workExamples.map((example) => [
        `### ${example.title}`,
        "",
        line("One-hitter", example.oneHitter),
        example.link ? line("Link", example.link) : "",
        "",
        clean(example.context) || "No context captured.",
      ].filter(Boolean).join("\n")).join("\n\n"),
    "",
    renderQualitySection("outreach_rules", qualityGroups.get("outreach_rules") ?? []),
    "",
    "## Outreach Rule Settings",
    "",
    aggregate.outreachRules ? [
      "Global rules:",
      list(aggregate.outreachRules.globalRules),
      "",
      "Follow-up rules:",
      list(aggregate.outreachRules.followUpRules),
      "",
      "Link selection rules:",
      list(aggregate.outreachRules.linkSelectionRules),
    ].join("\n") : "No outreach rule settings captured.",
    "",
    aggregate.leadershipProfile?.visible
      ? renderQualitySection("leadership_profile", qualityGroups.get("leadership_profile") ?? [])
      : "",
    "",
    "## Guardrails",
    "",
    "Do not overclaim (by Role Track):",
    trackOverclaim || "- None captured",
    "",
    "Do not overclaim (by Skill):",
    skillOverclaim || "- None captured",
    "",
    neverSound || "Never sound like this:\n\nNo anti-pattern samples captured.",
    "",
    "## Profile Quality",
    "",
    line("Status", aggregate.profileQuality?.status ?? profile.status),
    "Incomplete reasons:",
    list(aggregate.profileQuality?.incompleteReasons),
    "",
    "Weak fields:",
    list(aggregate.profileQuality?.weakFields),
  ].filter((section) => section !== "").join("\n");

  return {
    markdown: `${sections.trim()}\n`,
    generatedAt,
    profileVersion: profile.version,
  };
}

import type {
  CandidateProfileAggregate,
  GeneratedMarkdown,
  QualityScoredTextField,
  QualitySection,
  RoleTrack,
} from "./types";

const sectionLabels: Record<QualitySection, string> = {
  why_people_hire_me: "Why People Hire Me",
  operating_style: "Operating Style",
  decision_style: "Decision Style",
  communication_style: "Communication Style",
  ai_misreadings: "What AI Gets Wrong About Me",
  outreach_rules: "Outreach Rules",
  leadership_profile: "Leadership Profile",
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
    track.globalProofRules ? line("Global proof rules", track.globalProofRules) : "",
    "",
    "Target titles:",
    list(track.targetTitles),
    "",
    "Key responsibilities:",
    list(track.keyResponsibilities),
    "",
    "Required experience patterns:",
    list(track.requiredExperiencePatterns),
    "",
    "Strong job signals:",
    list(track.strongJobSignals),
    "",
    "Weak job signals:",
    list(track.weakJobSignals),
    "",
    "Mismatch signals:",
    list(track.mismatchSignals),
    "",
    "Do not overclaim:",
    list(track.doNotOverclaim),
  ].filter(Boolean).join("\n");
}

export function generateCandidateProfileMarkdown(
  aggregate: CandidateProfileAggregate,
  generatedAt = new Date().toISOString()
): GeneratedMarkdown {
  const { profile } = aggregate;
  const qualityGroups = qualityFieldsBySection(aggregate.qualityFields);
  const preferredName = clean(profile.preferredName);
  const sections = [
    "# Candidate Profile",
    "",
    "## Identity",
    "",
    line("Full name", profile.fullName),
    preferredName ? line("Preferred name", preferredName) : "",
    line("Location", profile.location),
    line("Work authorization", profile.workAuthorization),
    line("LinkedIn", profile.linkedInUrl),
    line("Portfolio", profile.portfolioUrl),
    line("Website", profile.personalWebsiteUrl),
    line("Email", profile.email),
    "",
    "## Search Constraints",
    "",
    line("Remote preference", profile.remotePreference),
    line("Compensation floor", profile.targetCompensationMin),
    line("Preferred compensation", profile.targetCompensationPreferred),
    line("Availability", profile.availability),
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
    "## Company Watchlist",
    "",
    aggregate.companyWatchlist.length === 0
      ? "No watchlist companies captured."
      : aggregate.companyWatchlist
        .map((company) => `- ${company.companyName} (${company.priority}): ${company.reason}${company.notes ? ` Notes: ${company.notes}` : ""}`)
        .join("\n"),
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
    "## Work History",
    "",
    aggregate.workHistory.length === 0
      ? "No work history captured."
      : aggregate.workHistory.map((item) => [
        `### ${item.title} - ${item.company}`,
        "",
        line("Dates", [item.startDate, item.endDate || (item.currentRole ? "Present" : "")].filter(Boolean).join(" - ")),
        "Responsibilities:",
        list(item.responsibilities),
        "",
        "Accomplishments:",
        list(item.accomplishments),
        "",
        "Metrics:",
        list(item.metrics),
      ].join("\n")).join("\n\n"),
    "",
    "## Projects",
    "",
    aggregate.projects.length === 0
      ? "No projects captured."
      : aggregate.projects.map((project) => [
        `### ${project.name}`,
        "",
        clean(project.description) || "No description captured.",
        "",
        line("Link", project.link),
        line("Candidate role", project.candidateRole),
        line("Confidence", project.confidence),
        "",
        "What this proves:",
        list(project.whatThisProves),
        "",
        "Capabilities demonstrated:",
        list(project.capabilitiesDemonstrated),
        "",
        "Best used for:",
        list(project.bestUsedFor),
        "",
        "Avoid using for:",
        list(project.avoidUsingFor),
        "",
        "Caveats:",
        list(project.caveats),
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
        "",
        "Do not overclaim:",
        list(skill.doNotOverclaim),
      ].join("\n")).join("\n\n"),
    "",
    renderQualitySection("why_people_hire_me", qualityGroups.get("why_people_hire_me") ?? []),
    "",
    renderQualitySection("operating_style", qualityGroups.get("operating_style") ?? []),
    "",
    renderQualitySection("decision_style", qualityGroups.get("decision_style") ?? []),
    "",
    renderQualitySection("communication_style", qualityGroups.get("communication_style") ?? []),
    "",
    "## Communication Settings",
    "",
    aggregate.communicationStyle ? [
      "Preferred tone:",
      list(aggregate.communicationStyle.preferredTone),
      "",
      line("Formality", aggregate.communicationStyle.formalityLevel),
      line("Humor", aggregate.communicationStyle.humorLevel),
      line("Length", aggregate.communicationStyle.messageLengthPreference),
      "",
      "Phrases to avoid:",
      list(aggregate.communicationStyle.phrasesToAvoid),
      "",
      "Phrases that sound like me:",
      list(aggregate.communicationStyle.phrasesThatSoundLikeMe),
    ].join("\n") : "No communication settings captured.",
    "",
    "## Writing Samples",
    "",
    aggregate.writingSamples.length === 0
      ? "No writing samples captured."
      : aggregate.writingSamples.map((sample) => [
        `### ${sample.sampleType === "like" ? "Writing I Like" : "Writing I Hate"} (${sample.channel})`,
        "",
        sample.text,
        "",
        line("Why it works or fails", sample.whyItWorksOrFails),
      ].join("\n")).join("\n\n"),
    "",
    renderQualitySection("ai_misreadings", qualityGroups.get("ai_misreadings") ?? []),
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

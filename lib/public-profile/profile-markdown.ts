import type {
  CandidateProfileAggregate,
  GeneratedMarkdown,
  Resume,
  RoleTrack,
  WritingSample,
  WritingSampleBucket,
} from "./types";

const writingBucketLabels: Record<WritingSampleBucket, string> = {
  sounds_like_me: "Sounds like me",
  want_to_sound: "Want to sound like this",
  never_sound: "Never sound like this",
};

function clean(value: string | undefined) {
  return value?.trim() || "";
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

function renderRoleTrack(track: RoleTrack, resumes: Resume[]) {
  // Route each attached résumé's quotable highlights into this lane so an outreach
  // message matched to the Role Track can cite résumé proof relevant to it.
  const trackHighlights = resumes
    .filter((resume) => track.resumeIds.includes(resume.id))
    .flatMap((resume) => resume.highlights)
    .map(clean)
    .filter(Boolean);
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
    ...(trackHighlights.length > 0
      ? ["Résumé highlights (quotable proof from attached résumés):", list(trackHighlights)]
      : []),
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
  generatedAt = new Date().toISOString(),
  voiceProfileBlock?: string,
): GeneratedMarkdown {
  const { profile, voicePersonality, fitSignals } = aggregate;
  const preferredName = clean(profile.preferredName);

  // Never-sound samples are collected into the Guardrails block at the bottom.
  const neverSound = renderWritingSamplesByBucket(aggregate.writingSamples, "never_sound");

  const sections = [
    "# Candidate Profile",
    "",
    // Voice Profile slot. Phase C injects a distilled voice fingerprint at the
    // top of this section; until then it carries the raw voice inputs.
    "## Voice Profile",
    "",
    // Phase C injects the distilled fingerprint here; the raw inputs follow as
    // the fallback and source material.
    voiceProfileBlock ? voiceProfileBlock : "",
    voiceProfileBlock ? "" : "",
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
    line("Email", profile.email),
    line("Remote preference", profile.remotePreference),
    line("Compensation floor (yearly, USD)", profile.targetCompensationMin),
    line("Preferred compensation (yearly, USD)", profile.targetCompensationPreferred),
    line("Compensation floor (hourly, USD)", profile.targetCompensationHourlyMin),
    line("Preferred compensation (hourly, USD)", profile.targetCompensationHourlyPreferred),
    "",
    // Search-preference lists (employment types, target/avoid industries,
    // target company types, avoid companies) are deliberately NOT rendered:
    // profile.md is outreach-generation context, and those lists are scan/match
    // inputs read from the structured aggregate, never from this document.
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
    aggregate.roleTracks.length === 0 ? "No Role Tracks captured." : aggregate.roleTracks.map((track) => renderRoleTrack(track, aggregate.resumes)).join("\n\n"),
    "",
    "## Resumes",
    "",
    aggregate.resumes.length === 0
      ? "No resumes captured."
      : aggregate.resumes.map((resume) => [
        `### ${resume.name}`,
        "",
        line("Parsing quality", resume.parsingQuality),
        "Highlights (stats / companies you can quote):",
        list(resume.highlights),
        "",
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
    "## Guardrails",
    "",
    neverSound || "Never sound like this:\n\nNo anti-pattern samples captured.",
    // Profile Quality (weak fields / incomplete reasons) is internal QA metadata and is
    // deliberately NOT rendered here — the compiled profile.md feeds outreach + matching,
    // which should never see completion diagnostics. Quality lives in the profile_quality
    // table, surfaced via profileQuality on the aggregate.
  ].filter((section) => section !== "").join("\n");

  return {
    markdown: `${sections.trim()}\n`,
    generatedAt,
    profileVersion: profile.version,
  };
}

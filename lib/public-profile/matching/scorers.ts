import type {
  CandidateProfileAggregate,
  CompanyWatchlistItem,
  Resume,
  RoleTrack,
  SkillProfile,
  WorkExample,
} from "../types";
import type {
  CategoryFit,
  CompanyRemoteException,
  MatchCategory,
  MatchJob,
} from "./types";

const STOP_WORDS = new Set([
  "about",
  "across",
  "after",
  "also",
  "and",
  "are",
  "for",
  "from",
  "has",
  "have",
  "into",
  "its",
  "lead",
  "leading",
  "make",
  "more",
  "not",
  "our",
  "own",
  "role",
  "that",
  "the",
  "their",
  "this",
  "through",
  "with",
  "work",
  "you",
]);

export const CATEGORY_WEIGHTS: Record<MatchCategory, number> = {
  title: 18,
  responsibility: 18,
  work_example: 14,
  resume: 12,
  industry: 10,
  compensation: 10,
  location: 8,
  company: 5,
  posting_freshness: 3,
  apply_method: 2,
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalize(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(trimmed);
  }
  return output;
}

function words(value: string) {
  return normalize(value)
    .split(" ")
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
}

function categoryFit(
  category: MatchCategory,
  score: number,
  reasons: string[],
  risks: string[] = [],
  matchedSignals: string[] = [],
  softExclusions: string[] = [],
): CategoryFit {
  return {
    category,
    score: Math.max(0, Math.min(1, score)),
    reasons: unique(reasons),
    risks: unique(risks),
    matchedSignals: unique(matchedSignals),
    softExclusions: unique(softExclusions),
  };
}

export function textForJob(job: MatchJob) {
  return [
    job.title,
    job.companyName,
    job.description,
    job.location,
    job.remoteType,
    job.employmentType,
    job.industry,
    job.department,
  ].filter(Boolean).join(" ");
}

export function scoreSignalsAgainstText(signals: string[], text: string) {
  const normalizedText = normalize(text);
  const textWords = new Set(words(text));
  const matches: string[] = [];
  let total = 0;

  for (const signal of unique(signals)) {
    const normalizedSignal = normalize(signal);
    if (!normalizedSignal) continue;
    if (normalizedText.includes(normalizedSignal)) {
      matches.push(signal);
      total += 1;
      continue;
    }

    const signalWords = unique(words(signal));
    if (signalWords.length === 0) continue;
    const matchedWords = signalWords.filter((word) => textWords.has(word));
    const ratio = matchedWords.length / signalWords.length;
    if (ratio >= 0.6) {
      matches.push(signal);
      total += ratio * 0.75;
    } else if (matchedWords.length > 0 && signalWords.length <= 2) {
      matches.push(signal);
      total += 0.35;
    }
  }

  const denominator = Math.max(1, Math.min(4, unique(signals).length));
  return {
    score: Math.max(0, Math.min(1, total / denominator)),
    matches: unique(matches),
  };
}

export function scoreTrackAgainstJob(track: RoleTrack, job: MatchJob) {
  const titleSignals = [track.name, ...track.targetTitles];
  const titleScore = scoreSignalsAgainstText(titleSignals, job.title).score;
  const responsibilitySignals = [
    ...track.keyResponsibilities,
    ...track.requiredExperiencePatterns,
    ...track.strongJobSignals,
  ];
  const responsibilityScore = scoreSignalsAgainstText(responsibilitySignals, textForJob(job)).score;

  return (titleScore * 0.45) + (responsibilityScore * 0.55);
}

function bestTrack(profile: CandidateProfileAggregate, job: MatchJob) {
  return profile.roleTracks
    .map((track) => ({ track, score: scoreTrackAgainstJob(track, job) }))
    .sort((a, b) => b.score - a.score)[0];
}

export function scoreTitleFit(profile: CandidateProfileAggregate, job: MatchJob): CategoryFit {
  if (profile.roleTracks.length === 0) {
    return categoryFit("title", 0.2, [], ["No Role Track is available for title matching."]);
  }

  const matchesByTrack = profile.roleTracks.map((track) => {
    const titleSignals = [track.name, ...track.targetTitles];
    return { track, ...scoreSignalsAgainstText(titleSignals, job.title) };
  }).sort((a, b) => b.score - a.score);
  const best = matchesByTrack[0];

  if (best.score >= 0.75) {
    return categoryFit("title", 0.92, [`Title lines up with ${best.track.name}.`], [], best.matches);
  }

  if (best.score >= 0.35) {
    return categoryFit("title", 0.62, [`Title has partial overlap with ${best.track.name}.`], ["The title is close, but not cleanly aligned."], best.matches);
  }

  return categoryFit("title", 0.25, [], ["The title does not clearly match any Role Track."]);
}

export function scoreResponsibilityFit(profile: CandidateProfileAggregate, job: MatchJob): CategoryFit {
  const track = bestTrack(profile, job)?.track;
  if (!track) return categoryFit("responsibility", 0.2, [], ["No Role Track is available for responsibility matching."]);

  const positiveSignals = [
    ...track.keyResponsibilities,
    ...track.requiredExperiencePatterns,
    ...track.strongJobSignals,
    ...profile.skills.flatMap((skill) => [skill.skillName, ...skill.bestRoleFit]),
    ...(profile.fitSignals?.goodSignals ?? []),
  ];
  const mismatchSignals = [
    ...track.weakJobSignals,
    ...track.mismatchSignals,
    ...(profile.fitSignals?.poorFitSignals ?? []),
  ];
  const jobText = textForJob(job);
  const positives = scoreSignalsAgainstText(positiveSignals, jobText);
  const mismatches = scoreSignalsAgainstText(mismatchSignals, jobText);
  const score = Math.max(0.1, Math.min(0.95, (positives.score * 0.9) + 0.1 - (mismatches.score * 0.35)));

  return categoryFit(
    "responsibility",
    score,
    positives.matches.map((match) => `Responsibility overlap: ${match}.`),
    mismatches.matches.map((match) => `Possible mismatch: ${match}.`),
    positives.matches,
  );
}

function workExampleSignals(example: WorkExample, skills: SkillProfile[]) {
  const relatedSkills = skills.filter((skill) => skill.relatedWorkExampleIds.includes(example.id));
  return [
    example.title,
    example.oneHitter,
    example.context,
    ...relatedSkills.flatMap((skill) => [skill.skillName, ...skill.evidence, ...skill.bestRoleFit]),
  ];
}

export function scoreWorkExampleFit(profile: CandidateProfileAggregate, job: MatchJob): CategoryFit {
  if (profile.workExamples.length === 0) {
    return categoryFit("work_example", 0.2, [], ["No Work Examples are available to support this role."]);
  }

  const jobText = textForJob(job);
  const scored = profile.workExamples
    .map((example) => ({
      example,
      ...scoreSignalsAgainstText(workExampleSignals(example, profile.skills), jobText),
    }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (best.score >= 0.5) {
    return categoryFit(
      "work_example",
      0.85,
      [`Work Example support: ${best.example.title}.`],
      [],
      best.matches,
    );
  }

  if (best.score > 0) {
    return categoryFit(
      "work_example",
      0.55,
      [`There is a Work Example with some overlap: ${best.example.title}.`],
      ["The available Work Examples only partially support this job."],
      best.matches,
    );
  }

  return categoryFit("work_example", 0.25, [], ["No Work Example obviously supports this job."]);
}

function resumeSignals(resume: Resume) {
  return [
    resume.name,
    resume.parsedText,
    ...resume.strengths,
    ...resume.useWhen,
  ];
}

export function scoreResumeFit(profile: CandidateProfileAggregate, job: MatchJob): CategoryFit {
  if (profile.resumes.length === 0) {
    return categoryFit("resume", 0.2, [], ["No resume is available for this pursuit."]);
  }

  const selectedTrack = bestTrack(profile, job)?.track;
  const jobText = textForJob(job);
  const scored = profile.resumes
    .map((resume) => {
      const textScore = scoreSignalsAgainstText(resumeSignals(resume), jobText);
      const trackBoost = selectedTrack && resume.associatedRoleTrackIds.includes(selectedTrack.id) ? 0.25 : 0;
      return { resume, score: Math.min(1, textScore.score + trackBoost), matches: textScore.matches };
    })
    .sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (best.score >= 0.6) {
    return categoryFit("resume", 0.85, [`Resume support: ${best.resume.name}.`], [], best.matches);
  }

  return categoryFit("resume", Math.max(0.35, best.score), [], ["Resume support is not obvious from the available data."], best.matches);
}

export function scoreIndustryFit(profile: CandidateProfileAggregate, job: MatchJob): CategoryFit {
  const industryText = [job.industry, job.companyName, job.description].filter(Boolean).join(" ");
  const avoidIndustries = profile.preferences?.avoidIndustries ?? [];
  const targetIndustries = profile.preferences?.targetIndustries ?? [];
  const avoided = scoreSignalsAgainstText(avoidIndustries, industryText);
  if (avoided.matches.length > 0) {
    return categoryFit(
      "industry",
      0.15,
      [],
      avoided.matches.map((match) => `Avoid-industry signal: ${match}.`),
      [],
      avoided.matches.map((match) => `Industry rule: ${match}.`),
    );
  }

  const targets = scoreSignalsAgainstText(targetIndustries, industryText);
  if (targets.matches.length > 0) {
    return categoryFit("industry", 0.9, targets.matches.map((match) => `Target industry overlap: ${match}.`), [], targets.matches);
  }

  if (targetIndustries.length === 0) return categoryFit("industry", 0.65, ["No target-industry constraint is set."]);
  return categoryFit("industry", 0.5, [], ["Industry fit is unclear."]);
}

function parseSalaryAmounts(text: string) {
  const amounts = Array.from(text.matchAll(/\$?\s*(\d{2,3}(?:,\d{3})?|\d{2,3})\s*(k)?/gi))
    .map((match) => {
      const raw = Number(match[1].replace(/,/g, ""));
      if (!Number.isFinite(raw)) return undefined;
      return match[2] ? raw * 1000 : raw >= 10000 ? raw : raw * 1000;
    })
    .filter((value): value is number => Boolean(value && value >= 10000));
  if (amounts.length === 0) return {};
  return {
    min: Math.min(...amounts),
    max: Math.max(...amounts),
  };
}

export function scoreCompensationFit(profile: CandidateProfileAggregate, job: MatchJob): CategoryFit {
  const targetMin = profile.profile.targetCompensationMin;
  const targetPreferred = profile.profile.targetCompensationPreferred;
  const parsed = parseSalaryAmounts(job.compensationText ?? "");
  const jobMin = job.compensationMin ?? parsed.min;
  const jobMax = job.compensationMax ?? parsed.max;

  if (!targetMin) return categoryFit("compensation", 0.65, ["No compensation floor is set."]);
  if (!jobMin && !jobMax) return categoryFit("compensation", 0.55, [], ["Compensation is not posted."]);

  if (jobMax && jobMax < targetMin) {
    return categoryFit(
      "compensation",
      0.15,
      [],
      [`Compensation appears below the target floor of $${targetMin.toLocaleString("en-US")}.`],
      [],
      ["Below compensation target."],
    );
  }

  if (targetPreferred && jobMin && jobMin >= targetPreferred) {
    return categoryFit("compensation", 0.95, ["Posted compensation clears the preferred target."]);
  }

  return categoryFit("compensation", 0.78, ["Posted compensation appears workable."]);
}

function remoteExceptionFor(job: MatchJob, exceptions: CompanyRemoteException[]) {
  const company = normalize(job.companyName);
  return exceptions.find((exception) => normalize(exception.companyName) === company);
}

export function scoreLocationFit(
  profile: CandidateProfileAggregate,
  job: MatchJob,
  remoteExceptions: CompanyRemoteException[] = [],
): CategoryFit {
  const preference = profile.profile.remotePreference;
  const remoteType = normalize(job.remoteType ?? job.location ?? "");
  const exception = remoteExceptionFor(job, remoteExceptions);
  const exceptionBoost = exception?.remoteRiskReduction === "high" ? 0.25 : exception?.remoteRiskReduction === "medium" ? 0.15 : exception ? 0.08 : 0;
  const exceptionReason = exception ? [`Remote exception noted: ${exception.reason}.`] : [];

  if (!remoteType) return categoryFit("location", 0.55, exceptionReason, ["Location or remote status is unclear."]);

  if (preference === "remote_only") {
    if (remoteType.includes("remote")) return categoryFit("location", 0.95, ["Remote role matches remote-only preference.", ...exceptionReason]);
    if (remoteType.includes("hybrid")) return categoryFit("location", Math.min(0.65, 0.4 + exceptionBoost), exceptionReason, ["Hybrid role conflicts with remote-only preference."], [], ["Remote preference conflict."]);
    if (remoteType.includes("onsite")) return categoryFit("location", Math.min(0.45, 0.15 + exceptionBoost), exceptionReason, ["Onsite role conflicts with remote-only preference."], [], ["Remote preference conflict."]);
  }

  if (preference === "remote_preferred") {
    if (remoteType.includes("remote")) return categoryFit("location", 0.9, ["Remote role matches the preference.", ...exceptionReason]);
    if (remoteType.includes("hybrid")) return categoryFit("location", Math.min(0.8, 0.65 + exceptionBoost), ["Hybrid may still be workable.", ...exceptionReason]);
    if (remoteType.includes("onsite")) return categoryFit("location", Math.min(0.55, 0.35 + exceptionBoost), exceptionReason, ["Onsite is a poor fit for the stated remote preference."], [], ["Remote preference conflict."]);
  }

  if (preference === "hybrid_ok" && remoteType.includes("onsite")) {
    return categoryFit("location", 0.55, exceptionReason, ["Onsite may be a stretch for a hybrid-friendly profile."]);
  }

  return categoryFit("location", 0.8, ["Location preference looks workable.", ...exceptionReason]);
}

function watchlistPriorityScore(item: CompanyWatchlistItem) {
  if (item.priority === "high") return 0.95;
  if (item.priority === "medium") return 0.85;
  return 0.75;
}

export function scoreCompanyFit(profile: CandidateProfileAggregate, job: MatchJob): CategoryFit {
  const company = normalize(job.companyName);
  const avoided = (profile.preferences?.avoidCompanies ?? []).find((name) => normalize(name) === company);
  if (avoided) {
    return categoryFit(
      "company",
      0.1,
      [],
      [`Company appears on the avoid list: ${avoided}.`],
      [],
      ["Company avoid list."],
    );
  }

  const watched = profile.companyWatchlist.find((item) => normalize(item.companyName) === company);
  if (watched) {
    return categoryFit("company", watchlistPriorityScore(watched), [`Company watchlist match: ${watched.reason}.`], [], [watched.companyName]);
  }

  return categoryFit("company", 0.65, ["No company-specific risk is set."]);
}

export function scorePostingFreshness(job: MatchJob, evaluatedAt: string): CategoryFit {
  const dateText = job.postedAt ?? job.scrapedAt;
  if (!dateText) return categoryFit("posting_freshness", 0.55, [], ["Posting date is not available."]);

  const posted = Date.parse(dateText);
  const evaluated = Date.parse(evaluatedAt);
  if (!Number.isFinite(posted) || !Number.isFinite(evaluated)) {
    return categoryFit("posting_freshness", 0.55, [], ["Posting date could not be read."]);
  }

  const ageDays = Math.max(0, Math.floor((evaluated - posted) / 86_400_000));
  if (ageDays <= 3) return categoryFit("posting_freshness", 1, ["Fresh posting: 0-3 days old."]);
  if (ageDays <= 7) return categoryFit("posting_freshness", 0.85, ["Recent posting: 4-7 days old."]);
  if (ageDays <= 14) return categoryFit("posting_freshness", 0.65, ["Posting age is neutral."]);
  if (ageDays <= 30) return categoryFit("posting_freshness", 0.4, [], ["Posting is more than two weeks old."]);
  return categoryFit("posting_freshness", 0.2, [], ["Posting is more than 30 days old."]);
}

export function scoreApplyMethod(job: MatchJob): CategoryFit {
  if (job.applyMethod === "easy_apply") {
    return categoryFit("apply_method", 0.35, [], ["Easy Apply roles tend to attract more volume."]);
  }
  if (job.applyMethod === "direct") return categoryFit("apply_method", 0.8, ["Direct apply path is better than Easy Apply."]);
  return categoryFit("apply_method", 0.6, [], ["Apply method is unknown."]);
}

export function scoreAllCategories(input: {
  profile: CandidateProfileAggregate;
  job: MatchJob;
  evaluatedAt: string;
  remoteExceptions?: CompanyRemoteException[];
}) {
  return [
    scoreTitleFit(input.profile, input.job),
    scoreResponsibilityFit(input.profile, input.job),
    scoreWorkExampleFit(input.profile, input.job),
    scoreResumeFit(input.profile, input.job),
    scoreIndustryFit(input.profile, input.job),
    scoreCompensationFit(input.profile, input.job),
    scoreLocationFit(input.profile, input.job, input.remoteExceptions),
    scoreCompanyFit(input.profile, input.job),
    scorePostingFreshness(input.job, input.evaluatedAt),
    scoreApplyMethod(input.job),
  ];
}

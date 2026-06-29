import type { CandidateProfileAggregate, Resume, WorkExample } from "../types";
import {
  scoreSignalsAgainstText,
  scoreTrackAgainstJob,
  textForJob,
} from "./scorers";
import type {
  MatchConfidence,
  MatchJob,
  MatchRecommendations,
  ResumeRecommendation,
  RoleTrackRecommendation,
  WorkExampleRecommendation,
} from "./types";

function confidenceForScore(score: number): MatchConfidence {
  if (score >= 0.75) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

function resumeSignals(resume: Resume) {
  return [
    resume.name,
    resume.parsedText,
    ...resume.strengths,
    ...resume.useWhen,
  ];
}

function workExampleSignals(example: WorkExample) {
  return [
    example.title,
    example.oneHitter,
    example.context,
  ];
}

export function recommendRoleTrack(profile: CandidateProfileAggregate, job: MatchJob): RoleTrackRecommendation | undefined {
  const scored = profile.roleTracks
    .map((roleTrack) => ({ roleTrack, score: scoreTrackAgainstJob(roleTrack, job) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return undefined;

  const confidence = confidenceForScore(best.score);
  const reason = confidence === "high"
    ? `Strong alignment with ${best.roleTrack.name} title and responsibility signals.`
    : confidence === "medium"
      ? `Partial alignment with ${best.roleTrack.name}; worth reviewing before pursuing.`
      : `${best.roleTrack.name} is the closest Role Track, but the fit is thin.`;

  return {
    roleTrack: {
      id: best.roleTrack.id,
      name: best.roleTrack.name,
    },
    confidence,
    reason,
  };
}

export function recommendResume(
  profile: CandidateProfileAggregate,
  job: MatchJob,
  roleTrackId?: string,
): ResumeRecommendation | undefined {
  const jobText = textForJob(job);
  const scored = profile.resumes
    .map((resume) => {
      const textScore = scoreSignalsAgainstText(resumeSignals(resume), jobText);
      const roleTrackBoost = roleTrackId && resume.associatedRoleTrackIds.includes(roleTrackId) ? 0.3 : 0;
      return {
        resume,
        score: Math.min(1, textScore.score + roleTrackBoost),
        matches: textScore.matches,
      };
    })
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return undefined;

  const confidence = confidenceForScore(best.score);
  const matchedText = best.matches.length > 0
    ? ` It overlaps with ${best.matches.slice(0, 2).join(", ")}.`
    : "";
  return {
    resume: {
      id: best.resume.id,
      name: best.resume.name,
    },
    confidence,
    reason: `${best.resume.name} is the strongest available resume for this role.${matchedText}`.trim(),
  };
}

export function recommendWorkExamples(
  profile: CandidateProfileAggregate,
  job: MatchJob,
): { primary?: WorkExampleRecommendation; alternatives: WorkExampleRecommendation[] } {
  const jobText = textForJob(job);
  const scored = profile.workExamples
    .map((workExample) => {
      const relatedSkills = profile.skills.filter((skill) => skill.relatedWorkExampleIds.includes(workExample.id));
      const skillSignals = relatedSkills.flatMap((skill) => [skill.skillName, ...skill.evidence, ...skill.bestRoleFit]);
      const textScore = scoreSignalsAgainstText([...workExampleSignals(workExample), ...skillSignals], jobText);
      return {
        workExample,
        score: textScore.score,
        matches: textScore.matches,
      };
    })
    .sort((a, b) => b.score - a.score);

  const recommendations = scored
    .filter((item) => item.score > 0)
    .map((item): WorkExampleRecommendation => ({
      workExample: {
        id: item.workExample.id,
        title: item.workExample.title,
        oneHitter: item.workExample.oneHitter,
        link: item.workExample.link,
      },
      confidence: confidenceForScore(item.score),
      reason: item.matches.length > 0
        ? `Useful because it overlaps with ${item.matches.slice(0, 2).join(", ")}.`
        : "Closest available Work Example.",
    }));

  return {
    primary: recommendations[0],
    alternatives: recommendations.slice(1, 3),
  };
}

export function recommendMatchAssets(profile: CandidateProfileAggregate, job: MatchJob): MatchRecommendations {
  const roleTrack = recommendRoleTrack(profile, job);
  const resume = recommendResume(profile, job, roleTrack?.roleTrack.id);
  const workExamples = recommendWorkExamples(profile, job);

  return {
    roleTrack,
    resume,
    workExample: workExamples.primary,
    alternativeWorkExamples: workExamples.alternatives,
  };
}

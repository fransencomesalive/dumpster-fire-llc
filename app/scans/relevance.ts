import type { NormalizedConnectorJob } from "./connectors";
import { selectUniqueConnectorJobs } from "./dedupe";
import { evaluateConnectorJobMatch } from "./matching";
import type { MatchDecision, MatchingRuleConfig } from "./matching";
import { classifyOccupation, isOccupationSafetyBlocked } from "./occupation-classifier";
import type { Company, UserSearchProfile } from "./types";

export type RelevanceDecision = {
  included: boolean;
  reasons: string[];
  risks: string[];
  matchDecision: MatchDecision;
};

export type RelevanceFilterResult = {
  relevantJobs: NormalizedConnectorJob[];
  filteredOut: number;
  duplicatesFiltered: number;
  stretchCapped: number;
  decisions: Array<{
    externalJobId: string;
    title: string;
    included: boolean;
    reasons: string[];
    risks: string[];
    matchDecision: MatchDecision;
  }>;
};

export type RelevanceFilterOptions = {
  reservedDuplicateKeys?: Set<string>;
  matchingConfig?: MatchingRuleConfig;
  maxStretchJobsPerCompany?: number;
  disableOccupationSafetyBlock?: boolean;
};

export function evaluateConnectorJobRelevance(
  job: NormalizedConnectorJob,
  company: Company,
  profile: UserSearchProfile,
  config?: MatchingRuleConfig
): RelevanceDecision {
  const decision = evaluateConnectorJobMatch(job, company, profile, config);
  const sourceUrlRisk = inspectableSourceUrlRisk(job, company);

  if (decision.included && sourceUrlRisk) {
    const risks = [
      ...decision.risks,
      sourceUrlRisk,
    ];

    return {
      included: false,
      reasons: [
        ...decision.positives,
        ...decision.evidence,
        `role family: ${decision.roleFamily}`,
        `confidence: ${decision.confidence}`,
      ],
      risks,
      matchDecision: {
        ...decision,
        included: false,
        score: Math.min(37, decision.score),
        bucket: "skip",
        matchQuality: "bad",
        recommendedAction: "skip",
        fitSummary: `Excluded before ranking: ${sourceUrlRisk}.`,
        risks,
      },
    };
  }

  return {
    included: decision.included,
    reasons: [
      ...decision.positives,
      ...decision.evidence,
      `role family: ${decision.roleFamily}`,
      `confidence: ${decision.confidence}`,
    ],
    risks: decision.risks,
    matchDecision: decision,
  };
}

function sameUrl(firstUrl: string, secondUrl: string) {
  try {
    const first = new URL(firstUrl);
    const second = new URL(secondUrl);
    return first.origin === second.origin && first.pathname === second.pathname && first.search === second.search;
  } catch {
    return firstUrl.trim() === secondUrl.trim();
  }
}

function inspectableSourceUrlRisk(job: NormalizedConnectorJob, company: Company) {
  if (!job.sourceUrl.trim()) return "source URL missing";
  if (company.careersUrl.trim() && sameUrl(job.sourceUrl, company.careersUrl)) {
    return "source URL is source feed, not job posting";
  }
  return "";
}

export function filterConnectorJobsByRelevance(
  jobs: NormalizedConnectorJob[],
  company: Company,
  profile: UserSearchProfile,
  options: RelevanceFilterOptions = {}
): RelevanceFilterResult {
  const initialDecisions = jobs.map((job) => {
    const decision = evaluateConnectorJobRelevance(job, company, profile, options.matchingConfig);
    const occupationClassification = classifyOccupation({
      title: job.title,
      department: job.department,
      descriptionText: job.descriptionText,
      companyName: job.companyName,
      location: job.location,
      remoteType: job.remoteType,
      salaryText: job.salaryText,
      sourceKind: company.atsProvider,
      sourceName: company.companyName,
    });

    if (decision.included && !options.disableOccupationSafetyBlock && isOccupationSafetyBlocked(occupationClassification)) {
      const risks = [
        ...decision.risks,
        `occupation safety block: ${occupationClassification.lane}`,
      ];
      const evidence = [
        ...decision.matchDecision.evidence,
        ...occupationClassification.evidence.slice(0, 3).map((item) => `occupation ${item}`),
      ];

      return {
        externalJobId: job.externalJobId,
        title: job.title,
        included: false,
        reasons: decision.reasons,
        risks,
        matchDecision: {
          ...decision.matchDecision,
          included: false,
          score: Math.min(37, decision.matchDecision.score),
          bucket: "skip" as const,
          matchQuality: "bad" as const,
          recommendedAction: "skip" as const,
          fitSummary: `Excluded before ranking: occupation safety block (${occupationClassification.lane}).`,
          risks,
          evidence,
        },
      };
    }

    return {
      externalJobId: job.externalJobId,
      title: job.title,
      included: decision.included,
      reasons: decision.reasons,
      risks: decision.risks,
      matchDecision: decision.matchDecision,
    };
  });
  const relevantJobs = jobs.filter((job, index) => initialDecisions[index].included);
  const uniqueSelection = selectUniqueConnectorJobs(relevantJobs, options.reservedDuplicateKeys);
  const selectedJobDecisionByExternalId = new Map(
    initialDecisions.map((decision) => [decision.externalJobId, decision])
  );
  const stretchCap = options.maxStretchJobsPerCompany;
  const cappedSelection = typeof stretchCap === "number" && stretchCap >= 0
    ? selectStretchCappedJobs(uniqueSelection.selectedJobs, selectedJobDecisionByExternalId, stretchCap)
    : { selectedJobs: uniqueSelection.selectedJobs, cappedJobs: [] };
  const duplicateByExternalId = new Map(uniqueSelection.duplicateJobs.map((duplicate) => [duplicate.job.externalJobId, duplicate]));
  const stretchCappedByExternalId = new Map(cappedSelection.cappedJobs.map((job) => [job.externalJobId, job]));
  const decisions = initialDecisions.map((decision) => {
    const duplicate = duplicateByExternalId.get(decision.externalJobId);
    if (!duplicate) {
      const stretchCappedJob = stretchCappedByExternalId.get(decision.externalJobId);
      if (!stretchCappedJob) return decision;

      const risks = [
        ...decision.risks,
        `stretch cap for ${stretchCappedJob.companyName}`,
      ];

      return {
        ...decision,
        included: false,
        risks,
        matchDecision: {
          ...decision.matchDecision,
          included: false,
          score: Math.min(37, decision.matchDecision.score),
          bucket: "skip" as const,
          recommendedAction: "skip" as const,
          fitSummary: `Excluded before ranking: stretch cap for ${stretchCappedJob.companyName}.`,
          risks,
        },
      };
    }

    const risks = [
      ...decision.risks,
      `duplicate of ${duplicate.duplicateOfExternalJobId}`,
    ];

    return {
      ...decision,
      included: false,
      risks,
      matchDecision: {
        ...decision.matchDecision,
        included: false,
        score: Math.min(37, decision.matchDecision.score),
        bucket: "skip" as const,
        recommendedAction: "skip" as const,
        fitSummary: `Excluded before ranking: duplicate of ${duplicate.duplicateOfExternalJobId}.`,
        risks,
      },
    };
  });

  return {
    relevantJobs: cappedSelection.selectedJobs,
    filteredOut: jobs.length - cappedSelection.selectedJobs.length,
    duplicatesFiltered: uniqueSelection.duplicateJobs.length,
    stretchCapped: cappedSelection.cappedJobs.length,
    decisions,
  };
}

function selectStretchCappedJobs(
  jobs: NormalizedConnectorJob[],
  decisionsByExternalId: Map<string, { matchDecision: MatchDecision }>,
  maxStretchJobs: number
): { selectedJobs: NormalizedConnectorJob[]; cappedJobs: NormalizedConnectorJob[] } {
  const goodJobs = jobs.filter((job) => decisionsByExternalId.get(job.externalJobId)?.matchDecision.matchQuality !== "stretch");
  const stretchJobs = jobs
    .filter((job) => decisionsByExternalId.get(job.externalJobId)?.matchDecision.matchQuality === "stretch")
    .sort((firstJob, secondJob) => {
      const firstDecision = decisionsByExternalId.get(firstJob.externalJobId)?.matchDecision;
      const secondDecision = decisionsByExternalId.get(secondJob.externalJobId)?.matchDecision;
      return (secondDecision?.score ?? 0) - (firstDecision?.score ?? 0);
    });
  const selectedStretchJobs = stretchJobs.slice(0, maxStretchJobs);
  const cappedJobs = stretchJobs.slice(maxStretchJobs);
  const selectedExternalIds = new Set([...goodJobs, ...selectedStretchJobs].map((job) => job.externalJobId));

  return {
    selectedJobs: jobs.filter((job) => selectedExternalIds.has(job.externalJobId)),
    cappedJobs,
  };
}

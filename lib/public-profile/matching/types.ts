import type {
  CandidateProfileAggregate,
  Resume,
  RoleTrack,
  WorkExample,
} from "../types";

export type MatchLabel =
  | "Strong Match"
  | "Potential Match"
  | "Weak Match"
  | "Probably Not Worth Your Time";

export type MatchConfidence = "high" | "medium" | "low";

export type MatchCategory =
  | "title"
  | "responsibility"
  | "work_example"
  | "resume"
  | "industry"
  | "compensation"
  | "employment_type"
  | "location"
  | "company"
  | "posting_freshness"
  | "apply_method";

export type MatchApplyMethod = "direct" | "easy_apply" | "unknown";

export type MatchJob = {
  id?: string;
  title: string;
  companyName: string;
  description: string;
  location?: string;
  remoteType?: string;
  employmentType?: string;
  compensationText?: string;
  compensationMin?: number;
  compensationMax?: number;
  industry?: string;
  department?: string;
  postedAt?: string;
  scrapedAt?: string;
  sourceUrl?: string;
  applyUrl?: string;
  applyMethod?: MatchApplyMethod;
};

export type CompanyRemoteException = {
  companyName: string;
  remoteRiskReduction: "low" | "medium" | "high";
  reason: string;
};

export type MatchInput = {
  profile: CandidateProfileAggregate;
  job: MatchJob;
  evaluatedAt?: string;
  remoteExceptions?: CompanyRemoteException[];
};

export type CategoryFit = {
  category: MatchCategory;
  score: number;
  reasons: string[];
  risks: string[];
  matchedSignals: string[];
  softExclusions: string[];
};

export type RoleTrackRecommendation = {
  roleTrack: Pick<RoleTrack, "id" | "name">;
  confidence: MatchConfidence;
  reason: string;
};

export type ResumeRecommendation = {
  resume: Pick<Resume, "id" | "name">;
  confidence: MatchConfidence;
  reason: string;
};

export type WorkExampleRecommendation = {
  workExample: Pick<WorkExample, "id" | "title" | "oneHitter" | "link">;
  confidence: MatchConfidence;
  reason: string;
};

export type MatchRecommendations = {
  roleTrack?: RoleTrackRecommendation;
  resume?: ResumeRecommendation;
  workExample?: WorkExampleRecommendation;
  alternativeWorkExamples: WorkExampleRecommendation[];
};

export type MatchResult = {
  internalScore: number;
  label: MatchLabel;
  categoryFits: CategoryFit[];
  recommendations: MatchRecommendations;
  risks: string[];
  whyMatched: string[];
  whyNotMatched: string[];
  softExclusions: string[];
  explanation: string;
};

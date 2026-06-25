import type { NearMissReviewDecision, NearMissReviewDecisionValue } from "./types";

export type ReviewFitVerdict = "match" | "good" | "stretch" | "not_a_match";

export type ReviewSignalRoute =
  | "eligibility"
  | "compensation"
  | "occupation_lane"
  | "seniority"
  | "role_track"
  | "source_qa";

export type ReviewRationaleTone = "positive" | "concern" | "source";

export type ReviewRationaleChipValue =
  | "experience_match"
  | "seniority_match"
  | "seniority_acceptable"
  | "adjacent"
  | "seniority_mismatch"
  | "salary_too_low_for_scope_comp"
  | "location_timezone_country"
  | "hybrid_acceptable"
  | "hybrid_not_acceptable"
  | "in_office"
  | "wrong_title_position"
  | "wrong_function"
  | "wrong_industry"
  | "wrong_domain"
  | "too_technical"
  | "data_it_infra"
  | "people_recruiting_hr"
  | "security_legal_compliance"
  | "missing_available_salary"
  | "missing_available_responsibilities"
  | "missing_available_reqd_experience"
  | "missing_available_description";

export type ReviewRationaleChip = {
  value: ReviewRationaleChipValue;
  label: string;
  tone: ReviewRationaleTone;
};

export type ParsedReviewReason = {
  verdict: ReviewFitVerdict | null;
  rationale: ReviewRationaleChipValue[];
  note: string;
  format: "review" | "legacy_tags" | "plain";
};

export const reviewFitVerdicts: Array<{ value: ReviewFitVerdict; label: string }> = [
  { value: "match", label: "Match" },
  { value: "good", label: "Good" },
  { value: "stretch", label: "Stretch" },
  { value: "not_a_match", label: "Not a Match" },
];

export const reviewRationaleChips: ReviewRationaleChip[] = [
  { value: "experience_match", label: "Experience match", tone: "positive" },
  { value: "seniority_match", label: "Seniority match", tone: "positive" },
  { value: "seniority_acceptable", label: "Seniority acceptable", tone: "positive" },
  { value: "adjacent", label: "Adjacent", tone: "positive" },
  { value: "seniority_mismatch", label: "Seniority mismatch", tone: "concern" },
  { value: "salary_too_low_for_scope_comp", label: "Salary too low for scope / comp", tone: "concern" },
  { value: "location_timezone_country", label: "Location (different timezone or country)", tone: "concern" },
  { value: "hybrid_acceptable", label: "Hybrid acceptable", tone: "concern" },
  { value: "hybrid_not_acceptable", label: "Hybrid not acceptable", tone: "concern" },
  { value: "in_office", label: "In-Office", tone: "concern" },
  { value: "wrong_title_position", label: "Wrong title / position", tone: "concern" },
  { value: "wrong_function", label: "Wrong function", tone: "concern" },
  { value: "wrong_industry", label: "Wrong industry", tone: "concern" },
  { value: "wrong_domain", label: "Wrong Domain", tone: "concern" },
  { value: "too_technical", label: "Too Technical", tone: "concern" },
  { value: "data_it_infra", label: "Data / IT / Infra", tone: "concern" },
  { value: "people_recruiting_hr", label: "People / Recruiting / HR", tone: "concern" },
  { value: "security_legal_compliance", label: "Security / Legal / Compliance", tone: "concern" },
  { value: "missing_available_salary", label: "Missing available salary", tone: "source" },
  { value: "missing_available_responsibilities", label: "Missing available responsibilities", tone: "source" },
  { value: "missing_available_reqd_experience", label: "Missing available Req'd Experience", tone: "source" },
  { value: "missing_available_description", label: "Missing available Description", tone: "source" },
];

const verdictValues = new Set<ReviewFitVerdict>(reviewFitVerdicts.map((verdict) => verdict.value));
const rationaleValues = new Set<ReviewRationaleChipValue>(reviewRationaleChips.map((chip) => chip.value));
const rationaleByValue = new Map(reviewRationaleChips.map((chip) => [chip.value, chip]));
const verdictByValue = new Map(reviewFitVerdicts.map((verdict) => [verdict.value, verdict]));

const legacyTagToRationale: Partial<Record<string, ReviewRationaleChipValue>> = {
  strong_role_fit: "experience_match",
  responsibilities_match: "experience_match",
  seniority_match: "seniority_match",
  stretch_adjacent: "adjacent",
  wrong_function: "wrong_function",
  wrong_domain: "wrong_domain",
  too_technical: "too_technical",
  data_it_infra: "data_it_infra",
  people_recruiting: "people_recruiting_hr",
  security_legal_compliance: "security_legal_compliance",
  seniority_mismatch: "seniority_mismatch",
  location_remote_issue: "location_timezone_country",
  compensation_issue: "salary_too_low_for_scope_comp",
  thin_or_malformed_posting: "missing_available_description",
  bad_responsibility_scrape: "missing_available_responsibilities",
  bad_experience_scrape: "missing_available_reqd_experience",
  missing_detail_scrape: "missing_available_description",
};

const rationaleChipRoutes: Record<ReviewRationaleChipValue, ReviewSignalRoute> = {
  experience_match: "role_track",
  seniority_match: "seniority",
  seniority_acceptable: "seniority",
  adjacent: "role_track",
  seniority_mismatch: "seniority",
  salary_too_low_for_scope_comp: "compensation",
  location_timezone_country: "eligibility",
  hybrid_acceptable: "eligibility",
  hybrid_not_acceptable: "eligibility",
  in_office: "eligibility",
  wrong_title_position: "occupation_lane",
  wrong_function: "occupation_lane",
  wrong_industry: "occupation_lane",
  wrong_domain: "occupation_lane",
  too_technical: "occupation_lane",
  data_it_infra: "occupation_lane",
  people_recruiting_hr: "occupation_lane",
  security_legal_compliance: "occupation_lane",
  missing_available_salary: "source_qa",
  missing_available_responsibilities: "source_qa",
  missing_available_reqd_experience: "source_qa",
  missing_available_description: "source_qa",
};

export function routeForReviewRationale(chip: ReviewRationaleChipValue): ReviewSignalRoute {
  return rationaleChipRoutes[chip];
}

export function isReviewFitVerdict(value: unknown): value is ReviewFitVerdict {
  return typeof value === "string" && verdictValues.has(value as ReviewFitVerdict);
}

export function isReviewRationaleChipValue(value: unknown): value is ReviewRationaleChipValue {
  return typeof value === "string" && rationaleValues.has(value as ReviewRationaleChipValue);
}

export function labelForReviewVerdict(verdict: ReviewFitVerdict) {
  return verdictByValue.get(verdict)?.label ?? verdict;
}

export function labelForReviewRationale(chip: ReviewRationaleChipValue) {
  return rationaleByValue.get(chip)?.label ?? chip;
}

export function legacyDecisionForReviewVerdict(verdict: ReviewFitVerdict): NearMissReviewDecisionValue {
  return verdict === "not_a_match" ? "not_for_me" : "approve";
}

export function fallbackVerdictForLegacyDecision(decision: NearMissReviewDecisionValue): ReviewFitVerdict {
  return decision === "approve" ? "good" : "not_a_match";
}

function uniqueRationale(values: ReviewRationaleChipValue[]) {
  const seen = new Set<ReviewRationaleChipValue>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function parseLegacyTags(reason: string): ParsedReviewReason | null {
  const match = reason.match(/^\[tags:\s*([^\]]+)\]\s*/i);
  if (!match) return null;

  const rationale = uniqueRationale(match[1]
    .split(",")
    .map((tag) => legacyTagToRationale[tag.trim()])
    .filter((tag): tag is ReviewRationaleChipValue => Boolean(tag)));

  const hasStretchSignal = match[1].split(",").some((tag) => tag.trim() === "stretch_adjacent");

  return {
    verdict: hasStretchSignal ? "stretch" : null,
    rationale,
    note: reason.slice(match[0].length).trim(),
    format: "legacy_tags",
  };
}

export function parseReviewReason(reason: string): ParsedReviewReason {
  let rest = reason.trim();
  let verdict: ReviewFitVerdict | null = null;
  let rationale: ReviewRationaleChipValue[] = [];

  const verdictMatch = rest.match(/^\[verdict:\s*([a-z_]+)\]\s*/i);
  if (verdictMatch) {
    const value = verdictMatch[1] as ReviewFitVerdict;
    verdict = isReviewFitVerdict(value) ? value : null;
    rest = rest.slice(verdictMatch[0].length).trim();
  }

  const rationaleMatch = rest.match(/^\[rationale:\s*([^\]]*)\]\s*/i);
  if (rationaleMatch) {
    rationale = uniqueRationale(rationaleMatch[1]
      .split(",")
      .map((chip) => chip.trim())
      .filter(isReviewRationaleChipValue));
    rest = rest.slice(rationaleMatch[0].length).trim();
  }

  if (verdict || rationale.length > 0) {
    return {
      verdict,
      rationale,
      note: rest,
      format: "review",
    };
  }

  return parseLegacyTags(reason) ?? {
    verdict: null,
    rationale: [],
    note: reason.trim(),
    format: "plain",
  };
}

const exactReasonTranslations: Record<string, string> = {
  "title family not confirmed": "Title didn't match your target role patterns",
  "resume track not confirmed": "Posting shows little overlap with your role tracks",
  "title family unconfirmed; keep out of matcher-pass batch": "",
  "remote status unclear": "Remote status not stated",
  "remote status not listed": "Remote status not stated",
  "stretch title signal": "Adjacent title (stretch)",
  "compensation may be low": "Salary may be below target",
  "compensation not listed": "Salary not posted",
  "no responsibility/authority evidence": "No seniority/scope evidence in posting",
  "junior/seniority mismatch": "Junior-level signals in title",
  "do-not-apply company": "Do-not-apply company",
  "onsite location": "Onsite required",
  "hybrid location": "Hybrid listed",
  "older than 14 days": "Posted more than 2 weeks ago",
  "remote role": "Remote role",
  "content-led review evidence": "Content looks relevant despite title",
  "currently served as a stretch match": "Currently served as a stretch match",
  "has responsibility/profile evidence but title family failed": "Relevant responsibilities, but title didn't match",
  "has target industry or remote signal": "Target industry or remote signal",
  "source calibration candidate from a board with too few review examples": "Included to calibrate this source",
};

const prefixReasonTranslations: Array<{ prefix: string; label: string }> = [
  { prefix: "hard exclude title family: ", label: "Excluded lane: " },
  { prefix: "profile wrong lane: ", label: "Wrong lane: " },
  { prefix: "negative title signal: ", label: "Avoid-list title term: " },
  { prefix: "negative content signal: ", label: "Avoid-list term in posting: " },
  { prefix: "hard remote constraint: not eligible for US-based candidates", label: "Not eligible for US-based candidates" },
  { prefix: "hard remote constraint: onsite posting", label: "Onsite required" },
  { prefix: "hard remote constraint: location-specific posting", label: "Location-specific posting, remote unstated" },
  { prefix: "hard remote constraint: stretch title requires confirmed remote posting", label: "Adjacent title needs a confirmed-remote posting" },
  { prefix: "hard compensation constraint: posted maximum below floor", label: "Posted salary below your floor" },
  { prefix: "remote risk: listed as hybrid", label: "Hybrid listed; remote exception unknown" },
  { prefix: "remote status unclear for ", label: "Remote status unclear for " },
  { prefix: "location restricted to ", label: "Restricted to " },
  { prefix: "location restriction: ", label: "Restricted to " },
  { prefix: "required qualification mismatch: ", label: "Required qualifications don't match: " },
  { prefix: "possible qualification mismatch: ", label: "Some required qualifications may not match: " },
  { prefix: "track weak signal: ", label: "Weak-fit signals: " },
  { prefix: "role family: ", label: "Role family: " },
  { prefix: "profile evidence: ", label: "Profile keywords: " },
  { prefix: "resume evidence: ", label: "Resume keywords: " },
  { prefix: "resume track: ", label: "Matches track: " },
  { prefix: "authority evidence: ", label: "Scope/seniority terms: " },
  { prefix: "some authority evidence: ", label: "Some scope/seniority terms: " },
  { prefix: "industry evidence: ", label: "Industry terms: " },
  { prefix: "title evidence: ", label: "Title terms: " },
  { prefix: "track title: ", label: "Track title terms: " },
  { prefix: "track responsibility: ", label: "Track responsibility terms: " },
  { prefix: "track context: ", label: "Track context terms: " },
  { prefix: "duplicate of ", label: "Duplicate posting" },
  { prefix: "stretch cap for ", label: "Held back by stretch serving cap" },
  { prefix: "occupation safety block: ", label: "Occupation lane blocked: " },
  { prefix: "confidence: ", label: "" },
  { prefix: "compensation clears floor", label: "Salary clears your floor" },
];

export function humanizeMatcherReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) return "";

  const exact = exactReasonTranslations[trimmed.toLowerCase()];
  if (exact !== undefined) return exact;

  for (const { prefix, label } of prefixReasonTranslations) {
    if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
      if (!label) return "";
      if (label.endsWith(": ") || label.endsWith("for ") || label.endsWith("to ")) {
        return `${label}${trimmed.slice(prefix.length)}`;
      }
      return label;
    }
  }

  return trimmed;
}

export function humanizeMatcherReasons(reasons: string[]): string[] {
  const seen = new Set<string>();
  return reasons
    .map(humanizeMatcherReason)
    .filter((reason) => {
      if (!reason) return false;
      const key = reason.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export type StructuredReviewDecision = NearMissReviewDecision & {
  verdict: ReviewFitVerdict;
  verdictSource: "review" | "legacy_tags" | "legacy_decision";
  rationale: ReviewRationaleChipValue[];
  note: string;
  routes: ReviewSignalRoute[];
  sourceQaOnly: boolean;
};

export function structureReviewDecision(decision: NearMissReviewDecision): StructuredReviewDecision {
  const parsed = parseReviewReason(decision.reason);
  const verdict = parsed.verdict ?? fallbackVerdictForLegacyDecision(decision.decision);
  const verdictSource = parsed.verdict
    ? (parsed.format === "legacy_tags" ? "legacy_tags" as const : "review" as const)
    : "legacy_decision" as const;
  const routes = Array.from(new Set(parsed.rationale.map(routeForReviewRationale)));
  const sourceQaOnly = parsed.rationale.length > 0 && routes.every((route) => route === "source_qa");

  return {
    ...decision,
    verdict,
    verdictSource,
    rationale: parsed.rationale,
    note: parsed.note,
    routes,
    sourceQaOnly,
  };
}

export function structureReviewDecisions(decisions: NearMissReviewDecision[]): StructuredReviewDecision[] {
  return decisions.map(structureReviewDecision);
}

export function serializeReviewReason(input: {
  verdict: ReviewFitVerdict;
  rationale: ReviewRationaleChipValue[];
  note: string;
}) {
  const verdict = `[verdict: ${input.verdict}]`;
  const rationale = uniqueRationale(input.rationale).length > 0
    ? `[rationale: ${uniqueRationale(input.rationale).join(", ")}]`
    : "";
  const metadata = `${verdict}${rationale}`;
  const availableNoteLength = Math.max(0, 500 - metadata.length - (input.note.trim() ? 1 : 0));
  const note = input.note.trim().slice(0, availableNoteLength);

  return [metadata, note].filter(Boolean).join(" ");
}

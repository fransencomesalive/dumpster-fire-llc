export type LocationEligibility = {
  status: "compatible" | "conflict" | "unknown";
  candidateCountries: string[];
  jobCountries: string[];
  reason?: string;
};

const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL",
  "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT",
  "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

const CANADIAN_PROVINCE_CODES = new Set([
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
]);

const COUNTRY_ALIASES = new Map<string, string>([
  ["us", "US"],
  ["u s", "US"],
  ["u s a", "US"],
  ["usa", "US"],
  ["united states of america", "US"],
  ["uk", "GB"],
  ["u k", "GB"],
  ["uae", "AE"],
  ["u a e", "AE"],
  ["south korea", "KR"],
  ["north korea", "KP"],
  ["russia", "RU"],
  ["vietnam", "VN"],
]);

const AMBIGUOUS_COUNTRY_NAMES = new Set([
  "georgia",
  "jordan",
]);

function normalize(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesPhrase(content: string, phrase: string) {
  const normalizedPhrase = normalize(phrase);
  return Boolean(normalizedPhrase && ` ${content} `.includes(` ${normalizedPhrase} `));
}

function countryNames() {
  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
  const entries: Array<{ code: string; name: string }> = [];
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first, second);
      const name = displayNames.of(code);
      if (!name || name === code || name === "Unknown Region") continue;
      const normalizedName = normalize(name);
      if (!normalizedName || AMBIGUOUS_COUNTRY_NAMES.has(normalizedName)) continue;
      entries.push({ code, name: normalizedName });
    }
  }
  return entries.sort((first, second) => second.name.length - first.name.length);
}

const COUNTRY_NAMES = countryNames();

function subdivisionCountry(value: string) {
  const code = value.match(/(?:^|,)\s*([A-Z]{2})(?=\s*(?:,|$))/)?.[1];
  if (code && US_STATE_CODES.has(code)) return "US";
  if (code && CANADIAN_PROVINCE_CODES.has(code)) return "CA";
  return undefined;
}

export function inferCountryCodes(value: string | undefined) {
  if (!value?.trim()) return [];
  const normalized = normalize(value);
  const countries = new Set<string>();
  const subdivision = subdivisionCountry(value);
  if (subdivision) countries.add(subdivision);

  for (const [alias, code] of COUNTRY_ALIASES) {
    if (includesPhrase(normalized, alias)) countries.add(code);
  }
  for (const entry of COUNTRY_NAMES) {
    if (includesPhrase(normalized, entry.name)) countries.add(entry.code);
  }

  const trailingCode = value.trim().match(/(?:^|[,/|()\-]\s*)([A-Z]{2})\s*$/)?.[1];
  if (
    trailingCode
    && !US_STATE_CODES.has(trailingCode)
    && !CANADIAN_PROVINCE_CODES.has(trailingCode)
    && COUNTRY_NAMES.some((entry) => entry.code === trailingCode)
  ) {
    countries.add(trailingCode);
  }

  return [...countries].sort();
}

function countryLabels(codes: string[]) {
  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
  return codes.map((code) => displayNames.of(code) ?? code);
}

export function assessLocationEligibility(
  candidateLocation: string | undefined,
  jobLocation: string | undefined,
): LocationEligibility {
  const candidateCountries = inferCountryCodes(candidateLocation);
  const jobCountries = inferCountryCodes(jobLocation);
  if (jobCountries.length === 0 || candidateCountries.length === 0) {
    return { status: "unknown", candidateCountries, jobCountries };
  }
  if (candidateCountries.some((country) => jobCountries.includes(country))) {
    return { status: "compatible", candidateCountries, jobCountries };
  }

  const allowed = countryLabels(jobCountries).join(" or ");
  return {
    status: "conflict",
    candidateCountries,
    jobCountries,
    reason: `posting eligibility is limited to ${allowed}, which conflicts with the profile location`,
  };
}

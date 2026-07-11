// Ported from the legacy `app/scans/connectors.ts` engine, retyped against the neutral app-owned
// `JobSource`/`NormalizedConnectorJob` shapes so the public product can run the full connector
// suite (all providers, salary/HTML extraction, normalization) without importing the legacy
// system. Preview/diff helpers from the legacy module are intentionally omitted; the public
// ingestion path upserts directly into the public `jobs` table and matches at scan time.
import type {
  ConnectorPlan,
  EmploymentType,
  JobSource,
  NormalizedConnectorJob,
  RemoteType,
  SourceProvider,
} from "./types";

export type { ConnectorPlan, NormalizedConnectorJob } from "./types";

const normalizationFields = [
  "externalJobId",
  "title",
  "location",
  "department",
  "remoteType",
  "employmentType",
  "salary",
  "descriptionText",
  "applyUrl",
  "sourceUrl",
];

const guardrails = [
  "No login-only pages",
  "No credential storage",
  "No auto-apply behavior",
  "No profile scraping",
  "Dedupe by company, provider, and external job ID",
  "Mark missing roles closed instead of deleting",
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asRoundedSalaryNumber(value: unknown) {
  const amount = asNumber(value);
  return amount === undefined ? undefined : Math.round(amount);
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const cleanValue = asString(value);
    if (cleanValue) return cleanValue;
  }
  return "";
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
}

export function textFromHtml(value: string) {
  // Decode twice: several ATS feeds (e.g. Greenhouse `content`) return
  // entity-encoded HTML, so an original `&nbsp;` arrives double-encoded as
  // `&amp;nbsp;`. One pass yields a literal `&nbsp;` that survives tag-stripping;
  // the second pass resolves it before whitespace is normalized.
  return decodeHtmlEntities(decodeHtmlEntities(value))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|li|ul|ol|h[1-6]|section|article|div|tr)>/gi, "\n")
    .replace(/<(?:p|li|ul|ol|h[1-6]|section|article|div|tr|td|th)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function stripHtml(value: string) {
  return textFromHtml(value);
}

function inferRemoteType(content: string): RemoteType {
  const lower = content.toLowerCase();
  if (/\b(fully remote|100% remote|remote[- ]first|work from anywhere|work from home|remote role)\b/.test(lower)) return "remote";
  if (/\bhybrid\b/.test(lower)) return "hybrid";
  if (/\b(onsite|on-site|on site|in-office|in office)\b/.test(lower)) return "onsite";
  if (/\bremote\b/.test(lower) && !/\b(not remote|non[- ]remote|no remote)\b/.test(lower)) return "remote";
  return "unclear";
}

function inferRemoteTypeFromFields(title: string, location: string, description: string): RemoteType {
  const fieldSignal = inferRemoteType(`${title} ${location}`);
  if (fieldSignal !== "unclear") return fieldSignal;
  return inferRemoteType(description);
}

function inferEmploymentType(content: string): EmploymentType {
  const lower = content.toLowerCase();
  if (lower.includes("contract")) return "contract";
  if (lower.includes("freelance")) return "freelance";
  return "full-time";
}

function salaryTextFromRange(min?: number, max?: number) {
  if (min && max && Math.max(min, max) < ANNUAL_SALARY_MIN) return `$${Math.round(min)}-$${Math.round(max)}`;
  if (min && max) return `$${Math.round(min / 1000)}k-$${Math.round(max / 1000)}k`;
  if (min && min < ANNUAL_SALARY_MIN) return `$${Math.round(min)}+`;
  if (min) return `$${Math.round(min / 1000)}k+`;
  if (max && max < ANNUAL_SALARY_MIN) return `Up to $${Math.round(max)}`;
  if (max) return `Up to $${Math.round(max / 1000)}k`;
  return "";
}

// --- Salary extraction (used by the normalizers below and the live-scan hydration pass) ---------
// Pull salary out of source payloads we already fetched (Greenhouse/Lever/Ashby content, html
// JSON-LD), and — for surfaced jobs whose source gave none — out of the posting page itself
// (`fetchPostingSalary`). Below ANNUAL_MIN a value is treated as hourly/per-unit and kept as
// display text only, never fed to the annual below-floor gate (mirrors matching.ts's >= 10000
// guard so a monthly/hourly figure cannot be mistaken for a low annual salary).
export type ParsedSalary = {
  salaryText: string;
  salaryMin?: number;
  salaryMax?: number;
};

const EMPTY_SALARY: ParsedSalary = { salaryText: "" };
const ANNUAL_SALARY_MIN = 10000;
const ANNUAL_SALARY_UNITS = new Set(["", "year", "yearly", "annum", "annual", "yr", "p.a.", "pa"]);

function salaryNumberFrom(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const numeric = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return undefined;
}

// "$150,000" | "150k" | "$150K" | "150000" -> 150000
function salaryAmountToNumber(token: string): number | undefined {
  const cleaned = token.trim().toLowerCase().replace(/[$,\s]/g, "");
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(k)?$/);
  if (!match) return undefined;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(match[2] ? value * 1000 : value);
}

function annualSalaryOnly(value: number | undefined, unit: string): number | undefined {
  if (value === undefined) return undefined;
  if (ANNUAL_SALARY_UNITS.has(unit)) return value >= ANNUAL_SALARY_MIN ? Math.round(value) : undefined;
  return undefined;
}

function formatSalaryAmount(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

// Parse a free-text salary string ("$120,000 - $150,000", "$120k–$150k", "120000 to 150000").
export function salaryRangeFromText(text: string): ParsedSalary {
  if (!text) return EMPTY_SALARY;

  const token = "(\\d{2,3}(?:,\\d{3})+|\\d{2,3}\\.?\\d?k|\\d{5,7})";
  const rangeMatch = text.match(new RegExp(`\\$?\\s?${token}\\s?(?:-|–|—|to)\\s?\\$?\\s?${token}`, "i"));
  if (rangeMatch) {
    const min = salaryAmountToNumber(rangeMatch[1]);
    const max = salaryAmountToNumber(rangeMatch[2]);
    return {
      salaryText: rangeMatch[0].replace(/\s+/g, " ").trim(),
      salaryMin: min !== undefined && min >= ANNUAL_SALARY_MIN ? min : undefined,
      salaryMax: max !== undefined && max >= ANNUAL_SALARY_MIN ? max : undefined,
    };
  }

  // A single value must carry a $ so we never grab a bare requisition id or headcount.
  const singleMatch = text.match(/\$\s?(\d{2,3}(?:,\d{3})+|\d{2,3}\.?\d?k)/i);
  if (singleMatch) {
    const value = salaryAmountToNumber(singleMatch[1]);
    const annual = value !== undefined && value >= ANNUAL_SALARY_MIN ? value : undefined;
    return { salaryText: singleMatch[0].replace(/\s+/g, " ").trim(), salaryMin: annual, salaryMax: annual };
  }

  return EMPTY_SALARY;
}

// schema.org JobPosting baseSalary / estimatedSalary node.
export function salaryFromJsonLdNode(node: unknown): ParsedSalary {
  const record = asRecord(node);
  const base = asRecord(record.baseSalary ?? record.estimatedSalary);
  if (Object.keys(base).length === 0) return EMPTY_SALARY;

  const valueNode = base.value && typeof base.value === "object" ? asRecord(base.value) : base;
  const unit = String(valueNode.unitText ?? base.unitText ?? "").toLowerCase();
  const rawMin = salaryNumberFrom(valueNode.minValue) ?? salaryNumberFrom(valueNode.value);
  const rawMax = salaryNumberFrom(valueNode.maxValue) ?? salaryNumberFrom(valueNode.value);
  if (rawMin === undefined && rawMax === undefined) return EMPTY_SALARY;

  const unitLabel = unit && !ANNUAL_SALARY_UNITS.has(unit) ? ` / ${unit}` : "";
  let salaryText = "";
  if (rawMin && rawMax && rawMax !== rawMin) {
    salaryText = `${formatSalaryAmount(rawMin)} - ${formatSalaryAmount(rawMax)}${unitLabel}`;
  } else {
    const single = Math.max(rawMin ?? 0, rawMax ?? 0);
    if (single > 0) salaryText = `${formatSalaryAmount(single)}${unitLabel}`;
  }
  if (!salaryText) return EMPTY_SALARY;

  return {
    salaryText,
    salaryMin: annualSalaryOnly(rawMin, unit),
    salaryMax: annualSalaryOnly(rawMax ?? rawMin, unit),
  };
}

function salaryFromParsedJsonLd(value: unknown): ParsedSalary {
  if (!value || typeof value !== "object") return EMPTY_SALARY;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = salaryFromParsedJsonLd(item);
      if (found.salaryText) return found;
    }
    return EMPTY_SALARY;
  }
  const record = value as Record<string, unknown>;
  const direct = salaryFromJsonLdNode(record);
  if (direct.salaryText) return direct;
  for (const key of ["@graph", "itemListElement", "mainEntity"]) {
    const found = salaryFromParsedJsonLd(record[key]);
    if (found.salaryText) return found;
  }
  return EMPTY_SALARY;
}

// Scan raw HTML for <script type="application/ld+json"> JobPosting salary.
export function salaryFromJsonLdHtml(rawHtml: string): ParsedSalary {
  const blocks = rawHtml.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    try {
      const found = salaryFromParsedJsonLd(JSON.parse(decodeHtmlEntities(block[1]).trim()));
      if (found.salaryText) return found;
    } catch {
      continue;
    }
  }
  return EMPTY_SALARY;
}

// Salary from already-stripped posting body text.
export function salaryFromBodyText(text: string): ParsedSalary {
  return salaryRangeFromText(text);
}

// Hydration: fetch a single surfaced posting page and extract salary. JSON-LD first (reliable
// numbers for the matcher gate), body-text fallback for display. Returns null on any failure so a
// salary fetch can never hard-fail the scan.
export async function fetchPostingSalary(
  sourceUrl: string,
  options: { timeoutMs?: number } = {}
): Promise<ParsedSalary | null> {
  if (!/^https?:\/\//i.test(sourceUrl)) return null;
  try {
    const response = await fetch(sourceUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain",
        "User-Agent": "The Job Market Is a Dumpster Fire scan QA (manual private scan)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
    });
    if (!response.ok) return null;
    if (!/html|text\/plain/i.test(response.headers.get("content-type") ?? "")) return null;

    const rawBody = await response.text();
    const fromJsonLd = salaryFromJsonLdHtml(rawBody);
    if (fromJsonLd.salaryText) return fromJsonLd;
    const fromBody = salaryFromBodyText(textFromHtml(rawBody));
    return fromBody.salaryText ? fromBody : null;
  } catch {
    return null;
  }
}

function isHtmlProvider(provider: SourceProvider) {
  return provider === "html" || provider === "icims" || provider === "magnit";
}

function isCareersUrlProvider(provider: SourceProvider) {
  return isHtmlProvider(provider) || provider === "workday";
}

function extractJobArray(payload: unknown, provider: SourceProvider): unknown[] {
  if (provider === "html" && typeof payload === "string") return parseHtmlJobs(payload, undefined);
  if (provider === "icims" && typeof payload === "string") return parseIcimsJobs(payload, "");
  if (provider === "magnit" && typeof payload === "string") return parseMagnitJobs(payload, "");
  if (Array.isArray(payload)) return payload;

  const raw = asRecord(payload);
  const candidates = provider === "lever"
    ? [raw.postings, raw.jobs, raw.data]
    : provider === "workday"
      ? [raw.jobPostings, raw.jobs, raw.postings, raw.data]
    : [raw.jobs, raw.postings, raw.data, raw.results];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function absoluteUrl(href: string, baseUrl: string) {
  try {
    return new URL(href, baseUrl || "https://example.com").toString();
  } catch {
    return href;
  }
}

function titleFromSlug(value: string) {
  return value
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
    .replace(/\bAi\b/g, "AI")
    .replace(/\bUsa\b/g, "USA")
    .trim();
}

function companyNameFromSourceUrl(sourceUrl: string) {
  try {
    const parsedUrl = new URL(sourceUrl);
    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    const companySlugIndex = pathParts.findIndex((part) => part === "companies");
    const companySlug = companySlugIndex >= 0 ? pathParts[companySlugIndex + 1] : "";

    if (parsedUrl.hostname.includes("himalayas.app") && companySlug) {
      return titleFromSlug(companySlug);
    }
  } catch {
  }

  return "";
}

function isGeneratedSourceCompanyName(value: string) {
  return /broad job board/i.test(value);
}

function withQueryParam(url: string, key: string, value: string) {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set(key, value);
    return parsedUrl.toString();
  } catch {
    return url;
  }
}

function buildWorkdayEndpoint(company: JobSource) {
  try {
    const url = new URL(company.careersUrl);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const siteFromUrl = pathParts.find((part) => part.toLowerCase() !== "en-us" && part.toLowerCase() !== "en") ?? "";
    const [tenantFromToken, siteFromToken] = company.atsBoardToken.split("/").map((part) => part.trim()).filter(Boolean);
    const tenant = tenantFromToken || url.hostname.split(".")[0];
    const site = siteFromToken || siteFromUrl;

    if (!tenant || !site) return "";

    return `${url.origin}/wday/cxs/${tenant}/${site}/jobs`;
  } catch {
    return "";
  }
}

function workdaySitePath(company: JobSource) {
  try {
    const url = new URL(company.careersUrl);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const [, siteFromToken] = company.atsBoardToken.split("/").map((part) => part.trim()).filter(Boolean);
    const site = siteFromToken || pathParts.find((part) => part.toLowerCase() !== "en-us" && part.toLowerCase() !== "en") || "";
    return site ? `/${site}` : "";
  } catch {
    return "";
  }
}

function collectJsonLdJobPostings(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectJsonLdJobPostings);

  const record = value as Record<string, unknown>;
  const typeValue = record["@type"];
  const types = Array.isArray(typeValue) ? typeValue : [typeValue];
  const matchesJobPosting = types.some((type) => typeof type === "string" && type.toLowerCase() === "jobposting");
  const nested = ["@graph", "itemListElement", "mainEntity"].flatMap((key) => collectJsonLdJobPostings(record[key]));

  return matchesJobPosting ? [record, ...nested] : nested;
}

function textFromJsonLdLocation(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textFromJsonLdLocation).filter(Boolean).join(", ");

  const record = asRecord(value);
  const address = asRecord(record.address);
  return [
    asString(address.addressLocality),
    asString(address.addressRegion),
    asString(address.addressCountry),
    asString(record.name),
  ].filter(Boolean).join(", ");
}

function parseJsonLdJobs(html: string) {
  const matches = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));

  return matches.flatMap((match) => {
    try {
      const nodes = collectJsonLdJobPostings(JSON.parse(decodeHtmlEntities(match[1]).trim()));
      // Carry the schema.org baseSalary forward so normalizeHtmlJob (which reads salaryMin/Max/Text)
      // keeps it instead of discarding it. This is salary already in the page we fetched.
      return nodes.map((node) => {
        const salary = salaryFromJsonLdNode(node);
        if (!salary.salaryText) return node;
        return { ...node, salaryText: salary.salaryText, salaryMin: salary.salaryMin, salaryMax: salary.salaryMax };
      });
    } catch {
      return [];
    }
  });
}

function parseAnchorJobs(html: string, baseUrl = "") {
  const links = Array.from(html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));
  const titleHints = /(producer|production|creative|program|operations|manager|director|lead|designer|content|brand|studio)/i;

  return links.flatMap((match) => {
    const href = decodeHtmlEntities(match[1]).trim();
    const title = stripHtml(decodeHtmlEntities(match[2]));
    const normalizedTitle = title.replace(/\s+/g, " ").trim();

    if (!href || normalizedTitle.length < 4 || normalizedTitle.length > 120 || !titleHints.test(normalizedTitle)) {
      return [];
    }

    return [{
      id: absoluteUrl(href, baseUrl),
      title: normalizedTitle,
      sourceUrl: absoluteUrl(href, baseUrl),
      applyUrl: absoluteUrl(href, baseUrl),
      location: "",
      department: "",
      descriptionText: normalizedTitle,
    }];
  });
}

function parseWeWorkRemotelyJobs(html: string, baseUrl = "") {
  const cards = Array.from(html.matchAll(/<li[^>]+class=["'][^"']*feature[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi));

  return cards.flatMap((card) => {
    const cardHtml = card[1];
    const linkMatch = cardHtml.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) return [];

    const href = decodeHtmlEntities(linkMatch[1]).trim();
    const sourceUrl = absoluteUrl(href, baseUrl);
    const title = stripHtml(cardHtml.match(/<span[^>]+class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "");
    const companyName = stripHtml(cardHtml.match(/<span[^>]+class=["'][^"']*company[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "");
    const region = stripHtml(cardHtml.match(/<span[^>]+class=["'][^"']*region[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "");

    if (!title || !sourceUrl) return [];

    return [{
      id: sourceUrl,
      title,
      companyName,
      sourceUrl,
      applyUrl: sourceUrl,
      location: region || "Remote",
      department: "",
      descriptionText: stripHtml(cardHtml),
    }];
  });
}

function parseJobListingItemJobs(html: string, baseUrl = "") {
  const cards = Array.from(html.matchAll(/<div[^>]+class=["'][^"']*job-listing-item[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi));

  return cards.flatMap((card) => {
    const cardHtml = card[1];
    const linkMatch = cardHtml.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/i);
    const title = stripHtml(cardHtml.match(/<p[^>]+class=["'][^"']*job-listing-item-title[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
    const department = stripHtml(cardHtml.match(/<p[^>]+class=["'][^"']*job-listing-item-dept[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
    const location = stripHtml(cardHtml.match(/<p[^>]+class=["'][^"']*job-listing-item-loc[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
    const descriptionText = stripHtml(cardHtml.match(/<p[^>]+class=["'][^"']*job-listing-item-desc[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
    const sourceUrl = linkMatch ? absoluteUrl(decodeHtmlEntities(linkMatch[1]).trim(), baseUrl) : "";

    if (!title || !sourceUrl) return [];

    return [{
      id: sourceUrl,
      title,
      sourceUrl,
      applyUrl: sourceUrl,
      location,
      department,
      descriptionText: descriptionText || `${title} ${department} ${location}`.trim(),
    }];
  });
}

function parseIcimsJobs(html: string, baseUrl: string) {
  const cards = Array.from(html.matchAll(/<li[^>]+class=["'][^"']*iCIMS_JobCardItem[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi));
  const cardRows = cards.flatMap((card) => {
    const cardHtml = card[1];
    const linkMatch = cardHtml.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) return [];

    const href = decodeHtmlEntities(linkMatch[1]).trim();
    const title = stripHtml(decodeHtmlEntities(linkMatch[2]).replace(/Job Title \(external facing\)/gi, ""));
    const jobId = stripHtml(cardHtml.match(/<dt[^>]*>\s*Job ID\s*<\/dt>\s*<dd[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "");
    const location = stripHtml(cardHtml.match(/<span[^>]*class=["']sr-only field-label["']>\s*Job Locations\s*<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "");
    const sourceUrl = absoluteUrl(href, baseUrl);

    if (!title || !sourceUrl) return [];

    return [{
      id: jobId || sourceUrl,
      title,
      sourceUrl,
      applyUrl: sourceUrl,
      location,
      department: "",
      descriptionText: `${title} ${location}`.trim(),
    }];
  });

  if (cardRows.length > 0) return cardRows;

  return parseAnchorJobs(html, baseUrl);
}

function parseMagnitJobs(html: string, baseUrl: string) {
  const titleMatches = Array.from(html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*job-title[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi));

  return titleMatches.map((match, index) => {
    const href = decodeHtmlEntities(match[1]).trim();
    const title = stripHtml(decodeHtmlEntities(match[2]));
    const start = match.index ?? 0;
    const end = titleMatches[index + 1]?.index ?? html.length;
    const cardHtml = html.slice(start, end);
    const applyMatch = cardHtml.match(/<a\s+[^>]*href=["']([^"']*job-apply\/view\?id=[^"']+)["'][^>]*>/i);
    const categoryMatch = cardHtml.match(/<small[^>]*class=["'][^"']*info-text[^"']*["'][^>]*>([\s\S]*?)<\/small>/i);
    const locationMatches = Array.from(cardHtml.matchAll(/<span[^>]*class=["'][^"']*info-text[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi));
    const postedMatch = cardHtml.match(/Posted:\s*([^<]+)/i);
    const location = locationMatches
      .map((locationMatch) => stripHtml(decodeHtmlEntities(locationMatch[1])))
      .find((value) => /\(|remote|hybrid|on-site|onsite|[A-Z][a-z]+,\s*[A-Z]/i.test(value)) ?? "";
    const sourceUrl = absoluteUrl(href, baseUrl);
    const applyUrl = applyMatch ? absoluteUrl(decodeHtmlEntities(applyMatch[1]).trim(), baseUrl) : sourceUrl;

    return {
      id: href.match(/\/jobs\/([^/?#]+)/)?.[1] || applyMatch?.[1]?.match(/id=([^&#]+)/)?.[1] || sourceUrl,
      title,
      location,
      department: categoryMatch ? stripHtml(decodeHtmlEntities(categoryMatch[1])) : "",
      descriptionText: stripHtml(decodeHtmlEntities(cardHtml)),
      sourceUrl,
      applyUrl,
      postedOn: postedMatch ? postedMatch[1].trim() : "",
    };
  }).filter((job) => job.title && job.sourceUrl);
}

function tagText(itemXml: string, tag: string) {
  const match = itemXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return "";
  return decodeHtmlEntities(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
}

export function parseRssJobs(xml: string): unknown[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

  return items.map((itemXml) => {
    const rawTitle = tagText(itemXml, "title");
    const link = tagText(itemXml, "link");
    const separatorIndex = rawTitle.indexOf(": ");
    const companyName = separatorIndex > 0 ? rawTitle.slice(0, separatorIndex).trim() : "";
    const title = separatorIndex > 0 ? rawTitle.slice(separatorIndex + 2).trim() : rawTitle;
    const location = [tagText(itemXml, "region"), tagText(itemXml, "country")].filter(Boolean).join(", ");

    return {
      id: link || rawTitle,
      title,
      companyName,
      location,
      department: tagText(itemXml, "category"),
      employmentType: tagText(itemXml, "type"),
      description: tagText(itemXml, "description"),
      sourceUrl: link,
      applyUrl: link,
    };
  }).filter((job) => job.title && job.sourceUrl);
}

export function parseRipplingJobs(html: string, baseUrl: string): unknown[] {
  const nextDataMatch = html.match(/__NEXT_DATA__[^>]*>([\s\S]*?)<\/script>/);
  if (!nextDataMatch) return [];

  try {
    const data = JSON.parse(nextDataMatch[1].slice(nextDataMatch[1].indexOf("{")));
    const queries: unknown[] = (data?.props?.pageProps?.dehydratedState?.queries ?? []) as unknown[];

    for (const query of queries) {
      const items = (query as { state?: { data?: { items?: unknown[] } } })?.state?.data?.items;
      if (!Array.isArray(items) || items.length === 0) continue;

      const jobs = items
        .map((item) => {
          const raw = asRecord(item);
          const title = asString(raw.name);
          const jobUrl = asString(raw.url);
          if (!title || !jobUrl) return null;

          const locations = Array.isArray(raw.locations) ? raw.locations.map(asRecord) : [];
          const locationText = locations
            .map((loc) => [asString(loc.city), asString(loc.state), asString(loc.country)].filter(Boolean).join(", ") || asString(loc.name))
            .filter(Boolean)
            .join(" | ");
          const workplaceTypes = locations.map((loc) => asString(loc.workplaceType)).filter(Boolean).join(" ");
          const department = asString(asRecord(raw.department).name) || asString(raw.department);

          return {
            id: asString(raw.id) || jobUrl,
            title,
            location: [locationText, workplaceTypes].filter(Boolean).join(" "),
            department,
            description: "",
            sourceUrl: absoluteUrl(jobUrl, baseUrl),
            applyUrl: absoluteUrl(jobUrl, baseUrl),
          };
        })
        .filter((job): job is NonNullable<typeof job> => Boolean(job));

      if (jobs.length > 0) return jobs;
    }
  } catch {
    return [];
  }

  return [];
}

export function parseHtmlJobs(html: string, company?: JobSource): unknown[] {
  if (/^\s*<\?xml/i.test(html) && /<rss\b/i.test(html)) {
    const rssJobs = parseRssJobs(html);
    if (rssJobs.length > 0) return rssJobs;
  }

  if (company?.careersUrl.includes("ats.rippling.com")) {
    const ripplingJobs = parseRipplingJobs(html, company.careersUrl);
    if (ripplingJobs.length > 0) return ripplingJobs;
  }

  if (company?.careersUrl.includes("weworkremotely.com")) {
    const weWorkRemotelyJobs = parseWeWorkRemotelyJobs(html, company.careersUrl);
    if (weWorkRemotelyJobs.length > 0) return weWorkRemotelyJobs;
  }

  const jsonLdJobs = parseJsonLdJobs(html);
  if (jsonLdJobs.length > 0) return jsonLdJobs;

  const listingItemJobs = parseJobListingItemJobs(html, company?.careersUrl);
  if (listingItemJobs.length > 0) return listingItemJobs;

  return parseAnchorJobs(html, company?.careersUrl);
}

export function parseProviderHtmlJobs(html: string, company: JobSource): unknown[] {
  if (company.atsProvider === "icims") return parseIcimsJobs(html, company.careersUrl);
  if (company.atsProvider === "magnit") return parseMagnitJobs(html, company.careersUrl);
  return parseHtmlJobs(html, company);
}

export function buildConnectorPlan(company: JobSource): ConnectorPlan {
  const warnings: string[] = [];
  const needsToken = !isCareersUrlProvider(company.atsProvider);
  const needsCareersUrl = isCareersUrlProvider(company.atsProvider);
  const hasPlaceholderWebsite = company.websiteUrl.includes("example.com");
  const hasPlaceholderCareers = company.careersUrl.includes("example.com");

  if (needsToken && !company.atsBoardToken) warnings.push("Missing board token.");
  if (needsCareersUrl && !company.careersUrl) warnings.push("Missing careers URL.");
  if (company.atsProvider === "workday" && company.careersUrl && !buildWorkdayEndpoint(company)) warnings.push("Unable to infer Workday endpoint from careers URL.");
  if (needsToken && hasPlaceholderWebsite) warnings.push("Company website is placeholder; verify board token before live fetch.");
  if (needsCareersUrl && hasPlaceholderCareers) warnings.push("Careers URL is placeholder.");

  const endpoints: Record<SourceProvider, string> = {
    greenhouse: company.atsBoardToken
      ? `https://boards-api.greenhouse.io/v1/boards/${company.atsBoardToken}/jobs?content=true`
      : "",
    lever: company.atsBoardToken
      ? `https://api.lever.co/v0/postings/${company.atsBoardToken}?mode=json`
      : "",
    ashby: company.atsBoardToken
      ? `https://api.ashbyhq.com/posting-api/job-board/${company.atsBoardToken}`
      : "",
    icims: company.careersUrl ? withQueryParam(company.careersUrl, "in_iframe", "1") : "",
    workday: buildWorkdayEndpoint(company),
    magnit: company.careersUrl,
    html: company.careersUrl,
  };

  return {
    companyId: company.id,
    companyName: company.companyName,
    provider: company.atsProvider,
    requestLabel: isHtmlProvider(company.atsProvider)
      ? "Careers page parse"
      : company.atsProvider === "workday"
        ? "Workday public CXS API"
        : "Public job-board API",
    endpointUrl: endpoints[company.atsProvider],
    canPreview: warnings.length === 0,
    requiredFields: isCareersUrlProvider(company.atsProvider) ? ["careersUrl"] : ["atsBoardToken"],
    normalizationFields,
    guardrails,
    warnings,
  };
}

export function normalizeGreenhouseJob(rawJob: unknown, company: JobSource): NormalizedConnectorJob {
  const raw = asRecord(rawJob);
  const location = asRecord(raw.location);
  const title = asString(raw.title);
  const content = stripHtml(asString(raw.content));
  const locationName = asString(location.name);
  // Greenhouse returns the full posting body (content=true); pull any pay range out of it.
  const salary = salaryFromBodyText(content);

  return {
    companyId: company.id,
    externalJobId: String(raw.id ?? raw.absolute_url ?? title),
    sourceProvider: "greenhouse",
    sourceUrl: asString(raw.absolute_url),
    applyUrl: asString(raw.absolute_url),
    title,
    companyName: company.companyName,
    location: locationName,
    remoteType: inferRemoteTypeFromFields(title, locationName, content),
    employmentType: inferEmploymentType(`${title} ${content}`),
    department: asString(asRecord(raw.departments).name),
    salaryMin: salary.salaryMin,
    salaryMax: salary.salaryMax,
    salaryText: salary.salaryText,
    descriptionText: content,
    rawPayload: rawJob,
  };
}

export function normalizeLeverJob(rawJob: unknown, company: JobSource): NormalizedConnectorJob {
  const raw = asRecord(rawJob);
  const categories = asRecord(raw.categories);
  const title = asString(raw.text);
  const location = asString(categories.location);
  const description = stripHtml(`${asString(raw.description)}\n${asString(raw.descriptionPlain)}`);
  // Lever sometimes exposes a structured salaryRange; otherwise scan the posting body. Only trust
  // the structured range when it is annual-sized so an hourly figure can't break the $k formatter
  // or the annual below-floor gate.
  const salaryRange = asRecord(raw.salaryRange);
  const structuredMin = asNumber(salaryRange.min);
  const structuredMax = asNumber(salaryRange.max);
  const hasAnnualRange = (structuredMin ?? 0) >= 10000 || (structuredMax ?? 0) >= 10000;
  const salary = hasAnnualRange
    ? { salaryText: salaryTextFromRange(structuredMin, structuredMax), salaryMin: structuredMin, salaryMax: structuredMax }
    : salaryFromBodyText(description);

  return {
    companyId: company.id,
    externalJobId: asString(raw.id) || asString(raw.hostedUrl) || title,
    sourceProvider: "lever",
    sourceUrl: asString(raw.hostedUrl),
    applyUrl: asString(raw.applyUrl) || asString(raw.hostedUrl),
    title,
    companyName: company.companyName,
    location,
    remoteType: inferRemoteTypeFromFields(title, location, description),
    employmentType: inferEmploymentType(`${title} ${description}`),
    department: asString(categories.team) || asString(categories.department),
    salaryMin: salary.salaryMin,
    salaryMax: salary.salaryMax,
    salaryText: salary.salaryText,
    descriptionText: description,
    rawPayload: rawJob,
  };
}

export function normalizeAshbyJob(rawJob: unknown, company: JobSource): NormalizedConnectorJob {
  const raw = asRecord(rawJob);
  const title = asString(raw.title);
  const location = asString(raw.location) || asString(asRecord(raw.location).name);
  const description = stripHtml(asString(raw.descriptionHtml) || asString(raw.description));
  // Ashby's posting API exposes a compensation tier summary string (e.g. "$120K – $150K");
  // fall back to the posting body when it is absent.
  const compensation = asRecord(raw.compensation);
  const tierSummary = asString(compensation.compensationTierSummary) || asString(raw.compensationTierSummary);
  const salary = tierSummary ? salaryRangeFromText(tierSummary) : salaryFromBodyText(description);

  return {
    companyId: company.id,
    externalJobId: asString(raw.id) || asString(raw.jobId) || title,
    sourceProvider: "ashby",
    sourceUrl: asString(raw.jobUrl) || asString(raw.hostedUrl),
    applyUrl: asString(raw.applyUrl) || asString(raw.jobUrl) || asString(raw.hostedUrl),
    title,
    companyName: company.companyName,
    location,
    remoteType: inferRemoteTypeFromFields(title, location, description),
    employmentType: inferEmploymentType(`${title} ${description}`),
    department: asString(raw.department),
    salaryMin: salary.salaryMin,
    salaryMax: salary.salaryMax,
    salaryText: salary.salaryText,
    descriptionText: description,
    rawPayload: rawJob,
  };
}

export function normalizeWorkdayJob(rawJob: unknown, company: JobSource): NormalizedConnectorJob {
  const raw = asRecord(rawJob);
  const title = asString(raw.title);
  const externalPath = asString(raw.externalPath);
  const sourceUrl = externalPath ? absoluteUrl(`${workdaySitePath(company)}${externalPath}`, company.careersUrl) : company.careersUrl;
  const bulletFields = Array.isArray(raw.bulletFields) ? raw.bulletFields.map(asString).filter(Boolean) : [];
  // CXS list rows often carry location only in bulletFields alongside the requisition ID.
  const bulletLocation = bulletFields.filter((field) => !/^[A-Z]{1,3}\d{4,}/.test(field)).join(", ");
  const location = asString(raw.locationsText) || bulletLocation;
  const description = stripHtml([
    title,
    location,
    asString(raw.postedOn),
    bulletFields.join(" "),
  ].filter(Boolean).join(" "));

  return {
    companyId: company.id,
    externalJobId: asString(raw.id) || externalPath || sourceUrl || `${company.id}-${title}`,
    sourceProvider: "workday",
    sourceUrl,
    applyUrl: sourceUrl,
    title,
    companyName: company.companyName,
    location,
    remoteType: inferRemoteTypeFromFields(title, location, description),
    employmentType: inferEmploymentType(`${title} ${description}`),
    department: "",
    salaryText: "",
    descriptionText: description,
    rawPayload: rawJob,
  };
}

export function normalizeHtmlJob(rawJob: unknown, company: JobSource): NormalizedConnectorJob {
  const raw = asRecord(rawJob);
  const rawCompany = asRecord(raw.company);
  const rawCategory = asRecord(raw.category);
  const rawJobType = asRecord(raw.job_type);
  const locationRestrictions = asStringArray(raw.locationRestrictions).join(", ");
  const tags = asStringArray(raw.tags).join(", ");
  const title = firstString(raw.title, raw.position);
  const location = firstString(raw.location, raw.locations, raw.candidate_required_location, raw.region, locationRestrictions) || textFromJsonLdLocation(raw.jobLocation);
  const description = stripHtml(firstString(raw.descriptionText, raw.description, raw.description_html, raw.excerpt, raw.content));
  const fieldSalaryText = firstString(raw.salaryText, raw.salary);
  const fieldSalaryMin = asRoundedSalaryNumber(raw.salaryMin) ?? asRoundedSalaryNumber(raw.salary_min) ?? asRoundedSalaryNumber(raw.minSalary);
  const fieldSalaryMax = asRoundedSalaryNumber(raw.salaryMax) ?? asRoundedSalaryNumber(raw.salary_max) ?? asRoundedSalaryNumber(raw.maxSalary);
  // Fall back to a pay range printed in the posting body when no structured salary field is present.
  const bodySalary = !fieldSalaryText && fieldSalaryMin === undefined && fieldSalaryMax === undefined
    ? salaryFromBodyText(description)
    : { salaryText: "", salaryMin: undefined as number | undefined, salaryMax: undefined as number | undefined };
  const salaryMin = fieldSalaryMin ?? bodySalary.salaryMin;
  const salaryMax = fieldSalaryMax ?? bodySalary.salaryMax;
  const sourceUrl = firstString(raw.sourceUrl, raw.url, raw.job_url, raw.apply_url, raw.applicationUrl, raw.applicationLink, raw.guid) || company.careersUrl;
  const applyUrl = firstString(raw.applyUrl, raw.apply_url, raw.applicationUrl, raw.applicationLink) || sourceUrl;
  const rawSourceCompanyName = firstString(raw.companyName, rawCompany.name, raw.company_name, raw.company);
  const sourceCompanyName = isGeneratedSourceCompanyName(rawSourceCompanyName)
    ? companyNameFromSourceUrl(sourceUrl)
    : firstString(rawSourceCompanyName, companyNameFromSourceUrl(sourceUrl));
  const employmentType = firstString(raw.employmentType, raw.employment_type, raw.type, raw.job_type, rawJobType.name);
  const department = firstString(raw.department, raw.category, rawCategory.name, tags);

  return {
    companyId: company.id,
    externalJobId: firstString(raw.id, raw.slug, raw.guid) || sourceUrl || `${company.id}-${title}`,
    sourceProvider: company.atsProvider,
    sourceUrl,
    applyUrl,
    title,
    companyName: sourceCompanyName || company.companyName,
    location,
    remoteType: inferRemoteTypeFromFields(title, location, description),
    employmentType: inferEmploymentType(`${title} ${description} ${employmentType}`),
    department,
    salaryMin,
    salaryMax,
    salaryText: fieldSalaryText || bodySalary.salaryText || salaryTextFromRange(salaryMin, salaryMax),
    descriptionText: description,
    rawPayload: rawJob,
  };
}

export function normalizeConnectorJob(rawJob: unknown, company: JobSource): NormalizedConnectorJob {
  if (company.atsProvider === "greenhouse") return normalizeGreenhouseJob(rawJob, company);
  if (company.atsProvider === "lever") return normalizeLeverJob(rawJob, company);
  if (company.atsProvider === "ashby") return normalizeAshbyJob(rawJob, company);
  if (company.atsProvider === "workday") return normalizeWorkdayJob(rawJob, company);
  return normalizeHtmlJob(rawJob, company);
}

export function normalizeAdzunaPayload(payload: unknown, company: JobSource): NormalizedConnectorJob[] {
  const results = asRecord(payload).results;
  if (!Array.isArray(results)) return [];

  return results
    .map((result) => {
      const raw = asRecord(result);
      const title = asString(raw.title).replace(/<[^>]*>/g, "");
      const sourceUrl = asString(raw.redirect_url);
      if (!title || !sourceUrl) return null;

      const salaryIsPredicted = asString(raw.salary_is_predicted) === "1";
      const salaryMin = salaryIsPredicted ? undefined : asRoundedSalaryNumber(raw.salary_min);
      const salaryMax = salaryIsPredicted ? undefined : asRoundedSalaryNumber(raw.salary_max);
      const contractTime = asString(raw.contract_time);
      const contractType = asString(raw.contract_type);
      const rawJob = {
        id: asString(raw.id) || sourceUrl,
        title,
        companyName: asString(asRecord(raw.company).display_name),
        location: asString(asRecord(raw.location).display_name),
        department: asString(asRecord(raw.category).label),
        employmentType: contractType === "contract" ? "contract" : contractTime === "part_time" ? "contract" : "full-time",
        salaryMin,
        salaryMax,
        description: asString(raw.description),
        sourceUrl,
        applyUrl: sourceUrl,
      };

      return normalizeConnectorJob(rawJob, company);
    })
    .filter((job): job is NormalizedConnectorJob => Boolean(job && job.externalJobId && job.title));
}

export function normalizeWorkablePayload(payload: unknown, company: JobSource): NormalizedConnectorJob[] {
  const jobs = asRecord(payload).jobs;
  if (!Array.isArray(jobs)) return [];

  return jobs
    .map((job) => {
      const raw = asRecord(job);
      const title = asString(raw.title);
      const sourceUrl = asString(raw.url) || asString(raw.shortlink);
      if (!title || !sourceUrl) return null;

      const telecommuting = raw.telecommuting === true || asString(raw.telecommuting) === "true";
      const locationParts = [asString(raw.city), asString(raw.state), asString(raw.country)].filter(Boolean).join(", ");
      const rawJob = {
        id: asString(raw.shortcode) || sourceUrl,
        title,
        companyName: company.companyName,
        location: telecommuting ? ["Remote", locationParts].filter(Boolean).join(" - ") : locationParts,
        department: asString(raw.department) || asString(raw.function),
        employmentType: asString(raw.employment_type),
        description: asString(raw.description),
        sourceUrl,
        applyUrl: asString(raw.application_url) || sourceUrl,
      };

      return normalizeConnectorJob(rawJob, company);
    })
    .filter((job): job is NormalizedConnectorJob => Boolean(job && job.externalJobId && job.title));
}

export function normalizeWorkableAggregatePayload(payload: unknown, company: JobSource): NormalizedConnectorJob[] {
  const jobs = asRecord(payload).jobs;
  if (!Array.isArray(jobs)) return [];

  return jobs
    .map((job) => {
      const raw = asRecord(job);
      const title = asString(raw.title);
      const sourceUrl = asString(raw.url);
      if (!title || !sourceUrl) return null;

      const location = asRecord(raw.location);
      const locationText = [asString(location.city), asString(location.subregion), asString(location.countryName)].filter(Boolean).join(", ");
      const isRemote = asString(raw.workplace).toLowerCase() === "remote";
      const rawJob = {
        id: asString(raw.id) || sourceUrl,
        title,
        companyName: asString(asRecord(raw.company).title),
        location: isRemote ? ["Remote", locationText].filter(Boolean).join(" - ") : locationText,
        department: asString(raw.department),
        employmentType: asString(raw.employmentType),
        description: [asString(raw.description), asString(raw.requirementsSection)].filter(Boolean).join("\n"),
        sourceUrl,
        applyUrl: sourceUrl,
      };

      return normalizeConnectorJob(rawJob, company);
    })
    .filter((job): job is NormalizedConnectorJob => Boolean(job && job.externalJobId && job.title));
}

export function normalizeConnectorPayload(payload: unknown, company: JobSource): NormalizedConnectorJob[] {
  if (company.careersUrl.includes("api.adzuna.com/")) {
    return normalizeAdzunaPayload(payload, company);
  }

  if (company.careersUrl.includes("jobs.workable.com/api/")) {
    return normalizeWorkableAggregatePayload(payload, company);
  }

  if (company.careersUrl.includes("apply.workable.com/api/")) {
    return normalizeWorkablePayload(payload, company);
  }

  const rows = isHtmlProvider(company.atsProvider) && typeof payload === "string"
    ? parseProviderHtmlJobs(payload, company)
    : extractJobArray(payload, company.atsProvider);

  return rows
    .map((rawJob) => normalizeConnectorJob(rawJob, company))
    .filter((job) => job.externalJobId && job.title);
}

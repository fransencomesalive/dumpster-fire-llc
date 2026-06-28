import skillsCatalogue from "./skills.json";
import industriesCatalogue from "./industries.json";
import locationsCatalogue from "./locations.json";

export type CatalogueMetadata = {
  generatedAt: string;
  source: {
    name: string;
    url: string;
    license: string;
    attribution?: string;
    notes?: string[];
  };
  recordCount: number;
};

export type SkillCatalogueRecord = {
  id: string;
  name: string;
  type: string;
  category: string;
  subcategory: string;
};

export type IndustryCatalogueRecord = {
  id: string;
  label: string;
  sector: string;
  hierarchy: string[];
  description: string;
};

export type LocationCatalogueRecord = {
  id: string;
  name: string;
  asciiName: string;
  country: "US" | "CA" | "MX";
  admin1: string;
  latitude: number;
  longitude: number;
  population: number;
  timezone: string;
  displayName: string;
};

export type SkillSearchResult = SkillCatalogueRecord & {
  label: string;
};

export type IndustrySearchResult = IndustryCatalogueRecord & {
  label: string;
};

export type LocationSearchResult = LocationCatalogueRecord & {
  label: string;
};

type SearchableRecord<T> = {
  record: T;
  label: string;
  terms: string[];
  population?: number;
};

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const skills = skillsCatalogue.records as SkillCatalogueRecord[];
const industries = industriesCatalogue.records as IndustryCatalogueRecord[];
const locations = locationsCatalogue.records as LocationCatalogueRecord[];

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactLimit(limit?: number) {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function scoreTerms(terms: string[], query: string) {
  let bestScore = 0;
  for (const term of terms) {
    if (!term) continue;
    if (term === query) bestScore = Math.max(bestScore, 100);
    else if (term.startsWith(query)) bestScore = Math.max(bestScore, 80);
    else if (term.includes(` ${query}`)) bestScore = Math.max(bestScore, 60);
    else if (term.includes(query)) bestScore = Math.max(bestScore, 40);
  }
  return bestScore;
}

function search<T>(
  records: SearchableRecord<T>[],
  query: string,
  limit?: number,
) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  return records
    .map((item) => ({
      ...item,
      score: scoreTerms(item.terms, normalizedQuery),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((b.population ?? 0) !== (a.population ?? 0)) {
        return (b.population ?? 0) - (a.population ?? 0);
      }
      return a.label.localeCompare(b.label);
    })
    .slice(0, compactLimit(limit))
    .map(({ record, label }) => ({ ...record, label }));
}

const searchableSkills: SearchableRecord<SkillCatalogueRecord>[] = skills.map((record) => ({
  record,
  label: record.name,
  terms: [
    normalize(record.name),
    normalize(record.category),
    normalize(record.subcategory),
  ],
}));

const searchableIndustries: SearchableRecord<IndustryCatalogueRecord>[] = industries.map((record) => ({
  record,
  label: record.label,
  terms: [
    normalize(record.label),
    normalize(record.sector),
    normalize(record.hierarchy.join(" ")),
  ],
}));

const searchableLocations: SearchableRecord<LocationCatalogueRecord>[] = locations.map((record) => ({
  record,
  label: record.displayName,
  terms: [
    normalize(record.name),
    normalize(record.asciiName),
    normalize(record.displayName),
    normalize(`${record.name} ${record.country}`),
    normalize(`${record.name} ${record.admin1}`),
  ],
  population: record.population,
}));

export function searchSkills(query: string, limit?: number): SkillSearchResult[] {
  return search(searchableSkills, query, limit);
}

export function searchIndustries(query: string, limit?: number): IndustrySearchResult[] {
  return search(searchableIndustries, query, limit);
}

export function searchLocations(query: string, limit?: number): LocationSearchResult[] {
  return search(searchableLocations, query, limit);
}

export function getCatalogueMetadata() {
  return {
    skills: skillsCatalogue.metadata as CatalogueMetadata,
    industries: industriesCatalogue.metadata as CatalogueMetadata,
    locations: locationsCatalogue.metadata as CatalogueMetadata,
  };
}

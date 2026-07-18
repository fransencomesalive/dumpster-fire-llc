import type { Company, UserSearchProfile } from "./types";

export type SearchSourceKind = "broad_job_board" | "targeted_company_careers";

export type ConnectedSearchSource = {
  sourceKind: SearchSourceKind;
  company: Company;
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function isMagnitDirectSourcingBoard(company: Company) {
  try {
    const url = new URL(company.careersUrl);
    return url.hostname === "directsource.magnitglobal.com" && url.pathname.toLowerCase().includes("/us/magnitds/jobs");
  } catch {
    return false;
  }
}

export function sourceQueryVariants(profile?: UserSearchProfile) {
  const titleTerms = (profile?.targetTitles ?? []).map((term) => term.trim()).filter(Boolean);
  const fallbackTerms = [
    "executive producer",
    "creative producer",
    "senior producer",
    "director of production",
    "head of production",
    "creative operations",
    "studio operations",
    "brand operations",
    "production operations",
    "launch operations",
    "strategic operations",
    "program director",
    "senior program manager",
    "creative program manager",
    "design program manager",
    "product operations",
    "delivery lead",
    "ai enablement",
  ];
  const variants = [
    ...fallbackTerms,
    ...titleTerms,
  ];
  const seen = new Set<string>();
  const output: string[] = [];

  for (const variant of variants) {
    const normalized = normalize(variant);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(variant);
    if (output.length >= 20) break;
  }

  return output;
}

function remotiveQueryVariants(profile?: UserSearchProfile) {
  const variants = sourceQueryVariants(profile);
  const compactVariants = [
    "producer",
    "production director",
    "program director",
    "creative operations",
    "ai enablement",
  ];
  const preferred = compactVariants.filter((compact) => variants.some((variant) => normalize(variant).includes(normalize(compact)) || normalize(compact).includes(normalize(variant))));

  return preferred.length > 0 ? preferred : compactVariants.slice(0, 3);
}

function sourceIdPart(value: string) {
  return normalize(value).replace(/\s+/g, "-");
}

function sourceLabelPart(value: string) {
  return value
    .split(/\s+/)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function generatedBroadSources(profile?: UserSearchProfile): Company[] {
  const queryVariants = sourceQueryVariants(profile);
  const now = "";
  const himalayasVariantSources = queryVariants.map((variant): Company => {
    const encodedVariant = encodeURIComponent(variant);
    const idPart = sourceIdPart(variant);
    const labelPart = sourceLabelPart(variant);

    return {
      id: `generated-broad-himalayas-${idPart}`,
      companyName: `Himalayas Broad Job Board - ${labelPart}`,
      websiteUrl: "https://himalayas.app",
      careersUrl: `https://himalayas.app/jobs/api/search?q=${encodedVariant}&sort=recent&page=1`,
      atsProvider: "html",
      atsBoardToken: "",
      industryBucket: "Broad job board",
      remoteLikelihood: 95,
      notes: `broad job board generated source; public jobs API; profile-query variant "${variant}"; feeds unified matching flow`,
      status: "active",
      lastSuccessfulScan: now,
    };
  });

  const remotiveVariantSources = remotiveQueryVariants(profile).map((variant): Company => {
    const idPart = sourceIdPart(variant);
    const labelPart = sourceLabelPart(variant);

    return {
      id: `generated-broad-remotive-${idPart}`,
      companyName: `Remotive Broad Job Board - ${labelPart}`,
      websiteUrl: "https://remotive.com",
      careersUrl: `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(variant)}`,
      atsProvider: "html",
      atsBoardToken: "",
      industryBucket: "Broad job board",
      remoteLikelihood: 95,
      notes: `broad job board generated source; public remote-jobs API; profile-query variant "${variant}"; feeds unified matching flow`,
      status: "active",
      lastSuccessfulScan: now,
    };
  });

  // Credentials are appended at fetch time from env; careersUrl must never carry the key.
  const adzunaConfigured = Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
  const adzunaVariantSources: Company[] = adzunaConfigured
    ? queryVariants.map((variant): Company => {
        const idPart = sourceIdPart(variant);
        const labelPart = sourceLabelPart(variant);

        return {
          id: `generated-broad-adzuna-${idPart}`,
          companyName: `Adzuna Broad Job Board - ${labelPart}`,
          websiteUrl: "https://www.adzuna.com",
          careersUrl: `https://api.adzuna.com/v1/api/jobs/us/search/1?title_only=${encodeURIComponent(variant)}&what_and=remote&results_per_page=25&sort_by=date&max_days_old=30`,
          atsProvider: "html",
          atsBoardToken: "",
          industryBucket: "Broad job board",
          remoteLikelihood: 80,
          notes: `broad job board generated source; keyed Adzuna search API; profile-query variant "${variant}"; feeds unified matching flow`,
          status: "active",
          lastSuccessfulScan: now,
        };
      })
    : [];

  const workableVariantSources: Company[] = queryVariants.map((variant): Company => {
    const idPart = sourceIdPart(variant);
    const labelPart = sourceLabelPart(variant);

    return {
      id: `generated-broad-workable-${idPart}`,
      companyName: `Workable Broad Job Board - ${labelPart}`,
      websiteUrl: "https://jobs.workable.com",
      careersUrl: `https://jobs.workable.com/api/v1/jobs?query=${encodeURIComponent(variant)}&workplace=remote&location=United+States`,
      atsProvider: "html",
      atsBoardToken: "",
      industryBucket: "Broad job board",
      remoteLikelihood: 95,
      notes: `broad job board generated source; Workable aggregate search API; profile-query variant "${variant}"; feeds unified matching flow`,
      status: "active",
      lastSuccessfulScan: now,
    };
  });

  const weWorkRemotelyRssSources: Company[] = [
    { slug: "remote-product-jobs", label: "Product" },
    { slug: "remote-management-and-finance-jobs", label: "Management & Finance" },
  ].map(({ slug, label }) => ({
    id: `generated-broad-wwr-rss-${slug}`,
    companyName: `We Work Remotely RSS - ${label}`,
    websiteUrl: "https://weworkremotely.com",
    careersUrl: `https://weworkremotely.com/categories/${slug}.rss`,
    atsProvider: "html",
    atsBoardToken: "",
    industryBucket: "Broad job board",
    remoteLikelihood: 95,
    notes: `broad job board generated source; public RSS feed (HTML pages are 403 but RSS is open); category "${label}"; feeds unified matching flow`,
    status: "active",
    lastSuccessfulScan: now,
  }));

  return [
    ...adzunaVariantSources,
    ...workableVariantSources,
    ...remotiveVariantSources,
    ...himalayasVariantSources,
    ...weWorkRemotelyRssSources,
    {
      id: "generated-broad-arbeitnow",
      companyName: "Arbeitnow Broad Job Board",
      websiteUrl: "https://arbeitnow.com",
      careersUrl: "https://arbeitnow.com/api/job-board-api",
      atsProvider: "html",
      atsBoardToken: "",
      industryBucket: "Broad job board",
      remoteLikelihood: 75,
      notes: "broad job board generated source; public job-board API; remote/EU-heavy; feeds unified matching flow",
      status: "active",
      lastSuccessfulScan: now,
    },
    {
      id: "generated-broad-remoteok",
      companyName: "Remote OK Broad Job Board",
      websiteUrl: "https://remoteok.com",
      careersUrl: "https://remoteok.com/api",
      atsProvider: "html",
      atsBoardToken: "",
      industryBucket: "Broad job board",
      remoteLikelihood: 95,
      notes: "broad job board generated source; public jobs API; feeds unified matching flow",
      status: "active",
      lastSuccessfulScan: now,
    },
  ];
}

export function searchSourceKindForCompany(company: Company): SearchSourceKind {
  const normalizedName = normalize(company.companyName);
  const normalizedNotes = normalize(company.notes);

  if (
    normalizedNotes.includes("broad source") ||
    normalizedNotes.includes("broad job board") ||
    normalizedName === "magnit direct sourcing" ||
    isMagnitDirectSourcingBoard(company)
  ) {
    return "broad_job_board";
  }

  return "targeted_company_careers";
}

export function connectedSearchSources(companies: Company[], profile?: UserSearchProfile) {
  const generatedSources = generatedBroadSources(profile);
  const existingSourceIds = new Set(companies.map((company) => company.id));
  const existingSourceNames = new Set(companies.map((company) => normalize(company.companyName)));
  const activeSourceRows = [
    ...generatedSources.filter((company) => !existingSourceIds.has(company.id) && !existingSourceNames.has(normalize(company.companyName))),
    ...companies,
  ];
  const sources = activeSourceRows
    .filter((company) => company.status === "active")
    .map((company): ConnectedSearchSource => ({
      sourceKind: searchSourceKindForCompany(company),
      company,
    }));
  const broadSources = sources.filter((source) => source.sourceKind === "broad_job_board");
  const targetedSources = sources.filter((source) => source.sourceKind === "targeted_company_careers");

  return {
    sources,
    broadSources,
    targetedSources,
    summary: {
      totalSources: sources.length,
      broadSources: broadSources.length,
      targetedSources: targetedSources.length,
    },
  };
}

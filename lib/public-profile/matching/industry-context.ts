import industriesCatalogue from "../catalogues/industries.json";
import type { MatchJob } from "./types";

type IndustryCatalogueRecord = {
  id: string;
  label: string;
  sector: string;
  hierarchy: string[];
  description: string;
};

export type IndustryContextStatus = "not_applicable" | "aligned" | "conflict" | "unknown";

export type IndustryContextAssessment = {
  required: boolean;
  status: IndustryContextStatus;
  targetDomains: string[];
  postingDomains: string[];
  matchedDomains: string[];
  evidence: string[];
};

type IndustryFamilyRule = {
  key: string;
  labels: string[];
  targetAliases?: RegExp[];
  signals: RegExp[];
  expandExactLabels?: string[];
};

type ResolvedIndustryIntent = {
  label: string;
  recordIds: Set<string>;
  familyKeys: Set<string>;
  customKey?: string;
};

type PostingIndustrySignal = {
  key: string;
  label: string;
  score: number;
  primary: boolean;
  recordIds: Set<string>;
  familyKey?: string;
  evidence: string;
};

const records = industriesCatalogue.records as IndustryCatalogueRecord[];

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string) {
  return normalize(value).replace(/\s/g, "");
}

function phraseIncluded(content: string, phrase: string) {
  const normalizedPhrase = normalize(phrase);
  return Boolean(normalizedPhrase) && ` ${content} `.includes(` ${normalizedPhrase} `);
}

function normalizedPhraseIncluded(content: string, normalizedPhrase: string) {
  return Boolean(normalizedPhrase) && ` ${content} `.includes(` ${normalizedPhrase} `);
}

function sortedUnique(values: string[]) {
  return [...new Set(values)].sort((first, second) => first.localeCompare(second));
}

const recordsById = new Map(records.map((record) => [record.id, record]));
const recordsByLabel = new Map(records.map((record) => [normalize(record.label), record]));
const recordsByCompactLabel = new Map(records.map((record) => [compact(record.label), record]));

const catalogueLabelTokenFrequency = new Map<string, number>();
for (const record of records) {
  for (const token of new Set(normalize(record.label).split(" ").filter(Boolean))) {
    catalogueLabelTokenFrequency.set(token, (catalogueLabelTokenFrequency.get(token) ?? 0) + 1);
  }
}

const catalogueScanRecords = records.map((record) => {
  const normalizedLabel = normalize(record.label);
  const anchorToken = normalizedLabel
    .split(" ")
    .filter(Boolean)
    .sort((first, second) => (
      (catalogueLabelTokenFrequency.get(first) ?? 0) - (catalogueLabelTokenFrequency.get(second) ?? 0)
      || second.length - first.length
      || first.localeCompare(second)
    ))[0];
  return { record, normalizedLabel, anchorToken };
});

function recordForLabel(label: string) {
  return recordsByLabel.get(normalize(label)) ?? recordsByCompactLabel.get(compact(label));
}

// Every catalogue record can be a target intent. These families only add
// vocabulary commonly used in postings when the catalogue's formal label is
// absent. They point back to catalogue records instead of defining a separate,
// closed industry taxonomy.
const INDUSTRY_FAMILIES: IndustryFamilyRule[] = [
  {
    key: "advertising",
    labels: ["Advertising Services"],
    targetAliases: [/^advertising$/, /^brand$/, /^(paid|retail|digital) media$/],
    signals: [
      /\badvertis(?:ing|ement)\b/,
      /\bmedia (?:planning|buying|strategy)\b/,
      /\bcreative agenc(?:y|ies)\b/,
    ],
    expandExactLabels: ["Advertising Services"],
  },
  {
    key: "marketing",
    labels: ["Marketing Services"],
    targetAliases: [/^marketing$/, /^brand$/],
    signals: [/\bmarketing\b/, /\bbrand (?:marketing|strategy|campaigns?)\b/],
    expandExactLabels: ["Marketing Services"],
  },
  {
    key: "information-technology",
    labels: [
      "IT Services and IT Consulting",
      "Technology, Information and Internet",
      "Technology, Information and Media",
    ],
    targetAliases: [/^information technology$/, /^it$/, /^technology$/],
    signals: [
      /\binformation technology\b/,
      /\bit (?:department|infrastructure|operations|programs?|services?|systems?)\b/,
      /\bcloud infrastructure\b/,
      /\bcybersecurity\b/,
      /\benterprise (?:applications?|systems?|technology)\b/,
    ],
    expandExactLabels: [
      "IT Services and IT Consulting",
      "Technology, Information and Internet",
      "Technology, Information and Media",
    ],
  },
  {
    key: "software-development",
    labels: ["Software Development"],
    targetAliases: [/^information technology$/, /^it$/, /^technology$/],
    signals: [/\bsoftware (?:company|development|platform|products?)\b/],
    expandExactLabels: ["Software Development"],
  },
  {
    key: "health-care",
    labels: ["Hospitals and Health Care"],
    targetAliases: [/^health ?care$/, /^health$/, /^clinical health$/],
    signals: [
      /\bhealth ?care\b/,
      /\bclinical (?:care|operations?|programs?|services?)\b/,
      /\bhospitals?\b/,
      /\bpatient (?:care|outcomes?|safety|services?)\b/,
      /\bcare delivery\b/,
      /\bhealth systems?\b/,
    ],
    expandExactLabels: ["Hospitals and Health Care"],
  },
  {
    key: "financial-services",
    labels: ["Financial Services"],
    targetAliases: [/^finance$/, /^fintech$/],
    signals: [
      /\bfinancial services\b/,
      /\bfintech\b/,
    ],
    expandExactLabels: ["Financial Services"],
  },
  {
    key: "banking",
    labels: ["Banking"],
    targetAliases: [/^finance$/],
    signals: [/\b(?:commercial|investment|retail) banking\b/],
    expandExactLabels: ["Banking"],
  },
  {
    key: "investment-management",
    labels: ["Investment Management"],
    targetAliases: [/^finance$/],
    signals: [/\basset management\b/, /\binvestment management\b/, /\bwealth management\b/],
    expandExactLabels: ["Investment Management"],
  },
  {
    key: "insurance",
    labels: ["Insurance"],
    targetAliases: [/^finance$/],
    signals: [/\binsurance (?:operations?|products?|services?)\b/],
    expandExactLabels: ["Insurance"],
  },
  {
    key: "business-consulting",
    labels: ["Business Consulting and Services"],
    targetAliases: [/^management consulting$/, /^business consulting$/],
    signals: [/\bmanagement consulting\b/, /\bbusiness consulting\b/],
    expandExactLabels: ["Business Consulting and Services"],
  },
  {
    key: "operations-consulting",
    labels: ["Operations Consulting"],
    signals: [/\boperations consulting\b/],
    expandExactLabels: ["Operations Consulting"],
  },
  {
    key: "legal-services",
    labels: ["Legal Services"],
    targetAliases: [/^legal$/],
    signals: [
      /\blegal (?:department|operations?|programs?|services?)\b/,
      /\blitigation\b/,
      /\bregulatory compliance\b/,
    ],
    expandExactLabels: ["Legal Services"],
  },
  {
    key: "law-practice",
    labels: ["Law Practice"],
    targetAliases: [/^law$/],
    signals: [/\blaw (?:firm|practice)\b/],
    expandExactLabels: ["Law Practice"],
  },
  {
    key: "government",
    labels: ["Government Administration"],
    targetAliases: [/^government$/, /^public sector$/],
    signals: [
      /\bgovernment (?:administration|agency|programs?|services?)\b/,
      /\bpublic sector\b/,
      /\bfederal (?:agency|government|programs?)\b/,
    ],
    expandExactLabels: ["Government Administration"],
  },
  {
    key: "human-resources",
    labels: ["Human Resources Services"],
    targetAliases: [/^human resources$/, /^hr$/, /^people operations$/],
    signals: [
      /\bhuman resources\b/,
      /\bpeople operations\b/,
      /\btalent acquisition\b/,
      /\bemployee relations\b/,
    ],
    expandExactLabels: ["Human Resources Services"],
  },
  {
    key: "motor-vehicle-manufacturing",
    labels: ["Motor Vehicle Manufacturing"],
    targetAliases: [/^automotive$/, /^automotive manufacturing$/],
    signals: [/\bautomotive manufacturing\b/, /\bmotor vehicle manufacturing\b/],
    expandExactLabels: ["Motor Vehicle Manufacturing"],
  },
  {
    key: "motor-vehicle-parts-manufacturing",
    labels: ["Motor Vehicle Parts Manufacturing"],
    signals: [/\bmotor vehicle parts manufacturing\b/, /\bautomotive parts manufacturing\b/],
    expandExactLabels: ["Motor Vehicle Parts Manufacturing"],
  },
  {
    key: "renewable-energy-power-generation",
    labels: ["Renewable Energy Power Generation"],
    targetAliases: [/^renewable energy$/, /^clean energy$/],
    signals: [
      /\brenewable energy\b/,
      /\bclean energy\b/,
      /\bsolar (?:energy|farms?|power|projects?)\b/,
      /\bwind (?:energy|farms?|power|projects?)\b/,
      /\benergy transition\b/,
    ],
    expandExactLabels: ["Renewable Energy Power Generation"],
  },
  {
    key: "artificial-intelligence",
    labels: [],
    targetAliases: [/^ai$/, /^artificial intelligence$/, /^generative ai$/, /^machine learning$/],
    signals: [
      /\bartificial intelligence\b/,
      /\bgenerative ai\b/,
      /\bmachine learning\b/,
      /\bai (?:deployment|enablement|operations|platform|products?|programs?|solutions?|systems?|workflows?)\b/,
    ],
  },
];

function familyRecordIds(family: IndustryFamilyRule) {
  return new Set(family.labels.map(recordForLabel).filter(Boolean).map((record) => record!.id));
}

function resolveIndustryIntent(value: string): ResolvedIndustryIntent {
  const normalized = normalize(value);
  const exactRecord = recordForLabel(value);
  const matchedFamilies = INDUSTRY_FAMILIES.filter((family) => (
    family.targetAliases?.some((pattern) => pattern.test(normalized))
    || (exactRecord && family.expandExactLabels?.some((label) => recordForLabel(label)?.id === exactRecord.id))
  ));
  const recordIds = new Set<string>();
  const familyKeys = new Set<string>();

  if (exactRecord) recordIds.add(exactRecord.id);
  for (const family of matchedFamilies) {
    familyKeys.add(family.key);
    if (!exactRecord) {
      for (const id of familyRecordIds(family)) recordIds.add(id);
    }
  }

  return {
    label: exactRecord?.label ?? value.trim(),
    recordIds,
    familyKeys,
    customKey: exactRecord || matchedFamilies.length > 0 || !normalized ? undefined : `custom:${normalized}`,
  };
}

function addSignal(signals: Map<string, PostingIndustrySignal>, signal: PostingIndustrySignal) {
  const previous = signals.get(signal.key);
  if (!previous || signal.score > previous.score) {
    signals.set(signal.key, signal);
  } else if (signal.score === previous.score && signal.primary && !previous.primary) {
    signals.set(signal.key, signal);
  }
}

function directRecordSignal(record: IndustryCatalogueRecord, score: number, primary: boolean, source: string): PostingIndustrySignal {
  return {
    key: `record:${record.id}`,
    label: record.label,
    score,
    primary,
    recordIds: new Set([record.id]),
    evidence: `${record.label}: ${source}`,
  };
}

function familySignal(family: IndustryFamilyRule, score: number, primary: boolean, source: string): PostingIndustrySignal {
  return {
    key: `family:${family.key}`,
    label: family.key,
    score,
    primary,
    recordIds: familyRecordIds(family),
    familyKey: family.key,
    evidence: `${family.key}: ${source}`,
  };
}

function postingSignals(job: MatchJob, intents: ResolvedIndustryIntent[]) {
  const signals = new Map<string, PostingIndustrySignal>();
  const structured = normalize(job.industry ?? "");
  const primary = normalize([job.title, job.department ?? ""].join(" "));
  const details = normalize([...(job.responsibilities ?? []), ...(job.requiredExperience ?? [])].join(" "));
  const body = normalize(job.description);
  const postingTokens = new Set(`${structured} ${primary} ${details} ${body}`.split(" ").filter(Boolean));

  if (structured) {
    const record = recordForLabel(structured);
    if (record) addSignal(signals, directRecordSignal(record, 14, true, "structured industry"));
    for (const family of INDUSTRY_FAMILIES) {
      if (
        family.signals.some((pattern) => pattern.test(structured))
        || family.targetAliases?.some((pattern) => pattern.test(structured))
      ) {
        addSignal(signals, familySignal(family, 13, true, "structured industry"));
      }
    }
  }

  for (const family of INDUSTRY_FAMILIES) {
    if (family.signals.some((pattern) => pattern.test(primary))) {
      addSignal(signals, familySignal(family, 10, true, "title or department"));
    }
    if (family.signals.some((pattern) => pattern.test(details))) {
      addSignal(signals, familySignal(family, 7, false, "responsibilities or requirements"));
    }
    if (family.signals.some((pattern) => pattern.test(body))) {
      addSignal(signals, familySignal(family, 4, false, "posting description"));
    }
  }

  // Production rows do not currently expose a structured industry. Scan every
  // catalogue label in the posting text so an unrelated leaf remains visible
  // even when it is not one of the selected targets or a supplemental alias.
  // Exact label phrases stay atomic; no token-level "manufacturing" or
  // "services" expansion can turn sibling records into matches.
  for (const { record, normalizedLabel, anchorToken } of catalogueScanRecords) {
    if (!anchorToken || !postingTokens.has(anchorToken)) continue;
    if (normalizedPhraseIncluded(structured, normalizedLabel)) {
      addSignal(signals, directRecordSignal(record, 14, true, "structured industry"));
    } else if (normalizedPhraseIncluded(primary, normalizedLabel)) {
      addSignal(signals, directRecordSignal(record, 10, true, "title or department"));
    } else if (normalizedPhraseIncluded(details, normalizedLabel)) {
      addSignal(signals, directRecordSignal(record, 7, false, "responsibilities or requirements"));
    } else if (normalizedPhraseIncluded(body, normalizedLabel)) {
      addSignal(signals, directRecordSignal(record, 4, false, "posting description"));
    }
  }

  for (const intent of intents) {
    if (!intent.customKey) continue;
    const phrase = intent.label;
    for (const [content, score, isPrimary, source] of [
      [structured, 13, true, "structured industry"],
      [primary, 10, true, "title or department"],
      [details, 7, false, "responsibilities or requirements"],
      [body, 4, false, "posting description"],
    ] as const) {
      if (!phraseIncluded(content, phrase)) continue;
      addSignal(signals, {
        key: intent.customKey,
        label: intent.label,
        score,
        primary: isPrimary,
        recordIds: new Set(),
        evidence: `${intent.label}: ${source}`,
      });
    }
  }

  return [...signals.values()].sort((first, second) => second.score - first.score || first.label.localeCompare(second.label));
}

function recordIsDescendantOf(recordId: string, ancestorId: string) {
  if (recordId === ancestorId) return true;
  const record = recordsById.get(recordId);
  const ancestor = recordsById.get(ancestorId);
  return Boolean(record && ancestor && record.hierarchy.some((label) => normalize(label) === normalize(ancestor.label)));
}

function signalMatchesIntent(signal: PostingIndustrySignal, intent: ResolvedIndustryIntent) {
  if (intent.customKey && signal.key === intent.customKey) return true;
  if (signal.familyKey && intent.familyKeys.has(signal.familyKey)) return true;
  for (const postingRecordId of signal.recordIds) {
    for (const targetRecordId of intent.recordIds) {
      // A broad selected catalogue industry accepts its descendants. A specific
      // leaf never accepts a sibling merely because both share an ancestor.
      if (recordIsDescendantOf(postingRecordId, targetRecordId)) return true;
    }
  }
  return false;
}

function signalIsAncestorOfIntent(signal: PostingIndustrySignal, intent: ResolvedIndustryIntent) {
  for (const postingRecordId of signal.recordIds) {
    for (const targetRecordId of intent.recordIds) {
      if (postingRecordId !== targetRecordId && recordIsDescendantOf(targetRecordId, postingRecordId)) return true;
    }
  }
  return false;
}

const GENERIC_TITLE_TOKENS = new Set([
  "account", "accounts", "administration", "administrator", "analyst", "assistant", "associate", "business",
  "ceo", "chief", "client", "coo", "coordinator", "corporate", "delivery", "director", "division",
  "deputy", "enterprise", "executive", "fractional", "general", "global", "group", "head", "lead", "leader",
  "management", "manager", "managing", "of", "office", "officer", "operations", "pmo", "portfolio", "portfolios",
  "principal", "program", "programs", "project", "projects", "regional", "senior", "specialist", "staff",
  "services", "strategic", "strategy", "strategist", "supervisor", "the", "vice", "president", "vp",
  "i", "ii", "iii", "iv", "sr", "jr",
]);

function detectedGenericRoleFamily(title: string) {
  const normalized = normalize(title);
  const tokens = normalized.split(" ").filter(Boolean);
  const tokenSet = new Set(tokens);
  if (/\bchief of staff\b/.test(normalized)) return "chief-of-staff";
  if (tokenSet.has("coo")) return "operations-executive";
  if (/\b(?:general manager|general director|managing director)\b/.test(normalized)) return "general-management";
  if (tokenSet.has("pmo")) return "program";
  if (tokenSet.has("program") || tokenSet.has("programs")) return "program";
  if (tokenSet.has("project") || tokenSet.has("projects")) return "project";
  if (tokenSet.has("portfolio") || tokenSet.has("portfolios")) return "portfolio";
  if (tokenSet.has("operations")) return "operations";
  if (tokenSet.has("delivery")) return "delivery";
  if (tokenSet.has("strategy")) return "strategy";
  if (
    tokenSet.has("account")
    || tokenSet.has("accounts")
    || (tokenSet.has("client") && tokenSet.has("services"))
  ) return "account";
  return undefined;
}

export function isGenericCrossIndustryTitle(title: string) {
  const tokens = normalize(title).split(" ").filter(Boolean);
  const family = detectedGenericRoleFamily(title);
  return tokens.length > 0
    && Boolean(family)
    && family !== "account"
    && tokens.every((token) => GENERIC_TITLE_TOKENS.has(token));
}

export function hasGenericCrossIndustryRoleHead(title: string) {
  return Boolean(detectedGenericRoleFamily(title));
}

export function genericCrossIndustryRoleFamily(title: string) {
  return detectedGenericRoleFamily(title);
}

export function genericCrossIndustryRoleLevel(title: string) {
  const tokens = new Set(normalize(title).split(" ").filter(Boolean));
  if (tokens.has("assistant")) return "assistant";
  if (tokens.has("associate")) return "associate";
  if (tokens.has("deputy")) return "deputy";
  if (tokens.has("junior") || tokens.has("jr")) return "junior";
  if (tokens.has("coordinator")) return "coordinator";
  if (tokens.has("analyst")) return "analyst";
  if (tokens.has("administrator")) return "administrator";
  if (tokens.has("specialist")) return "specialist";
  if (tokens.has("strategist")) return "strategist";
  if (tokens.has("supervisor")) return "supervisor";
  if (tokens.has("executive")) return "executive";
  if (tokens.has("principal")) return "principal";
  if (tokens.has("manager")) return "manager";
  if (tokens.has("lead") || tokens.has("leader")) return "lead";
  if (
    tokens.has("director")
    || tokens.has("head")
    || tokens.has("president")
    || tokens.has("vp")
    || tokens.has("chief")
    || tokens.has("coo")
  ) return "director";
  if (tokens.has("officer")) return "officer";
  return "other";
}

export function assessIndustryContext(
  job: MatchJob,
  targetIndustries: string[],
  required: boolean,
): IndustryContextAssessment {
  const targets = targetIndustries.map((value) => value.trim()).filter(Boolean);
  const intents = targets.map(resolveIndustryIntent);
  if (!required || intents.length === 0) {
    return {
      required: false,
      status: "not_applicable",
      targetDomains: sortedUnique(intents.map((intent) => intent.label)),
      postingDomains: [],
      matchedDomains: [],
      evidence: [],
    };
  }

  const signals = postingSignals(job, intents);
  const matchedSignals = signals.filter((signal) => intents.some((intent) => signalMatchesIntent(signal, intent)));
  const contradictorySignals = signals.filter((signal) => (
    !intents.some((intent) => signalMatchesIntent(signal, intent))
    && !intents.some((intent) => signalIsAncestorOfIntent(signal, intent))
  ));
  const strongestMatch = matchedSignals[0];
  const strongestContradiction = contradictorySignals[0];
  const targetDomains = sortedUnique(intents.map((intent) => intent.label));
  const postingDomains = sortedUnique(signals.map((signal) => signal.label));
  const matchedDomains = sortedUnique(matchedSignals.map((signal) => signal.label));
  const evidence = sortedUnique(signals.map((signal) => signal.evidence));

  if (strongestMatch) {
    const equalSourceAmbiguity = Boolean(
      strongestContradiction
      && strongestContradiction.score === strongestMatch.score
      && strongestContradiction.primary === strongestMatch.primary
    );
    if (equalSourceAmbiguity) {
      return {
        required: true,
        status: "unknown",
        targetDomains,
        postingDomains,
        matchedDomains: [],
        evidence,
      };
    }
    const contradictionWins = Boolean(
      strongestContradiction
      && (
        (strongestContradiction.primary && !strongestMatch.primary)
        || strongestContradiction.score > strongestMatch.score + 2
      )
    );
    if (!contradictionWins) {
      return {
        required: true,
        status: "aligned",
        targetDomains,
        postingDomains,
        matchedDomains,
        evidence,
      };
    }
  }

  if (strongestContradiction) {
    return {
      required: true,
      status: "conflict",
      targetDomains,
      postingDomains,
      matchedDomains: [],
      evidence,
    };
  }

  return {
    required: true,
    status: "unknown",
    targetDomains,
    postingDomains,
    matchedDomains: [],
    evidence,
  };
}

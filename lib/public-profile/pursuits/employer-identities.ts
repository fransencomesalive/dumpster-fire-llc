export type EmployerIdentityRelationship =
  | "primary"
  | "posting_name"
  | "brand"
  | "subsidiary"
  | "division"
  | "business_unit"
  | "part_of"
  | "owned_by"
  | "operating_company";

export type EmployerIdentity = {
  name: string;
  relationship: EmployerIdentityRelationship;
  evidenceText: string;
};

export type EmployerIdentityInput = {
  companyName: string;
  description: string;
};

const COMPANY_SUFFIXES = new Set([
  "co",
  "company",
  "corp",
  "corporation",
  "inc",
  "incorporated",
  "limited",
  "llc",
  "ltd",
  "plc",
]);

const RELATIONSHIP_PATTERN =
  /\b(brand|subsidiary|division|business\s+unit|part|operating\s+company)\s+of\s+([^,.;:()]{2,100})|\bowned\s+by\s+([^,.;:()]{2,100})/i;

function words(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function normalizedCompanyKey(value: string): string {
  const normalized = words(value);
  while (normalized.length > 1 && COMPANY_SUFFIXES.has(normalized.at(-1)!)) {
    normalized.pop();
  }
  return normalized.join("");
}

function normalizedCompanyPhrase(value: string): string {
  const normalized = words(value);
  while (normalized.length > 1 && COMPANY_SUFFIXES.has(normalized.at(-1)!)) {
    normalized.pop();
  }
  return normalized.join(" ");
}

function postingNameMatchesPrimary(primary: string, postingName: string): boolean {
  const left = normalizedCompanyPhrase(primary);
  const right = normalizedCompanyPhrase(postingName);
  if (!left || !right) return false;
  return left === right
    || ` ${left} `.includes(` ${right} `)
    || ` ${right} `.includes(` ${left} `);
}

function cleanIdentityName(value: string): string {
  const cleaned = value
    .replace(/^(?:an?|the)\s+/i, "")
    .replace(/\b(?:which|that|specializing|providing|offering|focused|based)\b[\s\S]*$/i, "")
    .replace(/[\s'"]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const identityWords = cleaned.split(/\s+/).filter(Boolean);
  if (identityWords.length === 0 || identityWords.length > 10) return "";
  if (/^(?:company|organization|business|group|client|clients|us|our team)$/i.test(cleaned)) {
    return "";
  }
  return cleaned;
}

function relationshipFor(value: string): Exclude<EmployerIdentityRelationship, "primary" | "posting_name"> {
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  if (normalized === "business_unit") return "business_unit";
  if (normalized === "operating_company") return "operating_company";
  if (normalized === "owned") return "owned_by";
  if (normalized === "part") return "part_of";
  if (normalized === "subsidiary") return "subsidiary";
  if (normalized === "division") return "division";
  return "brand";
}

function sentences(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function relationshipStatement(sentence: string): {
  postingName: string;
  relatedName: string;
  relationship: Exclude<EmployerIdentityRelationship, "primary" | "posting_name">;
} | undefined {
  const relationship = sentence.match(RELATIONSHIP_PATTERN);
  if (!relationship || relationship.index === undefined) return undefined;

  const beforeRelationship = sentence.slice(0, relationship.index).trim();
  const subject = beforeRelationship
    .match(/^(.{2,100}?)\s+(?:is|are)\s+(?:an?\s+)?/i)?.[1]
    ?? beforeRelationship.match(/^(.{2,100}?),\s+(?:an?\s+)?/i)?.[1]
    ?? "";
  const postingName = cleanIdentityName(subject);
  const relationshipLabel = relationship[1] || "owned";
  const relatedName = cleanIdentityName(relationship[2] || relationship[3] || "");
  if (!postingName || !relatedName) return undefined;

  return {
    postingName,
    relatedName,
    relationship: relationshipFor(relationshipLabel),
  };
}

export function resolveEmployerIdentities(input: EmployerIdentityInput): EmployerIdentity[] {
  const primaryName = cleanIdentityName(input.companyName);
  if (!primaryName) return [];

  const identities: EmployerIdentity[] = [{
    name: primaryName,
    relationship: "primary",
    evidenceText: `Job company: ${primaryName}`,
  }];
  const seen = new Set([normalizedCompanyKey(primaryName)]);

  for (const sentence of sentences(input.description)) {
    const statement = relationshipStatement(sentence);
    if (!statement || !postingNameMatchesPrimary(primaryName, statement.postingName)) continue;

    const postingNameKey = normalizedCompanyKey(statement.postingName);
    if (postingNameKey && !seen.has(postingNameKey)) {
      seen.add(postingNameKey);
      identities.push({
        name: statement.postingName,
        relationship: "posting_name",
        evidenceText: sentence,
      });
    }

    const relatedNameKey = normalizedCompanyKey(statement.relatedName);
    if (relatedNameKey && !seen.has(relatedNameKey)) {
      seen.add(relatedNameKey);
      identities.push({
        name: statement.relatedName,
        relationship: statement.relationship,
        evidenceText: sentence,
      });
    }
  }

  return identities;
}

export function relatedEmployerSearchTarget(
  input: EmployerIdentityInput,
): EmployerIdentity | undefined {
  const identities = resolveEmployerIdentities(input);
  return identities.find((identity) =>
    identity.relationship !== "primary" && identity.relationship !== "posting_name")
    ?? identities.find((identity) => identity.relationship !== "primary");
}

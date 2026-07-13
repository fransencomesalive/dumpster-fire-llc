import { createHash } from "node:crypto";

function clean(value) {
  return typeof value === "string"
    ? value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim()
    : "";
}

function normalizedExample(example) {
  return {
    title: clean(example.title),
    oneHitter: clean(example.oneHitter ?? example.one_hitter),
    link: clean(example.link),
    context: clean(example.context),
  };
}

function fingerprint(example) {
  return createHash("sha256")
    .update(JSON.stringify(normalizedExample(example)))
    .digest("hex");
}

function shortKey(example) {
  return `work-example-${fingerprint(example).slice(0, 12)}`;
}

function renderExampleBlock(example) {
  const normalized = normalizedExample(example);
  return [
    `### ${normalized.title}`,
    "",
    `- One-hitter: ${normalized.oneHitter}`,
    normalized.link ? `- Link: ${normalized.link}` : "",
    "",
    normalized.context,
  ].filter(Boolean).join("\n").trim();
}

function compiledSectionBody(markdown) {
  const normalized = clean(markdown);
  const startMarker = "## Work Examples\n";
  const endMarker = "\n## Guardrails";
  const start = normalized.indexOf(startMarker);
  if (start === -1) return undefined;
  const bodyStart = start + startMarker.length;
  const end = normalized.indexOf(endMarker, bodyStart);
  if (end === -1) return undefined;
  return normalized.slice(bodyStart, end).trim();
}

function compiledParityIssues(structuredExamples, profileMarkdown) {
  let remaining = compiledSectionBody(profileMarkdown);
  if (remaining === undefined) return ["The compiled profile has no bounded Work Examples section."];

  const issues = [];
  for (const example of structuredExamples) {
    const block = renderExampleBlock(example);
    const first = remaining.indexOf(block);
    if (first === -1) {
      issues.push("A structured Work Example is missing or differs in profile.md.");
      continue;
    }
    if (remaining.indexOf(block, first + block.length) !== -1) {
      issues.push("A structured Work Example appears more than once in profile.md.");
    }
    remaining = `${remaining.slice(0, first)}${remaining.slice(first + block.length)}`.trim();
  }
  if (remaining) issues.push("profile.md contains Work Example content absent from structured data.");
  return issues;
}

export function createWorkExampleAudit(structuredExamples, profileMarkdown) {
  const structured = structuredExamples.map(normalizedExample);
  const fingerprints = structured.map(fingerprint);
  const duplicateFingerprints = fingerprints.filter((value, index, all) => all.indexOf(value) !== index);
  const incomplete = structured.filter((example) => !example.title || !example.oneHitter || !example.context);
  const issues = [];
  if (structured.length === 0) issues.push("No structured Work Examples were found.");
  if (incomplete.length > 0) issues.push("One or more structured Work Examples is missing a required field.");
  if (duplicateFingerprints.length > 0) issues.push("Duplicate structured Work Examples were found.");
  issues.push(...compiledParityIssues(structured, profileMarkdown));

  return {
    ok: issues.length === 0,
    count: structured.length,
    compiledCount: issues.some((issue) => issue.includes("profile.md")) ? null : structured.length,
    issues,
    entries: structured.map((example) => ({
      key: shortKey(example),
      title: example.title,
      fingerprint: fingerprint(example),
      fields: {
        title: Boolean(example.title),
        oneHitter: Boolean(example.oneHitter),
        link: Boolean(example.link),
        context: Boolean(example.context),
      },
    })),
  };
}

export function assertWorkExampleParity(structuredExamples, profileMarkdown) {
  const audit = createWorkExampleAudit(structuredExamples, profileMarkdown);
  if (!audit.ok) throw new Error(`Work Example inventory parity failed: ${audit.issues.join(" ")}`);
  return audit;
}

export function verifyFrozenWorkExampleAudit(audit, structuredExamples, profileMarkdown) {
  if (!audit?.ok || audit.issues?.length || !Array.isArray(audit.entries)) {
    throw new Error("Invalid Work Example inventory audit. Run pull-evidence.mjs again.");
  }
  if (audit.count !== audit.entries.length || audit.compiledCount !== audit.count) {
    throw new Error("Inconsistent Work Example inventory counts. Run pull-evidence.mjs again.");
  }
  const auditedFingerprints = audit.entries.map((entry) => entry.fingerprint);
  if (new Set(auditedFingerprints).size !== auditedFingerprints.length
    || auditedFingerprints.some((value) => !/^[a-f0-9]{64}$/.test(value))) {
    throw new Error("Invalid Work Example inventory fingerprints. Run pull-evidence.mjs again.");
  }
  const currentAudit = assertWorkExampleParity(structuredExamples, profileMarkdown);
  if (JSON.stringify(currentAudit.entries) !== JSON.stringify(audit.entries)) {
    throw new Error("Work Example inventory changed after the evidence pull. Run pull-evidence.mjs again.");
  }
  return structuredExamples.map(normalizedExample);
}

export function matchInsertedWorkExample(insertedExample, structuredExamples) {
  if (!insertedExample || !Array.isArray(structuredExamples)) return undefined;
  const oneHitter = clean(insertedExample.oneHitter);
  const link = clean(insertedExample.link);
  if (!oneHitter) return undefined;
  const matches = structuredExamples.map(normalizedExample).filter((example) => (
    example.oneHitter === oneHitter && example.link === link
  ));
  return matches.length === 1 ? matches[0] : undefined;
}

export function workExampleKey(example) {
  return example ? shortKey(example) : undefined;
}

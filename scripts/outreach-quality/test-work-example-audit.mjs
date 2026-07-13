import assert from "node:assert/strict";
import {
  assertWorkExampleParity,
  createWorkExampleAudit,
  matchInsertedWorkExample,
  verifyFrozenWorkExampleAudit,
  workExampleKey,
} from "./work-example-audit.mjs";
import { generateCandidateProfileMarkdown } from "../../lib/public-profile/profile-markdown.ts";
import { buildOutreachUserPrompt } from "../../lib/public-profile/outreach-generator.ts";
import { completeCandidateProfileAggregate } from "../fixtures/public-profile.ts";

const examples = [
  { id: "a", title: "Example A", one_hitter: "Shipped A.", link: "https://example.com/a", context: "Context A." },
  { id: "b", title: "Example B", one_hitter: "Shipped B.", link: null, context: "Context B." },
  { id: "c", title: "Example C", one_hitter: "Shipped C.", link: "https://example.com/c", context: "Context C." },
];

const markdown = `# Candidate Profile

## Work Examples

### Example A
- One-hitter: Shipped A.
- Link: https://example.com/a
Context A.

### Example B
- One-hitter: Shipped B.
Context B.

### Example C
- One-hitter: Shipped C.
- Link: https://example.com/c
Context C.

## Guardrails
`;

const audit = assertWorkExampleParity(examples, markdown);
assert.equal(audit.ok, true);
assert.equal(audit.count, 3);
assert.equal(audit.compiledCount, 3);
assert.equal(audit.entries.length, 3);
assert.ok(audit.entries.every((entry) => entry.fields.title && entry.fields.oneHitter && entry.fields.context));
assert.equal(verifyFrozenWorkExampleAudit(audit, examples, markdown).length, 3);

const missing = createWorkExampleAudit(examples, markdown.replace(/\n### Example C[\s\S]*?\n## Guardrails/, "\n## Guardrails"));
assert.equal(missing.ok, false);
assert.ok(missing.issues.some((issue) => issue.includes("missing or differs in profile.md")));

const duplicate = createWorkExampleAudit([...examples, examples[0]], markdown);
assert.equal(duplicate.ok, false);
assert.ok(duplicate.issues.some((issue) => issue.includes("Duplicate structured")));

assert.throws(
  () => verifyFrozenWorkExampleAudit(audit, examples, markdown.replace("Context B.", "Changed context.")),
  /inventory parity failed/,
);

const selected = matchInsertedWorkExample({ oneHitter: "Shipped C.", link: "https://example.com/c" }, examples);
assert.equal(selected?.title, "Example C");
assert.equal(workExampleKey(selected), audit.entries[2].key);
assert.equal(matchInsertedWorkExample({ oneHitter: "Invented example." }, examples), undefined);
assert.equal(matchInsertedWorkExample({ oneHitter: "Invented example.", link: "https://example.com/c" }, examples), undefined);
assert.equal(matchInsertedWorkExample({ oneHitter: "Shipped C.", link: "https://example.com/wrong" }, examples), undefined);
assert.equal(matchInsertedWorkExample({ oneHitter: "shipped c.", link: "https://example.com/c" }, examples), undefined);
assert.equal(matchInsertedWorkExample({ oneHitter: "Shipped C.", link: "HTTPS://EXAMPLE.COM/C" }, examples), undefined);

const corruptAudit = { ...audit, count: 2 };
assert.throws(() => verifyFrozenWorkExampleAudit(corruptAudit, examples, markdown), /Inconsistent/);
const corruptKeyAudit = {
  ...audit,
  entries: audit.entries.map((entry, index) => index === 0 ? { ...entry, key: "work-example-corrupt" } : entry),
};
assert.throws(() => verifyFrozenWorkExampleAudit(corruptKeyAudit, examples, markdown), /inventory changed/);

const markdownContextExample = [{
  id: "markdown-context",
  title: "Markdown Context",
  one_hitter: "Handled structured prose.",
  link: null,
  context: "First paragraph.\n\n### This heading belongs to the context\n\nLast paragraph.",
}];
const markdownContextProfile = `# Candidate Profile\n\n## Work Examples\n\n### Markdown Context\n- One-hitter: Handled structured prose.\nFirst paragraph.\n\n### This heading belongs to the context\n\nLast paragraph.\n\n## Guardrails\n`;
assert.equal(assertWorkExampleParity(markdownContextExample, markdownContextProfile).ok, true);

// Regression: multiple arbitrary user examples all survive structured profile compilation
// and reach the exact profile context supplied to outreach generation.
const generatedAt = "2026-07-13T18:00:00.000Z";
const aggregate = completeCandidateProfileAggregate(generatedAt);
aggregate.workExamples = examples.map((example) => ({
  id: example.id,
  profileId: aggregate.profile.id,
  title: example.title,
  oneHitter: example.one_hitter,
  link: example.link ?? undefined,
  context: example.context,
  createdAt: generatedAt,
  updatedAt: generatedAt,
}));
const generatedProfile = generateCandidateProfileMarkdown(aggregate, generatedAt).markdown;
const generatedAudit = assertWorkExampleParity(examples, generatedProfile);
assert.equal(generatedAudit.count, 3);
const outreachPrompt = buildOutreachUserPrompt({
  profileMarkdown: generatedProfile,
  job: { title: "Program Lead", company: "Example Co", description: "Lead complex programs." },
  contact: { role: "Hiring Manager" },
});
for (const example of examples) {
  assert.match(outreachPrompt, new RegExp(example.title));
  assert.match(outreachPrompt, new RegExp(example.one_hitter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

console.log("outreach-quality Work Example audit: all assertions passed");

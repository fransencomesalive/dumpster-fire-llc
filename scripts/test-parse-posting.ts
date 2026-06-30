import assert from "node:assert/strict";
import { parsePosting } from "../lib/scan/sources/parse-posting";

// Headings on their own lines (typical textFromHtml output)
const withLineHeadings = [
  "About the Role",
  "We are hiring a Senior Product Designer to lead our analytics suite.",
  "What You'll Do",
  "Own the design system across web and mobile.",
  "Drive 0 to 1 product discovery with PM and research.",
  "Partner with engineering from concept through ship.",
  "Qualifications",
  "7+ years in B2B product design.",
  "Proven design systems ownership at scale.",
  "About Us",
  "We are an equal opportunity employer and value diversity.",
].join("\n");

const parsed = parsePosting(withLineHeadings);
assert.equal(parsed.responsibilities.length, 3, "expected 3 responsibilities");
assert.ok(parsed.responsibilities[0].startsWith("Own the design system"));
assert.equal(parsed.requiredExperience.length, 2, "expected 2 required-experience items");
assert.ok(parsed.requiredExperience[0].includes("7+ years"));
// "About Us" is a boundary: its content (equal-opportunity boilerplate) must not leak in.
assert.ok(!parsed.requiredExperience.some((item) => item.toLowerCase().includes("equal opportunity")));
assert.ok(!parsed.responsibilities.some((item) => item.toLowerCase().includes("equal opportunity")));

// Bullets with • markers
const withBullets = [
  "Responsibilities:",
  "• Lead cross-functional delivery for launches",
  "• Drive stakeholder alignment across teams",
  "Requirements:",
  "• 8+ years in program leadership",
  "• Track record running large launches",
].join("\n");
const bulletParsed = parsePosting(withBullets);
assert.equal(bulletParsed.responsibilities.length, 2);
assert.ok(bulletParsed.responsibilities[0].startsWith("Lead cross-functional"));
assert.equal(bulletParsed.requiredExperience.length, 2);

// "Required Qualifications" must win over the shorter "Qualifications" and bucket as requirements.
const longestFirst = "Required Qualifications: 5+ years of relevant operations experience.";
const lq = parsePosting(longestFirst);
assert.equal(lq.requiredExperience.length, 1);
assert.equal(lq.responsibilities.length, 0);

// Cap at 6 items per bucket
const many = ["Responsibilities"].concat(
  Array.from({ length: 10 }, (_v, i) => `Own initiative number ${i + 1} end to end across teams`),
).join("\n");
assert.equal(parsePosting(many).responsibilities.length, 6);

// Empty / heading-less input degrades gracefully (Phase 2 LLM handles these)
assert.deepEqual(parsePosting(""), { responsibilities: [], requiredExperience: [] });
assert.deepEqual(
  parsePosting("Just a blurb with no recognizable section headings at all."),
  { responsibilities: [], requiredExperience: [] },
);

console.log("parse posting: all assertions passed");

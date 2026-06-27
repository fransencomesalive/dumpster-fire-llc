#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const SOURCE = {
  name: "Lightcast Open Skills",
  url: "https://lightcast.io/open-skills",
  license: "Lightcast Open Skills terms; free with registration per docs/onboarding-redesign-spec-2026-06-26.md section 7a.",
  notes: [
    "Runtime code must use the committed snapshot only; do not call Lightcast at request time.",
    "For a full refresh, export Lightcast Open Skills as JSON or CSV after registration and pass --input <file>.",
    "This generator accepts common Lightcast/Open Skills field names: id, name, type, category, subcategory.",
  ],
};

const DEFAULT_OUTPUT = path.join(
  process.cwd(),
  "lib/public-profile/catalogues/skills.json",
);

const BOOTSTRAP_SKILLS = [
  "Accessibility",
  "Account Management",
  "Agile Methodology",
  "AI Workflow Design",
  "Analytics",
  "API Design",
  "Audience Development",
  "B2B Marketing",
  "Brand Strategy",
  "Budget Management",
  "Business Analysis",
  "Change Management",
  "Client Relations",
  "Cloud Computing",
  "Communication",
  "Content Strategy",
  "Copywriting",
  "CRM",
  "Customer Discovery",
  "Customer Success",
  "Data Analysis",
  "Data Visualization",
  "Digital Marketing",
  "Editorial Strategy",
  "Event Production",
  "Executive Communications",
  "Facilitation",
  "Financial Modeling",
  "Go-To-Market Strategy",
  "Google Analytics",
  "Hiring",
  "HubSpot",
  "Information Architecture",
  "JavaScript",
  "Leadership",
  "Market Research",
  "Marketing Operations",
  "Microsoft Excel",
  "Operations Management",
  "Partnership Development",
  "Product Management",
  "Product Marketing",
  "Program Management",
  "Project Management",
  "Public Relations",
  "React",
  "Research",
  "Sales Enablement",
  "Salesforce",
  "Search Engine Optimization",
  "SQL",
  "Stakeholder Management",
  "Strategic Planning",
  "Technical Writing",
  "TypeScript",
  "User Experience Design",
  "Vendor Management",
  "Workflow Automation",
].map((name) => ({ name }));

function parseArgs(argv) {
  const args = { input: undefined, output: DEFAULT_OUTPUT };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      args.input = argv[index + 1];
      index += 1;
    } else if (arg === "--output") {
      args.output = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function loadInputRecords(inputPath) {
  if (!inputPath) return BOOTSTRAP_SKILLS;

  const raw = fs.readFileSync(inputPath, "utf8");
  if (inputPath.endsWith(".json")) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.data)) return parsed.data;
    if (Array.isArray(parsed.skills)) return parsed.skills;
    throw new Error("Unsupported Lightcast JSON shape. Expected an array, data[], or skills[].");
  }

  if (inputPath.endsWith(".csv")) return parseCsv(raw);

  throw new Error("Unsupported Lightcast export format. Use .json or .csv.");
}

function clean(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeRecord(record) {
  const name = clean(record.name ?? record.Name ?? record.skill ?? record.Skill ?? record.label ?? record.Label);
  if (!name) return undefined;

  return {
    id: clean(record.id ?? record.ID ?? record.skillId ?? record.skill_id) || `lightcast-${slugify(name)}`,
    name,
    type: clean(record.type ?? record.Type ?? record.skillType ?? record.skill_type) || "skill",
    category: clean(record.category ?? record.Category ?? record.skillCategory ?? record.skill_category),
    subcategory: clean(record.subcategory ?? record.Subcategory ?? record.skillSubcategory ?? record.skill_subcategory),
  };
}

function dedupe(records) {
  const byKey = new Map();
  for (const record of records) {
    const normalized = normalizeRecord(record);
    if (!normalized) continue;
    const key = normalized.name.toLowerCase();
    const existing = byKey.get(key);
    if (!existing || (!existing.category && normalized.category)) {
      byKey.set(key, normalized);
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function main() {
  const args = parseArgs(process.argv);
  const records = dedupe(loadInputRecords(args.input));
  const generatedAt = new Date().toISOString();
  const catalogue = {
    metadata: {
      generatedAt,
      source: SOURCE,
      recordCount: records.length,
      input: args.input ? path.basename(args.input) : "bootstrap curated Lightcast-aligned seed",
    },
    records,
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(catalogue, null, 2)}\n`);
  console.log(`Wrote ${records.length} skills to ${args.output}`);
}

main();

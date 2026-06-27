#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const SOURCE_URL = "https://learn.microsoft.com/en-us/linkedin/shared/references/reference-tables/industry-codes-v2?accept=text/markdown";
const DEFAULT_OUTPUT = path.join(
  process.cwd(),
  "lib/public-profile/catalogues/industries.json",
);

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

async function loadMarkdown(inputPath) {
  if (inputPath) return fs.readFileSync(inputPath, "utf8");
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to download LinkedIn Industry Taxonomy V2 markdown: ${response.status}`);
  }
  return response.text();
}

function decodeHtml(value) {
  return value
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseIndustryRows(markdown) {
  const rows = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    if (line.includes("---") || line.includes("Industry ID")) continue;

    const cells = line
      .slice(1, -1)
      .split("|")
      .map((cell) => decodeHtml(cell));

    if (cells.length < 4) continue;
    const [id, label, hierarchy, description] = cells;
    if (!/^\d+$/.test(id) || !label) continue;

    const pathParts = hierarchy.split(">").map((part) => part.trim()).filter(Boolean);
    rows.push({
      id,
      label,
      sector: pathParts[0] ?? label,
      hierarchy: pathParts,
      description,
    });
  }
  return rows;
}

function dedupe(records) {
  const byId = new Map();
  for (const record of records) byId.set(record.id, record);
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}

async function main() {
  const args = parseArgs(process.argv);
  const markdown = await loadMarkdown(args.input);
  const records = dedupe(parseIndustryRows(markdown));
  if (records.length < 400) {
    throw new Error(`Expected the LinkedIn V2 taxonomy to contain about 434 records; parsed ${records.length}.`);
  }

  const catalogue = {
    metadata: {
      generatedAt: new Date().toISOString(),
      source: {
        name: "LinkedIn Industry Taxonomy V2",
        url: "https://learn.microsoft.com/en-us/linkedin/shared/references/reference-tables/industry-codes-v2",
        license: "Microsoft Learn content terms.",
        notes: [
          "Downloaded from the Microsoft Learn markdown endpoint and parsed from the Active/Inactive industry tables.",
          "Runtime code uses this committed snapshot only.",
        ],
      },
      recordCount: records.length,
      input: args.input ? path.basename(args.input) : SOURCE_URL,
    },
    records,
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(catalogue, null, 2)}\n`);
  console.log(`Wrote ${records.length} industries to ${args.output}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SOURCE_URL = "https://download.geonames.org/export/dump/cities15000.zip";
const DEFAULT_OUTPUT = path.join(
  process.cwd(),
  "lib/public-profile/catalogues/locations.json",
);
const COUNTRIES = new Set(["US", "CA", "MX"]);

function parseArgs(argv) {
  const args = { input: undefined, output: DEFAULT_OUTPUT, limit: undefined };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      args.input = argv[index + 1];
      index += 1;
    } else if (arg === "--output") {
      args.output = argv[index + 1];
      index += 1;
    } else if (arg === "--limit") {
      args.limit = Number.parseInt(argv[index + 1], 10);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readInput(inputPath) {
  if (!inputPath) {
    throw new Error(`Download ${SOURCE_URL}, unzip cities15000.txt, then pass --input <cities15000.txt>.`);
  }

  if (inputPath.endsWith(".zip")) {
    const result = spawnSync("unzip", ["-p", inputPath, "cities15000.txt"], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    if (result.status !== 0) {
      throw new Error(result.stderr || "Unable to extract cities15000.txt from zip.");
    }
    return result.stdout;
  }

  return fs.readFileSync(inputPath, "utf8");
}

function clean(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function parseRows(text) {
  const records = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = line.split("\t");
    const country = cells[8];
    if (!COUNTRIES.has(country)) continue;

    const population = Number.parseInt(cells[14] || "0", 10);
    if (!Number.isFinite(population) || population < 15000) continue;

    const name = clean(cells[1]);
    const admin1 = clean(cells[10]);
    records.push({
      id: cells[0],
      name,
      asciiName: clean(cells[2]),
      country,
      admin1,
      latitude: Number.parseFloat(cells[4]),
      longitude: Number.parseFloat(cells[5]),
      population,
      timezone: clean(cells[17]),
      displayName: `${name}, ${admin1}, ${country}`,
    });
  }
  return records;
}

function dedupe(records, limit) {
  const byKey = new Map();
  for (const record of records) {
    const key = `${record.name.toLowerCase()}|${record.admin1}|${record.country}`;
    const existing = byKey.get(key);
    if (!existing || existing.population < record.population) byKey.set(key, record);
  }

  const sorted = [...byKey.values()].sort((a, b) => {
    const countryOrder = a.country.localeCompare(b.country);
    if (countryOrder !== 0) return countryOrder;
    const nameOrder = a.name.localeCompare(b.name);
    if (nameOrder !== 0) return nameOrder;
    return b.population - a.population;
  });

  return limit ? sorted.slice(0, limit) : sorted;
}

function main() {
  const args = parseArgs(process.argv);
  const records = dedupe(parseRows(readInput(args.input)), args.limit);
  const catalogue = {
    metadata: {
      generatedAt: new Date().toISOString(),
      source: {
        name: "GeoNames cities15000",
        url: SOURCE_URL,
        license: "CC-BY 4.0; attribution required.",
        attribution: "GeoNames geographical database, https://www.geonames.org/",
        notes: [
          "Filtered to country codes US, CA, and MX from cities15000.",
          "Runtime code uses this committed snapshot only.",
        ],
      },
      filters: {
        countries: [...COUNTRIES],
        minimumPopulation: 15000,
      },
      recordCount: records.length,
      input: args.input ? path.basename(args.input) : SOURCE_URL,
    },
    records,
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(catalogue, null, 2)}\n`);
  console.log(`Wrote ${records.length} locations to ${args.output}`);
}

main();

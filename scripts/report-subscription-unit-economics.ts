import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicProfileRepositoryRequest,
  getPublicProfileRepositoryConfig,
} from "../lib/public-profile/repository";
import {
  buildUnitEconomicsReport,
  loadUnitEconomicsInputs,
} from "../lib/costs/unit-economics";

function argument(name: string) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function loadLocalEnvironment() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main() {
  const from = argument("from");
  const to = argument("to");
  if (!from || !to || !from.endsWith("Z") || !to.endsWith("Z")) {
    throw new Error(
      "Usage: npm run report:unit-economics -- --from <UTC ISO timestamp> --to <UTC ISO timestamp>",
    );
  }
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    throw new Error("The UTC analysis window must have an increasing --from and --to.");
  }

  loadLocalEnvironment();
  const config = getPublicProfileRepositoryConfig();
  if (!config) {
    throw new Error("Missing Supabase service-role configuration.");
  }
  const request = createPublicProfileRepositoryRequest(config);
  const inputs = await loadUnitEconomicsInputs(request, { from, to });
  const report = buildUnitEconomicsReport(inputs);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unit economics report failed.");
  process.exitCode = 1;
});

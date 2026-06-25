import { writeFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { getMatchTuningPreviewImpact } from "../app/scans/store";

loadEnvConfig(process.cwd());

function argValue(name: string) {
  const prefix = `${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : "";
}

async function main() {
  const outputPath = argValue("--out");
  const impact = await getMatchTuningPreviewImpact();

  if (outputPath) {
    writeFileSync(outputPath, `${JSON.stringify(impact, null, 2)}\n`);
  }

  console.log(JSON.stringify({
    rulesVersion: impact.rulesVersion,
    draftCount: impact.drafts.length,
    currentCounts: impact.currentCounts,
    previewCounts: impact.previewCounts,
    impactCounts: impact.impactCounts,
    warnings: impact.warnings,
    applyBlockedReasons: impact.applyBlockedReasons,
    outputPath: outputPath || undefined,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

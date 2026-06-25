import { loadEnvConfig } from "@next/env";
import { backfillCurrentMatchDecisions } from "../app/scans/store";

loadEnvConfig(process.cwd());

async function main() {
  const result = await backfillCurrentMatchDecisions();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

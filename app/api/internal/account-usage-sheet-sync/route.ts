import { handleAccountUsageSheetSync } from "@/lib/reporting/account-usage-sheet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  return handleAccountUsageSheetSync(request);
}

export async function POST(request: Request) {
  return handleAccountUsageSheetSync(request);
}

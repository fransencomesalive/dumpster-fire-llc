import { handleSourceScanRequest } from "@/lib/scan/api";

export const dynamic = "force-dynamic";
// Broad query variants are grouped by host and processed in parallel across hosts, but each
// public API is kept sequential. The full 85-source maintenance pass includes paginated broad
// boards and needs a larger budget than an interactive user request.
export const maxDuration = 180;

// Vercel Cron triggers a GET; POST is allowed for manual/admin runs. Both are guarded by
// CRON_SECRET inside the handler.
export async function GET(request: Request) {
  return handleSourceScanRequest(request);
}

export async function POST(request: Request) {
  return handleSourceScanRequest(request);
}

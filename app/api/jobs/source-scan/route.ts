import { handleSourceScanRequest } from "@/lib/scan/api";

export const dynamic = "force-dynamic";

// Vercel Cron triggers a GET; POST is allowed for manual/admin runs. Both are guarded by
// CRON_SECRET inside the handler.
export async function GET(request: Request) {
  return handleSourceScanRequest(request);
}

export async function POST(request: Request) {
  return handleSourceScanRequest(request);
}

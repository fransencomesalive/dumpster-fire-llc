import { handleRefinePostingsRequest } from "@/lib/scan/api";

export const dynamic = "force-dynamic";

// Vercel Cron triggers a GET; POST allowed for manual/admin runs. Guarded by CRON_SECRET.
export async function GET(request: Request) {
  return handleRefinePostingsRequest(request);
}

export async function POST(request: Request) {
  return handleRefinePostingsRequest(request);
}

import { handleExpireAccessCodesRequest } from "@/lib/account/expire-access-codes";

export const dynamic = "force-dynamic";

// Vercel Cron triggers a GET; POST allowed for manual/admin runs. Guarded by CRON_SECRET.
export async function GET(request: Request) {
  return handleExpireAccessCodesRequest(request);
}

export async function POST(request: Request) {
  return handleExpireAccessCodesRequest(request);
}

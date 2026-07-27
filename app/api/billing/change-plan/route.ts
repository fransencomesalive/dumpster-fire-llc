import { handleChangePlanRequest } from "@/lib/billing/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleChangePlanRequest(request);
}

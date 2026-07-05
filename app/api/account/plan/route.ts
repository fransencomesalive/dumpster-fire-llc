import { handleGetAccountPlanRequest } from "@/lib/account/access-codes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleGetAccountPlanRequest(request);
}

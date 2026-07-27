import { handleCreatePortalRequest } from "@/lib/billing/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleCreatePortalRequest(request);
}

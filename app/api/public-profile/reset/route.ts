import { handleProfileResetRequest } from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleProfileResetRequest(request);
}

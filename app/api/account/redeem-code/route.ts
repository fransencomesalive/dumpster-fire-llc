import { handleRedeemAccessCodeRequest } from "@/lib/account/access-codes";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleRedeemAccessCodeRequest(request);
}

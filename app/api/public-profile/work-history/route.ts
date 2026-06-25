import {
  handleWorkHistorySectionGetRequest,
  handleWorkHistorySectionPatchRequest,
} from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleWorkHistorySectionGetRequest(request);
}

export async function PATCH(request: Request) {
  return handleWorkHistorySectionPatchRequest(request);
}

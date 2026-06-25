import {
  handleWritingSamplesSectionGetRequest,
  handleWritingSamplesSectionPatchRequest,
} from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleWritingSamplesSectionGetRequest(request);
}

export async function PATCH(request: Request) {
  return handleWritingSamplesSectionPatchRequest(request);
}

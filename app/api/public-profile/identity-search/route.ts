import {
  handleIdentitySearchSectionGetRequest,
  handleIdentitySearchSectionPatchRequest,
} from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleIdentitySearchSectionGetRequest(request);
}

export async function PATCH(request: Request) {
  return handleIdentitySearchSectionPatchRequest(request);
}

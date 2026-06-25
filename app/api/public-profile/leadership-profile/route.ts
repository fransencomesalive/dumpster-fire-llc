import {
  handleLeadershipProfileSectionGetRequest,
  handleLeadershipProfileSectionPatchRequest,
} from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleLeadershipProfileSectionGetRequest(request);
}

export async function PATCH(request: Request) {
  return handleLeadershipProfileSectionPatchRequest(request);
}

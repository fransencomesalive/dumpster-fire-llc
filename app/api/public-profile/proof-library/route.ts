import {
  handleProofLibrarySectionGetRequest,
  handleProofLibrarySectionPatchRequest,
} from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProofLibrarySectionGetRequest(request);
}

export async function PATCH(request: Request) {
  return handleProofLibrarySectionPatchRequest(request);
}

import {
  handleQualityNarrativeSectionGetRequest,
  handleQualityNarrativeSectionPatchRequest,
} from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleQualityNarrativeSectionGetRequest(request, "ai_misreadings");
}

export async function PATCH(request: Request) {
  return handleQualityNarrativeSectionPatchRequest(request, "ai_misreadings");
}

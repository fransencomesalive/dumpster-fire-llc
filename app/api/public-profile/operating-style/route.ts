import {
  handleQualityNarrativeSectionGetRequest,
  handleQualityNarrativeSectionPatchRequest,
} from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleQualityNarrativeSectionGetRequest(request, "operating_style");
}

export async function PATCH(request: Request) {
  return handleQualityNarrativeSectionPatchRequest(request, "operating_style");
}

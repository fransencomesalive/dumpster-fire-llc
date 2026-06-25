import {
  handleQualityNarrativeSectionGetRequest,
  handleQualityNarrativeSectionPatchRequest,
} from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleQualityNarrativeSectionGetRequest(request, "why_people_hire_me");
}

export async function PATCH(request: Request) {
  return handleQualityNarrativeSectionPatchRequest(request, "why_people_hire_me");
}

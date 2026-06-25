import {
  handleOutreachRulesSectionGetRequest,
  handleOutreachRulesSectionPatchRequest,
} from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleOutreachRulesSectionGetRequest(request);
}

export async function PATCH(request: Request) {
  return handleOutreachRulesSectionPatchRequest(request);
}

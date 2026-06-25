import {
  handleSkillsInventorySectionGetRequest,
  handleSkillsInventorySectionPatchRequest,
} from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleSkillsInventorySectionGetRequest(request);
}

export async function PATCH(request: Request) {
  return handleSkillsInventorySectionPatchRequest(request);
}

import {
  handleVoicePersonalitySectionGetRequest,
  handleVoicePersonalitySectionPatchRequest,
} from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleVoicePersonalitySectionGetRequest(request);
}

export async function PATCH(request: Request) {
  return handleVoicePersonalitySectionPatchRequest(request);
}

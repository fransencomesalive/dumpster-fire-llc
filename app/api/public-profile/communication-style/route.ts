import {
  handleCommunicationStyleSectionGetRequest,
  handleCommunicationStyleSectionPatchRequest,
} from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleCommunicationStyleSectionGetRequest(request);
}

export async function PATCH(request: Request) {
  return handleCommunicationStyleSectionPatchRequest(request);
}

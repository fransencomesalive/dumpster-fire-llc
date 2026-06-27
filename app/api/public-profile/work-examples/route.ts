import {
  handleWorkExamplesSectionGetRequest,
  handleWorkExamplesSectionPatchRequest,
} from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleWorkExamplesSectionGetRequest(request);
}

export async function PATCH(request: Request) {
  return handleWorkExamplesSectionPatchRequest(request);
}

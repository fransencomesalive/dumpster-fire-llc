import {
  handleResumeUploadsSectionGetRequest,
  handleResumeUploadsSectionPatchRequest,
} from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleResumeUploadsSectionGetRequest(request);
}

export async function PATCH(request: Request) {
  return handleResumeUploadsSectionPatchRequest(request);
}

import {
  handleFitSignalsSectionGetRequest,
  handleFitSignalsSectionPatchRequest,
} from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleFitSignalsSectionGetRequest(request);
}

export async function PATCH(request: Request) {
  return handleFitSignalsSectionPatchRequest(request);
}

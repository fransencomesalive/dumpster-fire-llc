import {
  handleRoleTracksSectionGetRequest,
  handleRoleTracksSectionPatchRequest,
} from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleRoleTracksSectionGetRequest(request);
}

export async function PATCH(request: Request) {
  return handleRoleTracksSectionPatchRequest(request);
}

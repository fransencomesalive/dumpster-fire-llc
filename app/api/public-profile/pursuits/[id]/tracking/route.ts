import { handlePublicProfilePursuitTrackingRequest } from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handlePublicProfilePursuitTrackingRequest(request, id);
}

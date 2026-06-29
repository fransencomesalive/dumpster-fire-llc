import { handlePublicProfilePursuitReadRequest } from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handlePublicProfilePursuitReadRequest(request, id);
}

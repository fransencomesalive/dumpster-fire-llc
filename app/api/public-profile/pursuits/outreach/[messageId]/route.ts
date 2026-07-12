import { handlePublicProfilePursuitOutreachMessageUpdateRequest } from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await context.params;
  return handlePublicProfilePursuitOutreachMessageUpdateRequest(request, messageId);
}

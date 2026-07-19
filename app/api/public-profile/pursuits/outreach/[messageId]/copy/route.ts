import { handlePublicProfilePursuitMessageCopyRequest } from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await context.params;
  return handlePublicProfilePursuitMessageCopyRequest(request, messageId);
}

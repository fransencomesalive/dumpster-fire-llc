import { handlePublicJobFromLinkRequest } from "@/lib/public-jobs/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handlePublicJobFromLinkRequest(request);
}

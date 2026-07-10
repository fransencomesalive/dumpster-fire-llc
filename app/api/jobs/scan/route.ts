import { handlePublicJobsScanRequest } from "@/lib/public-jobs/api";

export const dynamic = "force-dynamic";
// The scan now live-fetches the user's private company boards (up to 6, 12s abort each)
// before matching — give the function budget beyond the default.
export const maxDuration = 60;

export async function POST(request: Request) {
  return handlePublicJobsScanRequest(request);
}

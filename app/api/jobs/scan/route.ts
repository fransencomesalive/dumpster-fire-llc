import { handlePublicJobsScanRequest } from "@/lib/public-jobs/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handlePublicJobsScanRequest(request);
}

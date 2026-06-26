import { handlePublicJobsGetRequest } from "@/lib/public-jobs/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handlePublicJobsGetRequest(request);
}

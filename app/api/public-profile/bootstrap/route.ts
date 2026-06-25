import { handlePublicProfileBootstrapRequest } from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handlePublicProfileBootstrapRequest(request);
}

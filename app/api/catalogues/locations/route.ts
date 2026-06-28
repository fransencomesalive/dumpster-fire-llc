import { handlePublicProfileCatalogueSearchRequest } from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handlePublicProfileCatalogueSearchRequest(request, "locations");
}

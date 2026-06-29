import {
  handlePublicProfilePursuitCreateRequest,
  handlePublicProfilePursuitsListRequest,
} from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handlePublicProfilePursuitsListRequest(request);
}

export async function POST(request: Request) {
  return handlePublicProfilePursuitCreateRequest(request);
}

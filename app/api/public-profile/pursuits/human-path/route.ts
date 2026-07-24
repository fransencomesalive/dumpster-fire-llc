import { handlePublicProfilePursuitHumanPathRequest } from "@/lib/public-profile/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handlePublicProfilePursuitHumanPathRequest(request);
}

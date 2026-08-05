import { handleLinkHealthRequest } from "@/lib/scan/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return handleLinkHealthRequest(request);
}

export async function POST(request: Request) {
  return handleLinkHealthRequest(request);
}

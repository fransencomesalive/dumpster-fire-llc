import {
  handlePublicJobBoardAddRequest,
  handlePublicJobBoardsGetRequest,
  handlePublicJobBoardRemoveRequest,
} from "@/lib/public-jobs/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handlePublicJobBoardsGetRequest(request);
}

export async function POST(request: Request) {
  return handlePublicJobBoardAddRequest(request);
}

export async function DELETE(request: Request) {
  return handlePublicJobBoardRemoveRequest(request);
}

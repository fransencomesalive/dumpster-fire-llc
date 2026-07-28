import type { ResolvedBoard } from "../scan/sources/board-registry";
import { textFromHtml } from "../scan/sources/connectors";

// A pasted job link and a scanned board are the same posting reached two ways.
// The scan path reads the ATS's structured API; the paste path used to fetch the
// public web page and reverse-engineer it out of HTML, which fails outright on
// boards that render in the browser. When a pasted URL resolves to a board we
// already know how to talk to, read the same API the scan uses: no model call,
// no shell-page problem, and the fields arrive labeled.
export type BoardPosting = {
  title: string;
  companyName: string;
  description: string;
};

export type BoardPostingResult =
  | { status: "ok"; posting: BoardPosting }
  // The board is known but this URL has no single-posting API path; the caller
  // falls back to the HTML reader rather than failing.
  | { status: "not_applicable" }
  | { status: "unavailable" };

export type BoardPostingDependencies = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const GEM_POSTING_QUERY = `
  query ExternalJobPostingQuery($boardId: String!, $extId: String!) {
    oatsExternalJobPosting(boardId: $boardId, extId: $extId) {
      title
      descriptionHtml
      job {
        teamDisplayName
      }
      jobPostSectionHtml {
        introHtml
        outroHtml
      }
      compensationHtml
    }
  }
`;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Greenhouse: /{token}/jobs/{id}, or any host carrying ?gh_jid={id}.
// Ashby and Lever: /{token}/{id}.
function postingIdFromUrl(url: URL, provider: ResolvedBoard["provider"]): string | undefined {
  const embedded = url.searchParams.get("gh_jid");
  if (provider === "greenhouse" && embedded) return embedded;

  const parts = url.pathname.split("/").filter(Boolean);
  if (provider === "greenhouse") {
    const jobsIndex = parts.indexOf("jobs");
    return jobsIndex >= 0 ? parts[jobsIndex + 1] : undefined;
  }
  if (provider === "ashby" || provider === "lever") return parts[1];
  return undefined;
}

async function fetchJson(
  endpoint: string,
  dependencies: BoardPostingDependencies,
  request: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<unknown | undefined> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(endpoint, {
      method: request.method ?? "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "The Job Market Is a Dumpster Fire job-link ingestion",
        ...request.headers,
      },
      body: request.body,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function postingFrom(title: string, companyName: string, description: string): BoardPostingResult {
  const cleanTitle = title.trim();
  const cleanCompany = companyName.trim();
  const cleanDescription = description.trim();
  if (!cleanTitle || !cleanCompany || !cleanDescription) return { status: "unavailable" };
  return {
    status: "ok",
    posting: { title: cleanTitle, companyName: cleanCompany, description: cleanDescription },
  };
}

async function fetchGemPosting(
  url: URL,
  board: ResolvedBoard,
  dependencies: BoardPostingDependencies,
): Promise<BoardPostingResult> {
  if (url.hostname.toLowerCase() !== "jobs.gem.com") return { status: "not_applicable" };

  const parts = url.pathname.split("/").filter(Boolean);
  const boardId = parts[0];
  const postingId = parts[1];
  if (!boardId || !postingId) return { status: "not_applicable" };

  const payload = await fetchJson(
    "https://jobs.gem.com/api/public/graphql",
    dependencies,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "ExternalJobPostingQuery",
        variables: { boardId, extId: postingId },
        query: GEM_POSTING_QUERY,
      }),
    },
  );
  if (payload === undefined) return { status: "unavailable" };

  const posting = asRecord(asRecord(asRecord(payload).data).oatsExternalJobPosting);
  const job = asRecord(posting.job);
  const sections = asRecord(posting.jobPostSectionHtml);
  const description = [
    asText(sections.introHtml),
    asText(posting.descriptionHtml),
    asText(sections.outroHtml),
    asText(posting.compensationHtml),
  ]
    .map(textFromHtml)
    .filter(Boolean)
    .join("\n\n");

  return postingFrom(
    asText(posting.title),
    asText(job.teamDisplayName) || board.companySlug,
    description,
  );
}

export async function fetchBoardPosting(
  sourceUrl: string,
  board: ResolvedBoard,
  dependencies: BoardPostingDependencies = {},
): Promise<BoardPostingResult> {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return { status: "not_applicable" };
  }

  const gemPosting = await fetchGemPosting(url, board, dependencies);
  if (gemPosting.status !== "not_applicable") return gemPosting;

  if (board.provider !== "greenhouse" && board.provider !== "ashby" && board.provider !== "lever") {
    return { status: "not_applicable" };
  }

  const postingId = postingIdFromUrl(url, board.provider);
  if (!postingId) return { status: "not_applicable" };
  const token = encodeURIComponent(board.atsBoardToken);

  if (board.provider === "greenhouse") {
    const payload = await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${token}/jobs/${encodeURIComponent(postingId)}?content=true`,
      dependencies,
    );
    if (payload === undefined) return { status: "unavailable" };
    const job = asRecord(payload);
    return postingFrom(
      asText(job.title),
      asText(job.company_name) || board.companySlug,
      textFromHtml(asText(job.content)),
    );
  }

  // Ashby and Lever publish the whole board; select the pasted posting by id.
  const endpoint = board.provider === "ashby"
    ? `https://api.ashbyhq.com/posting-api/job-board/${token}`
    : `https://api.lever.co/v0/postings/${token}?mode=json`;
  const payload = await fetchJson(endpoint, dependencies);
  if (payload === undefined) return { status: "unavailable" };

  const listings = board.provider === "ashby"
    ? asRecord(payload).jobs
    : payload;
  if (!Array.isArray(listings)) return { status: "unavailable" };

  const match = listings.find((entry) => asText(asRecord(entry).id) === postingId);
  if (!match) return { status: "unavailable" };
  const job = asRecord(match);

  if (board.provider === "ashby") {
    return postingFrom(
      asText(job.title),
      board.companySlug,
      asText(job.descriptionPlain) || textFromHtml(asText(job.descriptionHtml)),
    );
  }

  return postingFrom(
    asText(job.text),
    board.companySlug,
    asText(job.descriptionPlain) || textFromHtml(asText(job.description)),
  );
}

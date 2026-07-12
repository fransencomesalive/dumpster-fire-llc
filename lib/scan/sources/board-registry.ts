import type { SourceProvider } from "./types";

export type ResolvedBoard = {
  provider: SourceProvider;
  atsBoardToken: string;
  careersUrl: string;
  companySlug: string;
  confidence: "exact" | "guess";
};

export type BoardResolution =
  | { status: "resolved"; board: ResolvedBoard }
  | { status: "blocked"; reason: string }
  | { status: "unrecognized" };

function titleFromSlug(value: string) {
  return value
    .replace(/[-_.]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
    .replace(/\bAi\b/g, "AI")
    .trim();
}

function resolved(provider: SourceProvider, token: string, careersUrl: string, confidence: "exact" | "guess" = "exact"): BoardResolution {
  return {
    status: "resolved",
    board: {
      provider,
      atsBoardToken: token,
      careersUrl,
      companySlug: titleFromSlug(token),
      confidence,
    },
  };
}

function genericCompanySlug(hostname: string) {
  const host = hostname.replace(/^www\./, "");
  const parts = host.split(".").filter(Boolean);
  return parts.length > 1 ? parts.at(-2) ?? parts[0] : parts[0] ?? "";
}

function isUnsafeGenericHost(hostname: string) {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (hostname === "example.com" || hostname.endsWith(".example.com")) return true;
  if (/^(?:127|10)\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  const private172 = hostname.match(/^172\.(\d{1,3})\./);
  return private172 ? Number(private172[1]) >= 16 && Number(private172[1]) <= 31 : false;
}

export function resolveBoardFromUrl(rawUrl: string): BoardResolution {
  let url: URL;

  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { status: "unrecognized" };
  }

  const hostname = url.hostname.toLowerCase();
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (url.protocol !== "http:" && url.protocol !== "https:") return { status: "unrecognized" };

  if (hostname === "job-boards.greenhouse.io" || hostname === "boards.greenhouse.io") {
    const token = pathParts[0] ?? "";
    if (!token) return { status: "unrecognized" };
    return resolved("greenhouse", token, `https://job-boards.greenhouse.io/${token}`);
  }

  if (hostname === "jobs.ashbyhq.com") {
    const token = pathParts[0] ?? "";
    if (!token) return { status: "unrecognized" };
    return resolved("ashby", token, `https://jobs.ashbyhq.com/${token}`);
  }

  if (hostname === "jobs.lever.co") {
    const token = pathParts[0] ?? "";
    if (!token) return { status: "unrecognized" };
    return resolved("lever", token, `https://jobs.lever.co/${token}`);
  }

  if (hostname === "ats.rippling.com") {
    const org = pathParts[0] ?? "";
    if (!org) return { status: "unrecognized" };
    return resolved("html", org, `https://ats.rippling.com/${org}/jobs`);
  }

  if (hostname === "apply.workable.com") {
    const account = pathParts[0] ?? "";
    if (!account || account === "api") return { status: "unrecognized" };
    return resolved("html", account, `https://apply.workable.com/api/v1/widget/accounts/${account}?details=true`);
  }

  if (hostname === "jobs.gem.com" || hostname.endsWith(".gem.com")) {
    return { status: "blocked", reason: "Gem job-board API is login-gated; do not scrape. Reach these roles through keyed aggregator APIs or manual finds." };
  }

  const greenhouseEmbedId = url.searchParams.get("gh_jid");
  if (greenhouseEmbedId) {
    const tokenFromQuery = url.searchParams.get("for") ?? "";
    const hostBase = hostname.replace(/^www\./, "").split(".")[0] ?? "";
    const token = tokenFromQuery || hostBase;
    if (!token) return { status: "unrecognized" };
    return resolved("greenhouse", token, `https://job-boards.greenhouse.io/${token}`, tokenFromQuery ? "exact" : "guess");
  }

  if (url.username || url.password || isUnsafeGenericHost(hostname)) return { status: "unrecognized" };

  const token = genericCompanySlug(hostname);
  if (!token) return { status: "unrecognized" };
  url.hash = "";
  return resolved("html", token, url.toString(), "guess");
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getJobSearchAuthState } from "../../auth";
import { resolveBoardFromUrl } from "../../board-registry";
import { createCompany, importCompanies, updateCompany, type CompanyCreate, type CompanyUpdate } from "../../store";
import type { CompanyStatus, SourceProvider } from "../../types";

const companyStatuses = new Set<CompanyStatus>([
  "active",
  "paused",
  "deprioritized",
  "do_not_apply",
]);

const sourceProviders = new Set<SourceProvider>(["greenhouse", "lever", "ashby", "icims", "workday", "magnit", "html"]);
const importFields = [
  "companyName",
  "websiteUrl",
  "careersUrl",
  "atsProvider",
  "atsBoardToken",
  "industryBucket",
  "remoteLikelihood",
  "status",
  "notes",
];

async function requireCompanyAuth() {
  const authState = getJobSearchAuthState(await cookies());
  if (!authState.authenticated) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return null;
}

function cleanScore(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function inferSourceProvider(careersUrl: string): SourceProvider {
  const resolution = resolveBoardFromUrl(careersUrl);
  if (resolution.status === "resolved") return resolution.board.provider;

  const lowerUrl = careersUrl.toLowerCase();
  if (lowerUrl.includes("anthropic.com/careers")) return "greenhouse";
  if (lowerUrl.includes("block.xyz/careers")) return "greenhouse";
  if (lowerUrl.includes("openai.com/careers")) return "ashby";
  if (lowerUrl.includes("greenhouse.io")) return "greenhouse";
  if (lowerUrl.includes("lever.co")) return "lever";
  if (lowerUrl.includes("ashbyhq.com")) return "ashby";
  if (lowerUrl.includes("icims.com")) return "icims";
  if (lowerUrl.includes("myworkdayjobs.com") || lowerUrl.includes("workdayjobs.com")) return "workday";
  if (lowerUrl.includes("directsource.magnitglobal.com")) return "magnit";
  return "html";
}

function inferBoardToken(careersUrl: string, provider: SourceProvider) {
  const resolution = resolveBoardFromUrl(careersUrl);
  if (resolution.status === "resolved" && resolution.board.provider === provider) {
    return resolution.board.atsBoardToken;
  }

  const lowerUrl = careersUrl.toLowerCase();
  if (provider === "greenhouse" && lowerUrl.includes("anthropic.com/careers")) return "anthropic";
  if (provider === "greenhouse" && lowerUrl.includes("block.xyz/careers")) return "block";
  if (provider === "ashby" && lowerUrl.includes("openai.com/careers")) return "openai";

  try {
    const url = new URL(careersUrl);
    if (provider === "greenhouse") {
      const tokenFromQuery = url.searchParams.get("for");
      if (tokenFromQuery) return tokenFromQuery.trim();
    }

    if (provider === "workday") {
      const pathParts = url.pathname.split("/").filter(Boolean);
      const site = pathParts.find((part) => part.toLowerCase() !== "en-us" && part.toLowerCase() !== "en") ?? "";
      const tenant = url.hostname.split(".")[0] ?? "";
      return tenant && site ? `${tenant}/${site}` : "";
    }

    if (provider === "magnit") {
      const parts = url.pathname.split("/").filter(Boolean);
      return parts.length >= 2 ? parts.slice(0, 2).join("/") : "";
    }

    if (provider === "icims" || provider === "html") return "";

    const firstPathSegment = url.pathname.split("/").filter(Boolean)[0];
    return firstPathSegment ?? "";
  } catch {
    return "";
  }
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let currentCell = "";
  let insideQuote = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === "\"" && insideQuote && nextCharacter === "\"") {
      currentCell += "\"";
      index += 1;
      continue;
    }

    if (character === "\"") {
      insideQuote = !insideQuote;
      continue;
    }

    if (character === "," && !insideQuote) {
      cells.push(currentCell.trim());
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  cells.push(currentCell.trim());
  return cells;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function mapHeaderToField(header: string) {
  const normalizedHeader = normalizeHeader(header);
  const aliases: Record<string, string> = {
    company: "companyName",
    companyname: "companyName",
    name: "companyName",
    website: "websiteUrl",
    websiteurl: "websiteUrl",
    site: "websiteUrl",
    careers: "careersUrl",
    careersurl: "careersUrl",
    jobboard: "careersUrl",
    jobboardurl: "careersUrl",
    sourceurl: "careersUrl",
    ats: "atsProvider",
    atsprovider: "atsProvider",
    provider: "atsProvider",
    boardtoken: "atsBoardToken",
    atsboardtoken: "atsBoardToken",
    token: "atsBoardToken",
    industry: "industryBucket",
    industrybucket: "industryBucket",
    remotelikelihood: "remoteLikelihood",
    remote: "remoteLikelihood",
    status: "status",
    notes: "notes",
  };

  return aliases[normalizedHeader] ?? "";
}

function parseCompanyImportText(importText: string): unknown[] {
  const trimmedText = importText.trim();
  if (!trimmedText) return [];

  try {
    const parsed = JSON.parse(trimmedText) as { companies?: unknown } | unknown[];
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { companies?: unknown }).companies)) {
      return (parsed as { companies: unknown[] }).companies;
    }
  } catch {
    // Continue to CSV/list parsing.
  }

  const lines = trimmedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const firstCells = splitCsvLine(lines[0]);
  const headerFields = firstCells.map(mapHeaderToField);
  const hasHeader = headerFields.some(Boolean) && headerFields.includes("companyName");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line) => {
    const cells = line.includes("\t") ? line.split("\t").map((cell) => cell.trim()) : splitCsvLine(line);
    const company: Record<string, string> = {};

    if (hasHeader) {
      cells.forEach((cell, index) => {
        const field = headerFields[index];
        if (field) company[field] = cell;
      });
      return company;
    }

    cells.forEach((cell, index) => {
      const field = importFields[index];
      if (field) company[field] = cell;
    });
    return company;
  });
}

function cleanCompanyPayload(body: Partial<CompanyCreate>): CompanyCreate | null {
  if (typeof body.companyName !== "string" || !body.companyName.trim()) return null;

  const careersUrl = cleanText(body.careersUrl);
  const provider = typeof body.atsProvider === "string" && sourceProviders.has(body.atsProvider as SourceProvider)
    ? body.atsProvider as SourceProvider
    : inferSourceProvider(careersUrl);
  const status = typeof body.status === "string" && companyStatuses.has(body.status as CompanyStatus)
    ? body.status as CompanyStatus
    : "active";
  const atsBoardToken = cleanText(body.atsBoardToken) || inferBoardToken(careersUrl, provider);

  return {
    companyName: body.companyName.trim(),
    websiteUrl: cleanText(body.websiteUrl),
    careersUrl,
    atsProvider: provider,
    atsBoardToken,
    industryBucket: cleanText(body.industryBucket) || "uncategorized",
    remoteLikelihood: cleanScore(body.remoteLikelihood),
    notes: cleanText(body.notes),
    status,
  };
}

export async function PATCH(request: Request) {
  const authError = await requireCompanyAuth();
  if (authError) return authError;

  const body = await request.json().catch(() => null) as ({ companyId?: unknown } & Partial<CompanyUpdate>) | null;

  if (!body || typeof body.companyId !== "string") {
    return NextResponse.json({ error: "Expected companyId." }, { status: 400 });
  }

  const update = cleanCompanyPayload(body);

  if (!update) {
    return NextResponse.json({ error: "Expected valid company details." }, { status: 400 });
  }

  return NextResponse.json(await updateCompany(body.companyId, update));
}

export async function POST(request: Request) {
  const authError = await requireCompanyAuth();
  if (authError) return authError;

  const body = await request.json().catch(() => null) as (Partial<CompanyCreate> & { companies?: unknown; importText?: unknown }) | null;

  const importRows = body && Array.isArray(body.companies)
    ? body.companies
    : typeof body?.importText === "string"
      ? parseCompanyImportText(body.importText)
      : null;

  if (importRows) {
    const cleanedCompanies = importRows
      .map((company) => cleanCompanyPayload(company as Partial<CompanyCreate>))
      .filter((company): company is CompanyCreate => Boolean(company));

    if (cleanedCompanies.length === 0) {
      return NextResponse.json({ error: "Expected at least one valid company." }, { status: 400 });
    }

    const result = await importCompanies(cleanedCompanies);

    return NextResponse.json({
      ...result.dashboardState,
      importSummary: {
        requested: importRows.length,
        imported: result.imported,
        created: result.created,
        updated: result.updated,
        skipped: importRows.length - cleanedCompanies.length,
      },
    });
  }

  const company = body ? cleanCompanyPayload(body) : null;

  if (!company) {
    return NextResponse.json({ error: "Expected valid company details." }, { status: 400 });
  }

  return NextResponse.json(await createCompany(company));
}

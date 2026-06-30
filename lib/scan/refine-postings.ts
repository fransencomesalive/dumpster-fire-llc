// Phase 2 gap-fill: LLM-extract Responsibilities / Required experience for jobs the heuristic
// parser left empty, and fill only the empty buckets. Bounded per run (LLM cost). Source-scan
// preserves these columns (see lib/scan/source-scan.ts) so a fill is not clobbered by the daily scan.
import type { PublicProfileRepositoryRequest } from "../public-profile/repository";
import type { ParsedPosting } from "./sources/parse-posting";
import { extractPostingSectionsLLM, type PostingExtractInput, type PostingModelCall } from "./sources/llm-extract-posting";

export type JobNeedingSections = {
  id: string;
  title: string;
  company_name: string;
  description: string;
  responsibilities: string[] | null;
  required_experience: string[] | null;
};

export type PostingRefinementResult = {
  ranAt: string;
  processed: number;
  updated: number;
};

export type PostingRefinementOptions = {
  loadJobs?: (request: PublicProfileRepositoryRequest, limit: number) => Promise<JobNeedingSections[]>;
  extract?: (input: PostingExtractInput) => Promise<ParsedPosting>;
  callModel?: PostingModelCall;
  now?: () => string;
  limit?: number;
};

const DEFAULT_LIMIT = 25;

function qs(params: Record<string, string>) {
  return `?${new URLSearchParams(params).toString()}`;
}

async function defaultLoadJobs(
  request: PublicProfileRepositoryRequest,
  limit: number,
): Promise<JobNeedingSections[]> {
  return request<JobNeedingSections[]>("jobs", {
    query: qs({
      or: "(responsibilities.eq.{},required_experience.eq.{})",
      select: "id,title,company_name,description,responsibilities,required_experience",
      order: "scraped_at.desc",
      limit: String(limit),
    }),
  });
}

export async function runPostingRefinement(
  request: PublicProfileRepositoryRequest,
  options: PostingRefinementOptions = {},
): Promise<PostingRefinementResult> {
  const now = options.now?.() ?? new Date().toISOString();
  const loadJobs = options.loadJobs ?? defaultLoadJobs;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const extract = options.extract
    ?? ((input: PostingExtractInput) => extractPostingSectionsLLM(input, { callModel: options.callModel }));

  const jobs = await loadJobs(request, limit);
  let updated = 0;

  for (const job of jobs) {
    const currentResponsibilities = job.responsibilities ?? [];
    const currentRequired = job.required_experience ?? [];

    const llm = await extract({
      title: job.title,
      companyName: job.company_name,
      description: job.description,
    });

    // Fill only the empty buckets; never overwrite a bucket the heuristic already populated.
    const responsibilities = currentResponsibilities.length > 0 ? currentResponsibilities : llm.responsibilities;
    const requiredExperience = currentRequired.length > 0 ? currentRequired : llm.requiredExperience;

    const filled = responsibilities.length > currentResponsibilities.length
      || requiredExperience.length > currentRequired.length;
    if (!filled) continue;

    await request("jobs", {
      method: "PATCH",
      query: qs({ id: `eq.${job.id}` }),
      body: {
        responsibilities,
        required_experience: requiredExperience,
        updated_at: now,
      },
    });
    updated += 1;
  }

  return { ranAt: now, processed: jobs.length, updated };
}

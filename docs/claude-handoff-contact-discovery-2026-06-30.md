# Claude Handoff — Contact Discovery (Human Path) — next session

## Why this is the priority
The homepage now **leads** with the value prop: *find the person to contact → generate a powerful,
informative message in the user's voice* (revised 2026-06-30, commit `ca50b90`).

- ✅ **Message generation in the user's voice** is built + wired: `lib/public-profile/outreach-generator.ts`,
  used by `generateOutreachForContact` in `lib/public-profile/api.ts` (~line 1381).
- ❌ **Contact discovery ("find the person") is NOT built** in the public app. The default provider is
  `unavailableHumanPathProvider` (`lib/public-profile/pursuits/human-path.ts`) → returns
  `provider_unavailable`. So the #1 homepage promise dead-ends today.

Randall (2026-06-30): the LEGACY version had working contact discovery — validate it, test it, then
port or fix. Do NOT pick a brand-new provider blind.

## The legacy implementation (it worked)
`app/scans/api/contacts/route.ts` (448 lines) — this is the working reference.

- **Engine:** OpenAI (`import OpenAI from "openai"`), model `process.env.JOB_SEARCH_CONTACT_MODEL ?? "gpt-4.1"`,
  Responses API with the **web search tool**: `tools: [{ type: "web_search" }]`,
  `include: ["web_search_call.action.sources"]`. Returns `source: "web_search"`.
- **System prompt (lines ~28-46):** "Use web search to identify REAL people who plausibly influence
  hiring… Method: identify the function that owns the role → management layer one level above → that
  leader's boss → recruiter/talent. Rank: Hiring Manager, Functional Leader, Recruiter, Long Shot.
  Never invent names/titles/URLs — every contact must come from a real search result you can cite with
  an evidenceUrl. Prefer people reachable on LinkedIn." (Full guardrails in the file + referenced
  `app/scans/job_search_context_for_codex.md` §7 + §10.)
- **Parsing/normalization (lines ~70-160):** `parseResearchedContacts`, confidence normalization
  (0-1 or 0-100), contact-type mapping (hiring_manager/functional_leader/recruiter/…), evidence/URL
  extraction, title/seniority filtering.
- **Env:** needs `OPENAI_API_KEY` (+ optional `JOB_SEARCH_CONTACT_MODEL`). Not currently in `.env.local`
  (only `ANTHROPIC_API_KEY`, Supabase keys, `SUPABASE_ACCESS_TOKEN`).
- **Legacy types:** `ContactSuggestion` in `app/scans/types.ts`.

## The public target (where it plugs in)
- Seam: `HumanPathProvider` in `lib/public-profile/pursuits/types.ts` (input: pursuit + job; output:
  `{ status: "generated"; contacts: HumanPathContact[] }` | `{ status: "provider_unavailable"; reason }`).
- Default (stub): `unavailableHumanPathProvider` in `lib/public-profile/pursuits/human-path.ts`.
- Injected in `lib/public-profile/api.ts` ~line 1163: `const provider = options.humanPathProvider ?? unavailableHumanPathProvider;`
  (handler `handlePublicProfilePursuitHumanPathRequest`). Contact type: `HumanPathContact`
  (name, title, companyName, linkedinUrl?, email?, contactType, confidence, relevanceReason,
  roleConnection, verificationNotes[]). Persistence: `persistHumanPathGeneration` in
  `lib/public-profile/pursuits/repository.ts` (writes `contact_suggestions`).
- Human Path is metered — subscription enforcement already exists (`lib/public-profile/subscription/`).

## Plan (next session)
1. **Read** the legacy file end to end: `app/scans/api/contacts/route.ts` (+ `job_search_context_for_codex.md`
   §7/§10). Understand the request shape, the tool config, and the parse/rank logic.
2. **Validate the legacy version works**: add `OPENAI_API_KEY` to `.env.local` (Randall provides),
   run the legacy `/scans` contacts endpoint against a sample job (legacy `/scans` is access-code
   gated), confirm it returns real, cited contacts. Note anything broken (model name `gpt-4.1` still
   valid? web_search tool shape current with the installed `openai` SDK version?).
3. **Decide the model** (Randall): keep OpenAI `gpt-4.1` + web_search (needs `OPENAI_API_KEY`), OR
   reimplement with Anthropic web search (claude + `web_search` tool) to match the public AI
   convention (`callModel`/opus, `ANTHROPIC_API_KEY` already present). Legacy prompt + parse logic
   port either way.
4. **Port** into a real provider: `lib/public-profile/pursuits/contact-provider.ts` implementing
   `HumanPathProvider` — reuse the legacy system prompt + parse/rank, map results → `HumanPathContact[]`
   with `verificationNotes`/evidence URLs. Graceful no-key degradation (fall back to
   `provider_unavailable`, same convention as the outreach generator).
5. **Wire** it as the default provider (replace `unavailableHumanPathProvider` at the api.ts seam),
   keeping the metered Human Path usage checks.
6. **Test**: fixture test (mock the model call) for parse/rank/mapping + a live smoke test; then the
   pursuit human-path flow returns real contacts → the already-built outreach generator drafts the
   message → the homepage's lead promise is real end to end.

## Starting point for the next session
Begin at step 1 (read `app/scans/api/contacts/route.ts` fully) and step 2 (validate legacy). The
model decision (step 3) needs Randall + possibly `OPENAI_API_KEY`. Everything downstream (outreach
generation, persistence, subscription metering, pursuit UI) already exists.

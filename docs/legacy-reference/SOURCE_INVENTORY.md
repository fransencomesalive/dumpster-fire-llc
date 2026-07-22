# Dumpster Fire Source Inventory

This is the canonical inventory for broad job-board/source coverage. Do not keep ad-hoc source lists in code, chat, or scattered docs without updating this file.

Every source must have a status and blocker/evidence note:

- `ready`: implemented or safe to implement with public/no-key access.
- `blocked`: cannot be fetched directly because of login, anti-bot, or policy/credential constraints.
- `needs_key`: has an official API but needs a user/app key before implementation.
- `needs_proof`: likely possible, but needs endpoint proof before implementation.
- `targeted_company_source`: belongs in the user/company career-page array, not broad-market coverage.

## Source Mandate

Dumpster Fire search has two first-class source arrays:

1. Broad job boards/sources searched by the candidate criteria.
2. Targeted company career-page sources added by the user/candidate.

Both arrays feed the same normalize → dedupe → match → rank flow. Targeted company sources are not a substitute for broad-market coverage.

## Targeted Company ATS Sources

These sources are incorporated through user/company watchlist rows, not generated broad-market defaults. They should be counted as `targeted_company_source` coverage unless a separate broad-board product/feed exists.

| Source | Status | Access | Current note |
| --- | --- | --- | --- |
| Greenhouse job boards | targeted_company_source | Public JSON board API, no key | Incorporated for company rows with a Greenhouse board token through `https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`. This is API polling of public board data, not HTML scraping of `greenhouse.io` pages. Current private rows include Anthropic and Block. |
| Lever postings | targeted_company_source | Public JSON postings API, no key | Incorporated for company rows with a Lever board token through the public postings endpoint. |
| Ashby job boards | targeted_company_source | Public JSON posting API, no key | Incorporated for company rows with an Ashby board token; current private row includes OpenAI. |
| iCIMS boards | targeted_company_source | Public iframe/HTML job cards | Incorporated for company rows with public iCIMS job-card pages; parse cautiously because detail quality varies. |
| Workday CXS boards | targeted_company_source | Public CXS API, no key | Incorporated for compatible `myworkdayjobs.com` company rows using the CXS endpoint pattern. |
| Magnit DirectSource boards | targeted_company_source | Public HTML board | Incorporated for broad Magnit and company/program boards where public job cards are available. |

## Implemented Broad Sources

| Source | Status | Access | Current note |
| --- | --- | --- | --- |
| Remotive | ready | Public JSON API, no key | Implemented via `https://remotive.com/api/remote-jobs?search=...` with multiple profile-derived query variants (2026-06-11). Observed cap ~28 rows per query regardless of search term; treat as shallow coverage. Requires attribution/link-back if displayed externally. |
| Himalayas | ready | Public JSON API, no key | Implemented via `https://himalayas.app/jobs/api/search`; max `20` jobs/request. The restored source map uses 20 title/query variants and the connector paginates up to 3 pages per query with early stop when a page returns under 20 rows. Measured reality: most queries return fewer than 20 total, so per-query inventory is shallow; total broad inventory across all variants is roughly 280-380 rows per scan. Requires link-back/source attribution when displayed externally. |
| Workable aggregate search | ready | Public JSON API, no key | Implemented via `https://jobs.workable.com/api/v1/jobs` with mapped title variants, remote workplace, and United States location filters. This is the cross-company Workable search feed, separate from targeted company widget rows. |
| RemoteJobs.org | needs_proof | Public JSON API, no key, currently rate-limited | Connector support exists for `GET https://remotejobs.org/api/v1/jobs`, but generated defaults are disabled after repeated live `429` responses. Re-enable only with stable backoff/caching or a verified rate-safe query policy. Requests visible “Powered by RemoteJobs.org” attribution when displaying listings. |
| Arbeitnow | ready | Public JSON API, no key | Implemented via `https://arbeitnow.com/api/job-board-api`; remote/EU-heavy feed with JSON rows. |
| Remote OK | ready | Public JSON API, no key | Implemented via `https://remoteok.com/api`; rate-limited public feed. |
| Magnit Direct Sourcing | ready | Public HTML board | Implemented existing broad source row. |
| Career Nest | needs_proof | Public feed currently fails live scan | Removed from generated defaults after repeated `fetch failed` scan output; re-add only after endpoint proof is stable. |
| We Work Remotely | ready | Public RSS feeds, no key | HTML pages still return `403`, but category RSS feeds are open (proven 2026-06-11). Generated defaults poll `remote-product-jobs.rss` and `remote-management-and-finance-jobs.rss`; titles are `Company: Title`, location from `region`/`country` tags, full HTML description included. |
| Indeed | blocked | Public page currently returns `403` in live scan | No direct unauthenticated connector should be treated as reliable; use official/partner path only if available. |

## Ready Candidates To Add

| Source | Status | Access | Evidence/blocker |
| --- | --- | --- | --- |
| No current scan-clean candidates | needs_proof | TBD | Add candidates here only after endpoint proof and update `generatedBroadSources()` in the same change if they become defaults. |

## Name-To-Board Resolutions (2026-06-12)

Randall supplied 8 company names to test name-based incorporation:

| Company | Resolution | Notes |
| --- | --- | --- |
| JumpCloud | lever/`jumpcloud` (25 jobs) | Careers page embeds Lever links; NOTE: Lever API 404s without a User-Agent header, always send one when probing. |
| DoorDash | greenhouse/`doordashusa` (449 jobs) | Token is `doordashusa`, not `doordash`. |
| Accenture | workday `accenture/AccentureCareers` | Found via myworkdayjobs link on careers page. KNOWN LIMITATION: Workday CXS fetch returns first 20 postings only; for giant tenants this misses most inventory. Future fix: per-variant `searchText` in the CXS POST body. |
| space150 | Workable account `space150` (7 jobs) | New Workable widget API support added (`apply.workable.com/api/v1/widget/accounts/{account}?details=true`); full descriptions and `telecommuting` remote flags. Board-registry resolves `apply.workable.com` posting URLs. |
| Instacart | already on watchlist (greenhouse/`instacart`) | Duplicate correctly detected. |
| Autodesk | already on watchlist (workday) | Duplicate correctly detected. |
| Apple | no public ATS API | `jobs.apple.com` is a custom/anti-bot system; do not scrape. Apple Contingent Workforce (Magnit) row remains the pollable Apple-adjacent source; direct Apple roles reachable via Adzuna. |
| Mekanism | no ATS at all | Hires via `jobs@mekanism.com`; nothing to poll. Not added. |

## ATS Providers Pending Implementation

| Source | Status | Access | Evidence/blocker |
| --- | --- | --- | --- |
| Rippling ATS boards | targeted_company_source | Public board pages with embedded `__NEXT_DATA__` JSON | Proven 2026-06-11 via Episode1: board pages at `ats.rippling.com/{org}/jobs` embed the job list (title, url, department, locations with workplaceType). Handled by the `html` provider with a Rippling-specific parser; listings carry no description, so matching uses the thin-content stretch path and review hydration fetches detail pages. |
| Gem ATS boards | blocked | Login-gated API | Proven blocked 2026-06-11: `jobs.gem.com` is an SPA shell and every `/api/...` probe 302-redirects to `jobs.gem.com/login`. Do not scrape. Gem-hosted roles (e.g., Fetch, a consumer rewards company, not gaming) are reachable only via keyed aggregator APIs or manual finds. The board-registry resolver reports Gem URLs as blocked. |

## Aggregator Reality Note (2026-06-11)

Most of Randall's manual finds carried `utm_source=Otta`. Otta / Welcome to the Jungle is an aggregator over the startup ATS universe (Greenhouse, Ashby, Lever, etc.). There is **no public cross-company search API for Greenhouse or Ashby**; their public APIs are strictly per-board-token. Aggregation across them is exactly what Otta licenses/crawls and what keyed APIs (Adzuna, Careerjet) approximate legally. Strategy: per-company watchlist rows for boards Randall cares about, plus keyed aggregator APIs for broad discovery. Do not attempt to scrape Otta/WTTJ (login-gated, already classified blocked).

## Original Backlog Sources

| Source | Status | Access | Evidence/blocker |
| --- | --- | --- | --- |
| TalentNet tenant boards | needs_proof | Tenant API likely exists | Architecture notes identify `/api/community/jobs/search` as the likely endpoint, but exact unauthenticated request shape still needs proof. |
| Welcome to the Jungle | blocked | App-root/login barrier | Architecture notes say provided app root redirects to login; use only specific public company/job URLs or authorized API access. |
| Levels.fyi | needs_proof | Unknown/public classification pending | Must classify page/API behavior before implementation; do not assume scrapeability. |
| Blockchain Headhunter | needs_proof | Unknown/public classification pending | Must classify page/API behavior before implementation; do not assume scrapeability. |
| Paradigm | needs_proof | Unknown/public classification pending | Must classify whether this is broad board, niche board, or targeted company page before implementation. |
| WorkWithUs | needs_proof | Unknown/public classification pending | Must classify page/API behavior before implementation; do not assume scrapeability. |

## Keyed/API Candidates

These can expand coverage, but require credentials/configuration before they can be marked ready.

| Source | Status | Access | Evidence/blocker |
| --- | --- | --- | --- |
| Adzuna | ready (keyed) | Official REST API, keys in `ADZUNA_APP_ID`/`ADZUNA_APP_KEY` env vars | LIVE 2026-06-12: generated broad sources query `api.adzuna.com/v1/api/jobs/us/search/1` per profile title variant with `title_only` + `what_and=remote` + `max_days_old=30`. Credentials are injected at fetch time only and must never appear in stored `careersUrl`, diagnostics, or cards. Predicted salaries (`salary_is_predicted: "1"`) are dropped during normalization so they cannot trip the comp-floor gate; posted salaries are kept. Descriptions are ~500-char snippets (thin-content/hydration paths handle detail); `redirect_url` resolves to the original posting for hydration. First live scan: 20 query sources, 284 fetched, 52 included, 0 errors. Respect free-tier limits (~250 calls/day); 20 calls per scan. |
| Careerjet | needs_key | Official partner API | Official docs require Basic auth API key plus `user_ip` and `user_agent` params. |
| USAJOBS | needs_key | Official API | Official docs require an API key for Search jobs. |
| Reed | needs_key | Official API | Developer docs require API key; mostly UK-focused. |
| Findwork | needs_key | Developer API | Developer docs/API directories indicate API-key access. |
| Jooble | needs_key | API key | Public docs/examples require API key. |
| The Muse | needs_key | API/key status to verify | API directories describe a jobs/company API; verify current official access before implementation. |

## Rejected Defaults

| Source | Status | Reason |
| --- | --- | --- |
| LinkedIn Jobs | blocked | Do not scrape login/account-bound job boards or store credentials. LinkedIn can be user-provided context or future partner-gated access only. |
| Glassdoor | blocked | Login/anti-automation risk; use official/partner access only. |
| ZipRecruiter | needs_key | Treat as official/partner integration only; do not scrape public pages. |

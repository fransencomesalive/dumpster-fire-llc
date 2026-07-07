# Pre-Launch QA Audit — Task List

Date started: 2026-07-05 (Randall)
Owner: **Codex** performs these audits pre-launch. Claude seeds/queues items here;
Codex executes and reports findings.

Purpose: a single running list of QA-audit-type checks to run before invites go out.
These are verification/audit passes (find + document, sometimes fix), distinct from the
build roadmap in `docs/completion-roadmap-2026-07-04.md`. Launch-blocking infra items
(credential rotation, Google sign-in end-to-end, relay go-live) stay tracked in the
completion roadmap / `docs/project-todo.md`; this file is for QA sweeps.

## How to use

- Each item has: scope, surfaces to check, method, and a findings placeholder.
- Fixes to anything flagged may be design-gated or copy-gated (AGENTS.md) — document
  first, then fix under the appropriate approval.
- Keep items numbered so Randall can respond by number.

---

## 1. Public-copy scaffold / agent / provider leak audit

Status: **QUEUED** (deferred from Phase 5 fill-in, 2026-07-05 — Randall assigned to the
pre-launch Codex audit rather than doing it inline).

Scope: verify no public-facing surface exposes internal implementation language —
platform/deployment terms, agent/tool notes, AI-vendor names, backend/provider details,
roadmap/recovery-session commentary, or scaffold copy. (AGENTS.md "Public Product Copy
Boundary" + Phase 9 verify item.)

Surfaces to check:
- Homepage (`/`) — copy, metadata, OG tags.
- Onboarding (`/onboarding`) — section labels, help text, empty states, status messages.
- Dashboard (`/dashboard`) and any pursuit/jobs UI copy.
- Legal pages (`/legal/*`).
- API responses that surface user-facing strings (error messages, blocked-feature copy).
- `<title>`, meta description, and any share/OG image alt text.
- Any styleguide/mock routes that could be publicly reachable (`/styleguide`).

Watch-list terms (non-exhaustive): "scaffold", "agent", "provider", "Supabase",
"Anthropic/Claude/OpenAI/GPT", "Vercel", "webhook", "migration", "backend", "roadmap",
"recovery", "Human Path provider", model IDs, "beta/rollout" (banned per positioning),
"proof/Proof Library" (banned — use "work examples/portfolio").

Method: static scan of `app/**` copy + rendered-DOM check at each route; grep for the
watch-list terms; cross-check against the banned-vocabulary rules in AGENTS.md.

Findings: _not yet run._

---

## 2. (add next item here)

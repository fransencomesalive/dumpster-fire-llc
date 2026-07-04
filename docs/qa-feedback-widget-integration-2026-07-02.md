# QA Feedback Widget + QA Agent Relay Integration

Date: 2026-07-02
Status: built + verified locally end-to-end. Production deploy of the relay is deferred (see
"Outstanding work").

## What this is

A persistent comment box on every page, for every user (signed in or not), that relays
reports to a dedicated QA agent ("PhredBot" in the design system). The QA agent triages each
report into a ticket and — once Telegram is wired — notifies the owner with approve/reject
actions (GitHub issue, user reply, task packet).

## Map

```
Browser (any page)
  └─ QAFeedbackWidget (app/QAFeedbackWidget.tsx, mounted once in app/layout.tsx)
       │  POST /api/qa-report   { user_message, user_contact?, system_context }
       ▼
  Next.js proxy route (app/api/qa-report/route.ts)
       │  validates + whitelists fields, injects app_version (VERCEL_GIT_COMMIT_SHA)
       │  POST ${QA_AGENT_URL}/api/reports    (server-side; agent has no CORS)
       ▼
  QA agent relay — separate service, NOT in this repo
  ~/Sites/dumpster-fire-relay (provisioned from ~/Sites/QA-AGENT via `npm run install:new`)
       │  triage → ticket (prefix JOB) in data/relay-store.json
       ▼
  [deferred] Telegram owner notification → approve/reject → GitHub issue / user reply
```

The relay is a standalone QA-AGENT install: project_id `the-job-market-is-a-dumpster-fire`,
port 8787, JSON file store, planned bot `@TheJobMarketIsADumpsterPhredBot`. One project =
one relay app; it is never embedded in the Next.js build.

## Design authority

- Dock launcher: `design-system/components/footer.html` ("Persistent feedback dock", the
  PhredBot mount point). Ported verbatim: tomato pill disc, speech-bubble icon,
  label slips open on hover/focus/open, bluebird active state, `z-index: 50`,
  pinned `right/bottom: var(--space-5)`.
- Panel: `design-system/components/qa-feedback.html` (new card, registered in
  `_ds_manifest.json` + `index.html`), derived from the `feedbackBox` pattern in
  `design-system/components/feedback.html`. Class names match `QAFeedbackWidget.module.css`
  so the card and component port back and forth wholesale.

## Files in this repo

| File | Role |
|---|---|
| `app/QAFeedbackWidget.tsx` | Client widget: dock + panel, draft persistence, fail-soft submit |
| `app/QAFeedbackWidget.module.css` | Dock CSS from footer.html + panel CSS from qa-feedback.html; DS tokens only |
| `app/api/qa-report/route.ts` | Server proxy; the only place that talks to the relay |
| `app/layout.tsx` | Single mount inside `appContentLayer` |
| `design-system/components/qa-feedback.html` | DS card for the panel states |
| `.env.example` | `QA_AGENT_URL=` (server-only; no `NEXT_PUBLIC_` prefix) |

## Contract (proxy → relay)

`POST ${QA_AGENT_URL}/api/reports` with only these fields (whitelisted, never spread from
the client body — the relay rejects server-owned keys):

- `source`: `"qa-feedback-widget"` (fixed)
- `user_message`: required, trimmed, 1–5000 chars (else the proxy 400s)
- `user_contact`: optional, ≤320 chars
- `system_context`: `url` (≤2000), `browser` (≤400), `device` (mobile|tablet|desktop),
  `signed_in` (boolean from presence of the public access token), `app_version`
  (server-injected commit SHA, `"dev"` locally)

Proxy responses: `200 {ok, ticket_id}`, `400 invalid_message|invalid_json`,
`503 qa_agent_unconfigured` (env unset), `502 qa_agent_unavailable` (relay down/timeout 5s).
The widget treats every non-ok as "Couldn't send right now. Try again later." and keeps the
draft. The widget can never throw into the app.

## Behavior notes

- Draft persists in localStorage (`dumpster-fire-qa-feedback-draft`), restored when the
  dock is opened, cleared on successful send.
- After "Feedback saved" the panel auto-collapses (~2s).
- z-index 50: above page content (`appContentLayer` z 1), below scans modals (z 200).

## Verified (2026-07-02, local)

- `install:new` provision, relay `preflight`, `healthz`/`readyz`.
- curl through proxy → ticket `JOB-002` with correct source + system_context;
  empty message → 400; relay stopped → 502 and the app keeps working.
- Headless Chromium: full submit flow shows "Feedback saved" (ticket `JOB-003`), draft
  survives reload, 0 horizontal overflow at 320/375/390px, clean at 1280/1440px, no console
  errors. `npm run lint` (0 errors) + `npx tsc --noEmit` clean.

## Outstanding work (deferred, in order)

1. **Deploy the relay** (its own service — Vercel serverless does not fit; it needs a
   persistent process + disk or Postgres). Set `HOST=0.0.0.0`, `PUBLIC_BASE_URL`; for
   durable storage set `DATABASE_URL` and run `npm run db:prepare`. A `Dockerfile` exists
   in the relay app.
2. **Telegram**: create `@TheJobMarketIsADumpsterPhredBot` via BotFather (manual), then in
   the relay app `npm run telegram:handoff`, set the token env, `npm run telegram:setup`.
3. **Vercel env**: set `QA_AGENT_URL` (production + preview) to the deployed relay URL.
   Until then production submits fail soft with the friendly error — nothing breaks.
4. The relay directory has no git repo/remote yet (cross-machine sync gap).

NOT VERIFIED: production behavior on Vercel (env unset there today — expected fail-soft,
step 3 above is the exact verification: set env, submit from prod, check relay tickets).

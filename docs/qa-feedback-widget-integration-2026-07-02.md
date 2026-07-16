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

## Outstanding work — CLOSED 2026-07-16 (deployed + verified live)

All three deferred steps are done (Randall chose Mac Studio + tunnel over a cloud host):

1. **Relay deployed**: runs on the Mac Studio as LaunchAgent `com.dumpsterfire.qa-relay`
   (RunAtLoad + KeepAlive, `HOST=127.0.0.1 PORT=8787`, logs in `~/Library/Logs/qa-relay*`).
   Storage: JSON file store (`data/relay-store.json`) — durable enough on a persistent
   machine; `DATABASE_URL` remains available if that ever changes.
2. **Public URL**: ngrok static endpoint `https://polygon-contents-hybrid.ngrok-free.dev`
   (account authtoken registered; URL is stable across restarts) via LaunchAgent
   `com.dumpsterfire.qa-tunnel` pinned with `--url=`. `PUBLIC_BASE_URL` set accordingly.
3. **Telegram live**: `@TheJobMarketIsADumpsterPhredBot` created via BotFather, token
   verified (getMe), Randall's admin chat id discovered + written, webhook registered at
   `/api/telegram/webhook/the-job-market-is-a-dumpster-fire`. Preflight 19 PASS.
4. **Vercel env**: `QA_AGENT_URL` set on production + preview via the API (token in the
   relay `.env` as `VERCEL_TOKEN`), redeploy `22b1f76`.

VERIFIED LIVE 2026-07-16: `POST /api/qa-report` on production returned
`{"ok":true,"ticket_id":"JOB-007"}`; ticket confirmed in the relay store. (Earlier smoke
tickets: JOB-005 local, JOB-006 through the tunnel.)

Remaining gaps (small): the relay directory still has no git remote (cross-machine sync
gap); intake reliability equals Studio uptime (reports fail soft with the friendly error
while the machine is asleep); if the widget's KEEP-DRAFT path ever needs the ngrok
browser interstitial bypassed, add the `ngrok-skip-browser-warning` header in the proxy
(server-to-server JSON has not needed it). Rotation list: the ngrok authtoken passed
through chat on 2026-07-15; the bot token and Vercel token were file-dropped and did not.

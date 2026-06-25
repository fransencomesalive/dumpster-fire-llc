# Dumpster Fire

A private dumpster-fire intelligence dashboard for scoring role fit, triaging leads, tracking outreach, and keeping the morning search workflow sharp.

## Settings
- Route: /scans
- Local command: npm run experiment:dev -- --slug dumpster-fire
- Index: auto-discovered from app/scans/page.tsx
- Preview: live iframe fallback until a preview image is declared

## Architecture Notes
- Current version is a static architecture prototype, not a connected production app.
- Future production path should add approved-email auth, Supabase-backed tables, scheduled ATS scans, deterministic scoring, selective AI analysis, and email digests.
- Keep user resume/profile inputs private when this is ported for public use.

## Public Surface Rules
- Do not display platform, deployment, agent, or AI-vendor names, logos, badges, or default scaffold copy.
- Keep the experiment self-contained in app/scans/.
- Keep local-only notes and source packages out of user-facing UI.

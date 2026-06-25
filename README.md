# The Job Market Is a Dumpster Fire

Standalone public site for `www.thejobmarketisadumpsterfire.com`.

## Current Routes

- `/` public holding page, ready to be replaced by the markdown-driven landing page.
- `/onboarding` public onboarding shell wired to the public profile section manifest.
- `/api/public-profile/bootstrap` authenticated candidate profile bootstrap endpoint.
- `/api/public-profile/regenerate` authenticated public profile regeneration endpoint.
- `/api/public-profile/identity-search` authenticated Identity/Search section read and autosave endpoint.
- `/api/public-profile/role-tracks` authenticated Role Tracks section read and autosave endpoint.
- `/api/public-profile/resumes` authenticated Resume Uploads section read and autosave endpoint.
- `/api/public-profile/work-history` authenticated Work History section read and autosave endpoint.
- `/api/public-profile/proof-library` authenticated Proof Library section read and autosave endpoint.
- `/api/public-profile/skills` authenticated Skills Inventory section read and autosave endpoint.
- `/api/public-profile/why-people-hire-me` authenticated Why People Hire Me narrative section read and autosave endpoint.
- `/api/public-profile/operating-style` authenticated Operating Style narrative section read and autosave endpoint.
- `/api/public-profile/decision-style` authenticated Decision Style narrative section read and autosave endpoint.
- `/api/public-profile/communication-style` authenticated Communication Style section read and autosave endpoint.
- `/api/public-profile/ai-misreadings` authenticated AI Misreadings narrative section read and autosave endpoint.
- `/api/public-profile/writing-samples` authenticated Writing Samples section read and autosave endpoint.
- `/api/public-profile/outreach-rules` authenticated Outreach Rules section read and autosave endpoint.
- `/api/public-profile/leadership-profile` authenticated Leadership Profile section read and autosave endpoint.
- `/scans` private scan dashboard ported from the working Dumpster Fire implementation.
- `/scans/admin/tuning` private match tuning dashboard.

## Local Development

```bash
npm install
npm run dev
```

For local private dashboard access, set `DUMPSTER_FIRE_ACCESS_CODE` and `DUMPSTER_FIRE_SESSION_SECRET` in `.env.local`.
Production fails closed unless both values are configured.

For local public profile API work, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and at least one `SUPABASE_AUTH_*_ENABLED` flag. Public profile API requests use a Supabase Auth bearer token.

## Data

Supabase schema and migrations live in `supabase/`. The scan dashboard falls back to in-memory data only when Supabase env vars are absent.

## Next Build Steps

- Resolve quality-scoring/remediation guidance for onboarding weak fields.
- Add production auth-provider polish for Google/Apple and post-auth redirects.
- Replace the holding page with the final public landing page after the foundation paths are stable.

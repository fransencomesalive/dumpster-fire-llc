# Architecture

## App Structure

- `/` is the public site entry point.
- `/scans` is the private dashboard and scan workflow.
- `/scans/admin/tuning` is the private tuning dashboard.
- `/scans/api/*` owns dashboard state, connector scans, contacts, settings, onboarding profile compilation, and apply-copy generation.

## Auth

Private scan routes are access-code gated by default.

Required production env:
- `DUMPSTER_FIRE_ACCESS_CODE`
- `DUMPSTER_FIRE_SESSION_SECRET`

Compatibility env still accepted where useful:
- `JOB_SEARCH_ACCESS_CODE`
- `JOB_SEARCH_SESSION_SECRET`

Production fails closed when the access code or session secret is missing.

## Data

Supabase REST persistence is used when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present. Without those env vars, the private dashboard falls back to in-memory data for local development only.

Schema and migrations live in `supabase/`.

## Public Profiles

Public profile routes are not exposed yet. Before implementation, define which profile fields are public, private, user-controlled, or operational-only.

## Phase 1 Foundation

The public build assumes Supabase Auth for Google, Apple, and Email because the database model says to use an existing auth user table when available and the project already uses Supabase.

Phase 1 public tables live beside, not inside, the legacy private scan tables:
- Public launch tables use names such as `candidate_profiles`, `role_tracks`, `saved_jobs`, and `pursuits`.
- Legacy private scan tables keep the `job_search_*` prefix and continue to support `/scans`.

Structured profile data is the source of truth. `lib/public-profile/profile-markdown.ts` generates portable markdown from a structured aggregate; the markdown should not become the editable source.

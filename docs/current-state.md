# Current State — dumpster-fire-llc

## What this is
Coming soon / waitlist landing page for `thejobmarketisadumpsterfire.com`. Temporary placeholder while the public version of the dumpster-fire job intelligence tool is built.

## Status
LIVE at https://dumpster-fire-llc.vercel.app. Custom domain `thejobmarketisadumpsterfire.com` added to Vercel but DNS not yet configured in GoDaddy.

## Stack
- Next.js 16 App Router, TypeScript, CSS Modules
- Gotham font (local OTF files in `app/fonts/`)
- Original MTTL Grain Background (canvas animation from Wrenching 101 pattern)
- Vercel Blob for waitlist email storage (store: `dumpster-fire-blob`, public access)

## What was built
- `app/LandingPage.tsx` — client component with mascot, headline, body copy, email form, success/error states
- `app/MettleBackground.tsx` — Original MTTL grain animation, green-only palette from dumpster-fire CSS
- `app/landing.module.css` — full page styles, single-viewport layout
- `app/api/waitlist/route.ts` — POST stores email to Vercel Blob (waitlist.json), deduplicates; GET reads list
- `app/icon.png` — dumpster fire mascot as favicon
- `next.config.ts` — `devIndicators: false`

## Grain background palette
Node hex colors are the green values from the Lab26 dumpster-fire experiment's meshBg CSS:
`#1e8c41`, `#0c4b20`, `#158929`, `#0a3716`, `#0e461c`, `#083012`, `#1e8c41`, `#03240a`
Base fill: `#070f0a`. No mustard/amber in background nodes — mustard is UI accent only.

## Deployment
- GitHub: https://github.com/fransencomesalive/dumpster-fire-llc (auto-deploys on push to main)
- Vercel project: `fransencomesalive-4748s-projects/dumpster-fire-llc`
- Blob store: `dumpster-fire-blob` (store_79tDmAWSGDXoDWSM), public access, linked via `BLOB_READ_WRITE_TOKEN`
- To read signups: `GET /api/waitlist`

## Outstanding
- GoDaddy DNS not yet configured for `thejobmarketisadumpsterfire.com` — domain added to Vercel, waiting on DNS
- No OG image — should be added before domain goes live
- Public version of the product (port from Lab26 dumpster-fire experiment) is the next major work

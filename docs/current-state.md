# Current State — dumpster-fire-llc

## What this is
Coming soon / waitlist landing page for `thejobmarketisadumpsterfire.com`. Temporary placeholder while the public version of the dumpster-fire job intelligence tool is built.

## Status
Landing page is built and committed. Not yet deployed.

## Stack
- Next.js 16 App Router, TypeScript, CSS Modules
- Gotham font (local OTF files in `app/fonts/`)
- Original MTTL Grain Background (canvas animation from Wrenching 101 pattern)
- Vercel Blob for waitlist email storage

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

## To deploy
1. Create GitHub repo and push: `git remote add origin <url> && git push -u origin main`
2. Import to Vercel
3. Link a Vercel Blob store (adds `BLOB_READ_WRITE_TOKEN` automatically)
4. Add `thejobmarketisadumpsterfire.com` as custom domain
5. To read signups: `GET /api/waitlist`

## Outstanding
- No GitHub remote yet — needs to be created before Vercel deployment
- No OG image — should be added before domain goes live
- Public version of the product (port from Lab26 dumpster-fire experiment) is the next major work

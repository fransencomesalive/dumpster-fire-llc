# Outreach Message Quality — Session Guide (started 2026-07-13)

Plain outline so any session (Codex or Claude) can pick this up and run with it.
This is the most critical surface in the app: the outreach message IS the product.
Expect **several rounds of refinement**. We are on the right track, not done.

---

## 1. The goal

Fix the quality of the AI-generated outreach messages. Today the "personality" is
turned up way too far: the messages come off as arrogant, over-authoritative, and
templated, with mechanical tics that would turn a hiring manager off. We want messages
that sound genuinely like Randall — human, specific, confident but not puffed up — and
that use his inputs (especially the "opinion I'll defend") as *thinking signals*, not
as brags to paste in.

This is a **subjective, voice-driven** effort. Randall makes the calls on tone. Do not
ship prompt/voice changes to production without his explicit approval of the before/after.

## 2. Why (the triggering example)

Randall's real generated message applying to **Coinbase — Group Product Manager,
Compliance Automation** reproduced every problem at once:

> "I already know where the Coinbase surges get you good coffee. Was Production Lead
> for Base, so I've navigated the compliance-meets-crypto waters over there. Since then
> I built P.H.R.E.D. ... That's the whole game with compliance automation: not the
> output, but keeping it connected... Opinion I'll defend: 99% of people who want AI
> don't understand AI. I do. https://lab26.randallfransen.com/phred"

Structure is correct; the voice is wrong.

## 3. Where the code lives (what we will eventually edit)

All fixes are at the **prompt layer** — no schema/DB changes needed.

- `lib/public-profile/outreach-generator.ts` — the outreach **system prompt** (the
  `systemPrompt` const) + `buildOutreachPromptParts`. This is the main lever.
- `lib/public-profile/voice-fingerprint.ts` — the **"write like this" pre-pass** that
  distills Voice & Personality inputs into the fingerprint block at the top of
  profile.md. `renderVoiceFingerprint` controls how that block reads.
- `lib/public-profile/profile-markdown.ts` — assembles the profile.md that feeds the
  generator (how Q4 opinion, tone tags, work examples, résumé highlights are laid out).

Production surfaces are **protected**: do not edit these files' behavior without Randall's
approval of the resulting message diff (AGENTS.md Design Authority + subjective voice).

## 4. The failure taxonomy (baseline findings)

From an 11-message baseline corpus (the Coinbase original + 10 sampled jobs). Each has a
prompt-layer root cause.

1. **Q4 opinion dumped as a mic-drop brag, label leaking.** 3/11 literally paste
   "Opinion I'll defend: ..." as a closing flex. Root cause: profile feeds `q4Opinion`
   as raw content; no prompt tells the model it's a *thinking sample*, not a quote.
2. **Over-authoritative — lectures the reader on their own field.** "That's the whole
   game with compliance automation..."; "Trust & Safety is really an orchestration
   problem." Root cause: "lead with strongest substance" + no humility guardrail.
3. **Unearned sentence fragments.** "Was Production Lead for Base"; "Force multiplier
   that keeps teams... still happy." Root cause: fingerprint's "open mid-thought" applied
   mechanically → dropped subjects instead of natural contractions.
4. **Nautical tic became a template.** capsize/choppy-water in 6/10 messages. Root cause:
   fingerprint hard-codes two nautical exemplar lines; model reaches for them every time.
5. **P.H.R.E.D. shoehorned everywhere.** Inserted in 8/10 — even the sales and IC-engineer
   roles. One tool "solving" every discipline lowers credibility.
6. **Fake insider familiarity + invented specifics.** "I know how the sausage gets made
   there"; doc count drifts "ten/twelve/seventeen docs" — embellishing a real phrase into
   fabricated precision.

### What already works — protect it
The model is **more nuanced on poor fits than good ones**. When fit is thin it concedes
gracefully and it lands ("This isn't my lane and I won't pretend otherwise..."; "Two
catches worth flagging up front: ... no hard feelings."). That honest, self-aware register
IS the target voice — it just evaporates when the model thinks it has a strong hand.

## 5. The fix levers (agreed direction, refine as we go)

1. Reframe Q4: it informs reasoning about the role; never quote it, never close with it,
   strip the label.
2. Anti-authority guardrail: forbid "the whole game is X" / "this role is really about Y";
   write from experience, don't redefine their field.
3. Demote nautical exemplars to at-most-once flavor, not a required opener.
4. Cap the hero example (P.H.R.E.D.) to genuinely relevant roles; otherwise lead with a
   more relevant highlight or concede.
5. Fragment rule: contractions/mid-thought only after a complete anchoring thought; ban
   dropped-subject cold opens.
6. Ban invented specifics (fabricated numbers, presumed insider vibes).

## 6. The workflow / harness (how to iterate)

Reusable scripts live in `scripts/outreach-quality/` (generated data + corpora are
gitignored — regenerate them; `profile.md` holds personal data).

1. **Pull evidence** — `node scripts/outreach-quality/pull-evidence.mjs`
   Reads `.env.local` (Supabase service role), writes `profile.md`, `scan-jobs.json`,
   `outreach-messages.json` into the same dir.
2. **Generate a corpus** — `node scripts/outreach-quality/gen-baseline.mjs`
   Reproduces the EXACT production prompt and calls `claude-opus-4-8`. Writes
   `baseline-<variant>.md`. Select the prompt with `PROMPT_VARIANT=baseline|v2 node ...`.
   The v2 (and later) system prompts are added to the `systemByVariant` map in that file,
   so you can A/B **the same 10 jobs** across prompt versions without touching prod code.
3. Compare `baseline-baseline.md` vs `baseline-v2.md` side by side; take the before/after
   to Randall.
4. Only after Randall approves a variant: port that variant's changes into the real files
   in §3, then re-verify by generating once more from the true prod code path.

Keep the harness's copied prompt in sync with prod when prod changes, or the A/B lies.

## 7. Status & next steps

- [x] Diagnosis complete; baseline corpus generated; taxonomy above.
- [ ] **NEXT: draft v2 prompts** (levers §5) in `gen-baseline.mjs`'s `systemByVariant`
      map + a revised `renderVoiceFingerprint`, run `PROMPT_VARIANT=v2`, diff vs baseline.
- [ ] Review v2 with Randall; iterate (expect multiple rounds).
- [ ] Once a variant is approved, port to the §3 production files and re-verify from prod.
- [ ] Consider: the fingerprint pre-pass itself is over-tuned (levers 3 & 5 originate
      there) — may need its own revision pass, not just the outreach system prompt.

## 8. Guardrails for whoever picks this up

- Do NOT commit or push without Randall's explicit per-action OK.
- Do NOT edit the production prompt files (§3) until Randall approves the message diff —
  this is subjective voice, his call.
- The harness/corpus work is safe to iterate freely (scratchpad-style, no prod impact).
- Never print secret values from `.env.local`; the scripts only read them.

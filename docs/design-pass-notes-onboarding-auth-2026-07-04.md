# Design-Pass Notes — Onboarding Auth Surface + Homepage Nav (Randall, 2026-07-04)

Captured verbatim from Randall after the domain fix, for a future design pass.
These are DESIGN DIRECTION notes — no implementation is authorized yet. When the
design pass is scoped, this doc is the requirements input; mockups go to the
Claude Design project (Onboarding group) for review per standing rules.

## Onboarding page (`/onboarding`)

1. **Signed-in state:** the "profile completion" sign-in card in the upper right
   must NOT show once the user is signed in. It currently shows regardless.
   The un-signed-in state is also still broken (form renders with dead Save
   buttons — see completion roadmap Phase 0 item 5).
2. **Missing persistent header nav.** The onboarding page should carry the same
   persistent header nav as the rest of the site (the sticky nav shipped on the
   homepage 2026-07-04). It currently has none.
3. **Account bar placement:** the "Account" bar (currently sitting under the
   review sections) should be at the TOP of the page in all cases. Its current
   look "looks horrible" — needs a real design treatment, not the bare bar.
4. **Access code input:** there is no properly styled input field for the access
   code — it needs a correct DS input treatment.
5. **Reload button:** unclear why it exists from a user's perspective. Either
   remove it or justify/redesign it (likely remove: profile loads on sign-in).
6. **Button coloring does not follow the design system.** Apply the standing
   rules: teal = selected/on/saved, tomato = CTA/destructive/avoid; the current
   auth-panel buttons match neither.
7. **"Signed in." label:** should display the account email instead of the
   generic "Signed in." text.
8. **"Review sections" panel:** should only appear when onboarding has errors or
   missing sections at the moment the user tries to save. Otherwise it should
   not be on the page at all.

## Homepage

9. **Sign in / profile nav buttons:** the black pill treatment does not follow
   the design rules — it should be the regular teal button style that already
   exists in the design system.

## Round 2 feedback (Randall, 2026-07-04, on the first "Onboarding Auth & Account" card) — NEXT SESSION STARTS HERE

The first mockup card (synced to Claude Design, Onboarding group) got this feedback.
Rework the card BEFORE any implementation:

1. **State A / account bar — totally wrong.** The mockup conflated the account bar with
   the header design and added the full header menu. The account bar is its own thing —
   do NOT reuse the header/profile-menu structure for it. Redesign from scratch as a
   distinct element.
2. **Halftone/dot pattern is REJECTED.** The mockup pulled the halftone page background
   from the old `login.html` card. Randall: halftone has been rejected in all further
   designs. Remove it from the new card, and treat any halftone usage in older DS cards
   as legacy — do not carry it into new work. (Older cards like `login.html` predate this
   rejection; visual language from old cards must be re-checked against current rules.)
3. **Card structure/navigation:** the review-panel state was effectively hidden inside
   one tall card. Every section/state must be findable in the left-hand dropdown of the
   design system pane — split the states into separately listed cards/sections so each
   appears in that dropdown ("I don't know where it is" = failure of discoverability).
4. **Color semantics DECIDED: teal = positive, tomato = negative.** Go with TEAL for this
   auth/nav system (nav "Create profile" CTA, login primary button). Tomato is for
   negative/destructive only.
5. **New issue spotted: the footer is off grid and the logo is floating.** Scope for the
   next design session: inspect the live homepage footer, identify the grid break and
   the floating logo, and bring it back to the footer card spec
   (`design-system/components/footer.html`).

## Standing context for whoever runs the design pass

- Design authority rules in `AGENTS.md` apply: identify the approved design
  source + exact existing DS component mapping, list files, get scoped approval
  before edits.
- Related pending behavior work: completion roadmap Phase 0 items 4 (email
  sign-up UI once SMTP exists) and 5 (signed-out gating). The auth-panel
  redesign and the sign-up UI should be designed together — one auth surface,
  signed-out (sign in / create account) and signed-in (email shown, access code
  entry) states.
- No eyebrow/kicker labels; no "proof" vocabulary; anti-corporate-speak voice.

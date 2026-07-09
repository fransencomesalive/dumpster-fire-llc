# Résumé parse quality — findings + plan (2026-07-09)

Randall's directive: pressure-test whether the Anthropic-based parse is the problem,
decide whether to augment or replace it, build strong multi-PDF parsing, and give the
user real detail on WHY a résumé parsed weak plus how to fix it (re-export or paste text).

## Findings (pressure test, 2026-07-09)

Test: ran the shipped parser (`lib/public-profile/resume-parse.ts`, claude-opus-4-8,
native PDF) locally against both of Randall's résumés and compared with the rendered PDF.

1. **The weak verdict on the PM résumé is accurate, not a parser failure.** The PDF
   renders as a clean one-column document, but its internal text stream is out of
   order (jobs non-chronological, Professional Summary near the end, `EDUCATION`
   heading with no content after it). Claude extracted 1,056 words of real content and
   correctly diagnosed: "multi-column layout and out-of-order text stream scrambled
   section and job ordering, and the Education section appears empty." Tools that
   "parse it easily" rebuild reading order from glyph geometry rather than trusting
   the stream — they'd silently return the same scrambled order or fix it without
   saying so.
2. **The diagnosis is thrown away.** The scan API returns `issue` + `suggestion`, but
   Card 1 only surfaces problems for `failed` parses; `weak` shows the normal success
   note, `resumes.parsing_issues` is stored empty, and the user never sees why. This
   is the exact UX gap Randall called out.
3. **Verdicts are nondeterministic.** The EP résumé scored `weak` on prod and
   `complete` in the local rerun (same file, same model). No `temperature` is set
   (default 1.0) and the quality rubric is one sentence per grade — borderline files
   flip between runs.
4. **Output ceiling risk:** `max_tokens: 8192` must hold the full résumé text + JSON.
   Fine at 1-2 dense pages (~1,100 words used ≈ well under), but a 4-6 page résumé
   will truncate mid-JSON and read as a failure.
5. **Extraction content is genuinely good:** both résumés produced 6 strong routed
   highlights (AKQA/Nike/Trek, $14MM HTC retainer, Coinbase Base, Mission Squad…);
   scrambled ordering does not currently hurt highlight quality or matching, which
   are quote/keyword-based.

## Plan (in priority order)

- [ ] **P1 — Surface the diagnosis.** Persist `issue`/`suggestion` into
      `resumes.parsing_issues` at Card 1 save, and show a `weak` note in Card 1
      ("Read, but…" + the model's issue + suggestion: fix the export or paste plain
      text). UI state needs a design pass in Claude Design first (Card 1 has ok/err
      notes; a "read with caveats" note is a new state).
- [x] **P2 — Make verdicts deterministic + outcome-based. DONE 2026-07-09.**
      Rubric rewritten to judge the OUTCOME (Randall's directive): the model
      reconstructs reading order itself (expected, does not demote), grades only the
      text it returns, and `weak` requires a nameable extraction defect — content
      visible in the rendered document that the returned text failed to capture.
      Content the document itself lacks (e.g. an empty Education section) is NOT a
      parse defect. `temperature` is rejected on claude-opus-4-8 (sampling params
      removed) — determinism comes from the concrete grade boundaries instead.
      Verified: both résumés now grade `complete` 3/3 runs each with correctly
      ordered text (previously: nondeterministic weak/complete flips + scrambled
      order); blank-PDF negative control still grades `failed`.
- [ ] **P3 — Build a pressure-test corpus + harness.** 10-15 PDFs across generations:
      Word/Google-Docs exports, Figma/Canva designed résumés, two-column layouts,
      scanned image PDFs, long (5+ page) CVs. Script scores each on extraction
      fidelity (order, completeness) and verdict stability. This decides augment vs
      replace with data, not vibes.
- [ ] **P4 — Augment, likely hybrid.** Candidate architecture: deterministic text-layer
      extraction (pdfjs/pdftotext-class) for the raw stream + Claude for reading-order
      reconstruction, cleanup, and the verdict; vision-read fallback for scanned PDFs.
      Keep scan-and-discard (nothing stored but text). Replace only if the corpus
      shows Claude-native losing to alternatives outright.
- [ ] **P5 — Kill the truncation cliff.** Handle `max_tokens` exhaustion: detect
      truncated JSON, continue the extraction in a second turn or raise the ceiling;
      long résumés must degrade to "weak + explain," never to a silent failure.
- [ ] **P6 — Optional rescan path.** After P1-P4 land, existing résumés (Randall's
      included) can be upgraded via Card 1 → Replace; stored text gets clean ordering.

## Answer of record: do Randall's 2026-07-09 scans need a redo?

No. The keyless failures never saved anything (`model_unavailable` → paste-text
fallback); both stored scans ran AFTER the key was added, with the real model. `weak`
is the model's honest note about the PDF's internal ordering, not a degraded scan.
Content and highlights are solid and usable for matching + outreach. Rescan becomes
worthwhile (optional) once P2/P4 improve ordering reconstruction — or sooner if the
source PDF is re-exported with a clean text layer and real Education content.

# Message Generation Cross-Style Validation

Date: 2026-07-13
Status: 28-cell corpus generated and sealed; blind review complete; labeled review pending
Parent track: `docs/message-gen-refinement-track.md`

## Purpose

V3 improved Randall's outreach voice, but one person's calibration cannot become the product's
default voice. Before v4 or any production prompt change, run the same candidate evidence and jobs
through deliberately different onboarding voice configurations. The generator must preserve truth,
fit, respect, and evidence selection while producing materially different writing styles.

## Three-layer contract

### 1. Universal policy

These rules do not change with voice:

- Use only facts supported by the frozen candidate profile and job.
- Consider every Work Example; never bend one to fit.
- Preserve exact Work Example selection metadata.
- Check Role Tracks, résumés, skills, and Work Examples before claiming a capability gap.
- Never criticize the reader, employer, former employer, or their field.
- Never redefine the reader's work as the candidate's familiar problem.
- Q4 is private reasoning input: never quote, announce, or turn it into a judgment about others.
- Use one first touch, at most one relevant link, and no promised follow-up history.
- Never invent facts, counts, responsibilities, insider knowledge, scale transfer, or precision.

### 2. Fit strategy

- Strong/good overlap: lead with the most relevant supported evidence.
- Actionable adjacency: lead with transferable evidence; keep a real caveat subordinate.
- Hard disqualifier/non-match: do not solve it with a style change or a long disclaimer. Flag it as
  a matching/sample problem and exclude it from prompt-tuning signal.

### 3. Voice rendering

Voice controls expression only: cadence, warmth, humor, directness, formality, contractions,
opener shape, and target length inside the universal 750-character ceiling.

Desired input precedence to test:

1. Universal policy.
2. `never_sound` samples, avoid note, and avoid tags as hard negatives.
3. `sounds_like_me` samples as the strongest positive voice evidence.
4. `want_to_sound` as an aspirational adjustment, not a replacement identity.
5. Positive tone chips as coarse modifiers or fallback.

Q1 and Q4 should inform substance and reasoning, not cadence. The production fingerprint pre-pass
currently receives both values. The harness preserves that real behavior and flags verbatim Q1/Q4
copying into a generated fingerprint rather than silently enforcing the desired outcome.

## Frozen matrix

Hold constant across every message:

- Candidate facts, Role Tracks, résumés, skills, and all four Work Examples.
- Q1 and Q4.
- The six v3 good/medium job descriptions and synthesized contacts.
- Model, v3 prompt, generation settings, and Work Example audit.

Vary only the voice inputs and generated fingerprint.

### Full personas: 4 × 6 jobs = 24

1. Minimal/direct: `punchy + no-fluff + blunt + brief`.
2. Warm peer: `warm + specific + casual`.
3. Wry/casual: `funny + punchy + casual + specific`.
4. Calm/polished: restrained samples with custom `measured + thoughtful + plainspoken` tags.

### Diagnostic personas: 2 × 2 sentinel jobs = 4

5. Conflict sentinel: positive chips ask for funny/blunt; actual sample is understated/warm;
   never-sound rejects snark. Hard negatives and actual voice must win.
6. Minimum-input sentinel: one `specific` chip, one sounds-like sample, one never-sound sample,
   and no aspiration/custom data.

Total: 28 messages per prompt variant.

The exact approved v3 prompt SHA-256 and each controlled job input SHA-256 are pinned in
`voice-matrix-personas-v3.json`. Preflight stops if any frozen input changes.

The v3 matrix was generated on 2026-07-13. Its five frozen files pass manifest verification.
Randall completed the eight-message blind voice check on 2026-07-14 with 4/8 correct. Calm/polished
was identified in both jobs; warm peer and minimal/direct were each identified once; wry/casual was
not identified correctly. The labeled 28-cell ratings and prescriptive comments are still pending.

## Measurements

Automated per message:

- Valid JSON and non-empty message.
- Character count and hard-ceiling pass/fail.
- Paragraph/sentence/word counts and average sentence length.
- Contraction, question, exclamation, and link counts.
- Exact Work Example identity or explicit no-example.
- Existing invention, concession, authority, and Q4 trend detectors where applicable.
- Persona-specific target-length pass/fail inside the universal hard ceiling.
- Work Example body/metadata consistency and per-job selection variance across styles.
- Fingerprint Q1/Q4 verbatim-copy diagnostics.

Human review per message, 0–10:

1. Fixture voice adherence.
2. Factual grounding.
3. Job/evidence relevance.
4. Respect and fit handling.
5. Sendability and naturalness.

Also perform the console's eight-message blinded same-job persona-identification check before the
labeled review. Reviewers should be able to tell the intended voices apart without seeing the
configuration.

## Publication and review gates

Structural generation is fail-closed: all six fingerprints and 28 outreach responses must parse,
match the frozen inputs, and carry valid Work Example metadata before the result set is written.
The generated input/result files are sealed by a manifest written last; readers verify every file
hash before accepting the corpus. Mutable human feedback and the scratch Markdown view are not part
of that seal.

Quality and contract findings do not abort publication. They remain attached to their cells so a
bad result cannot disappear from the review sample.

The console separates hard contract failures from heuristic review flags. In particular,
`selected_example_not_obvious` means the selected example's exact one-hitter or link does not appear
in the body; exact selection metadata may still be valid. Reviewers decide whether the paraphrased
evidence is relevant and recognizable.

Before v4:

- 100% valid structure, exact metadata, and no invention.
- Zero high-severity respect, Q4, stretched-evidence, or unsupported-concession violations.
- Each persona averages at least 7/10 for voice adherence and sendability.
- At least 5/6 full-matrix messages per persona score at least 7 for relevance and respect.
- No persona's invariant average trails another by more than one point.
- Diagnostic conflicts follow the declared precedence.
- Work Example selection remains the same across styles or has a documented relevance tie.

This is a regression screen, not statistical proof. Do not port v3 or start v4 until the matrix is
reviewed and the universal/style boundary is accepted.

## Execution boundary

Codex owns the offline harness, preflight, verification, and review preparation. Claude ran the
network generation step: six production fingerprint calls plus 28 outreach calls. The matrix stays
outside `versions.json` and the normal baseline/v2/v3 review history because it is an invariance
experiment, not a new prompt version.

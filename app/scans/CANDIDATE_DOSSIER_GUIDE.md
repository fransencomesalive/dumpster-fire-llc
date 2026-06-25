# Candidate Dossier Prep Guide

How to produce the single markdown dossier that powers outreach generation. The candidate runs ONE session in their own LLM with the materials below and the verbatim prompt. Our system parses the result deterministically: exact headings matter, prose inside them is the candidate's.

## What to gather before the LLM session

1. **Resumes**: every applying-as variant, pasted as text or markdown (for Randall: the Program Director resume and the Executive Producer resume).
2. **Work examples**: a flat list, one line each: `<link or "private"> - <1-2 sentences of context: what it was, what you did, what happened>`. The LLM formats these; you only supply link + context. 5-10 candidates, the LLM keeps the strongest 3-8.
3. **Writing samples**: 3-5 real messages you wrote and liked (LinkedIn outreach, intro emails, application notes). Verbatim, unedited. These define voice; quality matters more than quantity.
4. **Banned phrases**: anything you never want in your outreach (e.g., "I'm confident I would add immediate value", "extensive experience", em dashes).
5. **Constraints**: comp floor, remote/location rule, availability, companies or people not to contact.

## The prompt (paste verbatim into your LLM, attach/paste all materials after it)

```text
You are preparing a "Candidate Dossier" for my job-search outreach system. I am providing: my resume(s), a list of work examples with links and context, several writing samples I wrote myself, a banned-phrase list, and my constraints.

Produce ONE markdown document in EXACTLY the template format at the end of this prompt.

Hard rules:
1. Use only facts present in my materials. Never invent employers, titles, dates, metrics, or outcomes. If a number is not in my materials, do not create one.
2. Derive the Writing Style section from MY writing samples, not from generic professional-tone conventions. Describe how I actually write: sentence length, directness, humor, what I omit.
3. Every Work Example must include at least one concrete metric, scale indicator, or named outcome taken from my materials. If an example has none, list it under "NEEDS INPUT" instead of padding it.
4. Where source material is missing or thin for any field, write a line starting with "NEEDS INPUT:" describing exactly what I should add. Do not fill gaps with plausible-sounding text.
5. Keep every heading EXACTLY as written in the template (same words, same levels, same "Track:"/"Example:"/"Sample:" prefixes). Do not add, rename, or reorder top-level sections. The document is machine-parsed.
6. Proof points and metrics must be phrased so they can be dropped into an outreach message without editing: short, concrete, past tense.
7. Each Work Example gets a "Proves:" line naming which track(s) it supports and a "Keywords:" line of 4-8 lowercase terms a job posting might contain (used to match examples to jobs).
8. Resume Facts must restate my resume bullets faithfully per track: tightened wording is fine, new claims are not.
9. No em dashes anywhere in the document.

Template:

# Candidate Dossier - <my name>
version: 1
updated: <today's date YYYY-MM-DD>

## Identity & Positioning
<one-paragraph positioning: who I am professionally and where I am most useful>
Links:
- Portfolio: <url>
- LinkedIn: <url>
- Site: <url>

## Applying-As Tracks
### Track: <label>
Frame: <one paragraph: what work this lens covers and why I am credible in it>
Target titles: <comma-separated>
Proof points:
- <3-6 bullets, each with a metric or named outcome>
Not this track:
- <2-4 bullets: adjacent work this lens should NOT claim>

(repeat "### Track:" for each applying-as variant, 1-4 total)

## Work Examples
### Example: <short name>
Role: <what I was on it>
Story: <2-4 sentences, concrete, past tense>
Metrics:
- <bullets: numbers, scale, outcomes>
Link: <url or "private">
Proves: <track label(s)>
Keywords: <4-8 lowercase comma-separated terms>

(repeat "### Example:" for 3-8 examples, strongest first)

## Writing Style
Voice: <one paragraph describing how I write, derived from my samples>
Rules:
- DO: <bullets>
- DON'T: <bullets>
Banned: <comma-separated words/phrases never to use>
### Sample: <context, e.g. "LinkedIn outreach to a hiring manager">
<the verbatim sample text>

(repeat "### Sample:" for 2-3 samples)

## Resume Facts
### Resume: <track label>
- <employment bullets exactly as that resume variant states them>

(repeat "### Resume:" once per track)

## Constraints
- Compensation floor: <value>
- Location rule: <e.g. remote, US-eligible, Pacific-to-Eastern timezones>
- Availability: <value>
- Do not contact: <companies/people or "none">

## Outreach Strategy
- Forwardness: <how direct to be with hiring managers>
- Follow-up: <policy>
- Never say: <bullets>
- Channels: <preference order>
```

## What happens on our side

The system parses the headings, shows a validation report (missing sections, examples without metrics, `NEEDS INPUT` items), and nothing is applied until the candidate resolves the gaps they care about. Generation then uses: the Writing Style block verbatim as instructions plus few-shot samples, the 2 work examples whose Keywords best overlap the job's match evidence, and the selected track's frame and proof points. Updates later are section-level: a new case study is one `### Example:` block, a resume revision touches only `## Resume Facts`.

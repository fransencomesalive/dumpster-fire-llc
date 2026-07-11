# Apply Wizard (Human Path) — production port plan

**For a dedicated next session. Do not execute in the session that wrote this — it was
written specifically because that session lacked the context budget to port cleanly.**

Date: 2026-07-11 · Author handoff: Claude (Fable), from a 3-agent read-only audit.

---

## 1. Why this exists (the problem)

The apply wizard ("Human Path") is a **4-step flow** — **Review → Contacts → Outreach →
Track** — that has been designed and confirmed repeatedly. The confusion this plan resolves:
the wizard's **design and backend mechanisms are fully built**, but the **public product's
`/dashboard` "Pursue" button is not wired to any wizard UI** — it only creates a pursuit
record. So a public user can pursue a job and get nothing after the record is created.

This is a wiring/port problem, **not** a "build the wizard from scratch" problem. The port
must be a clean, careful audit-and-connect because production is expected to have everything.

### Second, load-bearing gap (found during audit)
**Nothing in the public app triggers profile compilation.** `profile.md`
(`candidate_profiles.generated_markdown`) is the sole input to outreach generation, yet no
onboarding/dashboard button calls `POST /api/public-profile/regenerate`. Today `profile.md`
is only produced as a side effect of the lazy staleness refresh **inside** the
pursuit-outreach handler — which itself has no UI caller. **The port must guarantee
`profile.md` exists before the Outreach step runs.** (Evidence: agent-3 flag #1.)

---

## 2. Ground truth — the four surfaces

| # | Surface | File(s) | Role in the port |
|---|---------|---------|------------------|
| A | **Homepage approved design** | `app/page.tsx` L28-29 (`humanPathSteps`), L100-278 (carousel); `design-system/components/home-human-path.html` | **Source of truth for step design + copy.** Already written in the public *pursuit* vocabulary (contacts "built automatically when you pursue", CTA "Save pursuit", "never auto-sent"). Static CSS carousel, no data. |
| B | **Legacy functional wizard** | `app/scans/DashboardClient.tsx` `ApplyModal` (defined L1986, rendered L3368); `app/scans/apply-modes.ts`, `apply-copy.ts`, `types.ts` | **Functional reference** for step behavior/UX. **Do NOT lift verbatim** — it runs on the legacy `/scans` data model and its apply-modes + proof objects are hardcoded to one candidate (Randall). |
| C | **Public dashboard (target)** | `app/dashboard/DashboardClient.tsx` `startPursuit` (L364), Pursue button (L533) | **Where the wizard must land.** Currently: single `POST /api/public-profile/pursuits {jobId}` → `saved` pursuit, then a toast. No modal/steps. |
| D | **Public backend (already built)** | `app/api/public-profile/pursuits/*`, `lib/public-profile/pursuits/*`, `lib/public-profile/outreach-generator.ts` | **Fully implemented engine.** Missing only the UI + one per-message endpoint (§5). |

**Port principle:** step *design/copy* comes from **A**, step *behavior* from **B**, data
model + endpoints from **D**, and it all installs into **C**.

---

## 3. The backend is real (so this is a UI port)

Public pursuit lifecycle is an event-sourced state machine
(`lib/public-profile/pursuits/state-machine.ts`, `types.ts`):

`saved → review_complete → human_path_generated → outreach_ready → outreach_sent → applied →
responded → interviewing → offer` (plus `rejected`/`expired`/`deleted`).

Every step already has an endpoint (all delegate to `lib/public-profile/api.ts` handlers):

| Wizard step | Endpoint | Handler (api.ts) | State/effect |
|---|---|---|---|
| create | `POST /api/public-profile/pursuits` | `…PursuitCreateRequest` L1208 | → `saved`, quota `pursuit`, upsert one-per-job |
| 1 Review | `POST …/pursuits/review` | `…PursuitReviewRequest` L1298 | → `review_complete`; stores selectedRoleTrackId/ResumeId/WorkExampleId |
| 2 Contacts (discover) | `POST …/pursuits/human-path` | `…PursuitHumanPathRequest` L1366 | → `human_path_generated`; **real OpenAI `gpt-4.1` + web_search** (`contact-provider.ts`), quota `human_path`, 503 w/o `OPENAI_API_KEY` |
| 2 Contacts (select) | `POST …/pursuits/contacts` | `…PursuitContactSelectionRequest` L1468 | sets `selected_for_outreach` |
| 3 Outreach | `POST …/pursuits/outreach` | `…PursuitOutreachRequest` L1550 | → `outreach_ready`; **real Claude `claude-opus-4-8`** (`outreach-generator.ts`), 1 draft/selected-contact, idempotent, quota `outreach_message`, **lazy-recompiles stale `profile.md` first** (L1592) |
| 4 Track | `POST …/pursuits/status` \| `…/lifecycle` | L1729 / L1791 | outreach_sent/applied/responded/… ; note/expire/delete |
| read one | `GET …/pursuits/[id]` | L1160 | pursuit + job + contacts + messages + events |
| export | `GET …/pursuits/export` | L1040 | JSON/CSV, plan-gated |

Quotas (`lib/public-profile/subscription/{rules,enforcement}.ts`): tester 25 pursuit / 25
human_path / 75 outreach; review/select/track are **not** metered.

---

## 4. Per-step port spec

For each step: build the UI from **A**, behavior from **B**, wire to **D**. Reconcile the
data-model deltas in §6.

### Step 0 · create (on Pursue)
- Replace `startPursuit` toast-only behavior: `POST /pursuits {jobId}` then **open the modal
  at Step 1** using the returned `{ pursuit, job, match }`.
- Guard: create requires a **complete** profile; surface the block if incomplete.

### Step 1 · Review ("Applying as")
- Design (A): mode checkboxes + job review + fit + recommended strategy.
- Behavior (B): `ApplyModal` step 0 (L2197) uses `recommendApplyMode` over 3 hardcoded modes.
- Wire (D): `POST /pursuits/review` with `{ pursuitId, selectedRoleTrackId, selectedResumeId?,
  selectedWorkExampleId? }`. **Map legacy "apply mode" → public role-track selection** — the
  user's own role tracks replace the hardcoded EP/PD/AI modes. (Open decision §7.1.)
- Data gap: public `PublicJobRecord` has **no** `fitBucket / outreachAngle / remoteSystemRead
  / resumeTailoringNotes / riskFlags`. `Pursuit` itself carries `fitSummary / risks /
  outreachAngle` (types L43-46) — derive the Review panel from `match` + `description` +
  `Pursuit`, not from the legacy `Job` fields.

### Step 2 · Contacts
- Design (A): "reporting chain built automatically", contact cards (★ + confidence +
  verified), checkboxes.
- Behavior (B): `ApplyModal` step 1 (L2237) "Research Contacts" → list → select.
- Wire (D): `POST /pursuits/human-path` (discover) then `POST /pursuits/contacts` (select
  `{ contactIds }`). Handle the **503 `provider_unavailable`** path (no `OPENAI_API_KEY`) with
  the "generate a no-contact outreach note" fallback the legacy UI already models.
- Data gap: public `HumanPathContact` uses `confidence: low|medium|high` + `verificationNotes`
  + `contactType` enum `likely_hiring_manager|functional_leader|recruiter|executive_sponsor|
  referral_candidate|unknown` — **not** the legacy numeric `confidenceScore` + `outreachFitRating`
  5-star + `verified`. Re-derive the star/confidence rendering from the public shape.

### Step 3 · Outreach
- Design (A): editable draft, Approve/Reject, "editable draft in your voice — never auto-sent".
- Behavior (B): `ApplyModal` step 2 (L2284) "Generate New Message" → per-contact textareas +
  approve checkbox + reject-reason select; `buildFallbackApplyCopy` local fallback.
- Wire (D): `POST /pursuits/outreach` → persists `GeneratedOutreachDraft[]` at status `draft`.
- **Prereqs before this step can work:** (a) `profile.md` must exist (§1); the handler
  lazy-recompiles if stale but only if the profile is already complete — verify. (b) A
  **per-message approve/edit/send endpoint is MISSING** (§5) — the Approve/Reject UI has no
  backend to write to today.

### Step 4 · Track
- Design (A): pursuit checklist, CTA "Save pursuit".
- Behavior (B): `ApplyModal` step 3 (L2381) free-text `completedActions[]` checklist.
- Wire (D): map the checklist onto `POST /pursuits/status` (outreach_sent/applied/responded/…)
  and `/pursuits/lifecycle` (note_added/expired/deleted). The legacy free-text
  `completedActions[]` has **no** public analog — it must become discrete state transitions.

---

## 5. Backend gaps to close FIRST (prerequisites)

1. **`profile.md` compilation trigger.** Wire `POST /api/public-profile/regenerate` into the
   public flow so a completed profile actually compiles. Candidates: on the profile-complete
   modal's "Start your first scan", on first Pursue, or a background compile. (Agent-3 flag #1.)
   Without this the Outreach step returns `profile_incomplete`.
2. **Per-message approve/edit/send endpoint.** `OutreachMessageStatus` supports
   `draft|approved|sent|rejected` and rows carry `rejection_reason`, but **no handler
   transitions an individual `outreach_messages` row** — only pursuit-level status changes
   exist. Step 3's Approve/Reject/edit needs a new route
   (`PATCH /api/public-profile/pursuits/outreach/[messageId]` or similar). (Agent-2 gap.)
3. **Env keys in production.** Verify `ANTHROPIC_API_KEY` (outreach + voice fingerprint +
   résumé parse/highlights) and `OPENAI_API_KEY` (contact discovery) are provisioned, else the
   whole pipeline degrades to 503 / raw-inputs. (Agent-3 flag #5, agent-2.)
4. **Voice-fingerprint marker parity.** The fingerprint has no table — it's recovered from
   `profile.md` by string-slicing a marker. Confirm `renderVoiceFingerprint`
   (`voice-fingerprint.ts` L151) and the slicer (`service.ts` L96) still use the identical
   marker string, or capped regenerations silently drop the fingerprint. (Agent-3 flag #4.)

---

## 6. Data-model reconciliation (legacy → public)

| Concern | Legacy (`app/scans/types.ts`) | Public | Action |
|---|---|---|---|
| Job | rich `Job` (fitBucket, outreachAngle, remoteSystemRead, resumeTailoringNotes, riskFlags) | `PublicJobRecord` (`lib/public-jobs/types.ts:11`: match{score,label,signals}, responsibilities, requiredExperience, description) + `Pursuit`(fitSummary/risks/outreachAngle) | Derive Review panel from `match`+`description`+`Pursuit`; do not expect legacy `Job` fields |
| Apply mode | 3 hardcoded modes + `recommendApplyMode` + Randall proof objects | per-user `role_tracks` + `Pursuit.selectedRoleTrackId` | Replace modes with role-track selection; discard `apply-modes.ts` / Randall-hardcoded `apply-copy.ts` |
| Contact | numeric `confidenceScore`, `outreachFitRating`1-5, `verified` | `confidence` low/med/high, `verificationNotes`, different `contactType` enum | Re-derive card rendering from public shape |
| Outreach msg | free-form `ApplyWizardGeneratedMessage`, boolean `approved` in a submission blob | first-class `OutreachMessageRecord` w/ `status` enum + `rejectionReason` | Use the persisted record + a new per-message endpoint (§5.2) |
| Persistence | one flat `ApplyWizardSubmission` overwrite | event-sourced `Pursuit`+`PursuitEvent`+usage metering | Track step = discrete transitions, not a submission blob |

---

## 7. Open product decisions (get Randall's call before/at build)

1. **Apply-mode → role-track.** Confirm the public Review step lets the user pick which
   **role track** they're applying as (the `review` endpoint already accepts
   `selectedRoleTrackId`). Is the recommendation auto-selected, or user-chosen?
2. **Where `profile.md` compiles.** On profile completion, on first Pursue, or background?
3. **Design gate.** The public `/dashboard` is a protected surface. Is the **homepage approved
   design the approval for the in-dashboard modal**, or does the modal need its own DS card(s)
   approved first? (Recommend: derive the modal 1:1 from `home-human-path.html`, then a single
   confirmation pass in Claude Design.)

---

## 8. Recommended port sequence

- **Phase 0 — prerequisites (§5):** wire `regenerate`; add per-message endpoint; verify env
  keys; check fingerprint marker parity. Nothing user-visible; unblocks the wizard.
- **Phase 1 — Review:** Pursue opens the modal; wire create + `review`; role-track "applying
  as" selector; Review panel from public data.
- **Phase 2 — Contacts:** `human-path` discover + `contacts` select; 503 fallback path.
- **Phase 3 — Outreach:** `outreach` generate; per-message approve/edit/reject (needs §5.2);
  "never auto-sent" boundary copy.
- **Phase 4 — Track:** checklist mapped to `status`/`lifecycle`; "Save pursuit" close.
- Each phase: (DS card if design-gated) → implement 1:1 → tsc/lint/build/test → **authed E2E**
  on a real profile (this is all behind auth).

---

## 9. Exact files the next session must diff-check

- **Profile ingest / compile:** `lib/public-profile/resume-parse.ts`, `resume-highlights.ts`,
  `profile-generation.ts` (L59), `profile-markdown.ts` (L80), `voice-fingerprint.ts`,
  `service.ts` (L46/L192), `api.ts` handlers `…RegenerationRequest` (L1857) / `…ResumeScan` (L2133).
- **Outreach generation:** `outreach-generator.ts` (L160/L242), `api.ts`
  `…PursuitOutreachRequest` (L1550) + standalone `…OutreachGeneratorRequest` (L2724).
- **Wizard reference:** `app/scans/DashboardClient.tsx` `ApplyModal` (L1986-2434), `apply-modes.ts`,
  `apply-copy.ts`, `app/scans/types.ts` (L61/78/118/137/150/188).
- **Approved design:** `app/page.tsx` (L28-29, L100-278), `design-system/components/home-human-path.html`.
- **Public target + model + endpoints:** `app/dashboard/DashboardClient.tsx` (L364, L533),
  `lib/public-jobs/types.ts` (L11), `lib/public-profile/pursuits/{types,state-machine,
  contact-provider,human-path,repository}.ts`, `app/api/public-profile/pursuits/*`,
  `lib/public-profile/subscription/{rules,enforcement}.ts`.

---

## 10. One-paragraph summary for whoever starts

The Human Path apply wizard is a 4-step flow (Review → Contacts → Outreach → Track). Its
design lives on the homepage (`home-human-path.html`, approved, in pursuit vocabulary), its
behavior lives in the legacy `app/scans` `ApplyModal` (functional but on the wrong data model
and hardcoded to one candidate), and its **entire backend is already built and real** in the
public product (`app/api/public-profile/pursuits/*` + real OpenAI contact discovery + real
Claude outreach generation, state-machine + quota gated). The public `/dashboard` Pursue
button just creates a `saved` pursuit and stops. The job is to **build the 4-step modal into
the public dashboard, wiring the existing public endpoints**, after closing three
prerequisites: trigger `profile.md` compilation, add a per-outreach-message approve/send
endpoint, and verify the AI env keys. Do it phase by phase with an authed end-to-end pass each
phase. Nothing here is speculative — every claim above has a file:line in §9.

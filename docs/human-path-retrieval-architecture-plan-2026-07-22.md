# Human Path Contact Search Plan

Date: 2026-07-23
Status: approved pivot implemented locally on 2026-07-24; deployment pending
Scope: Human Path contact discovery and public-profile validation
Out of scope: company-roster caching, industry matrices, labor-market benchmarks, Apply Wizard
UI/design, public copy, and deployment

## Goal

For a specific job a candidate wants to pursue, find real people who are useful for outreach and
show why each person may be relevant.

The job posting defines the target. A contact's LinkedIn profile and other person-specific public
evidence validate the contact. No predefined list of industries, careers, job families, or title
mappings may control discovery, classification, ranking, or rejection.

## Approved Decision

Use Exa People Search for direct discovery. Keep the implementation narrow: three dynamic search
lanes, exact current-company validation from structured work history, direct LinkedIn profiles,
deduplication, lightweight ranking, honest classification, and uncertainty. Do not add a separate
OpenAI verification stage or a provider-neutral orchestration layer.

The minimum required behavior is:

1. Derive searches from the actual company, exact job title, job description, and named
   organization or team evidence in the posting.
2. Search Hiring Manager, Recruiter, and Functional Leader lanes independently so one category
   cannot suppress another.
3. Preserve real named people through discovery and parsing.
4. Treat provider title and employment data as discovery evidence. The user validates the current
   profile through the direct LinkedIn link before outreach.
5. Judge relevance against the actual job. Treat missing remit evidence as unknown and explicit
   contradictory evidence as conflicting.
6. Rank useful contacts while preserving honest category variety. Do not pad results with
   unrelated people and do not impose a five-contact cap.

Candidate profile context may help explain transferable function, but it cannot override the job
posting or become a contact-selection taxonomy. Candidate target industries are not an approved
substitute for evidence about the job or contact.

## Validation

Offline fixtures validate the software contract only. They use neutral records to prove parsing,
employer reconciliation, exact-title handling, independent contact lanes, uncertainty, conflicts,
and result assembly. They are not evidence that a real contact is relevant.

Live validation uses actual jobs and reviewed LinkedIn profiles. No company is the permanent
validation anchor. For each approved live case, record only:

1. the exact job title, company, and posting text supplied to discovery
2. the contact's direct LinkedIn profile URL
3. the exact current employer and title shown by public profile evidence
4. the person-specific evidence supporting Hiring Manager, Recruiter, or Functional Leader
5. the evidence supporting relevance, uncertainty, or an explicit conflict with the job
6. the expected outcome: include, include with uncertainty, or reject for a stated contradiction

A different product division or business area is not, by itself, an explicit contradiction.
When a contact has current leadership responsibility for the function named in the job, retain
the person as a potentially useful Functional Leader and explain the organizational distance.
Reject only when person-specific evidence shows a genuinely conflicting remit.

Use at least three actual jobs from different employers in a live validation pass. Select them from
real jobs the user is considering, not from a fabricated industry, company-type, seniority, or
hiring-structure matrix. Add an offline regression when a live case exposes a specific software
failure.

Offline gates:

1. Focused contact-discovery fixtures
2. Full fixture suite
3. Typecheck
4. Lint with no new errors
5. Diff check

A paid live run requires explicit approval. Its purpose is to verify that profile-supported
contacts from the approved jobs survive discovery, parsing, evidence validation, and result
assembly. It is not authorization to create a large benchmark or a new provider account.

## Approved Live Reference Set

Approved for provider-comparison validation on 2026-07-23:

1. Autodesk: Principal Program Manager, Design Operations
   - Steffani Aranas: include, Hiring Manager
   - Brian Yoder: include, Functional Leader
   - Lynn B.: include with uncertainty, Recruiter
   - Christiana Lackner: include, Functional Leader. Her current Design Operations leadership is
     useful outreach evidence; her different Autodesk product division is context, not a conflict.
   - Andreea Dumbrava: include, Functional Leader
   - Michelle Ricarte: include with uncertainty, Recruiter
   - Victor Corral: include with uncertainty, Functional Leader; exact current title still needs
     stronger verification
   - Heather Ryan: include with uncertainty, Recruiter; exact current title and remit remain
     uncertain
   - Karla Ortloff: include, Functional Leader
   - Kevin Martin: reject for this opening because current public recruiting evidence centers on
     go-to-market organizations rather than this design role.
2. We Are Social: Freelance Project Manager
   - Jillian Raven: include, Recruiter
   - Chris Lee: include, Hiring Manager or Functional Leader
   - Jas Dhami: include with uncertainty, Functional Leader
   - Dana Neujahr: include, Functional Leader rather than confirmed Hiring Manager
   - Polly Norkett: include with uncertainty, Recruiter
   - Harley Roman: include as another useful contact; a Senior Project Manager is not honestly a
     Functional Leader
   - Jayde Machell: include as another useful contact because Project & Resource Manager
     responsibility can influence staffing and resourcing
   - Tim L: include as another useful contact because Resource Manager responsibility can influence
     staffing and resourcing
   - Krisztina Virag: reject because the Canadian managing-director remit is not relevant enough to
     this New York hiring path
   - Sumayyah Khatri: reject because People and Culture is HR, but public evidence does not place
     her in this recruitment loop
   - Bianca Paul: reject because her Amsterdam remit does not provide sufficient evidence of
     involvement in this New York hiring process
   - Katie Werner: reject because Employee Engagement Manager is not a recruiting role
   - Mimi Booth: reject because public evidence says she has left the company.
3. TheHiveCareers: Program Manager
   - Melarka Williams: include with high uncertainty, Functional Leader or possible Hiring Manager
   - Do not manufacture Recruiter or Hiring Manager results when the underlying employer and
     reporting chain cannot be confirmed.

## Provider Comparison Evaluation

The approved three-job reference set compared the previous provider output with reviewed contacts
while treating any newly discovered person as requiring review rather than automatically rejecting
them. The temporary comparison harness was removed at session close after the direct-discovery
pivot. Its raw report remains an ignored local evaluation artifact under
`local-artifacts/human-path-evaluation/` and is not part of production storage.

The original pre-review baseline did not pass:

- 17 contacts returned across three jobs
- 1 approved reference contact found
- 6 approved reference contacts missed
- 1 approved contact returned in the wrong lane
- 1 known reject returned
- 14 newly discovered contacts subsequently reviewed
- 11 web-search calls, 65.1 seconds, and $0.7592 estimated cost

Post-run review accepted 10 of the 14 new contacts and rejected 4. The reviewed interpretation is
therefore 12 useful contacts and 5 rejected contacts among the 17 returned. Of the 12 useful
contacts, 7 fit the provider's assigned lane and 5 were either assigned the wrong lane or belong in
an "other useful contact" classification not represented by the current three-lane provider.
The provider still missed 6 approved contacts: four at Autodesk, Jillian Raven at We Are Social,
and Melarka Williams at TheHiveCareers.

The "other useful contact" label is a benchmark distinction, not a new production taxonomy. It
prevents useful resource managers and operational peers from being rejected or falsely presented
as Hiring Managers, Recruiters, or Functional Leaders.

Autodesk's Hiring Manager discovery call received a provider-side HTTP 520, so that lane's result
is an availability failure rather than a relevance judgment. TheHiveCareers produced no accepted
contacts after three lane searches and a roster fallback. This result is evidence to improve
role-specific retrieval, source use, verification, and failure recovery. It is not evidence for an
industry taxonomy or a synthetic company matrix.

## Exa Raw-Retrieval Comparison

The approved direct-search evaluation used Exa People Search only for raw profile retrieval. It
did not call OpenAI and did not change the production provider. The temporary harness was removed
at session close. Its raw report remains local under `local-artifacts/human-path-evaluation/`.

- 9 API calls and 90 raw result rows
- 60 unique LinkedIn profiles before current-company validation
- 38 current exact-company profiles: 22 Autodesk, 15 We Are Social, and 1 TheHiveCareers
- 22 wrong-company profiles, primarily caused by ambiguous matches for "Hive"
- 1 of 18 previously approved useful contacts retrieved: Lynn B.
- 1 known reject retrieved: Kevin Martin
- 36 new exact-company contacts requiring relevance review
- 5.7 seconds and $0.063 reported Exa cost

The low overlap with the existing reference set is not, by itself, a provider failure because Exa
returned many previously unseen current employees. Those contacts need human relevance review
before precision can be compared with the OpenAI baseline. The run also proves that Exa retrieval
lanes are not reliable classifications: individual contributors appeared in Recruiter and
Functional Leader searches, so any Exa production path would still require independent
company validation, role verification, classification, and ranking.

The first prioritized review covered 19 new profiles:

- 13 accepted as useful contacts
- 6 rejected
- Abby Noe's current title corrected to Manager, Experience Operations
- Sara Mesing's current title corrected to Senior Experience Design Manager
- Steven Parkinson rejected because his current role is Service Offerings Manager
- Jenny Diani and Jennifer Kopatz-Olson rejected because technical recruiting does not normally
  cover design, production, or creative hiring
- Alissa Briggs and Renee VanDyne rejected because their current remits are not relevant enough to
  this track
- Twain G. rejected because he left TheHiveCareers in February 2026

Exa's structured person metadata is discovery evidence, not verified current-role evidence. The
provider supplied small title changes for Abby Noe and Sara Mesing, stale role data for Steven
Parkinson, and stale employment data for Twain G. Current LinkedIn profile evidence overrides those
fields. Production must never display an Exa title or current-company claim as verified without a
fresh profile-level validation step.

After applying both review passes without making another API call, all 38 exact-company profiles
have human outcomes: 31 accepted contacts and 7 rejected contacts. Acceptance does not erase
uncertainty. Contacts with conflicting functional remit, distant geography, unclear hiring
authority, or peer-only usefulness remain explicitly classified as uncertain or as another useful
contact rather than being promoted into a stronger hiring-path lane.

The union of the manually sourced contacts, OpenAI discoveries, and Exa discoveries contains 48
human-accepted contacts for these three jobs. Re-evaluating the saved provider outputs against that
union, without new API calls:

- OpenAI returned 12 useful contacts and 5 rejected contacts: 70.6% reviewed precision and 25.0%
  recall. Seven useful contacts fit an allowed lane and five had a lane mismatch.
- Exa returned 31 useful contacts and 7 rejected contacts after exact-company validation: 81.6%
  reviewed precision and 64.6% recall.
- OpenAI cost $0.7592 and took 65.1 seconds.
- Exa cost $0.063 and took 5.7 seconds.

These three jobs are a narrow product test, not a general labor-market benchmark. The result
supports Exa as a candidate-discovery source, but not as a standalone Human Path provider because
its titles, employment freshness, and retrieval lanes are not trustworthy enough for display.

The next controlled test should reuse the saved Exa candidates and run only targeted OpenAI
verification. One verification call per job should check current employer, current title, role
relevance, contradictory remit, freshness, and honest classification. It should specifically prove
whether verification rejects stale profiles such as Steven Parkinson and Twain G., rejects
functionally mismatched technical recruiters, preserves useful peers and resource managers, and
corrects Exa's title drift. This hybrid test requires separate paid-run approval and must remain
isolated from production integration.

## Hybrid Verification Comparison

The approved isolated hybrid test reused the 38 exact-company candidates from the saved Exa report
and made one OpenAI Responses web-verification call per job. It did not perform new Exa retrieval
and did not change the production provider. The temporary harness was removed at session close.
Its raw report remains local under `local-artifacts/human-path-evaluation/`.

- 3 OpenAI Responses calls and 3 web-search calls
- 38 input candidates and 38 structured verification rows returned
- 27.4 seconds and $0.1779 estimated OpenAI cost
- $0.2409 combined evaluation cost when the saved $0.063 Exa discovery run is included
- 14 of 31 human-accepted Exa contacts preserved
- 17 human-accepted contacts rejected
- 6 of 7 known rejects rejected
- 1 known reject, Twain G., incorrectly retained
- 93.3% reviewed precision among the 15 retained contacts
- 45.2% verification recall within the 31 human-accepted Exa contacts
- 29.2% end-to-end recall against the 48-contact accepted union

The aggregate precision is misleading without the company-level result. Autodesk preserved only 1
of 16 accepted contacts. The response marked current company and title unknown for 21 of 22
Autodesk candidates and returned no candidate-level evidence URLs. It then rejected 15 accepted
contacts because evidence was missing, despite the explicit instruction that missing evidence is
unknown rather than contradictory. We Are Social preserved 13 of 15 accepted contacts, mostly as
uncertain operational peers. TheHiveCareers incorrectly treated Twain G. as a current employee even
though human review of his LinkedIn profile found that he left in February 2026.

The run did not correct Abby Noe's or Sara Mesing's titles. It did not identify Steven Parkinson's
current Service Offerings role, and it did not substantively identify the conflicting technical
recruiting remits for Jenny Diani or Jennifer Kopatz-Olson. Those three Autodesk contacts received
the desired reject label only because the batch search failed to find evidence for them. The first
report therefore recorded 6 of 9 binary target checks as passed, but that overstates the result.
After strengthening those checks to require the intended current-role or contradiction evidence,
only the three operational-peer preservation checks pass.

This test rejects one verification call per job as a production design. One web search cannot
freshly verify a roster of 15 or 22 individual profiles. Prompt changes cannot manufacture missing
profile evidence, and converting every unknown rejection to an uncertain inclusion would also
restore the stale and functionally conflicting contacts. No production integration should follow
from this run.

The smallest useful next experiment is person-level verification on the nine explicit target
profiles rather than another company-sized batch. It should compare the same evidence requirements
for title corrections, former employment, current remit conflicts, and useful-peer preservation.
Any paid run needs separate approval, a fixed call and cost ceiling, and no production wiring.

## Final Decision and Implementation Resolution

Randall approved the direct-discovery pivot after reviewing the hybrid result. The raw Exa batches
were useful despite imperfections; the separate OpenAI verification stage spent more and removed
too many good contacts. Do not run the proposed nine-profile verification experiment. No additional
paid refinement test is approved.

The product direction is:

- use Exa for broad candidate discovery
- require exact-company matching before ranking
- rank lightly instead of aggressively filtering
- reject only explicit current contradictions
- preserve missing evidence as unknown
- keep useful operational peers and resource managers under an honest classification
- provide the direct LinkedIn profile as the final current-profile validation surface

Randall confirmed on 2026-07-24 that the cited terms allow this product's temporary cache and
temporary user display. No additional licensing action is required for the approved use.

The production provider code now uses Exa direct discovery and removes the obsolete OpenAI
discovery and web-verification machinery, verification-specific diagnostics, and obsolete tests.
Provider responses, highlights, queries, and excluded rows remain request-local. Only normalized
contact records required by selection and outreach are persisted, and Human Path events retain
aggregate counts rather than contact arrays.

## Deferred Unless Evidence Requires It

- another direct-search-provider migration
- new paid search account
- provider-neutral retrieval framework
- company-roster cache
- progressive provider orchestration
- synthetic industry or career matrix
- multi-dimensional labor-market benchmark

If one of these becomes necessary, document the exact observed failure, the smallest proposed
change, its cost, and why the existing provider cannot solve it before implementation.

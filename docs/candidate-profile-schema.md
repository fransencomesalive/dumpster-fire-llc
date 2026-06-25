# Dumpster Fire Candidate Profile Schema

## Purpose

This document defines the core candidate profile schema for the public version of Dumpster Fire.

The Candidate Profile is the source of truth for:

- job matching
- Role Track selection
- resume selection
- proof selection
- outreach strategy
- hiring manager messaging
- recruiter messaging
- pursuit tracking
- profile export

Dumpster Fire should not operate from an incomplete profile.

A weak or incomplete profile creates weak outreach, wastes tokens, and damages trust in the product.

Profile status is binary:

- `incomplete`
- `complete`

There is no `advanced`, `good enough`, or partial operating state.

## Core Principle

The system is only useful if it has a full clip of ammo.

If required inputs are missing, the user should complete the profile before using search-to-pursuit generation.

The app may allow users to save progress during onboarding, but core pursuit generation should be locked until the profile is complete.

Setup wizard should appear only when explicit direction is needed. The preferred experience is that onboarding prevents confusion in the first place.

## Top-Level Candidate Profile Object

```ts
type CandidateProfile = {
  id: string
  userId: string
  status: 'incomplete' | 'complete'
  version: number
  createdAt: string
  updatedAt: string

  identity: IdentityProfile
  searchConstraints: SearchConstraints
  roleTracks: RoleTrack[]
  resumes: ResumeProfile[]
  projects: ProjectProof[]
  skills: SkillProfile[]
  workHistory: WorkHistoryItem[]
  whyPeopleHireMe: WhyPeopleHireMe
  operatingStyle: OperatingStyle
  decisionStyle: DecisionStyle
  communicationStyle: CommunicationStyle
  writingSamples: WritingSample[]
  aiMisreadings: AiMisreadings
  outreachRules: OutreachRules
  leadershipProfile?: LeadershipProfile
  generatedMarkdown: string
  quality: ProfileQuality
}
```

## 1. Identity Profile

Required.

```ts
type IdentityProfile = {
  fullName: string
  preferredName?: string
  location: string
  workAuthorization: string
  linkedInUrl?: string
  portfolioUrl?: string
  personalWebsiteUrl?: string
  email?: string
}
```

Required fields:

- fullName
- location
- workAuthorization

## 2. Search Constraints

Required.

```ts
type SearchConstraints = {
  remotePreference: 'remote_only' | 'remote_preferred' | 'hybrid_ok' | 'onsite_ok'
  targetCompensationMin?: number
  targetCompensationPreferred?: number
  employmentTypes: Array<'full_time' | 'contract' | 'freelance' | 'part_time'>
  targetIndustries: string[]
  avoidIndustries: string[]
  targetCompanyTypes: string[]
  avoidCompanies: string[]
  companyWatchlist: CompanyWatchlistItem[]
  availability: string
}
```

### Company Watchlist

This already exists and should retain current approved functionality.

```ts
type CompanyWatchlistItem = {
  companyName: string
  reason: string
  priority: 'low' | 'medium' | 'high'
  notes?: string
}
```

Company preferences should live under Company Watchlist, not in a separate profile section.

Industry-specific notes are post-launch and should not be built now.

## 3. Role Tracks

Required.

Use the term **Role Track**.

A Role Track represents a candidate narrative, such as:

- Executive Producer
- Program Director
- AI Workflow / Product Ops
- Creative Director
- Design Ops Lead

```ts
type RoleTrack = {
  id: string
  name: string
  description: string
  targetTitles: string[]
  corePositioning: string
  keyResponsibilities: string[]
  requiredExperiencePatterns: string[]
  strongJobSignals: string[]
  weakJobSignals: string[]
  mismatchSignals: string[]
  resumeIds: string[]
  outreachAngle: string
  globalProofRules?: string
  doNotOverclaim: string[]
}
```

Required fields:

- name
- description
- targetTitles
- corePositioning
- keyResponsibilities
- requiredExperiencePatterns
- strongJobSignals
- weakJobSignals
- mismatchSignals
- resumeIds
- outreachAngle
- doNotOverclaim

### Important Rule

Proof objects are not primarily tied to Role Tracks.

Proof objects are capability-driven.

The system should match:

```text
Project Proof
-> Capabilities demonstrated
-> Job requirements
-> Outreach relevance
```

not:

```text
Project Proof
-> Job title
```

Example:

Phred may apply to Executive Producer, Program Director, AI Ops, Product Ops, or Operations roles if the job requirements include AI workflow, orchestration, delivery governance, stakeholder coordination, or internal systems work.

Do not exclude proof objects based only on Role Track.

## 4. Resumes

Required.

Users may upload multiple resumes.

Each resume must be attached to at least one Role Track.

```ts
type ResumeProfile = {
  id: string
  name: string
  fileUrl: string
  parsedText: string
  associatedRoleTrackIds: string[]
  strengths: string[]
  gaps: string[]
  useWhen: string[]
  avoidWhen: string[]
  parsingQuality: 'failed' | 'weak' | 'complete'
  parsingIssues: string[]
}
```

Required fields:

- name
- fileUrl
- parsedText
- associatedRoleTrackIds
- strengths
- gaps
- useWhen
- avoidWhen
- parsingQuality

### Resume Parsing Rule

Do not ask users to re-enter work history manually.

Work history should be parsed from resumes.

If parsing quality is poor, tell the user plainly.

Suggested message:

> We could not confidently understand parts of your work history.
>
> A weak resume creates a weak profile.
>
> Upload a cleaner resume or correct the highlighted sections before continuing.

## 5. Work History

Required, but generated from resumes.

Users should be able to correct parsed work history, but they should not be asked to create it from scratch.

```ts
type WorkHistoryItem = {
  id: string
  company: string
  title: string
  startDate?: string
  endDate?: string
  currentRole?: boolean
  responsibilities: string[]
  accomplishments: string[]
  skills: string[]
  metrics: string[]
  associatedResumeIds: string[]
  source: 'resume_parse' | 'user_corrected'
}
```

Required fields:

- company
- title
- responsibilities or accomplishments
- associatedResumeIds
- source

## 6. Project Proof

Required.

Use the term **Project**.

Do not use broad proof categories like speaking engagements, podcasts, random content, or side projects.

A project can be professional, portfolio, product, campaign, operational, AI, internal tooling, or public work, but it must be a project that can provide actual proof in outreach.

```ts
type ProjectProof = {
  id: string
  name: string
  link?: string
  description: string
  candidateRole: string
  whatThisProves: string[]
  capabilitiesDemonstrated: string[]
  keyResponsibilitiesSupported: string[]
  requiredExperienceSupported: string[]
  industriesRelevant: string[]
  bestUsedFor: string[]
  avoidUsingFor: string[]
  metricsResults: string[]
  caveats: string[]
  confidence: 'low' | 'medium' | 'high'
}
```

Required fields:

- name
- description
- candidateRole
- whatThisProves
- capabilitiesDemonstrated
- keyResponsibilitiesSupported
- requiredExperienceSupported
- bestUsedFor
- avoidUsingFor
- caveats
- confidence

### Project Selection Rule

Projects should be selected based on:

- job responsibilities
- required experience
- capabilities demonstrated
- proof strength
- caveats
- relevance to outreach angle

Do not select projects only by role title or keyword overlap.

## 7. Skills Inventory

Required.

```ts
type SkillProfile = {
  id: string
  skillName: string
  proficiency: 'working' | 'strong' | 'expert'
  evidence: string[]
  relatedProjectIds: string[]
  relatedWorkHistoryIds: string[]
  bestRoleFit: string[]
  doNotOverclaim: string[]
}
```

Required fields:

- skillName
- proficiency
- evidence
- bestRoleFit
- doNotOverclaim

## 8. Why People Hire Me

Required.

This is one of the most important sections.

```ts
type WhyPeopleHireMe = {
  problemsPeopleBringMe: QualityScoredText
  whatBreaksIfImNotThere: QualityScoredText
  messesICleanUp: QualityScoredText
  teamsThatBenefitFromMe: QualityScoredText
  situationsWhereIAmMostUseful: QualityScoredText
  situationsWhereIAmNotUseful: QualityScoredText
}
```

### Prompt Copy

Use direct coaching before the user answers.

Example:

> What are your strengths?
>
> Do not say 'solving problems' or 'I help teams get organized.'
>
> Everyone says that.
>
> Vague answers produce weak outreach. Specific answers produce strong outreach.
>
> What do people actually rely on you for? What breaks if you are not there? What kind of mess do you clean up?

### Quality Scoring

```ts
type QualityScoredText = {
  value: string
  quality: 'weak' | 'complete'
  feedback?: string
}
```

No ongoing chat loop.

No repeated "tell me more."

Score the answer. Show the user the quality result. Let them decide whether to improve it.

If a user enters three weak responses in a required section, show direct feedback:

> Try harder.
>
> This profile is only as useful as the material you give it. Vague answers create generic outreach.

## 9. Operating Style

Required.

```ts
type OperatingStyle = {
  howIApproachProblems: QualityScoredText
  howIHandleAmbiguity: QualityScoredText
  howIWorkWithTeams: QualityScoredText
  whatIValue: QualityScoredText
  whatIReject: QualityScoredText
}
```

This section should capture how the person works, not just what they have done.

## 10. Decision Style

Required.

```ts
type DecisionStyle = {
  howIEvaluateRoles: QualityScoredText
  whatMakesRoleWorthPursuing: QualityScoredText
  whatMakesRoleBadFit: QualityScoredText
  whatILookForInCompanies: QualityScoredText
  redFlags: QualityScoredText
  greenFlags: QualityScoredText
}
```

## 11. Communication Style

Required.

```ts
type CommunicationStyle = {
  voiceDescription: QualityScoredText
  preferredTone: string[]
  formalityLevel: 'low' | 'medium' | 'high'
  humorLevel: 'none' | 'light' | 'medium'
  whatIShouldSoundLike: QualityScoredText
  whatIShouldNeverSoundLike: QualityScoredText
  messageLengthPreference: 'short' | 'medium' | 'long'
  greetingPreferences: string[]
  signoffPreferences: string[]
  phrasesToAvoid: string[]
  phrasesThatSoundLikeMe: string[]
}
```

## 12. Writing Samples

Required.

At least one liked sample and one hated sample are required.

```ts
type WritingSample = {
  id: string
  sampleType: 'like' | 'hate'
  channel: 'linkedin' | 'email' | 'dm' | 'social_post' | 'other'
  text: string
  whyItWorksOrFails: string
}
```

## 13. AI Misreadings

Required.

```ts
type AiMisreadings = {
  wrongAssumptions: QualityScoredText
  badDefaultFramings: QualityScoredText
  skillsNotToExaggerate: QualityScoredText
  rolesNotToForceMeInto: QualityScoredText
  languageThatMisrepresentsMe: QualityScoredText
}
```

Prompt copy:

> AI will make assumptions about you. Some will be wrong.
>
> This section prevents the system from turning you into a generic candidate.

## 14. Outreach Rules

Required.

Global outreach rules plus optional Role Track-specific outreach rules.

```ts
type OutreachRules = {
  globalRules: string[]
  hiringManagerApproach: QualityScoredText
  recruiterApproach: QualityScoredText
  functionalLeaderApproach: QualityScoredText
  executiveSponsorApproach: QualityScoredText
  noContactRoutingApproach: QualityScoredText
  followUpRules: string[]
  linkSelectionRules: string[]
  roleTrackSpecificRules: RoleTrackOutreachRule[]
}
```

```ts
type RoleTrackOutreachRule = {
  roleTrackId: string
  rules: string[]
  preferredProofTypes: string[]
  avoidProofTypes: string[]
}
```

## 15. Leadership Profile

Optional and hidden behind a toggle.

Do not show this by default.

Toggle label:

**Show Leadership Profile Inputs**

```ts
type LeadershipProfile = {
  leadershipStyle?: QualityScoredText
  teamManagementStyle?: QualityScoredText
  stakeholderManagementStyle?: QualityScoredText
  conflictStyle?: QualityScoredText
  executiveCommunicationStyle?: QualityScoredText
}
```

This section is for users targeting leadership or executive roles.

## 16. Generated Markdown

Required internally.

The structured profile is the source of truth.

Markdown is generated from the structured profile.

```ts
type GeneratedMarkdown = {
  markdown: string
  generatedAt: string
  profileVersion: number
}
```

Exporting markdown is gated by subscription tier.

## 17. Profile Quality

Required.

Profile status is binary.

```ts
type ProfileQuality = {
  status: 'incomplete' | 'complete'
  incompleteReasons: string[]
  weakFields: string[]
  completeFields: string[]
  weakResponseCount: number
  lastCheckedAt: string
}
```

### Completion Rules

Profile is `complete` only when:

- all required sections exist
- all required fields are populated
- at least one Role Track exists
- at least one resume exists
- each resume is attached to at least one Role Track
- resume parsing quality is `complete`
- parsed work history exists
- at least one Project exists
- at least one liked writing sample exists
- at least one hated writing sample exists
- no required QualityScoredText field is blank
- weak response count is below allowed threshold
- required outreach rules exist

### Weak Response Threshold

Recommended threshold:

- 0 weak responses allowed in required profile sections

If any required answer is weak, profile remains incomplete.

Rationale:

The product is only valuable if the profile contains specific material. Weak input produces weak outreach and wastes generation cost.

### Locked State

If profile is incomplete, block:

- pursuit generation
- outreach generation
- contact research
- role fit messaging
- proof selection

Allow:

- onboarding continuation
- profile editing
- resume re-upload
- project entry
- account/settings access

## 18. Future / Post-Launch

Do not build now:

- industry-specific notes
- speaking engagements
- side project category
- deep company research
- interview prep
- cover letters
- generic AI chat coaching

These may be future modules but are not part of the launch schema.

## Summary

The Candidate Profile is complete or incomplete.

No partial operating mode.

No good-enough profile.

No weak-profile generation.

The profile must provide enough specific, structured material to let Dumpster Fire do what it promises:

Find the role.

Find the human.

Use the right proof.

Write the message that does not sound like everyone else.

# Dumpster Fire Public Build: Database and Data Model Spec

## Purpose

This document translates the Candidate Profile Schema into database objects and relationships for the public version of Dumpster Fire.

The structured profile is the source of truth.

The generated markdown is derived from structured data.

Do not make markdown the editable source.

---

# Core Data Model Principle

A user can save onboarding progress, but the profile is not operational until complete.

Profile status is binary:

- `incomplete`
- `complete`

If profile is incomplete, block:

- pursuit generation
- outreach generation
- contact research
- role fit messaging
- proof selection

Allow:

- onboarding continuation
- profile editing
- resume upload
- project entry
- account/settings access

---

# Entity Overview

Primary objects:

- User
- CandidateProfile
- RoleTrack
- Resume
- WorkHistoryItem
- ProjectProof
- SkillProfile
- WritingSample
- CompanyWatchlistItem
- ProfileQuality
- ProfileVersion
- SubscriptionPlan
- UsageLedger
- Job
- Pursuit
- ContactSuggestion
- OutreachMessage

---

# 1. users

Use existing auth user table if one exists.

Required auth methods:

- Google
- Apple
- Email

```ts
type User = {
  id: string
  email: string
  name?: string
  authProvider: 'google' | 'apple' | 'email'
  createdAt: string
  updatedAt: string
}
```

---

# 2. candidate_profiles

One active candidate profile per user at launch.

```ts
type CandidateProfile = {
  id: string
  userId: string
  status: 'incomplete' | 'complete'
  version: number

  fullName: string
  preferredName?: string
  location: string
  workAuthorization: string
  linkedInUrl?: string
  portfolioUrl?: string
  personalWebsiteUrl?: string
  email?: string

  remotePreference: 'remote_only' | 'remote_preferred' | 'hybrid_ok' | 'onsite_ok'
  targetCompensationMin?: number
  targetCompensationPreferred?: number
  availability: string

  generatedMarkdown: string
  markdownGeneratedAt?: string

  createdAt: string
  updatedAt: string
}
```

Required before profile can be complete:

- fullName
- location
- workAuthorization
- remotePreference
- availability

---

# 3. candidate_profile_preferences

Store array-style search constraints separately.

```ts
type CandidateProfilePreferences = {
  id: string
  profileId: string

  employmentTypes: string[]
  targetIndustries: string[]
  avoidIndustries: string[]
  targetCompanyTypes: string[]
  avoidCompanies: string[]

  createdAt: string
  updatedAt: string
}
```

---

# 4. company_watchlist_items

Use current approved Company Watchlist functionality.

Company preferences live here.

```ts
type CompanyWatchlistItem = {
  id: string
  profileId: string
  companyName: string
  reason: string
  priority: 'low' | 'medium' | 'high'
  notes?: string
  createdAt: string
  updatedAt: string
}
```

---

# 5. role_tracks

Role Tracks are first-class objects.

```ts
type RoleTrack = {
  id: string
  profileId: string

  name: string
  description: string
  corePositioning: string
  outreachAngle: string
  globalProofRules?: string

  targetTitles: string[]
  keyResponsibilities: string[]
  requiredExperiencePatterns: string[]
  strongJobSignals: string[]
  weakJobSignals: string[]
  mismatchSignals: string[]
  doNotOverclaim: string[]

  createdAt: string
  updatedAt: string
}
```

Required:

- at least one Role Track
- all fields populated
- at least one attached resume

---

# 6. resumes

Multiple resumes allowed.

Each resume must attach to at least one Role Track.

```ts
type Resume = {
  id: string
  profileId: string

  name: string
  fileUrl: string
  parsedText: string

  strengths: string[]
  gaps: string[]
  useWhen: string[]
  avoidWhen: string[]

  parsingQuality: 'failed' | 'weak' | 'complete'
  parsingIssues: string[]

  createdAt: string
  updatedAt: string
}
```

Join table:

```ts
type ResumeRoleTrack = {
  resumeId: string
  roleTrackId: string
}
```

Completion requires:

- at least one resume
- parsingQuality = complete
- resume attached to at least one Role Track

---

# 7. work_history_items

Generated from resume parsing.

Users may correct parsed items, but should not be asked to create work history manually during onboarding.

```ts
type WorkHistoryItem = {
  id: string
  profileId: string

  company: string
  title: string
  startDate?: string
  endDate?: string
  currentRole: boolean

  responsibilities: string[]
  accomplishments: string[]
  skills: string[]
  metrics: string[]

  source: 'resume_parse' | 'user_corrected'

  createdAt: string
  updatedAt: string
}
```

Join table:

```ts
type WorkHistoryResume = {
  workHistoryItemId: string
  resumeId: string
}
```

Completion requires:

- at least one parsed work history item
- each item has company and title
- each item has responsibility or accomplishment content

---

# 8. project_proofs

Use the term Project.

Do not create categories for side projects, speaking engagements, podcasts, or personal branding artifacts.

```ts
type ProjectProof = {
  id: string
  profileId: string

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

  createdAt: string
  updatedAt: string
}
```

Completion requires:

- at least one Project
- all required fields populated
- confidence set

Project selection must later be capability-driven, not role-title-driven.

---

# 9. skill_profiles

```ts
type SkillProfile = {
  id: string
  profileId: string

  skillName: string
  proficiency: 'working' | 'strong' | 'expert'
  evidence: string[]
  bestRoleFit: string[]
  doNotOverclaim: string[]

  createdAt: string
  updatedAt: string
}
```

Join tables:

```ts
type SkillProjectProof = {
  skillId: string
  projectProofId: string
}
```

```ts
type SkillWorkHistory = {
  skillId: string
  workHistoryItemId: string
}
```

Completion requires:

- at least one skill
- each skill has evidence
- each skill has doNotOverclaim guidance

---

# 10. quality_scored_text_fields

Use a normalized table for user-authored profile answers that require quality scoring.

```ts
type QualityScoredTextField = {
  id: string
  profileId: string

  section:
    | 'why_people_hire_me'
    | 'operating_style'
    | 'decision_style'
    | 'communication_style'
    | 'ai_misreadings'
    | 'outreach_rules'
    | 'leadership_profile'

  fieldKey: string
  value: string
  quality: 'weak' | 'complete'
  feedback?: string

  createdAt: string
  updatedAt: string
}
```

Completion rule:

- every required field must exist
- every required field must have quality = complete
- 0 weak responses allowed in required sections

If user creates 3 weak responses in a section, show:

"Try harder.

This profile is only as useful as the material you give it. Vague answers create generic outreach."

No repeated chat loop.

No “tell me more” prompts.

---

# 11. communication_style_settings

Structured non-longform settings.

```ts
type CommunicationStyleSettings = {
  id: string
  profileId: string

  preferredTone: string[]
  formalityLevel: 'low' | 'medium' | 'high'
  humorLevel: 'none' | 'light' | 'medium'
  messageLengthPreference: 'short' | 'medium' | 'long'
  greetingPreferences: string[]
  signoffPreferences: string[]
  phrasesToAvoid: string[]
  phrasesThatSoundLikeMe: string[]

  createdAt: string
  updatedAt: string
}
```

---

# 12. writing_samples

At least one liked sample and one hated sample required.

```ts
type WritingSample = {
  id: string
  profileId: string

  sampleType: 'like' | 'hate'
  channel: 'linkedin' | 'email' | 'dm' | 'social_post' | 'other'
  text: string
  whyItWorksOrFails: string

  createdAt: string
  updatedAt: string
}
```

Completion requires:

- at least one like
- at least one hate

---

# 13. outreach_rules

Structured global rules.

```ts
type OutreachRuleSet = {
  id: string
  profileId: string

  globalRules: string[]
  followUpRules: string[]
  linkSelectionRules: string[]

  createdAt: string
  updatedAt: string
}
```

Role Track-specific outreach rules:

```ts
type RoleTrackOutreachRule = {
  id: string
  roleTrackId: string

  rules: string[]
  preferredProofTypes: string[]
  avoidProofTypes: string[]

  createdAt: string
  updatedAt: string
}
```

Contact-type approach fields should be stored as `quality_scored_text_fields` under section `outreach_rules`:

- hiringManagerApproach
- recruiterApproach
- functionalLeaderApproach
- executiveSponsorApproach
- noContactRoutingApproach

---

# 14. leadership_profiles

Hidden behind toggle:

**Show Leadership Profile Inputs**

```ts
type LeadershipProfile = {
  id: string
  profileId: string
  visible: boolean
  createdAt: string
  updatedAt: string
}
```

The actual longform fields use `quality_scored_text_fields` under section `leadership_profile`.

Fields:

- leadershipStyle
- teamManagementStyle
- stakeholderManagementStyle
- conflictStyle
- executiveCommunicationStyle

Leadership Profile is optional and not required for profile completion.

---

# 15. profile_quality

```ts
type ProfileQuality = {
  id: string
  profileId: string

  status: 'incomplete' | 'complete'
  incompleteReasons: string[]
  weakFields: string[]
  completeFields: string[]
  weakResponseCount: number

  lastCheckedAt: string
}
```

Completion requires:

- all required sections complete
- all required QualityScoredText fields complete
- resume parsing quality complete
- at least one role track
- at least one project
- at least one skill
- at least one liked writing sample
- at least one hated writing sample

No weak responses allowed.

---

# 16. profile_versions

Every profile regeneration creates a version.

```ts
type ProfileVersion = {
  id: string
  profileId: string
  version: number
  generatedMarkdown: string
  changeSummary: string
  createdAt: string
}
```

User should be able to restore prior versions from Profile Management.

---

# 17. subscription_plans

```ts
type SubscriptionPlan = {
  id: string
  name: 'tester' | 'basic' | 'pro' | 'premium'
  priceMonthly: number

  unlimitedSearch: boolean
  profileExport: boolean

  pursuitLimitMonthly?: number
  outreachLimitMonthly?: number
  humanPathLimitMonthly?: number

  createdAt: string
  updatedAt: string
}
```

Initial recommendation:

Tester:
- unlimited search
- limited pursuits
- limited outreach
- no export

Basic:
- $29/mo
- unlimited search
- profile management
- limited pursuits
- limited outreach
- no export

Pro:
- $79/mo
- unlimited search
- higher or unlimited pursuits
- higher or unlimited outreach
- export profile

Premium:
- future tier
- interview prep and deep company research
- do not build first unless needed

---

# 18. usage_ledger

Track usage for metered features.

```ts
type UsageLedger = {
  id: string
  userId: string
  planId: string

  usageType: 'pursuit' | 'outreach_message' | 'human_path' | 'profile_export'
  quantity: number

  relatedJobId?: string
  relatedPursuitId?: string

  createdAt: string
}
```

Do not meter search.

Meter action.

---

# 19. jobs

Use existing job storage if present.

Public version needs normalized job records.

```ts
type Job = {
  id: string
  source: string
  sourceUrl: string

  companyName: string
  title: string
  location?: string
  remoteType?: string
  employmentType?: string
  compensationText?: string

  description: string
  postedAt?: string
  scrapedAt: string

  createdAt: string
  updatedAt: string
}
```

---

# 20. pursuits

The core action object.

A pursuit is not an application.

A pursuit is a role the user is actively working through the Dumpster Fire process.

```ts
type Pursuit = {
  id: string
  userId: string
  profileId: string
  jobId: string

  selectedRoleTrackId?: string
  selectedResumeId?: string

  status:
    | 'saved'
    | 'evaluating'
    | 'human_path_generated'
    | 'outreach_generated'
    | 'applied'
    | 'outreach_sent'
    | 'responded'
    | 'interviewing'
    | 'rejected'
    | 'archived'

  fitSummary?: string
  risks?: string[]
  recommendedProofProjectIds: string[]
  outreachAngle?: string

  createdAt: string
  updatedAt: string
}
```

Do not create cover-letter objects.

Outreach replaces cover letters.

---

# 21. contact_suggestions

```ts
type ContactSuggestion = {
  id: string
  pursuitId: string
  jobId: string

  name: string
  title: string
  companyName: string
  linkedinUrl?: string
  email?: string

  contactType:
    | 'likely_hiring_manager'
    | 'functional_leader'
    | 'recruiter'
    | 'executive_sponsor'
    | 'referral_candidate'
    | 'unknown'

  confidence: 'low' | 'medium' | 'high'
  relevanceReason: string
  roleConnection: string
  verificationNotes: string[]

  createdAt: string
  updatedAt: string
}
```

Contact Suggestions belong to Pursuits, not just Jobs, because the best contact may depend on the user’s Role Track and strategy.

---

# 22. outreach_messages

```ts
type OutreachMessage = {
  id: string
  pursuitId: string
  contactSuggestionId?: string

  channel: 'linkedin_connection' | 'linkedin_dm' | 'email' | 'other'
  recipientType:
    | 'likely_hiring_manager'
    | 'functional_leader'
    | 'recruiter'
    | 'executive_sponsor'
    | 'no_contact'

  message: string
  selectedProjectProofIds: string[]
  selectedResumeId?: string
  selectedRoleTrackId?: string

  status: 'draft' | 'approved' | 'sent' | 'rejected'
  rejectionReason?: string

  createdAt: string
  updatedAt: string
}
```

Approved or edited messages should be available as future examples for the user’s communication profile.

---

# 23. saved_message_feedback

```ts
type SavedMessageFeedback = {
  id: string
  outreachMessageId: string
  userId: string

  feedbackType: 'approved' | 'edited' | 'rejected'
  editedMessage?: string
  rejectionReason?:
    | 'too_corporate'
    | 'too_generic'
    | 'wrong_proof'
    | 'too_formal'
    | 'too_long'
    | 'wrong_posture'
    | 'other'

  notes?: string
  createdAt: string
}
```

This creates the future learning loop.

---

# 24. Explicit Non-Objects

Do not create these for launch:

- CoverLetter
- DeepCompanyResearch
- InterviewPrep
- SpeakingEngagement
- SideProject
- GenericChatSession

These are either intentionally excluded or post-launch.

---

# Completion Logic Summary

A candidate profile is complete only when:

- candidate profile identity exists
- search constraints exist
- at least one Role Track exists
- at least one resume exists
- every resume is attached to at least one Role Track
- resume parsing quality is complete
- parsed work history exists
- at least one Project exists
- at least one Skill exists
- Why People Hire Me is complete
- Operating Style is complete
- Decision Style is complete
- Communication Style is complete
- at least one liked writing sample exists
- at least one hated writing sample exists
- AI Misreadings is complete
- Outreach Rules are complete
- no required quality-scored field is weak

If any item fails, status = incomplete.

Incomplete profile blocks core generation.

---

# Product Summary

Dumpster Fire is built around a complete candidate profile.

The profile powers pursuits.

The pursuit is the monetized action.

Search remains open.

Cover letters do not exist.

Deep research is not part of application workflow.

The system should help users stop behaving like applicants and start acting like candidates with a human path.
# Dumpster Fire Public Product Build: Next Epics

## Product Principle

Dumpster Fire is not a job search app that helps users blast applications.

It is a pursuit system.

The core workflow is:

Find a role
Identify the human path
Match the right profile/narrative
Pull the right proof
Generate useful outreach
Track the pursuit

Do not build toward cover letters, portal blasting, or deep company research at application stage.

Core product line:

**Stop applying. Start pursuing.**

---

# Epic 1: Public Onboarding Experience

## Goal

Build an onboarding flow that creates a saved Career Operating System profile for each user.

This profile powers:

- job matching
- role fit scoring
- resume/narrative selection
- proof-object selection
- outreach messaging
- hiring manager strategy
- future profile updates

The onboarding must not feel like a generic resume upload. It must explain why the user is doing the work.

## Core User Promise

Most job tools ask for a resume.

That is the problem.

A resume tells us what you have done. It does not explain how you think, how you work, what people trust you with, what makes you effective, or why someone should actually respond to you.

Dumpster Fire helps you build a Career Operating System.

The better the profile, the better the matches and outreach.

Vague answers produce weak outreach. Specific answers produce strong outreach.

## Intro Copy

Use this general direction:

"Most job tools ask for a resume and then let AI guess who you are.

We are not doing that.

Your resume is a compressed artifact. It does not explain how you think, what kind of problems people bring you, what work proves your value, or how you communicate when you are not being flattened into ATS keywords.

This process builds your Career Operating System.

It captures your roles, proof, strengths, work examples, writing style, decision style, and the things AI usually gets wrong about you.

Do the work up front.

Every future match, message, and pursuit gets better because of it."

CTA: **Build My Profile**

## Onboarding Sections

### 1. Identity and Search Basics

Fields:

- Name
- Location
- Work authorization
- Remote / hybrid / onsite preference
- Compensation target
- Employment type preferences
- Target industries
- Avoid industries
- Target company types
- Companies to avoid
- Availability

### 2. Role Tracks / Career Narratives

Use the term **Role Track**.

A user may have more than one profile narrative.

Examples:

- Executive Producer
- Program Director
- Product Marketing Lead
- Design Ops Lead
- Creative Director
- AI Enablement Lead

For each Role Track:

- Track name
- Target titles
- Best-fit companies
- Core positioning
- Strong signals in job posts
- Weak signals / mismatch signals
- Resume attached to this track
- Portfolio/proof priorities
- Outreach angle
- Notes on what not to overclaim

### 3. Resume Uploads

Support multiple resumes.

Each resume must be attached to one or more Role Tracks.

Fields:

- Resume name
- File
- Associated Role Track
- Notes
- Strengths
- Gaps
- Use when
- Avoid when

### 4. Proof Library

This is critical.

Users should add work examples, projects, portfolio pieces, case studies, side projects, writing samples, public links, GitHub links, campaigns, launches, operations work, products, etc.

For each proof object:

- Name
- Link
- Description
- Candidate role
- What this proves
- Skills demonstrated
- Industries relevant
- Role Tracks relevant
- Best used for
- Avoid using for
- Metrics/results
- Caveats
- Confidence level

### 5. Skills Inventory

For each skill:

- Skill name
- Proficiency
- Evidence
- Related projects
- Best role fit
- Do not overclaim

### 6. Why People Hire Me

Prompt copy:

"What are your strengths?

Do not say 'solving problems' or 'I help teams get organized.' Everyone says that.

Vague answers produce weak outreach. Specific answers produce strong outreach.

What do people actually rely on you for? What breaks if you are not there? What kind of mess do you clean up?"

Fields:

- Problems people bring me
- What breaks if I am not there
- Messes I clean up
- Teams that benefit from me
- Situations where I am most useful
- Situations where I am not useful

Add answer quality indicator:

- Weak
- Good
- Strong

No repeated "tell me more" chat loop. Give guidance once. Score answer quality. Let user continue.

### 7. Operating Style

Fields:

- How I approach problems
- How I make decisions
- How I handle ambiguity
- How I work with teams
- What I value
- What I reject

### 8. Decision Style

Fields:

- How I evaluate roles
- What makes a role worth pursuing
- What makes a role a bad fit
- What I look for in companies
- Red flags
- Green flags

### 9. Communication Style

Fields:

- Voice description
- Preferred tone
- Formality level
- Humor level
- What I should sound like
- What I should never sound like
- Message length preferences
- Greeting/signoff preferences
- Phrases to avoid
- Phrases that sound like me

### 10. Writing Samples

Support:

- Samples I like
- Samples I hate

For each:

- Text
- Why it works / fails
- Channel type: LinkedIn, email, DM, social post, other

### 11. What AI Gets Wrong About Me

Prompt copy:

"AI will make assumptions about you. Some will be wrong.

This section prevents the system from turning you into a generic candidate."

Fields:

- Wrong assumptions
- Bad default framings
- Skills I do not want exaggerated
- Roles I should not be forced into
- Language that misrepresents me

### 12. Outreach Rules

Fields:

- Hiring manager approach
- Recruiter approach
- Functional leader approach
- Executive sponsor approach
- No-contact routing note approach
- Follow-up rules
- Link selection rules

## Profile Completion

Show a completion/status panel:

- Identity
- Role Tracks
- Resumes
- Proof Library
- Why People Hire Me
- Operating Style
- Decision Style
- Communication Style
- Writing Samples
- AI Gets Me Wrong
- Outreach Rules

Each section should show:

- Not Started
- Weak
- Good
- Strong

## End State

At the end of onboarding:

- Save structured profile data
- Generate internal `candidate_profile.md`
- Store profile in database
- Use this profile for matching and outreach
- Do not export the profile

---

# Epic 2: Profile Updating and Management

## Goal

Build a single profile management modal that lets users edit everything created during onboarding.

This should not require users to understand markdown.

The markdown is an implementation detail.

The user edits structured fields.

The system regenerates the profile.

## Modal Name

**Edit Career Profile**

## Requirements

The modal must include all editable profile sections:

- Identity
- Search constraints
- Role Tracks
- Resumes
- Work experience
- Proof Library
- Skills
- Why People Hire Me
- Operating Style
- Decision Style
- Communication Style
- Writing Samples
- What AI Gets Wrong About Me
- Outreach Rules

## Role Tracks

Users must be able to:

- edit an existing Role Track
- add a new Role Track
- duplicate a Role Track
- delete/archive a Role Track
- attach resumes to Role Tracks
- attach proof objects to Role Tracks

Examples:

- Executive Producer
- Program Director
- AI Workflow / Product Ops

## Proof Library

Users must be able to:

- add proof object
- edit proof object
- delete/archive proof object
- attach to Role Tracks
- add link
- add caveats
- define best-use and avoid-use rules

## Work Experience

Users must be able to add/edit:

- company
- title
- dates
- responsibilities
- accomplishments
- skills
- metrics
- associated Role Tracks
- associated proof objects

## Profile Regeneration

When a user edits structured fields:

- update stored structured profile
- regenerate internal markdown representation
- preserve prior version history
- show last updated timestamp

## Profile Version History

Store:

- version number
- date
- user changes
- generated markdown
- restore option

## Export Boundary

Profile export is not a product feature.

Exports belong to pursued jobs/pursuit history, not the Career Profile editor.

Pursued Jobs Export should include:

- job pursued
- Applying As Role Track/narrative
- message sent
- recipient/contact
- pursuit status
- timestamps

Naming:

- `Role Track` is the maintained profile narrative, such as Executive Producer or Product Manager.
- `Applying As` is the pursuit-level label for the selected Role Track/narrative used for a specific job.

---

# Epic 3: Subscription Tiers and Feature Gates

## Product Rule

Do not limit search heavily.

Search is discovery.

Charge for action.

The valuable unit is not a search.

The valuable unit is a **Pursuit**.

A pursuit includes:

- saved role
- fit assessment
- recommended Role Track
- human path/contact research
- outreach message
- pursuit tracking

## Remove Cover Letters

Do not build cover letters.

Outreach messages replace cover letters.

Application-stage workflow should discourage portal blasting.

Preferred workflow:

Find role
Identify contact
Generate outreach
Apply if needed
Track pursuit

## Do Not Include Deep Company Research In Application Flow

Deep company research belongs in future Interview Prep.

Application stage should include only:

- fit
- risks
- recommended Role Track
- proof object
- contacts
- outreach angle
- message

## Suggested Tiers

### Tester / Beta

- Free during testing
- Unlimited search
- Limited pursuits
- Limited outreach messages
- No Pursued Jobs Export
- Feedback capture enabled

### Basic Paid

Suggested price: $29/mo

Includes:

- unlimited search
- profile creation
- profile management
- multiple resumes
- multiple Role Tracks
- Proof Library
- saved jobs
- pursuit tracking
- limited Human Paths / pursuits per month
- limited outreach messages per month
- no Pursued Jobs Export

Suggested limits:

- 50 pursuits/month
- 100 outreach messages/month

### Pro

Suggested price: $79/mo

Includes:

- everything in Basic
- higher or unlimited pursuits
- higher or unlimited outreach
- Pursued Jobs Export
- advanced profile version history
- stronger hiring manager/contact research
- advanced proof-object selection
- priority profile regeneration

Suggested limits:

- unlimited search
- unlimited saved jobs
- 200+ pursuits/month or unlimited
- 500 outreach messages/month or unlimited with fair-use policy

### Executive / Premium

Suggested price: $149-$299/mo

Future tier.

Includes:

- everything in Pro
- interview prep
- deeper company research
- advanced contact chains
- application strategy packs
- white-glove style positioning tools

Do not build this first unless needed.

## Feature Gates

Gate these features:

### Pursued Jobs Export

Basic: locked
Pro: unlocked

### Outreach Messages

Metered by plan.

### Human Path / Contact Research

Metered by plan.

### Advanced Contact Confidence / Org Chain

Possibly Pro.

### Deep Company Research

Not part of application product. Future Interview Prep tier.

## Upgrade States

Upgrade messages should be direct and benefit-led.

Example for outreach limit:

"You have used your outreach messages for this plan.

Search is still open, and you can keep saving roles.

Upgrade to keep turning roles into pursuits with contacts and tailored outreach."

CTA:

**Upgrade**

Secondary:

**Keep Searching**

Example for Human Path limit:

"You can keep searching and saving jobs, but Human Path research is limited on your current plan.

Human Path finds the likely hiring manager, functional leader, and recruiter so you are not just throwing applications into the portal."

CTA:

**Upgrade**

Secondary:

**Save Job Without Contacts**

---

# Epic 4: Missing Public Pages and Site Structure

## Landing Page

Build public landing page.

Core positioning:

**Stop applying. Start pursuing.**

Mission:

Dumpster Fire helps candidates stop disappearing into application portals by turning job posts into targeted pursuits with the right profile, proof, contacts, and outreach.

## Landing Page Sections

### Hero

Headline options:

"Stop applying. Start pursuing."

"Your job search is not broken because you need more applications."

"Find the role. Find the human. Send the message that does not sound like everyone else."

CTA:

**Start Building Your Profile**

Secondary:

**See Pricing**

### Problem

Most job tools help you do more of the thing that already is not working:

- more applications
- more portals
- more generic messages
- more resume keyword stuffing

Dumpster Fire is built around the part most candidates skip:

- who should hear from you
- why you are relevant
- what proof matters
- what to say

### Product Benefits

- Build a Career Operating System
- Manage multiple Role Tracks
- Store resumes and proof objects
- Match roles to the right narrative
- Find the human path
- Generate outreach that sounds like a real person
- Track pursuits instead of applications

### Career Profile Explanation

"Your Career Profile is not another resume.

It is the source of truth for how you work, what you prove, how you communicate, and what makes you useful.

The stronger the profile, the better the matches and outreach."

### Pricing

Show tiers:

- Basic
- Pro
- Future Premium / optional

Include feature table.

### CTA

"Build your profile."

Flow:

Landing page
Sign up
Auth
Onboarding
Saved profile
Dashboard

## Auth

Support:

- Google
- Apple
- Email

After auth:

If no profile exists:

- route to onboarding

If profile exists:

- route to dashboard

If onboarding incomplete:

- return to last incomplete onboarding step

## Additional Missing Pages

### Pricing Page

Same pricing as landing but more detail.

### About / Mission Page

Explain the philosophy:

- not more applications
- better pursuits
- human path
- profile-first strategy
- proof beats claims

### Account / Billing Page

- plan
- usage
- upgrade
- cancel
- billing history

### Profile Page

Launches profile management modal.

### Saved Jobs / Pursuits Dashboard

Track:

- saved role
- status
- selected Role Track
- proof used
- contacts found
- outreach generated
- sent/not sent
- response
- notes

### Settings

- auth
- email
- notifications
- data export/delete
- plan

### Legal

- Terms
- Privacy
- Data deletion
- AI/data usage explanation

## Required Build Behavior

- Onboarding autosaves
- Users can leave and return
- Profile is editable after onboarding
- Markdown generated internally
- Export gated by plan
- Search remains open
- Pursuits and outreach are metered
- Cover letters are removed
- Deep research is reserved for future interview prep

## Final Product Direction

Dumpster Fire should not feel like an AI writing tool.

It should feel like a job search operating system for people who are tired of behaving like applicants.

The core promise:

You are not trying to apply more.

You are trying to become harder to ignore.

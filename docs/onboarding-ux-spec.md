# Dumpster Fire Public Build: Onboarding UX Specification

## Purpose

This document defines the complete onboarding experience for Dumpster Fire.

The onboarding process creates a complete Candidate Profile.

A Candidate Profile is required before a user can generate pursuits, outreach, contacts, or job-specific recommendations.

The onboarding experience should feel like building a Career Operating System, not filling out a resume form.

---

# Core Product Philosophy

Most job tools ask for a resume.

Dumpster Fire asks for a model.

The goal is not to let AI guess who the candidate is.

The goal is to build a profile that captures:

- how they work
- what they prove
- what people hire them for
- how they communicate
- how they evaluate opportunities

The profile becomes the source of truth for everything else.

---

# User Flow

```text id="gaj6do"
Landing Page
↓
Pricing / Value Explanation
↓
Auth
↓
Onboarding Intro
↓
Profile Creation
↓
Profile Complete
↓
Dashboard
```

If onboarding is incomplete:

```text id="qjw7zv"
Login
↓
Resume Onboarding
```

Always return users to their last completed step.

---

# Progress Rules

The onboarding autosaves.

Users may leave and return.

Users may not generate pursuits until profile status is complete.

Display progress continuously.

Example:

```text id="wn0qdl"
Profile Completion

Identity                 ✓
Role Tracks             ✓
Resumes                 ✓
Projects                ✓
Skills                  ✓
Why People Hire Me      ✗
Operating Style         ✗
Decision Style          ✗
Communication Style     ✓
Writing Samples         ✓
AI Misreadings          ✗
Outreach Rules          ✗

Status:
Incomplete
```

No percentages.

Only:

- Complete
- Incomplete

---

# Screen 1

## Welcome

Headline:

Stop Applying. Start Pursuing.

Body:

Most job tools ask for a resume and then let AI guess who you are.

That's the problem.

A resume tells us what you've done.

It doesn't explain:

- how you think
- what makes you effective
- what problems people trust you with
- how you communicate
- why someone should actually respond

Dumpster Fire helps you build a Career Operating System.

The stronger your profile, the stronger your matches and outreach.

Do the work once.

Benefit every time.

CTA:

Build My Profile

---

# Screen 2

## Identity

Fields:

- Full Name
- Preferred Name (optional)
- Location
- Work Authorization
- LinkedIn URL
- Portfolio URL
- Personal Website URL

Validation:

Required:

- Full Name
- Location
- Work Authorization

Autosave on change.

---

# Screen 3

## Search Constraints

Fields:

- Remote Preference
- Compensation Floor
- Preferred Compensation
- Employment Types
- Availability
- Target Industries
- Avoid Industries
- Company Watchlist

Helper Copy:

This is not a wish list.

These settings determine what jobs are worth showing you.

---

# Screen 4

## Role Tracks

Headline:

You Are Not One Resume

Body:

Many candidates have more than one professional narrative.

Examples:

- Executive Producer
- Program Director
- Product Ops
- Creative Director

Create every Role Track you actively use.

Fields:

- Name
- Description
- Core Positioning
- Target Titles
- Outreach Angle

Users may:

- Add Track
- Duplicate Track
- Delete Track

At least one required.

---

# Screen 5

## Resume Upload

Headline:

Upload Resumes

Body:

Attach resumes to the appropriate Role Tracks.

Each resume should represent one professional narrative.

Workflow:

Upload file

Parse

Display parsed content

Show parsing quality

Statuses:

- Failed
- Weak
- Complete

If parsing quality is Weak:

Show warning:

We could not confidently understand parts of your work history.

A weak resume creates a weak profile.

Upload a cleaner version or correct the highlighted sections.

At least one complete resume required.

---

# Screen 6

## Work History Review

Do not ask users to manually enter work history.

Show parsed work history.

Allow corrections.

Fields:

- Company
- Title
- Responsibilities
- Accomplishments

User may edit.

User may not skip.

---

# Screen 7

## Projects

Headline:

Proof Beats Claims

Body:

Most candidates tell people they are strategic, collaborative, innovative, and results-driven.

Those words are useless.

Show us the projects that prove it.

Fields:

- Project Name
- Link
- Description
- Candidate Role
- What This Proves
- Capabilities Demonstrated
- Best Used For
- Avoid Using For

At least one project required.

---

# Screen 8

## Skills

Fields:

- Skill
- Proficiency
- Evidence
- Do Not Overclaim

Must be tied to:

- Project
or
- Work History

No floating skills.

---

# Screen 9

## Why People Hire You

Headline:

What Are Your Strengths?

Body:

Don't say:

- solving problems
- helping teams get organized
- working cross-functionally

Everyone says that.

Vague answers produce weak outreach.

Specific answers produce strong outreach.

Tell us:

- what people rely on you for
- what breaks if you're not there
- what kind of mess you clean up

Fields:

- Problems People Bring Me
- What Breaks If I'm Not There
- Messes I Clean Up
- Teams That Benefit From Me
- Most Useful Situations
- Least Useful Situations

Quality evaluation:

- Weak
- Complete

No chat loop.

No follow-up prompts.

---

# Screen 10

## Operating Style

Fields:

- How I Approach Problems
- How I Handle Ambiguity
- How I Work With Teams
- What I Value
- What I Reject

Each field receives quality evaluation.

---

# Screen 11

## Decision Style

Fields:

- How I Evaluate Roles
- What Makes A Role Worth Pursuing
- What Makes A Role A Bad Fit
- What I Look For In Companies
- Red Flags
- Green Flags

Quality evaluation applies.

---

# Screen 12

## Communication Style

Fields:

- Voice Description
- Preferred Tone
- What I Should Sound Like
- What I Should Never Sound Like
- Formality Level
- Humor Level
- Greeting Preferences
- Signoff Preferences
- Phrases To Avoid
- Phrases That Sound Like Me

---

# Screen 13

## Writing Samples

Two sections:

### Writing I Like

### Writing I Hate

For each:

- Text
- Why It Works / Fails

At least:

- 1 Like
- 1 Hate

Required.

---

# Screen 14

## What AI Gets Wrong About Me

Headline:

Prevent Generic AI Output

Body:

AI will make assumptions about you.

Some will be wrong.

This section prevents the system from turning you into a generic candidate.

Fields:

- Wrong Assumptions
- Bad Default Framings
- Skills Not To Exaggerate
- Roles Not To Force Me Into
- Language That Misrepresents Me

Required.

---

# Screen 15

## Outreach Rules

Fields:

- Hiring Manager Approach
- Recruiter Approach
- Functional Leader Approach
- Executive Sponsor Approach
- No Contact Routing Approach
- Follow Up Rules

Required.

---

# Screen 16

## Leadership Profile

Hidden.

Toggle:

Show Leadership Profile Inputs

Default:

Off

Fields:

- Leadership Style
- Team Management Style
- Stakeholder Style
- Conflict Style
- Executive Communication Style

Optional.

Does not impact completion.

---

# Completion Validation

Profile may only become complete if:

- all required screens completed
- all required fields populated
- all required quality-scored fields marked complete
- at least one Role Track exists
- at least one Resume exists
- resume parsing complete
- at least one Project exists
- at least one Skill exists
- at least one Like sample exists
- at least one Hate sample exists

No weak responses allowed.

If any weak responses remain:

Status = Incomplete

Message:

Your profile still contains weak inputs.

Weak inputs create generic outreach.

Complete the highlighted sections before continuing.

---

# Final Screen

Headline:

Profile Complete

Body:

Your Career Operating System is now active.

Dumpster Fire can now:

- Match jobs against your Role Tracks
- Select the right proof automatically
- Recommend the right resume
- Generate outreach in your voice
- Build human paths instead of portal submissions

CTA:

Go To Dashboard

---

# Post-Onboarding Behavior

Future edits happen through:

Edit Career Profile

Do not re-run onboarding.

Do not ask users to repeat answers.

Profile editing modifies the existing profile and regenerates internal markdown.

Onboarding is for creation.

Profile Management is for maintenance.
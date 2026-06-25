# Dumpster Fire Public Build: Profile Management Modal Specification

## Purpose

This document defines the Profile Management experience.

Onboarding creates the profile.

Profile Management maintains it.

Users should never need to repeat onboarding.

Users should never need to understand markdown.

Users should never need to remember how the system works.

The profile editor is the long-term source of profile maintenance.

The profile is edited through structured fields.

The markdown is regenerated automatically.

## Product Philosophy

The Career Profile is a living asset.

It should become more accurate over time.

Every:

- new project
- new resume
- new role track
- new accomplishment
- new proof object
- corrected assumption

should make future outreach better.

Profile maintenance should feel like maintaining a professional operating system.

Not filling out forms.

## Entry Points

Users can access Profile Management from:

### Dashboard

Button:

Edit Career Profile

### Profile Status Widget

Button:

Improve Profile

### Incomplete Profile Alert

Button:

Continue Profile

### Account Menu

Career Profile

## Modal Structure

Use a full-screen modal.

Do not use a tiny settings popup.

This is a core product surface.

Layout:

```text
--------------------------------
| Navigation | Content         |
--------------------------------
```

Left side:

Profile Sections

Right side:

Editor

## Left Navigation

Display:

```text
Identity

Search Constraints

Role Tracks

Resumes

Work History

Projects

Skills

Why People Hire Me

Operating Style

Decision Style

Communication Style

Writing Samples

What AI Gets Wrong About Me

Outreach Rules

Leadership Profile
```

Each section shows:

- Complete
- Incomplete

No percentages.

No progress bars.

## Header

Show:

Profile Status

```text
COMPLETE
```

or

```text
INCOMPLETE
```

Also show:

Last Updated

Version

Export Profile button

## Export Profile

Always visible.

### Basic Plan

Clicking Export shows:

Your Career Profile can be exported as a portable markdown file and used in:

- ChatGPT
- Claude
- Gemini
- Cursor
- Perplexity
- future AI tools

Profile Export is included with Pro.

Buttons:

Upgrade to Pro

Keep Editing

### Pro Plan

Downloads:

candidate_profile.md

## Identity Section

Editable fields:

- Name
- Preferred Name
- Location
- Work Authorization
- LinkedIn
- Portfolio
- Website

Autosave.

No save button.

## Search Constraints Section

Editable:

- Compensation
- Employment Types
- Remote Preferences
- Industries
- Company Watchlist
- Availability

## Role Tracks Section

This is one of the most important sections.

Display all Role Tracks as cards.

Example:

```text
Executive Producer

Program Director

AI Workflow / Product Ops
```

Actions:

Edit

Duplicate

Archive

Delete

## Add Role Track

Button:

Add Role Track

Fields:

- Name
- Description
- Positioning
- Target Titles
- Responsibilities
- Experience Patterns
- Strong Signals
- Weak Signals
- Outreach Angle

## Resume Section

Display:

Resume Cards

Example:

```text
Executive Producer Resume

Program Director Resume
```

Each card shows:

- Parsing Quality
- Associated Role Tracks
- Last Updated

Actions:

Replace Resume

Edit Resume Metadata

Archive Resume

## Resume Reparse

Button:

Reparse Resume

Use when user uploads updated version.

Should update:

- work history
- accomplishments
- parsed skills

without wiping profile sections.

## Work History Section

Display parsed work history.

Users can:

Edit

Merge duplicates

Correct parsing errors

Add missing accomplishments

Do not require manual re-entry.

## Projects Section

One of the highest-value sections.

Display project cards.

Each project shows:

- Name
- Link
- Capabilities
- Best Use Cases
- Confidence

Actions:

Edit

Archive

Duplicate

## Add Project

Fields:

- Name
- Link
- Description
- Candidate Role
- What This Proves
- Capabilities
- Best Used For
- Avoid Using For
- Metrics
- Caveats

## Skills Section

Display:

Skill

Evidence

Related Projects

Proficiency

Actions:

Edit

Delete

Add Skill

## Why People Hire Me

Display each answer.

Show:

```text
Quality:
Complete
```

or

```text
Quality:
Weak
```

If weak:

Show:

This answer is too vague.

Weak answers create generic outreach.

## Operating Style

Same structure.

Display quality.

Allow editing.

## Decision Style

Same structure.

Display quality.

Allow editing.

## Communication Style

Editable:

- voice
- tone
- phrases
- banned language
- greetings
- signoffs

Display sample previews.

## Writing Samples

Two groups:

Writing I Like

Writing I Hate

Each sample:

Edit

Delete

Duplicate

Add Sample

## What AI Gets Wrong About Me

Display as editable cards.

Examples:

People assume I'm a project manager.

People assume I care about agile ceremonies.

People assume I want to sound polished.

Users can:

Edit

Delete

Add

## Outreach Rules

Editable:

Hiring Manager Approach

Recruiter Approach

Functional Leader Approach

Executive Sponsor Approach

No Contact Routing

Global Rules

Role Track Rules

## Leadership Profile

Hidden by default.

Toggle:

Show Leadership Profile

When enabled:

Display:

- Leadership Style
- Team Management
- Stakeholder Management
- Conflict Style
- Executive Communication

## Version History

Button:

View Profile History

Display:

```text
Version 7

Updated:
May 12

Changes:
Added Project
Updated Role Track
```

Actions:

Restore Version

View Version

Compare Version

## Autosave Rules

Every edit autosaves.

No Save button.

Display:

```text
Saved
```

or

```text
Saving...
```

## Regeneration Rules

Profile markdown regenerates automatically when:

- Role Track changes
- Resume changes
- Project changes
- Communication Style changes
- Outreach Rules change

Do not regenerate on every keystroke.

Use debounce.

## Incomplete State

If any required field becomes weak or empty:

Profile status changes:

```text
INCOMPLETE
```

Show:

Your profile contains incomplete sections.

Core pursuit generation is unavailable until they are fixed.

Buttons:

Review Issues

Dismiss

## Quality Panel

Always visible.

Shows:

Incomplete Sections

Weak Responses

Missing Proof

Resume Parsing Issues

Example:

```text
Issues

2 weak responses

1 missing writing sample

Resume parsing warning
```

Clicking an issue jumps to the section.

## Future Hooks

Not launch features.

Reserve space for:

- Interview Prep
- Company Research
- Response Tracking
- Outreach Performance
- Profile Analytics

Do not build yet.

## Success Criteria

Users should feel:

"I am maintaining a professional operating system."

Not:

"I am filling out another profile form."

The profile should become more valuable over time.

Every edit should improve future pursuits.

The modal should be the long-term home for profile maintenance.

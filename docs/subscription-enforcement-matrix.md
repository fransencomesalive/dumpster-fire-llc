# Dumpster Fire Subscription Enforcement Matrix

## Purpose

This document defines:

- subscription tiers
- usage metering
- feature gating
- upgrade prompts
- error states
- recovery actions

The goal is to meter value-producing actions, not exploration.

Users should never feel punished for browsing.

Users should pay when they want the system to actively work on their behalf.

## Product Principle

Do not meter:

- search
- job browsing
- profile viewing
- saved jobs
- dashboard usage

Meter:

- Human Path generation
- Outreach generation
- Pursued Jobs Export

Search is discovery.

Pursuits create value.

## Plans

### Tester

Temporary.

Used during beta.

Purpose:

Collect feedback.

Features:

- Unlimited search
- Unlimited saved jobs
- Limited Human Paths
- Limited Outreach
- No Pursued Jobs Export

Suggested limits:

- 25 Human Paths/month
- 50 Outreach generations/month

### Basic

Suggested:

$29/month

Audience:

Active job seekers.

Features:

- Unlimited search
- Unlimited saved jobs
- Complete profile creation
- Multiple Role Tracks
- Multiple resumes
- Project library
- Pursuit workflow
- Human Path generation
- Outreach generation

Limits:

- 50 Human Paths/month
- 100 Outreach generations/month

Locked:

- Pursued Jobs Export

### Pro

Suggested:

$79/month

Audience:

Heavy users.

Features:

Everything in Basic plus:

- Pursued Jobs Export
- Expanded version history
- Higher limits
- Priority processing

Suggested limits:

- 200 Human Paths/month
- 500 Outreach generations/month

Alternative:

Unlimited under fair-use policy.

### Premium

Future.

Do not build now.

Potential features:

- Interview Prep
- Deep Company Research
- White Glove Services
- Strategy Reviews

## Metered Features

### Human Path

Definition:

Generating contact recommendations for a role.

Consumes:

1 Human Path

Not consumed by:

- viewing existing Human Path
- reviewing contacts
- reading previous results

Consumed only when:

Generate Human Path

is clicked.

### Outreach

Definition:

Generating outreach for selected contacts.

Consumes:

1 Outreach Generation

per generated message.

Example:

Selected Contacts:

- Hiring Manager
- Recruiter

Generate Outreach

Consumes:

2 Outreach Generations

because two messages are produced.

### Pursued Jobs Export

Definition:

Exporting pursued jobs with the selected `Applying As` Role Track/narrative, message sent, recipient/contact, pursuit status, and timestamps.

Only available on Pro.

## Feature Matrix

| Feature | Tester | Basic | Pro |
|----------|----------|----------|----------|
| Search | yes | yes | yes |
| Save Jobs | yes | yes | yes |
| Pursuits | yes | yes | yes |
| Role Tracks | yes | yes | yes |
| Multiple Resumes | yes | yes | yes |
| Project Library | yes | yes | yes |
| Human Path | Limited | Limited | Expanded |
| Outreach | Limited | Limited | Expanded |
| Pursued Jobs Export | no | no | yes |
| Version Restore | Basic | Basic | Advanced |

## Limit Reached States

### Human Path Limit

Trigger:

No remaining Human Paths.

Message:

You've used all Human Paths available on your current plan.

You can still search, save jobs, and review existing pursuits.

Upgrade to continue identifying hiring managers, functional leaders, and recruiters.

Buttons:

Upgrade

Keep Searching

### Outreach Limit

Trigger:

No remaining Outreach generations.

Message:

You've used all outreach generations available on your current plan.

You can still search, save jobs, review matches, and manage pursuits.

Upgrade to continue generating tailored outreach.

Buttons:

Upgrade

Keep Searching

### Pursued Jobs Export Locked

Trigger:

Basic plan user clicks Pursued Jobs Export.

Message:

Your pursuit history is the record of what you acted on, who you contacted, what you sent, and which narrative you used.

Export lets you keep that record portable outside Dumpster Fire.

Pursued Jobs Export is included with Pro.

Buttons:

Upgrade to Pro

Keep Editing

## Usage Visibility

Users should always know remaining usage.

Display:

Human Paths Remaining

Outreach Remaining

Plan

Renewal Date

Example:

Human Paths:
18 / 50

Outreach:
61 / 100

Plan:
Basic

## Upgrade Philosophy

Never use:

- countdown timers
- fake urgency
- dark patterns
- hidden limits

Always explain:

- what the feature does
- why it is useful
- what upgrading unlocks

The user should understand the value before upgrading.

## Dashboard Indicators

Show:

Plan

Human Paths Remaining

Outreach Remaining

Profile Status

Do not create a giant billing panel.

Keep it lightweight.

## Billing Recovery

If payment fails:

Freeze:

- Human Path generation
- Outreach generation
- Pursued Jobs Export

Allow:

- Login
- Search
- Saved Jobs
- Dashboard
- Profile Editing

Message:

Your subscription needs attention.

Your profile and saved work are still available.

Update billing to continue generating Human Paths and outreach.

Buttons:

Update Billing

Continue Browsing

## Future Tier Expansion

Reserved for:

- Interview Prep
- Company Research
- Advanced Analytics
- Response Tracking Insights

Do not build into current plan structure.

Keep current plans focused on:

Find Role
Find Human
Generate Outreach

## Success Criteria

Users should feel:

"I am paying for the system to help me pursue opportunities."

Not:

"I am paying for permission to search."

The product should monetize action, not curiosity.

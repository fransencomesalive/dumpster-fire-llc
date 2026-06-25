# Dumpster Fire Matching Engine Specification

## Purpose

The Matching Engine determines whether a role is worth pursuing and how it should be pursued.

The goal is not to maximize applications.

The goal is to maximize quality pursuits.

Every job should receive a match evaluation.

The system should actively discourage low-value pursuits and help users focus on roles where they have the highest probability of success.

## Core Product Philosophy

Most job tools optimize for volume.

Dumpster Fire optimizes for relevance.

The system should be willing to tell users:

> This one probably isn't worth your time.

That recommendation is a feature, not a failure.

## Inputs

The Matching Engine evaluates:

### Candidate Profile

- Role Tracks
- Projects
- Skills
- Work History
- Search Constraints
- Communication Profile
- Outreach Rules

### Job

- Title
- Description
- Compensation
- Location
- Employment Type
- Company
- Remote Status
- Posting Age
- Apply Method

### System Inputs

- Company Watchlist
- Company Blacklist
- Remote Exception Rules
- Industry Rules

## Match Output

Internal scoring:

```text
0-39    = Probably Not Worth Your Time
40-59   = Weak Match
60-79   = Potential Match
80-100  = Strong Match
```

Users never see the numeric score.

Users only see:

- Strong Match
- Potential Match
- Weak Match
- Probably Not Worth Your Time

## Hard Exclusion Rules

Jobs remain visible but receive exclusion messaging.

Examples:

Excluded:
Below compensation target

Excluded:
Onsite role

Excluded:
Company blacklist

Excluded:
Industry blacklist

The system should explain why the role was excluded.

Do not silently hide jobs.

## Match Evaluation Categories

The score should be composed from:

### Title Fit

How closely the title aligns with Role Tracks.

### Responsibility Fit

Alignment with:

- key responsibilities
- required experience
- operating patterns

### Proof Fit

Whether strong Projects exist that support the role.

### Resume Fit

Whether a supporting resume exists.

### Industry Fit

Target industries vs avoid industries.

### Compensation Fit

Target compensation vs posted compensation.

### Location Fit

Remote and geographic alignment.

### Company Fit

Watchlist and blacklist rules.

### Posting Freshness

Recency weighting.

### Apply Method

Easy Apply modifier.

## Role Track Recommendation

Recommend exactly one Role Track.

Display:

```text
Applying As

Program Director

Confidence: High
```

The user may override.

User choice always wins.

The recommendation never forces behavior.

## Resume Recommendation

Recommend exactly one resume.

Display:

```text
Recommended Resume

Executive Producer Resume

Reason:
Strong alignment with campaign, stakeholder, and production requirements.
```

## Project Recommendation

Display:

```text
Recommended Project

Alternative Project

Alternative Project
```

The outreach engine should use the Recommended Project by default.

Users do not manually select projects during pursuit creation.

Project selection is capability-driven.

Not title-driven.

## Risks

Every job should include risks.

Risks should be:

- specific
- useful
- lightly conversational
- non-corporate

Examples:

> This one is just a bit outside. The role leans heavily into Adobe Commerce delivery and your profile only partially overlaps.

> The title looks right, but the day-to-day may not be.

> Strong creative fit. Weak platform fit.

Do not use fear-based language.

Do not use recruiter language.

## Match Explanation

Every job should answer:

Why matched

Why not matched

Examples:

Why matched:

- Strong stakeholder leadership overlap
- Strong AI workflow experience
- Matching Program Director narrative

Why not matched:

- Compensation below target
- Requires relocation
- Heavy Adobe specialization

Transparency is required.

## Company Exception Rules

Company-specific rules may override default matching behavior.

Example:

Company:
OpenAI

Listing:
Hybrid

Known:
Remote exceptions have been reported

Result:

Remote risk reduced

These exception rules should positively influence scoring when credible evidence exists.

## Posting Freshness

Posting age matters significantly.

Fresh jobs receive score boosts.

Suggested weighting:

0-3 days:
Strong boost

4-7 days:
Moderate boost

8-14 days:
Neutral

15-30 days:
Negative

30+ days:
Stronger negative

This does not exclude the role.

It only affects prioritization.

## Easy Apply Modifier

Easy Apply should reduce score.

Display:

Easy Apply Link

Explanation:

This role is likely receiving significantly higher applicant volume.

Easy Apply should never disqualify a role.

It should reduce attractiveness.

## Profile Quality Influence

Profile quality affects confidence.

Complete profile:

Normal scoring

Incomplete profile:

No pursuit generation allowed

Weak profile sections:

Lower recommendation confidence

The matching engine should trust strong profile data more than weak profile data.

## Final Output Example

Strong Match

Applying As:
Program Director

Recommended Resume:
Program Director Resume

Recommended Project:
Phred

Why matched:

- Strong workflow systems overlap
- AI operations alignment
- Stakeholder-heavy environment

Risks:

- Compensation not listed
- Some responsibilities skew toward enablement

Notes:

Easy Apply Link

This role is likely receiving unusually high application volume.

Recommendation:

Pursue

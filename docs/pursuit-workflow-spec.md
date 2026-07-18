# Dumpster Fire Pursuit Workflow Specification

> **PARTIALLY SUPERSEDED, 2026-07-18:** The canonical specification for Saved Pursuits is
> `docs/saved-pursuits-feature-spec-2026-07-18.md`. That document supersedes this file's
> Saved Job versus Pursuit split, linear tracking lifecycle, dashboard-column model, and
> Offer action. The Review, Human Path, contact-selection, outreach-generation, expiration,
> and no-automatic-deletion principles here remain valid where they do not conflict with the
> newer specification.

## Purpose

A Pursuit is the core unit of work in Dumpster Fire.

Users do not apply.

Users pursue.

A Pursuit represents an intentional effort to pursue a role through the Human Path workflow.

## Definitions

Saved Job:
A bookmarked opportunity.

Pursuit:
An active role the user intends to pursue.

Human Path:
The identified chain of relevant humans associated with a role.

## User Flow

Search
↓
Save Job
↓
Review
↓
Pursue
↓
Human Path
↓
Select Contact(s)
↓
Generate Outreach
↓
Track Outcome

## Saved Job vs Pursuit

Saved Jobs are free.

Unlimited.

A Saved Job becomes a Pursuit only when the user clicks:

Pursue

This distinction is important.

A user may save 200 jobs.

A user may actively pursue 20.

## Pursuit State Machine

Discovered
↓
Saved
↓
Review Complete
↓
Human Path Generated
↓
Outreach Ready
↓
Outreach Sent
↓
Applied
↓
Responded
↓
Interviewing
↓
Offer
↓
Rejected
↓
Expired
↓
Deleted

## Review Stage

Purpose:

Determine how the system should approach the role.

Display:

Applying As
(Role Track recommendation)

Fit Summary

Remote Match

Risks

Recommended Resume

Recommended Proof

Recommended Outreach Angle

User actions:

Accept recommendation

Override Role Track

Continue

User always wins.

Recommendations never override user choice.

## Human Path Generation

Consumes Human Path usage.

Output:

Likely Hiring Manager

Functional Leader

Recruiter

Executive Sponsor (optional)

Confidence

Reasoning

LinkedIn URL

Role Connection

All contacts shown.

Ranked.

Nothing hidden.

## Contact Selection

User selects one or more contacts.

No outreach is generated yet.

No usage consumed yet.

## Outreach Generation

Consumes Outreach usage.

Generate outreach only for selected contacts.

One message per selected contact.

Message must use:

- selected Role Track
- selected Resume
- recommended Proof
- selected Contact Type

Messages are contact-specific.

Recruiters do not receive hiring manager messages.

## Tracking Stage

User actions:

Mark Outreach Sent

Mark Applied

Mark Responded

Mark Interviewing

Mark Offer

Mark Rejected

Add Notes

## Expiration

90 days inactive

Status becomes:

Expired

Prompt:

Keep Pursuit

Delete Pursuit

No automatic deletion.

No automatic archive.

## Metering

Search:
Not metered.

Save Job:
Not metered.

Review:
Not metered.

Human Path:
Metered.

Outreach Generation:
Metered.

Pursued Jobs Export:
Metered by plan.

## Dashboard Columns

Saved

Review

Outreach Ready

Outreach Sent

Applied

Responded

Interviewing

Offer

Rejected

Expired

## Success Criteria

A user should move from:

Job Posting

to

Known Candidate

without relying solely on application portals.

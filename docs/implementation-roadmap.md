# Dumpster Fire Public Build: Implementation Roadmap & Dependency Map

## Purpose

This document defines:

- implementation order
- dependencies
- milestone sequencing
- launch scope
- post-launch scope

The goal is to prevent building features out of order.

Build the foundation first.

Build the UI second.

Build advanced functionality third.

## Guiding Rule

Do not build screens before the data model exists.

Do not build workflows before the profile exists.

Do not build outreach before matching exists.

Do not build matching before profile data exists.

## Build Phases

## Phase 0

Current State

Completed:

- Product Vision
- Product Philosophy
- Candidate Profile Schema
- Database Model
- Onboarding UX
- Profile Management UX
- Pursuit Workflow
- Human Path Engine
- Matching Engine
- Subscription Enforcement

These documents become the source of truth.

## Phase 1

Foundation

Priority: Critical

No public launch without this phase.

### Task 1

Authentication

Support:

- Google
- Apple
- Email

Requirements:

- account creation
- login
- logout
- password reset
- session persistence

Completion:

User can authenticate.

### Task 2

Database Objects

Build:

- Candidate Profile
- Role Tracks
- Resumes
- Work History
- Projects
- Skills
- Writing Samples
- Outreach Rules
- Profile Versions
- Pursuits
- Contacts
- Outreach Messages
- Usage Ledger

Completion:

All schemas exist.

### Task 3

Profile Generation Service

Build:

Structured Profile
↓
Generated Markdown

Requirements:

- regenerate on changes
- version history
- export support

Completion:

Profile can be generated.

## Phase 2

Onboarding

Priority: Critical

### Task 4

Onboarding Flow

Build:

- welcome
- identity
- search constraints
- role tracks
- resumes
- work history review
- projects
- skills
- why people hire me
- operating style
- decision style
- communication style
- writing samples
- AI misreadings
- outreach rules
- leadership profile

Requirements:

- autosave
- resume parsing
- quality scoring
- completion checks

Completion:

User can create a complete profile.

### Task 5

Profile Completion Engine

Requirements:

Complete

Incomplete

No middle state.

Completion:

Profile blocks generation when incomplete.

## Phase 3

Profile Management

Priority: Critical

### Task 6

Profile Management Modal

Build:

All editing functionality.

Requirements:

- autosave
- version history
- project management
- resume management
- role track management

Completion:

User never needs onboarding again.

## Phase 4

Matching Engine

Priority: Critical

### Task 7

Matching Engine

Inputs:

- profile
- role tracks
- projects
- skills
- job

Outputs:

- match label
- role track recommendation
- resume recommendation
- project recommendation
- risks
- explanation

Completion:

Jobs receive match evaluations.

### Task 8

Hard Exclusion Engine

Examples:

- salary
- remote
- blacklist

Completion:

Excluded jobs display correctly.

## Phase 5

Pursuit Workflow

Priority: Critical

### Task 9

Saved Jobs

Build:

Save Job

Completion:

Jobs can be stored.

### Task 10

Pursuits

Build:

Pursue

Workflow:

Review
↓
Human Path
↓
Contacts
↓
Outreach
↓
Track

Completion:

Pursuits operational.

## Phase 6

Human Path Engine

Priority: Critical

This is the moat.

### Task 11

Contact Discovery

Build:

- hiring manager
- functional leader
- recruiter
- executive sponsor

Requirements:

confidence scoring

reasoning

links

Completion:

Human Path works.

### Task 12

Contact Ranking

Build:

startup

agency

enterprise

rules

Completion:

Contact prioritization works.

## Phase 7

Outreach Generation

Priority: Critical

### Task 13

Message Generation

Inputs:

- role track
- resume
- project
- contact type

Outputs:

contact-specific outreach

Completion:

Outreach generation works.

### Task 14

Usage Metering

Consumes:

- Human Path
- Outreach

Does not consume:

- search
- save job

Completion:

Usage tracking operational.

## Phase 8

Subscription System

Priority: Critical

### Task 15

Plan Enforcement

Tester

Basic

Pro

Completion:

Limits enforced.

### Task 16

Upgrade States

Build:

- outreach limit reached
- human path limit reached
- export locked

Completion:

Upgrade paths operational.

## Phase 9

Public Site

Priority: Launch

### Task 17

Landing Page

Requirements:

- mission
- pricing
- philosophy
- CTA

Completion:

Public marketing site operational.

### Task 18

Pricing Page

Completion:

Plans visible.

### Task 19

Auth Routing

No profile:
→ onboarding

Incomplete profile:
→ onboarding

Complete profile:
→ dashboard

Completion:

Routing complete.

## Launch Scope

Must Have

- auth
- profile creation
- profile editing
- matching
- pursuits
- contacts
- outreach
- subscriptions
- landing page

## Post Launch

Not Required

- interview prep
- deep company research
- analytics
- response optimization
- advanced coaching
- company intelligence
- premium tier

## Final Principle

Build the machine.

Not the decoration.

A role should move through:

Job
↓
Match
↓
Pursuit
↓
Human Path
↓
Outreach

before time is spent polishing secondary features.

The Human Path and Outreach systems are the product.

Everything else exists to support them.

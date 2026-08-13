# ehllo Product Foundation

Last updated: 2026-07-24

> Historical foundation and initial market hypothesis. The current canonical product experience is defined in the [Product Source of Truth](./00-product-source-of-truth.md).

## Initial customer segment

Independent consultants and fractional professionals who regularly meet potential clients, partners, and referrals; sell high-value professional services; and personally manage their follow-ups.

Examples include product, design, marketing, technology, and strategy consultants; fractional product or marketing leaders; small independent agency owners; and specialist professional-service providers.

## Primary user

An independent consultant or fractional professional who:

- Works independently or runs a very small consultancy
- Has at least three external professional meetings per week
- Depends on relationships and referrals for revenue
- Has multi-conversation sales or partnership cycles
- Considers a conventional CRM too complicated
- Personally owns follow-up completion

## Buyer

The primary user is also the initial buyer. They purchase ehllo for their individual professional workflow rather than through a central procurement or sales-operations team.

## Trigger

An important professional meeting ends and the user needs to preserve the context, commitments, and next action before returning to other work.

## Existing alternatives

- Memory and handwritten notes
- Notes applications
- Email drafts and inbox flags
- Calendar-event descriptions
- Personal task managers
- Spreadsheets
- Conventional CRMs that the user finds too complex or burdensome

## Painful failure

The user forgets important context, delays a promised action, sends a generic follow-up, or allows a valuable opportunity to go cold because information is scattered across tools.

## Reason to pay

ehllo helps protect relationship-driven revenue by reducing missed commitments, making follow-up easier, and preserving the context needed for a timely and personal response without requiring the user to maintain a full CRM.

## Problem statement

> Independent consultants lose momentum with potential clients, partners and referrals because important meeting context, commitments and next actions are scattered across memory, notes, inboxes and calendars.

## Product promise

> ehllo helps independent consultants remember what mattered in every professional meeting and complete the right follow-up on time.

## Job to be done

> After an important professional meeting, help me capture what mattered and complete the next action before the opportunity goes cold.

## Core domain object

The core domain object is an **Encounter**, not merely a Contact. One Contact can have multiple Encounters, each with its own context, commitments, next actions, and follow-up state.

## Primary metric

> Percentage of captured encounters that result in a user-reviewed follow-up being completed within 72 hours.

## Supporting metrics

- Percentage of new users who publish a card and capture a first encounter during onboarding
- Median time required to capture an encounter
- Percentage of captured encounters with a recorded next action
- Percentage of follow-up drafts reviewed by the user
- Median time from encounter capture to completed follow-up
- Weekly active users who capture at least one encounter
- Four-week retention among users with at least three external meetings per week
- Follow-ups dismissed, overdue, or completed

## Product principles

1. Encounter-first, not card-first
2. Capture should take less than two minutes
3. Recipients do not need an ehllo account
4. AI output must always be reviewed by the user
5. ehllo must never send a message autonomously in the MVP
6. Meeting notes and relationship context are private by default
7. The responsive web product comes before native applications
8. The MVP supports one individual workspace, not teams
9. The product should complement email and calendars rather than replace them
10. The user outcome is completed follow-up, not data collection

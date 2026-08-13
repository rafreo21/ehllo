# Recommended MVP: ehllo

## Product promise

After every important meeting, the user knows who they met, what mattered, and what to do next.

## Target customer

Independent consultants and agencies with 2–20 people who win business through introductions, events, and discovery conversations but do not consistently maintain a CRM.

## MVP user journey

1. The user creates a public profile with photo, role, company, short introduction, links, and contact details.
2. The product generates a public URL and QR code.
3. A recipient opens the card without installing an app.
4. The recipient can save a vCard or share their own details through a short form.
5. The owner receives the new contact and records a 15–30 second post-meeting voice memo or types a note.
6. AI converts it into structured context: summary, interests, promises, next action, and follow-up date.
7. The product drafts a follow-up email or message for review.
8. The relationship appears in a private timeline and follow-up queue.

## MVP features

### Public card

- Profile editor
- Mobile-first public page
- QR-code generation
- Downloadable vCard
- Reciprocal contact form
- Basic branding

### Contact workspace

- Contact list and detail page
- Source and meeting date
- Notes and relationship timeline
- Search and tags
- Duplicate detection by email and phone
- CSV import/export

### Context and follow-up

- Typed notes
- Optional voice memo with explicit user action
- Structured AI extraction
- Suggested next action and date
- Editable follow-up draft
- Daily reminder queue
- Email deep link initially; direct sending later

### Basic analytics

- Card views
- Details returned
- Contacts captured
- Follow-ups created
- Follow-ups completed

## Explicitly out of scope

- Passive or continuous recording
- Contact-data scraping
- Native mobile apps
- NFC card fulfillment
- Team provisioning and SSO
- Complex CRM sync
- Automated message sending without review
- Event ROI attribution

## Success metrics

The key metric is not card views. It is:

> Percentage of captured contacts receiving a completed follow-up within 72 hours.

Supporting metrics:

- time to publish the first card,
- share-to-return-contact conversion,
- percentage of contacts with context recorded,
- draft acceptance/edit rate,
- weekly users opening the follow-up queue,
- four-week retention,
- and user-reported meetings or revenue influenced.

## Validation plan

Before a full build:

1. Interview 10–15 consultants or agency owners.
2. Test a clickable card-and-follow-up prototype.
3. Run a concierge pilot: manually process meeting notes and create follow-up drafts for five users.
4. Confirm that at least three users repeatedly log meetings for two weeks.
5. Charge for the pilot before building advanced automation.

## Initial commercial hypothesis

- Free: one card, up to 25 contacts, manual notes.
- Solo: £8–12/month for unlimited contacts, AI extraction, drafts, and reminders.
- Studio: £29–49/month for up to five users, shared templates, ownership, and reporting.

Pricing should be tested against willingness to pay, not copied from competitors.

# Technical plan

## Recommended first implementation

A responsive web application and installable PWA are sufficient for the first release.

Suggested stack:

- Next.js with TypeScript
- PostgreSQL
- Managed authentication with passkeys and email magic links
- Object storage for profile images and short voice memos
- Background job queue for transcription, extraction, and reminders
- Transactional email provider
- Standards-based vCard generation
- QR code generation in the application
- Product analytics with privacy-conscious event collection

The exact vendors should be selected when implementation begins.

## Core data model

- Workspace
- User
- PublicProfile
- ProfileField
- Contact
- ContactMethod
- Encounter
- Note
- Commitment
- FollowUp
- MessageDraft
- Tag
- ConsentRecord
- AnalyticsEvent

An `Encounter` is important: one person can be met many times, and each meeting has its own context, source, notes, and commitments.

## AI workflow

Input:

- a typed note or user-initiated voice memo,
- known contact information,
- meeting timestamp and optional event/source.

Structured output:

- concise factual summary,
- topics discussed,
- facts about the contact,
- commitments made by either side,
- recommended next action,
- suggested follow-up date,
- and a draft message.

Guardrails:

- Show extracted facts for user correction.
- Never invent missing contact facts.
- Mark uncertain content.
- Require review before any external message is sent.
- Keep original notes available.
- Offer deletion and retention controls.
- Avoid training on customer content unless explicitly agreed.

## Delivery phases

### Phase 0 - validation, 1–2 weeks

- Interviews
- Journey prototype
- Concierge follow-up test
- Segment and pricing decision

### Phase 1 - card and capture, 2–3 weeks

- Authentication and onboarding
- Profile editor and public card
- QR and vCard
- Reciprocal details form
- Contact list

### Phase 2 - context and action, 2–3 weeks

- Encounters and notes
- Voice upload and transcription
- Structured extraction
- Follow-up drafts and reminders
- Relationship timeline

### Phase 3 - pilot hardening, 2 weeks

- Analytics
- Imports/exports
- Deduplication
- Data deletion and consent records
- Accessibility, performance, reliability, and security review

This suggests a useful pilot in roughly 7–10 weeks for one small product team, after validation. It is an estimate, not a delivery commitment.

## Expansion path

1. Gmail and Outlook contact/email integrations
2. Shared small-team workspace
3. Calendar context and meeting detection
4. One CRM integration chosen from actual customer demand
5. Wallet passes and richer PWA/mobile capture
6. Vertical templates and workflows
7. Native mobile apps if usage requires offline scanning
8. NFC accessories through a manufacturing partner

## Security and privacy checklist

- Encrypt data in transit and at rest.
- Separate public profile data from private relationship data.
- Use short-lived signed access for audio.
- Document subprocessors and retention.
- Support account export and deletion.
- Record consent where audio or enriched data is involved.
- Assess UK GDPR, EU GDPR, PECR/ePrivacy, and applicable recording laws with qualified counsel.
- Rate-limit public forms and protect them from spam.
- Do not expose private notes through public-profile endpoints.

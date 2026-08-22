# QR sharing - online vs offline

ehllo uses two QR modes on **Quick Share**. Every other share surface defaults to **online** (card URL).

## Online (default)

- **Quick Share:** toggle **Online contact QR** ON
- **Widgets, Wallet, tap-to-share, capture flow, email signature, virtual background:** always online
- QR encodes `https://ehllo.io/c/{slug}` (or your configured `NEXT_PUBLIC_APP_URL`)

**Visitor with phone camera + internet**

1. Camera scans QR → browser opens public card page
2. Visitor saves contact and/or fills **Share back** form
3. Owner sees inbound exchange in ehllo

This is the primary visitor flow. Do not use vCard-only QRs for events where share-back matters.

## Offline (opt-in)

- **Quick Share only:** toggle **Online contact QR** OFF → title shows **Offline contact QR active**
- QR encodes a vCard with contact details and an embedded ehllo card link
- Preference is remembered on the device

**Visitor with phone camera**

1. Camera scans QR → Contacts app opens
2. Contact saves locally with phone, email, and ehllo link
3. **Profile photo** and **company logo** use image URLs in the vCard (Contacts fetches them when the phone is online at save time)
4. **Cover photo** is linked as a labeled URL in the contact (not shown as a banner in stock Contacts apps)
5. Share-back happens after they open the **ehllo card** link when online

Heavy cards automatically use a compact or minimal vCard so the QR still renders.

## vCard images (iOS and Android)

| Save path | Profile photo | Company logo | Cover |
|-----------|---------------|--------------|-------|
| **Save to contacts** on card page (`/c/{slug}/contact.vcf`) | Embedded base64 | Embedded `LOGO` | Labeled URL |
| **Offline QR / NFC vCard** | Image URL in QR | Image URL in QR (full/compact tiers) | Labeled URL (full tier only) |

Stock **Contacts** apps show the profile photo in the avatar. Company logo and cover art support varies by OS and contact app.

## ehllo in-app scanner

Quick Scan inside the app is for **ehllo users** adding cards to their network - not the public visitor flow.

| Scan type | In-app scanner | Phone camera |
|-----------|----------------|--------------|
| Online URL QR | Adds to connections | Opens card page |
| Offline vCard QR with ehllo link | Adds to connections | Saves to Contacts |
| Offline vCard QR without link | Error - ask for online QR | Saves to Contacts only |

## Before testing

1. Card is **published** on beta
2. Public URL loads: `https://ehllo.io/c/{slug}`
3. Mobile app reloaded from Metro after latest changes

## Tap to share + Wallet

- **Tap to share (Android):** shares the card URL over NFC - requires a dev/prod build with the HCE native module
- **Google / Apple Wallet:** barcode is URL-only (platform requirement)

See [WALLET_SETUP.md](./WALLET_SETUP.md) for server credentials.

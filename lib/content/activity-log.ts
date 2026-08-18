/**
 * The public activity log behind /activity.
 *
 * Written for two audiences at once: testers who need to know what changed
 * under them, and anyone watching who deserves to see the work honestly. That
 * second audience is why `issues` carries things that are still open and things
 * we got wrong, not only what we fixed. A log that only lists wins is
 * marketing, and nobody testing against it can trust it.
 *
 * Keep entries in the language of what someone would notice, not the language
 * of the commit. "Scanning someone's card did nothing" is useful; "fix RPC
 * conflict arc" is not.
 */

export type ActivityImpact = "fix" | "improvement" | "new";

export type ActivityEntry = {
  /** ISO date. */
  date: string;
  /**
   * 24h local time, taken from when the change actually landed rather than
   * written by hand. Adding these caught five entries filed under the 17th that
   * were really the small hours of the 18th.
   */
  time: string;
  title: string;
  impact: ActivityImpact;
  /** What a person would actually notice. One or two sentences. */
  detail: string;
  /** Optional: what to try, for testers. */
  testing?: string;
};

export type IssueStatus = "fixed" | "in-progress" | "open" | "monitoring";

export type KnownIssue = {
  title: string;
  /** 24h local time the report came in or the fix landed. */
  time: string;
  status: IssueStatus;
  /** Plainly what went wrong, from the user's side. */
  detail: string;
  /** Where it stands now. */
  resolution?: string;
  reportedOn: string;
};

export const ACTIVITY_UPDATED = "18 August 2026";

/** Times are local (BST). */
export const ACTIVITY_TZ_OFFSET = "+01:00";

export const ACTIVITY_ENTRIES: ActivityEntry[] = [
  {
    date: "2026-08-18",
    time: "14:24",
    title: "The Wallet card was redesigned",
    impact: "improvement",
    detail:
      "Your photo now leads the card, with your name and role beneath it and the QR on a white tile. The pass ships at higher resolution, and a card with no photo keeps its shape and colour instead of rendering as a bare block.",
    testing: "Card tools, then Wallet. Add the pass and check the band across the top.",
  },
  {
    date: "2026-08-18",
    title: "Scanning a card works again, in both directions",
    time: "02:57",
    impact: "fix",
    detail:
      "Scanning someone's card was failing outright for everyone. It now adds them to your people, and adds you to theirs, even if neither of you has published a card yet. The person you scanned is told you connected.",
    testing:
      "Needs two accounts on two devices. Scan one card from the other and check both sides show the connection and an email address.",
  },
  {
    date: "2026-08-18",
    title: "A second account on the same device no longer sees the first one's data",
    time: "10:09",
    impact: "fix",
    detail:
      "Everything stored on the device for offline use - your cards, cached follow-ups and events, capture drafts, notification history - was shared between accounts. Signing in as someone else showed them the previous person's data and could replay the previous person's queued actions under their name. Each account now has its own storage, and older unscoped data is cleared on first launch.",
    testing:
      "Sign in as one account, then another, on the same device. The second should start clean. Existing local caches are cleared once, so expect a re-sync.",
  },
  {
    date: "2026-08-18",
    title: "Being invited to an event shows up in the app",
    time: "13:35",
    impact: "fix",
    detail:
      "An invitation only ever arrived as an email. If you already used ehllo, nothing appeared in your events and you were never notified - you had to find the email. Invitations now appear alongside calendar suggestions with Going and Not going, labelled with who invited you, and you get a notification.",
    testing: "Invite an address that belongs to another ehllo account and check that account's Events.",
  },
  {
    date: "2026-08-18",
    title: "A connection page is now one shared thread",
    time: "13:38",
    impact: "new",
    detail:
      "Both people see the same history: when you met, meetings you were both in, invitations between you, and follow-ups recorded against your address. Private notes, transcripts and drafts never cross. A meeting summary only becomes visible to the other person once you deliberately share that meeting.",
  },
  {
    date: "2026-08-18",
    title: "Events can be pushed to your Google or Outlook calendar",
    time: "11:17",
    impact: "new",
    detail:
      "Adding an event offers to put it on your connected calendar, and edits and cancellations follow it across. If your calendar and ehllo ever disagree, ehllo keeps your version and says so rather than silently overwriting either side.",
    testing: "Connect a calendar in Settings first; the option only appears when a calendar is connected and healthy.",
  },
  {
    date: "2026-08-18",
    title: "Sharing your details from someone's card connects you both",
    time: "07:15",
    impact: "fix",
    detail:
      "Filling in your details on someone's public card recorded you for them but left them missing from your side until you signed in - and sometimes never. Both sides are now recorded at the moment it happens.",
  },
  {
    date: "2026-08-18",
    title: "Follow-up reminders no longer skip people without an email",
    time: "12:23",
    impact: "fix",
    detail:
      "If a connection had no email address saved, they were quietly dropped from follow-up reminders entirely. They now appear, with a prompt to add a way of contacting them.",
  },
  {
    date: "2026-08-18",
    title: "Text, email and search fields render properly",
    time: "13:35",
    impact: "fix",
    detail:
      "Some fields showed their text with every letter spaced apart. Affected the invite email field, the event edit field, and follow-up search.",
  },
  {
    date: "2026-08-18",
    title: "Tidier headers, and a lighter filter on Events",
    time: "11:29",
    impact: "improvement",
    detail:
      "Removed the small capitalised label above every page title, which added a line without adding information, and shortened page descriptions to one line. The selected filter on Events is now light rather than dark, so it stops competing with the events beneath it.",
  },
  {
    date: "2026-08-17",
    title: "Declining an event no longer makes it disappear",
    time: "22:55",
    impact: "fix",
    detail:
      "Saying you were not going removed the event from the app entirely, with no way to see or undo the decision. Declined events stay visible and reversible, and the Events list is now one filter per state.",
  },
  {
    date: "2026-08-18",
    title: "Say \"I'm here\" at an event",
    time: "00:04",
    impact: "new",
    detail:
      "Captures made at an event used to guess which event they belonged to. You can now confirm you have arrived, including shortly before it starts, and record when you leave.",
  },
  {
    date: "2026-08-18",
    title: "Apple Wallet passes and branded QR codes fixed",
    time: "01:57",
    impact: "fix",
    detail:
      "Wallet passes now open in Wallet instead of the share sheet, and are built around your photo. The branded QR code stopped falling back to a plain one, and now renders on the widget, email signature, watch face and virtual backgrounds.",
  },
  {
    date: "2026-08-18",
    title: "Scans stopped failing forever against the wrong environment",
    time: "01:20",
    impact: "fix",
    detail:
      "A QR code from one environment scanned in another retried endlessly and blamed your people list. A card that does not exist here is now reported as exactly that, once.",
  },
  {
    date: "2026-08-18",
    title: "Sign-in code submits itself, and failures say why",
    time: "02:21",
    impact: "improvement",
    detail:
      "Entering the sixth digit now submits automatically. When a sign-in email fails to send, the real reason is surfaced instead of a generic message.",
  },
  {
    date: "2026-08-18",
    title: "Airbnb Cereal across the mobile app",
    time: "00:16",
    impact: "improvement",
    detail: "New typeface with a rebuilt type hierarchy using its real weights.",
  },
];

export const KNOWN_ISSUES: KnownIssue[] = [
  {
    title: "Calendar option appeared to do nothing",
    time: "13:20",
    status: "in-progress",
    detail:
      "Turning on \"add to my calendar\" when creating an event had no effect: the event was created but never reached the calendar.",
    resolution:
      "The app was updated ahead of the server. Fixed, and takes effect on the next staging release.",
    reportedOn: "2026-08-18",
  },
  {
    title: "Publishing a first card failed after switching accounts",
    time: "10:09",
    status: "fixed",
    detail:
      "Signing into a second account on a device that had been used by someone else could fail to publish a card, because queued actions from the previous account were replayed.",
    resolution:
      "Device storage is now separate per account, and older shared data is cleared once on launch.",
    reportedOn: "2026-08-18",
  },
  {
    title: "Scanning added the person for you but not for them",
    time: "01:50",
    status: "fixed",
    detail:
      "A new tester who scanned someone's card was added to that person's list only if they had already published a card. Brand new accounts stayed invisible to the people they met.",
    resolution: "A connection needs a person, not a published card. Both sides are recorded either way.",
    reportedOn: "2026-08-17",
  },
  {
    title: "Two accounts could see each other's cached data on a shared device",
    time: "10:09",
    status: "fixed",
    detail:
      "Device-local caches were not separated per account, so a shared demo phone could show one person's cached cards and capture drafts to the next person who signed in.",
    resolution: "Storage is scoped per account and older shared data is cleared.",
    reportedOn: "2026-08-18",
  },
  {
    title: "Production has not received this work yet",
    time: "14:30",
    status: "open",
    detail:
      "Everything above is on the staging environment used by TestFlight and internal Play builds. The production app is a separate environment and has not been updated.",
    reportedOn: "2026-08-18",
  },
  {
    title: "Two-device checks still outstanding",
    time: "14:30",
    status: "monitoring",
    detail:
      "Several fixes only fail when two different people are involved, which is exactly the case a single test account cannot reproduce. Scanning between two real accounts, and switching accounts on one device, are being verified on devices.",
    reportedOn: "2026-08-18",
  },
];

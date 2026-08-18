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
  /**
   * Optional: somewhere to see the change rather than read about it - a design
   * spec, a rendered template. Only worth attaching when looking at it explains
   * more than the sentence can.
   */
  link?: { href: string; label: string };
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
    time: "23:55",
    title: "All seven notification switches now stay where you put them",
    impact: "fix",
    detail:
      "Turning on New connections, Keep in touch nudges or Contact requests appeared to work and then reverted as soon as you left the screen - only the first four switches survived. Saving your preferences rebuilt them from a list that had never been updated as those three were added, so they were dropped on the way to being saved. All seven persist now.",
    testing:
      "Turn all seven on in Settings, close the app, reopen it and check them.",
  },
  {
    date: "2026-08-18",
    time: "23:30",
    title: "Occupation and company show on the Android card, not just behind a tap",
    impact: "fix",
    detail:
      "If you filled in your job title and company, they appeared on the front of the Apple pass but only in the details view on Android - you had to tap the pass to see them. Same card, same settings, two different experiences. They now show on the front of both. Company still follows the show company details switch in the card editor, and neither appears if you have not filled it in.",
    testing:
      "Fill in job title and company on your card, then add it to Google Wallet and look at the card without tapping it.",
    link: {
      href: "https://claude.ai/code/artifact/5da4bca6-e5b6-4002-9b8e-b65f7843593b",
      label: "See the pass spec and design",
    },
  },
  {
    date: "2026-08-18",
    time: "23:05",
    title: "The ehllo badge holds its edge on every card colour",
    impact: "improvement",
    detail:
      "The mark is a green circle, and ehllo's default card colour is also green - so on a default card the circle disappeared into the background and left the two figures floating with no edge. It now sits inside a thin white ring, which separates it from any colour behind it while keeping the brand green. A plain white badge would have fixed the green card by removing the green from every other one.",
    testing:
      "Add your card to either wallet on the default green colour, then on a dark one, and compare the logo.",
    link: {
      href: "https://claude.ai/code/artifact/5da4bca6-e5b6-4002-9b8e-b65f7843593b",
      label: "See the pass spec and design",
    },
  },
  {
    date: "2026-08-18",
    time: "22:45",
    title: "Your wallet pass stops writing an About you never wrote",
    impact: "fix",
    detail:
      "If you had not filled in the About field, both wallet passes printed a line of our own text under your name as though you had written it. Now an empty About simply does not appear. The pass shows what is in your card editor and nothing else - the same is already true of your job title, company, photo and colour.",
    testing:
      "Add the card to either wallet with the About field empty, and check the back of the pass.",
    link: {
      href: "https://claude.ai/code/artifact/5da4bca6-e5b6-4002-9b8e-b65f7843593b",
      label: "See the pass spec and design",
    },
  },
  {
    date: "2026-08-18",
    time: "22:10",
    title: "Wallet passes rebuilt for both phones",
    impact: "improvement",
    detail:
      "Your card in Apple Wallet and Google Wallet has been rebuilt around the person rather than the product. The photo fills the card, your name is the heading, and the colour you picked in the card editor now drives the whole pass with text that stays readable on it - it was fixed to white before, which was unreadable on any light colour, including ehllo's own default. On Android the brand mark had been replaced by your own photo, so the same picture appeared twice and the logo appeared nowhere; the largest line on the card read \"ehllo Card\" instead of your name. Both fixed. The QR code is chunkier on both platforms, so it scans from further away.",
    testing:
      "Add to Apple Wallet, and Save to Google Wallet, on a card with a photo. Change the card colour and add it again.",
    link: {
      href: "https://claude.ai/code/artifact/5da4bca6-e5b6-4002-9b8e-b65f7843593b",
      label: "See the pass spec and design",
    },
  },
  {
    date: "2026-08-18",
    time: "20:40",
    title: "Push notifications work on the second account, not just the first",
    impact: "fix",
    detail:
      "If two accounts had ever used the same device, only one of them could receive push notifications - the first to register kept them, and every later attempt was refused and discarded without a word. That is why notifications could be switched on everywhere and still only one device was actually registered. Contact requests also have their own notification setting now, so you can keep them without keeping shared-meeting updates.",
    testing:
      "Sign in on the account that was not getting push, open the app, and check Settings - notifications should register.",
  },
  {
    date: "2026-08-18",
    time: "19:55",
    title: "Asking someone for a detail now actually reaches them",
    impact: "fix",
    detail:
      "Requesting a phone number or email off the back of a follow-up recorded the request and told nobody. The person you asked got no notification and no push - they had to happen to open ehllo and happen to look. They are now notified and pushed. Alongside that, every bottom sheet puts its main action first and the way out underneath, and cells across follow-ups and history share one padding instead of three.",
    testing:
      "Request a detail from the other account and watch for the notification there.",
  },
  {
    date: "2026-08-18",
    time: "19:10",
    title: "Follow-ups the other person owes you now reach you",
    impact: "fix",
    detail:
      "When someone recorded a commitment to you during their own capture, you could read it in the shared history and do nothing with it - it never appeared in your Follow-ups. It does now, marked as theirs rather than yours, and it cannot be ticked off on their behalf. History was already syncing both ways; this was the half that was not. Also: the person field on Add follow-up no longer sits in a much roomier box than the rows beneath it, and \"When should you do this?\" uses the same light pill as everywhere else instead of a dark one.",
    testing:
      "Have the other account record a follow-up for you during their capture, then open your Follow-ups.",
  },
  {
    date: "2026-08-18",
    time: "18:25",
    title: "Add to Apple Wallet works again, and Google Calendar stops asking to reconnect",
    impact: "fix",
    detail:
      "Tapping Add to Apple Wallet opened a blank page instead of the Wallet sheet - the pass was answering with an error and no content at all. Separately, opening an event could claim your Google Calendar needed reconnecting when it was perfectly fine, which sent you looking for a Reconnect button that Connected accounts was right not to show. Both were ours, both from changes made earlier today, and both are fixed.",
    testing:
      "Add to Apple Wallet on a published card, and open an event. Neither should mention reconnecting.",
  },
  {
    date: "2026-08-18",
    time: "18:40",
    title: "Events from every calendar, and two silent data-loss traps removed",
    impact: "fix",
    detail:
      "ehllo only ever read your main calendar, so anything kept on a work or side calendar never appeared. It now reads all of them, while deliberately leaving out the Holidays, Birthdays and Week Numbers calendars Google subscribes you to without asking. Separately, older versions of two internal operations were still in place alongside the current ones; reaching one of them would have quietly dropped a visitor's phone number and the record of which event you met at, or skipped the check that stops one device overwriting another's card edits. They are gone.",
    testing:
      "An event on a second calendar should now show up. Holidays and birthdays should not.",
  },
  {
    date: "2026-08-18",
    time: "17:55",
    title: "All-day events now reach your events list",
    impact: "fix",
    detail:
      "If a conference or meetup was in your calendar as a whole day rather than a set time, it never arrived in ehllo. All-day entries were being discarded on purpose, on the reasoning that a full-day block is rarely a real gathering - which is backwards for exactly the events this app is for. They import now. Also on that screen: on a failed publish, Try again is the first button with Close beneath it, and the Pending sync buttons have a visible edge and sit clear of the bottom of the screen.",
    testing:
      "An all-day event in the next two weeks should now appear. Note it still reads only your primary calendar - events on a secondary calendar are a separate gap.",
  },
  {
    date: "2026-08-18",
    time: "17:30",
    title: "Publishing a card no longer dead-ends on \"reload the latest card\"",
    impact: "fix",
    detail:
      "Publishing could fail with \"This card changed on another device. Reload the latest card\" and leave you stuck, because no screen anywhere offers a way to reload one. The app and the server each held half of the fix and neither could use it: the server sent the information needed to catch up, and the app read only the error sentence and threw the rest away. Now the app catches up on its own and the save goes through, and the publish step sends that same information so it can recover too.",
    testing:
      "Edit a published card and publish again - including right after an account reset, which is what surfaced this.",
  },
  {
    date: "2026-08-18",
    time: "16:46",
    title: "The web app typechecks again, and it caught real breakage",
    impact: "fix",
    detail:
      "Type checking on the web app had been off long enough to hide 1,262 problems, so nothing it would have caught was being caught. It is on and clean now. Three of the things it found were live: your workspace list was reading a field the wrong shape and could have shown you nothing, uploading a card photo relied on a check that could never be true in some browsers, and the Sync to HubSpot button was asking for a size that does not exist. Separately, one import written without its file extension had stopped three test files from loading at all - the suite is back to 368 passing.",
    testing:
      "Switching workspaces, uploading a card photo, and generating meeting context from a transcript are the three worth a look.",
  },
  {
    date: "2026-08-18",
    time: "16:40",
    title: "Invitations are visible, answerable and revocable",
    impact: "new",
    detail:
      "Invited is now its own filter in Events and has a card on Home with a count, answerable in place. Inviting means picking someone you have met rather than retyping their address, the guest list shows two until you ask for more, and revoking an invitation now also withdraws it from the other person - including the notification, which used to linger and point at an invitation that no longer existed.",
    testing: "Invite an address belonging to another ehllo account, check their Home and Events, then revoke it and check both are gone.",
  },
  {
    date: "2026-08-18",
    time: "16:55",
    title: "You can open a meeting the other person recorded",
    impact: "new",
    detail:
      "A meeting in your history that someone else captured used to be a row that did nothing. It now opens with the summary they shared and the audio, and says when the audio expires. Their transcript and private notes never cross, and nothing appears at all until they have actually shared that meeting.",
    testing: "One account records a meeting and approves the guest view; the other opens it from the connection's history.",
  },
  {
    date: "2026-08-18",
    time: "17:40",
    title: "Sharing a card that is not published anymore pretends to work",
    impact: "fix",
    detail:
      "Tapping Share on a draft opened the share screen as though a QR code existed, when a QR cannot be generated until the card is published. Share and Card tools now explain that first and take you straight to finishing the card.",
    testing: "Create a card, leave it as a draft, and tap Share this card.",
  },
  {
    date: "2026-08-18",
    time: "17:45",
    title: "A stuck sync item can be discarded",
    impact: "fix",
    detail:
      "Pending sync offered Retry and nothing else, so a change queued against something that no longer exists retried forever and blocked everything behind it. You can now discard queued changes. Recordings waiting to transcribe are deliberately kept - they exist nowhere else yet.",
    testing: "Settings, Pending sync, Discard pending changes.",
  },
  {
    date: "2026-08-18",
    time: "17:50",
    title: "Selection looks the same everywhere",
    impact: "improvement",
    detail:
      "Selected pills in the card field editor, the capture and follow-up flows now use the same light fill as the Events filters instead of a dark one that made a chip inside a form read as the screen's main action. The card field sheet also puts the button label above the value, since you choose what the button says before what it points at.",
  },
  {
    date: "2026-08-18",
    time: "17:55",
    title: "Microsoft is marked coming soon",
    impact: "improvement",
    detail:
      "Connecting Microsoft only ever produced an error because it is not configured yet. It now says so before the tap rather than after.",
  },
  {
    date: "2026-08-18",
    time: "17:05",
    title: "Reminders for invitations you have not answered",
    impact: "new",
    detail:
      "An unanswered invitation now reminds you in the app and on your device the day before the event, not only by email. It respects your notification settings and stops once you answer.",
  },
  {
    date: "2026-08-18",
    time: "15:12",
    title: "Follow-ups can see how to reach someone",
    impact: "fix",
    detail:
      "A follow-up said you had no phone number for someone whose card publishes one, and the sheet fell back to \"Not now\" because it could not see an address either. Follow-ups only read details typed during a capture, never the person's own card. They now read both, merged, so a phone published on a card and an email typed in a capture both come through.",
    testing: "Open a follow-up for someone whose card lists a phone or LinkedIn. The request and mail-app options should appear.",
  },
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
    title: "Push notifications are not being delivered at all",
    time: "23:55",
    status: "open",
    detail:
      "Notifications appear in the bell inside the app, but nothing arrives on the lock screen. Everything on our side is working - the request is recorded, the notification is created for the right person, and a push is attempted the moment it happens.",
    resolution:
      "Apple is refusing them: \"Could not find APNs credentials\". The project has no Apple push key uploaded, so every push has failed regardless of anyone's settings. Needs a key generated against the Apple developer account; no code change will help until then.",
    reportedOn: "2026-08-18",
  },
  {
    title: "Wallet pass text was unreadable on light card colours",
    time: "22:10",
    status: "fixed",
    detail:
      "The Apple pass always drew its text in white. On a light card colour that is close to invisible - and ehllo's default colour is a light green, so the default card was the worst case. It only looked fine on darker colours.",
    resolution:
      "The pass now picks dark or light text from the card colour, using the same rule the rest of the app already used for exactly this. Worth noting how it was missed: every card I checked happened to be a dark colour.",
    reportedOn: "2026-08-18",
  },
  {
    title: "Android pass showed the brand where the name should be",
    time: "22:10",
    status: "fixed",
    detail:
      "On Google Wallet the biggest line on the card read \"ehllo Card\", with the person's own name shrunk into the small line above it. The profile photo was also being used as the logo as well as the banner, so the same picture appeared twice and the ehllo mark did not appear at all. Empty fields printed a single blank space, which rendered as labelled empty rows.",
    resolution:
      "All of it corrected in Google's own layout rather than by copying Apple's - an earlier attempt rearranged the Android card to match the iPhone one, which was the wrong instinct and was reverted.",
    reportedOn: "2026-08-18",
  },
  {
    title: "Only one account per device could receive push notifications",
    time: "20:40",
    status: "fixed",
    detail:
      "Notifications were turned on across iOS and Android, and the server held exactly one registered device. Any account that was not the first to register on a given device was silently refused - so it looked like the setting had not taken, on a device where it had.",
    resolution:
      "The phone gets one push token per app install regardless of who is signed in, and only one account was allowed to hold it. The release step that should have handed it over skipped anything on the same device. Confirmed against the real database before and after the fix, using a test that rolls itself back. The registration also now records why it failed, instead of failing silently - which is what made this cost a round of guessing in the first place.",
    reportedOn: "2026-08-18",
  },
  {
    title: "Nowhere to answer a contact request",
    time: "20:40",
    status: "open",
    detail:
      "You can ask someone for a phone number or email, and they are now notified. But there is still no screen listing requests you have received and no way to share or decline from inside ehllo - the notification tells you, and then the trail stops.",
    resolution:
      "Being straight that this is unfinished rather than filed as done: the request, the record and the notification all work; the reply does not exist yet. It needs a real screen, not a patch.",
    reportedOn: "2026-08-18",
  },
  {
    title: "A requested contact detail notified nobody",
    time: "19:55",
    status: "fixed",
    detail:
      "Pressing request after a follow-up appeared to work - it returned success - but the person being asked was never told. No in-app notification, no push. From the requester's side it was indistinguishable from a request that had been delivered and ignored.",
    resolution:
      "The route carried the comment \"push delivery will be wired when device tokens are available\" long after tokens and the push dispatcher existed and were being used by four other surfaces. Now notified and pushed, scoped to the address named on the request, and it says so in the logs when the address belongs to nobody with an ehllo account yet - so \"they never got it\" and \"they have no account\" stop looking the same.",
    reportedOn: "2026-08-18",
  },
  {
    title: "Follow-ups did not carry across between two connected accounts",
    time: "19:10",
    status: "fixed",
    detail:
      "History synced both ways between two people, but follow-ups did not. A commitment one person recorded for the other stayed with whoever recorded it, so the person it was actually addressed to never had it in their own list.",
    resolution:
      "Ours, and worth being plain about: the server has been returning these all along and the app was throwing them away one line before use. Nothing consumed the field. Now mapped into your Follow-ups, shown as owed by the other person, and blocked from being completed on their behalf at the single place every screen writes through.",
    reportedOn: "2026-08-18",
  },
  {
    title: "Add to Apple Wallet opened a blank page",
    time: "18:25",
    status: "fixed",
    detail:
      "The button opened a link rather than the Add to Wallet sheet, and the link was completely empty. Every Apple Wallet pass in the app and on the web was affected, not just one card.",
    resolution:
      "A comment had been placed between `return` and the response it was returning, which in JavaScript silently turns it into a bare return - so the pass was never sent and the page had nothing to show. Ours, introduced earlier today. The lint rule that catches exactly this was switched on afterwards and confirmed to catch it, so it cannot happen again quietly.",
    reportedOn: "2026-08-18",
  },
  {
    title: "\"Reconnect your Google Calendar\" on a healthy connection",
    time: "18:25",
    status: "fixed",
    detail:
      "Opening an event said Google Calendar needed reconnecting. The connection was fine - a live token, refreshing normally - and Connected accounts correctly showed Disconnect rather than Reconnect, so there was no Reconnect button to be found anywhere.",
    resolution:
      "This morning's change to read every calendar added a request that needs a permission ehllo had never asked for. It was refused, and the refusal was misread as a dead connection. Failing to list your calendars now quietly falls back to your main one, exactly as before, and can no longer cast doubt on the connection itself. The extra permission is now requested, so reconnecting once unlocks your other calendars.",
    reportedOn: "2026-08-18",
  },
  {
    title: "Events on a second calendar never appeared",
    time: "18:40",
    status: "fixed",
    detail:
      "Only your primary calendar was read. Anything on a separate work, personal or shared calendar was never fetched, so it could not appear no matter how the list was filtered. This was the gap left open when all-day events were fixed earlier today.",
    resolution:
      "All readable calendars are now included, with Google's auto-subscribed Holidays, Birthdays and Week Numbers calendars excluded so they cannot bury real events. Twelve calendars maximum per sync, primary first, so a heavily-subscribed account cannot be cut off from its own main calendar.",
    reportedOn: "2026-08-18",
  },
  {
    title: "An event in your calendar never appeared in ehllo",
    time: "17:55",
    status: "fixed",
    detail:
      "An event on the 28th was missing while one on the 29th showed up. The 29th was booked as a set time and the 28th as a whole day, and all-day entries were being dropped before they were ever saved - so this was never a filter on the list, the event simply was not there.",
    resolution:
      "All-day entries are imported. Still open and worth knowing: only your primary calendar is read, so anything on a second calendar will not appear yet.",
    reportedOn: "2026-08-18",
  },
  {
    title: "Could not publish a card: \"reload the latest card\" with nowhere to reload",
    time: "17:30",
    status: "fixed",
    detail:
      "After an account reset, publishing a card failed every time with a message telling you to reload the latest version first. There is no reload anywhere in the app, so there was no way forward - and each retry sent the same out-of-date information, so it could never clear on its own.",
    resolution:
      "Fixed on both sides. Worth being straight about this one: an earlier fix today was written for the publish step, but the failure happens one step earlier when the card is saved, so that fix never ran. The message was real, the instruction in it was impossible to follow, and the recovery existed on the server the whole time while the app discarded it.",
    reportedOn: "2026-08-18",
  },
  {
    title: "Three test files silently stopped running",
    time: "16:46",
    status: "fixed",
    detail:
      "A file added earlier today was imported without its file extension, which the rest of the codebase always writes out. Three test files could not load at all as a result - so they reported as failing rather than passing, and had they been skipped instead, nobody would have noticed the gap.",
    resolution:
      "Extension added; all 368 tests load and pass. Worth recording because it only surfaced when the suite was actually run, not from reading the change.",
    reportedOn: "2026-08-18",
  },
  {
    title: "Calendar option appeared to do nothing",
    time: "13:20",
    status: "fixed",
    detail:
      "Turning on \"add to my calendar\" when creating an event had no effect: the event was created but never reached the calendar.",
    resolution:
      "Two causes, and the second was hiding the first. The app had been updated ahead of the server - and the server could not be updated, because a scheduled job set to run every fifteen minutes is not allowed on our current hosting plan and its rejection failed every deployment. The schedule is now daily, pushes flush when you open Events so nothing waits for it, and the deployment is live.",
    reportedOn: "2026-08-18",
  },
  {
    title: "Sign-in codes landing in junk",
    time: "18:20",
    status: "in-progress",
    detail:
      "Sign-in code emails were going to the junk folder, reliably on iCloud addresses.",
    resolution:
      "Two causes. The sending service is not listed in our domain's SPF record while our DMARC policy is set to quarantine, so mail that fails the check is sent to junk by instruction - that needs a DNS change. The emails were also HTML-only and not a complete document, both long-standing spam signals; they now carry a plain-text alternative and proper structure.",
    reportedOn: "2026-08-18",
  },
  {
    title: "No web release went out for twelve hours",
    time: "14:45",
    status: "fixed",
    detail:
      "Every web change made during the day sat undeployed. A scheduled job had been set to run every fifteen minutes, which our hosting plan does not allow, and that single rejection failed the entire deployment rather than just the job - so nothing shipped, and a fix that had already been written looked like it had not worked.",
    resolution:
      "The schedule is daily now, which the plan allows, and the work it does also happens when you open Events so nothing waits a day for it. Deployment restored and everything from today is live.",
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

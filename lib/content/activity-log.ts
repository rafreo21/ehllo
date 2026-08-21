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

export const ACTIVITY_UPDATED = "20 August 2026";

/** Times are local (BST). */
export const ACTIVITY_TZ_OFFSET = "+01:00";

export const ACTIVITY_ENTRIES: ActivityEntry[] = [
  {
    date: "2026-08-21",
    time: "12:40",
    title: "The opening screen is the mark, not a tile on a dark background",
    impact: "improvement",
    detail:
      "The screen you see while the app opens showed the app icon - green rounded square and all - centred on a dark green background, so it read as a small tile floating in the middle rather than as the ehllo mark. The green is the whole screen now, with the two figures sitting directly on it. This one arrives with the next full app update from the store rather than an over-the-air one, because the opening screen is built into the app itself.",
  },
  {
    date: "2026-08-21",
    time: "12:10",
    title: "The sharing switch tells you why it will not turn on",
    impact: "fix",
    detail:
      "Turning sharing on could flip straight back off with no useful explanation, which reads as a broken switch. It was never broken: a meeting cannot be shared until it has a short recap, because that recap is the only thing guests see, and the recording has to reach us first so there is something for them to play. Now it says which of those is missing, in words you cannot miss, and for a missing recap it takes you to the field rather than pointing at it. Every bottom sheet also has a close icon in the top corner with its title on the line below, so a long title no longer squeezes against the word Close.",
    testing:
      "Open a meeting with no recap and try to turn on sharing.",
  },
  {
    date: "2026-08-21",
    time: "11:30",
    title: "Notifications now open the thing they are about",
    impact: "fix",
    detail:
      "Tapping a notification rarely landed where it said it would. On the web, every notification about a meeting pointed at a page that does not exist, so all of them led nowhere - quietly, for every type. On the phone, a meeting shared with you opened the people list and left you to find it, and several others opened the recorder's own review screen, which nobody but the recorder can load, so being told about a meeting ended in \"encounter not found\". Each one now opens what it is about, and the review screen recognises when you are not the person who recorded it and shows you the shared recap instead. Contact requests also match the rest of the app now: the person's photo, their name, one line underneath, and the same rounded cell used everywhere else, with history behind an icon rather than a word that stacked against the title.",
    testing:
      "Open the bell and tap each notification in turn, on the phone and on the web.",
  },
  {
    date: "2026-08-20",
    time: "21:40",
    title: "Opening one meeting no longer shows you the last one",
    impact: "fix",
    detail:
      "Opening a meeting left the previous one on screen. Everything else was cleared between them and the title and recap were not, so a meeting you had never opened came up wearing another meeting's name - and if the new one could not be opened, you were left looking at the old one entirely. That is fixed, and the sheet for asking a host to share now says what it is for instead of borrowing a title it cannot show. Request access sits beside Done rather than a scroll away from it, the sharing switch moves the moment you tap it instead of waiting on the round trip, and on a reviewed meeting Save changes is the main button with Done beside it - they were the wrong way round, so the button that changed nothing looked like the one to press.",
    testing:
      "Open two different meetings from someone's history one after the other.",
  },
  {
    date: "2026-08-20",
    time: "21:15",
    title: "Asking for a meeting works, and an empty scans page looks intentional",
    impact: "fix",
    detail:
      "Requesting access to a meeting failed every time with \"we couldn't send that request\" - our own mistake, looking up the wrong column when working out who to ask. It works now, and the person who asked is named properly when the request arrives. Recent scans also had artwork when you were signed out and a plain block of text when you were signed in, which is the version anyone actually sees - it now uses the same illustration either way, so an empty page reads as empty rather than as something that failed to load.",
    testing:
      "Open a meeting somebody has not shared and ask for it. Then open Settings › Recent scans with nothing waiting.",
  },
  {
    date: "2026-08-20",
    time: "19:45",
    title: "Opening a meeting shared with you was crashing, and blaming you for it",
    impact: "fix",
    detail:
      "A meeting genuinely shared with you would not open, and said \"this meeting is not available\" - so it read as the host not having shared it, when in fact the page was failing on our side every single time. The guest view withholds the other attendees' email addresses on purpose, and the code that lists who owes what assumed they would be there, so it fell over on any shared meeting that had somebody in it and a follow-up attached - which is every meeting worth sharing. It works now, and a genuine fault says something went wrong rather than quietly pretending you were not allowed in.",
    testing:
      "Open a meeting somebody has shared with you from their history.",
  },
  {
    date: "2026-08-20",
    time: "19:20",
    title: "Everyone in a meeting is told when it is shared",
    impact: "fix",
    detail:
      "Meetings can have any number of people in them, and sharing only told whoever had asked to see it. So three people in a room, one asks, and the other two quietly gain access nobody mentions - which from where they are standing is the same as not being shared with at all. Everyone who can now read it is told: the people who asked hear that they were answered, and the rest simply hear that it exists. Asking does not earn you two notifications.",
    testing:
      "Record a meeting with two or more people, share it, and check both of their accounts.",
  },
  {
    date: "2026-08-20",
    time: "18:50",
    title: "You can ask for a meeting instead of hitting a wall",
    impact: "new",
    detail:
      "Opening a meeting the host had not shared said \"this meeting is not available\" and stopped there. It was true and it was useless: you can see in your shared history that the meeting happened, because you were there, and the only way forward was to message the person outside ehllo. It now says the host has not shared it yet and gives you a Request access button. They get a notification, tapping it takes them straight to the meeting where the sharing switch already is, and the moment they share it you are told. Nobody is left guessing whether they were refused or simply not seen.",
    testing:
      "From a second account, open a meeting in someone's history that they have not shared, and ask for it.",
  },
  {
    date: "2026-08-20",
    time: "18:20",
    title: "Sign-in codes arrive in your inbox, not your junk folder",
    impact: "fix",
    detail:
      "Sign-in codes were reliably junked on iCloud addresses. The explanation we had was wrong twice over: our own DNS was correct all along, and the codes are not sent by us at all - they came from our sign-in provider's shared mail server, on a domain that has nothing to do with ehllo, which is exactly what a strict filter distrusts. They now go out through our own sending service as product@ehllo.io, so they inherit the signing our other mail already has. Confirmed landing in the inbox.",
  },
  {
    date: "2026-08-20",
    time: "16:10",
    title: "Sharing a meeting now reaches people who already use ehllo",
    impact: "fix",
    detail:
      "Share a meeting with someone who already has an account and it never arrived. They saw \"this meeting is not available\", which was true and completely misleading: a shared meeting is attached to its guest by their email address, and the step that ties that to a real account only ever ran when somebody signed up for the first time from a share link. So sharing worked between a user and a stranger, and silently failed between two people who both already use ehllo - the only case that matters once more than one person is testing. It is now attached on sign-in and when you open the meeting, so anything shared with you before today appears without you doing anything.",
    testing:
      "Share a meeting from one account and open it from the other.",
  },
  {
    date: "2026-08-20",
    time: "16:00",
    title: "\"This meeting changed on another device\" when nothing had",
    impact: "fix",
    detail:
      "Approving a meeting for sharing could fail, claiming it had been edited somewhere else, when nothing of the kind had happened. Writing the transcript, the summary and the title all happen on our side minutes after you stop recording, and each one counts as a change - so the copy on your phone went out of date on its own, and the next thing you did was refused and blamed on a device that did not exist. This hit exactly the meetings you would most want to share, the ones with a real recording behind them. Your change is now carried onto the up-to-date version and saved, rather than thrown away with an explanation that was not true.",
    testing:
      "Record a meeting, wait for the transcript, then share it.",
  },
  {
    date: "2026-08-20",
    time: "15:50",
    title: "Starting a capture from someone's page keeps that person",
    impact: "fix",
    detail:
      "Tapping Capture on somebody's page could quietly pick up an unrelated half-finished recording instead of starting a new one - and because the person is only filled in when that recovered draft has nobody in it, the person you had just chosen was dropped. That is how a recording started from someone's own page refused to save with \"add at least one person you met\", and how two entries appeared in your captures afterwards. The person you tapped from now wins, and the older draft is left alone in your captures to pick up deliberately rather than being taken over.",
    testing:
      "Start a capture from a person's page while another capture is already in progress.",
  },
  {
    date: "2026-08-20",
    time: "15:40",
    title: "A meeting with no transcript is no longer a dead end",
    impact: "improvement",
    detail:
      "If a recording came out with no transcript, the meeting simply said so and offered nothing - which is the worst moment to offer nothing, because the recording is the one part that cannot be made again. If the audio is still on your device there is now a Transcribe again button, and it says plainly when the recording has gone rather than leaving you to guess. Meeting and follow-up rows in someone's history are also back to two lines each, so they stop being different heights.",
    testing:
      "Open a meeting whose transcript is empty while its recording is still on the device.",
  },
  {
    date: "2026-08-20",
    time: "15:20",
    title: "Reminders can arrive at your time, not just after it",
    impact: "improvement",
    detail:
      "The summary we send from the server can only be woken once a day on our current hosting, so honouring three different chosen times was never something it could do alone. The app now asks for it when you open ehllo, so it lands at the time you picked rather than whenever the daily sweep happens to run - and the sweep stays as the backstop for anyone who has not opened the app. Both go through the same rule, so they cannot disagree about whether you have already been reminded today.",
    testing:
      "Pick a reminder time, then open the app after it has passed.",
  },
  {
    date: "2026-08-20",
    time: "15:05",
    title: "Every email we send now carries a plain-text version",
    impact: "fix",
    detail:
      "Our emails were being sent as HTML and nothing else. A message with no plain-text alternative is a long-standing signal to spam filters, and with our domain policy set to quarantine there is no room to spend on avoidable ones. This log claimed on the 18th that it had been fixed; it had not, which is worse than not fixing it, because it stopped anyone looking. Every email now carries both, with links written out so they still work when the text version is what you are reading.",
  },
  {
    date: "2026-08-20",
    time: "14:30",
    title: "Reminders arrive at the times you picked",
    impact: "fix",
    detail:
      "The times you choose were honoured by the reminders your phone sets for itself and ignored by the one daily summary we send from the server, which went out at the same hour to everybody - so you could be reminded at an hour you had specifically not picked. Your chosen times are now on your account, and the summary is judged against your own clock and your own day rather than the server's. It will not arrive before the earliest time you chose, and it will not arrive twice in one day.",
    testing:
      "Settings › Notifications, pick a single reminder time, and check nothing arrives before it.",
  },
  {
    date: "2026-08-20",
    time: "14:10",
    title: "You can see what you have already answered",
    impact: "new",
    detail:
      "Answering a contact request made it disappear, which left no way to check what you had sent somebody, or to tell \"I declined that\" from \"I never saw it\". There is a History button on Contact requests now: who asked, what for, whether you shared or declined, what you sent, and when. Nothing new is being recorded to do this - it was all being written already and simply never read back.",
    testing:
      "Settings › Contact requests, then History, top right.",
  },
  {
    date: "2026-08-20",
    time: "13:40",
    title: "Answering a contact request now actually works",
    impact: "fix",
    detail:
      "It never has. Sharing or declining a detail somebody asked for failed every single time with \"we couldn't answer this request\" - on the phone and on the web, from the day the screen shipped. The code recorded the answer using a word the database does not accept, so every attempt was rejected outright, and because nothing ever succeeded there was nothing to notice except the error. This log said it was working. It was not, and that is on us. Tapping the notification on the web also led to the follow-ups screen, which has no trace of the request you were just told about; it now opens the request itself, with the sheet already up when only one person is waiting. Your own details are filled in from your card, so a handle ehllo already knows needs no typing.",
    testing:
      "Have someone ask you for a detail, tap the notification, and share it.",
  },
  {
    date: "2026-08-20",
    time: "13:05",
    title: "Keeping someone from their card no longer costs you your email",
    impact: "fix",
    detail:
      "Open somebody's card in a browser and you could look at it, save it to your phone, and never be offered a way to keep them in ehllo - unless you first filled in the form and sent them your email. The sign-in option only appeared after that, so the one path on the web that actually adds a person to your list was behind handing over your details. There is now a Continue with Google option on the same screen as the form: send your details, or just keep them, your choice.",
    testing:
      "Open a card in a browser, tap save, and look under the share form on the next screen.",
  },
  {
    date: "2026-08-20",
    time: "12:45",
    title: "We can finally tell where a connection came from",
    impact: "fix",
    detail:
      "We started recording which surface a connection came through - camera, card link, NFC tap, web - and then recorded almost nothing. Following someone's card to the website and signing up, which is the most valuable way anyone arrives, was never attributed at all: that path connects you by a different route that simply never wrote it down. And once a connection existed with no surface against it, there was no way to ever fill it in, because the only code that could write was skipped for people you already knew. So the column read as \"nobody scans from anywhere\" when the truth was \"we never wrote it down\". All three paths now record it through one shared piece of code, a blank can be filled by a later scan, and a surface once recorded is never overwritten - so it keeps answering where you met rather than where you last scanned. An NFC tag tapped by someone without the app now says NFC instead of disappearing into web.",
    testing:
      "Scan a card belonging to someone you are not yet connected to, from any surface. Scanning someone you already know fills in a blank if there is one and otherwise leaves it alone.",
  },
  {
    date: "2026-08-20",
    time: "12:10",
    title: "Answer someone once, not once per time they asked",
    impact: "improvement",
    detail:
      "Contact requests were listed one row per ask, so somebody who asks for your Instagram after every meeting filled the screen with fifteen identical rows - and you had to type the same handle fifteen times to clear them. Now it is one row per person: their name, what they asked for, and how many times. Answer it once and every one of their asks is closed, and they are told once rather than fifteen times. The list also stops at twenty people instead of twenty rows, so one persistent asker can no longer hide everybody else, and it says how many are still waiting behind it.",
    testing:
      "Settings › Contact requests, on the phone or the web. Ask for the same detail from a second account a few times, then answer it once - all of them should disappear together.",
  },
  {
    date: "2026-08-20",
    time: "10:15",
    title: "You can answer a contact request on the web now",
    impact: "new",
    detail:
      "If someone asked for your number or your email, you could only answer it on your phone. On a laptop you were told somebody had asked and given nowhere to reply - so the request sat there and the person who asked was left waiting with no idea why. Settings › Contact requests now does it on the web, in the same words as the phone: share the one detail, or decline, and either way they are told.",
    testing:
      "Have someone request a detail from you, then open Settings › Contact requests in the web app.",
  },
  {
    date: "2026-08-20",
    time: "09:50",
    title: "Your calendar shows all your events, not a chosen few",
    impact: "fix",
    detail:
      "Events were being withheld. Anything that repeats was dropped outright, and so was anything shorter than 45 minutes - so a weekly meetup never appeared, nor did a half-hour coffee, and nothing anywhere said why. You could look at a calendar you knew had things in it and see an empty week. Both rules are gone: every event on every calendar you have not hidden in Google now comes through. Titles are still never inspected, so nothing is judged on what it happens to be called.",
    testing:
      "Settings › Connected accounts, sync your calendar again, then check Upcoming for a recurring event and a short one.",
  },
  {
    date: "2026-08-20",
    time: "05:20",
    title: "A scan tells you what it did, wherever you scanned from",
    impact: "improvement",
    detail:
      "Scanning with the camera has always shown you a result. Every other way of arriving at someone - a wallet pass, an NFC tap, a widget, a link, the web scanner - dropped you onto their profile in silence, so there was no way to tell \"I have just added this person\" from \"I already knew them\", and adding someone in silence reads as nothing having worked. All of them now say which it was, in the same words, on iPhone, Android and the web app. We also record which surface a connection came through, so it is finally possible to answer which of these people actually use.",
    testing:
      "Scan the same card twice from Apple Wallet. The first should say added, the second should say you already know them.",
  },
  {
    date: "2026-08-20",
    time: "04:45",
    title: "Adding someone from a wallet pass works at all now",
    impact: "fix",
    detail:
      "Scanning a card from Apple or Google Wallet could not add the person - on the phone or on the web. The address in a wallet QR is deliberately a few characters shorter than the one everywhere else, so the code stays small enough to scan across a table, and the part of the server that records a new connection was looking for the longer spelling only. It answered \"card not found\" and stopped there. On the web scanner it went further and said the card was not published, which was never true. Both now accept either spelling, so a card scanned from a wallet pass behaves exactly like one scanned from the app: someone you already know opens their profile, and someone new is added.",
    testing:
      "Scan a card from Apple or Google Wallet on the phone, and again through Scan in the web app. Both should reach the person.",
  },
  {
    date: "2026-08-20",
    time: "04:10",
    title: "Scanning a wallet pass opens the person, not a second copy of them",
    impact: "fix",
    detail:
      "Scanning someone's card from Apple or Google Wallet added them again, even if they were already in your people list - so you ended up with the same person twice and never landed on their profile. Scanning the same card from the app, a widget or an NFC tag worked properly. The difference was invisible: a wallet QR carries a slightly shorter version of the card's address, to keep the code small enough to scan easily, and the check for \"do I already know this person\" was comparing the two spellings letter by letter. Every route now reads them as the same card, so an existing connection opens their profile and only a genuinely new person is added.",
    testing:
      "Scan your own card from Apple Wallet, then from the app. Both should open the same single connection rather than creating another.",
  },
  {
    date: "2026-08-20",
    time: "03:30",
    title: "Android notifications work",
    impact: "fix",
    detail:
      "Android has never been able to receive a notification, and the reason was one file that never left a laptop. Android push runs through Firebase, Firebase needs a configuration file compiled into the app, and that file was never committed - so every Android build was assembled without it and no Android phone could even be issued a push token. Not one ever had been, while iPhones registered normally. The file is in the build now, and the build is on internal testing: update from Play and notifications arrive. Anyone still on the previous build gets nothing until they update, because this part of the app cannot be changed over the air.",
    testing:
      "Update ehllo from Play internal testing, sign in, turn Device notifications on in Settings › Notifications, then have someone record a follow-up about you.",
  },
  {
    date: "2026-08-20",
    time: "03:10",
    title: "Scanning someone's card opens the app instead of asking you twice",
    impact: "fix",
    detail:
      "Scanning a card QR on Android put up a chooser - open in the app, or open in the browser - and picking the app showed an error page instead of the person. Two separate faults. The app claimed those links but had nothing to answer them with, so it landed nowhere; and the file that proves to Android the app owns the link listed the wrong signing certificate, so Android never trusted the claim and asked instead of just opening. A verified link never asks. Both are fixed, so a scanned card now opens straight into the app and lands on the person.",
    testing:
      "Scan a card QR from Apple Wallet, Google Wallet, or the app's own code. It should go straight to the app with no chooser.",
  },
  {
    date: "2026-08-20",
    time: "02:40",
    title: "Meeting transcripts and summaries moved to Gemini",
    impact: "improvement",
    detail:
      "Capture now transcribes and summarises through Gemini rather than the previous provider. In testing it returned the transcript verbatim and pulled the company, the role and two follow-ups with the right owners out of a short conversation - including one that belonged to the other person in the room rather than the speaker. Transcription takes a little longer than before; the summary is meaningfully better. Speaker labels are preserved.",
    testing:
      "Record a short capture with two people talking and check the transcript keeps them apart, and that the follow-ups it suggests have the right owner.",
  },
  {
    date: "2026-08-20",
    time: "02:20",
    title: "Your Apple Wallet pass updates itself, and stops multiplying",
    impact: "new",
    detail:
      "Adding your card to Apple Wallet twice used to leave two passes, because each download counted as a different pass. It is one pass now, and re-adding replaces it. More usefully, a pass can keep itself current: change your name, role or company and every person holding your pass has theirs updated, without anyone re-adding anything. Passes handed out before today cannot do this - they were issued without the machinery - so remove and re-add yours once to move onto the new kind. The pass itself was rebuilt too: your name at one consistent size whoever you are, the brand mark and wordmark together, and everything sharp on modern screens.",
    testing:
      "Remove your ehllo pass from Wallet, add it again from the app, then edit your role and publish. The pass in Wallet should follow.",
  },
  {
    date: "2026-08-20",
    time: "02:00",
    title: "Wallet button no longer claims a pass you never added",
    impact: "fix",
    detail:
      "Tapping Add to Apple Wallet and then backing out of Apple's sheet still recorded the pass as saved. The button changed to View in Apple Wallet permanently, so there was no way back to an Add button and nothing in Wallet to view - which is exactly the state some of you were stuck in. It asks now, the same way the Google Wallet button always has, and only remembers the pass once you say it saved.",
    testing:
      "Tap Add to Apple Wallet, cancel Apple's sheet, and check the button still says Add.",
  },
  {
    date: "2026-08-20",
    time: "01:40",
    title: "Sharing by tap keeps the event you are at",
    impact: "fix",
    detail:
      "When an event is running, your card link carries the event so the connection is filed against it. Tap to share was dropping that. It read the link once, before the app had finished working out which event you were at, and then kept the plain version for the rest of the session - so a tap at an event connected you to the person but lost where you met. Nothing said so, which is the worst way to lose it.",
    testing:
      "At a live event, share by tap and check the connection shows the event.",
  },
  {
    date: "2026-08-20",
    time: "01:20",
    title: "Settings reports which build you are really on",
    impact: "fix",
    detail:
      "The version on the settings screen was written by hand and had stopped matching reality - it read build 5 while phones were running 6, which sent us chasing a Play update that had in fact worked. It no longer prints a number nobody maintains. What it shows now is established when you open it: your version, your channel, and the exact bundle your phone is running, which is the part that actually differs between two devices. Error reports carry the same identity, so a crash can be traced to one bundle.",
    testing:
      "Settings, bottom of the screen. Two phones that have both refreshed should show identical values.",
  },
  {
    date: "2026-08-19",
    time: "10:20",
    title: "Reminder times are respected, and you can pick more than one",
    impact: "fix",
    detail:
      "Picking a reminder time did not mean much. If the time you chose had already passed that day, the reminder fired five seconds after you next opened the app instead - so choosing 09:00 and opening ehllo in the evening pinged you immediately, which is the opposite of what a chosen time is for. That is gone: a slot that has already passed is simply skipped, and the overdue reminder still covers anything left undone. The setting is also no longer one-of-three. Tap as many times as you want and a follow-up due that day pings at each of them; whatever single time you had picked before is carried over as your starting selection.",
    testing:
      "Settings › Notifications › Reminder times, tap two or three times, then check a follow-up due today only pings at the times still ahead of you.",
  },
  {
    date: "2026-08-19",
    time: "01:10",
    title: "Completing a follow-up now tells the other person",
    impact: "new",
    detail:
      "A follow-up is an agreement between two people, and ticking one off used to be silent on both sides - the person waiting had no way to know except by opening the app and noticing. Both parties are told now, in the app and in the bell, and it has its own switch in notification settings so you can keep it without keeping everything else. Alongside that: if someone recorded a follow-up about you, you can now mark it done yourself. Until now only the person who wrote it could, which left the wrong person holding the only switch.",
    testing:
      "Have one account complete a shared follow-up and watch the other account's bell.",
  },
  {
    date: "2026-08-19",
    time: "01:10",
    title: "The web app stops handing back a previous account's data",
    impact: "fix",
    detail:
      "The web app keeps your cards, contacts and meetings in the browser so screens load instantly. None of it was tied to an account, so it survived signing out, signing in as someone else, and even a full server-side reset - the browser simply handed the old data back, which is why cleared data appeared to come back on the web. It is now cleared automatically when a different account signs in.",
    testing:
      "Sign out on the web, sign in as a different account, and check the card and contacts are not the previous account's.",
  },
  {
    date: "2026-08-19",
    time: "00:20",
    title: "“We don’t have their email” — when we did",
    impact: "fix",
    detail:
      "Asking someone for a contact detail from the Follow-ups page could report that we had no email for them and offer nothing but Not now, even for people you had connected with, whose card publishes their address, and who signed up with it. The follow-up only checked the meeting record and your contacts, and never looked at the connection itself - which is exactly where the address was. It now does, so the request and mail options appear, and any other details their card publishes come through with it.",
    testing:
      "Open a follow-up for someone you scanned, ask for a contact method, and check the sheet offers Request via ehllo and the mail option.",
  },
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
    title: "Some Apple Wallet passes showed boxes instead of a name",
    time: "02:35",
    status: "fixed",
    detail:
      "For a short window today, a pass built with the new design printed a row of empty squares where the name should be. Anyone who added or refreshed a pass in that window saw it.",
    resolution:
      "Ours, and worth naming. Drawing the name onto the pass needed a typeface, the server that builds passes has none installed, and it drew placeholder squares rather than failing - so the safeguard meant to catch this never fired, because nothing had gone wrong as far as the machine was concerned. It looked correct everywhere we checked, because the machines we checked on have fonts. Reverted within the hour, then rebuilt to carry the lettering as shapes instead of asking for a typeface. Remove and re-add the pass to clear it.",
    reportedOn: "2026-08-20",
  },
  {
    title: "The daily reminder digest ignores your chosen reminder times",
    time: "10:20",
    status: "fixed",
    detail:
      "The reminder times you pick were honoured by the reminders the app schedules on your phone. The one daily summary we send from the server was not covered by them - it went out at the same hour for everybody, so you could see a reminder at an hour you did not choose.",
    resolution:
      "One of the two things this was blocked on turned out to be there already: every account has had a time zone stored all along. Your chosen times now live on the account too, and the summary is judged against your own clock and your own day rather than the server's midnight - which was quietly wrong for anyone not living in UTC. The server can only wake once a day on our current plan, so it stays the safety net and the app handles the exact hour; a summary more than a day and a half late is sent regardless, because a reminder at the wrong hour still beats none at all.",
    reportedOn: "2026-08-19",
  },
  {
    title: "Android gets no notifications, iOS does",
    time: "03:30",
    status: "fixed",
    detail:
      "Notifications arrive on iPhone and never on Android, even with every preference switched on. It is not the preferences and not the app: the notification channel and the permission request are both in place, and the same code registers on both platforms.",
    resolution:
      "Fixed. The Firebase configuration existed but had never been committed, so every build was assembled without it and no Android phone could be issued a push token - which is why the table of registered devices had never held a single Android row. It is in the build now, that build is on internal testing, and an Android phone has registered and received a notification. Anyone still on the previous build gets nothing until they update: this part of the app is compiled in and cannot be sent over the air.",
    reportedOn: "2026-08-19",
  },
  {
    title: "Push notifications are not being delivered at all",
    time: "23:55",
    status: "fixed",
    detail:
      "Notifications appeared in the bell inside the app, but nothing arrived on the lock screen. Everything on our side was working - the request recorded, the notification created for the right person, and a push attempted the moment it happened.",
    resolution:
      "Fixed, and worth saying plainly that I misdiagnosed it twice. Apple reported \"Could not find APNs credentials\" and I twice concluded no push key existed. One did, and had for days - I had been reading the credentials for the wrong build target. The real cause was that the installed app was built under a different identity to the one the push key belongs to, so Apple had no credentials for the app actually asking. Rebuilding it under the right identity fixed it.",
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
    status: "fixed",
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
    status: "fixed",
    detail:
      "Sign-in code emails were going to the junk folder, reliably on iCloud addresses.",
    resolution:
      "The earlier explanation here was wrong on both counts, and worth correcting rather than quietly replacing. Our DNS is set up properly: the signing key is published, the sending subdomain has its own records, and our policy checks alignment loosely, so mail we send passes. But sign-in codes are not sent by us - they come from our sign-in provider's own shared mail server, on a domain that is nothing to do with ehllo, which is exactly the kind of message a strict filter distrusts. Pointing sign-in codes at our own sending service is the fix, and it is a configuration change rather than a code one. The second claim - that our emails now carry a plain-text alternative - was simply not true; they were still being sent as HTML only. That part is now genuinely done, for every email we send.",
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
    status: "fixed",
    detail:
      "Several fixes only fail when two different people are involved, which is exactly the case a single test account cannot reproduce. Scanning between two real accounts, and asking somebody for a contact detail, were only ever checked by hand with two phones.",
    resolution:
      "A check that needs two phones does not get run, which is why this stayed open - and why answering a contact request was broken for two days without anyone noticing. Our automated staging run now creates two real accounts and does it properly: one scans the other's card, both sides are confirmed to see each other, the surface it came from is confirmed stored and confirmed not overwritten by a later scan, and one account asks the other for a detail three times, has it answered once, and is checked to have all three cleared. Sharing and declining are both checked, including that a decline never carries the value.",
    reportedOn: "2026-08-18",
  },
];

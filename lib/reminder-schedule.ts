/**
 * When the daily reminder digest should actually go out.
 *
 * The reminder times you pick were honoured by the notifications the phone schedules for
 * itself and ignored by the one digest the server sends, which went out at a fixed hour
 * to everybody - so you could be reminded at an hour you had explicitly not chosen.
 *
 * Two things were said to be missing. One of them was not: users.time_zone exists and is
 * populated for every active account. The real obstacle is the hosting plan, which allows
 * a cron job to run once a day - so a server that fires once cannot deliver at three
 * different local times, and no amount of stored preference changes that.
 *
 * So the cron is the safety net, not the mechanism, the same shape already used for
 * pushing calendar events: the device knows the local clock and the chosen times, and
 * asks; the daily run catches whoever never opened the app. What this module does is make
 * both of them agree on one question - is the digest due for this person right now - so
 * the answer cannot drift between the two callers.
 */
export const REMINDER_TIME_OPTIONS = ["09:00", "12:00", "17:00"] as const;

export type ReminderTime = (typeof REMINDER_TIME_OPTIONS)[number];

/**
 * What somebody who has never touched the setting gets. Matches the phone's default, so
 * the two surfaces do not disagree before you have chosen anything, and keeps the digest
 * arriving for accounts that predate the setting rather than silently stopping it.
 */
export const DEFAULT_REMINDER_TIMES: ReminderTime[] = ["09:00"];

/** Chosen times, in order, keeping only ones we actually offer. */
export function normalizeReminderTimes(raw: unknown): ReminderTime[] {
  const values = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if ((REMINDER_TIME_OPTIONS as readonly string[]).includes(trimmed)) seen.add(trimmed);
  }
  // Sorted by the offered order rather than the order they arrived, so "17:00,09:00" and
  // "09:00,17:00" are the same preference and the earliest is always first.
  return REMINDER_TIME_OPTIONS.filter((option) => seen.has(option));
}

/** The chosen times, or the default when nothing has been chosen. Never empty. */
export function effectiveReminderTimes(raw: unknown): ReminderTime[] {
  const chosen = normalizeReminderTimes(raw);
  return chosen.length ? chosen : DEFAULT_REMINDER_TIMES;
}

/**
 * A date's calendar day in a given zone, as YYYY-MM-DD.
 *
 * The digest's "has it gone out today" check used the server's own midnight, which on
 * Vercel is UTC - so for anyone east or west of it, "today" was somebody else's day and
 * the once-a-day guarantee slipped by an hour or thirteen. en-CA because it formats as
 * YYYY-MM-DD, and Intl handles daylight saving without a table to maintain.
 */
export function localDayKey(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    // An unrecognised zone must not stop a reminder. UTC is wrong for somebody, but
    // silence is wrong for everybody.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  }
}

/** Minutes since local midnight in a given zone. */
export function localMinutes(at: Date, timeZone: string): number {
  const format = (zone: string) => new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);

  let text: string;
  try {
    text = format(timeZone);
  } catch {
    text = format("UTC");
  }
  const [hours, minutes] = text.split(":").map((part) => Number.parseInt(part, 10));
  // 24:00 is a legal rendering of midnight in some locales, and would otherwise read as
  // a whole extra day having passed.
  return ((Number.isFinite(hours) ? hours : 0) % 24) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map((part) => Number.parseInt(part, 10));
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

/**
 * How long the digest may be overdue before it is sent at whatever hour we happen to be
 * running, rather than waiting for a chosen time we may never be awake for.
 *
 * This exists because of the once-a-day cron. Somebody whose only chosen time is 17:00
 * local, on a cron that runs at 15:00 their time, would never qualify - a preference
 * honoured so faithfully that it silences the reminder entirely. Past this, a reminder at
 * the wrong hour is better than no reminder, and it is only ever reached by someone who
 * has not opened the app in over a day.
 */
export const OVERDUE_GRACE_HOURS = 36;

export type DigestDueInput = {
  now: Date;
  /** IANA zone from the account. Falls back to UTC when missing or unrecognised. */
  timeZone: string | null | undefined;
  /** Whatever is stored for this account; validated here. */
  reminderTimes: unknown;
  lastSentAt: string | Date | null | undefined;
};

export type DigestDueResult = {
  due: boolean;
  /** Why, in a word - for logging, so a skipped digest can be explained rather than guessed at. */
  reason: "never-sent" | "time-reached" | "overdue" | "already-today" | "before-first-time";
};

/**
 * Whether this account's digest is due at `now`.
 *
 * Once per local day, and not before the earliest time they chose. Both callers - the
 * daily cron and the device asking on open - go through here, so the phone cannot decide
 * one thing while the server decides another.
 */
export function reminderDigestDue(input: DigestDueInput): DigestDueResult {
  const timeZone = input.timeZone?.trim() || "UTC";
  const times = effectiveReminderTimes(input.reminderTimes);
  const earliest = timeToMinutes(times[0]);
  const nowMinutes = localMinutes(input.now, timeZone);

  const lastSent = input.lastSentAt
    ? new Date(input.lastSentAt instanceof Date ? input.lastSentAt.getTime() : input.lastSentAt)
    : null;
  const lastSentValid = lastSent && Number.isFinite(lastSent.getTime()) ? lastSent : null;

  if (!lastSentValid) {
    // Never sent, so the only question is whether their day has reached a chosen time.
    return nowMinutes >= earliest
      ? { due: true, reason: "never-sent" }
      : { due: false, reason: "before-first-time" };
  }

  // Their day, not the server's. This is what stopped the once-a-day promise from holding
  // for anyone not living in UTC.
  if (localDayKey(lastSentValid, timeZone) === localDayKey(input.now, timeZone)) {
    return { due: false, reason: "already-today" };
  }

  const hoursSince = (input.now.getTime() - lastSentValid.getTime()) / 3_600_000;
  if (hoursSince >= OVERDUE_GRACE_HOURS) return { due: true, reason: "overdue" };

  return nowMinutes >= earliest
    ? { due: true, reason: "time-reached" }
    : { due: false, reason: "before-first-time" };
}

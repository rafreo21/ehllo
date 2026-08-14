export type EventDateForm = {
  start: Date;
  end: Date | null;
};

export type ExtractedEventDates = {
  startsAt: string | null;
  endsAt: string | null;
};

export function applyEventDateChange(
  form: EventDateForm,
  field: 'start' | 'end',
  date: Date,
): EventDateForm {
  if (field === 'end') return { ...form, end: date };

  const previousDuration = form.end ? form.end.getTime() - form.start.getTime() : null;
  return {
    start: date,
    end: previousDuration !== null && previousDuration > 0
      ? new Date(date.getTime() + previousDuration)
      : form.end,
  };
}

export function resolveExtractedEventDates(
  extracted: ExtractedEventDates,
  fallbackStart: Date,
  now = new Date(),
): EventDateForm & { needsReview: boolean; notice: string } {
  const parsedStart = extracted.startsAt ? new Date(extracted.startsAt) : null;
  const validStart = parsedStart && !Number.isNaN(parsedStart.getTime()) ? parsedStart : null;
  const parsedEnd = extracted.endsAt ? new Date(extracted.endsAt) : null;
  const validEnd = parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : null;

  if (!validStart) {
    return {
      start: fallbackStart,
      end: null,
      needsReview: true,
      notice: 'We could not read a reliable date from this link. Choose the correct start date and time before adding it.',
    };
  }

  if (validStart.getTime() <= now.getTime()) {
    return {
      start: fallbackStart,
      end: null,
      needsReview: true,
      notice: 'This link contains a past event date. Choose the current event’s correct start date and time before adding it.',
    };
  }

  return {
    start: validStart,
    end: validEnd && validEnd.getTime() > validStart.getTime() ? validEnd : null,
    needsReview: false,
    notice: validEnd && validEnd.getTime() <= validStart.getTime()
      ? 'The link’s end time was inconsistent, so it was left blank. Check the date and time before adding it.'
      : '',
  };
}

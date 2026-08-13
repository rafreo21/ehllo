import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mergeEventActionQueue } from '../mobile/src/features/events/event-action-queue-state.ts';

const queuedAt = '2026-08-13T09:00:00.000Z';

describe('mobile offline event action queue', () => {
  it('keeps only the latest attendance choice for an event', () => {
    const next = mergeEventActionQueue([
      { eventId: 'event-1', action: 'attendance', attendanceStatus: 'going', queuedAt: 'earlier' },
    ], { eventId: 'event-1', action: 'attendance', attendanceStatus: 'not_going' }, queuedAt);
    assert.deepEqual(next, [
      { eventId: 'event-1', action: 'attendance', attendanceStatus: 'not_going', queuedAt },
    ]);
  });

  it('removes a contradictory leave action when Not going is queued', () => {
    const next = mergeEventActionQueue([
      { eventId: 'event-1', action: 'attendance', attendanceStatus: 'going', queuedAt: 'first' },
      { eventId: 'event-1', action: 'leave', left: true, queuedAt: 'second' },
    ], { eventId: 'event-1', action: 'attendance', attendanceStatus: 'not_going' }, queuedAt);
    assert.deepEqual(next, [
      { eventId: 'event-1', action: 'attendance', attendanceStatus: 'not_going', queuedAt },
    ]);
  });

  it('does not disturb actions for another event', () => {
    const other = { eventId: 'event-2', action: 'leave', left: true, queuedAt: 'earlier' };
    const next = mergeEventActionQueue([other], { eventId: 'event-1', action: 'attendance', attendanceStatus: 'going' }, queuedAt);
    assert.equal(next[0], other);
    assert.equal(next[1].eventId, 'event-1');
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapEncounterRow } from '../mobile/src/features/follow-ups/encounter-mapper.ts';

describe('mobile encounter history mapping', () => {
  it('preserves camel-case event context from the encounters API', () => {
    const encounter = mapEncounterRow({ id: 'capture-1', eventId: 'design-systems' });
    assert.equal(encounter.eventId, 'design-systems');
  });

  it('preserves database-style event context for compatible payloads', () => {
    const encounter = mapEncounterRow({ id: 'capture-2', event_id: 'london-social' });
    assert.equal(encounter.eventId, 'london-social');
  });
});

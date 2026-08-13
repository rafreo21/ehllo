import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isConversationEncounter } from '../mobile/src/features/connections/connection-history-state.ts';

function encounter(overrides = {}) {
  return {
    title: 'Meeting with Raf Reo',
    durationSeconds: 0,
    recording: undefined,
    ...overrides,
  };
}

describe('mobile connection history', () => {
  it('keeps a notes-only capture as a real conversation', () => {
    assert.equal(isConversationEncounter(encounter({ sharedSummary: 'Discussed launch plans.' })), true);
  });

  it('keeps a recorded capture', () => {
    assert.equal(isConversationEncounter(encounter({ durationSeconds: 9 })), true);
  });

  it('hides only the Quick Follow-up task container', () => {
    assert.equal(isConversationEncounter(encounter({ title: 'Follow-up with Raf Reo' })), false);
  });
});

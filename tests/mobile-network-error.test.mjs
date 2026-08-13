import assert from 'node:assert/strict';
import { test } from 'node:test';

// Keep these iOS-native message cases documented alongside the mobile test
// suite. The runtime helper also checks live NetInfo and TypeError instances.
const networkMessage = /(network request failed|fetch failed|internet connection appears to be offline)/i;

test('recognises the Expo iOS offline fetch exception', () => {
  assert.match(
    'fetch failed: UnexpectedException: The Internet connection appears to be offline.',
    networkMessage,
  );
});

test('does not classify a domain validation error as offline', () => {
  assert.doesNotMatch('Could not update your attendance.', networkMessage);
});

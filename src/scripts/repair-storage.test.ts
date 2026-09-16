import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyRepairState,
  isExpired,
  parseStoredRepair,
  SCHEMA_VERSION,
} from './repair-storage.ts';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 0, 31);

function stored(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...createEmptyRepairState(), updatedAt: now, ...overrides });
}

test('expires after 30 days, not before', () => {
  assert.equal(isExpired({ updatedAt: now - 29 * DAY }, now), false);
  assert.equal(isExpired({ updatedAt: now - 31 * DAY }, now), true);
});

test('a current record round-trips', () => {
  const state = parseStoredRepair(stored({ reference: 'REP-ABCDE', fault: 'no picture' }), now);
  assert.equal(state?.reference, 'REP-ABCDE');
  assert.equal(state?.fault, 'no picture');
  assert.equal(state?.version, SCHEMA_VERSION);
});

test('a stale record is discarded, not resurrected', () => {
  assert.equal(parseStoredRepair(stored({ updatedAt: now - 31 * DAY }), now), null);
});

test('a different schema version is discarded rather than migrated', () => {
  assert.equal(parseStoredRepair(stored({ version: 2 }), now), null);
});

test('malformed storage never throws', () => {
  assert.equal(parseStoredRepair(null, now), null);
  assert.equal(parseStoredRepair('', now), null);
  assert.equal(parseStoredRepair('not json', now), null);
  assert.equal(parseStoredRepair('"a string"', now), null);
  assert.equal(parseStoredRepair('null', now), null);
  assert.equal(parseStoredRepair('[1,2,3]', now), null);
});

test('submitted is only believed alongside a reference and a cleared record', () => {
  // The shape `completeRepair` actually leaves behind — a forged
  // `{ submitted: true }` must not conjure a confirmation screen for a repair
  // that still has an unsent fault description sitting behind it.
  const forged = parseStoredRepair(stored({ submitted: true, reference: '' }), now);
  assert.equal(forged?.submitted, false);

  const withFault = parseStoredRepair(
    stored({ submitted: true, reference: 'REP-ABCDE', fault: 'cracked screen' }),
    now,
  );
  assert.equal(withFault?.submitted, false);

  const genuine = parseStoredRepair(
    stored({ submitted: true, reference: 'REP-ABCDE', fault: '', slot: null }),
    now,
  );
  assert.equal(genuine?.submitted, true);
});

test('a contact that is not all strings is discarded, not half-adopted', () => {
  // Same discipline as storage.ts: a partial or wrong-typed contact rejects
  // the whole record rather than reaching a validator with `undefined`.
  assert.equal(parseStoredRepair(stored({ contact: { name: 'Jo' } }), now), null);
  assert.equal(parseStoredRepair(stored({ contact: { name: 42 } }), now), null);

  const state = parseStoredRepair(stored({ contact: { name: 'Jo', phone: '', email: '' } }), now);
  assert.equal(state?.contact.name, 'Jo');
});

test('a malformed slot is rejected rather than trusted into the running state', () => {
  assert.equal(parseStoredRepair(stored({ slot: { date: 'not-a-date', part: 'morning' } }), now), null);
  assert.equal(parseStoredRepair(stored({ slot: { date: '2026-02-01', part: 'evening' } }), now), null);
  assert.equal(parseStoredRepair(stored({ slot: 'tomorrow' }), now), null);
  // A well-formed slot survives.
  const ok = parseStoredRepair(stored({ slot: { date: '2026-02-01', part: 'morning' } }), now);
  assert.deepEqual(ok?.slot, { date: '2026-02-01', part: 'morning' });
});

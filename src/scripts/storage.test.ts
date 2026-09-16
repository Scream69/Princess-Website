import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, isExpired, parseStored, SCHEMA_VERSION } from './storage.ts';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 0, 31);

function stored(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...createEmptyState(), updatedAt: now, ...overrides });
}

test('expires after 30 days, not before', () => {
  assert.equal(isExpired({ updatedAt: now - 29 * DAY }, now), false);
  assert.equal(isExpired({ updatedAt: now - 31 * DAY }, now), true);
  assert.equal(isExpired({}, now), true);
});

test('a current record round-trips', () => {
  const state = parseStored(stored({ reference: 'ENQ-ABCDE' }), now);
  assert.equal(state?.reference, 'ENQ-ABCDE');
  assert.equal(state?.version, SCHEMA_VERSION);
});

test('a stale record is discarded, not resurrected', () => {
  assert.equal(parseStored(stored({ updatedAt: now - 31 * DAY }), now), null);
});

test('a different schema version is discarded rather than migrated', () => {
  // A half-migrated enquiry that silently drops a field is worse than none:
  // the customer sees their appliances and we quote against missing data.
  assert.equal(parseStored(stored({ version: 2 }), now), null);
  assert.equal(parseStored(stored({ version: undefined }), now), null);
});

test('malformed storage never throws', () => {
  assert.equal(parseStored(null, now), null);
  assert.equal(parseStored('', now), null);
  assert.equal(parseStored('not json', now), null);
  assert.equal(parseStored('"a string"', now), null);
  assert.equal(parseStored('null', now), null);
  assert.equal(parseStored('[]', now), null);
  assert.equal(parseStored(stored({ items: 'nope' }), now), null);
});

test('a forged confirmation is refused', () => {
  // `submitted` gates step 4 (CLAUDE.md 5.2). localStorage is under the
  // customer's own hand, so the flag is only believed in the shape
  // `completeEnquiry` leaves behind: a reference, and no appliances.
  const forged = JSON.stringify({
    version: SCHEMA_VERSION,
    items: [],
    updatedAt: now,
    submitted: true,
  });
  assert.equal(parseStored(forged, now)?.submitted, false);

  const stillHoldingItems = JSON.stringify({
    version: SCHEMA_VERSION,
    items: [],
    reference: 'ENQ-4CDEF',
    updatedAt: now,
    submitted: true,
  });
  assert.equal(parseStored(stillHoldingItems, now)?.submitted, true);
});

test('a malformed item discards the record rather than crashing the wizard', () => {
  // `[null]` used to reach `backfillParse` during init and throw before any
  // listener was attached — a page that renders and does nothing at all.
  for (const items of ['[null]', '[{"id":"x"}]', '[42]', '[{"id":1,"rawInput":"a"}]']) {
    const raw = `{"version":${SCHEMA_VERSION},"items":${items},"updatedAt":${now}}`;
    assert.equal(parseStored(raw, now), null, items);
  }
});

test('a contact that is not all strings is discarded, not half-adopted', () => {
  const raw = JSON.stringify({
    version: SCHEMA_VERSION,
    items: [],
    updatedAt: now,
    contact: { name: 42, email: null },
  });
  assert.equal(parseStored(raw, now), null);
});

test('missing fields are filled from the empty state', () => {
  const partial = JSON.stringify({ version: SCHEMA_VERSION, items: [], updatedAt: now });
  const state = parseStored(partial, now);
  assert.equal(state?.draftBrandSlug, null);
  assert.equal(state?.submitted, false);
  // 'GB', not empty: the UK is the only country served, so this is a constant
  // on the record rather than an answer step 3 has to collect.
  assert.equal(state?.contact.country, 'GB');
});

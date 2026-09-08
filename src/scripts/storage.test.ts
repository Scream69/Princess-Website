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

test('missing fields are filled from the empty state', () => {
  const partial = JSON.stringify({ version: SCHEMA_VERSION, items: [], updatedAt: now });
  const state = parseStored(partial, now);
  assert.equal(state?.draftBrandSlug, null);
  assert.equal(state?.submitted, false);
  // Empty, not 'GB': a valid default would make step 3 skip the country question.
  assert.equal(state?.contact.country, '');
});

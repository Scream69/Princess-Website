import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createId, createReference, REFERENCE_PATTERN } from './reference.ts';

test('references match the documented ENQ-XXXXX shape', () => {
  for (let i = 0; i < 200; i += 1) {
    assert.match(createReference(), REFERENCE_PATTERN);
  }
});

test('references exclude characters that are ambiguous aloud or on screen', () => {
  // The client reads these back over the phone and searches for them by hand.
  const body = Array.from({ length: 400 }, () => createReference().slice(4)).join('');
  for (const char of '01258BILOSZ') {
    assert.ok(!body.includes(char), `reference alphabet must not contain ${char}`);
  }
});

test('references are not trivially repeating', () => {
  const seen = new Set(Array.from({ length: 500 }, createReference));
  assert.ok(seen.size > 490, `expected near-unique references, got ${seen.size}/500`);
});

test('item ids are unique across a rapid burst', () => {
  const ids = Array.from({ length: 1000 }, createId);
  assert.equal(new Set(ids).size, ids.length);
});

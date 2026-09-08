import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampStep, intendedStep, readUrl, stepUrl } from './wizard.ts';

const empty = { itemCount: 0, submitted: false };
const oneItem = { itemCount: 1, submitted: false };
const sent = { itemCount: 1, submitted: true };

test('step 3 needs at least one appliance', () => {
  assert.equal(clampStep(3, empty), 2);
  assert.equal(clampStep(3, oneItem), 3);
});

test('step 4 cannot be reached without submitting', () => {
  // Otherwise ?step=4 shows a confirmation for an enquiry that was never sent.
  assert.equal(clampStep(4, oneItem), 3);
  assert.equal(clampStep(4, sent), 4);
});

test('an over-reaching deep link clamps rather than rejects', () => {
  assert.equal(clampStep(4, empty), 2);
  assert.equal(clampStep(99, empty), 2);
});

test('steps 1 and 2 are always reachable', () => {
  assert.equal(clampStep(1, empty), 1);
  assert.equal(clampStep(2, empty), 2);
  assert.equal(clampStep(0, empty), 1);
  assert.equal(clampStep(-1, empty), 1);
});

test('readUrl accepts only steps 1-4', () => {
  assert.deepEqual(readUrl('?step=2'), { step: 2, brand: null });
  assert.deepEqual(readUrl('?step=0'), { step: null, brand: null });
  assert.deepEqual(readUrl('?step=5'), { step: null, brand: null });
  assert.deepEqual(readUrl('?step=two'), { step: null, brand: null });
  assert.deepEqual(readUrl('?step=2.5'), { step: null, brand: null });
  assert.deepEqual(readUrl(''), { step: null, brand: null });
});

test('readUrl picks up a brand deep link', () => {
  assert.deepEqual(readUrl('?step=1&brand=miele'), { step: 1, brand: 'miele' });
  assert.deepEqual(readUrl('?brand=miele'), { step: null, brand: 'miele' });
});

test('an explicit step always wins over the stored one', () => {
  assert.equal(intendedStep({ step: 1, brand: 'miele' }, 3), 1);
  assert.equal(intendedStep({ step: 3, brand: null }, 1), 3);
});

test('a bare brand link means the brand is already chosen', () => {
  // The home page brand strip links to /order?brand=<slug> (CLAUDE.md 7).
  assert.equal(intendedStep({ step: null, brand: 'miele' }, 1), 2);
});

test('with no url intent, the stored step is resumed', () => {
  assert.equal(intendedStep({ step: null, brand: null }, 3), 3);
  assert.equal(intendedStep({ step: null, brand: null }, 1), 1);
});

test('step 1 has a clean url so the entry point is canonical', () => {
  assert.equal(stepUrl(1), '/order');
  assert.equal(stepUrl(2), '/order?step=2');
  assert.equal(stepUrl(4), '/order?step=4');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampRepairStep,
  isStep1Complete,
  isStep2Complete,
  readRepairUrl,
  repairStepUrl,
} from './repair.ts';

const empty = { step1Complete: false, step2Complete: false, submitted: false };
const step1Done = { step1Complete: true, step2Complete: false, submitted: false };
const bothDone = { step1Complete: true, step2Complete: true, submitted: false };
const sent = { step1Complete: true, step2Complete: true, submitted: true };

test('step 3 needs both step 1 and step 2 complete', () => {
  assert.equal(clampRepairStep(3, empty), 1);
  assert.equal(clampRepairStep(3, step1Done), 2);
  assert.equal(clampRepairStep(3, bothDone), 3);
});

test('step 4 cannot be reached without submitting', () => {
  // Otherwise ?step=4 shows a confirmation for a repair that was never sent.
  assert.equal(clampRepairStep(4, bothDone), 3);
  assert.equal(clampRepairStep(4, sent), 4);
});

test('an over-reaching deep link clamps rather than rejects', () => {
  assert.equal(clampRepairStep(4, empty), 1);
  assert.equal(clampRepairStep(99, step1Done), 2);
});

test('steps 1 and 2 are always reachable, step 2 needs step 1 first', () => {
  assert.equal(clampRepairStep(1, empty), 1);
  assert.equal(clampRepairStep(2, empty), 1);
  assert.equal(clampRepairStep(2, step1Done), 2);
  assert.equal(clampRepairStep(0, empty), 1);
  assert.equal(clampRepairStep(-1, empty), 1);
});

test('readRepairUrl accepts only steps 1-4', () => {
  assert.deepEqual(readRepairUrl('?step=2'), { step: 2, category: null });
  assert.deepEqual(readRepairUrl('?step=0'), { step: null, category: null });
  assert.deepEqual(readRepairUrl('?step=5'), { step: null, category: null });
  assert.deepEqual(readRepairUrl('?step=two'), { step: null, category: null });
  assert.deepEqual(readRepairUrl(''), { step: null, category: null });
});

test('readRepairUrl picks up a category deep link', () => {
  assert.deepEqual(readRepairUrl('?category=tv'), { step: null, category: 'tv' });
  assert.deepEqual(readRepairUrl('?step=1&category=tv'), { step: 1, category: 'tv' });
});

test('step 1 has a clean url so the entry point is canonical', () => {
  assert.equal(repairStepUrl(1), '/repairs');
  assert.equal(repairStepUrl(2), '/repairs?step=2');
  assert.equal(repairStepUrl(4), '/repairs?step=4');
});

test('step 1 completeness depends only on a non-blank product description', () => {
  assert.equal(isStep1Complete({ product: '' }), false);
  assert.equal(isStep1Complete({ product: '   ' }), false);
  assert.equal(isStep1Complete({ product: 'A television' }), true);
});

test('step 2 completeness depends only on a non-blank fault description', () => {
  assert.equal(isStep2Complete({ fault: '' }), false);
  assert.equal(isStep2Complete({ fault: 'No picture' }), true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isVisible, matches, normalise } from './brand-filter.ts';

test('normalise folds case, accents and punctuation', () => {
  assert.equal(normalise('Fisher & Paykel'), 'fisherpaykel');
  assert.equal(normalise('Schönhaus'), 'schonhaus');
  assert.equal(normalise('TP-Link'), 'tplink');
});

test('an empty query matches everything', () => {
  assert.ok(matches('', 'Miele'));
  assert.ok(matches('   ', 'Miele'));
});

test('matches on prefix, substring and dropped consonants', () => {
  assert.ok(matches('mie', 'Miele'));
  assert.ok(matches('bosch'.slice(0, 2), 'Blomberg')); // "bo" — substring
  assert.ok(matches('mrph', 'Morphy Richards'));
  assert.ok(matches('sms', 'Samsung'));
  assert.ok(matches('fp', 'Fisher & Paykel'));
});

test('matches ignoring accents and punctuation the customer will not type', () => {
  assert.ok(matches('schonhaus', 'Schönhaus'));
  assert.ok(matches('tplink', 'TP-Link'));
  assert.ok(matches('russellhobbs', 'Russell Hobbs'));
});

test('rejects a query whose letters are out of order', () => {
  assert.ok(!matches('elim', 'Miele'));
  assert.ok(!matches('zzz', 'Miele'));
  // Known ceiling: a transposition is a miss, not a fuzzy hit.
  assert.ok(!matches('smasung', 'Samsung'));
});

test('category narrows independently of the query', () => {
  const sony = { name: 'Sony', categories: ['av'] };
  const miele = { name: 'Miele', categories: ['appliances'] };

  assert.ok(isVisible({ query: '', category: 'all' }, sony));
  assert.ok(isVisible({ query: 'so', category: 'av' }, sony));
  assert.ok(!isVisible({ query: 'so', category: 'appliances' }, sony));
  assert.ok(!isVisible({ query: 'sony', category: 'all' }, miele));
});

test('a brand in two categories shows under either', () => {
  const samsung = { name: 'Samsung', categories: ['appliances', 'av'] };
  assert.ok(isVisible({ query: '', category: 'av' }, samsung));
  assert.ok(isVisible({ query: '', category: 'appliances' }, samsung));
  assert.ok(!isVisible({ query: '', category: 'other' }, samsung));
});

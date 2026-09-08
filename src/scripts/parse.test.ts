import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe, humanise, parseInput } from './parse.ts';

test('extracts model and name from a slug carrying both', () => {
  const parsed = parseInput('https://www.miele.co.uk/ovens/h7860bpx-handleless-oven');
  assert.deepEqual(parsed, { inputType: 'url', model: 'H7860BPX', name: 'Handleless Oven' });
});

test('falls back a level when the model has its own segment', () => {
  // Real AEG URLs from the enquiry screenshot.
  assert.deepEqual(parseInput('https://www.aeg.co.uk/kitchen/cooking/ovens/oven/bpx535061m/'), {
    inputType: 'url',
    model: 'BPX535061M',
    name: 'Oven',
  });
  assert.deepEqual(
    parseInput('https://www.aeg.co.uk/kitchen/cooking/hobs/induction-hob/ikx64301cb/'),
    { inputType: 'url', model: 'IKX64301CB', name: 'Induction Hob' },
  );
});

test('reads a model out of the query string when the path has none', () => {
  const parsed = parseInput('https://example.co.uk/appliances/dishwashers?sku=G7160SCVI');
  assert.equal(parsed.model, 'G7160SCVI');
});

test('a url with no model still yields a usable name', () => {
  assert.deepEqual(parseInput('https://www.smeguk.com/products/retro-fridge-freezer'), {
    inputType: 'url',
    model: null,
    name: 'Retro Fridge Freezer',
  });
});

test('never returns a name made of path noise', () => {
  const parsed = parseInput('https://www.example.co.uk/en-gb/p/product/12345/');
  assert.equal(parsed.name, null);
});

test('handles urls without a scheme, and query and hash noise', () => {
  assert.equal(parseInput('www.aeg.co.uk/ovens/bpx535061m/?utm_source=x#spec').model, 'BPX535061M');
});

test('a typed model number is recognised, spaced or not', () => {
  assert.deepEqual(parseInput('H7860BPX'), {
    inputType: 'model',
    model: 'H7860BPX',
    name: null,
  });
  assert.equal(parseInput('H 7860 BPX').model, 'H7860BPX');
  assert.equal(parseInput('  ikx64301cb  ').model, 'IKX64301CB');
});

test('a bare token is not mistaken for a hostname', () => {
  assert.equal(parseInput('H7860BPX').inputType, 'model');
});

test('prose falls through to a description rather than being mangled', () => {
  for (const value of [
    'a big American fridge freezer',
    'something quiet for a small kitchen',
    'washing machine',
  ]) {
    assert.deepEqual(parseInput(value), { inputType: 'description', model: null, name: null });
  }
});

test('empty input is a description, never a crash', () => {
  assert.equal(parseInput('').inputType, 'description');
  assert.equal(parseInput('   ').inputType, 'description');
});

test('malformed urls degrade instead of throwing', () => {
  for (const value of ['https://', 'http://[', '://nope', 'https://.']) {
    assert.doesNotThrow(() => parseInput(value));
  }
});

test('humanise cleans a slug without inventing words', () => {
  assert.equal(humanise('induction-hob'), 'Induction Hob');
  assert.equal(humanise('built_in_oven'), 'Built In Oven');
  assert.equal(humanise('en-gb'), '');
  assert.equal(humanise(''), '');
});

test('describe reads as a sentence the customer can confirm', () => {
  assert.equal(
    describe({ inputType: 'url', model: 'BPX535061M', name: 'Oven' }, 'raw'),
    'Oven — BPX535061M',
  );
  assert.equal(describe({ inputType: 'model', model: 'H7860BPX', name: null }, 'raw'), 'H7860BPX');
  assert.equal(
    describe({ inputType: 'description', model: null, name: null }, '  a quiet dishwasher  '),
    'a quiet dishwasher',
  );
});

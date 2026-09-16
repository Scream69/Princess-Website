import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEmail,
  validateName,
  validatePhone,
  validatePostcode,
} from './validate.ts';

const value = (result: ReturnType<typeof validateName>) => (result.ok ? result.value : null);

test('names are accepted in any script, and collapsed', () => {
  assert.equal(value(validateName('  Jane   Doe ')), 'Jane Doe');
  assert.equal(value(validateName('Ó Súilleabháin')), 'Ó Súilleabháin');
  assert.equal(value(validateName('张伟')), '张伟');
  assert.equal(validateName('').ok, false);
  assert.equal(validateName('12345').ok, false);
});

test('phone numbers survive the formatting people actually use', () => {
  for (const input of [
    '07700 900123',
    '+44 7700 900123',
    '(020) 7946 0018',
    '+49 30 901820',
    '+353-1-234-5678',
    '020.7946.0018',
  ]) {
    assert.equal(validatePhone(input).ok, true, input);
  }
});

test('phone rejects only the implausible', () => {
  assert.equal(validatePhone('').ok, false);
  assert.equal(validatePhone('12345').ok, false);
  assert.equal(validatePhone('1234567890123456789').ok, false);
  assert.equal(validatePhone('call me maybe').ok, false);
});

test('email accepts the awkward-but-valid', () => {
  for (const input of [
    'jane@example.co.uk',
    'jane+quotes@example.com',
    "o'brien@example.ie",
    'jane.doe@sub.domain.museum',
  ]) {
    assert.equal(validateEmail(input).ok, true, input);
  }
});

test('email rejects the clearly wrong', () => {
  for (const input of ['', 'jane', 'jane@', '@example.com', 'jane@example', 'a b@example.com']) {
    assert.equal(validateEmail(input).ok, false, input);
  }
});

test('postcodes from across Europe are all accepted', () => {
  // The whole point of 8.6: no country pattern, so none of these can be
  // rejected for "not looking like" a UK postcode.
  for (const input of [
    'SW1A 1AA', // United Kingdom
    'sw1a1aa',
    '10115', // Germany
    '1234 AB', // Netherlands
    'D02 AF30', // Ireland
    '75008', // France
    '00-950', // Poland
    'AD500', // Andorra
  ]) {
    assert.equal(validatePostcode(input).ok, true, input);
  }
});

test('postcodes are uppercased and collapsed, not reformatted', () => {
  assert.equal(value(validatePostcode('  sw1a   1aa ')), 'SW1A 1AA');
  assert.equal(value(validatePostcode('1234ab')), '1234AB');
});

test('postcode rejects only length and stray characters', () => {
  assert.equal(validatePostcode('').ok, false);
  assert.equal(validatePostcode('AB').ok, false);
  assert.equal(validatePostcode('ABCDEFGHIJK').ok, false);
  assert.equal(validatePostcode('SW1A 1AA!').ok, false);
  assert.equal(validatePostcode('<script>').ok, false);
});

test('an invisible character does not make an address unmailable', () => {
  // Copied out of Outlook or a PDF, a zero-width space rides along: `trim()`
  // and `\s` both miss it, so the address validated, submitted, showed a
  // confirmation — and the reply bounced.
  const withZwsp = 'jane@example.co.uk​';
  const result = validateEmail(withZwsp);
  assert.equal(result.ok, true);
  assert.equal(value(result), 'jane@example.co.uk');
  assert.equal(value(validateEmail('﻿jane@example.co.uk')), 'jane@example.co.uk');
});

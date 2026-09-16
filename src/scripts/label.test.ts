import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeLabel, encodeLabel, labelUrl, type LabelData } from './label.ts';

const DATA: LabelData = {
  reference: 'REP-4CDEF',
  name: 'Jane Begley',
  phone: '07700 900123',
  email: 'jane@example.com',
  product: 'Samsung 55" OLED television',
  fault: 'No picture, standby light on',
  dropoff: 'Monday 21 September, Morning',
};

test('a slip round-trips through encode and decode', () => {
  const decoded = decodeLabel(encodeLabel(DATA));
  assert.deepEqual(decoded, DATA);
});

test('the encoded string is URL-safe with no percent-encoding needed', () => {
  const encoded = encodeLabel(DATA);
  assert.doesNotMatch(encoded, /[+/=]/, 'base64url must not leak standard base64 characters');
  assert.equal(encoded, encodeURIComponent(encoded), 'nothing in it needs escaping in a URL');
});

test('decoding accepts the value with or without a leading #', () => {
  const encoded = encodeLabel(DATA);
  assert.deepEqual(decodeLabel(encoded), decodeLabel(`#${encoded}`));
});

test('unicode in free text survives the round trip', () => {
  const withUnicode: LabelData = { ...DATA, fault: 'Crack across the screen — café spill ☕' };
  assert.deepEqual(decodeLabel(encodeLabel(withUnicode)), withUnicode);
});

test('an empty hash decodes to null rather than a slip of empty fields', () => {
  assert.equal(decodeLabel(''), null);
  assert.equal(decodeLabel('#'), null);
});

test('garbage, truncated, or hand-typed input decodes to null rather than throwing', () => {
  assert.equal(decodeLabel('not-valid-base64!!!'), null);
  assert.equal(decodeLabel(encodeLabel(DATA).slice(0, 10)), null, 'a link an email client clipped');
  assert.equal(decodeLabel('####'), null);
});

/** Mirrors label.ts's private encoder, without importing an internal. */
function encodeWire(wire: unknown[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(wire));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

test('a future or unrecognised wire version is rejected rather than half-read', () => {
  const future = encodeWire([99, 'REP-XXXXX', 'a', 'b', 'c', 'd', 'e', 'f']);
  assert.equal(decodeLabel(future), null);
});

test('a well-formed but wrong-shaped array is rejected', () => {
  const wrongShape = encodeWire([1, 'only-one-field']);
  assert.equal(decodeLabel(wrongShape), null);
});

test('labelUrl builds the expected path and carries the fragment', () => {
  const url = labelUrl('https://princeselectronics.com', DATA);
  assert.ok(url.startsWith('https://princeselectronics.com/repairs/label#'));
  const hash = url.split('#')[1] ?? '';
  assert.deepEqual(decodeLabel(hash), DATA);
});

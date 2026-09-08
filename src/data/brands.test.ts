import { test } from 'node:test';
import assert from 'node:assert/strict';
import raw from './brands.json' with { type: 'json' };
import { alphabet, assertLinkable, brands, featuredBrands, firstLetter } from './brands.ts';

test('every rendered brand has somewhere to send the customer', () => {
  for (const brand of brands) {
    assert.ok(brand.url, `${brand.slug} is active but has no url`);
  }
});

test('the guard refuses an active brand with no url', () => {
  assert.throws(
    () => assertLinkable([{ slug: 'ghost', name: 'Ghost', url: null } as never]),
    /ghost/,
  );
});

test('inactive brands are excluded, not merely hidden', () => {
  const slugs = brands.map((b) => b.slug);
  assert.ok(!slugs.includes('vispera'));
  assert.ok(!slugs.includes('zenith'));
  assert.equal(brands.length, raw.filter((b) => b.active).length);
});

test('slugs are unique', () => {
  const slugs = raw.map((b) => b.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test('sorted alphabetically, accents folded', () => {
  const names = brands.map((b) => b.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en-GB')));
  assert.equal(firstLetter('Schönhaus'), 'S');
});

test('the A-Z rail marks only letters that have brands', () => {
  const withBrands = new Set(brands.map((b) => firstLetter(b.name)));
  for (const { letter, has } of alphabet) {
    assert.equal(has, withBrands.has(letter), `letter ${letter}`);
  }
});

test('featured brands are a subset of the active grid', () => {
  assert.ok(featuredBrands.length > 0);
  for (const brand of featuredBrands) {
    assert.ok(brands.includes(brand));
  }
});

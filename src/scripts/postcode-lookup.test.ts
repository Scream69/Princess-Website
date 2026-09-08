import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLookupSupported, lookupPostcode, summarise } from './postcode-lookup.ts';

test('lookup is offered for the UK only', () => {
  assert.equal(isLookupSupported('GB'), true);
  assert.equal(isLookupSupported('gb'), true);
  assert.equal(isLookupSupported('DE'), false);
  assert.equal(isLookupSupported(''), false);
});

test('summarises district and region', () => {
  assert.deepEqual(
    summarise({ postcode: 'WD17 1AA', admin_district: 'Watford', region: 'East of England' }),
    { postcode: 'WD17 1AA', summary: 'Watford, East of England' },
  );
});

test('does not repeat a name that appears twice', () => {
  assert.deepEqual(summarise({ postcode: 'M1 1AE', admin_district: 'Manchester', region: 'Manchester' }), {
    postcode: 'M1 1AE',
    summary: 'Manchester',
  });
});

test('falls back to country when there is no region', () => {
  assert.equal(
    summarise({ postcode: 'EH1 1YZ', admin_district: 'Edinburgh', country: 'Scotland' })?.summary,
    'Edinburgh, Scotland',
  );
});

test('copes with a sparse or malformed result', () => {
  assert.equal(summarise({}), null);
  assert.equal(summarise({ postcode: '' }), null);
  assert.equal(summarise({ postcode: 'X1 1XX' })?.summary, '');
  assert.equal(summarise({ postcode: 'X1 1XX', admin_district: 42 })?.summary, '');
});

test('an implausible length is not sent to the network at all', async (t) => {
  const fetchCalls: unknown[] = [];
  t.mock.method(globalThis, 'fetch', (...args: unknown[]) => {
    fetchCalls.push(args);
    throw new Error('should not be called');
  });

  assert.equal(await lookupPostcode('AB'), null);
  assert.equal(await lookupPostcode('ABCDEFGHIJ'), null);
  assert.equal(fetchCalls.length, 0);
});

test('a network failure resolves to null rather than throwing', async (t) => {
  t.mock.method(globalThis, 'fetch', () => Promise.reject(new Error('offline')));
  assert.equal(await lookupPostcode('SW1A 1AA'), null);
});

test('a 404 from the api is not an error for the customer', async (t) => {
  t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(new Response('{}', { status: 404 })),
  );
  assert.equal(await lookupPostcode('SW1A 1AA'), null);
});

test('a good response is normalised, spacing included', async (t) => {
  t.mock.method(globalThis, 'fetch', (url: string) => {
    assert.match(url, /SW1A1AA$/);
    return Promise.resolve(
      new Response(
        JSON.stringify({
          result: { postcode: 'SW1A 1AA', admin_district: 'Westminster', region: 'London' },
        }),
        { status: 200 },
      ),
    );
  });

  assert.deepEqual(await lookupPostcode('sw1a1aa'), {
    postcode: 'SW1A 1AA',
    summary: 'Westminster, London',
  });
});

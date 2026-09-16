import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, type EnquiryItem, type EnquiryState } from './storage.ts';
import {
  buildPayload,
  mergeIntoQueue,
  parseQueue,
  passesTimeCheck,
  postEnquiry,
  queueSubmission,
  readQueue,
  retryQueue,
  whatsappMessage,
  withinRateLimit,
  type EnquiryPayload,
  type QueueEntry,
} from './submit.ts';

/*
 * The queue lives in localStorage, and these tests are the only place the
 * write-back is observable. Node has no `window`, so it gets a minimal one —
 * enough for the four calls submit.ts makes, and nothing more.
 */
function useStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  };
  return store;
}

const now = Date.UTC(2026, 0, 31, 9, 30);
const DAY = 24 * 60 * 60 * 1000;

function item(overrides: Partial<EnquiryItem> = {}): EnquiryItem {
  return {
    id: 'i1',
    brandSlug: 'miele',
    rawInput: 'https://www.miele.co.uk/ovens/h7860bpx-handleless-oven',
    inputType: 'url',
    parsedModel: 'H7860BPX',
    parsedName: 'Handleless Oven',
    note: '',
    addedAt: now - 60_000,
    ...overrides,
  };
}

function state(overrides: Partial<EnquiryState> = {}): EnquiryState {
  return {
    ...createEmptyState(),
    reference: 'ENQ-4CDEF',
    items: [item()],
    contact: {
      name: 'Jane Doe',
      email: 'jane@example.co.uk',
      phone: '+44 7700 900123',
      country: 'GB',
      postcode: 'WD17 1AA',
    },
    consent: true,
    ...overrides,
  };
}

const context = (overrides: Partial<EnquiryState> = {}) => ({
  state: state(overrides),
  session: { entryUrl: 'https://example.com/order?brand=miele', brandsClicked: ['miele'], msOnPage: 254_000 },
  brandNames: { miele: 'Miele' },
  now,
});

// --- payload ----------------------------------------------------------------

test('the subject carries the reference, the customer and the count', () => {
  // Everything the client needs to triage the email without opening it. The
  // delivery country used to be here too; with UK-only delivery it named the
  // same country every time and was removed (CLAUDE.md 8.6).
  const payload = buildPayload(context());
  assert.equal(payload.subject, 'Enquiry ENQ-4CDEF — Jane Doe (1 appliance)');
  assert.equal('country' in payload, false);
});

test('the appliance count is pluralised', () => {
  const payload = buildPayload(context({ items: [item(), item({ id: 'i2' })] }));
  assert.match(payload.subject, /\(2 appliances\)$/);
  assert.equal(payload.appliance_count, 2);
});

test('every appliance carries its brand, what we parsed, and what they pasted', () => {
  const payload = buildPayload(context());
  assert.equal(
    payload.appliances,
    '1. Miele — Handleless Oven — H7860BPX\n' +
      '   https://www.miele.co.uk/ovens/h7860bpx-handleless-oven',
  );
});

test('a typed model number is not repeated back twice', () => {
  const payload = buildPayload(
    context({
      items: [item({ rawInput: 'H7860BPX', inputType: 'model', parsedName: null })],
    }),
  );
  assert.equal(payload.appliances, '1. Miele — H7860BPX');
});

test('a free-text description reaches the client verbatim', () => {
  const payload = buildPayload(
    context({
      items: [
        item({
          brandSlug: null,
          rawInput: 'a quiet 60cm dishwasher',
          inputType: 'description',
          parsedModel: null,
          parsedName: null,
          note: 'ideally before Christmas',
        }),
      ],
    }),
  );
  assert.equal(
    payload.appliances,
    '1. a quiet 60cm dishwasher\n   Note: ideally before Christmas',
  );
});

test('consent is recorded, and its absence is loud', () => {
  assert.equal(buildPayload(context()).consent, 'Given at 2026-01-31T09:30:00.000Z');
  assert.equal(buildPayload(context({ consent: false })).consent, 'NOT GIVEN');
});

test('the metadata tells the client where the enquiry came from', () => {
  const payload = buildPayload(context());
  assert.equal(payload.entry_url, 'https://example.com/order?brand=miele');
  assert.equal(payload.brands_clicked, 'miele');
  assert.equal(payload.time_on_page, '4m 14s');
});

test('the reply-to is the customer, so answering the email answers them', () => {
  assert.equal(buildPayload(context()).replyto, 'jane@example.co.uk');
});

// --- the WhatsApp fallback --------------------------------------------------

test('the WhatsApp message carries the whole enquiry', () => {
  const message = whatsappMessage(buildPayload(context()));
  assert.match(message, /^Enquiry ENQ-4CDEF/);
  assert.match(message, /Jane Doe · \+44 7700 900123 · jane@example\.co\.uk/);
  assert.match(message, /^WD17 1AA$/m);
  assert.match(message, /Miele — Handleless Oven — H7860BPX/);
});

test('the cut never splits a character, so the link can always be built', () => {
  // `slice` counts UTF-16 units: an emoji straddling the limit left a lone
  // surrogate, and `encodeURIComponent` threw inside the one path whose job is
  // to survive a failed submission — the WhatsApp button was never revealed.
  /*
   * Both parities. Each emoji is two UTF-16 units, so whether the cut lands
   * between characters or inside one depends on the length of everything
   * before it — and that is payload copy, which changes. Running with and
   * without a one-character pad guarantees one of the two splits a pair, so
   * this cannot quietly stop testing when someone rewords a line.
   */
  for (const pad of ['', '.']) {
    const emoji = pad + '\u{1F600}'.repeat(900);
    const message = whatsappMessage(
      buildPayload(context({ items: [item({ rawInput: emoji, inputType: 'description' })] })),
    );
    assert.match(message, /please ask me for the rest/, 'the message should have been cut');
    assert.doesNotThrow(() => encodeURIComponent(message), `pad ${JSON.stringify(pad)}`);
  }
});

test('an enormous enquiry is cut short rather than dropped', () => {
  const many = Array.from({ length: 60 }, (_, index) => item({ id: `i${index}` }));
  const message = whatsappMessage(buildPayload(context({ items: many })));
  assert.ok(message.length < 1500, `message was ${message.length} characters`);
  assert.match(message, /please ask me for the rest/);
});

// --- posting, retry and refusal ---------------------------------------------

const payload = () => buildPayload(context());

function stubFetch(responses: (Response | Error)[]) {
  const calls: string[] = [];
  const impl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    const next = responses[calls.length - 1] ?? new Error('no response queued');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const options = (fetchImpl: typeof fetch) => ({
  accessKey: 'test-key',
  payload: payload(),
  fetchImpl,
  endpoint: 'https://example.invalid/submit',
  wait: async () => {},
});

test('a missing access key is reported as such, not as a network blip', async () => {
  const { impl, calls } = stubFetch([]);
  const result = await postEnquiry({ ...options(impl), accessKey: '  ' });
  assert.deepEqual(result, { ok: false, reason: 'unconfigured' });
  assert.equal(calls.length, 0, 'nothing should be posted without a key');
});

test('a confirmed send reports success once', async () => {
  const { impl, calls } = stubFetch([json({ success: true })]);
  assert.deepEqual(await postEnquiry(options(impl)), { ok: true });
  assert.equal(calls.length, 1);
});

test('the access key travels with the payload', async () => {
  let body: unknown;
  const impl = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return json({ success: true });
  }) as unknown as typeof fetch;

  await postEnquiry(options(impl));
  assert.equal((body as { access_key: string }).access_key, 'test-key');
  assert.equal((body as EnquiryPayload).reference, 'ENQ-4CDEF');
});

test('a network failure is retried twice, then given up on', async () => {
  const { impl, calls } = stubFetch([
    new Error('offline'),
    new Error('offline'),
    new Error('offline'),
  ]);
  assert.deepEqual(await postEnquiry(options(impl)), { ok: false, reason: 'network' });
  assert.equal(calls.length, 3, 'one attempt plus two retries');
});

test('a retry that succeeds is a success', async () => {
  const { impl, calls } = stubFetch([new Error('offline'), json({ success: true })]);
  assert.deepEqual(await postEnquiry(options(impl)), { ok: true });
  assert.equal(calls.length, 2);
});

test('a 500 and a 429 are worth retrying', async () => {
  for (const status of [500, 429]) {
    const { impl, calls } = stubFetch([json({}, status), json({ success: true })]);
    assert.deepEqual(await postEnquiry(options(impl)), { ok: true });
    assert.equal(calls.length, 2, `status ${status} should be retried`);
  }
});

test('a settled refusal is not retried — it only delays the fallback', async () => {
  const { impl, calls } = stubFetch([json({ success: false }, 400)]);
  assert.deepEqual(await postEnquiry(options(impl)), { ok: false, reason: 'rejected' });
  assert.equal(calls.length, 1);
});

test('a 200 that says success:false is a failure, not a delivery', async () => {
  // Web3Forms answers 200 with success:false when it drops a submission.
  // Believing the status code here would show a confirmation for an enquiry
  // nobody received — the worst defect in this codebase (rule 2.4).
  const { impl } = stubFetch([json({ success: false, message: 'spam' })]);
  assert.deepEqual(await postEnquiry(options(impl)), { ok: false, reason: 'rejected' });
});

test('a 2xx with an unreadable body is taken at its word', async () => {
  const { impl } = stubFetch([new Response('<html>thanks</html>', { status: 200 })]);
  assert.deepEqual(await postEnquiry(options(impl)), { ok: true });
});

// --- the on-device queue ----------------------------------------------------

/** One key per inbox — quotes and repairs are separate Web3Forms forms. */
const KEYS = { quote: 'quote-key', repair: 'repair-key' } as const;

function entry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    kind: 'quote',
    reference: 'ENQ-4CDEF',
    payload: payload(),
    queuedAt: now,
    attempts: 0,
    ...overrides,
  };
}

test('an unreadable queue is empty, never an exception', () => {
  assert.deepEqual(parseQueue(null, now), []);
  assert.deepEqual(parseQueue('not json', now), []);
  assert.deepEqual(parseQueue('{"not":"an array"}', now), []);
  assert.deepEqual(parseQueue('[null, 3, "x", {}]', now), []);
});

test('a queued enquiry survives, until it is 30 days old', () => {
  assert.equal(parseQueue(JSON.stringify([entry()]), now).length, 1);
  assert.equal(parseQueue(JSON.stringify([entry({ queuedAt: now - 29 * DAY })]), now).length, 1);
  assert.equal(parseQueue(JSON.stringify([entry({ queuedAt: now - 31 * DAY })]), now).length, 0);
});

test('re-queueing the same enquiry replaces it rather than duplicating it', () => {
  // Otherwise "Try again" posts the same enquiry to the client twice.
  const queued = mergeIntoQueue([entry({ queuedAt: now - 5000 })], 'quote', payload(), now);
  assert.equal(queued.length, 1);
  assert.equal(queued[0]?.queuedAt, now - 5000, 'the original wait is preserved');
});

test('a second, different enquiry is queued alongside the first', () => {
  const other = { ...payload(), reference: 'ENQ-77777' };
  const queued = mergeIntoQueue([entry()], 'quote', other, now);
  assert.deepEqual(
    queued.map((queuedEntry) => queuedEntry.reference).sort(),
    ['ENQ-4CDEF', 'ENQ-77777'],
  );
});

test('the queue is capped, and the enquiry being queued always survives it', () => {
  // The one with someone waiting on it. This asserted the opposite until
  // 2026-09-16: the newest entry was appended and then sliced off the end, so
  // a full queue silently discarded the enquiry that had just failed while the
  // customer was being told nothing had been lost (rule 2.4).
  const existing = Array.from({ length: 10 }, (_, index) =>
    entry({ reference: `ENQ-0000${index}` }),
  );
  const queued = mergeIntoQueue(existing, 'quote', { ...payload(), reference: 'ENQ-LATER' }, now);
  assert.equal(queued.length, 10);
  assert.ok(queued.some((queuedEntry) => queuedEntry.reference === 'ENQ-LATER'));
  // And the oldest of the rest are what it makes room by dropping.
  assert.equal(queued.at(-1)?.reference, 'ENQ-00008');
});

test('a response whose body cannot be read is not a confirmed delivery', async () => {
  // The abort signal covers the response stream, not just the headers, so a
  // connection dropped mid-body lands here. Reading it as success told the
  // customer their enquiry was sent when nothing arrived (rule 2.4).
  const broken = new Response(
    new ReadableStream({
      start(controller) {
        controller.error(new Error('connection reset'));
      },
    }),
    { status: 200 },
  );
  const { impl, calls } = stubFetch([broken, json({ success: true })]);
  assert.deepEqual(await postEnquiry(options(impl)), { ok: true });
  assert.equal(calls.length, 2, 'the unreadable body should have been retried');
});

test('an endpoint that answers in HTML is still believed', async () => {
  // Netlify Forms does this. Not-JSON is a different thing from unreadable.
  const html = new Response('<html><body>Thanks</body></html>', { status: 200 });
  const { impl, calls } = stubFetch([html]);
  assert.deepEqual(await postEnquiry(options(impl)), { ok: true });
  assert.equal(calls.length, 1);
});

// --- the queue on disk ------------------------------------------------------

test('a retry pass does not erase an enquiry queued while it was running', async () => {
  useStorage();
  queueSubmission('quote', { ...payload(), reference: 'ENQ-STALE' }, now);

  // The live enquiry is queued mid-pass, exactly as it would be if the
  // customer pressed Submit while this was still awaiting.
  const impl = (async () => {
    queueSubmission('quote', { ...payload(), reference: 'ENQ-LIVE' }, now);
    return json({ success: false });
  }) as unknown as typeof fetch;

  await retryQueue({
    accessKeys: KEYS,
    fetchImpl: impl,
    endpoint: 'https://example.invalid',
    now,
  });

  const refs = readQueue(now).map((entry) => entry.reference);
  assert.ok(refs.includes('ENQ-LIVE'), 'the enquiry queued during the pass survived');
  assert.ok(refs.includes('ENQ-STALE'), 'and the one it was retrying is still queued');
});

test('a delivered entry is dropped, not resurrected', async () => {
  useStorage();
  queueSubmission('quote', { ...payload(), reference: 'ENQ-SENT' }, now);
  const { impl } = stubFetch([json({ success: true })]);

  const sent = await retryQueue({
    accessKeys: KEYS,
    fetchImpl: impl,
    endpoint: 'https://example.invalid',
    now,
  });

  assert.deepEqual(sent.map((entry) => entry.reference), ['ENQ-SENT']);
  assert.deepEqual(readQueue(now), []);
});

test('a queue entry written before repairs existed is still delivered', () => {
  // Entries on real devices predate `kind` entirely, and they hold enquiries
  // that were never sent. Dropping them for a missing field would throw away
  // exactly what the queue exists to protect (rule 2.4).
  const legacy = JSON.stringify([
    { reference: 'ENQ-OLDER', payload: payload(), queuedAt: now, attempts: 1 },
  ]);
  const parsed = parseQueue(legacy, now);
  assert.equal(parsed.length, 1, 'the entry survived the schema change');
  assert.equal(parsed[0]?.kind, 'quote', 'and is read as the only thing it can be');
});

test('each queued entry is retried with the key for its own inbox', async () => {
  useStorage();
  queueSubmission('quote', { ...payload(), reference: 'ENQ-AAAAA' }, now);
  queueSubmission('repair', { reference: 'REP-BBBBB', name: 'Jo' }, now);

  const used: string[] = [];
  const impl = (async (_url: string, init: RequestInit) => {
    used.push(JSON.parse(String(init.body)).access_key);
    return json({ success: true });
  }) as unknown as typeof fetch;

  await retryQueue({
    accessKeys: KEYS,
    fetchImpl: impl,
    endpoint: 'https://example.invalid',
    now,
  });

  // Posting a repair with the quote key would deliver it to the wrong inbox.
  assert.deepEqual(used.sort(), ['quote-key', 'repair-key']);
  assert.deepEqual(readQueue(now), []);
});

// --- spam guards ------------------------------------------------------------

test('a stamp from the future is ignored rather than counted forever', () => {
  // A phone whose clock ran ahead wrote stamps that could never age out, and
  // the rate-limit path does not queue — so the customer was locked out with
  // no way through and no way to clear it.
  const ahead = Array.from({ length: 9 }, (_, index) => now + (index + 1) * 60_000);
  assert.equal(withinRateLimit(ahead, now), true);
});

test('an instant submission is refused', () => {
  assert.equal(passesTimeCheck({ now, loadedAt: now - 500, startedAt: now - 500 }), false);
});

test('a customer who refreshes at step 3 and submits at once is not refused', () => {
  // The expensive false positive: every answer restored from storage, so the
  // page is seconds old but the enquiry is not.
  assert.equal(passesTimeCheck({ now, loadedAt: now - 800, startedAt: now - 400_000 }), true);
});

test('time on the page alone is enough', () => {
  assert.equal(passesTimeCheck({ now, loadedAt: now - 9000, startedAt: null }), true);
});

test('five enquiries an hour is the limit, and it lapses', () => {
  const recent = Array.from({ length: 5 }, () => now - 60_000);
  assert.equal(withinRateLimit(recent, now), false);
  assert.equal(withinRateLimit(recent.slice(1), now), true);
  assert.equal(
    withinRateLimit(
      recent.map(() => now - 2 * 60 * 60 * 1000),
      now,
    ),
    true,
  );
});

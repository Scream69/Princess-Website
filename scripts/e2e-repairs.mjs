/*
 * End-to-end repair-booking test (CLAUDE.md 12: "test the wizard end to end
 * after every change to it" — the repair booking is the /order wizard's
 * sibling and gets the same discipline).
 *
 * Same approach as e2e-wizard.mjs: a real Chrome or Edge over the DevTools
 * Protocol, no framework, no browser-automation package. The low-level driver
 * (socket, evaluate, goto) is duplicated rather than imported from
 * e2e-wizard.mjs — extracting a shared driver module is worth doing, and is
 * left as a follow-up rather than done under this change, to keep this file
 * reviewable on its own.
 *
 *   npm run dev             # in one terminal
 *   npm run test:e2e:repairs   # in another
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import SITE from '../src/data/site.json' with { type: 'json' };

/*
 * The repairs Web3Forms key does not exist yet (MISSING-ASSETS.md) — the
 * client has not created that form. That makes `unconfigured` the only
 * submission path this build can exercise for real, and it is exercised
 * below: no key means no network call, an immediate queue, and an honest
 * failure message (CLAUDE.md 8.7 step 7).
 */
const HAS_KEY = /^PUBLIC_WEB3FORMS_KEY_REPAIRS=.+$/m.test(
  existsSync('.env') ? readFileSync('.env', 'utf8') : '',
);
const WHATSAPP_NUMBER = SITE.contact.whatsapp.replace(/\D/g, '');

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const PORT = 9334; // distinct from e2e-wizard.mjs's 9333, so both can run at once

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const browser = BROWSERS.find((path) => existsSync(path));
if (!browser) {
  console.error('No Chrome or Edge found. Set CHROME_PATH to the executable.');
  process.exit(2);
}

try {
  await fetch(BASE, { signal: AbortSignal.timeout(3000) });
} catch {
  console.error(`No dev server at ${BASE}. Run "npm run dev" first.`);
  process.exit(2);
}

const profile = mkdtempSync(join(tmpdir(), 'repairs-e2e-'));
const child = spawn(
  browser,
  [
    '--headless',
    '--disable-gpu',
    '--no-first-run',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

function cleanup() {
  child.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Windows sometimes holds the profile open briefly; it is in tmp anyway.
  }
}
process.on('exit', cleanup);

async function connect() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Browser still starting.
    }
    await wait(250);
  }
  throw new Error('Browser did not expose a debugging target.');
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Storage writes are debounced 300ms (CLAUDE.md 8.4), so read-back must wait. */
const settle = () => wait(450);

const socket = new WebSocket(await connect());
await new Promise((resolve) => (socket.onopen = resolve));

let nextId = 0;
const pending = new Map();
const consoleErrors = [];

const isDevToolbarAudit = (text) =>
  text.includes('Astro') && text.includes("audit's match function");

socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    const text = message.params.args.map((arg) => arg.description ?? arg.value).join(' ');
    if (!isDevToolbarAudit(text)) consoleErrors.push(text);
  }
  // Unhandled exceptions inside async event-handler callbacks (a click
  // handler's own async function body, for instance) surface here, not as a
  // console.error — so the plain console-error check above would miss them.
  if (message.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(
      message.params.exceptionDetails?.exception?.description ?? 'exceptionThrown (no description)',
    );
  }
  const resolve = pending.get(message.id);
  if (resolve) {
    pending.delete(message.id);
    resolve(message);
  }
};

function send(method, params = {}) {
  const id = (nextId += 1);
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', {
    expression: `(async () => { ${expression} })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  const failure = response.result?.exceptionDetails;
  if (failure) throw new Error(failure.exception?.description ?? 'evaluation failed');
  return response.result?.result?.value;
}

/** Same two-signal wait as e2e-wizard.mjs's goto, against [data-repair]. */
async function goto(path) {
  await evaluate('window.__stale = true; return 1;').catch(() => {});
  await send('Page.navigate', { url: `${BASE}${path}` });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(`
      if (window.__stale) return 'old-document';
      if (document.readyState === 'loading') return 'parsing';
      const root = document.querySelector('[data-repair]');
      if (!root) return 'ready';
      return root.dataset.ready === 'true' ? 'ready' : 'initialising';
    `).catch(() => 'navigating');

    if (state === 'ready') return;
    await wait(100);
  }
  throw new Error(`the repair page never initialised at ${path}`);
}

const results = [];
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(ok);
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}`);
  if (!ok) {
    console.log(`        expected ${JSON.stringify(expected)}`);
    console.log(`        actual   ${JSON.stringify(actual)}`);
  }
}

const PROBE = `
  const visible = [...document.querySelectorAll('section[data-step-panel]')]
    .filter((s) => !s.hidden).map((s) => s.dataset.stepPanel);
  const stored = (() => {
    try { return JSON.parse(localStorage.getItem('repair:v1')); } catch { return 'threw'; }
  })();
  const queued = (() => {
    try { return JSON.parse(localStorage.getItem('pending-enquiry')); } catch { return 'threw'; }
  })();
  return {
    step: visible.join(',') || 'none',
    url: location.search || '(none)',
    reference: stored?.reference ?? null,
    category: stored?.category ?? null,
    product: stored?.product ?? null,
    fault: stored?.fault ?? null,
    slot: stored?.slot ?? null,
    submitted: stored?.submitted ?? null,
    shownReference: document.querySelector('[data-repair-reference]')?.textContent,
    reviewShown: !document.querySelector('[data-repair-review]')?.hidden,
    slotChosenShown: !document.querySelector('[data-slot-chosen]')?.hidden,
    failureShown: !document.querySelector('[data-repair-failure]')?.hidden,
    failureHeading: document.querySelector('[data-repair-failure-heading]')?.textContent,
    whatsappShown: !document.querySelector('[data-repair-whatsapp-fallback]')?.hidden,
    queue: Array.isArray(queued) ? queued.map((e) => [e.kind, e.reference]) : queued,
  };
`;

const setProduct = (value) => evaluate(`
  const el = document.querySelector('[data-repair-product]');
  el.value = ${JSON.stringify(value)};
  el.dispatchEvent(new Event('input'));
  return 1;
`);

const setFault = (value) => evaluate(`
  const el = document.querySelector('[data-repair-fault]');
  el.value = ${JSON.stringify(value)};
  el.dispatchEvent(new Event('input'));
  return 1;
`);

const answer = (value) => evaluate(`
  const input = document.querySelector('[data-repair-detail-input]');
  input.value = ${JSON.stringify(value)};
  document.querySelector('[data-repair-detail-form]')
    .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  return 1;
`).then(settle);

const reset = () => evaluate('localStorage.clear(); return 1;');

await send('Page.enable');
await send('Runtime.enable');

// --- step 1: category + product ---------------------------------------------

await goto('/repairs');
await reset();
await goto('/repairs');
let s = await evaluate(PROBE);
check('opens on step 1 with a clean url', [s.step, s.url], ['1', '(none)']);

await evaluate(`document.querySelector('[data-category="tv"]').click(); return 1;`);
await settle();
s = await evaluate(PROBE);
check('choosing a category is persisted', s.category, 'tv');
check('and marks the chip pressed', await evaluate(`
  return document.querySelector('[data-category="tv"]').getAttribute('aria-pressed');
`), 'true');

await evaluate(`document.querySelector('[data-step1-continue]').click(); return 1;`);
s = await evaluate(PROBE);
check('an empty product description refuses to advance', s.step, '1');
check('with a visible reason', await evaluate(`
  return document.querySelector('[data-step1-error]').textContent !== '';
`), true);

await setProduct('Samsung 55" OLED television, about 4 years old');
await evaluate(`document.querySelector('[data-step1-continue]').click(); return 1;`);
await settle();
s = await evaluate(PROBE);
check('a filled product description advances to step 2', s.step, '2');
check('and mints a reference on the first meaningful step', /^REP-/.test(s.reference ?? ''), true);
const reference = s.reference;

// --- step 2: fault -----------------------------------------------------------

await evaluate(`document.querySelector('[data-step2-continue]').click(); return 1;`);
s = await evaluate(PROBE);
check('an empty fault description refuses to advance', s.step, '2');

await setFault('No picture, standby light on, sound still works');
await evaluate(`document.querySelector('[data-step2-continue]').click(); return 1;`);
s = await evaluate(PROBE);
check('a filled fault description advances to step 3', s.step, '3');
check('the same reference survives across steps', s.reference, reference);

// --- step 3: details + slot ---------------------------------------------------

for (const value of ['Jane Begley', '07700 900123', 'jane@example.co.uk']) {
  await answer(value);
}
s = await evaluate(PROBE);
check('all three questions answered reveal the slot picker', await evaluate(`
  return !document.querySelector('[data-slot-section]').hidden;
`), true);

// [data-slot-days] is the whole calendar widget, month-nav buttons included —
// only [data-slot-grid] holds the actual day-of-month cells.
const dayCount = await evaluate(`
  return document.querySelectorAll('[data-slot-grid] button').length;
`);
check('at least one open drop-off day is offered', dayCount > 0, true);

const monthLabelText = await evaluate(`
  return document.querySelector('[data-slot-month]')?.textContent ?? null;
`);
check('the calendar names the month it is showing', typeof monthLabelText === 'string' && monthLabelText.length > 0, true);

const prevDisabledInitially = await evaluate(`
  return document.querySelector('[data-slot-prev-month]')?.disabled;
`);
check('paging back before the earliest available month is disabled', prevDisabledInitially, true);

// Padding cells before the 1st of the month, and past/closed days within it,
// are plain spans, not buttons — only real, available dates are clickable.
// The current month has both kinds by construction (days before "today" and
// at least one Sunday), so this is a real assertion, not a vacuous one.
const nonButtonCells = await evaluate(`
  return document.querySelectorAll('[data-slot-grid] > span').length;
`);
check('unavailable and padding days render as non-interactive cells', nonButtonCells > 0, true);

// The window is 180 days (repairs.json's slots.daysAhead) specifically so a
// customer can plan a drop-off a month or more out — this is the check that
// would have caught it being too short to page forward at all.
const nextDisabledInitially = await evaluate(`
  return document.querySelector('[data-slot-next-month]')?.disabled;
`);
check('a six-month window leaves "next month" enabled from the first month', nextDisabledInitially, false);

await evaluate(`document.querySelector('[data-slot-next-month]').click(); return 1;`);
await settle();
const afterNext = await evaluate(`
  return {
    label: document.querySelector('[data-slot-month]')?.textContent ?? null,
    dayCount: document.querySelectorAll('[data-slot-grid] button').length,
    prevDisabled: document.querySelector('[data-slot-prev-month]')?.disabled,
  };
`);
check('"Next month" actually advances the calendar', afterNext.label !== monthLabelText, true);
check('and still offers real, clickable dates', afterNext.dayCount > 0, true);
check('with "Previous month" now enabled, since there is a month before this one', afterNext.prevDisabled, false);

await evaluate(`document.querySelector('[data-slot-prev-month]').click(); return 1;`);
await settle();
const backAgain = await evaluate(`
  return document.querySelector('[data-slot-month]')?.textContent ?? null;
`);
check('"Previous month" returns to where the calendar started', backAgain, monthLabelText);

await evaluate(`document.querySelector('[data-slot-grid] button').click(); return 1;`);
await settle();
const timeCount = await evaluate(`
  return document.querySelectorAll('[data-slot-times] button:not([hidden])').length;
`);
check('choosing a day reveals its time slots', timeCount > 0, true);

await evaluate(`document.querySelector('[data-slot-times] button').click(); return 1;`);
await settle();
s = await evaluate(PROBE);
check('choosing a time records the slot', s.slot !== null, true);
check('and shows the chosen-slot summary instead of the picker', s.slotChosenShown, true);
check('the review section appears once contact and slot are both complete', s.reviewShown, true);

const reviewText = await evaluate(`
  return document.querySelector('[data-repair-review-list]').textContent;
`);
check('the review names the category', reviewText.includes('Televisions'), true);
check('the review carries the fault description', reviewText.includes('No picture'), true);

// --- refresh survival ---------------------------------------------------------

await goto('/repairs?step=3');
s = await evaluate(PROBE);
check('a refresh at step 3 restores the slot and the reference', [s.step, s.slot !== null, s.reference], [
  '3',
  true,
  reference,
]);

// The reload above just reset `loadedAt`, and the spam guard rejects any
// submission inside the first 3 seconds of a page's life (CLAUDE.md 8.8) —
// correctly, since a real customer never submits that fast. Clear it before
// the submission tests below, or they exercise the "blocked" path by
// accident rather than the one they are meant to.
await wait(3200);

// --- honeypot ------------------------------------------------------------------

await evaluate(`
  const consent = document.querySelector('[data-repair-consent]');
  consent.checked = true;
  consent.dispatchEvent(new Event('change'));
  document.querySelector('[data-repair-honeypot]').checked = true;
  return 1;
`);
await evaluate(`document.querySelector('[data-repair-submit]').click(); return 1;`);
await settle();
s = await evaluate(PROBE);
check('a tripped honeypot sends nothing and reaches no step 4', [s.step, s.queue], ['3', null]);
await evaluate(`document.querySelector('[data-repair-honeypot]').checked = false; return 1;`);

// --- submission ----------------------------------------------------------------
//
// window.fetch is stubbed BEFORE the first attempt, the same technique
// e2e-wizard.mjs uses for its offline/online checks — never trusted to the
// real network either way. Without a repairs key (MISSING-ASSETS.md), the
// stub is never even reached: `postEnquiry` returns `unconfigured` before
// calling fetch at all (CLAUDE.md 8.7 step 7), so both branches below are
// deterministic regardless of HAS_KEY.

await evaluate(`
  window.__posts = 0;
  window.__realFetch ??= window.fetch;
  window.__succeed = false;
  window.fetch = (url, init) => {
    if (!String(url).includes('web3forms')) return window.__realFetch(url, init);
    window.__posts += 1;
    return window.__succeed
      ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
      : Promise.reject(new Error('offline'));
  };
  return 1;
`);

await evaluate(`document.querySelector('[data-repair-submit]').click(); return 1;`);
// With a real key this retries twice with backoff (800ms, 2400ms — CLAUDE.md
// 8.7); without one it fails instantly. Either way this is long enough.
await wait(HAS_KEY ? 4500 : 450);
s = await evaluate(PROBE);

check('a failing submission never reaches step 4', s.step, '3');
check('the enquiry queues rather than being lost', s.queue, [['repair', reference]]);
check('and the customer is told honestly, never a false success', s.failureShown, true);
check(
  WHATSAPP_NUMBER ? 'the WhatsApp fallback is offered' : 'no WhatsApp number, so no dead link',
  s.whatsappShown,
  Boolean(WHATSAPP_NUMBER),
);

if (HAS_KEY) {
  // Now let it through, and try again — the path a customer who completes a
  // real booking actually follows.
  await evaluate(`window.__succeed = true; window.__posts = 0; return 1;`);
  await evaluate(`document.querySelector('[data-repair-retry]').click(); return 1;`);
  await settle();
  s = await evaluate(PROBE);
  check('a confirmed send reaches step 4', [s.step, s.url], ['4', '?step=4']);
  check('the reference is shown back', s.shownReference, reference);
  check('the queue is emptied, so the client is not emailed twice', s.queue, null);
  check('the personal data is cleared, only the reference survives', [s.product, s.fault, s.slot], [
    '',
    '',
    null,
  ]);
  check('and submitted is set so a refresh keeps the confirmation', s.submitted, true);

  const printHref = await evaluate(`
    return document.querySelector('[data-repair-print]')?.getAttribute('href') ?? null;
  `);
  check(
    'the confirmation offers a print link carrying a real fragment',
    Boolean(printHref?.includes('/repairs/label#') && printHref.split('#')[1]?.length > 20),
    true,
  );

  await goto('/repairs?step=4');
  s = await evaluate(PROBE);
  check('a refresh on the confirmation keeps it', [s.step, s.shownReference], ['4', reference]);
} else {
  console.log('  --   PUBLIC_WEB3FORMS_KEY_REPAIRS is unset — the success path above is not exercised.');
}

await evaluate(`window.fetch = window.__realFetch; return 1;`);

// --- step routing ---------------------------------------------------------------

await reset();
await goto('/repairs?step=3');
s = await evaluate(PROBE);
check('?step=3 with nothing done yet clamps back to step 1', s.step, '1');

await goto('/repairs?step=4');
s = await evaluate(PROBE);
check('?step=4 cannot forge a confirmation', s.step, '1');

await goto('/repairs?category=tv');
await settle();
s = await evaluate(PROBE);
check('a category deep link is recorded without forcing a step', [s.step, s.category], ['1', 'tv']);

await reset();
await goto('/repairs?category=not-a-real-category');
s = await evaluate(PROBE);
check('an unrecognised category is ignored rather than trusted', s.category, null);

// --- the printable label, reached directly ---------------------------------------
//
// Reaching step 4 for real needs a configured repairs key, which this build
// does not have — so the label page is verified directly, against a link
// built the same way repair.ts builds one.

// Encoded by hand here, matching label.ts's wire format exactly (version 1,
// a flat array in field order) \u2014 this proves the label page decodes a link
// built the way the wire format is documented, independent of repair.ts's
// own encoder, which is the more useful check for a format two modules share.
const labelHash = await evaluate(`
  const wire = [
    1,
    'REP-4CDEF',
    'Jane Begley',
    '07700 900123',
    'jane@example.co.uk',
    'Samsung 55" OLED television',
    'No picture, standby light on',
    'Monday 21 September \u2014 Morning',
  ];
  const bytes = new TextEncoder().encode(JSON.stringify(wire));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
`);

await send('Page.navigate', { url: `${BASE}/repairs/label#${labelHash}` });
await settle();
const labelState = await evaluate(`
  return {
    shown: !document.querySelector('[data-label-root]')?.hidden,
    errorShown: !document.querySelector('[data-label-error]')?.hidden,
    reference: document.querySelector('[data-label-reference]')?.textContent,
    name: document.querySelector('[data-label-name]')?.textContent,
    fault: document.querySelector('[data-label-fault]')?.textContent,
    dropoff: document.querySelector('[data-label-dropoff]')?.textContent,
  };
`);
check('a well-formed link renders the slip', labelState.shown, true);
check('with the reference decoded from the fragment', labelState.reference, 'REP-4CDEF');
check('and the fault description carried through', labelState.fault, 'No picture, standby light on');
check('and the chosen drop-off slot shown', labelState.dropoff, 'Monday 21 September \u2014 Morning');

await send('Page.navigate', { url: `${BASE}/repairs/label` });
await settle();
const emptyLabel = await evaluate(`
  return {
    shown: !document.querySelector('[data-label-root]')?.hidden,
    errorShown: !document.querySelector('[data-label-error]')?.hidden,
  };
`);
check('a link with no fragment shows the "incomplete link" message, not a blank slip', emptyLabel, {
  shown: false,
  errorShown: true,
});

await send('Page.navigate', { url: `${BASE}/repairs/label#garbage-not-base64` });
await settle();
const garbageLabel = await evaluate(`
  return !document.querySelector('[data-label-error]')?.hidden;
`);
check('garbage in the fragment fails visibly rather than throwing', garbageLabel, true);

// --- console hygiene -------------------------------------------------------------

check('the repair booking logs no console errors', consoleErrors, []);

// --- summary -----------------------------------------------------------------

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);

/*
 * End-to-end wizard test (CLAUDE.md 12: "test the wizard end to end after
 * every change to it").
 *
 * Drives a real Chrome or Edge over the DevTools Protocol. No test framework
 * and no browser-automation package: Node's built-in WebSocket is enough, and
 * CLAUDE.md 2.8 asks for 30 lines over a dependency. What this cannot do is
 * verify iOS Safari, which is where the clipboard behaviour in Phase 4 has to
 * be checked by hand on a real device (CLAUDE.md 10.3).
 *
 *   npm run dev          # in one terminal
 *   npm run test:e2e     # in another
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import COPY from '../src/data/copy.json' with { type: 'json' };
import SITE from '../src/data/site.json' with { type: 'json' };

/*
 * The delivery path can only be exercised when the build has a form access
 * key: with none, `postEnquiry` refuses to post at all, which is the correct
 * behaviour for an unconfigured build (CLAUDE.md 8.7) but leaves nothing to
 * intercept. Any non-empty value in .env is enough — every request is stubbed,
 * so nothing reaches the client's inbox. Restart the dev server after adding it.
 */
const HAS_KEY = /^PUBLIC_WEB3FORMS_KEY=.+$/m.test(
  existsSync('.env') ? readFileSync('.env', 'utf8') : '',
);
const WHATSAPP_NUMBER = SITE.contact.whatsapp.replace(/\D/g, '');

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const PORT = 9333;

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

const profile = mkdtempSync(join(tmpdir(), 'wizard-e2e-'));
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
/** "No console errors" is part of the definition of done (CLAUDE.md 12). */
const consoleErrors = [];
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(message.params.args.map((arg) => arg.description ?? arg.value).join(' '));
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

/*
 * A fixed sleep after navigating was flaky: the dev server compiles TypeScript
 * on demand, so the wizard's listeners can attach well after the markup is
 * parsed, and a click sent in between silently does nothing.
 *
 * Two signals are needed, and both matter. `window.__stale` proves the old
 * document has gone — without it the poll answers from the page we are
 * navigating away from. Then `[data-wizard][data-ready]`, set at the end of
 * initWizard, proves this document's listeners are attached. `history.state`
 * looks like it would do the job and does not: a reload restores it, so it is
 * already set before any of our code runs.
 */
async function goto(path) {
  await evaluate('window.__stale = true; return 1;').catch(() => {});
  await send('Page.navigate', { url: `${BASE}${path}` });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(`
      if (window.__stale) return 'old-document';
      if (document.readyState === 'loading') return 'parsing';
      const wizard = document.querySelector('[data-wizard]');
      if (!wizard) return 'ready';
      return wizard.dataset.ready === 'true' ? 'ready' : 'initialising';
    `).catch(() => 'navigating');

    if (state === 'ready') return;
    await wait(100);
  }
  throw new Error(`the wizard never initialised at ${path}`);
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
    try { return JSON.parse(localStorage.getItem('enquiry:v1')); } catch { return 'threw'; }
  })();
  const queued = (() => {
    try { return JSON.parse(localStorage.getItem('pending-enquiry')); } catch { return 'threw'; }
  })();
  return {
    step: visible.join(',') || 'none',
    url: location.search || '(none)',
    label: document.querySelector('[data-progress-label]')?.textContent,
    tray: document.querySelectorAll('[data-tray-list] li').length,
    brand: document.querySelector('[data-brand-name]')?.textContent,
    continueDisabled: document.querySelector('[data-continue-details]')?.disabled,
    resumeShown: !document.querySelector('[data-resume]')?.hidden,
    items: stored?.items?.length ?? null,
    reference: stored?.reference ?? null,
    draft: stored?.draftBrandSlug ?? null,
    submitted: stored?.submitted ?? null,
    contactName: stored?.contact?.name ?? null,
    shownReference: document.querySelector('[data-reference]')?.textContent,
    failureShown: !document.querySelector('[data-submit-failure]')?.hidden,
    failureHeading: document.querySelector('[data-failure-heading]')?.textContent,
    whatsappShown: !document.querySelector('[data-whatsapp-fallback]')?.hidden,
    queue: Array.isArray(queued) ? queued.map((entry) => entry.reference) : queued,
    posts: window.__posts ?? 0,
  };
`;

const setFilter = (value) => evaluate(`
  const input = document.querySelector('[data-brand-filter]');
  input.value = ${JSON.stringify(value)};
  input.dispatchEvent(new Event('input'));
  return 1;
`);

/** Clicks a brand without letting the real new tab open in the harness. */
const clickBrand = (slug) => evaluate(`
  const card = document.querySelector('[data-brand-card][data-slug="${slug}"]');
  card.removeAttribute('target');
  card.addEventListener('click', (e) => e.preventDefault(), { once: true });
  card.click();
  return 1;
`).then(settle);

const addItem = (value) => evaluate(`
  const form = document.querySelector('[data-add-item]');
  form.querySelector('input[name=product]').value = ${JSON.stringify(value)};
  form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  return 1;
`).then(settle);

const reset = () => evaluate('localStorage.clear(); return 1;');

await send('Page.enable');
await send('Runtime.enable');

// --- a cold visitor ---------------------------------------------------------
await goto('/order');
await reset();
await goto('/order');
let s = await evaluate(PROBE);
check('cold load lands on step 1', [s.step, s.url], ['1', '(none)']);
check('progress reads step 1 of 3', s.label, 'Step 1 of 3 — Choose a brand');
check('no resume banner on a cold load', s.resumeShown, false);

// --- the filter -------------------------------------------------------------
await setFilter('mrph');
s = await evaluate(`
  return [...document.querySelectorAll('[data-brand-card]')]
    .filter((c) => !c.hidden).map((c) => c.dataset.name);
`);
check('dropped consonants still find a brand', s, ['Morphy Richards']);

await setFilter('');
s = await evaluate(`return document.querySelector('[data-brand-status]').textContent;`);
check('the count ignores the featured row duplicates', s, '65 brands shown.');

await setFilter('zzzz');
s = await evaluate(`return !document.querySelector('[data-brand-empty]').hidden;`);
check('a dead-end search offers a way forward', s, true);
await setFilter('');

// --- choosing a brand -------------------------------------------------------
await clickBrand('miele');
s = await evaluate(PROBE);
check('choosing a brand advances to step 2', [s.step, s.url], ['2', '?step=2']);
check('step 2 confirms the brand', s.brand, 'Miele');
check('the brand survives as a draft before any item exists', s.draft, 'miele');
check('continue is closed off with an empty tray', s.continueDisabled, true);

// --- adding appliances ------------------------------------------------------
await addItem('https://www.miele.co.uk/ovens/h7860bpx');
s = await evaluate(PROBE);
check('the appliance reaches the tray', [s.tray, s.items], [1, 1]);
check('continue opens once there is something to quote', s.continueDisabled, false);
check('a reference is minted on the first item', /^ENQ-[34679ACDEFGHJKMNPQRTUVWXY]{5}$/.test(s.reference), true);
const reference = s.reference;

await addItem('H7860BPX');
await addItem('KM7564FL');
s = await evaluate(PROBE);
check('three appliances in the tray', [s.tray, s.items], [3, 3]);
check('the reference is stable as items are added', s.reference, reference);

// --- parsing and correction --------------------------------------------------
s = await evaluate(`
  return [...document.querySelectorAll('[data-tray-list] li p:first-child')].map((p) => p.textContent);
`);
check('pasted links are echoed back as readable products', s, [
  'Ovens — H7860BPX',
  'H7860BPX',
  'KM7564FL',
]);

await evaluate(`
  const input = document.querySelector('input[name=product]');
  input.value = 'https://www.aeg.co.uk/kitchen/cooking/hobs/induction-hob/ikx64301cb/';
  input.dispatchEvent(new Event('input'));
  return 1;
`);
s = await evaluate(`return document.querySelector('[data-echo]').textContent;`);
check('the echo confirms before committing', s, 'Got it — Induction Hob — IKX64301CB. Add it if that looks right.');

await evaluate(`
  const input = document.querySelector('input[name=product]');
  input.value = 'a quiet integrated dishwasher';
  input.dispatchEvent(new Event('input'));
  return 1;
`);
s = await evaluate(`return document.querySelector('[data-echo]').textContent;`);
check('unparseable input is accepted, not rejected', s, 'We will send this across as you have written it.');
await evaluate(`
  const input = document.querySelector('input[name=product]');
  input.value = ''; input.dispatchEvent(new Event('input'));
  return 1;
`);

// A paste anywhere on the page lands in the field without any permission.
await evaluate(`
  const data = new DataTransfer();
  data.setData('text/plain', 'https://www.smeguk.com/products/retro-fridge-freezer');
  document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  return 1;
`);
s = await evaluate(`return {
  value: document.querySelector('input[name=product]').value,
  echo: document.querySelector('[data-echo]').textContent,
};`);
check('a paste outside the field still lands in it', s.value, 'https://www.smeguk.com/products/retro-fridge-freezer');
check('and is echoed immediately', s.echo, 'Got it — Retro Fridge Freezer. Add it if that looks right.');
await evaluate(`
  const input = document.querySelector('input[name=product]');
  input.value = ''; input.dispatchEvent(new Event('input'));
  return 1;
`);

// "Not right?" — a hand correction wins over the parse.
await evaluate(`
  document.querySelector('[data-tray-list] button[aria-label^="Correct"]').click();
  return 1;
`);
await evaluate(`
  const form = document.querySelector('[data-tray-list] form');
  form.querySelector('input').value = 'BPX555061M';
  form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  return 1;
`);
await settle();
s = await evaluate(`
  return document.querySelector('[data-tray-list] li p:first-child').textContent;
`);
check('a hand correction replaces the parsed model', s, 'BPX555061M');

// The free-text path must never be parsed into a model.
await evaluate(`
  const form = document.querySelector('[data-add-description]');
  form.querySelector('textarea').value = 'H7860BPX but in stainless steel';
  form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  return 1;
`);
await settle();
s = await evaluate(`
  const stored = JSON.parse(localStorage.getItem('enquiry:v1'));
  const last = stored.items[stored.items.length - 1];
  return { type: last.inputType, model: last.parsedModel, raw: last.rawInput };
`);
check('a description stays a description', [s.type, s.model], ['description', null]);
check('and is kept verbatim', s.raw, 'H7860BPX but in stainless steel');

await evaluate(`document.querySelectorAll('[data-tray-list] button[aria-label^="Remove"]')[3].click(); return 1;`);
await settle();

// --- an enquiry saved before the parser existed ------------------------------
await evaluate(`
  const stored = JSON.parse(localStorage.getItem('enquiry:v1'));
  stored.items = [{
    id: 'legacy', brandSlug: 'aeg',
    rawInput: 'https://www.aeg.co.uk/kitchen/cooking/ovens/oven/bpx535061m/',
    inputType: 'url', parsedModel: null, parsedName: null, note: '', addedAt: Date.now(),
  }, {
    id: 'legacy-free', brandSlug: null,
    rawInput: 'something quiet for a small kitchen',
    inputType: 'description', parsedModel: null, parsedName: null, note: '', addedAt: Date.now(),
  }];
  localStorage.setItem('enquiry:v1', JSON.stringify(stored));
  return 1;
`);
await goto('/order?step=2');
s = await evaluate(`
  return [...document.querySelectorAll('[data-tray-list] li p:first-child')].map((p) => p.textContent);
`);
check('a stored item with no parse is re-parsed on load', s[0], 'Oven — BPX535061M');
check('a stored description is left as the customer wrote it', s[1], 'something quiet for a small kitchen');

await reset();
await goto('/order');
await clickBrand('miele');
await addItem('https://www.miele.co.uk/ovens/h7860bpx');
await addItem('H7860BPX');
await addItem('KM7564FL');

// --- refresh mid-flow -------------------------------------------------------
await goto('/order');
s = await evaluate(PROBE);
check('a refresh restores the step', s.step, '2');
check('a refresh restores every item', s.tray, 3);
check('the returning visitor is offered their enquiry back', s.resumeShown, true);

// --- back button ------------------------------------------------------------
await evaluate(`document.querySelector('[data-action="go-step"][data-step="3"]').click(); return 1;`);
s = await evaluate(PROBE);
check('continue moves to step 3', [s.step, s.url], ['3', '?step=3']);

await evaluate('history.back(); return 1;');
await wait(400);
s = await evaluate(PROBE);
check('back returns to step 2 rather than leaving the site', s.step, '2');

// --- removing ---------------------------------------------------------------
await evaluate(`document.querySelector('[data-tray-list] button[aria-label^="Remove"]').click(); return 1;`);
await settle();
s = await evaluate(PROBE);
check('removing an item updates tray and storage together', [s.tray, s.items], [2, 2]);

// --- step 3: the details sequence --------------------------------------------
await reset();
await goto('/order');
await clickBrand('miele');
await addItem('H7860BPX');
await evaluate(`document.querySelector('[data-continue-details]').click(); return 1;`);

const answer = (value) => evaluate(`
  const form = document.querySelector('[data-detail-form]');
  const select = form.querySelector('[data-detail-select]');
  const control = select.hidden ? form.querySelector('[data-detail-input]') : select;
  control.value = ${JSON.stringify(value)};
  form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  return 1;
`).then(settle);

const detailState = `
  const form = document.querySelector('[data-detail-form]');
  return {
    question: document.querySelector('[data-detail-question]').textContent,
    label: document.querySelector('[data-detail-label]').textContent,
    error: document.querySelector('[data-detail-error]').textContent,
    answered: [...document.querySelectorAll('[data-transcript] li')].map((li) => li.dataset.field),
    formHidden: form.hidden,
    reviewHidden: document.querySelector('[data-review]').hidden,
    submitDisabled: document.querySelector('[data-submit-enquiry]').disabled,
  };
`;

s = await evaluate(detailState);
check('step 3 opens on the first question', s.question, 'What name should we put on the quote?');

await answer('');
s = await evaluate(detailState);
check('an empty answer is refused with a reason', s.error, 'Please enter your name.');
check('and does not advance', s.answered, []);

await answer('Jane Doe');
await answer('not a phone number');
s = await evaluate(detailState);
check('a bad phone number is caught', s.error, 'Please use only numbers, spaces and + ( ) -');

await answer('+44 7700 900123');
await answer('jane@example');
s = await evaluate(detailState);
check('a malformed email is caught', s.error, 'That does not look like an email address.');

await answer('jane@example.co.uk');
s = await evaluate(detailState);
check('country is asked before postcode', s.question, 'Which country are we delivering to?');

await answer('GB');
s = await evaluate(detailState);
check('the postcode label follows the country', s.label, 'Postcode');

await answer('AB');
s = await evaluate(detailState);
check('an implausible postcode is caught', s.error, 'That looks too short — please check it.');

// The point of 8.6: no country pattern, so a Dutch postcode must be accepted
// even though the customer said GB.
// Postcode confirmation is advisory. Stub the API so the suite never depends
// on the network, and prove both the good and the failing path.
await evaluate(`
  window.__realFetch = window.fetch;
  window.fetch = (url, init) => String(url).includes('postcodes.io')
    ? Promise.resolve(new Response(JSON.stringify({
        result: { postcode: 'WD17 1AA', admin_district: 'Watford', region: 'East of England' },
      }), { status: 200 }))
    : window.__realFetch(url, init);
  return 1;
`);
await evaluate(`
  const input = document.querySelector('[data-detail-input]');
  input.value = 'wd171aa'; input.dispatchEvent(new Event('input'));
  return 1;
`);
await wait(900);
s = await evaluate(`return document.querySelector('[data-detail-hint]').textContent;`);
check('a recognised postcode is confirmed back', s, 'WD17 1AA — Watford, East of England');

await evaluate(`
  const form = document.querySelector('[data-detail-form]');
  form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  return 1;
`);
await settle();
s = await evaluate(`return JSON.parse(localStorage.getItem('enquiry:v1')).contact.postcode;`);
check('the canonical spacing is stored', s, 'WD17 1AA');

await evaluate(`
  document.querySelector('[data-transcript] button[data-edit="postcode"]').click();
  return 1;
`);
await evaluate(`
  window.fetch = () => Promise.reject(new Error('offline'));
  const input = document.querySelector('[data-detail-input]');
  input.value = 'ZZ99 9ZZ'; input.dispatchEvent(new Event('input'));
  return 1;
`);
await wait(900);
s = await evaluate(`return {
  hint: document.querySelector('[data-detail-hint]').textContent,
  error: document.querySelector('[data-detail-error]').textContent,
};`);
check('an unconfirmable postcode is reassurance, not an error', s.hint, 'We could not confirm that postcode, but we will send it as you typed it.');
check('and raises no validation error', s.error, '');

await evaluate(`
  const form = document.querySelector('[data-detail-form]');
  form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  return 1;
`);
await settle();
s = await evaluate(`return JSON.parse(localStorage.getItem('enquiry:v1')).contact.postcode;`);
check('an unconfirmed postcode still goes through, as typed', s, 'ZZ99 9ZZ');

await evaluate(`window.fetch = window.__realFetch; return 1;`);
await evaluate(`
  document.querySelector('[data-transcript] button[data-edit="postcode"]').click();
  return 1;
`);
await answer('1234 ab');
s = await evaluate(detailState);
check('no postcode is rejected for failing a country pattern', s.error, '');
check('all five questions answered', s.answered, ['name', 'phone', 'email', 'country', 'postcode']);
check('the question form gives way to the review', [s.formHidden, s.reviewHidden], [true, false]);
check('submit is gated on consent', s.submitDisabled, true);

s = await evaluate(`
  const stored = JSON.parse(localStorage.getItem('enquiry:v1'));
  return stored.contact;
`);
check('the postcode is uppercased and collapsed, not reformatted', s.postcode, '1234 AB');
check('contact details are persisted', [s.name, s.email, s.country], ['Jane Doe', 'jane@example.co.uk', 'GB']);

await evaluate(`
  const box = document.querySelector('[data-consent]');
  box.checked = true; box.dispatchEvent(new Event('change'));
  return 1;
`);
await settle();
s = await evaluate(detailState);
check('ticking consent unlocks submit', s.submitDisabled, false);

// Editing an earlier answer reopens exactly that question.
await evaluate(`
  document.querySelector('[data-transcript] button[data-edit="email"]').click();
  return 1;
`);
s = await evaluate(detailState);
check('editing reopens the chosen question', s.question, 'Where should we send the quote?');
check('and rolls the transcript back to it', s.answered, ['name', 'phone']);

await answer('jane.doe@example.co.uk');
await answer('GB');
await answer('SW1A 1AA');
s = await evaluate(`
  return JSON.parse(localStorage.getItem('enquiry:v1')).contact.email;
`);
check('the corrected answer is kept', s, 'jane.doe@example.co.uk');

await goto('/order?step=3');
s = await evaluate(detailState);
check('a refresh restores every answer', s.answered, ['name', 'phone', 'email', 'country', 'postcode']);

s = await evaluate(`
  const res = await fetch('/privacy');
  return res.status;
`);
check('the consent link goes somewhere real', s, 200);

// --- submission (CLAUDE.md 8.7) ---------------------------------------------
// The suite is sitting on a complete step 3: one appliance, five answers,
// consent ticked. Everything below drives the send itself.

const submit = () => evaluate(`document.querySelector('[data-submit-enquiry]').click(); return 1;`);
const failureCopy = COPY.order.submit;

s = await evaluate(PROBE);
const sendReference = s.reference;

// A bot ticking the hidden box is refused, and nothing is posted or queued.
await evaluate(`
  const box = document.querySelector('[data-honeypot]');
  box.checked = true;
  return 1;
`);
await submit();
await settle();
s = await evaluate(PROBE);
check('a tripped honeypot sends nothing', [s.step, s.posts, s.queue], ['3', 0, null]);
check('and says so rather than failing silently', s.failureHeading, failureCopy.blockedHeading);
await evaluate(`document.querySelector('[data-honeypot]').checked = false; return 1;`);

// The failure that matters: submitting with no network. Nothing may be lost,
// and nothing may look like a success (rule 2.4).
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

await submit();
// One attempt plus two retries, backing off 800ms then 2400ms (CLAUDE.md 8.7).
await wait(4500);
s = await evaluate(PROBE);
check('an offline submission never reaches step 4', s.step, '3');
check('the customer is told the truth', [s.failureShown, s.failureHeading], [true, failureCopy.failureHeading]);
check('the enquiry is queued on the device', s.queue, [sendReference]);
check('and the enquiry itself is left intact', [s.items, s.submitted], [1, false]);
if (HAS_KEY) check('the post was retried twice before giving up', s.posts, 3);

// The WhatsApp fallback is the second route out, and is withheld rather than
// rendered dead while the number is missing (MISSING-ASSETS.md 4).
check(
  WHATSAPP_NUMBER ? 'the WhatsApp fallback is offered' : 'no WhatsApp number, so no dead link',
  s.whatsappShown,
  Boolean(WHATSAPP_NUMBER),
);

if (HAS_KEY) {
  // Try again, this time with the endpoint answering.
  await evaluate(`window.__succeed = true; window.__posts = 0; return 1;`);
  await evaluate(`document.querySelector('[data-submit-retry]').click(); return 1;`);
  await settle();
  s = await evaluate(PROBE);
  check('a confirmed send reaches step 4', [s.step, s.url], ['4', '?step=4']);
  check('the reference is shown back', s.shownReference, sendReference);
  check('the queue is emptied, so the client is not emailed twice', s.queue, null);
  check('the personal data is cleared', [s.items, s.contactName], [0, '']);
  check('and the reference survives to identify the enquiry', [s.submitted, s.reference], [true, sendReference]);

  await goto('/order?step=4');
  s = await evaluate(PROBE);
  check('a refresh on the confirmation keeps it', [s.step, s.shownReference], ['4', sendReference]);

  // An enquiry that failed, then delivered from the queue on the next load:
  // the customer never saw a confirmation, so finish the job for them.
  await reset();
  await goto('/order');
  await clickBrand('miele');
  await addItem('H7860BPX');
  await evaluate(`document.querySelector('[data-continue-details]').click(); return 1;`);
  for (const value of ['Jane Doe', '+44 7700 900123', 'jane@example.co.uk', 'GB', 'SW1A 1AA']) {
    await answer(value);
  }
  await evaluate(`
    const box = document.querySelector('[data-consent]');
    box.checked = true; box.dispatchEvent(new Event('change'));
    return 1;
  `);
  await settle();
  s = await evaluate(PROBE);
  const stranded = s.reference;

  await evaluate(`
    localStorage.setItem('pending-enquiry', JSON.stringify([{
      reference: '${stranded}',
      payload: { reference: '${stranded}', subject: 'Enquiry ${stranded}' },
      queuedAt: Date.now(),
      attempts: 1,
    }]));
    return 1;
  `);

  const stub = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__posts = 0;
      const real = window.fetch;
      window.fetch = (url, init) => {
        if (!String(url).includes('web3forms')) return real(url, init);
        window.__posts += 1;
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      };
    `,
  });

  await goto('/order?step=3');
  await settle();
  s = await evaluate(PROBE);
  check('a queued enquiry is retried on the next load', [s.posts, s.queue], [1, null]);
  check('and the customer finally gets their confirmation', s.step, '4');
  check('with the reference it was queued under', s.shownReference, stranded);

  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: stub.result.identifier });
} else {
  console.log('  note  delivery-path checks skipped — set PUBLIC_WEB3FORMS_KEY in .env');
}

await evaluate(`if (window.__realFetch) window.fetch = window.__realFetch; return 1;`);

// --- deep links -------------------------------------------------------------
await reset();
await goto('/order');
await clickBrand('miele');
await addItem('https://www.miele.co.uk/ovens/h7860bpx');

await goto('/order?step=4');
s = await evaluate(PROBE);
check('?step=4 cannot forge a confirmation', [s.step, s.url], ['3', '?step=3']);

await reset();
await goto('/order?step=3');
s = await evaluate(PROBE);
check('?step=3 with nothing to quote clamps back', [s.step, s.url], ['2', '?step=2']);

await reset();
await goto('/order?brand=miele');
s = await evaluate(PROBE);
check('?brand= enters at step 2 with the brand set', [s.step, s.brand], ['2', 'Miele']);

await goto('/order?brand=notarealbrand');
s = await evaluate(PROBE);
check('an unknown brand slug is ignored', s.brand, '');

// --- starting again ---------------------------------------------------------
await reset();
await goto('/order');
await clickBrand('smeg');
await addItem('SF6400TVX');
await goto('/order');
await evaluate(`document.querySelector('[data-action="resume-discard"]').click(); return 1;`);
await settle();
s = await evaluate(PROBE);
check('discarding clears storage and returns to step 1', [s.step, s.items], ['1', null]);

// --- keyboard ---------------------------------------------------------------
await goto('/order');
s = await evaluate(`
  const focusable = [...document.querySelectorAll(
    'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
  )].filter((el) => el.checkVisibility());
  return focusable.filter((el) => el.closest('section[data-step-panel][hidden]')).length;
`);
check('a hidden step traps nothing in the tab order', s, 0);

// --- the home page's way in -------------------------------------------------
// Not the wizard, but these two are rules about it: the brand strip must feed
// the wizard rather than leave the site (CLAUDE.md 7), and the home page's JS
// budget is the nav toggle and the WhatsApp button, nothing more (10.2).
await goto('/');
s = await evaluate(`
  return {
    brandLinks: [...document.querySelectorAll('#brands ul a')].map((a) => a.getAttribute('href')),
    // Dev-server injections (Vite client, dev toolbar) are not ours; project
    // modules are. Stylesheets arrive as scripts in dev, hence the .css filter.
    own: [...document.scripts]
      .map((script) => script.src)
      .filter((src) => src.includes('/src/') || src.includes('/_astro/'))
      .filter((src) => !src.includes('.css')),
    headings: [...document.querySelectorAll('h1')].length,
  };
`);
check('the featured brands enter the wizard, never the manufacturer', [
  s.brandLinks.length > 0,
  s.brandLinks.every((href) => href.startsWith('/order?brand=')),
], [true, true]);
check('the home page ships only the nav toggle', [s.own.length, /Nav\.astro/.test(s.own[0] ?? '')], [1, true]);
check('one h1 per page', s.headings, 1);

// --- analytics events (CLAUDE.md 8.10) --------------------------------------
// No provider script is loaded in this build, so `track` is a no-op against a
// missing global. Standing in a recorder proves the wiring underneath it: the
// events fire, in order, carrying the slug and step numbers the client's
// funnel needs — and carrying nothing personal (rule 2.7).
const recorder = await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__events = [];
    window.plausible = (event, options) => window.__events.push([event, options?.props ?? null]);
  `,
});

await goto('/order');
await reset();
await goto('/order');
await clickBrand('miele');

await evaluate(`
  const data = new DataTransfer();
  data.setData('text/plain', 'https://www.miele.co.uk/ovens/h7860bpx');
  document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  return 1;
`);
await evaluate(`
  const input = document.querySelector('input[name=product]');
  input.value = ''; input.dispatchEvent(new Event('input'));
  return 1;
`);
await addItem('H7860BPX');
await evaluate(`document.querySelector('[data-continue-details]').click(); return 1;`);
await answer('');

s = await evaluate(`return window.__events.map(([name]) => name);`);
check('the funnel is recorded in order', s, [
  'step_view',
  'brand_click',
  'step_view',
  'paste_success',
  'manual_entry',
  'step_view',
  'validation_error',
]);

s = await evaluate(`
  const find = (name) => window.__events.find(([event]) => event === name)?.[1] ?? null;
  return {
    brand: find('brand_click'),
    paste: find('paste_success'),
    invalid: find('validation_error'),
    entry: find('step_view'),
  };
`);
check('the brand click names the brand', s.brand, { brand: 'miele' });
check('the paste records which of the three routes worked', s.paste, { route: 'document' });
check('a validation error names the field, never the value', s.invalid, { field: 'name' });
check('a step view is just a number', s.entry, { step: 1 });

s = await evaluate(`
  const text = JSON.stringify(window.__events);
  return ['H7860BPX', 'miele.co.uk', 'Jane'].filter((secret) => text.includes(secret));
`);
check('no enquiry content and no personal data reaches a property', s, []);

await evaluate(`document.querySelector('[data-action="go-step"][data-step="2"]').click(); return 1;`);
await evaluate(`document.querySelector('[data-tray-list] button[aria-label^="Remove"]').click(); return 1;`);
await settle();
s = await evaluate(`return window.__events.filter(([e]) => e === 'item_removed').map(([, p]) => p);`);
check('removals are counted', s, [{ remaining: 0 }]);

await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: recorder.result.identifier });

// --- the rest of the routes -------------------------------------------------
s = await evaluate(`
  const [notFound, robots, sitemap] = await Promise.all([
    fetch('/no-such-page'), fetch('/robots.txt'), fetch('/sitemap.xml'),
  ]);
  return {
    notFound: notFound.status,
    robots: (await robots.text()).startsWith('User-agent: *'),
    // Absent until the live domain is set, rather than emitted against a guess.
    sitemap: sitemap.status,
  };
`);
check('an unknown page 404s rather than silently rendering', s.notFound, 404);
check('robots.txt is served', s.robots, true);
check('no sitemap is published while the domain is unknown', s.sitemap, 404);

await goto('/no-such-page');
s = await evaluate(`return {
  heading: document.querySelector('h1')?.textContent,
  robots: document.querySelector('meta[name=robots]')?.content,
  quote: document.querySelector('a[href="/order"]') !== null,
};`);
check('the 404 offers the enquiry rather than dead-ending', s.quote, true);
check('and keeps itself out of the index', s.robots, 'noindex, follow');

// --- accessibility the audits cannot reach (CLAUDE.md 10.1) -----------------
// Lighthouse scores the markup as it loads. None of what follows exists at
// load: it is what happens as the wizard moves, which is the part a screen
// reader user actually has to get through.
await reset();
await goto('/order');

s = await evaluate(`
  const named = (el) => {
    if (el.getAttribute('aria-label')?.trim()) return true;
    if (el.getAttribute('aria-labelledby')) return true;
    if (el.labels?.length) return true;
    if (el.title?.trim()) return true;
    return (el.textContent ?? '').trim() !== '';
  };
  const visible = [...document.querySelectorAll('a[href], button, input, select, textarea')]
    .filter((el) => el.checkVisibility() && !el.closest('[data-step-panel][hidden]'));
  return visible.filter((el) => !named(el)).map((el) => el.tagName + '.' + el.className.slice(0, 30));
`);
check('every control on step 1 has an accessible name', s, []);

await clickBrand('miele');
s = await evaluate(`
  const active = document.activeElement;
  return {
    tag: active?.tagName,
    isHeading: active?.hasAttribute('data-step-heading') ?? false,
    step: active?.closest('[data-step-panel]')?.dataset.stepPanel,
    announced: document.querySelector('[data-announce]')?.textContent,
  };
`);
check('advancing moves focus to the new step heading', [s.isHeading, s.step], [true, '2']);
check('and announces where they are', s.announced, 'Step 2 of 3. Add your appliance');

s = await evaluate(`
  const named = (el) => el.getAttribute('aria-label')?.trim() || el.labels?.length ||
    (el.textContent ?? '').trim() !== '';
  const visible = [...document.querySelectorAll('a[href], button, input, select, textarea')]
    .filter((el) => el.checkVisibility() && !el.closest('[data-step-panel][hidden]'));
  return visible.filter((el) => !named(el)).length;
`);
check('every control on step 2 has an accessible name', s, 0);

await addItem('H7860BPX');
await evaluate(`document.querySelector('[data-continue-details]').click(); return 1;`);
s = await evaluate(`
  const input = document.querySelector('[data-detail-input]');
  return {
    labelled: input.labels.length > 0 && document.querySelector('[data-detail-label]').textContent.trim() !== '',
    describedBy: input.getAttribute('aria-describedby'),
    errorLive: document.getElementById(input.getAttribute('aria-describedby'))?.getAttribute('role'),
    transcriptLive: document.querySelector('[data-transcript]')?.getAttribute('aria-live'),
  };
`);
check('the question field has a real label', s.labelled, true);
check('and its error is linked, not just adjacent', [s.describedBy, s.errorLive], ['detail-error', 'alert']);
check('answered questions are announced as they are added', s.transcriptLive, 'polite');

// A failure the customer cannot see is a failure they cannot fix.
await evaluate(`
  const box = document.querySelector('[data-honeypot]');
  box.checked = true;
  return 1;
`);
for (const value of ['Jane Doe', '+44 7700 900123', 'jane@example.co.uk', 'GB', 'SW1A 1AA']) {
  await answer(value);
}
await evaluate(`
  const consent = document.querySelector('[data-consent]');
  consent.checked = true; consent.dispatchEvent(new Event('change'));
  return 1;
`);
await settle();
await evaluate(`document.querySelector('[data-submit-enquiry]').click(); return 1;`);
await settle();
s = await evaluate(`
  return {
    focused: document.activeElement?.hasAttribute('data-failure-heading') ?? false,
    heading: document.activeElement?.textContent,
  };
`);
check('a failed submission moves focus to the reason', s.focused, true);

check('the wizard logs no console errors', consoleErrors, []);

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
socket.close();
process.exit(failed ? 1 : 0);

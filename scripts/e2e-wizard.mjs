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
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
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

async function goto(path) {
  await send('Page.navigate', { url: `${BASE}${path}` });
  await wait(900);
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

// --- deep links -------------------------------------------------------------
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

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
socket.close();
process.exit(failed ? 1 : 0);

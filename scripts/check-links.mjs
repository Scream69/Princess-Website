/*
 * Brand link-rot checker (CLAUDE.md 8.9). Run quarterly:
 *
 *   npm run check:links
 *
 * A dead brand card is a dead end in the middle of the funnel — the customer
 * taps it, nothing opens, and the one thing this site exists to do (bring
 * back a model number) cannot happen. Manufacturer URLs rot quietly, so this
 * is a maintenance task rather than a test.
 *
 * The hard-won part is what counts as a failure. On the first manual run,
 * roughly a sixth of the list — Miele, Dyson, Samsung, Sony, Sebo, Asko,
 * Hisense, Loewe, Rangemaster, Numatic — answered 403 to a scripted HEAD, and
 * Russell Hobbs answered 405. Every one of them loads perfectly in a browser:
 * that is bot protection, not link rot. A checker that cries wolf about a
 * sixth of the list gets ignored within a quarter, so 403, 405 and 429 are
 * reported as "reachable, blocked to scripts" and do not fail the run.
 *
 * Exit code 1 only for genuinely broken links, so this can be wired into
 * anything that cares about exit codes later.
 */
import { readFileSync } from 'node:fs';

const brands = JSON.parse(readFileSync(new URL('../src/data/brands.json', import.meta.url), 'utf8'));

const TIMEOUT_MS = 15_000;
/** Polite: manufacturer sites are not ours to hammer. */
const CONCURRENCY = 6;

/*
 * A real browser User-Agent. Not evasion — the request is honest about being
 * a HEAD to a public homepage — but a default `node` agent is refused by
 * enough CDNs to make the results meaningless.
 */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/140.0.0.0 Safari/537.36';

const HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
};

/** Reachable, but the site refuses scripted requests. Not a broken link. */
const BOT_PROTECTION = new Set([401, 403, 405, 406, 409, 429, 503]);

/*
 * A server that omits the intermediate certificate from its chain. Browsers
 * repair this themselves by fetching the missing certificate from the URL in
 * the leaf; Node does not, so the link is fine for customers and fails here.
 * Humax is the site that taught us this. Worth telling the client about, but
 * it is not link rot and must not read as a dead link.
 */
const CHAIN_INCOMPLETE = new Set(['UNABLE_TO_VERIFY_LEAF_SIGNATURE']);

/*
 * These, by contrast, stop a customer dead: every browser shows a full-page
 * interstitial before the site loads.
 */
const CERT_BROKEN = new Set([
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
]);

function fromError(brand, error) {
  const code = error.cause?.code ?? error.code ?? '';
  if (CHAIN_INCOMPLETE.has(code)) {
    return { brand, state: 'chain', detail: 'incomplete certificate chain, fine in a browser' };
  }
  if (CERT_BROKEN.has(code)) return { brand, state: 'broken', detail: `certificate: ${code}` };
  if (error.name === 'TimeoutError') return { brand, state: 'broken', detail: 'timed out' };
  return { brand, state: 'broken', detail: code || 'no response' };
}

async function request(url, method) {
  const response = await fetch(url, {
    method,
    headers: HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return response;
}

async function check(brand) {
  const { url } = brand;
  let response;

  try {
    response = await request(url, 'HEAD');
    // Plenty of sites route HEAD to a generic handler and answer 4xx to it
    // while serving GET perfectly well, so never conclude from HEAD alone.
    if (!response.ok) response = await request(url, 'GET');
  } catch {
    try {
      response = await request(url, 'GET');
    } catch (error) {
      return fromError(brand, error);
    }
  }

  const finalUrl = response.url || url;
  const moved = normalise(finalUrl) !== normalise(url);

  if (response.ok) {
    return moved
      ? { brand, state: 'moved', detail: `${response.status} → ${finalUrl}` }
      : { brand, state: 'ok', detail: String(response.status) };
  }
  if (BOT_PROTECTION.has(response.status)) {
    return { brand, state: 'blocked', detail: `${response.status} to scripts, fine in a browser` };
  }
  return { brand, state: 'broken', detail: `HTTP ${response.status}` };
}

/** Trailing slashes and http→https are not moves worth reporting. */
function normalise(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/$/, '')}`.toLowerCase();
  } catch {
    return url;
  }
}

async function pool(items, worker, limit) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]);
      }
    }),
  );
  return results;
}

// --- run --------------------------------------------------------------------

const active = brands.filter((brand) => brand.active);
const inactive = brands.filter((brand) => !brand.active);

console.log(`Checking ${active.length} active brand links (${inactive.length} inactive, skipped).\n`);

const results = await pool(active, check, CONCURRENCY);
const by = (state) => results.filter((result) => result.state === state);

const LABEL = {
  ok: '  ok  ',
  moved: ' moved',
  blocked: ' block',
  chain: '  tls ',
  broken: ' BROKE',
};

for (const result of results.sort((a, b) => a.brand.name.localeCompare(b.brand.name, 'en-GB'))) {
  if (result.state === 'ok') continue;
  console.log(`${LABEL[result.state]} ${result.brand.name.padEnd(20)} ${result.detail}`);
}

console.log(
  `\n${by('ok').length} ok · ${by('moved').length} redirected · ` +
    `${by('blocked').length} blocked to scripts · ${by('chain').length} certificate chain · ` +
    `${by('broken').length} broken`,
);

if (by('moved').length > 0) {
  console.log('\nRedirected links still work, but update brands.json so customers skip the hop.');
}
if (by('broken').length > 0) {
  console.log('\nBroken links must be fixed or the brand set "active": false — a card that opens');
  console.log('nothing is a dead end in the middle of the funnel (CLAUDE.md 5.1).');
}

process.exit(by('broken').length > 0 ? 1 : 0);

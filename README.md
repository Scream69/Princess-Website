# Appliance Enquiry Website

Two-page static site for a premium appliance retailer. The business does not
sell online: customers choose an appliance on the manufacturer's own website,
send us the model number, and receive a quote by email within 24 hours.

Read **[CLAUDE.md](./CLAUDE.md)** before changing anything. It is the project
constitution and the source of truth for architecture, ground rules and
quality budgets. **[MISSING-ASSETS.md](./MISSING-ASSETS.md)** tracks every
placeholder currently in the codebase and everything still needed from the
client.

## Stack

| Layer | Choice |
|---|---|
| Framework | Astro 7.3.1, `output: 'static'` |
| Styling | Tailwind CSS 4.3.3 via `@tailwindcss/vite` |
| Interactivity | Vanilla TypeScript, strict mode |
| Forms | Web3Forms (key in `.env`) |
| Analytics | Cookieless (Plausible or Umami) — no consent banner |

No UI component library, no framework runtime, no database, no server.

## Getting started

```sh
npm install
cp .env.example .env   # fill in once the client's keys are confirmed
npm run dev
```

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server on http://localhost:4321 |
| `npm run build` | Static build to `dist/` |
| `npm run preview` | Serve the built output |
| `npm run check` | Astro + TypeScript diagnostics |
| `npm test` | Unit tests — pure logic, no DOM |
| `npm run test:e2e` | Drives the wizard in real Chrome (needs `npm run dev` running) |
| `npm run check:links` | Brand link-rot checker (see Maintenance) |

## Design tokens

Tokens live in the `@theme` block at the top of `src/styles/global.css`.
Tailwind 4 is configured in CSS, not in a JS config file.

Do not put arbitrary hex values or magic numbers in components — add a token.

The current palette is a **placeholder**: warm neutrals with a single deep
green accent, pending the client's brand colours. All text pairings meet
WCAG AA.

## Build order

Phases, per CLAUDE.md 12. Each is committed working before the next begins.

- [x] 1. Scaffold, config, tokens, layout, nav, footer
- [ ] 2. `brands.json` + brand grid — **blocked** on authorised-dealer status
- [x] 3. Wizard state machine, URL routing, storage, step shells
- [x] 4. Step 2 — paste handling, parsing, tray, add-another loop
- [x] 5. Step 3 — chat-styled details, validation (**UK-only** until served countries confirmed)
- [x] 6. Submission, retry, queue, WhatsApp fallback, step 4 (**needs the form key and WhatsApp number** — see MISSING-ASSETS.md 4 and 5)
- [x] 7. Home page (**hero and about copy outstanding** — rendered as [AWAITING COPY] markers)
- [x] 8. Analytics, SEO, privacy page, 404 (**provider and domain outstanding** — both switched off until then)
- [x] 9. Accessibility and performance pass (**real iOS Safari and a screen-reader run still outstanding**)
- [ ] 10. Link checker, README, deployment

## Analytics

Cookieless, so there is no consent banner (CLAUDE.md 2.6). Set both
`PUBLIC_ANALYTICS_DOMAIN` and `PUBLIC_ANALYTICS_SRC` in `.env` to switch it on;
with either blank no provider script is requested and `track()` is a no-op, so
an unconfigured build ships nothing third-party.

Events are listed in `src/scripts/analytics.ts` and cover the funnel from step
view to submit success. No event carries personal data or enquiry content —
`npm run test:e2e` asserts that.

## SEO

`robots.txt` and `sitemap.xml` are generated, not static, because both need the
live domain. Until `site` is set in `astro.config.mjs`:

- `robots.txt` is served without a `Sitemap:` line
- `sitemap.xml` is not emitted at all, rather than published against a guess
- canonical and Open Graph URLs are omitted
- `LocalBusiness` structured data is omitted until the business facts in
  `site.json` are real — placeholder markers are never emitted as machine-
  readable claims

## Quality budgets

Measured 2026-09-10 with Lighthouse 12.8.2, mobile emulation, against
`npm run build && npm run preview`:

| Page | Performance | Accessibility | Best practices | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| `/` | 100 | 100 | 100 | 100 | 1.0s | 0 |
| `/order` | 100 | 100 | 100 | 100 | 1.0s | 0 |
| `/privacy` | 100 | 100 | 100 | 100 | 0.9s | 0 |

Against 4x CPU throttling and Slow 4G the home page is 9.6KB over the wire in
3 requests, and `/order` is 21.6KB. Total JS is 11.8KB gzipped against the
40KB budget; the home page ships 351 bytes inline, being the nav toggle.

Two parts of section 10 cannot be verified here and remain open:

- **Real iOS Safari.** It is primary traffic, and the clipboard behaviour in
  particular has to be checked by hand on a device (CLAUDE.md 10.3).
- **A screen-reader run through the whole wizard.** The mechanical parts are
  asserted in `npm run test:e2e` — focus moves to each step heading, the step
  is announced, every control has an accessible name, errors are linked with
  `aria-describedby`, a failed submission moves focus to the reason — but
  those are not the same as listening to it.

Colour contrast is a unit test rather than a note: `src/styles/tokens.test.ts`
parses the tokens out of `global.css` and fails the build if any text pairing
drops below 4.5:1 or any UI border below 3:1.

## Maintenance

**Brand link check — quarterly.** Manufacturer URLs rot. Run:

```sh
npm run check:links
```

It reads `src/data/brands.json`, requests each `url`, and reports non-200
responses and redirects. Update `brands.json` with any URL that has moved.
The script lands in Phase 10.

## Testing

`npm test` covers the pure logic: filter matching, step guards, storage
parsing and expiry, reference format, the enquiry payload, and the submission
retry, queue and spam rules.

`npm run test:e2e` drives the whole wizard in a real headless Chrome or Edge
over the DevTools Protocol — cold load, filtering, choosing a brand, adding and
removing appliances, refresh mid-flow, the back button, deep links, discard,
submission including the offline path, and the home page's two rules — the
brand strip must enter the wizard, and the page must ship no JS but the nav
toggle. It uses Node's built-in WebSocket,
so there is no browser-automation dependency. Start `npm run dev` first; set
`CHROME_PATH` if neither browser is in the usual place.

The delivery checks need `PUBLIC_WEB3FORMS_KEY` set to any non-empty value in
`.env` (every request is stubbed, so nothing is sent anywhere). Without it the
suite verifies the unconfigured behaviour instead — queued, and no false
confirmation — and says so.

Neither covers **iOS Safari**, which is primary traffic. The clipboard
behaviour in particular has to be checked by hand on a real device.

## Before launch

- Privacy policy in place, covering **both UK and EU GDPR**
- `site` set in `astro.config.mjs` to the live domain
- **Existing MX records recorded** before any DNS change, or the client's
  email will break
- Hosting and analytics accounts owned by the client
- Quality budgets in CLAUDE.md 10 verified, including the wizard end to end
  on real iOS Safari

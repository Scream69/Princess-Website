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
- [ ] 3. Wizard state machine, URL routing, storage, step shells
- [ ] 4. Step 2 — paste handling, parsing, tray, add-another loop
- [ ] 5. Step 3 — chat-styled details, validation
- [ ] 6. Submission, retry, queue, WhatsApp fallback, step 4
- [ ] 7. Home page
- [ ] 8. Analytics, SEO, privacy page, 404
- [ ] 9. Accessibility and performance pass
- [ ] 10. Link checker, README, deployment

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
parsing and expiry, reference format.

`npm run test:e2e` drives the whole wizard in a real headless Chrome or Edge
over the DevTools Protocol — cold load, filtering, choosing a brand, adding and
removing appliances, refresh mid-flow, the back button, deep links and discard.
It uses Node's built-in WebSocket, so there is no browser-automation
dependency. Start `npm run dev` first; set `CHROME_PATH` if neither browser is
in the usual place.

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

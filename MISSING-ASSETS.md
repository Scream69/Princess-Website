# Missing assets and open items

Running list of everything not yet supplied, and every placeholder currently
in the codebase. Nothing here is invented — where a fact is unknown the code
carries an obvious marker rather than a guess (CLAUDE.md 12).

Markers used in the code:

- `[AWAITING COPY: …]` — text the client is writing.
- `[AWAITING DETAIL: …]` — a business fact only the client can supply.
- `[BLOCKED: …]` — cannot be built until a decision or confirmation lands.

---

## 1. Blocking the build

### 1.1 Brand logos — blocks the Phase 2 finish

The brand list itself is **resolved**: 67 Euronics brands are in
`src/data/brands.json`, supplied by the client. Buying group is **Euronics**.

What is still missing is the artwork:

- [ ] Vector logo (SVG) per brand → `src/assets/brands/<slug>.svg`, ideally
      from the Euronics brand asset pack rather than sourced individually
- [ ] `opticalScale` per brand — currently `1.0` for all 67 as a placeholder.
      It is tuned by eye against the real logo and cannot be set in advance.

Until logos land, **every card renders the documented text fallback**
(CLAUDE.md 9.4). The grid is therefore only half-judgeable: layout, filter,
A–Z and hover behaviour are final, optical balance is not.

**Assumption on record, needs client sign-off:** every brand is written as
`"authorised": true` on the basis that Euronics membership confirms dealer
status for the group's range. CLAUDE.md 11 says not to assume this. If the
client cannot confirm it in writing, the flag must be revisited before launch.

### 1.2 Positioning — premium or general electricals?

CLAUDE.md 9.1 originally read "this client sells Miele and Gaggenau, not budget
electricals". The supplied list contradicts that: it has Miele and AEG but **no
Siemens, Gaggenau, NEFF or Bosch**, and roughly a quarter of it is TV, audio and
lifestyle (Sony, KEF, Ninebot, Reflex Active, Revitive).

- [ ] Confirm whether the site presents as a premium appliance specialist or as
      a general electricals retailer. This changes the home page copy and the
      visual direction, so it is worth settling before Phase 7.
- [ ] Confirm the client genuinely cannot supply Siemens / Gaggenau / NEFF /
      Bosch — their absence may simply be an omission in the list supplied.

### 1.3 Brand data corrections already applied

Recorded here so they can be checked back with the client:

- **Comfee** — the supplied `comfee-uk.com` returns a hard 404. Changed to
  `https://www.comfee.com/uk`, which resolves.
- **Vispera** and **Zenith** — no manufacturer website exists (the client's own
  list says "sold via retailers only"). Both set `"active": false`: a card that
  opens nothing is a dead end in the middle of the funnel. They need either a
  destination or a decision to drop them.
- **AEG** and **Zanussi** — both refused connection from the dev machine during
  the link check. Almost certainly Electrolux bot protection rather than a dead
  site, but unverified. Worth a manual look.
- **Display names** lightly corrected to the registered trademark styling:
  `Fisher & Paykel`, `IceKing`, `Lenco`, `NutriBullet`, `Schönhaus`, `TP-Link`.
- **`featured`** is a placeholder six (Miele, Samsung, LG, Smeg, Dyson,
  Hotpoint), chosen only so the "popular brands" row is buildable.
  - [ ] Client to choose the real featured set.

### 1.4 Served countries — blocks the Step 3 country selector

`src/data/countries.json` currently contains **United Kingdom only**. The
served European countries have not been confirmed, and guessing the list
would put countries in front of customers that the client may not ship to.

- [ ] Confirmed list of served European countries

The step 3 selector is **built and working**, driven entirely by
`countries.json`. Adding a country is a data change, no code. Each entry
carries its own `postcodeLabel` and `postcodePlaceholder`, so the field
relabels itself per country. Postcode validation is deliberately pattern-free
(CLAUDE.md 8.6) and already accepts German, Dutch, Irish and Polish formats —
this is verified in `npm test`.

---

## 2. Brand and design

- [ ] Client logo, vector, for the nav and footer
- [ ] Brand colours. **Placeholder palette in use** — a neutral warm-grey set
      with a single deep-green accent (`--color-accent: #2f4a3f`), defined in
      `src/styles/global.css`. All text pairings meet WCAG AA. Chosen to read
      as premium rather than volume retail; replace once brand colours land.
- [ ] Typefaces. The token stacks reference `PrincessSans` / `PrincessSerif`
      and fall back to system faces, so nothing shifts once the real files
      arrive. Fonts must be **self-hosted `woff2`** with `font-display: swap`
      — no Google Fonts CDN (GDPR data transfer, CLAUDE.md 9.3).
- [ ] Any brand guidelines document
- [ ] Open Graph share image (1200x630) for `/` and `/order`
- [ ] Real favicon — `public/favicon.svg` is currently a plain accent-colour
      square, deliberately not an invented mark

## 3. Copy

All in `src/data/copy.json` and `src/data/site.json`.

- [ ] Home: hero headline, hero supporting line
- [ ] Home: how-it-works steps
- [ ] Home: about section, credentials
- [ ] Footer note (e.g. an authorised-dealer statement)
- [ ] Title tag and meta description for `/` and `/order`
- [ ] Trading name and registered company name

The fixed 24-hour response promise is written and lives in `site.json`
(`responsePromise`). It is a flat string and is never computed from the
clock (CLAUDE.md 8.5).

## 4. Business details

- [ ] Enquiry destination email address
- [ ] Telephone number
- [ ] WhatsApp Business number. Until it is set, `WhatsAppButton.astro`
      **renders nothing** — a dead WhatsApp link on the enquiry failure path
      would breach CLAUDE.md 2.4, so the button is withheld rather than
      broken.
- [ ] Opening hours for the footer
- [ ] Company registration number, VAT number, registered office address

## 5. Infrastructure

- [ ] Domain, registrar access, and **existing MX records** — these must be
      recorded before any DNS change, or the client's email will break
- [ ] `site` in `astro.config.mjs` is commented out until the domain is
      confirmed. Canonical and Open Graph URLs are omitted rather than
      guessed, and `sitemap.xml` cannot be generated without it.
- [ ] Web3Forms access key (or Netlify Forms, if hosting there)
- [ ] Analytics: Plausible or Umami, confirmed as cookieless
- [ ] Hosting account, under the client's own ownership

## 6. Legal

- [ ] Privacy policy covering **both UK and EU GDPR**, since the business
      serves customers across Europe. Required before launch. Confirm whether
      the client is supplying it or it is in scope for this build.
- [ ] Confirm the client is registered as data controller

---

## 7. Questions to put to the client

Logged rather than solved in code, per CLAUDE.md 8.6:

1. **Market-specific model numbers.** Manufacturer sites are per-market, so a
   customer in Germany pasting a `miele.de` link may quote a model number
   that differs from the UK SKU. How should the client handle that at
   quoting time?
2. **EU distance selling and VAT.** Selling to EU consumers brings distance-
   selling and VAT obligations that sit outside this build.

---

## 8. Deviations from CLAUDE.md, for review

1. **Tailwind is configured in CSS, not `tailwind.config.mjs`.**
   CLAUDE.md 3 and 9.2 specify Tailwind "via the official Astro integration"
   with tokens in `tailwind.config.mjs`. That path is no longer available:
   `@astrojs/tailwind` peer-depends on `tailwindcss@^3` and `astro@<=5`,
   whereas current stable is Astro 7.3.1 and Tailwind 4.3.3. Tailwind 4's
   official method is the `@tailwindcss/vite` plugin with tokens declared in
   an `@theme` block, which is what is implemented in
   `src/styles/global.css`. The underlying rule is unchanged: one place for
   tokens, and no arbitrary hex values or magic numbers in components.
   CLAUDE.md 3, 4 and 9.2 have been updated to match.

2. **`astro check` requires `@astrojs/check`**, a devDependency that is not
   installed, pending approval under CLAUDE.md 2.8. The `npm run check`
   script exists but will prompt to install until then.

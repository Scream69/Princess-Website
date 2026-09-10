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
- **AEG** and **Zanussi** — refused connection during the Phase 2 check.
  Both answer 200 on the Phase 10 run, so this has resolved itself.
- **Belling, Liebherr, Stoves and Woods** — all four redirected to a locale
  path (`/en-gb`). Updated to the destination the redirect actually returned,
  so customers skip the hop. Verified, not guessed.
- **Humax** — `uk.humaxdigital.com` serves an incomplete certificate chain.
  Browsers repair that themselves by fetching the missing intermediate, so
  customers are unaffected and the link works; scripted checks cannot, which
  is why the checker reports it separately from a dead link. Worth mentioning
  to Humax, nothing to fix here.
- **Seven brands answer 403/405 to scripts** (ASKO, Dyson, Hisense, Loewe,
  Rangemaster, Russell Hobbs, Sebo) and load normally in a browser. Bot
  protection, reported as such rather than as failures.
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
- [x] Brand colours — **blue, white and gold**, supplied 2026-09-10 and in
      `src/styles/global.css`. Deep navy `#123a75` carries every action;
      antique gold appears only as a rule, a hairline or a numeral, never as
      a button. Every pairing meets WCAG AA and is enforced by
      `src/styles/tokens.test.ts`.
      - [ ] Worth confirming with the client: exact hex values, if they have
            them from anything printed. These were chosen to sit in the
            blue/white/gold brief while passing contrast — a bright gold
            cannot carry text at all, which is why there are two.
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

- [x] Home: hero headline, hero supporting line — written. Deliberately makes
      no claim that has not been confirmed: no years trading, no showroom, no
      delivery or installation promise, no "authorised dealer".
- [x] Home and order page title tags and meta descriptions — written, 146-150
      characters.
- [x] Footer note — a trademark notice rather than the authorised-dealer
      statement, which cannot be written until dealer status is confirmed in
      writing (section 1.1).
- [x] Home: how-it-works steps — written, and shared with the order page's
      step 1 from `copy.process` so the two can never drift apart.
- [x] Home: about section — written from the two facts on record, Euronics
      membership and quoting by hand. Publishable as it stands.
- [ ] **Worth adding to the About section, if true:** how long the business
      has traded, a showroom, delivery, installation, aftercare, and any
      accreditations. Each is a sentence the page would be stronger for, and
      each is a business fact that has to come from the client rather than be
      inferred. Send them and they go straight into `copy.home.about`.
- [x] **Trading name — Princes Electronics**, confirmed 2026-09-10. It lives
      in `site.json` alone: page titles append it in `Base.astro` and the
      footer byline resolves to it, so copy.json never spells it out and a
      change of name stays a one-line change.
- [ ] Footer note (e.g. an authorised-dealer statement)
- [ ] Title tag and meta description for `/` and `/order`
- [ ] **Registered company name** — a different thing from the trading name,
      and the one that belongs on a legal footer. Until it lands, the
      copyright line falls back to "Princes Electronics", which says nothing
      untrue, while the Company block keeps its markers.

The fixed 24-hour response promise is written and lives in `site.json`
(`responsePromise`). It is a flat string and is never computed from the
clock (CLAUDE.md 8.5).

## 4. Business details

- [x] Enquiry destination email address — `info@princeselectronics.com`,
      supplied 2026-09-09 and now in `site.json`. It is also the contact
      address shown on the privacy page.
- [ ] Telephone number
- [ ] WhatsApp Business number. **Now blocks launch.** Until it is set,
      `WhatsAppButton.astro`, the step 4 follow-up link and the failure-path
      fallback all **render nothing** — a dead WhatsApp link is worse than
      none, so they are withheld rather than broken (`src/data/site.ts`).
      Without it, a customer whose enquiry cannot be sent has only "Try
      again": the second route out required by CLAUDE.md 8.7 step 4 does not
      exist yet.
- [ ] Opening hours for the footer
- [ ] Company registration number, VAT number, registered office address

## 5. Infrastructure

- [ ] Domain, registrar access, and **existing MX records** — these must be
      recorded before any DNS change, or the client's email will break
- [ ] `site` in `astro.config.mjs` is commented out until the domain is
      confirmed. Canonical and Open Graph URLs are omitted rather than
      guessed; `robots.txt` is served without a `Sitemap:` line; and
      `sitemap.xml` is not emitted at all. Setting `site` turns all three on
      with no code change.
- [x] Web3Forms access key — set up 2026-09-10 against
      `info@princeselectronics.com`, verified working. Still to do: set
      `PUBLIC_WEB3FORMS_KEY` in the host's environment variables and
      **redeploy**, and update the form's registered Website URL when the
      real domain lands, or the first live enquiry is rejected.
      With `PUBLIC_WEB3FORMS_KEY` empty, `postEnquiry` reports `unconfigured`
      rather than posting: the enquiry is queued on the device and the
      customer is told honestly that it has not gone yet — never that it has.
      A later build with the key delivers whatever is queued.
      Web3Forms also **refuses any request whose origin is not the registered
      Website URL** — see the README, it is a 403 that looks like a broken
      build.
- [ ] Analytics: Plausible or Umami, confirmed as cookieless, under the
      client's account. The wiring is built and switched off: set
      `PUBLIC_ANALYTICS_DOMAIN` and `PUBLIC_ANALYTICS_SRC` and it starts
      reporting. The provider also has to be **named in the privacy page**,
      where it currently reads `[AWAITING: analytics provider name]`.
- [ ] Open Graph share image (1200x630). No `og:image` tag is emitted until
      one exists — a broken share card is worse than none.
- [ ] Hosting account, under the client's own ownership

## 6. Legal

- [x] Privacy policy covering **both UK and EU GDPR** — written, in
      `src/data/privacy.json`. It is a generic policy drafted against what the
      code actually does: every processor the site talks to is named
      (Web3Forms, postcodes.io, the analytics tool), the lawful bases are
      stated, and the browser-side storage and retry queue are described.
- [ ] **Four fields inside the policy still to complete**, each a commitment
      in law rather than copy, so none is guessed:
      - the controller's registered name, address and company number
      - the date the policy takes effect
      - how long enquiries are kept once received (24 months from last
        contact is a common choice)
      - each provider's location and the transfer safeguard relied on
- [ ] A read-through by whoever advises the business on data protection.
      The draft is accurate to the build; it has not been reviewed by anyone
      qualified to sign it off.
- [ ] Confirm the client is registered as data controller

---

## 6a. Submission decisions on record

Phase 6 choices that are ours, not the client's, and are worth a look:

- **Only the reference survives a successful send.** CLAUDE.md 5.2 says to
  clear the enquiry entirely, and 6 says step 4 is gated on `submitted`. Both
  cannot be literally true, so a successful send clears every personal field
  and keeps `reference` + `submitted`. A refresh on the confirmation screen
  therefore still shows the customer their number, and nothing personal is
  retained.
- **A rate-limited submission is not queued.** Five enquiries an hour per
  browser is the cap (CLAUDE.md 8.8). Queueing a refused submission would
  deliver it on the next page load and make the limit meaningless, so the
  customer is pointed at WhatsApp instead — which is why the missing number
  above matters.
- **Session metadata is not persisted.** Brands clicked and time on page are
  session-only, because adding them to the stored schema would mean a version
  bump, and a version bump discards every enquiry saved by the previous build.
  A customer who refreshes mid-enquiry sends shorter metadata.
- **The privacy page now names Web3Forms and the retry queue.** Both are
  factual statements about the code; the real policy (section 6) still has to
  cover them properly.

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

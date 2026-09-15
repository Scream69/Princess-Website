# CLAUDE.md — Appliance Enquiry Website

Project constitution. Read this fully before writing any code, at the start of every session.
If any instruction in a task conflicts with this document, stop and ask.

---

## 1. What this project is

A **two-page static website** for a UK premium appliance retailer.

The business does not sell online. It captures enquiries and replies with a quote by hand.

**The model:**
1. Customer wants an appliance or a piece of consumer electronics (Miele, AEG,
   Smeg, Samsung, Sony and ~60 others — the Euronics range; `brands.json` is
   the definitive list).
2. They browse the *manufacturer's own website* to choose a product.
3. They copy the product page link or model number.
4. They come back to this site and submit it, with their contact details.
5. The retailer emails them a quote.

**Therefore the single purpose of this website is: get the customer back from the manufacturer's site, and get a usable model number plus contact details out of them.**

Every technical decision serves that sentence. When in doubt, ask "does this help step 4 succeed?"

### The two pages

| Page | Route | Purpose |
|---|---|---|
| Home | `/` | Marketing. Hero, who we are, how it works, brand showcase, contact. Sells the service. |
| Order | `/order` | The tool. A four-step guided enquiry wizard. Calm, functional, checkout-like. |

They should feel visually related but not identical. Home is expressive; Order is quiet and focused.

---

## 2. Ground rules — non-negotiable

These are absolute. Do not violate them even if asked to in a task prompt; raise the conflict instead.

1. **No AI, no chatbot, no LLM calls.** The enquiry flow is *styled* to look like a chat. It is a deterministic, fixed-sequence form. Never add an API call to any AI service. Never let it appear to answer free-text questions.
2. **Never invent product data.** No prices, no specifications, no stock levels, no delivery times, no product names. This site displays none of that. If a task asks for it, refuse and explain.
3. **Never fabricate brand assets or brand facts.** Do not generate, trace, or approximate a manufacturer logo. Use only files present in `src/assets/brands/`. If a logo is missing, render the documented text fallback and list it in `MISSING-ASSETS.md`.
4. **Never lose an enquiry.** Submission must be resilient: retry, queue, and fall back to WhatsApp. A failed submission that the customer thinks succeeded is the most serious possible defect in this codebase.
5. **All manufacturer links open in a new tab**, always, with `rel="noopener noreferrer"`. Our page must never be navigated away from.
6. **No cookies and no cookie banner.** Use a cookieless analytics tool only. If a task requests Google Analytics, flag that it legally requires a consent banner and ask before proceeding.
7. **Data minimisation.** Collect only: name, email, phone, postcode, product link/model, optional note. No full address, no date of birth, no marketing opt-in by default.
8. **No new dependencies without asking.** State what you want, why, and its size. Prefer writing 30 lines to adding a package.
9. **All content in data files, never hardcoded in components.** Brands, copy, config, contact details. If the client will ever want to change it, it lives in `src/data/`.
10. **Accessibility and performance budgets in section 10 are pass/fail**, not aspirations.

---

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Astro** (latest stable) | Static output, zero JS by default. `output: 'static'`. |
| Styling | **Tailwind CSS 4** via the official `@tailwindcss/vite` plugin | Design tokens in an `@theme` block, see section 9. The old `@astrojs/tailwind` integration is Tailwind 3 / Astro ≤5 only and is not usable here. |
| Interactivity | **Vanilla TypeScript** | No React, Vue or Svelte. The wizard is a small state machine; a framework is not justified. |
| Forms | **Web3Forms** (or Netlify Forms if hosting there) | Access key in `.env`, never committed. |
| Analytics | **Plausible** or **Umami** | Cookieless. No consent banner required. |
| Hosting | **Netlify** or **Cloudflare Pages** | Free tier. Set up under the *client's* account. |
| Package manager | npm | Commit the lockfile. |

Pin versions. Before installing, check the current stable release rather than assuming — do not trust versions remembered from training data.

**Explicitly not used:** any UI component library, jQuery, Bootstrap, any CMS, any database, any server-side runtime, any AI SDK.

---

## 4. File structure

```
/
├── CLAUDE.md
├── README.md
├── MISSING-ASSETS.md          # running list of logos/copy not yet supplied
├── astro.config.mjs
├── tsconfig.json
├── .env.example               # documents required vars, no real values
├── scripts/
│   ├── check-links.mjs        # link-rot checker, see section 8.9
│   └── e2e-wizard.mjs         # drives the wizard in real Chrome, see 12
└── src/
    ├── data/
    │   ├── brands.json        # THE brand list — single source of truth
    │   ├── site.json          # contact details, hours, response promise
    │   ├── copy.json          # all page copy
    │   └── countries.json     # served countries for the step 3 selector
    ├── assets/
    │   └── brands/            # one SVG per brand, kebab-case filename
    ├── layouts/
    │   └── Base.astro
    ├── components/
    │   ├── Nav.astro
    │   ├── Footer.astro
    │   ├── WhatsAppButton.astro
    │   ├── home/              # Hero, HowItWorks, About, BrandStrip
    │   └── order/             # ProgressBar, BrandGrid, BrandCard,
    │                          # PasteStep, DetailsStep, Confirmation, Tray
    ├── scripts/
    │   ├── wizard.ts          # state machine — the core of the site
    │   ├── storage.ts         # localStorage read/write/expiry
    │   ├── clipboard.ts       # paste detection and handling
    │   ├── parse.ts           # URL + model number extraction
    │   ├── validate.ts        # email, phone, postcode (permissive, see 8.6)
    │   ├── submit.ts          # send, retry, queue, WhatsApp fallback
    │   ├── analytics.ts       # event helpers
    │   └── reference.ts       # enquiry reference generator
    ├── pages/
    │   ├── index.astro
    │   ├── order.astro
    │   ├── privacy.astro
    │   └── 404.astro
    └── styles/
        └── global.css     # @theme design tokens + base styles
```

---

## 5. Data model

### 5.1 `brands.json`

The single source of truth for the brand directory. One object per brand.

```json
{
  "slug": "miele",
  "name": "Miele",
  "url": "https://www.miele.co.uk/",
  "logo": "miele.svg",
  "opticalScale": 1.0,
  "categories": ["appliances"],
  "featured": true,
  "authorised": true,
  "active": true
}
```

| Field | Purpose |
|---|---|
| `slug` | URL-safe id. Used in deep links (`/order?brand=miele`) and analytics. |
| `name` | Display name and accessible label. |
| `url` | **UK homepage only.** Must be `.co.uk` where one exists. No product or category deep links — they rot, and the client has decided against them. `null` is permitted **only** on an inactive brand; `assertLinkable` in `brands.ts` throws at build time otherwise. |
| `logo` | Filename in `src/assets/brands/`, or `null` to render the text fallback. |
| `opticalScale` | Multiplier, roughly `0.7`–`1.3`, tuned by eye so every logo reads at the same visual weight. See section 9.4. |
| `categories` | Array of `appliances` \| `av` \| `other`. Drives the category chips. An array, not a single value, because Samsung, LG, Sharp, Toshiba and Hisense sell both appliances and TVs. |
| `featured` | Shown in the "popular brands" row above the A–Z. |
| `authorised` | Whether the client is an authorised dealer. See section 11. |
| `active` | `false` hides it without deleting the record. |

Sort alphabetically by `name` at build time. Do not hand-maintain order.

### 5.2 Enquiry state

```ts
type EnquiryItem = {
  id: string;              // nanoid-style local id
  brandSlug: string | null;// null if they skipped brand selection
  rawInput: string;        // exactly what they pasted or typed
  inputType: 'url' | 'model' | 'description';
  parsedModel: string | null;
  parsedName: string | null;
  note: string;            // optional per-item note
  addedAt: number;
};

type EnquiryState = {
  version: 1;              // bump on schema change, migrate or discard
  reference: string;       // ENQ-XXXXX, generated on first item
  items: EnquiryItem[];
  contact: {
    name: string;
    email: string;
    phone: string;
    country: string;         // always 'GB' — see 8.6. Kept on the record so
                             // serving a second country stays a data change
    postcode: string;        // free-form, validated for shape only
  };
  step: 1 | 2 | 3 | 4;
  consent: boolean;
  draftBrandSlug: string | null;  // brand chosen in step 1, before an item exists
  submitted: boolean;             // gates step 4
  updatedAt: number;
};
```

`draftBrandSlug` holds the brand between step 1 and step 2 — while the customer
is away on the manufacturer's site and has not yet added a product. It has to
persist, or a refresh mid-step-2 forgets which brand they picked.

`submitted` exists so `?step=4` cannot forge a confirmation screen for an
enquiry that was never sent.

Persisted in `localStorage` under `enquiry:v1`.
**Expire after 30 days** on read. Wrap every `localStorage` call in try/catch —
Safari private mode throws.

After a confirmed submission, every personal field is cleared and **only
`reference` and `submitted` are kept**. Clearing the record outright would
contradict section 6, where `submitted` gates step 4: a refresh on the
confirmation screen has to keep showing the customer their reference. Nothing
personal is retained, and the next appliance added starts a fresh enquiry with
a new reference.

---

## 6. The wizard — state machine

Four steps. **The progress bar shows "Step N of 3"; step 4 is a success screen and is not counted.** Three feels shorter than four, and step 4 requires nothing of the customer.

```
        ┌─────────────────────────────────────────┐
        │                                         │
        ▼                                         │
  ┌───────────┐     ┌───────────┐     ┌───────────┐     ┌──────────────┐
  │ 1. Brand  │────▶│ 2. Product│────▶│ 3. Details│────▶│ 4. Confirmed │
  └───────────┘     └───────────┘     └───────────┘     └──────────────┘
        ▲                 │  "add another"
        └─────────────────┘
```

### Step 1 — Choose a brand
- Live filter input (fuzzy, typo-tolerant) **above** the A–Z rail. The filter is primary; the rail is a desktop convenience.
- Featured brands row, then the full A–Z grid.
- Clicking a brand: opens `url` in a new tab, records the selection, **auto-advances to step 2**.
- A quiet skip link: *"Already have a model number? Skip to step 2 →"*.
- Empty filter result must offer *"Can't find your brand? Tell us anyway →"* → step 2. **Never dead-end a search.**

### Step 2 — Add the product
- Shows the selected brand's logo at the top, confirming we remembered.
- Instruction: copy the page link or model number and paste it here.
- On tab return (`visibilitychange` + focus), surface a large **"Paste"** button — see 8.1.
- **Three ways forward, all valid:** paste a link, type a model number, or *"Not sure — describe what you're after"* free text. Never block progress on a valid URL.
- Parse and echo back what was understood, for confirmation (8.3).
- **"Add another appliance"** → returns to step 1, current item saved to the tray.
- Tray of added items, editable and removable, with a count.

### Step 3 — Your details
- Chat-styled: one question at a time, as messages.
- Order: name → phone → email → postcode.
- Each answer validated before advancing; the customer can go back and edit any earlier answer.
- No country question. The UK is the only country served, so it is a constant on the record rather than something to ask for (8.6).
- Consent checkbox with a link to the privacy policy, above the submit button.
- Summary of all tray items shown before submitting.
- **No fake typing delays. No "agent is typing" animation.** They are patronising and slow the customer down.

### Step 4 — Confirmed
- The enquiry reference, prominent, with a copy button.
- Response promise: within 24 hours (8.5).
- "Message us on WhatsApp instead" — pre-filled, for anyone who wants to send a screenshot.
- Clear the stored enquiry.

### Step routing rules
- **Step is reflected in the URL** as `?step=N`, with `history.pushState`. Non-negotiable: mobile users press back reflexively, and if steps aren't in history, back leaves the site and the enquiry is lost.
- Support deep links: `/order?step=1&brand=miele`, `/order?step=2`.
- Completed steps stay tappable in the progress bar for editing.
- On load, restore from storage and show *"Welcome back — you had N appliances saved. Continue?"* with a discard option.
- Move focus to the new step's heading on every transition (see 10.1).

---

## 7. Home page

- **Nav:** fixed, logo left, section anchors right, prominent "Get a Quote" → `/order`. Collapses to a mobile menu.
- **Hero:** headline, supporting line, primary CTA, and a one-line explanation of how the process works. First-time visitors must understand the model within five seconds.
- **How it works:** three or four steps, plain language, mirroring the wizard.
- **About:** who they are, why buy through them, credentials.
- **Brand strip:** featured logos only, linking to `/order?brand=<slug>` — *not* straight out to the manufacturer. From the home page we want them entering the wizard.
- **Footer:** contact, company registration details, social links, privacy policy.
- **WhatsApp, twice, deliberately.** A button beside "Get a quote" in the hero — outlined, so the quote button stays the primary action — and the floating button in the corner.
- **The floating button waits on the home page.** It is withheld until the reader passes a cue at 50% of the how-it-works section, so it is not a second offer covering the page's own call to action. On `/order` it appears immediately: there it is the escape hatch for an enquiry that cannot be sent (8.7 step 4), and delaying it would be harmful. The gate is CSS, declared by the section that owns the cue — applying it from the script showed the button for a frame on every load, because module scripts run after first paint.

---

## 8. Automation spec

### 8.1 Clipboard — read this before implementing
Browsers **deliberately prevent** silent clipboard reading. `navigator.clipboard.readText()` requires a user gesture and permission; **iOS Safari always shows its own native paste confirmation.** There is no workaround. Do not attempt one, and do not describe the feature as automatic anywhere in the UI or the code comments.

Implement all three layers:
1. **Return detection.** On `visibilitychange` → visible, or window focus, surface a large primary button: *"Paste link or model number"*. One tap. This is the main path.
2. **Global paste listener.** A `paste` handler on `document` so Cmd/Ctrl+V or long-press paste lands in the field even when it isn't focused. **This path needs no permission at all** and is the most reliable — implement it first.
3. **Manual entry** always visible as a fallback. Never hide the text input behind the paste button.

### 8.2 Manufacturer link handling
`target="_blank" rel="noopener noreferrer"`. Record `brandSlug`, fire the analytics event, then advance the step — in that order, so the state survives even if the new tab steals focus immediately.

### 8.3 Parsing (`parse.ts`)
Given a pasted string:
- If it's a URL: extract the last meaningful path segment, humanise the slug, and look for a model-number pattern. `/ovens/h7860bpx-handleless-oven` → name "Handleless Oven", model "H7860BPX".
- Brand-specific patterns where known. **`BRAND_MODEL_PATTERNS` in `parse.ts` is
  deliberately empty.** Writing 65 regexes without having seen a real URL from
  each brand would be inventing brand facts (rule 2.2), and the NEFF/Siemens
  examples this section originally cited are not brands the client carries.
  The generic extractor — longest token in the deepest path segment containing
  both letters and digits — handles every real URL met so far. Add an override
  only when a real URL proves the generic rule wrong, and cite that URL.
- Where the model occupies its own path segment (AEG:
  `/hobs/induction-hob/ikx64301cb/`), the descriptive name is taken from the
  segment above it.
- Normalise whitespace and case; store `rawInput` unmodified as well.
- Echo back: *"Got it — NEFF B64CT73G0B. Is that right?"* with a correct/confirm option.
- **Parsing is a convenience, never a gate.** If nothing matches, accept the input as-is and move on.

### 8.4 Persistence
Save on every state change, debounced ~300ms. Restore on load. 30-day expiry. Version the schema.

### 8.5 Response promise
**Flat "within 24 hours".** The string lives in `site.json` — do not compute it from the clock, and do not build time-of-day or opening-hours logic. A single unconditional message, editable in one place.

### 8.6 Postcode — no country question, no serviceability gate
The business delivers to the **United Kingdom only** (client, 2026-09-12).
There is no serviceability check and no served-prefix list within it: every UK
postcode is served. Do not build one.

**This section previously said the business served the whole of the UK and
Europe, and specified a country selector.** That selector shipped, but
`countries.json` never held more than a single entry, so it presented one
option and asked a question whose answer was already known. It has been
removed. The delivery country is still written to the enquiry record as `GB`
(see 5.2) so that serving a second country would be a data change rather than
a schema migration.

What this still requires:

- **Permissive postcode validation.** Validate only that the value is present
  and plausible: roughly 3–10 characters, letters/digits/spaces/hyphens.
  - Uppercase and collapse repeated whitespace. Store what they typed.
  - **Never reject a postcode for not matching a pattern.** The original
    reason was European formats; the reason it survives UK-only delivery is
    better — postcodes for new builds can lead the published dataset by
    months, and the last step of the funnel is the worst place to tell a
    customer their own address is wrong.
- The postcode label and placeholder still come from `countries.json` rather
  than a literal in a component. They are copy, and copy lives in data files
  (rule 9); a one-entry list does not change where they belong.

**Postcode confirmation (UK only).** `postcode-lookup.ts` sends a UK postcode to
postcodes.io (ONS open data, no key, no cost) purely to echo back the town —
"WD17 1AA — Watford, East of England" — so the customer can see they typed it
correctly. Hard rules:

- **It can never block.** A 404, a timeout, an outage or a non-UK country all
  resolve to silence, and the postcode goes through exactly as typed.
- **It is not an error state.** An unrecognised postcode gets reassurance, not a
  validation message. New-build postcodes lag the dataset by months.
- **No street address is fetched.** That would need a licensed Royal Mail PAF
  provider and would contradict rule 7. The full address is an order-time
  detail, collected by email once the customer accepts a quote.
- It is a third-party data transfer, so it is named in the privacy policy.

If the client ever does want the full address dropdown, that is a rule 7 change
plus a paid PAF account in their name — raise it, do not just add it.
- **The country is no longer in the notification email** — not in the subject line, not in the body, not in the WhatsApp fallback. It named the same country every time, which is not information: it is a word in every subject line that has to be read past to reach the parts that differ. The postcode carries the region. Removed on the client's instruction, 2026-09-12.
- It is still written to the *enquiry record* on the device (5.2), which is what keeps re-adding a second country a data change.

Two knock-on points that **UK-only delivery has now closed**: a customer pasting a `miele.de` link could reference a model number that differs from the UK SKU, and selling to EU consumers would bring EU distance-selling and VAT considerations. Neither needs handling. The first can still happen — nothing stops a UK customer browsing a German site — so parsing must stay a convenience and never a gate (8.3).

### 8.7 Submission (`submit.ts`) — highest-risk code in the project
1. POST to the form endpoint with a timeout.
2. On failure: retry twice with backoff.
3. Still failing: write to a `pending-enquiry` queue in `localStorage`, retry on next page load.
4. Show the customer an honest message with a WhatsApp button pre-filled with the whole enquiry, so the lead is never lost.
5. Only clear the enquiry after confirmed success.
6. Include in the payload: reference, all items (brand, raw input, parsed model, note), contact details, and metadata — brands clicked, time on page, entry URL. The payload is flat and string-valued: a form-to-email service renders nested objects as unreadable JSON, so items arrive as numbered lines.
7. An empty access key is reported as `unconfigured`, distinct from a network failure: nothing is posted, the enquiry is queued, and the customer is never told it was sent. A later build with the key delivers what is queued.
8. Queue entries are keyed by reference, so "Try again" replaces rather than duplicates, and a confirmed send removes the entry — otherwise the client is emailed the same enquiry twice.

### 8.8 Spam protection
Honeypot field (visually hidden, not `display:none`), plus a minimum time-to-submit check (~3 seconds), plus a per-browser rate limit in `localStorage`. **No CAPTCHA** — it costs real enquiries.

### 8.9 Link-rot checker
`scripts/check-links.mjs` — reads `brands.json`, requests each `url`, reports non-200s and redirects. Run quarterly. Document it in the README as a maintenance task.

**Learned from the first manual run (Phase 2):** roughly a sixth of the list —
Miele, Dyson, Samsung, Sony, Sebo, Asko, Hisense, Loewe, Rangemaster, Numatic —
answers `403` to a scripted `HEAD`, and Russell Hobbs answers `405`. These are
bot-protection responses, not dead links; all load normally in a browser. The
checker must **not** report them as failures or it will be ignored within a
quarter. Treat `403`/`405`/`429` as "reachable, blocked to scripts", follow
redirects, send a real browser `User-Agent`, and fall back to `GET` on failure.

### 8.10 Analytics events
Fire on: step view, brand click (with slug), paste success, paste failure, manual entry used, add-another used, item removed, validation error (with field), submit attempt, submit success, submit failure, WhatsApp click, abandonment step.
This funnel tells the client which brands drive enquiries and exactly where customers drop out.

### 8.11 Deliberately excluded
Do not build these. They were considered and rejected.
- File or screenshot upload — no server, and it changes the data protection position. Screenshots go to WhatsApp.
- Fake typing indicators or artificial delays.
- Capturing a partial enquiry by email without explicit consent.
- Any product deep links.
- A basket, prices, or checkout.

---

## 9. Design

### 9.1 Direction
The client is a **buying-group member** and carries that group's range — 67 brands
spanning premium appliances (Miele, Smeg, Liebherr, Fisher & Paykel), mainstream
appliances (Beko, Indesit, Hotpoint), and TV/audio (Sony, Samsung, LG, KEF).

**Open question, not yet answered:** whether the site should present as premium
or as general electricals. Do not resolve it in code — it is a positioning
decision for the client (logged in `MISSING-ASSETS.md`). Until it is answered,
the restrained direction below holds, because it degrades gracefully either way.

The reference the client supplied (Euronics) is navy-and-yellow volume retail — take its *information architecture*, reject its aesthetic.

Target: generous white space, one restrained accent colour, confident typography, subtle borders rather than heavy shadows. Calm and expensive. If the finished page looks like a link farm or a discount retailer, it has failed.

Avoid: gradients, everything-rounded, drop shadows on cards, more than one accent colour, emoji in UI copy, exclamation marks.

### 9.2 Tokens
All in the `@theme` block at the top of `src/styles/global.css` — Tailwind 4 is configured in CSS, not in a JS config file. No arbitrary hex values in components, no magic numbers — add a token instead.

**Brand colours supplied 2026-09-10: blue, white and gold.** Deep navy rather than a bright blue, antique gold rather than a bright one — the muting is what separates this from the navy-and-yellow volume retail the client's own reference uses.

Gold is a documented exception to "one accent only" below. It is decoration, never an action: a hairline, a rule, a numeral. Two gold tokens exist because one cannot do both jobs — `--color-gold` is 3:1 and may only draw lines, `--color-gold-ink` is 4.6:1 and is the only gold a customer ever reads. `src/styles/tokens.test.ts` enforces both, and fails the build if either drifts.

### 9.3 Type
One family, or a serif for headings paired with a clean sans for body if the brand allows. Self-host the fonts (`woff2`, `font-display: swap`) — no Google Fonts CDN, since that carries a GDPR data-transfer question.

### 9.4 Brand grid — the detail that decides quality
This is what the client will judge. Get it right.
- Identical card size, white background, subtle 1px border, generous internal padding.
- Every mark must read at the same visual weight. A tall stacked mark and a long wordmark fitted to the same box width look wrong, and that is what makes a brand grid look automated.
- **This is now done in the asset pipeline, not by hand.** `scripts/prepare-logos.mjs` crops each supplied file to its own ink and scales it so its geometric mean — `sqrt(width × height)` — is constant, then centres it on an identical 280×88 canvas. Because every file is the same size with the mark already balanced inside it, the card renders them all in one box and they come out looking the same size.
- **`opticalScale` remains, as the escape hatch** for a mark the automatic pass still gets wrong. It is `1` for all 67 today. Set it on the single record that needs it rather than moving the pipeline for everyone.
- **Raster, not SVG.** This section said "SVG only" until 2026-09-15, when the client supplied the artwork as photographs — PNG, JPG, WebP and one AVIF. That is what manufacturers' press pages hand out, so it is what the grid has to accept. The pipeline normalises them to WebP and flags any source too small to survive a 2× render, because a soft logo on a white card is worse than the text fallback it replaces. The text fallback stays for any brand whose file has not arrived.
- Logos live in `public/brands/<slug>.webp` — a plain path rather than Astro's image pipeline, because 67 files referenced from data cannot be statically imported, and they are pre-sized anyway.
- Rows fill continuously; **do not force a row break at each letter** (the reference page wastes large amounts of space doing this). Mark letters with a sticky divider or heading instead.
- **The brand name sits under the logo.** This reversed on 2026-09-15, at the client's request. The rule had been "no redundant text label — use `aria-label` and a hover treatment", which assumes every mark is recognisable on sight; across 65 brands it is not, and Sensis, Schönhaus, Statesman, Avtex and Haden are wordmarks a customer has no reason to know. The `aria-label` stays and still wins as the accessible name: it opens with the visible text, as WCAG 2.5.3 requires, and adds what the hover affordance tells a sighted user — that the link leaves the site.
- Where no artwork has arrived the name stands in for the mark and is set larger, because there it *is* the card rather than a label on it.
- On hover: slight lift and a **"View range ↗"** affordance, so it is obvious the link leaves the site.
- Letters with no active brands are dimmed and not clickable in the A–Z rail.

### 9.5 Responsive
Mobile first. Test at 320, 375, 768, 1024, 1440. Touch targets ≥ 44px. The progress bar on mobile is a compact "Step 2 of 3 — Add your appliance" with a thin fill bar, never four labels side by side.

---

## 10. Quality budgets — pass/fail

### 10.1 Accessibility (WCAG 2.1 AA)
- Fully keyboard navigable; visible focus states throughout.
- On step change: move focus to the new step heading and announce it via `aria-live="polite"`.
- Chat messages in an `aria-live` region.
- Correct heading hierarchy; one `h1` per page.
- Text contrast ≥ 4.5:1, UI components ≥ 3:1.
- Every form field has a real `<label>`; errors linked with `aria-describedby`.
- Honour `prefers-reduced-motion`.
- The wizard must be completable with a screen reader. Test it.

### 10.2 Performance
- Lighthouse mobile: performance ≥ 90, accessibility 100, best practices ≥ 95, SEO ≥ 95.
- Total JS < 40KB gzipped. **Measured 2026-09-15: 11.9KB gzipped**, all of it on `/order`; the home page ships 1.8KB of inline module script and nothing else.
- The home page's three scripts are the nav toggle (351 bytes), the how-it-works sequence (1,206 bytes) and the floating WhatsApp button's reveal (286 bytes). The e2e suite names every script the home page is allowed to load, so a fourth cannot appear unnoticed — the list went from two to three deliberately, in the commit that added the button.
- **The how-it-works sequence is scroll-scrubbed, not observed.** This section previously described it as "one IntersectionObserver, 728 bytes, no scroll listener". That stopped being true when the client asked to slow the sequence down and it was rewritten to advance with the scroll position: it now uses a passive `scroll` listener throttled through `requestAnimationFrame`, and there is no IntersectionObserver left in it. It is still gated at `lg` and still degrades to a plain list without JavaScript. Measured TBT remains 0ms.
- All logos as optimised SVG; lazy-load below the fold.
- No layout shift on load (CLS < 0.05).

### 10.3 Browsers
Current Chrome, Safari, Firefox, Edge. **iOS Safari and Android Chrome are primary** — most traffic will be mobile. Clipboard behaviour must be verified on real iOS, not just a simulator.

### 10.4 SEO
Unique title and meta description per page, Open Graph and Twitter cards, `sitemap.xml`, `robots.txt`, `LocalBusiness` structured data. `/order` should be indexable but the home page is the ranking target.

---

## 11. Legal

**Trademarks.** Manufacturer logos are trademarks. Displaying ~60 of them prominently implies a supply relationship, which is only safe where one exists. The `authorised` flag exists to track this. **If the client has not confirmed authorised-dealer status for a brand, do not add it to `brands.json` — add it to `MISSING-ASSETS.md` as blocked pending confirmation.** Ask the client whether they are a member of a buying group (Euronics, NEWS, CIH); if so, request the group's brand asset pack rather than sourcing logos individually.

**UK GDPR.** The enquiry form collects personal data and the client is the data controller. Delivery is UK-only as of 2026-09-12, so **UK GDPR is the operative regime**. EU GDPR is not automatically out of scope — it can still reach a business that offers goods to people in the EU, and the site is reachable from anywhere — but that is a question for whoever reviews the policy, not an assumption to bake into the code. The policy currently retains its reference to EU supervisory authorities; leave it unless the client's reviewer says otherwise, since the cost of an unnecessary sentence is far lower than the cost of a missing one. A privacy policy is required before launch, covering what is collected, why, retention, and the controller's contact details. Do not launch without it. Keep the consent checkbox unticked by default.

**Cookies.** With cookieless analytics and no marketing tags, no consent banner is required. Adding any third-party tag changes that — flag it rather than adding it.

---

## 12. How to work on this project

### Build order
Do not jump ahead. Each phase should be working and committed before the next.

1. Scaffold, config, tokens, layout, nav, footer.
2. `brands.json` + brand grid with filter, A–Z, optical sizing. Get this looking excellent before anything else — it is the visual centrepiece.
3. Wizard state machine, URL routing, storage, step shells.
4. Step 2: paste handling, parsing, tray, add-another loop.
5. Step 3: chat-styled details, validation, serviceability.
6. Submission, retry, queue, WhatsApp fallback, step 4.
7. Home page.
8. Analytics, SEO, privacy page, 404.
9. Accessibility and performance pass against section 10.
10. Link checker script, README, deployment.

### Rules of engagement
- **Ask before assuming.** Missing copy, a missing logo, an unclear behaviour — ask, or use a clearly marked placeholder and log it in `MISSING-ASSETS.md`. Never invent business facts, opening hours, credentials, or brand relationships.
- **Small commits**, one concern each, conventional-commit style.
- **No placeholder lorem ipsum in anything the client will see.** Use real copy from `copy.json`, or an obvious `[AWAITING COPY: hero headline]` marker.
- **Test the wizard end to end after every change to it.** Including: refresh mid-flow, back button, add three items, submit with the network offline.
  - `npm run dev` in one terminal, `npm run test:e2e` in another. It drives a
    real Chrome or Edge over the DevTools Protocol using Node's built-in
    WebSocket — no test framework, no browser-automation package.
  - It cannot cover iOS Safari, which is primary traffic (10.3). The clipboard
    behaviour in Phase 4 must be checked by hand on a real device.
  - `npm test` is the unit layer: pure logic only (filter matching, step
    guards, storage parsing, reference format).
- **Update this file** when an architectural decision changes. It is the source of truth.
- Keep functions small and named for what they do. TypeScript strict mode on. No `any`.
- Comment *why*, not *what* — particularly in `clipboard.ts` and `submit.ts`, where the constraints are non-obvious.

### Definition of done for a feature
Works on mobile Safari · keyboard accessible · handles the failure case · state survives a refresh · no console errors · budgets in section 10 still met.

---

## 13. Open questions — awaiting client

Track these; do not guess answers.

- [x] Final brand list — 67 Euronics brands, supplied and in `brands.json`
- [x] Buying group membership — **confirmed to us, but must not appear on the
      public site.** The client asked on 2026-09-11 for it to be removed from
      the hero and the About section. It stays in these notes because it is
      where `brands.json` came from; it is not something the site may claim.
- [ ] Authorised-dealer status confirmed **in writing** (currently assumed from
      Euronics membership — see `MISSING-ASSETS.md` 1.1)
- [ ] Access to the Euronics brand asset pack (logos)
- [ ] Positioning: premium specialist or general electricals (`MISSING-ASSETS.md` 1.2)
- [x] Client logo (vector) — supplied 2026-09-11, in the nav and footer. A
      reversed version for dark grounds is still outstanding
      (`MISSING-ASSETS.md` 2)
- [ ] Logo files (vector) for each manufacturer
- [x] Brand colours — **blue, white and gold**
- [ ] Fonts and any brand guidelines
- [ ] Home page copy: hero, about, how-it-works
- [x] Enquiry destination email address — `info@princeselectronics.com`
- [x] WhatsApp Business number — **+44 7930 565656**, supplied 2026-09-15. This was the last thing standing between the site and rule 2.4: with no number, every WhatsApp button rendered nothing, so an enquiry that could not be sent had "Try again" and no second route out.
- [x] Opening hours — supplied 2026-09-15. Monday to Friday 09:00–17:00, Saturday 10:00–16:00. Sunday was not given and is **not** shown as closed: that would be inferring a business fact from a gap in a list. Stored structured in `site.json` so the footer and the `LocalBusiness` block render from one record.
- [x] Telephone — **+44 20 8204 1526**, supplied 2026-09-15. Now a live `tel:` link and in the structured data.
- [x] Delivery area — **United Kingdom only**, confirmed 2026-09-12. The country selector has been removed (8.6).
- [x] Trading name — **Princes Electronics**
- [x] Company registration number `07396672`, VAT `100 906 362`, registered office `23 Haverford Way, Edgware, Middlesex, HA8 6DJ`
- [x] Registered company name — **Princes Electronics** (same as the trading name)
- [ ] Privacy policy covering both UK and EU GDPR — client supplying, or in scope?
- [ ] Domain, registrar access, and **existing MX records** (changing DNS carelessly will break their email)
- [ ] Analytics preference confirmed as cookieless

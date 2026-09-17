# CLAUDE.md — Appliance Enquiry Website

Project constitution. Read this fully before writing any code, at the start of every session.
If any instruction in a task conflicts with this document, stop and ask.

---

## 1. What this project is

A static website for a UK premium appliance retailer, built around **two
services**: quote enquiries and appliance repairs. It grew from a two-page
site to four pages on 2026-09-16, when the client asked for a repair-booking
flow; the shape below is unchanged, there is simply a second instance of it.

The business does not sell online, and does not repair by post. It captures
enquiries and replies with a quote by hand, and it assesses repairs on items
the customer brings to the counter.

**The quote model:**
1. Customer wants an appliance or a piece of consumer electronics (Miele, AEG,
   Smeg, Samsung, Sony and ~60 others — the Euronics range; `brands.json` is
   the definitive list).
2. They browse the *manufacturer's own website* to choose a product.
3. They copy the product page link or model number.
4. They come back to this site and submit it, with their contact details.
5. The retailer emails them a quote.

**Therefore the single purpose of the quote flow is: get the customer back from the manufacturer's site, and get a usable model number plus contact details out of them.**

**The repair model:**
1. Customer has a broken TV, audio/DJ equipment, microwave, or smartphone —
   the client repairs no other categories (never washing machines, dryers,
   fridges/freezers, dishwashers or ovens; see `repairs.json`).
2. They describe the item and the fault on `/repairs`, choose a day and a
   morning/afternoon slot to bring it in, and leave their details.
3. They drop the item at the shop counter — any day the shop is open,
   including Saturday. **Assessment is free**, and nothing is charged until a
   price is agreed.
4. The client emails or calls once the item has been assessed. Repairs
   themselves are carried out on Saturdays.

**Therefore the single purpose of the repair flow is: get an accurate description of the item and the fault, and a drop-off the client is expecting, out of the customer.**

Every technical decision serves one of those two sentences. When in doubt, ask
"does this help the customer complete the flow they are in?"

### The pages

| Page | Route | Purpose |
|---|---|---|
| Home | `/` | Marketing. Hero, who we are, how it works, brand showcase, repairs summary, contact. Sells both services. |
| Order | `/order` | The quote tool. A four-step guided enquiry wizard. Calm, functional, checkout-like. |
| Repairs | `/repairs` | The repair-booking tool. The same four-step shape — what's broken, the fault, details and drop-off slot, confirmation — collecting for repairs@ instead of info@. |
| Repair label | `/repairs/label` | Not a page a customer browses to. A printable A4 drop-off slip, built entirely from its own URL fragment (see section 6a) — `noindex`, excluded from the sitemap. |

The wizard and the repair booking should feel like the same tool used twice —
same progress bar shape, same chat-styled details step, same failure/queue/
WhatsApp discipline — not two different pieces of software. Home is
expressive; Order and Repairs are quiet and focused.

---

## 2. Ground rules — non-negotiable

These are absolute. Do not violate them even if asked to in a task prompt; raise the conflict instead.

1. **No AI, no chatbot, no LLM calls.** The enquiry flow is *styled* to look like a chat. It is a deterministic, fixed-sequence form. Never add an API call to any AI service. Never let it appear to answer free-text questions.
2. **Never invent product data.** No prices, no specifications, no stock levels, no delivery times, no product names. This site displays none of that. If a task asks for it, refuse and explain.
3. **Never fabricate brand assets or brand facts.** Do not generate, trace, or approximate a manufacturer logo, and do not alter one — cropping a supplied mark is editing a trademark. Use only what the client has supplied, processed by `scripts/prepare-logos.mjs` into `public/brands/`. If a logo is missing, render the documented text fallback and list it in `MISSING-ASSETS.md`.
4. **Never lose an enquiry.** Submission must be resilient: retry, queue, and fall back to WhatsApp. A failed submission that the customer thinks succeeded is the most serious possible defect in this codebase.
5. **All manufacturer links open in a new tab**, always, with `rel="noopener noreferrer"`. Our page must never be navigated away from.
6. **No cookies and no cookie banner.** Use a cookieless analytics tool only. If a task requests Google Analytics, flag that it legally requires a consent banner and ask before proceeding.
7. **Data minimisation.** For a quote enquiry, collect only: name, email, phone, postcode, product link/model, optional note. For a repair booking, collect only: name, phone, email, item description, fault description, drop-off day/slot — **no postcode or address at all**, since the customer brings the item in rather than having it delivered. No full address anywhere, no date of birth, no marketing opt-in by default.
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
| Forms | **Web3Forms** (or Netlify Forms if hosting there) | **Two forms, two keys** — quotes and repairs deliver to different addresses, and in Web3Forms the access key is the binding to one. `PUBLIC_WEB3FORMS_KEY` (info@) and `PUBLIC_WEB3FORMS_KEY_REPAIRS` (repairs@), in `.env`, never committed. |
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
├── public/
│   └── brands/                # one WebP per brand, named for its slug
├── scripts/
│   ├── check-links.mjs        # link-rot checker, see section 8.9
│   ├── prepare-logos.mjs      # client's raster logos -> public/brands, see 9.4
│   ├── fetch-bank-holidays.mjs # refreshes bank-holidays.json, run annually — see 6a
│   ├── e2e-wizard.mjs         # drives the quote wizard in real Chrome, see 12
│   └── e2e-repairs.mjs        # the same, for the repair booking — see 6a, 12
└── src/
    ├── data/
    │   ├── brands.json        # THE brand list — single source of truth
    │   ├── site.json          # contact details, hours, response promise, closures
    │   ├── copy.json          # all page copy
    │   ├── countries.json     # served countries for the quote step 3 selector
    │   ├── repairs.json       # repair categories, exclusion list, slot rules
    │   └── bank-holidays.json # generated by fetch-bank-holidays.mjs — do not hand-edit
    ├── assets/                # the client's own logo lockups
    ├── layouts/
    │   └── Base.astro
    ├── components/
    │   ├── Nav.astro
    │   ├── Footer.astro
    │   ├── WhatsAppButton.astro
    │   ├── home/              # Hero, HowItWorks, About, BrandStrip, Repairs
    │   ├── order/              # ProgressBar, BrandGrid, BrandCard,
    │   │                       # PasteStep, DetailsStep, Confirmation, Tray
    │   └── repair/             # RepairProgressBar, CategoryStep, FaultStep,
    │                           # RepairDetailsStep, RepairConfirmation, DropoffInfo
    ├── scripts/
    │   ├── wizard.ts          # quote state machine — see section 6
    │   ├── repair.ts          # repair-booking state machine — see 6a
    │   ├── repair-details.ts  # the repair flow's 3-question chat sequence
    │   ├── slots.ts           # drop-off day/time generation, pure and tested
    │   ├── label.ts           # printable-slip encode/decode (URL fragment)
    │   ├── local-store.ts     # shared localStorage read/write/debounce/expiry core
    │   ├── storage.ts         # quote enquiry state — built on local-store.ts
    │   ├── repair-storage.ts  # repair booking state — built on local-store.ts
    │   ├── keys.ts            # the two Web3Forms access keys, one per inbox
    │   ├── clipboard.ts       # paste detection and handling (quote flow only)
    │   ├── parse.ts           # URL + model number extraction (quote flow only)
    │   ├── validate.ts        # email, phone, postcode (permissive, see 8.6)
    │   ├── submit.ts          # send, retry, queue, WhatsApp fallback — both flows
    │   ├── analytics.ts       # event helpers
    │   └── reference.ts       # ENQ-/REP- reference generator
    ├── pages/
    │   ├── index.astro
    │   ├── order.astro
    │   ├── repairs.astro
    │   ├── repairs/
    │   │   └── label.astro    # the printable slip — noindex, not in the sitemap
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
| `logo` | Filename in `public/brands/`, or `null` to render the text fallback. |
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

### 5.3 Repair booking state (`repair-storage.ts`)

```ts
type RepairState = {
  version: 1;
  reference: string;             // REP-XXXXX, generated when step 1 is completed
  category: string | null;       // a slug from repairs.json, or null for "Something else"
  product: string;               // free text — the item
  fault: string;                 // free text — what's wrong with it
  contact: { name: string; phone: string; email: string };  // no postcode — see 8.6a
  slot: { date: string; part: 'morning' | 'afternoon' } | null;
  step: 1 | 2 | 3 | 4;
  consent: boolean;
  submitted: boolean;            // gates step 4, same reason as the quote flow
  updatedAt: number;
};
```

A separate key (`repair:v1`), a separate schema, and its own reference prefix
(`REP-` vs `ENQ-`) — a customer can legitimately have a quote enquiry and a
repair booking open at once, and the two are submitted to different inboxes.
The read/write/debounce/30-day-expiry mechanics are shared with the quote
flow via `local-store.ts`; only the shape and validation are separate.

No postcode and no country: the customer is carrying the item to the counter,
so an address is not collected (rule 7 — data minimisation).

Same completion discipline as `EnquiryState`: after a confirmed submission,
every field is reset to empty **except `reference` and `submitted`**, so a
refresh on the confirmation screen keeps showing the reference.

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

## 6a. The repair booking — state machine

`/repairs`. Added 2026-09-16. The same four-step shape as section 6, the same
step-in-URL routing, the same focus/announce discipline, the same
submit→retry→queue→WhatsApp submission path (8.7) — built by `repair.ts`,
much smaller than `wizard.ts` because there is no brand directory and no
clipboard handling: the customer is describing an item they are carrying in,
not pasting a link from a manufacturer's site.

```
  ┌───────────┐     ┌───────────┐     ┌───────────┐     ┌──────────────┐
  │ 1. Item   │────▶│ 2. Fault  │────▶│ 3. Details│────▶│ 4. Confirmed │
  └───────────┘     └───────────┘     │  + slot   │     └──────────────┘
                                       └───────────┘
```

### Step 1 — What needs repairing
- Category chips from `repairs.json` (TVs, audio, DJ equipment, microwaves,
  smartphones), plus a free-text description of the item. Category is
  optional metadata; only the description gates Continue.
- **The not-repaired list is on this step, in plain sight** — washing
  machines, tumble dryers, fridges/freezers, dishwashers, ovens. Someone with
  a broken dishwasher finds out in five seconds, not after filling in a form.
  Same "never dead-end" principle as CLAUDE.md 6: a "Something else" chip
  leads to a note explaining what to do next, never to a wall.
- The reference (`REP-XXXXX`) is generated here, on Continue — the repair
  flow's equivalent of the quote wizard generating `ENQ-XXXXX` on the first
  item added.

### Step 2 — What's wrong with it
- Free-text fault description. **The free-estimate promise is stated here**,
  right after asking for the fault, before any commitment: assessment costs
  nothing, and nothing is charged until a price is agreed (client, 2026-09-16).

### Step 3 — Your details and drop-off
- Chat-styled, three questions: name, phone, email — no postcode, no country
  (the customer is carrying the item in; see 5.3 and rule 7).
- **The drop-off slot picker** (`slots.ts`), revealed once all three
  questions are answered. **A real month-grid calendar**, not a flat list of
  day chips — a Mon–Sun weekday header and dates laid out in a grid, with
  prev/next month navigation, changed 2026-09-16 at the client's request. Every
  day the shop is open (`site.json`'s `hours`) for the next `daysAhead`
  calendar days (`repairs.json`'s `slots.daysAhead`, **180 by default** — six
  months, not a fortnight, because nothing is reserved (below) so there is no
  cost to letting a customer travelling abroad plan a drop-off a month or two
  out), minus bank holidays (`bank-holidays.json`) and any one-off closures
  the client sets in `site.json`'s `closures`. Each open day splits into a
  morning and an afternoon slot at 13:00. A slot whose end time has already
  passed today is not offered; a day with none left is shown muted in the
  grid rather than omitted, so the calendar keeps its shape. Month navigation
  is bounded to the window itself — paging past the last available month, or
  before the first, is disabled rather than landing on an empty page.
- **This can never read as a booking.** There is no server and no database
  (section 3), so nothing is reserved — two customers can choose the same
  slot, however far out. The copy says "we will confirm your drop-off," never
  "booked."
- Review, consent, honeypot, submit — identical shape to the quote wizard's
  step 3.

### Step 4 — Confirmed
- The reference, prominent, with a copy button.
- The repair response promise (`site.json`'s `repairPromise`: "we will
  contact you once we have assessed your item") — deliberately **not** the
  24-hour quote promise, which is about a different thing.
- **"Print a drop-off slip"** — see 6b. "Message us on WhatsApp instead" —
  pre-filled, same as the quote flow.
- Clear the stored booking, same discipline as section 6's step 4.

### Step routing rules
Identical to section 6: `?step=N` with `history.pushState`, deep links
(`/repairs?step=1&category=tv`, `/repairs?step=2`), completed steps stay
tappable, a resume banner on load, focus moved to the new step heading.

## 6b. The printable drop-off slip

`/repairs/label`. The client asked for a printable A4 sheet to stick on an
item so it can be matched to its details on the workbench, and for the
booking notification to arrive as a normal email they can print — both are
covered.

**How it travels with no server.** The slip's fields (reference, name, phone,
email, product, fault, formatted drop-off slot) are encoded into the URL's
**fragment** — the part after `#`, which browsers never send in an HTTP
request (`label.ts`). Nothing personal reaches a server log, a CDN's access
log, or a hosting platform's request logging, because it never leaves the
browser. The whole artefact is a link:

- The client clicks `label_url`-shaped links from the repair notification
  email to print a slip for the workbench.
- The customer can tap "Print a drop-off slip" on their own step 4 to bring a
  printed copy with the item — optional, never required.

The encoding is versioned (`LABEL_VERSION` in `label.ts`) so a link already
sent in an email keeps decoding the way it did when it was sent. Decoding is
defensive throughout: a missing, truncated, or hand-typed fragment shows "This
link is incomplete" rather than a slip with fields silently missing.

`@page { size: A4; margin: 12mm }` and a print stylesheet hide the site's nav,
footer and floating WhatsApp button in print only — they stay on screen, so a
customer previewing their slip still has the ordinary way back to the rest of
the site.

`noindex`, excluded from `sitemap.xml`, disallowed in `robots.txt`: this is a
printable artefact for one specific enquiry, not a page anyone should find via
search.

---

## 7. Home page

- **Nav:** fixed, logo left, section anchors right, prominent "Get a Quote" → `/order`. Collapses to a mobile menu.
- **Hero:** headline, supporting line, primary CTA, and a one-line explanation of how the process works. First-time visitors must understand the model within five seconds.
- **How it works:** three or four steps, plain language, mirroring the wizard.
- **About:** who they are, why buy through them, credentials.
- **Brand strip:** featured logos only, linking to `/order?brand=<slug>` — *not* straight out to the manufacturer. From the home page we want them entering the wizard.
- **Repairs:** a summary section — what's repaired, what isn't, the free-estimate line, a CTA to `/repairs` — the same relationship to the repair booking that the brand strip has to `/order`. Static markup, no JavaScript, so it costs nothing against the script budget below (10.2).
- **About:** who they are, why buy through them, credentials.
- **Footer:** contact, company registration details, social links, privacy policy.
- **WhatsApp, twice, deliberately.** A button beside "Get a quote" in the hero — outlined, so the quote button stays the primary action — and the floating button in the corner.
- **The floating button waits on the home page.** It is withheld until the reader passes a cue at 50% of the how-it-works section, so it is not a second offer covering the page's own call to action. On `/order` and `/repairs` it appears immediately: there it is the escape hatch for an enquiry that cannot be sent (8.7 step 4), and delaying it would be harmful. The gate is CSS, declared by the section that owns the cue — applying it from the script showed the button for a frame on every load, because module scripts run after first paint.

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

**None of this applies to the repair booking.** `/repairs` asks no postcode
question at all — the customer is carrying the item to the counter, so there
is no delivery to serve and no address to confirm (rule 7, 5.3).

### 8.7 Submission (`submit.ts`) — highest-risk code in the project
1. POST to the form endpoint with a timeout.
2. On failure: retry twice with backoff.
3. Still failing: write to a `pending-enquiry` queue in `localStorage`, retry on next page load.
4. Show the customer an honest message with a WhatsApp button pre-filled with the whole enquiry, so the lead is never lost.
5. Only clear the enquiry after confirmed success.
6. Include in the payload: reference, all items (brand, raw input, parsed model, note), contact details, and metadata — brands clicked, time on page, entry URL. The payload is flat and string-valued: a form-to-email service renders nested objects as unreadable JSON, so items arrive as numbered lines.
7. An empty access key is reported as `unconfigured`, distinct from a network failure: nothing is posted, the enquiry is queued, and the customer is never told it was sent. A later build with the key delivers what is queued.
8. Queue entries are keyed by reference, so "Try again" replaces rather than duplicates, and a confirmed send removes the entry — otherwise the client is emailed the same enquiry twice.
9. **The enquiry being queued always survives the cap**, and the oldest are what make room. The reverse was true until 2026-09-16: the newest was appended and then sliced off the end, so a device holding ten entries silently discarded the enquiry that had just failed, while the screen said "Nothing has been lost".
10. **A response whose body cannot be read is not a delivery.** The abort signal covers the response stream, so a connection dropped mid-body lands there; it is retried, not believed. A body that is merely *not JSON* is still a success — some endpoints answer in HTML.
11. **The background retry re-reads the queue before writing it.** A pass can take a minute, and the customer is using the form throughout: writing back the snapshot it started with erased enquiries queued meanwhile and resurrected ones already delivered.
12. **The retry only completes the on-screen enquiry if the delivered payload still matches it.** Otherwise a customer who added an appliance after a failure had it deleted when the older payload got through.
13. **The queue is shared with the repair booking, and every entry carries a `kind` (`'quote'` or `'repair'`).** A retry pass posts each entry with the access key for *its own* inbox — quotes to `PUBLIC_WEB3FORMS_KEY`, repairs to `PUBLIC_WEB3FORMS_KEY_REPAIRS` — never the page's own key regardless of what is queued, since a repair queued on `/repairs` must still deliver if the customer's next visit happens to be to `/order`. **A queue entry with no `kind` at all — every entry written before repairs existed — is read as `'quote'`, never rejected.** Real customers' devices hold entries in that older shape; discarding them for a missing field would be exactly the loss rule 2.4 exists to prevent.

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

### 8.9a Bank holiday refresh
`scripts/fetch-bank-holidays.mjs` — pulls GOV.UK's own open-data feed
(england-and-wales division, no key, no cost) and writes
`src/data/bank-holidays.json`, which the repair drop-off slot picker
(`slots.ts`) reads to keep the shop closed on those dates. Run by hand, like
the link checker — a build that fails because gov.uk is down is a far worse
trade than a data file refreshed occasionally. The feed publishes roughly
three years ahead; the script only writes dates still in the future (the
picker's window has no use for 2019) and warns if fewer than 12 months of
runway remain — worth watching now the picker itself reaches six months
ahead (`repairs.json`'s `slots.daysAhead`), not a fortnight. Document it in
the README beside 8.9. One-off
closures the client sets themselves (not a published bank holiday) go in
`site.json`'s `closures` array instead.

### 8.10 Analytics events
Fire on: step view, brand click (with slug), paste success, paste failure, manual entry used, add-another used, item removed, validation error (with field), submit attempt, submit success, submit failure, WhatsApp click, abandonment step — plus, for the repair booking: category click, slot selected. `validation_error`, `submit_*`, `whatsapp_click` and `abandon` already cover both flows; a `page` property on the call (`'repairs'` vs. unset) distinguishes them rather than duplicating every event name.
This funnel tells the client which brands drive enquiries, which repair categories are most requested, and exactly where customers drop out of either flow.

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

**Resolved 2026-09-17: premium specialist.** The client confirmed the site
should present as a premium appliance specialist, not a general electricals
retailer (logged in `MISSING-ASSETS.md` 1.2). No copy or visual change follows
from this on its own — the restrained direction below was written to degrade
gracefully either way, and now has a confirmed answer to hold to.

The reference the client supplied (Euronics) is navy-and-yellow volume retail — take its *information architecture*, reject its aesthetic.

Target: generous white space, one restrained accent colour, confident typography, subtle borders rather than heavy shadows. Calm and expensive. If the finished page looks like a link farm or a discount retailer, it has failed.

Avoid: gradients, everything-rounded, drop shadows on cards, more than one accent colour, emoji in UI copy, exclamation marks.

### 9.2 Tokens
All in the `@theme` block at the top of `src/styles/global.css` — Tailwind 4 is configured in CSS, not in a JS config file. No arbitrary hex values in components, no magic numbers — add a token instead.

**Brand colours supplied 2026-09-10: blue, white and gold.** Deep navy rather than a bright blue, antique gold rather than a bright one — the muting is what separates this from the navy-and-yellow volume retail the client's own reference uses.

Gold is a documented exception to "one accent only" below. It is decoration, never an action: a hairline, a rule, a numeral. Two gold tokens exist because one cannot do both jobs — `--color-gold` is 3:1 and may only draw lines, `--color-gold-ink` is 4.6:1 and is the only gold a customer ever reads. `src/styles/tokens.test.ts` enforces both, and fails the build if either drifts.

### 9.3 Type
One family, or a serif for headings paired with a clean sans for body if the brand allows. Self-host the fonts (`woff2`, `font-display: swap`) — no Google Fonts CDN, since that carries a GDPR data-transfer question.

**Resolved 2026-09-17: Fraunces (headings) and Inter (body).** No brand fonts or guidelines exist; the client asked us to choose rather than wait. Both are self-hosted from `src/assets/fonts/` — downloaded once from Google's own archive, not loaded from `fonts.googleapis.com` at runtime, so the GDPR concern above does not apply. See `src/styles/global.css` and `MISSING-ASSETS.md` 2.

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
- Total JS < 40KB gzipped, per page. **Measured 2026-09-16, after the repair booking:** `/order` loads 15.8KB gzipped (its own script, 6.8KB, plus a Vite-extracted shared chunk of code common to both wizards, 9.0KB), `/repairs` loads 14.9KB (its own 5.9KB plus the same shared chunk), and `/repairs/label` loads under 1KB on its own. Every one of those is well inside the budget; the home page still ships 1.8KB of inline module script and nothing else — this addition touched no home-page script.
- The home page's three scripts are the nav toggle (351 bytes), the how-it-works sequence (1,206 bytes) and the floating WhatsApp button's reveal (286 bytes). The e2e suite names every script the home page is allowed to load, so a fourth cannot appear unnoticed — the list went from two to three deliberately, in the commit that added the button.
- **The how-it-works sequence is scroll-scrubbed, not observed.** This section previously described it as "one IntersectionObserver, 728 bytes, no scroll listener". That stopped being true when the client asked to slow the sequence down and it was rewritten to advance with the scroll position: it now uses a passive `scroll` listener throttled through `requestAnimationFrame`, and there is no IntersectionObserver left in it. It is still gated at `lg` and still degrades to a plain list without JavaScript. Measured TBT remains 0ms.
- **Fixed 2026-09-16: the sequence never actually advanced on a real desktop session.** `measure()` — the function that reads the track's height and its distance down the page — had only ever been called from inside the `resize` listener, never before the first render. `trackHeight` stayed `0`, `progress()`'s own guard against that returned `0` forever, and the sequence sat frozen on step one however far the reader scrolled, unless something happened to fire a `resize` event first. **The e2e suite had never caught it**, for the same reason: the headless browser ran with no `--window-size` set, defaulting to a viewport below the `lg` gate, so the entire desktop code path — where the bug lived — was dark on every run. Both are fixed together: `measure()` is called once before the initial `render()`, and `e2e-wizard.mjs` now launches at `1440x900` so a "desktop" check actually is one.
- Brand logos are raster, normalised to a common canvas by `scripts/prepare-logos.mjs` and served from `public/brands/` (see 9.4 for why they are not SVG). Lazy-load below the fold — but **not** the featured row, which is inside the first viewport on every size and was making the first images on the page the last requested.
- No layout shift on load (CLS < 0.05).

### 10.3 Browsers
Current Chrome, Safari, Firefox, Edge. **iOS Safari and Android Chrome are primary** — most traffic will be mobile. Clipboard behaviour must be verified on real iOS, not just a simulator.

### 10.4 SEO
Unique title and meta description per page, Open Graph and Twitter cards, `sitemap.xml`, `robots.txt`, `LocalBusiness` structured data. `/order` and `/repairs` should both be indexable — `/repairs` is a real landing page for repair searches — but the home page is the ranking target. `/repairs/label` is the one exception: `noindex`, excluded from `sitemap.xml`, disallowed in `robots.txt` — it is a printable slip for one specific enquiry, built from its own URL fragment, and has nothing to say to a search engine.

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
11. The repair booking (added 2026-09-16, after the site was otherwise live): `repairs.json`, the shared localStorage core extracted from `storage.ts` into `local-store.ts`, `submit.ts`'s queue gaining a `kind` field, the `/repairs` step shells, `slots.ts`, the printable label, the home page's Repairs section, `e2e-repairs.mjs`. Same phase discipline as above, and the existing quote wizard's own tests must still pass throughout — this touched shared modules.

### Rules of engagement
- **Ask before assuming.** Missing copy, a missing logo, an unclear behaviour — ask, or use a clearly marked placeholder and log it in `MISSING-ASSETS.md`. Never invent business facts, opening hours, credentials, or brand relationships.
- **Small commits**, one concern each, conventional-commit style.
- **No placeholder lorem ipsum in anything the client will see.** Use real copy from `copy.json`, or an obvious `[AWAITING COPY: hero headline]` marker.
- **Test both flows end to end after every change to either.** Including: refresh mid-flow, back button, add three items, submit with the network offline.
  - `npm run dev` in one terminal; `npm run test:e2e` (the quote wizard) and
    `npm run test:e2e:repairs` (the repair booking) in another. Both drive a
    real Chrome or Edge over the DevTools Protocol using Node's built-in
    WebSocket — no test framework, no browser-automation package. They share
    no code (each keeps its own copy of the small CDP driver) so either is
    readable on its own — extracting that driver into a shared module is a
    reasonable follow-up, just not done as part of adding the second suite.
  - `npm run test:e2e:repairs`'s online-delivery checks only run with
    `PUBLIC_WEB3FORMS_KEY_REPAIRS` set (MISSING-ASSETS.md) — without it, every
    submission correctly takes the `unconfigured` path, and the suite says so
    rather than silently skipping.
  - Neither covers iOS Safari, which is primary traffic (10.3). The clipboard
    behaviour in Phase 4 must be checked by hand on a real device.
  - `npm test` is the unit layer: pure logic only (filter matching, step
    guards, storage parsing, reference format, slot generation, label
    encode/decode).
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
- [x] Authorised-dealer status — **client confirmed 2026-09-17 that no
      authorised-dealer language will appear on the site**, so no written
      per-brand confirmation is being pursued; `authorised: true` stays as
      internal metadata only (`MISSING-ASSETS.md` 1.1)
- [x] Access to the Euronics brand asset pack — **client confirmed
      2026-09-17: none is coming; proceed with the logos already supplied
      and processed, as-is**
- [x] Positioning — **premium specialist, confirmed 2026-09-17**
      (`MISSING-ASSETS.md` 1.2)
- [x] Client logo (vector) — supplied 2026-09-11, in the nav and footer.
      **No reversed version for dark grounds exists or is coming** — client
      confirmed 2026-09-17 this is the only logo file. Do not design a dark
      section, dark footer, or dark-mode treatment for the lockup
      (`MISSING-ASSETS.md` 2)
- [ ] Logo files (vector) for each manufacturer
- [x] Brand colours — **blue, white and gold**
- [x] Fonts — **Fraunces + Inter, chosen 2026-09-17** (no client font or brand guidelines document exists — `MISSING-ASSETS.md` 2)
- [ ] Home page copy: hero, about, how-it-works
- [x] Enquiry destination email address — `info@princeselectronics.com`
- [x] WhatsApp Business number — **+44 7930 565656**, supplied 2026-09-15. This was the last thing standing between the site and rule 2.4: with no number, every WhatsApp button rendered nothing, so an enquiry that could not be sent had "Try again" and no second route out.
- [x] Opening hours — supplied 2026-09-15. Monday to Friday 09:00–17:00, Saturday 10:00–16:00. Sunday was not given and is **not** shown as closed: that would be inferring a business fact from a gap in a list. Stored structured in `site.json` so the footer and the `LocalBusiness` block render from one record.
- [x] Telephone — **+44 20 8204 1526**, supplied 2026-09-15. Now a live `tel:` link and in the structured data.
- [x] Delivery area — **United Kingdom only**, confirmed 2026-09-12. The country selector has been removed (8.6).
- [x] Trading name — **Princes Electronics**
- [x] Company registration number `07396672`, VAT `100 906 362`, registered office `23 Haverford Way, Edgware, Middlesex, HA8 6DJ`
- [x] Registered company name — **Princes Electronics** (same as the trading name)
- [x] Privacy policy — written and completed 2026-09-15 apart from the effective date, which is set on launch day. Retention is 18 months from last contact. **Still needs a read-through by whoever advises the business on data protection** — specifically the transfers clause (generic wording, not a checked position per provider) and the EU-reachability question in 8.6. ICO registration as data controller does **not** need confirming — client instruction, 2026-09-17.
- [ ] Domain, registrar access, and **existing MX records** (changing DNS carelessly will break their email)
- [x] Analytics — **deferred**, 2026-09-15. The client may build their own next year. No provider script is loaded, `track()` no-ops, and the privacy policy no longer describes analytics at all. The event wiring in `analytics.ts` stays: it is CLAUDE.md 8.10's list, it costs nothing while no provider is present, and naming a provider is the only step needed to turn it on.
- [x] Repair categories and exclusions — **confirmed 2026-09-16**: repairs
      TVs, all audio equipment, all DJ equipment, microwaves, smartphones;
      never washing machines, tumble dryers, fridges/freezers, dishwashers or
      ovens. In `repairs.json`.
- [x] Repair drop-off address, scheduling and pricing model — **confirmed
      2026-09-16**: drop off at the shop (23 Haverford Way, Edgware), any day
      the shop is open including Saturday, no minimum notice, repairs carried
      out on Saturdays, assessment is a free service and nothing is charged
      until a price is agreed. See `MISSING-ASSETS.md` 4.
- [ ] **A Web3Forms form for repairs@princeselectronics.com does not exist
      yet.** `PUBLIC_WEB3FORMS_KEY_REPAIRS` is unset, so every repair
      submission correctly reports `unconfigured` and queues on the device —
      nothing is lost, but nothing is delivered either. See
      `MISSING-ASSETS.md` 5.
- [ ] **Repairs copy needs sign-off.** Drafted 2026-09-16 from the three facts
      the client confirmed (free estimate, drop off at the shop, repaired on
      Saturdays) rather than the reference material supplied, which was a
      different business's copy. See `MISSING-ASSETS.md` 3.

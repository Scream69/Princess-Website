# Brand logos — where to get them

One row per brand in `src/data/brands.json`. Tick a brand off when its SVG
is in `src/assets/brands/`.

**What to save.** Vector SVG, one file per brand, named exactly as the slug
below — the filename is what `brands.json` points at, so `morphy-richards.svg`,
not `Morphy Richards logo FINAL.svg`. EPS or AI is fine to collect and convert;
PNG is a last resort and will look soft on a retina screen. Full colour on
white is what the grid expects.

**Do not source from** Brandfetch, seeklogo, worldvectorlogo, Wikipedia or
image search. Versions there are often a rebrand out of date, some are
hand-traced rather than the real mark, and none of them grant a licence —
which matters when the page shows sixty-five trademarks at once (CLAUDE.md 11).

**Ask for dealer confirmation in the same message.** Every brand is currently
flagged `"authorised": true` on an assumption (MISSING-ASSETS.md 1.1). A reply
that sends the logo pack for retail use is the written evidence that is still
outstanding.

---

## How this list was built

Each brand's own homepage was fetched and its links read, so every URL below
came out of the brand's own markup rather than being guessed. The links were
not opened, and no logo pack behind them has been confirmed — that part is
yours. Where a brand builds its footer in JavaScript, or refuses scripted
requests, nothing could be read and the brand is in section 3.

---

## 1. Brands with a press or brand-asset page (12)

Start here — these are public and usually carry a downloadable logo pack.

| | Brand | Save as | Page found |
|---|---|---|---|
| [ ] | Fisher & Paykel | `fisher-paykel.svg` | [Media Centre](https://www.fisherpaykel.com/uk/media-centre) |
| [ ] | Hotpoint | `hotpoint.svg` | [Press Enquiries](https://www.hotpoint.co.uk/press-enquiries) |
| [ ] | LG | `lg.svg` | [News and Media](https://www.lg.com/uk/about-lg/press-media/) |
| [ ] | Liebherr | `liebherr.svg` | [Presskit IFA 2026](https://www.liebherr.com/en-gb/n/presskit-ifa-2026-284992-4715716) |
| [ ] | Miele | `miele.svg` | [Press](https://www.miele.co.uk/m/index-p.htm) |
| [ ] | Samsung | `samsung.svg` | [Newsroom](https://news.samsung.com/uk) |
| [ ] | Sanus | `sanus.svg` | [Brand Assets](https://www.sanus.com/en_GB/media/brand-assets/) |
| [ ] | Sony | `sony.svg` | [Press Centre](https://www.sony.co.uk/presscentre) |
| [ ] | TCL | `tcl.svg` | [Press Contact](https://www.tcl.com/uk/en/contact-us-form/contact-presse) |
| [ ] | Toshiba | `toshiba.svg` | [Toshiba Europe Newsroom](https://www.toshiba.eu/newsroom/) |
| [ ] | Tower | `tower.svg` | [Media Centre & Affiliate Scheme](https://www.towerhousewares.co.uk/pages/media-centre) |
| [ ] | TP-Link | `tp-link.svg` | [News](https://www.tp-link.com/uk/press/news/) |

## 2. Brands with a trade or dealer route (4)

No public press page, but a trade login or dealer enquiry form — which is
where asset packs usually sit once you have an account.

| | Brand | Save as | Route |
|---|---|---|---|
| [ ] | AEG | `aeg.svg` | [Premier Partner](https://www.aeg.co.uk/local/premier-partner/) |
| [ ] | Avtex | `avtex.svg` | [Dealers Avtex HUB](https://services.avtex.co.uk/the-hub-login) |
| [ ] | CDA | `cda.svg` | [Trade Sales](https://www.cda.co.uk/trade-sales/) |
| [ ] | Montpellier | `montpellier.svg` | [Become A Retailer](https://www.montpellier-appliances.com/become-a-retailer/) |

## 3. Nothing readable from the homepage (51)

For these, in order: the Euronics asset library, then the account manager or
distributor, then the footer of the brand's own site opened in a browser — a
scripted fetch cannot see a footer that JavaScript builds, and several of
these sites refuse scripted requests outright.

| | Brand | Save as | Site | Fetch result |
|---|---|---|---|---|
| [ ] | ASKO | `asko.svg` | [uk.asko.com](https://uk.asko.com) | blocked (403) |
| [ ] | Audio Pro | `audio-pro.svg` | [uk.audiopro.com](https://uk.audiopro.com) | read, no asset link in it |
| [ ] | Beko | `beko.svg` | [www.beko.co.uk](https://www.beko.co.uk) | read, no asset link in it |
| [ ] | Belling | `belling.svg` | [www.belling.co.uk/en-gb](https://www.belling.co.uk/en-gb) | read, no asset link in it |
| [ ] | Blomberg | `blomberg.svg` | [www.blomberg.co.uk](https://www.blomberg.co.uk) | read, no asset link in it |
| [ ] | Candy | `candy.svg` | [www.candy-home.com/en_GB](https://www.candy-home.com/en_GB/) | read, no asset link in it |
| [ ] | Cata | `cata.svg` | [www.cata-appliances.co.uk](https://www.cata-appliances.co.uk) | read, no asset link in it |
| [ ] | Comfee | `comfee.svg` | [www.comfee.com/uk](https://www.comfee.com/uk) | unreachable |
| [ ] | Denon | `denon.svg` | [www.denon.com/en-gb](https://www.denon.com/en-gb/) | read, no asset link in it |
| [ ] | Dyson | `dyson.svg` | [www.dyson.co.uk](https://www.dyson.co.uk) | blocked (403) |
| [ ] | Freesat | `freesat.svg` | [www.freesat.co.uk](https://www.freesat.co.uk) | read, no asset link in it |
| [ ] | Fridgemaster | `fridgemaster.svg` | [www.fridgemaster.co.uk](https://www.fridgemaster.co.uk) | read, no asset link in it |
| [ ] | Haden | `haden.svg` | [www.haden.com](https://www.haden.com) | read, no asset link in it |
| [ ] | Haier | `haier.svg` | [www.haier-europe.com/en_GB](https://www.haier-europe.com/en_GB/) | read, no asset link in it |
| [ ] | Hisense | `hisense.svg` | [uk.hisense.com](https://uk.hisense.com) | blocked (403) |
| [ ] | Hoover | `hoover.svg` | [www.hoover-home.com/en_GB](https://www.hoover-home.com/en_GB/) | read, no asset link in it |
| [ ] | Humax | `humax.svg` | [uk.humaxdigital.com](https://uk.humaxdigital.com) | unreachable |
| [ ] | IceKing | `iceking.svg` | [www.ice-king.co.uk](https://www.ice-king.co.uk) | read, no asset link in it |
| [ ] | Indesit | `indesit.svg` | [www.indesit.co.uk](https://www.indesit.co.uk) | read, no asset link in it |
| [ ] | JVC | `jvc.svg` | [uk.jvc.com](https://uk.jvc.com) | read, no asset link in it |
| [ ] | KEF | `kef.svg` | [uk.kef.com](https://uk.kef.com) | read, no asset link in it |
| [ ] | Leisure | `leisure.svg` | [www.leisurecooker.co.uk](https://www.leisurecooker.co.uk) | read, no asset link in it |
| [ ] | Lenco | `lenco.svg` | [lenco.uk](https://lenco.uk) | read, no asset link in it |
| [ ] | Loewe | `loewe.svg` | [www.loewe.tv/uk](https://www.loewe.tv/uk) | blocked (403) |
| [ ] | Metz | `metz.svg` | [metzblue.com/en-GB](https://metzblue.com/en-GB/) | read, no asset link in it |
| [ ] | Midea | `midea.svg` | [www.midea.com/uk](https://www.midea.com/uk) | read, no asset link in it |
| [ ] | Morphy Richards | `morphy-richards.svg` | [www.morphyrichards.co.uk](https://www.morphyrichards.co.uk) | read, no asset link in it |
| [ ] | Ninebot | `ninebot.svg` | [uk-en.segway.com](https://uk-en.segway.com) | read, no asset link in it |
| [ ] | Ninja | `ninja.svg` | [www.sharkninja.co.uk](https://www.sharkninja.co.uk) | read, no asset link in it |
| [ ] | Numatic | `numatic.svg` | [numatic.com/uk](https://numatic.com/uk/) | read, no asset link in it |
| [ ] | NutriBullet | `nutribullet.svg` | [nutribullet.co.uk](https://nutribullet.co.uk) | read, no asset link in it |
| [ ] | Rangemaster | `rangemaster.svg` | [www.rangemaster.co.uk](https://www.rangemaster.co.uk) | blocked (403) |
| [ ] | Reflex Active | `reflex-active.svg` | [www.reflex-active.com](https://www.reflex-active.com) | read, no asset link in it |
| [ ] | Revitive | `revitive.svg` | [www.revitive.com](https://www.revitive.com) | read, no asset link in it |
| [ ] | Roberts Radio | `roberts-radio.svg` | [www.robertsradio.com/en-gb](https://www.robertsradio.com/en-gb) | read, no asset link in it |
| [ ] | Russell Hobbs | `russell-hobbs.svg` | [uk.russellhobbs.com](https://uk.russellhobbs.com) | blocked (405) |
| [ ] | Schönhaus | `schonhaus.svg` | [www.schonhaus.co.uk](https://www.schonhaus.co.uk) | read, no asset link in it |
| [ ] | Sebo | `sebo.svg` | [sebo.co.uk](https://sebo.co.uk) | blocked (403) |
| [ ] | Sensis | `sensis.svg` | [www.sensis.uk](https://www.sensis.uk) | read, no asset link in it |
| [ ] | Shark | `shark.svg` | [www.sharkninja.co.uk](https://www.sharkninja.co.uk) | read, no asset link in it |
| [ ] | Sharp | `sharp.svg` | [www.sharpconsumer.uk](https://www.sharpconsumer.uk) | read, no asset link in it |
| [ ] | Smeg | `smeg.svg` | [www.smeguk.com](https://www.smeguk.com) | read, no asset link in it |
| [ ] | Statesman | `statesman.svg` | [statesmanappliances.co.uk](https://statesmanappliances.co.uk) | read, no asset link in it |
| [ ] | Stoves | `stoves.svg` | [www.stoves.co.uk/en-gb](https://www.stoves.co.uk/en-gb) | read, no asset link in it |
| [ ] | Vax | `vax.svg` | [www.vax.co.uk](https://www.vax.co.uk) | read, no asset link in it |
| [ ] | Vispera | `vispera.svg` | — | no site |
| [ ] | Vivanco | `vivanco.svg` | [www.vivanco.com/en-eu](https://www.vivanco.com/en-eu) | read, no asset link in it |
| [ ] | White Knight | `white-knight.svg` | [www.whiteknight-home.com](https://www.whiteknight-home.com) | read, no asset link in it |
| [ ] | Woods | `woods.svg` | [www.woodsairmovement.com/en-gb](https://www.woodsairmovement.com/en-gb) | read, no asset link in it |
| [ ] | Zanussi | `zanussi.svg` | [www.zanussi.co.uk](https://www.zanussi.co.uk) | read, no asset link in it |
| [ ] | Zenith | `zenith.svg` | — | no site |

---

## When they arrive

Drop the SVGs into `src/assets/brands/` and say so. Per brand I then set the
`logo` field in `brands.json` and tune `opticalScale` by eye — the multiplier
that makes a tall stacked mark and a long wordmark read at the same visual
weight (CLAUDE.md 9.4). That tuning is what separates the grid from a row of
images forced to the same box width, and it cannot be done before seeing the
file.

They do not need to arrive together. Anything still missing keeps rendering
the documented text fallback, so batches of ten are fine.

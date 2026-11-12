# Gift Guide — Shopify Theme Development Task

Implementation of a Figma design as a standalone **"Gift Guide"** page on a Shopify store running the **Dawn** theme (v16.1.1).
The page is built from **two new, from-scratch sections** (Banner + Grid) and a **quick-view popup** with a working **Add to cart**.

- **Live page:** https://amrit-podder-48-teststore.myshopify.com/pages/gift-guide *(store is password-protected)*
- **Design:** Figma — desktop (1440px) and mobile (375px) frames, popup and component states
- **Pull request:** `development` → `master`

---

## Table of contents

1. [The task](#1-the-task)
2. [Requirements checklist](#2-requirements-checklist)
3. [Tech stack](#3-tech-stack)
4. [Architecture](#4-architecture)
5. [Banner section](#5-banner-section)
6. [Grid section](#6-grid-section)
7. [Quick-view popup (JavaScript)](#7-quick-view-popup-javascript)
8. [Add to cart & auto-add rule](#8-add-to-cart--auto-add-rule)
9. [Styling & responsive behaviour](#9-styling--responsive-behaviour)
10. [Accessibility](#10-accessibility)
11. [Performance](#11-performance)
12. [Store configuration](#12-store-configuration)
13. [Setup & deployment](#13-setup--deployment)
14. [Testing](#14-testing)
15. [Git workflow](#15-git-workflow)

---

## 1. The task

Build the page from the Figma file **pixel perfect**, as a **separate page** in the store, split into **two Shopify sections**:

| Part | Brief |
|---|---|
| **Banner** | Top bar, hero and bottom strip. All texts marked in the design must be **editable from the theme customizer**. **Buttons must be animated.** |
| **Grid** | **Six blocks**, one product each; products must be **selectable from the customizer**. Each image has a "+" hotspot. |
| **Popup** | Opens from a hotspot. Shows the product **name, price, description and variants**. Variants must be **rendered dynamically from product data**. **ADD TO CART** must add the product to the cart. |
| **Special rule** | When a product with the variant options **Black** and **Medium** is added to the cart, **"Soft Winter Jacket"** must be added automatically. |
| **Mobile** | Dedicated mobile layout from the Figma mobile frame. |

**Constraints**

- **No ready-made Dawn sections or components** — both sections are written from scratch.
- **Vanilla JavaScript only** — no jQuery.
- Code is evaluated on **structure, comments and efficiency**.

---

## 2. Requirements checklist

| Requirement | Status | Where |
|---|---|---|
| Separate page | ✅ | `templates/page.gift-guide.json` assigned to the *Gift Guide* page |
| Two new sections, no Dawn reuse | ✅ | `sections/gift-guide-banner.liquid`, `sections/gift-guide-grid.liquid` |
| Banner texts editable in customizer | ✅ | 11 text/url settings (logo, tagline, buttons, heading, copy, strip + mobile variants) |
| Animated buttons | ✅ | `snippets/gg-button.liquid` + `assets/gg-button.css` |
| Six products selectable in customizer | ✅ | `product` blocks, `max_blocks: 6` |
| Popup: name, price, description, variants | ✅ | `assets/gg-grid.js` |
| Variants rendered dynamically | ✅ | Built from per-product JSON (`snippets/gg-product-data.liquid`) |
| Functional Add to cart | ✅ | AJAX Cart API `POST /cart/add.js` |
| Black + Medium → add Soft Winter Jacket | ✅ | `shouldAutoAdd()` in `assets/gg-grid.js`, configurable in section settings |
| Mobile view | ✅ | `@media (max-width: 749px)` layouts in section CSS |
| Vanilla JS, no jQuery | ✅ | One ES2020 custom element |

---

## 3. Tech stack

| Layer | Technology |
|---|---|
| Platform | Shopify **Online Store 2.0** (JSON templates, sections, blocks, theme editor) |
| Base theme | Dawn v16.1.1 (used only as the host theme — nothing reused on this page) |
| Templating | **Liquid** — `{% render %}` snippets with LiquidDoc headers, `image_url` / `image_tag`, `money`, `placeholder_svg_tag`, `preload_tag` |
| JavaScript | **Vanilla JS (ES2020)** — Custom Elements, native `<dialog>`, `fetch`, event delegation |
| Styling | Plain **CSS** — custom properties, CSS Grid/Flexbox, `:where()`, `aspect-ratio`, `prefers-reduced-motion` |
| Cart | Shopify **AJAX Cart API** (`/cart/add.js`) |
| Fonts | **Jost** (300–500, variable) and **Lustria** (400), self-hosted `woff2` |
| Tooling | Shopify CLI (`theme check`, `theme push`, `theme publish`), GitHub integration for deployment |

---

## 4. Architecture

```
layout/
  gift-guide.liquid            Standalone layout (no Dawn header/footer/base.css/global.js)
templates/
  page.gift-guide.json         Page template: banner + grid
sections/
  gift-guide-banner.liquid     Section 1 — Banner
  gift-guide-grid.liquid       Section 2 — Grid + <dialog> popup
snippets/
  gg-button.liquid             Animated button (renders <a> or <button>)
  gg-icon.liquid               Inline SVG icons from Figma (currentColor)
  gg-product-data.liquid       Compact product JSON for the popup
assets/
  gg-button.css                Button + hover animation
  gg-banner.css                Banner styles
  gg-grid.css                  Grid + popup styles
  gg-grid.js                   <gg-product-grid> custom element
  gg-hero-top.svg              Desktop illustration (upper)
  gg-hero-bottom.svg           Desktop illustration (lower)
  gg-hero-mobile.svg           Mobile illustration
  gg-jost.woff2, gg-lustria.woff2
```

**Request flow**

```
/pages/gift-guide
  └─ template page.gift-guide.json  ("layout": "gift-guide")
       ├─ gift-guide-banner   → static HTML from settings (no JS)
       └─ gift-guide-grid     → 6 tiles + embedded product JSON + <dialog>
                                  └─ gg-grid.js: hotspot click → render popup → /cart/add.js
```

**Conventions**

- All CSS classes are prefixed with **`gg-`** (BEM-style: `gg-banner__heading`, `gg-btn--dark`) so nothing collides with Dawn.
- Sections are restricted to page templates via `"enabled_on": { "templates": ["page"] }` and ship with presets, so they can also be added from the theme editor.
- Each section loads only its own stylesheet/script.

---

## 5. Banner section

`sections/gift-guide-banner.liquid`

**Customizer settings**

| Setting | Default |
|---|---|
| Logo text | `TISSO VISON` |
| Tagline | `Find the ideal gift for your loved ones.` |
| Top button label / link | `Choose gift` / `/collections/all` |
| Heading | `The Gift Guide` |
| Description / Description (mobile) | Long copy / shorter mobile copy |
| Hero button label / link | `Shop now` / `/collections/all` |
| Strip text / Strip text (mobile) | `SUSTAINABLE, ETHICALLY MADE CLOTHES IN SIZES XXS TO 6XL` / `… ACTIVEWEAR` |

**Implementation notes**

- **Desktop:** 3-column grid top bar (logo · tagline · button), 780px hero with two SVG illustrations positioned from the Figma coordinates, bottom strip.
- **Mobile:** the top bar becomes a hamburger header; the menu is a native **`<details>`/`<summary>`** disclosure, so it works with **zero JavaScript**. The hero switches to a centred layout with a dedicated mobile illustration.
- **Button animation** (`gg-button.css`): a `::before` layer scales on the X axis from the left (`transform: scaleX()`), the label colour cross-fades and the arrow slides 5px. Dark buttons fill with yellow (`#FFF544`); yellow buttons drain to black. Disabled for `prefers-reduced-motion`.
- **Homepage:** the same banner section is enabled on the `index` template and replaces Dawn's image banner; the store's main menu links to the Gift Guide page. Fonts live in `assets/gg-fonts.css`, so the section renders identically inside Dawn's layout.

---

## 6. Grid section

`sections/gift-guide-grid.liquid`

**Section settings**

| Setting | Purpose |
|---|---|
| Title | `Tisso vison in the wild` |
| Popup button label | `Add to cart` |
| Product to add automatically | Defaults to **Soft Winter Jacket** |
| Trigger colour | `Black` |
| Trigger size(s) | `M, Medium` (comma-separated) |

**Block settings (×6, `max_blocks: 6`)**

| Setting | Purpose |
|---|---|
| Product | Product picker |
| Hotspot horizontal / vertical position | Places the "+" button on the image (desktop), as in Figma |

**Implementation notes**

- Images use `image_url` + `image_tag` with a responsive `srcset`/`sizes` and `loading="lazy"`.
- Hotspot coordinates are passed as CSS custom properties (`--gg-hotspot-x / -y`) — no inline positioning logic in JS.
- Each tile embeds its product data as `<script type="application/json">`, rendered by `snippets/gg-product-data.liquid`. Only what the popup needs is output (title, formatted price, trimmed description, image, options, swatches, variants) — much lighter than `{{ product | json }}`.
- Prices are formatted **server-side** with the `money` filter, so the store's money format (`980,00€`) is respected without client-side formatting.

---

## 7. Quick-view popup (JavaScript)

`assets/gg-grid.js` — a single custom element, **`<gg-product-grid>`**.

**Why a custom element?** It initialises itself in `connectedCallback`, so it works on page load *and* when the theme editor re-renders the section — no `shopify:section:load` wiring needed.

**Flow**

1. **Event delegation** — one `click` listener on the section handles hotspots, close button and backdrop, regardless of block count.
2. **`open(product)`** fills the popup from the embedded JSON and calls `dialog.showModal()`.
3. **Options are rendered by name, in Figma order** (colour first):
   - `Color` / `Colour` → **radio-group buttons** (`role="radiogroup"` / `role="radio"`, `aria-checked`) with a 5.8px swatch bar. The active value is **filled black across the whole button, swatch bar included**; switching **slides** that fill to the new value while the labels cross-fade, and the very first pick fades in place — matching the Figma prototype's Smart Animate (**300ms, ease-out**). Position is driven by CSS custom properties (`--gg-selected`, `--gg-count`), so it works for any number of values.
   - Any other option (e.g. `Size`) → **custom dropdown** (`button` + `role="listbox"`), keyboard operable (↑ ↓ Enter Space Esc Tab).
   - Options with a single value are pre-selected.
4. **`currentVariant()`** matches the selected values against `variant.options`; **`updateVariant()`** syncs price and sold-out state.
5. **Swatch colour resolution** (`swatchColor()`):
   1. Shopify **native swatch** colour on the option value (if set in admin)
   2. **Figma palette** — Blue `#0D499F`, Red `#B20F36`, Grey `#AFAFB7`, Black, White
   3. Value as a **CSS colour name** (validated with `CSS.supports`)
   4. Neutral fallback `#C4C4C4`
6. **Closing** — ✕ button, backdrop click, or Esc (Esc closes an open dropdown first). Focus returns to the hotspot that opened the popup.

Variant data is never hard-coded — every name, value, price and availability comes from the product.

---

## 8. Add to cart & auto-add rule

```js
POST {{ routes.cart_add_url }}.js
Content-Type: application/json

{ "items": [
    { "id": <selected variant>, "quantity": 1 },
    { "id": <Soft Winter Jacket variant>, "quantity": 1 }   // only when the rule matches
] }
```

- **Validation:** all options must be chosen ("Please choose your size."), and the variant must be available.
- **Auto-add rule** — `shouldAutoAdd(variant)`:
  - the variant's options include the **trigger colour** (`Black`) **and** one of the **trigger sizes** (`M`, `Medium`);
  - comparison is case-insensitive;
  - the extra item is sent **in the same request** (one round trip, atomic);
  - the auto-add variant is the selected/first available variant of the configured product, output by Liquid as `data-auto-add-variant`.
- **Feedback:** live region message ("Added to cart. View cart"), errors from the Cart API are surfaced, the button is disabled with `aria-busy` while the request is in flight.
- A `gg:cart-updated` event is dispatched on `document` so other components could react.

---

## 9. Styling & responsive behaviour

| Breakpoint | Behaviour |
|---|---|
| **≥ 1100px** | Desktop layout from the 1440px frame; content capped at 1440px and centred |
| **750–1099px** | Desktop composition with tighter top bar |
| **< 750px** | Mobile frame: hamburger header, centred hero, 2-column grid (4px gap), fixed hotspot position |

**Design tokens from Figma**

| Token | Value |
|---|---|
| Yellow | `#FFF544` |
| Grey bars | `#F5F5F5` (mobile header `#F7F7F7`, menu panel `#F2F2F2`) |
| Labels | `#333333` |
| Heading | Jost Medium 70px / 30px mobile |
| Body | Jost Regular 16–20px |
| Popup name / description | Jost Light 16px / 14px |
| Grid title, prices | Lustria Regular 36px / 24px mobile, 16px |
| Grid tile | 433 × 444 (desktop), 169 × 186 (mobile) |
| Popup | 319 × 455 |

Base button rules use **`:where(.gg-btn)`** (zero specificity) so section-level modifiers always win regardless of stylesheet load order — no `!important` anywhere.

---

## 10. Accessibility

- Native `<dialog>` with `aria-labelledby`, focus trap and Esc handling from the browser.
- Hotspots are real `<button>`s with `aria-label="Quick view: <product>"` and `aria-haspopup="dialog"`.
- Colour options use `radiogroup`/`radio` semantics; the size dropdown uses `listbox`/`option` with `aria-expanded` and `aria-selected`.
- Status/error messages use `role="status"` + `aria-live="polite"`.
- Visible `:focus-visible` outlines; decorative SVGs are `aria-hidden`.
- Animations respect `prefers-reduced-motion`.

---

## 11. Performance

- **No dependencies**, one small JS file loaded with `defer`, only on this page.
- **Self-hosted fonts** (Jost variable font covers 300–500 in one file) with `preload` and `font-display: swap`.
- Lean custom layout: Dawn's `base.css`, `global.js`, header and footer are **not** loaded.
- Responsive, lazy-loaded product images; illustrations are SVG.
- Product JSON is trimmed to the fields the popup needs.

---

## 12. Store configuration

| Setting | Value |
|---|---|
| Store currency | **EUR** |
| Money format | `{{amount_with_comma_separator}}€` → `980,00€` (as in Figma) |
| Theme setting | `currency_code_enabled: false` (no "EUR" suffix) |
| Page | *Gift Guide* → template `gift-guide` |
| Grid products | Black Leather Bag, Blue Silk Tuxedo, Chequered Red Shirt, Classic Leather Jacket, Classic Varsity Top, Dark Denim Top |
| Colour variants (per Figma) | White/Black, Blue/Black, Red/Grey, White/Black, Grey/Black, Blue/Black |
| Auto-add product | Soft Winter Jacket (`dark-winter-jacket`) |

---

## 13. Setup & deployment

1. **Connect the repo** — Online Store → Themes → Import → **Connect from GitHub** → select the branch → **Publish**.
2. **Create the page** — Online Store → Pages → *Add page* (e.g. "Gift Guide") → **Template: `gift-guide`** → Save.
3. **Configure** — in the theme customizer, pick the six products in *Gift Guide grid* and, if needed, the auto-add product and trigger values.

**Local development**

```bash
shopify theme dev --store <store>.myshopify.com
```

```bash
shopify theme check
```

---

## 14. Testing

| Scenario | Expected | Result |
|---|---|---|
| Desktop layout vs Figma 1440 frame | Positions/sizes match (hero text at y 425/545/679, tiles 433×444, hotspots per design) | ✅ |
| Mobile layout vs Figma 375 frame | Hamburger, centred hero, 2-column grid | ✅ |
| Hamburger menu | Opens/closes panel with tagline + CHOOSE GIFT | ✅ |
| Popup content (×6) | Name, price, description, colour swatches, sizes from product data | ✅ |
| Swatch colours | Bars match Figma hex values | ✅ |
| Add Black / M | Cart = product **+ Soft Winter Jacket** | ✅ |
| Add non-matching variant (e.g. White / S) | Cart = product only | ✅ |
| Missing option | Message "Please choose your size." | ✅ |
| Close popup | ✕, backdrop, Esc | ✅ |
| `shopify theme check` | No offenses in the new files | ✅ |

---

## 15. Git workflow

| Branch | Content |
|---|---|
| `master` | Clean Dawn v16.1.1, connected to the store via the GitHub integration |
| `development` | Gift Guide implementation — connected and published as the live theme |

Work is submitted as a **pull request from `development` into `master`**.

---

Base theme: [Dawn](https://github.com/Shopify/dawn) by Shopify — see `LICENSE.md`. Fonts Jost and Lustria are licensed under the SIL Open Font License.

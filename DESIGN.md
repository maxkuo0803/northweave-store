# DESIGN — 北織 NORTHWEAVE「布市攤位」

The store is a stall at a Taiwanese fabric market (永樂布市): garments hang on a steel rail over galvanized pegboard, each with a kraft cardboard price tag clipped by a wooden clothespin, prices written in marker. Rules and forms are white notice paper pinned to the board; news and sales are fluorescent card stock.

## Tokens (`src/app/globals.css` `@theme`)

| Token | Value | Role |
|---|---|---|
| `ink` | `#161514` | marker black: text, primary buttons, selected chips |
| `muted` | `#555a5e` | secondary text (≥4.5:1 on `paper` and `card`) |
| `paper` | `#e4e7e8` | page ground on operate pages (light galvanized) |
| `board` | `#a7adb1` | pegboard (storefront ground, `pegboard` utility) |
| `rail` | `#4a5054` | steel rail, hooks, footer shutter |
| `card` | `#fbfbf8` | white notice paper (`card` utility) |
| `kraft` / `kraft-dark` | `#c69c66` / `#8d6a3e` | cardboard tags (`kraft-tag` utility) |
| `neon` | `#efeb2a` | fluorescent card (`neon-card`), announcement strip, text selection |
| `banner` | `#c9252b` | red canvas stall banner (header only) |
| `mark` | `#d01f26` | red marker: ONE decisive mark per view |
| `ok` / `warn` / `bad` | `#1d6b3a` / `#8a5a00` / `#b3171d` | status |

Legacy aliases `brand` → ink, `accent` → mark, `sand` → `#d6dadc` image ground.

## Type
- Noto Sans TC 400/500/700/900. Signage and headings are 900 (`font-black`); body 400.
- Permanent Marker (`font-marker`) only for product codes (NW001), prices, counts and other short Latin/numeral marks written "by hand". Never for sentences.

## Rules
- Corners are rounded on a two-step scale (changed 2026-11-08 from square, at the owner's request for a more modern feel):
  - `rounded-card` (20px): panels and cards (`card`, `neon-card`, list panels). Kraft hang tags and option tiles use `rounded-2xl` (16px).
  - `rounded-sm` (10px): buttons, inputs, chips, alerts, thumbnails, swatches.
  - `rounded-full`: badges, the header search field, breadcrumbs, dots and progress bars.
  - The clothespin stays sharp (2px); it is a physical clip, not UI.
- Depth is paper depth: a 1–2px contact line plus a soft blurred drop (`card`, `kraft-tag`, `neon-card`). No hard offset block shadows.
- Red (`mark`) is reserved for the single decisive mark of a view: the sale price, the add-to-cart / checkout / place-order button, the marker circle on a chosen size. Regular prices are black marker.
- Tags hang at small fixed tilts (−5°…+5°, deterministic by index) from `transform-origin: top`; they never tilt at random per render.
- Storefront pages (home, catalog, product, auth, FAQ, 404) sit on `pegboard`. Account, cart, checkout and admin sit on `paper` with `card` panels: the world shows in tags, chips and the marker mark, not in decoration.
- Garment images are transparent SVG silhouettes (`/api/garment/[type]?c=HEX&v=2`) with their own drop shadow; they hang directly on whatever ground they are placed on.
- No eyebrow labels above headings, no Unicode glyphs as icons (draw an SVG), no gradients on text.

## Signature interactions
- **Swing:** a tag on hover/focus swings on its clothespin (`swing-tag` + `swing-on-hover`, 900ms ease-out, disabled under reduced motion).
- **Size tags:** every size is present; sold-out sizes are grey, struck through and disabled; the chosen size is circled by a red marker stroke drawn in 350ms.
- **Sold-out product:** the tag turns grey and reads 售完・等補貨 instead of disappearing.

## Components
- `ProductCard` (`src/components/ProductCard.tsx`): rail segment + hook + garment + kraft tag (code, name, price, color dots), optional neon 特價 card. `Rail` lays cards in rows; each card draws its own rail segment so every row gets a rail.
- `Header`: neon announcement strip, red banner with scalloped edge, kraft cart counter.
- `Footer`: dark rolling-shutter stripes.
- Buttons: `btn-primary` (ink), `btn-mark` (red, one per view), `btn-outline`, `btn-danger`.

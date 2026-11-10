# DESIGN — 北織 NORTHWEAVE「老布行 × 現代精品」

Redesigned 2026-11-10. The previous "布市攤位" look felt like a toy: every card tilted, a cartoon marker font, full-strength pegboard everywhere, and kraft tags covering half of each garment. The fix keeps the Taiwanese market world (galvanized pegboard, steel rail and hooks, kraft tags, red banner, fluorescent yellow, LED ticker) but presents it like a boutique: lots of space, big serif headlines, nothing tilted, faint shadows, one focal point per view.

## Tokens (`src/app/globals.css` `@theme`)

| Token | Value | Role |
|---|---|---|
| `ink` | `#151413` | text, primary buttons, selected states |
| `muted` | `#5f5b54` | secondary text (≥4.5:1 on `paper`) |
| `paper` | `#f3f1eb` | page ground (warm white) |
| `card` | `#fcfbf7` | cards |
| `sand` | `#e9e5db` | quiet fills (segmented control track) |
| `line` | `#ddd8cd` | hairlines |
| `board` | `#c3c7c7` | full pegboard (`pegboard`: hero, auth, 404) |
| `rail` | `#3a3f42` | rail, hooks, footer |
| `kraft` | `#c9a06b` | kraft tags (`kraft-tag`) |
| `neon` | `#ece63a` | LED ticker text, demo-account card, sale price on dark |
| `mark` | `#c8222a` | Taiwan red: ONE decisive mark per view |

Utilities: `container-x` (max-w-7xl, 20/32px gutters), `pegboard`, `pegboard-soft` (faint board used as the product stage), `card`, `kraft-tag`, `neon-card`, `display`, `num`, `btn-*`, `input`, `badge`.

## Type
- **Headlines:** Noto Serif TC 900 via `display` (`font-serif`), like an old shop sign. Scale with `clamp()`: hero 40–80px, section 32–56px, page title 36–64px.
- **Body:** Noto Sans TC 400/700, 15–16px, line-height ≥1.7 for paragraphs.
- **Numbers and codes:** IBM Plex Mono (`font-mono`, tabular), like a Taiwanese receipt: prices, product codes, counts, stats. `font-marker` is a legacy alias of mono. No handwriting fonts.
- Avoid CJK punctuation at the end of display headlines; break lines with `block whitespace-nowrap` spans.

## Rules
- **Nothing tilts.** No `rotate-*` on cards, tags or headings. Motion supplies the life: tags swing on hover, hero garments sway.
- **Radius:** `rounded-card` 20px for cards and stages, `rounded-sm` 10px for inputs, size buttons and thumbnails, `rounded-full` for buttons, chips, badges and search.
- **Depth:** hairline border plus a very soft long shadow (`card`). No hard offset shadows.
- **Red** goes to one thing per view: add-to-cart / checkout button, sale price, discount badge. Selected filters and sizes use ink, not red.
- **Pegboard** at full strength only on immersive grounds (home hero, login, register, 404). Product stages use `pegboard-soft`. Lists, account, cart, checkout and admin sit on `paper`.
- **Spacing:** sections are 96–128px apart (`pt-24 md:pt-32`); product grid gaps are 16/24px horizontal and 40/56px vertical.
- Garment images are transparent SVG silhouettes (`/api/garment/[type]?c=HEX&v=2`).
- Icons are inline SVG; no emoji or Unicode glyphs as icons. No eyebrow labels, no gradient text.

## Motion (all disabled under `prefers-reduced-motion`)
- **LED ticker** (`Marquee`): store rules scroll in the header (mono, neon on ink); a big red serif banner ticker sits under the home hero. Pauses on hover.
- **Hero rail** (`src/app/HeroRail.tsx`): three featured garments sway on the rail; on mouse move they shift by depth (parallax).
- **Reveal** (`src/components/motion/Reveal.tsx`): sections fade up when scrolled into view, staggered 60–90ms. Content already on screen at load is never hidden.
- **Hover:** card garment lifts 6px and scales 3%, its code tag swings; buttons scale to 0.98 on press. Color-change animations move only transform, never opacity (a paused animation must not hide the image).

## Components
- `ProductCard`: 4:5 `pegboard-soft` stage with a rail, hook, garment, small kraft code tag and discount pill, then name, color dots and mono price underneath. `tone="dark"` for dark sections.
- `Header`: sticky; LED ticker, red seal logo (北織 stacked in serif), pill nav, search, account and bag icons with a red count bubble. On mobile, categories become a horizontal pill row.
- `Footer`: dark rail ground, link columns, and a full-width SVG `NORTHWEAVE` wordmark clipped at the bottom.
- Product page: sticky stage with per-color thumbnails on the left; on the right a code, serif name, star rating, mono price, round color swatches, ink size buttons, a − n + stepper, a full-width red add-to-cart button and three reassurance lines.
- Buttons: `btn-primary` (ink pill), `btn-mark` (red pill, one per view), `btn-outline`, `btn-danger`.

## 小織 (AI clerk), added 2026-11-10
The shop is **conversation-first**: by default the home page *is* 小織, the AI clerk. Shoppers who prefer browsing pick 「自己逛」.
- **Shop mode** is stored in the `nw_mode` cookie (`concierge` by default, or `browse`), read on the server (`src/lib/shop-mode.ts`) so the page never flashes the wrong version. `ModeSwitch` sits in the header (xl+) or in the category row (smaller screens).
- **Orb** (`XiaozhiOrb`): a glowing yarn ball, with neon, kraft and white threads circling a dark core. States: `idle` breathes slowly, `listening` pulses, `thinking` spins fast, `speaking` throbs. It replaces the cardboard robot face in all chat UI. Static under reduced motion.
- **Surface** (`XiaozhiSurface`), Siri-style, on an `ink` ground: no chat bubbles. The shopper's words sit right-aligned in `white/60`; 小織's words sit left in large white type. Older turns fade to 60%. Product cards stay as light `card`s on the dark ground. The input pill is pinned at the bottom with a neon mic button (browser speech recognition, zh-TW) that becomes a send button once text is typed.
- **Home stage** (`src/app/Concierge.tsx`): a big orb, a serif greeting, quick chips and "today's" three garments in the empty state. The page scrolls naturally and the input stays sticky (the section uses `overflow-clip`, not `hidden`).
- **Other pages**: the orb floats bottom-right. Click it or press ⌘K / Ctrl+K and a dark sheet rises over a dimmed, blurred page. Esc closes it and focus returns to the orb. The greeting, hint and nudge cards still pop out of the orb.
- **Voice**: if the shopper speaks, 小織 answers aloud (speechSynthesis). The speaker toggle makes her always read replies aloud. Both are free browser APIs.
- One conversation is shared site-wide through `XiaozhiProvider` (layout).

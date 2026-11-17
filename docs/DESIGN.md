# Design standard

Pour Finder is used on a phone, one-handed, in a dark bar. The visual identity
(paper, ink, one amber, enormous prices) is ours; the rules underneath it are
borrowed from two standards so that they aren't re-decided per component.
[ADR-0011](adr/0011-hig-and-lucide-as-the-ui-standard.md) records why.

| Concern | Standard | Where it lives |
|---|---|---|
| Sizing, type, touch, safe areas | [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/) | `@theme` in `src/app/globals.css` |
| Icons | [Lucide](https://lucide.dev) (`lucide-react`) | Imported per component |
| Tokens and utilities | Tailwind v4 | `src/app/globals.css` |

---

## Rules

**Touch targets are 44pt.** Every button, chip, select and input clears
`--spacing-touch` (2.75rem). `.pf-button`, `.pf-chip` and `.pf-input` already
do; anything hand-rolled uses `min-h-touch` / `size-touch`. Don't use
`min-h-9` or `size-9` for a control.

**Type comes from the ramp.** Tailwind's size names are remapped onto the HIG
text styles, so `text-sm` *is* Subheadline:

| Class | HIG style | Size / leading | Typical use |
|---|---|---|---|
| `text-2xs` | Caption 2 | 11 / 13 | Price per ounce, ad label, media captions |
| `text-xs` | Caption 1 | 12 / 16 | Meta rows, section labels, hints |
| `text-sm` | Subheadline | 15 / 20 | Buttons, chips, secondary copy |
| `text-base` | Body / Headline | 17 / 22 | Body text, card titles |
| `text-lg` | Title 3 | 20 / 25 | Sheet titles, wordmark |
| `text-xl` | Title 2 | 22 / 28 | Empty-state and section headings |
| `text-2xl` | Title 1 | 28 / 34 | Page titles |
| `text-3xl` | Large Title | 34 / 41 | Reserved |

No `text-[Npx]`. The one exception is the price hero in `PriceBlock`, which is
display type and steps down as the number gets longer.

**Icons are Lucide, never glyphs or emoji.** `⌕ ◎ ⚙ ＋ × 👍 📷` render
differently on every platform, and an emoji in place of an icon is the
clearest sign that nobody designed the screen. Size icons with `size-*`
(`size-4` beside `text-sm`, `size-3.5` in caption rows). Lucide marks them
`aria-hidden`, so the control still needs a text label or an `aria-label`.

**The brand mark is `LogoMark`**, the same drawing as `src/app/icon.svg`.

---

## Screen sizes

Use CSS to adapt as the window changes size. The layout can change mid-session
when a foldable opens or closes.

| Viewport | Layout |
|---|---|
| Below 656px, or 656–767px and below 480px tall | One pane at a time with a List/Map switch |
| 656–767px and at least 480px tall, or 768–1023px | List and map side by side |
| 1024px and wider | List `clamp(380px, 32vw, 480px)`, map fills |

### iPhone Duo

The outer display and narrow Split View windows use the List/Map switch.
Both orientations of the inner display have room for two panes. Browsers
that report horizontal viewport segments position the list at the first
segment's width. In wider landscape layouts, sheets dock beside the list.
The map fits the results when it first appears and keeps its position on
subsequent resizes.

For browser testing, use the [Safari 27.1 viewport sizes published by WebKit](https://webkit.org/blog/18486/#viewport-sizes).
Test the outer screen at 382×580 and 594×368, the inner screen at 669×867
and 951×585, and Split View at 385×571. Resize between compact and wide
views without reloading to check that the search and selection persist.

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

The layout is driven by width, with one height-aware variant. Never read
`window.innerWidth` once and cache it: a foldable changes width mid-session
with no rotation event. Use CSS, or listen to `matchMedia(...).change`.

| Width | Layout | Devices |
|---|---|---|
| < 768px | One pane at a time, List/Map switch | Phones; iPhone Duo folded (~466px) and in Split View (~445px); Duo unfolded and rotated (~626px) |
| 768–1023px | List and map 50/50 | iPhone Duo unfolded (~890×626), iPad portrait |
| ≥ 1024px | List `clamp(380px, 32vw, 480px)`, map fills | iPad landscape, laptops |

### iPhone Duo

The Duo's inner screen opens in landscape at roughly 890×626 CSS px, with the
hinge down the middle. Safari reports neither the Viewport Segments API nor
the Device Posture API, so the page can't detect the fold. The layout is
built so that it doesn't need to:

- **The 50/50 split lands on the crease**, so list and map each get one half
  and no card straddles the hinge. Browsers that do report segments
  (`horizontal-viewport-segments: 2`, Chrome on Android foldables) get the
  exact hinge width from `env(viewport-segment-width 0 0)`.
- **Sheets dock to the right half** on a `spread` screen (768–1023px wide,
  landscape) rather than centring over the crease. They cover the map, and the
  list on the left keeps updating as filters change.
- **Chrome is one row from `md` up.** The result count and sort join the
  filter bar. On phones they sit at the top of the list and scroll away,
  because the folded screen is shorter than any recent iPhone's.
- **Unfolding refits the map** to the results, because the map pane appears
  for the first time at a size it was never laid out for.

To test, add DevTools presets at **466×678** (folded), **890×626** (open) and
**445×626** (Split View), and drag between 466 and 890 without reloading.
These are third-party estimates at 3× DPR, not Apple's numbers. Re-measure on
the Xcode simulator or a device and correct this table if they differ.

# ADR-0011: Apple's HIG and Lucide as the UI standard

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

The app had a clear identity but no rules underneath it. Sizes were decided
per component: touch targets were 36, 40 and 44px depending on the file, text
sizes included `text-[10px]`, `text-[11px]` and `text-[1.05rem]` next to
Tailwind's scale, and icons were Unicode glyphs and emoji (`⌕ ◎ ⚙ ＋ × 👍 📷
🍺`). Those glyphs render differently on every platform and sit on different
baselines, and they are the most recognisable sign of a UI nobody designed.

The iPhone Duo (shipped 2026-10-23) added a second pressure: a folded screen
shorter than any recent iPhone's and an unfolded one wider than the old
single-pane breakpoint. Spacing and sizing that were decided per component
made both screens harder to fit.

## Decision

1. **Adopt Apple's Human Interface Guidelines for sizing.** The iPhone is the
   primary device. Tailwind's `text-*` names are remapped in `@theme` onto the
   HIG text styles (`text-sm` is Subheadline 15/20, `text-base` is Body
   17/22), and there is one touch-target token, `--spacing-touch: 2.75rem`
   (44pt).
2. **Adopt Lucide for icons.** It is the most widely used open icon set for
   React and has one consistent stroke grid. It also tree-shakes per icon.
3. **Keep the visual identity.** The palette, the rounded display face and the
   price hero are unchanged. The standard governs measurements, not the look.

Rejected:

- **A component library (shadcn/ui, Radix, MUI).** The primitives that matter
  already exist (`Sheet` handles focus trap, restore, Escape and the
  visual-viewport keyboard fix). A library would replace working, tested
  behaviour and bring its own visual language, which would make the app look
  more generic rather than less.
- **Material Design.** It fits Android better than the iPhone this app is
  designed around.
- **Emoji as "personality".** The personality is the palette and the prices,
  not the icons.

## Consequences

**Good**

- A new control has one right answer for its height and its text size.
- Remapping Tailwind's names moved every existing `text-sm` onto the ramp
  without touching hundreds of call sites.
- Icons are crisp, aligned and identical on every platform.

**Bad**

- `text-sm` no longer means 14px here, which will surprise anyone used to
  stock Tailwind. `docs/DESIGN.md` has the table.
- 44pt targets and 17px body text make everything slightly larger, which
  cost vertical room on the short folded Duo. Getting it back meant moving the
  count/sort row into the list on phones.
- `lucide-react` adds a runtime dependency, about 1KB per icon used.

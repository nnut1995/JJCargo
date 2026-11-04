# JJ Cargo — design system

Back-office tool (Impeccable mode: **Operate**). Staff use it all day on office PCs and phones in the warehouse,
in Thai and Chinese. Scanability, speed and predictability come before expression.

Inferred, not yet confirmed with the team: the main users are office staff (orders, accounting) and warehouse staff
(packing, weighing, loading), most on desktop, some on phones.

## Principles
1. **The next job is one click away.** The dashboard lists work that is waiting, each line linking to the screen that finishes it.
2. **Any screen in a few keystrokes.** `Ctrl K` / `/` searches all menus in th / zh / en, and looks up order / bill / product codes.
3. **One language leads.** In Thai + Chinese mode Thai is the main label; Chinese sits beside it, smaller and quieter (`<Bi>`).
4. **The primary action is always visible.** Page header (title + actions) is sticky; one orange primary button per page.
5. **Nothing destructive without a clear question.** Deletes, undo-post and bulk approve go through `useAsk()` dialogs.

## Tokens (src/styles.css `:root`)
- Neutrals: warm grey, tinted toward the brand. `--bg #f5f4f2`, `--panel #fff`, `--sunken #f0eeeb`, `--line #e4e1dc`, text `#1c1f24` / `#4a4f57` / muted `#6b6f76`.
- Brand: JJ orange `--brand #c2410c` (white text passes 4.5:1). Only for the primary button, the active nav item, links and focus.
- Status: good `#15803d`, bad `#b91c1c`, warn `#a16207`, info `#1d4ed8`, each with a `-soft` background for badges.
- Dark mode follows the OS (`prefers-color-scheme`), with the brand lifted to `#f0743a`.
- Radius 10px (cards), 7px (controls), 14px (dialogs). Shadows are soft and offset, never hard.
- Type: IBM Plex Sans Thai + Noto Sans SC, 14px base. Scale: 12 / 13 / 14 / 16 / 20 / 24. Numbers use tabular figures.

## Components
- **Shell** (`src/nav.tsx`): top bar (brand, go-to search, language, user, sign out), collapsible grouped sidebar with one lucide icon per group; drawer + scrim under 1000px.
- **Page**: sticky head with optional `back` link; `document.title` follows the page.
- **Card**: flat panel; a table placed directly in a card runs edge to edge.
- **Table**: sticky header, one-line cells (`nowrap`, the wrapper scrolls), right-aligned tabular numbers, selected / current row tint, keyboard-openable rows, loading skeleton, empty state with icon, row count footer on long lists.
- **Combo**: searchable picker with clear button; customer list shows code + name hint.
- **Dialogs**: focus trapped, Esc closes, focus returns to the trigger. `useAsk().ask / askText` replace confirm / prompt.
- **Toasts**: bottom right, icon + close button; errors stay 8s.

## Don'ts
Emoji or unicode glyphs as icons, nested cards, coloured side stripes on cards, gradient text, eyebrow labels above headings,
`confirm()`/`alert()`, a second primary button on the same page.

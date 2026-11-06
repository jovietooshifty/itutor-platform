## Building with the iTutor design system

iTutor's parent and student apps: bright, chunky and calm, built for Caribbean families on a phone. Frames are 390px wide; build mobile-first.

### 1. Always wrap in `DsRoot`

Every screen must sit inside `window.ITutorV3.DsRoot` (it renders `<div class="ds-root">`). Four colour names (`brand`, `ink`, `ink-muted`, `border`) and both typefaces resolve through CSS variables that only exist inside `.ds-root`. Outside it, `bg-brand` is an older green, text falls back to system fonts, and nothing errors.

```jsx
const { DsRoot, NewUiShell, Card, Button, SectionHeader, ClassRow } = window.ITutorV3;

<DsRoot>
  <NewUiShell active="home" initials="AR">
    <Card tone="feature" eyebrow="Up next · Today" title="CSEC Mathematics" body="Rishi Persad · 4:30 PM">
      <div className="pt-ds-3"><Button block>View class</Button></div>
    </Card>
    <SectionHeader title="Classes for Droove" action="See all" />
    <ClassRow code="MA" color="green" title="CSEC Mathematics" meta="Rishi Persad · Mon & Wed" price="TT$180" />
  </NewUiShell>
</DsRoot>
```

`NewUiShell` gives a main page its header and five-tab bar (Home, Explore, Classes, Billing, Profile). Pass `nav={false}` on detail pages and flows.

### 2. Style with these utility classes, and only these

Styling is Tailwind utility classes compiled into the shipped stylesheet. **Only classes in the shipped CSS exist.** Anything else silently produces no style. Use the design-system vocabulary:

| Purpose | Classes |
|---|---|
| Surfaces | `bg-surface-page` (pale green-grey page), `bg-surface-card` (white), `bg-surface-sunken`, `bg-ink` (the one feature card) |
| Text | `text-ink`, `text-ink-muted`, `text-ink-subtle`, `text-on-ink`, `text-on-ink-muted`, `text-brand-edge` (green text on white) |
| Accents | `bg-brand`, `bg-danger`, `bg-danger-soft`, `bg-accent-yellow`, `bg-accent-orange` |
| Borders | `bw-hair` (1px) or `bw-bold` (2px) PLUS a colour: `border-border`, `border-ink`, `border-line-soft`. Never `border` alone |
| Spacing | `p-ds-card`, `gap-ds-1` … `gap-ds-4`, `px-ds-4`, `py-ds-2`, also `p-1` … `p-12` |
| Radius | `rounded-ds-xs`, `rounded-ds-sm`, `rounded-ds-btn`, `rounded-ds-card`, `rounded-ds-full` |
| Shadow | `shadow-edge-brand`, `shadow-edge-ink`, `shadow-edge-danger` (a solid 3px lip, never blur) |
| Type | `font-display` (Archivo, titles), `font-body` (Atkinson Hyperlegible Next); sizes `text-[11px]` … `text-[30px]`; `font-extrabold` |

Layout: `flex`, `flex-col`, `items-center`, `justify-between`, `grid`, `grid-cols-2`, `w-full`, `min-w-0`, `truncate`. For a one-off value not listed, use an inline `style`.

### 3. Rules the components already follow, so you must too

- Text on `bg-brand` is always `text-ink`, never white. White on brand green is 2.1:1 and fails contrast.
- Green text on a white ground is `text-brand-edge`, never `text-brand`.
- At most one `tone="feature"` (ink) card per screen. `Countdown` belongs inside it, never on a light ground.
- Page titles: `font-display text-[28px] font-extrabold`. No subtitle under a page title.
- Money and time read `TT$180`, `/month`, `Sat 14 Nov`, `4:30 PM`, with facts separated by a middle dot: `Rishi Persad · Mon 26 Oct · 4:30 PM`.
- Do not use the old palette (`itutor-green`, `coral`, `mint`, `sidebar-*`); it is not in this stylesheet.

### 4. Where the truth lives

Each component's `.d.ts` is its exact props contract, and its `.prompt.md` shows usage. `styles.css` and the stylesheet it imports define every class above. Overlays (sheets, toasts) go inside `DsPortal`, so they keep the tokens after leaving `.ds-root` in the DOM.

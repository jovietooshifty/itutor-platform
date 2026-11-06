/**
 * Tailwind config for the design-sync stylesheet ONLY (build/ds.css). The app
 * keeps using ../tailwind.config.ts untouched; this extends it with the two
 * things a standalone stylesheet needs that a Next build gets for free.
 *
 * 1. CONTENT. The app compiles whatever classes its pages use. Here the only
 *    scanned sources are the components, the authored previews and the
 *    provider, so without more the sheet would contain exactly the classes
 *    those files happen to use.
 *
 * 2. A SAFELIST, which is the real reason this file exists. The design agent
 *    composes NEW layouts out of these classes. Tailwind emits only classes it
 *    finds in scanned files, so a class the agent writes that no component
 *    happens to use would silently produce no CSS - no error, just unstyled
 *    output. The safelist makes the design system's own vocabulary exist
 *    whether or not a component uses it today.
 *
 * What is deliberately NOT safelisted: the legacy palette (itutor-*, coral,
 * mint, lavender, sidebar-*, brand-legacy ...). The design system README says
 * not to use it in new screens, and shipping it would invite exactly that.
 */
import { resolve } from 'node:path';
import type { Config } from 'tailwindcss';
import base from '../tailwind.config';

const root = process.cwd();

type Tree = { [k: string]: string | Tree };
const flatten = (o: Tree, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => {
    const name = k === 'DEFAULT' ? prefix : prefix ? `${prefix}-${k}` : k;
    return typeof v === 'object' ? flatten(v, name) : [name];
  });

const extend = (base.theme?.extend ?? {}) as Record<string, Tree>;
const allColors = new Set(flatten(extend.colors ?? {}));

// The design-system colour contract. Explicit on purpose - see header.
const DS_COLORS = [
  'brand', 'brand-edge',
  'ink', 'ink-muted', 'ink-subtle', 'ink-faint', 'ink-raised',
  'border', 'border-strong', 'line-soft',
  'surface-page', 'surface-card', 'surface-sunken',
  'on-ink', 'on-ink-muted', 'on-ink-subtle',
  'danger', 'danger-edge', 'danger-soft',
  'accent-yellow', 'accent-orange',
];
// A renamed token must fail the build, not quietly drop out of the sheet.
const missing = DS_COLORS.filter((c) => !allColors.has(c));
if (missing.length) {
  throw new Error(`design-sync: DS colour tokens missing from tailwind.config.ts: ${missing.join(', ')}`);
}

// Derived, not copied: these follow the config.
const DS_SPACING = Object.keys(extend.spacing ?? {}).filter((k) => k.startsWith('ds-'));
const DS_RADII = Object.keys(extend.borderRadius ?? {}).filter((k) => k.startsWith('ds-'));
const DS_SHADOWS = Object.keys(extend.boxShadow ?? {}).filter((k) => k.startsWith('edge-'));

const colorUtils = ['bg', 'text', 'border', 'fill', 'stroke', 'ring', 'divide', 'placeholder'];
const spaceUtils = ['p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'gap', 'gap-x', 'gap-y'];
const radiusUtils = ['rounded', 'rounded-t', 'rounded-b', 'rounded-l', 'rounded-r'];

// Tailwind's own default scale, for glue the DS tokens do not cover.
const DEFAULT_SCALE = ['0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '8', '10', '12'];
const SIZES = ['full', 'screen', 'auto', 'px', '0', '1', '2', '3', '4', '5', '6', '8', '10', '12', '14', '16', '20', '24', '32', '40', '48', '56', '64'];

// The type sizes the system uses (page-title 28, numeral 30, card-title 22,
// body 13-16, tag/eyebrow 11). Exact strings: arbitrary values are only
// emitted when named.
const TYPE_PX = [11, 12, 13, 14, 15, 16, 18, 20, 22, 28, 30, 34];

const safelist: string[] = [
  ...DS_COLORS.flatMap((c) => colorUtils.map((u) => `${u}-${c}`)),
  ...DS_COLORS.flatMap((c) => ['bg', 'text', 'border'].map((u) => `hover:${u}-${c}`)),
  ...DS_SPACING.flatMap((s) => spaceUtils.map((u) => `${u}-${s}`)),
  ...DS_RADII.flatMap((r) => radiusUtils.map((u) => `${u}-${r}`)),
  ...DS_SHADOWS.map((s) => `shadow-${s}`),
  ...spaceUtils.flatMap((u) => DEFAULT_SCALE.map((n) => `${u}-${n}`)),
  'mx-auto', 'my-auto', 'ml-auto', 'mr-auto',
  ...['w', 'h', 'min-h', 'min-w', 'max-w'].flatMap((u) => SIZES.map((n) => `${u}-${n}`)),
  ...TYPE_PX.map((n) => `text-[${n}px]`),
  'font-display', 'font-body', 'font-sans',
  'font-normal', 'font-medium', 'font-semibold', 'font-bold', 'font-extrabold',
  'text-left', 'text-center', 'text-right',
  'uppercase', 'truncate', 'underline', 'italic',
  'leading-none', 'leading-tight', 'leading-snug', 'leading-normal',
  'tracking-tight', 'tracking-normal', 'tracking-wide',
  'block', 'inline', 'inline-block', 'inline-flex', 'flex', 'grid', 'hidden',
  'flex-row', 'flex-col', 'flex-wrap', 'flex-1', 'flex-none', 'shrink-0', 'grow',
  'items-start', 'items-center', 'items-end', 'items-stretch', 'items-baseline',
  'justify-start', 'justify-center', 'justify-end', 'justify-between', 'justify-around',
  'self-start', 'self-center', 'self-end',
  'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4',
  'relative', 'absolute', 'fixed', 'sticky',
  'inset-0', 'top-0', 'right-0', 'bottom-0', 'left-0',
  'overflow-hidden', 'overflow-auto', 'overflow-x-auto', 'overflow-y-auto',
  'object-cover', 'object-contain', 'cursor-pointer', 'pointer-events-none', 'sr-only',
  'opacity-0', 'opacity-50', 'opacity-100',
  'z-0', 'z-10', 'z-20', 'z-50',
  'border-0', 'border-t', 'border-b',
];

const config: Config = {
  ...base,
  theme: {
    ...base.theme,
    extend: {
      ...base.theme?.extend,
      // The app's stacks end in the LEGACY faces: `var(--font-sans), Inter,
      // Arial` and `var(--font-display), Space Grotesk, Arial`. Inside .ds-root
      // the variable always wins, so they never render - but they are still
      // names in the shipped CSS that no @font-face backs, which is what the
      // validator's FONT_MISSING flags, and they put the previous design
      // system's typefaces in front of an agent that is supposed to use only
      // Archivo and Atkinson. Dropped here, for the sync sheet only.
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  content: [
    resolve(root, 'components/ui/**/*.{ts,tsx}'),
    resolve(root, '.design-sync/previews/**/*.tsx'),
    resolve(root, '.design-sync/extras/**/*.tsx'),
    // Arbitrary-value classes (text-[28px]) cannot go through `safelist`:
    // Tailwind only enumerates classes it can derive from the theme, so a
    // safelisted string like this is silently ignored. Raw content is scanned
    // exactly as a source file would be, which is what makes them emit.
    { raw: TYPE_PX.map((n) => `text-[${n}px]`).join(' ') },
  ],
  safelist: safelist.filter((c) => !c.includes('[')),
};

export default config;

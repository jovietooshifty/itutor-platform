/**
 * Exports merged onto window.<global> alongside the components, via
 * cfg.extraEntries. Not a design-system component, so it gets no card.
 */
import * as React from 'react';

/**
 * DsRoot — the wrapper every iTutor screen must sit inside.
 *
 * Every design-system colour that shares a name with a legacy token (brand,
 * ink, ink-muted, border) resolves through CSS variables that are only
 * retargeted INSIDE `.ds-root` (components/ui/ds-tokens.css). Outside it,
 * `bg-brand` is the legacy green, `text-ink` the legacy near-black, and the
 * two typefaces fall back to system fonts. NewUiShell renders this wrapper
 * itself; individual components do not, which is why previews and any design
 * built from loose components need it.
 */
export function DsRoot({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div className={className ? `ds-root ${className}` : 'ds-root'}>{children}</div>;
}

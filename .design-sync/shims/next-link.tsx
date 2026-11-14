/**
 * Stand-in for next/link, used ONLY when design-sync bundles components/ui.
 *
 * NavRow renders a <Link> when given an href. next/link is not a standalone
 * component: it reads the app-router context and pulls in Next's client
 * internals, none of which exist in the design agent's runtime, and bundling
 * it would drag a large slice of Next into _ds_bundle.js. In a design there
 * is nowhere to navigate to, so a plain anchor is the faithful rendering.
 *
 * Wired through .design-sync/tsconfig.json `paths`. The app never sees this.
 */
import * as React from 'react';

type Href = string | { pathname?: string; query?: Record<string, unknown>; hash?: string };

export interface LinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: Href;
  // next/link-only props: accepted so call sites type-check, then dropped
  // rather than forwarded as unknown attributes on a DOM node.
  prefetch?: boolean | null;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
  locale?: string | false;
}

function toHref(href: Href): string {
  if (typeof href === 'string') return href;
  return (href.pathname ?? '') + (href.hash ? `#${href.hash}` : '') || '#';
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, prefetch, replace, scroll, shallow, passHref, legacyBehavior, locale, children, ...rest },
  ref
) {
  void prefetch; void replace; void scroll; void shallow; void passHref; void legacyBehavior; void locale;
  return (
    <a ref={ref} href={toHref(href)} {...rest}>
      {children}
    </a>
  );
});

export default Link;

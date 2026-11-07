'use client';

/**
 * NewUiShell — the layout shell for the new, light-only UI.
 *
 * THIS IS NOT DashboardLayout AND MUST NOT BECOME IT. The existing shell is
 * dark (`itutor-card` #0F0F0F and friends) and the design system has no dark
 * theme — neither Figma file defines one. Rather than teach the old shell a
 * second theme, the new UI gets its own, and the two live side by side until
 * NEXT_PUBLIC_NEW_UI_ENABLED flips.
 *
 * `.ds-root` is what makes the design-system tokens resolve: it retargets the
 * four CSS variables whose Tailwind names collide with legacy ones
 * (brand, ink, ink-muted, border) plus the two font variables. See
 * ds-tokens.css for why that indirection exists.
 *
 * WIDER SCREENS. The frames are drawn at 390px and the system has no tablet or
 * desktop frame, so below 768px this is exactly the phone column the frames
 * show. From md up the tab bar becomes SideNav (a rail on tablets, a sidebar
 * from lg), and every page sits in ONE page frame, 1280px at most and centred,
 * so a title starts at the same x on every tab and does not jump sideways as
 * the parent switches between them. `width` only decides what fills it:
 * - 'wide': the screen lays itself out across the whole frame (columns, a
 *   grid, list and detail side by side).
 * - 'reading' (default): a single column capped at 720px, held to the frame's
 *   LEFT edge rather than centred, for detail pages and forms. Cards and rows
 *   were drawn for a phone; past ~720px they become stripes.
 * The header becomes a see-through layer from md up, and takes the page's
 * name once the page's own title has scrolled under it.
 * The wide-screen layout is PROVISIONAL: no frame exists to check it against.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import './ds-tokens.css';
import { AppHeader, type AppHeaderProps, type HeaderAction } from './AppHeader';
import { BottomNav, DEFAULT_NAV, type NavItem } from './BottomNav';
import { SideNav } from './SideNav';

export interface NewUiShellProps {
  children: ReactNode;
  /** id of the current tab. */
  active?: string;
  items?: NavItem[];
  /** Hide the tab bar on flows and detail pages, as the Figma files specify. */
  nav?: boolean;
  onSelect?: (id: string) => void;
  headerTone?: AppHeaderProps['tone'];
  headerActions?: HeaderAction[];
  /** Bell / chat / search. Without it the header buttons do nothing. */
  onHeaderAction?: AppHeaderProps['onAction'];
  /** The account chip. Without it the avatar does nothing. */
  onAccount?: AppHeaderProps['onAccount'];
  logo?: ReactNode;
  unread?: boolean;
  initials?: string;
  /** Drop the header too, for full-bleed flows. */
  header?: boolean;
  /** Content column width from md up. See the note above. */
  width?: 'reading' | 'wide';
  /** The page's name for the header, from md up, once scrolled. */
  title?: ReactNode;
  /** Light-on-ink logo and small mark for the side navigation. */
  sideLogo?: ReactNode;
  sideMark?: ReactNode;
  className?: string;
}

export function NewUiShell({
  children,
  active,
  items = DEFAULT_NAV,
  nav = true,
  onSelect,
  headerTone = 'light',
  headerActions = ['bell'],
  onHeaderAction,
  onAccount,
  logo,
  unread,
  initials,
  header = true,
  width = 'reading',
  title,
  sideLogo,
  sideMark,
  className,
}: NewUiShellProps) {
  // The side navigation shows on every screen from md up, detail pages
  // included: the phone hides the tab bar there to save height, which a
  // sidebar does not cost. `nav` therefore only governs the phone tab bar.
  const side = items.length > 0;

  // The large page title is ~48px tall at the top of the content; once the
  // page has scrolled past it, the header carries the name instead.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!title) return;
    const onScroll = () => setScrolled(window.scrollY > 56);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [title]);

  return (
    <div className="ds-root min-h-screen bg-surface-page md:flex">
      {side ? (
        <SideNav
          items={items}
          active={active}
          onSelect={onSelect}
          logo={sideLogo}
          mark={sideMark}
          className="sticky top-0 z-20 hidden h-screen shrink-0 md:flex"
        />
      ) : null}
      <div className="mx-auto flex min-h-screen w-full min-w-0 max-w-[430px] flex-col bg-surface-page md:mx-0 md:max-w-none md:flex-1">
        {header ? (
          <AppHeader
            tone={headerTone}
            actions={headerActions}
            onAction={onHeaderAction}
            onAccount={onAccount}
            logo={side && logo ? <span className="md:hidden">{logo}</span> : logo}
            title={title}
            titleVisible={scrolled}
            unread={unread}
            initials={initials}
            className="ds-glass sticky top-0 z-10"
          />
        ) : null}

        <main className={cn('flex-1 px-ds-4 py-ds-4 md:px-ds-8 md:py-ds-5', className)}>
          <div className="mx-auto w-full md:max-w-[1280px]">
            {width === 'wide' ? children : <div className="w-full md:max-w-[720px]">{children}</div>}
          </div>
        </main>

        {nav ? (
          <BottomNav
            items={items}
            active={active}
            onSelect={onSelect}
            className="sticky bottom-0 z-10 md:hidden"
          />
        ) : null}
      </div>
    </div>
  );
}

export default NewUiShell;

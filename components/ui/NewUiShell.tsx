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
 * from lg), and the page sits in a centred column whose width the screen
 * chooses with `width`:
 * - 'reading' (default, 720px): single-column screens, detail pages, forms.
 *   Cards and rows were drawn for a phone; past ~720px they stop reading as
 *   rows and become stripes, so a screen stays here until it has a wide layout.
 * - 'wide' (1120px): screens that lay their content out in columns or grids
 *   from md up.
 * The wide-screen layout is PROVISIONAL: no frame exists to check it against.
 */

import type { ReactNode } from 'react';
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
  sideLogo,
  sideMark,
  className,
}: NewUiShellProps) {
  // The side navigation shows on every screen from md up, detail pages
  // included: the phone hides the tab bar there to save height, which a
  // sidebar does not cost. `nav` therefore only governs the phone tab bar.
  const side = items.length > 0;
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
            unread={unread}
            initials={initials}
            className="sticky top-0 z-10"
          />
        ) : null}

        <main className={cn('flex-1 px-ds-4 py-ds-4 md:px-ds-8 md:py-ds-5', className)}>
          <div className={cn('mx-auto w-full', width === 'wide' ? 'md:max-w-[1120px]' : 'md:max-w-[720px]')}>
            {children}
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

'use client';

/**
 * SideNav — the tab bar, stood on its side for tablets and computers.
 *
 * PROVISIONAL VISUALS. The design system's frames are 390px wide and it has no
 * tablet or desktop frame, so this is BottomNav's own vocabulary carried over,
 * not a drawn design: the same ink surface, the same five tabs, the same
 * brand-green pill on the current tab's icon, the same red attention dot.
 *
 * Two widths, by breakpoint, from one component:
 * - md (768px up, tablets): an 88px rail, icon over label, as in the tab bar.
 * - lg (1024px up, laptops and monitors): a 232px sidebar, icon beside label,
 *   with the logo at the top.
 *
 * NewUiShell renders this and BottomNav together and lets CSS pick one, so a
 * window resized across the breakpoint never re-mounts the page.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DsIcon } from './icons';
import { DEFAULT_NAV, type NavItem } from './BottomNav';

export interface SideNavProps {
  items?: NavItem[];
  /** id of the current tab. */
  active?: string;
  onSelect?: (id: string) => void;
  /** Light-on-ink logo, shown at the top from lg up. */
  logo?: ReactNode;
  /** Small mark for the 88px rail, where the full logo does not fit. */
  mark?: ReactNode;
  className?: string;
}

export function SideNav({ items = DEFAULT_NAV, active, onSelect, logo, mark, className }: SideNavProps) {
  return (
    <nav aria-label="Main" className={cn('flex w-[88px] flex-col bg-ink lg:w-[232px]', className)}>
      <div className="flex h-14 shrink-0 items-center justify-center lg:justify-start lg:px-ds-5">
        {mark ? <span className="lg:hidden">{mark}</span> : null}
        {logo ? <span className="hidden lg:block">{logo}</span> : null}
      </div>

      <div className="flex flex-col gap-ds-1 px-ds-2 pt-ds-3 lg:px-ds-3">
        {items.map((item) => {
          const current = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={current ? 'page' : undefined}
              onClick={onSelect ? () => onSelect(item.id) : undefined}
              className={cn(
                'relative flex flex-col items-center gap-ds-1 rounded-ds-sm py-ds-2',
                'lg:flex-row lg:gap-ds-3 lg:px-ds-2',
                'border-0 bg-transparent font-body cursor-pointer',
                'transition-colors duration-150 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-ink-raised',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                current ? 'text-ink' : 'text-on-ink-subtle'
              )}
            >
              <span
                className={cn(
                  'flex h-[30px] w-[46px] shrink-0 items-center justify-center rounded-ds-sm',
                  current && 'bg-brand text-ink'
                )}
              >
                <DsIcon name={item.icon} size={21} />
              </span>
              <span
                className={cn(
                  'text-[11px] font-bold leading-[13px] lg:text-[15px] lg:leading-[18px]',
                  current ? 'text-on-ink' : 'text-on-ink-muted'
                )}
              >
                {item.label}
              </span>
              {item.badge ? (
                <i
                  aria-label="Needs attention"
                  className="absolute right-ds-3 top-ds-1 h-[10px] w-[10px] rounded-ds-xs bg-danger bw-bold border-ink lg:right-ds-3 lg:top-1/2 lg:-translate-y-1/2"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default SideNav;

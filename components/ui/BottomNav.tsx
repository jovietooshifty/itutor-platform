'use client';

/**
 * BottomNav — the ink tab bar at the bottom of every main page; the current
 * tab gets a brand-green pill.
 *
 * Show it on main pages only; hide it on flows and detail pages, as the parent
 * Figma file specifies. Parent tabs are Home, Explore, Classes, Billing,
 * Profile — the default below. Student tabs swap Billing for Wallet.
 */

import { cn } from '@/lib/utils';
import { DsIcon, type IconName } from './icons';

export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  badge?: boolean;
  /** A number in place of the dot (unread messages). 0 or absent = none. */
  count?: number;
  /** Section heading this item starts under, in the lg sidebar only. */
  group?: string;
  /** Sidebar only: never in the phone tab bar (tutor Grow / Account items). */
  sideOnly?: boolean;
}

export interface BottomNavProps {
  items?: NavItem[];
  /** id of the current tab. */
  active?: string;
  onSelect?: (id: string) => void;
  className?: string;
}

export const DEFAULT_NAV: NavItem[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'explore', label: 'Explore', icon: 'explore' },
  { id: 'classes', label: 'Classes', icon: 'classes' },
  { id: 'billing', label: 'Billing', icon: 'billing' },
  { id: 'profile', label: 'Profile', icon: 'profile' },
];

export function BottomNav({
  items = DEFAULT_NAV,
  active,
  onSelect,
  className,
}: BottomNavProps) {
  return (
    <nav
      aria-label="Main"
      className={cn(
        'flex items-start justify-around gap-ds-1h bg-ink px-1 pt-[10px] pb-3',
        className
      )}
    >
      {items.filter((item) => !item.sideOnly).map((item) => {
        const current = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={current ? 'page' : undefined}
            onClick={onSelect ? () => onSelect(item.id) : undefined}
            className={cn(
              'relative flex w-[70px] flex-col items-center gap-ds-1',
              'border-0 bg-transparent p-0 font-body cursor-pointer',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand focus-visible:rounded-ds-sm',
              current ? 'text-ink' : 'text-on-ink-subtle'
            )}
          >
            <span
              className={cn(
                'flex h-[30px] w-[46px] items-center justify-center rounded-ds-sm',
                current && 'bg-brand text-ink'
              )}
            >
              <DsIcon name={item.icon} size={21} />
            </span>

            <span
              className={cn(
                'text-[11px] font-bold leading-[13px]',
                current ? 'text-on-ink' : 'text-on-ink-muted'
              )}
            >
              {item.label}
            </span>

            {item.count ? (
              <i
                aria-label={`${item.count} unread`}
                className="absolute -top-1 right-2 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10px] font-extrabold not-italic leading-[18px] text-white"
              >
                {item.count > 9 ? '9+' : item.count}
              </i>
            ) : item.badge ? (
              <i
                aria-label="Needs attention"
                className="absolute top-0 right-3 h-[10px] w-[10px] rounded-ds-xs bg-danger bw-bold border-ink"
              />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNav;

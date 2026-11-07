'use client';

/**
 * AppHeader — the top bar on every main page: logo left, icon buttons and the
 * account chip right.
 *
 * `tone="light"` (default) sits on `surface-page` with a hairline bottom
 * border, as in the Figma files; `tone="dark"` is for ink screens.
 *
 * THE CONSUMER SUPPLIES THE LOGO. The light-ground wordmark (green mark, ink
 * "itutor") exists in the parent Figma file but could not be exported into the
 * design system, so there is no asset to default to here. Passing nothing
 * renders no logo rather than a guessed one.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DsIcon } from './icons';

export type HeaderAction = 'bell' | 'chat' | 'search';

export interface AppHeaderProps {
  tone?: 'light' | 'dark';
  /** The logo element; supplied by the consumer. */
  logo?: ReactNode;
  /**
   * The page's name, shown from md up beside where the logo sits on a phone.
   * `titleVisible` fades it in once the page's own large title has scrolled
   * away, so the two are never on screen together.
   */
  title?: ReactNode;
  titleVisible?: boolean;
  actions?: HeaderAction[];
  /**
   * Something that sits before the icon buttons — the student credits pill
   * (Figma 2:1995, 2:2219, 2:2573). Supplied by the consumer, like the logo.
   */
  extra?: ReactNode;
  /** Red dot on the bell. */
  unread?: boolean;
  initials?: string;
  onAction?: (action: HeaderAction) => void;
  onAccount?: () => void;
  className?: string;
}

const LABELS: Record<HeaderAction, string> = {
  bell: 'Notifications',
  chat: 'Messages',
  search: 'Search',
};

export function AppHeader({
  tone = 'light',
  logo,
  title,
  titleVisible,
  actions = ['bell'],
  extra,
  unread,
  initials,
  onAction,
  onAccount,
  className,
}: AppHeaderProps) {
  const dark = tone === 'dark';

  return (
    <header
      className={cn(
        'flex h-14 items-center justify-between bw-b-hair pl-ds-4 pr-ds-card md:pl-ds-8 md:pr-ds-6',
        dark ? 'bg-ink border-ink' : 'bg-surface-page border-border',
        className
      )}
    >
      {logo ?? <span />}
      {title ? (
        <span
          aria-hidden={!titleVisible}
          className={cn(
            'hidden min-w-0 truncate font-display text-[17px] font-extrabold leading-[22px] md:block',
            'transition-[opacity,transform] duration-200 ease-[cubic-bezier(.23,1,.32,1)]',
            titleVisible ? 'translate-y-0 opacity-100' : 'translate-y-[4px] opacity-0',
            dark ? 'text-on-ink' : 'text-ink'
          )}
        >
          {title}
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-ds-1h">
        {extra}
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            aria-label={LABELS[action]}
            onClick={onAction ? () => onAction(action) : undefined}
            className={cn(
              'relative inline-flex h-10 w-10 items-center justify-center',
              'rounded-ds-card border-0 bg-transparent cursor-pointer',
              dark ? 'text-on-ink' : 'text-ink'
            )}
          >
            <DsIcon name={action} size={22} />
            {action === 'bell' && unread ? (
              <i
                className={cn(
                  'absolute top-[6px] right-[7px] h-[10px] w-[10px]',
                  'rounded-ds-xs bg-danger bw-bold',
                  dark ? 'border-ink' : 'border-surface-page'
                )}
              />
            ) : null}
          </button>
        ))}

        <button
          type="button"
          aria-label="Account"
          onClick={onAccount}
          className={cn(
            'inline-flex h-[34px] w-[34px] items-center justify-center',
            'rounded-ds-sm border-0 font-extrabold text-[12px] text-brand cursor-pointer',
            dark ? 'bg-ink-raised' : 'bg-ink'
          )}
        >
          {initials ?? ''}
        </button>
      </div>
    </header>
  );
}

export default AppHeader;

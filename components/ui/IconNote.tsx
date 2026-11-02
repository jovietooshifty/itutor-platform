'use client';

/**
 * IconNote — a square tile, a bold line, and a quieter line under it, in a card.
 *
 * NOT IN THE DESIGN SYSTEM's ten components. It is the all-clear card on the
 * "Home – all paid" frame (`160:2057`): a brand-green tick, "All paid. Nothing
 * needs your attention.", and "Next payment Sat 14 Nov" beneath.
 *
 * Card's `tag`/`eyebrow`/`title`/`body` slots stack vertically with no room for
 * a leading tile, so this is its own small component rather than a Card prop.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface IconNoteProps {
  /** The glyph inside the tile. A Phosphor icon, or a character. */
  icon: ReactNode;
  tone?: 'brand' | 'yellow' | 'danger';
  title: ReactNode;
  meta?: ReactNode;
  className?: string;
}

const TONES: Record<NonNullable<IconNoteProps['tone']>, string> = {
  brand: 'bg-brand text-ink',
  yellow: 'bg-accent-yellow text-ink',
  // White on danger passes at 5.4:1; ink on danger does not.
  danger: 'bg-danger text-on-ink',
};

export function IconNote({
  icon,
  tone = 'brand',
  title,
  meta,
  className,
}: IconNoteProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-ds-3 rounded-ds-card border-hair border-border bg-surface-card p-ds-card',
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-[34px] flex-none items-center justify-center rounded-ds-sm',
          TONES[tone]
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold text-[15px] leading-[19px] text-ink">
          {title}
        </span>
        {meta ? (
          <span className="mt-[2px] block text-[13px] leading-[18px] text-ink-muted">
            {meta}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export default IconNote;

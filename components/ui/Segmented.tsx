'use client';

/**
 * Segmented — two or more halves of one screen (Group classes / 1:1 tutors,
 * Upcoming / Past). Buttons, not links: switching halves is not navigation.
 *
 * The selected segment is an INK fill with light text, as frame 160:3622
 * draws it. The fill is one element that slides to the chosen segment
 * (200ms, the system's ease-out) instead of jumping, so the eye can follow
 * where it went. The slide is PROVISIONAL: the frames are static.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  id: T;
  label: ReactNode;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Accessible name for the tab list. */
  label: string;
  className?: string;
}

export function Segmented<T extends string>({ options, value, onChange, label, className }: SegmentedProps<T>) {
  const n = Math.max(1, options.length);
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('relative flex rounded-ds-card bw-hair border-border bg-surface-card p-[4px]', className)}
    >
      <span
        aria-hidden
        className="ds-seg-thumb absolute bottom-[4px] left-[4px] top-[4px] rounded-ds-btn bg-ink"
        style={{
          width: `calc((100% - 8px) / ${n})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cn(
              'relative z-[1] flex flex-1 items-center justify-center gap-ds-2 rounded-ds-btn px-ds-3 py-ds-2',
              'border-0 bg-transparent font-body text-[14px] font-extrabold cursor-pointer',
              'transition-colors duration-200',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink',
              active ? 'text-on-ink' : 'text-ink-muted'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default Segmented;

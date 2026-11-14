'use client';

/**
 * QuestProgress — a segmented bar showing how many steps of a short checklist
 * are done (Quests 1/3, weekly goal days).
 *
 * Done segments are `accent-yellow`, the rest `surface-sunken`. Pair with a
 * "1/3" count on the right of the card title — the bar alone does not say how
 * many steps there are.
 *
 * ── variant="meter" ───────────────────────────────────────────────────────
 * Added for the parent Billing frame (`160:4095`), whose billing-period bar is
 * the same control with different values: taller segments, a tighter gap, a
 * square-ish radius, and brand-on-ink-raised because it sits inside an ink
 * card. It is a variant rather than a second component because it is the same
 * thing — n segments, m filled — and a sibling would have duplicated the
 * clamping and the ARIA.
 *
 * `label` names it for assistive technology. The quest bar is captioned "1/3"
 * beside it; the meter is not, so it carries its own.
 */

import { cn } from '@/lib/utils';

export interface QuestProgressProps {
  total: number;
  done: number;
  variant?: 'quest' | 'meter';
  /** aria-label, for a bar with no visible caption beside it. */
  label?: string;
  className?: string;
}

export function QuestProgress({
  total,
  done,
  variant = 'quest',
  label,
  className,
}: QuestProgressProps) {
  const steps = Math.max(1, Math.floor(total || 0));
  const complete = Math.min(Math.max(0, Math.floor(done || 0)), steps);
  const meter = variant === 'meter';

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={steps}
      aria-valuenow={complete}
      aria-label={label}
      className={cn('flex', meter ? 'gap-[3px]' : 'gap-1', className)}
    >
      {Array.from({ length: steps }, (_, i) => (
        <span
          key={i}
          className={cn(
            'min-w-px flex-1',
            meter ? 'h-[10px] rounded-[2px]' : 'h-2 rounded-ds-full',
            i < complete
              ? meter
                ? 'bg-brand'
                : 'bg-accent-yellow'
              : meter
                ? 'bg-ink-raised'
                : 'bg-surface-sunken'
          )}
        />
      ))}
    </div>
  );
}

export default QuestProgress;

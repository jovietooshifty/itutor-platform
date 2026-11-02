'use client';

/**
 * StepList — numbered steps in a card, divided by hairlines.
 *
 * NOT IN THE DESIGN SYSTEM's ten components. The "How it works" card on the
 * new-parent Home frame (`160:2208`) is the only place it appears so far:
 * three rows, each a brand-green numeral tile, a bold title and a line of
 * explanation.
 *
 * The numeral tile is a SubjectTile at 28px in everything but name — same
 * radius, same display face, same ink-on-brand. It is drawn here rather than
 * reusing SubjectTile because SubjectTile is semantically a *subject* code and
 * is hidden from assistive technology; these numbers are an ordered list and
 * should be read as one, which is why this renders `<ol>`.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Step {
  title: ReactNode;
  detail?: ReactNode;
}

export interface StepListProps {
  steps: Step[];
  className?: string;
}

export function StepList({ steps, className }: StepListProps) {
  return (
    <ol
      className={cn(
        'flex flex-col rounded-ds-card border-hair border-border bg-surface-card px-ds-card',
        className
      )}
    >
      {steps.map((step, i) => (
        <li
          key={i}
          className={cn(
            'flex items-start gap-ds-3 py-ds-card',
            i > 0 && 'border-t-hair border-line-soft'
          )}
        >
          <span
            aria-hidden
            className="mt-[1px] flex size-[28px] flex-none items-center justify-center rounded-ds-sm bg-brand font-display text-[13px] font-extrabold leading-none text-ink"
          >
            {i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-extrabold text-[15px] leading-[18px] text-ink">
              {step.title}
            </span>
            {step.detail ? (
              <span className="mt-[2px] block text-[13px] leading-[18px] text-ink-muted">
                {step.detail}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default StepList;

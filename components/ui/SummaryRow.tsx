'use client';

/**
 * SummaryRow — a label on the left, a bold value on the right.
 *
 * NOT IN THE DESIGN SYSTEM's ten components. The parent Home frame
 * (`160:1828`) stacks two of these inside one Card for "Payments by child":
 * "Droove · 2 classes / TT$350/month" and "Next charge / Sat 14 Nov".
 *
 * `tone="ink"` is the same row on an ink ground, which the Billing monthly
 * total card (`160:4095`) uses for its "Next charge … / 19 days left" line.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SummaryRowProps {
  label: ReactNode;
  value: ReactNode;
  tone?: 'default' | 'ink';
  /** Swap the weights: bold on the left, regular on the right. */
  emphasis?: 'value' | 'label';
  className?: string;
}

export function SummaryRow({
  label,
  value,
  tone = 'default',
  emphasis = 'value',
  className,
}: SummaryRowProps) {
  const labelCls =
    emphasis === 'label'
      ? cn('font-extrabold', tone === 'ink' ? 'text-on-ink' : 'text-ink')
      : cn(tone === 'ink' ? 'text-on-ink-muted' : 'text-ink-muted');

  const valueCls =
    emphasis === 'label'
      ? cn(tone === 'ink' ? 'text-on-ink-muted' : 'text-ink-muted')
      : cn('font-extrabold', tone === 'ink' ? 'text-on-ink' : 'text-ink');

  return (
    <div className={cn('flex items-start justify-between gap-ds-3 py-[5px]', className)}>
      <span className={cn('min-w-0 text-[14px] leading-[20px]', labelCls)}>{label}</span>
      <span className={cn('flex-none text-right text-[14px] leading-[20px]', valueCls)}>
        {value}
      </span>
    </div>
  );
}

export default SummaryRow;

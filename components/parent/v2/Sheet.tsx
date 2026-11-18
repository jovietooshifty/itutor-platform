'use client';

/**
 * Sheet — the bottom sheet every parent flow opens: approve a request, read a
 * receipt, confirm a removal, choose a child.
 *
 * The account menu and the filters sheet each built their own before this;
 * they keep working, but new sheets use this one so the grab handle, scrim,
 * Escape-to-close and scroll lock behave identically everywhere.
 *
 * Portalled through DsPortal, so it keeps the design-system tokens after
 * leaving .ds-root in the DOM.
 */

import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DsPortal } from '@/components/ui/DsPortal';
import { X } from '@phosphor-icons/react';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Heading. Also the dialog's accessible name. */
  title: ReactNode;
  /** Plain-text name for screen readers when `title` is not a string. */
  label?: string;
  children: ReactNode;
  /** Actions pinned under the scrolling body. */
  footer?: ReactNode;
}

export function Sheet({ open, onClose, title, label, children, footer }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <DsPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-ds-8">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute inset-0 cursor-default border-0 bg-ink/40"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label ?? (typeof title === 'string' ? title : undefined)}
          className={cn(
            'relative flex max-h-[88dvh] w-full max-w-[430px] flex-col md:max-w-[480px]',
            'rounded-t-ds-card md:rounded-ds-card bw-hair border-border bg-surface-card'
          )}
        >
          <span className="mx-auto mt-ds-2 h-[4px] w-[36px] md:hidden shrink-0 rounded-ds-full bg-line-soft" aria-hidden />
          {/* Title row with a close button: Escape and the scrim were the only
              ways out, and neither is visible on a phone. */}
          <div className="flex items-start gap-ds-3 px-ds-card pb-ds-2 pt-ds-2 md:pt-ds-card">
            <h2 className="m-0 min-w-0 flex-1 pt-[6px] font-display text-[20px] font-extrabold leading-[24px] text-ink">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ds-press -mr-ds-2 flex size-11 shrink-0 items-center justify-center rounded-ds-sm border-0 bg-transparent text-ink cursor-pointer"
            >
              <X size={20} weight="bold" aria-hidden />
            </button>
          </div>
          <div className="flex flex-col gap-ds-3 overflow-y-auto px-ds-card pb-ds-card">{children}</div>
          {footer ? (
            // Full-width actions, stacked on a phone and side by side from md.
            // The old lg:items-end shrank every button to its label and left
            // them stranded at the left of a wide dialog.
            <div className="flex flex-col gap-ds-2 bw-t-hair border-line-soft p-ds-card md:flex-row [&>*]:w-full md:[&>*]:flex-1">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </DsPortal>
  );
}

export default Sheet;

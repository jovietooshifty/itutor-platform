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
            'relative flex max-h-[88vh] w-full max-w-[430px] flex-col md:max-w-[520px]',
            'rounded-t-ds-card md:rounded-ds-card bw-hair border-border bg-surface-card'
          )}
        >
          <span className="mx-auto mt-ds-2 h-[4px] w-[36px] md:hidden shrink-0 rounded-ds-full bg-line-soft" aria-hidden />
          <h2 className="px-ds-card pb-ds-2 pt-ds-2 md:pt-ds-card font-display text-[20px] font-extrabold leading-[24px] text-ink">
            {title}
          </h2>
          <div className="flex flex-col gap-ds-3 overflow-y-auto px-ds-card pb-ds-card">{children}</div>
          {footer ? (
            <div className="flex flex-col gap-ds-2 bw-t-hair border-line-soft p-ds-card">{footer}</div>
          ) : null}
        </div>
      </div>
    </DsPortal>
  );
}

export default Sheet;

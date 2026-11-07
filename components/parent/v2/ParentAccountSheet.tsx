'use client';

/**
 * ParentAccountSheet — frame `160:7794`, now read from Figma rather than
 * guessed.
 *
 * The first version of this file was built blind and was wrong in the usual
 * direction: it did more than the design. It listed six destinations
 * (Children, Calendar, Feedback, Approvals, Rewards, Settings) on the
 * reasoning that the five-tab bar had displaced five sidebar sections and
 * they needed somewhere to live.
 *
 * The frame is four things: the parent's NAME as the heading, one row for
 * "Account settings", one for "Log out", and a Close button. Everything else
 * is reached from the Settings screen the first row opens — which is where
 * the displaced sections went, not here.
 *
 * Keeping the extra rows would have been the easier call, since they were
 * already built and working. They are gone because the design says two rows,
 * and a sheet that disagrees with the design is how the two-app feel started.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { DsPortal } from '@/components/ui/DsPortal';
import { DsIcon } from '@/components/ui/icons';

export interface ParentAccountSheetProps {
  open: boolean;
  onClose: () => void;
  /** The parent's display name — the sheet's heading in the frame. */
  name?: string;
  onLogout?: () => void;
}

export function ParentAccountSheet({ open, onClose, name, onLogout }: ParentAccountSheetProps) {
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <DsPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-ds-8">
        <button
          type="button"
          aria-label="Close account menu"
          onClick={onClose}
          className="absolute inset-0 cursor-default bg-ink/40"
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-label="Account"
          className={cn(
            'relative flex w-full max-w-[430px] flex-col md:max-w-[520px] gap-ds-2',
            'rounded-t-ds-card md:rounded-ds-card bw-hair border-border bg-surface-card px-ds-card pb-ds-card pt-ds-2 md:pt-ds-card'
          )}
        >
          {/* The grab handle the frame draws above the title. */}
          <span className="mx-auto h-[4px] w-[36px] md:hidden rounded-ds-full bg-line-soft" aria-hidden />

          <h2 className="font-display text-[18px] font-extrabold text-ink">{name ?? 'Account'}</h2>

          <button
            type="button"
            onClick={() => {
              onClose();
              router.push('/parent/settings');
            }}
            className={cn(
              'flex w-full items-center gap-ds-3 bw-t-hair border-line-soft py-ds-3 text-left',
              'border-x-0 border-b-0 bg-transparent cursor-pointer',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink'
            )}
          >
            <span className="shrink-0 text-ink">
              <DsIcon name="profile" size={20} />
            </span>
            <span className="flex-1 font-display text-[15px] font-extrabold text-ink">Account settings</span>
            <span className="shrink-0 text-ink-muted">
              <DsIcon name="chevron" size={18} />
            </span>
          </button>

          {onLogout ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogout();
              }}
              className={cn(
                'flex w-full items-center gap-ds-3 bw-t-hair border-line-soft py-ds-3 text-left',
                'border-x-0 border-b-0 bg-transparent cursor-pointer',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink'
              )}
            >
              <span className="shrink-0 text-danger">
                <DsIcon name="profile" size={20} />
              </span>
              <span className="flex-1 font-display text-[15px] font-extrabold text-danger">Log out</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className={cn(
              'mt-ds-1 w-full rounded-ds-btn bw-bold border-ink bg-surface-card py-ds-3',
              'font-body text-[15px] font-extrabold text-ink cursor-pointer',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink'
            )}
          >
            Close
          </button>
        </div>
      </div>
    </DsPortal>
  );
}

export default ParentAccountSheet;

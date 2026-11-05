'use client';

/**
 * ParentAccountSheet — what the header's account chip opens.
 *
 * PROVISIONAL VISUALS — NOT FRAME-VERIFIED. Figma specifies an "account menu
 * sheet" here but the frame has not been read, so the chrome below is the
 * design system's own primitives. Reconcile when the frame is available.
 *
 * It is not only a profile menu. The new tab bar carries five tabs where the
 * old sidebar carried seven sections, and Children, Calendar, Feedback,
 * Rewards and Approvals were displaced with nowhere to go — reachable only by
 * typing a URL, or by landing on an old page that still had the old sidebar.
 * This is where they live now, so dropping to five tabs stops meaning losing
 * five destinations.
 *
 * Rewards is conditional on the credits programme, exactly as it was in the
 * old sidebar; showing an empty wallet to a parent who has no credits was
 * never the intent.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { DsPortal } from '@/components/ui/DsPortal';
import { DsIcon } from '@/components/ui/icons';

export interface ParentAccountSheetProps {
  open: boolean;
  onClose: () => void;
  /** Hidden unless the credits programme applies to this parent. */
  showRewards?: boolean;
  onLogout?: () => void;
}

const LINKS: Array<{ href: string; label: string; detail: string }> = [
  { href: '/parent/children', label: 'Children', detail: 'Linked accounts and approvals' },
  { href: '/parent/calendar', label: 'Calendar', detail: 'Every session in one place' },
  { href: '/parent/feedback', label: 'Feedback', detail: 'Reports from your tutors' },
  { href: '/parent/approvals', label: 'Approvals', detail: 'Requests waiting on you' },
  { href: '/parent/settings', label: 'Settings', detail: 'Account, billing and notifications' },
];

export function ParentAccountSheet({ open, onClose, showRewards, onLogout }: ParentAccountSheetProps) {
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

  const links = showRewards
    ? [...LINKS.slice(0, 4), { href: '/parent/rewards', label: 'Rewards', detail: 'Your iTutor credits' }, LINKS[4]]
    : LINKS;

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <DsPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center">
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
            'relative flex max-h-[85vh] w-full max-w-[430px] flex-col',
            'rounded-t-ds-card bw-hair border-border bg-surface-card'
          )}
        >
          <div className="flex items-center justify-between bw-b-hair border-line-soft px-ds-card py-ds-3">
            <h2 className="font-display text-[20px] font-extrabold text-ink">Account</h2>
            <button
              type="button"
              onClick={onClose}
              className="font-body text-[13px] font-extrabold text-brand-edge underline cursor-pointer"
            >
              Done
            </button>
          </div>

          <nav className="flex flex-col overflow-y-auto py-ds-2">
            {links.map((link) => (
              <button
                key={link.href}
                type="button"
                onClick={() => go(link.href)}
                className={cn(
                  'flex w-full items-center justify-between gap-ds-3 px-ds-card py-ds-3 text-left',
                  'border-0 bg-transparent cursor-pointer',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink'
                )}
              >
                <span className="flex flex-col">
                  <span className="font-display text-[15px] font-extrabold text-ink">{link.label}</span>
                  <span className="font-body text-[13px] text-ink-muted">{link.detail}</span>
                </span>
                <span className="shrink-0 text-ink-muted">
                  <DsIcon name="chevron" size={18} />
                </span>
              </button>
            ))}
          </nav>

          {onLogout ? (
            <div className="bw-t-hair border-line-soft p-ds-card">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className={cn(
                  'w-full rounded-ds-btn bw-hair border-border bg-surface-card py-ds-3',
                  'font-body text-[14px] font-extrabold text-danger cursor-pointer',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink'
                )}
              >
                Log out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </DsPortal>
  );
}

export default ParentAccountSheet;
